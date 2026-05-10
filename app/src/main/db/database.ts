import Database from 'better-sqlite3'
import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, realpathSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, relative } from 'node:path'
import {
  AgentCreateInputSchema,
  AgentDeleteInputSchema,
  AgentDeleteResultSchema,
  AgentSchema,
  AgentUpdateInstructionsInputSchema,
  AgentUpdateSettingsInputSchema,
  ConversationCancelTurnInputSchema,
  ConversationAnswerInputRequestInputSchema,
  ConversationCancelInputRequestInputSchema,
  ConversationCreateDirectInputSchema,
  ConversationCreateManualInputSchema,
  ConversationDetailSchema,
  ConversationInputRequestSchema,
  ConversationGetInputSchema,
  ConversationListItemSchema,
  ConversationSendTurnInputSchema,
  ConversationTurnSchema,
  ConversationUpdateRoutingModeInputSchema,
  DbStatusSchema,
  WorkspaceConfigSchema,
  WorkspaceUpdateSystemDefaultInputSchema,
  WorkboardAnswerInputRequestInputSchema,
  WorkboardDataSchema,
  WorkboardDraftPlanSchema,
  WorkboardStartRequestInputSchema,
  WorkRunActionInputSchema,
  WorkRunCompleteInputSchema,
  WorkRunCreateInputSchema,
  WorkRunDependencySchema,
  WorkRunEventSchema,
  WorkRunFailInputSchema,
  WorkRunInputRequestSchema,
  WorkRunInputSummarySchema,
  WorkRequestSchema,
  WorkRunSchema,
  validateWorkboardDraftPlanDependencies,
  type Agent,
  type AgentCreateInput,
  type AgentDeleteInput,
  type AgentDeleteResult,
  type AgentUpdateInstructionsInput,
  type AgentUpdateSettingsInput,
  type AgentTurnOutcome,
  type ConversationCreateManualInput,
  type ConversationDetail,
  type ConversationInputRequest,
  type ConversationListItem,
  type ConversationSendTurnInput,
  type ConversationTurn,
  type ConversationUpdateRoutingModeInput,
  type DbStatus,
  type InteractionAnswer,
  type InteractionQuestion,
  type OrchestrationAssignment,
  type WorkRun,
  type WorkRunActionInput,
  type WorkboardAnswerInputRequestInput,
  type WorkboardData,
  type WorkboardStartRequestInput,
  type WorkRunCompleteInput,
  type WorkRunCreateInput,
  type WorkRunDependency,
  type WorkRunEvent,
  type WorkRunEventKind,
  type WorkRunFailInput,
  type WorkRunInputRequest,
  type WorkRunInputSummary,
  type WorkRequest,
  type WorkspaceConfig,
  type WorkspaceSaveConfigInput,
  type WorkspaceUpdateSystemDefaultInput
} from '@shared/contracts'
import { getSystemPaths } from '../paths'
import { databaseSchemaVersion, getMigrationsFolder } from './migrations'
import {
  agents,
  appMeta,
  conversationInputRequests,
  conversationParticipants,
  conversations,
  conversationTurns,
  workRequests,
  workRunDependencies,
  workRunEvents,
  workRunInputRequests,
  workRuns,
  workspaceConfig
} from './schema'

const turnContentLimit = 16_000
const turnPreviewLimit = 240
const activeWorkRunStatuses: WorkRun['status'][] = [
  'queued',
  'running',
  'blocked',
  'waiting_for_user'
]
const workRequestSourceType = 'work_request'

export type PreparedConversationAgentTurn = {
  conversationId: string
  participantId: string
  agentTurnId: string
  agent: Agent
  providerSessionRef: string | null
  message: string
}

export type PreparedConversationTurn = {
  conversationId: string
  agentTurns: PreparedConversationAgentTurn[]
}

export type PreparedWorkRun = {
  run: WorkRun
  agent: Agent
  message: string
  providerSessionRef: string | null
}

type InitialWorkRunStatus = Extract<WorkRun['status'], 'queued' | 'blocked'>

export class OrdinusDatabase {
  private readonly databasePath: string
  private readonly existedBeforeOpen: boolean
  private readonly sqlite: Database.Database
  private readonly db: ReturnType<typeof drizzle>

  constructor() {
    this.databasePath = getSystemPaths().database
    mkdirSync(dirname(this.databasePath), { recursive: true })
    this.existedBeforeOpen = existsSync(this.databasePath)
    this.sqlite = new Database(this.databasePath)
    this.db = drizzle(this.sqlite, {
      schema: {
        agents,
        appMeta,
        conversationInputRequests,
        conversationParticipants,
        conversations,
        conversationTurns,
        workRequests,
        workRunDependencies,
        workRunEvents,
        workRuns,
        workspaceConfig
      }
    })
  }

  initialize(): DbStatus {
    this.sqlite.pragma('journal_mode = WAL')
    migrate(this.db, { migrationsFolder: getMigrationsFolder() })

    const now = new Date().toISOString()
    const existing = this.db.select().from(appMeta).where(eq(appMeta.id, 1)).get()

    if (!existing) {
      this.db
        .insert(appMeta)
        .values({
          id: 1,
          schemaVersion: databaseSchemaVersion,
          createdAt: now,
          updatedAt: now
        })
        .run()
    } else if (existing.schemaVersion < databaseSchemaVersion) {
      this.db
        .update(appMeta)
        .set({
          schemaVersion: databaseSchemaVersion,
          updatedAt: now
        })
        .where(eq(appMeta.id, 1))
        .run()
    } else if (existing.schemaVersion > databaseSchemaVersion) {
      throw new Error(
        `Database schema version ${existing.schemaVersion} is newer than this Ordinus build supports.`
      )
    }

    return this.getStatus()
  }

  getStatus(): DbStatus {
    const meta = this.db.select().from(appMeta).where(eq(appMeta.id, 1)).get()

    return DbStatusSchema.parse({
      databasePath: this.databasePath,
      exists: this.existedBeforeOpen || existsSync(this.databasePath),
      initialized: Boolean(meta),
      schemaVersion: meta?.schemaVersion ?? null,
      createdAt: meta?.createdAt ?? null,
      updatedAt: meta?.updatedAt ?? null
    })
  }

  getWorkspaceConfig(): WorkspaceConfig | null {
    const config = this.db.select().from(workspaceConfig).where(eq(workspaceConfig.id, 1)).get()

    if (!config) {
      return null
    }

    return WorkspaceConfigSchema.parse({
      workspaceRoot: config.workspaceRoot,
      workspaceName: config.workspaceName,
      defaultProviderId: config.defaultProviderId,
      defaultModel: config.defaultModel,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt
    })
  }

  saveWorkspaceConfig(input: WorkspaceSaveConfigInput): WorkspaceConfig {
    const workspaceRoot = resolveWorkspaceRoot(input.workspaceRoot)
    const workspaceName = input.workspaceName.trim()
    const now = new Date().toISOString()
    const existing = this.db.select().from(workspaceConfig).where(eq(workspaceConfig.id, 1)).get()

    if (existing) {
      this.db
        .update(workspaceConfig)
        .set({
          workspaceRoot,
          workspaceName,
          updatedAt: now
        })
        .where(eq(workspaceConfig.id, 1))
        .run()
    } else {
      this.db
        .insert(workspaceConfig)
        .values({
          id: 1,
          workspaceRoot,
          workspaceName,
          defaultProviderId: 'codex',
          defaultModel: 'default',
          createdAt: now,
          updatedAt: now
        })
        .run()
    }

    const saved = this.getWorkspaceConfig()
    if (!saved) {
      throw new Error('Workspace configuration could not be saved.')
    }

    return saved
  }

  updateSystemDefault(input: WorkspaceUpdateSystemDefaultInput): WorkspaceConfig {
    const parsed = WorkspaceUpdateSystemDefaultInputSchema.parse(input)
    const now = new Date().toISOString()

    if (!this.getWorkspaceConfig()) {
      throw new Error('Choose a workspace before setting the system default provider.')
    }

    this.db
      .update(workspaceConfig)
      .set({
        defaultProviderId: parsed.providerId,
        defaultModel: parsed.model,
        updatedAt: now
      })
      .where(eq(workspaceConfig.id, 1))
      .run()

    const saved = this.getWorkspaceConfig()
    if (!saved) {
      throw new Error('System default provider could not be saved.')
    }

    return saved
  }

  listAgents(): Agent[] {
    return this.db
      .select()
      .from(agents)
      .orderBy(desc(agents.createdAt))
      .all()
      .map((agent) => AgentSchema.parse(agent))
  }

  listActiveAgents(): Agent[] {
    return this.db
      .select()
      .from(agents)
      .where(eq(agents.enabled, true))
      .orderBy(desc(agents.createdAt))
      .all()
      .map((agent) => AgentSchema.parse(agent))
  }

  hasAgent(id: string): boolean {
    return Boolean(this.db.select({ id: agents.id }).from(agents).where(eq(agents.id, id)).get())
  }

  hasRunningWorkForAgent(agentId: string): boolean {
    const agent = this.getAgent(agentId)

    return (
      this.hasRunningConversationWorkForAgent(agent.id) || this.hasActiveWorkRunsForAgent(agent.id)
    )
  }

  assertAgentHasNoRunningWork(agentId: string, action: 'delete' | 'disable'): void {
    if (this.hasRunningWorkForAgent(agentId)) {
      throw new Error(
        `Stop this agent's running work before ${action === 'delete' ? 'deleting' : 'disabling'} it.`
      )
    }
  }

  createAgent(input: AgentCreateInput): Agent {
    const parsed = AgentCreateInputSchema.parse(input)
    const now = new Date().toISOString()
    const agent = AgentSchema.parse({
      ...parsed,
      id: getUniqueAgentId((id) => this.hasAgent(id)),
      enabled: true,
      createdAt: now,
      updatedAt: now
    })

    this.db.insert(agents).values(agent).run()

    return agent
  }

  updateAgentInstructions(input: AgentUpdateInstructionsInput): Agent {
    const parsed = AgentUpdateInstructionsInputSchema.parse(input)
    const now = new Date().toISOString()

    if (!this.hasAgent(parsed.id)) {
      throw new Error('Agent was not found.')
    }

    this.db
      .update(agents)
      .set({
        instructions: parsed.instructions,
        updatedAt: now
      })
      .where(eq(agents.id, parsed.id))
      .run()

    return this.getAgent(parsed.id)
  }

  deleteAgent(input: AgentDeleteInput): AgentDeleteResult {
    const parsed = AgentDeleteInputSchema.parse(input)
    const agent = this.getAgent(parsed.id)
    this.assertAgentHasNoRunningWork(agent.id, 'delete')

    return this.db.transaction((tx) => {
      const agentParticipants = tx
        .select({
          id: conversationParticipants.id,
          conversationId: conversationParticipants.conversationId
        })
        .from(conversationParticipants)
        .where(eq(conversationParticipants.agentId, agent.id))
        .all()
      const participantIds = agentParticipants.map((participant) => participant.id)
      const candidateConversationIds = uniqueValues(
        agentParticipants.map((participant) => participant.conversationId)
      )

      const deletedTurns =
        participantIds.length > 0
          ? tx
              .select({
                id: conversationTurns.id,
                logRef: conversationTurns.logRef
              })
              .from(conversationTurns)
              .where(inArray(conversationTurns.participantId, participantIds))
              .all()
          : []
      const deletedLogRefs = uniqueValues(
        deletedTurns.map((turn) => turn.logRef).filter((logRef) => logRef.trim())
      )

      if (participantIds.length > 0) {
        tx.delete(conversationInputRequests)
          .where(inArray(conversationInputRequests.participantId, participantIds))
          .run()
        tx.delete(conversationTurns)
          .where(inArray(conversationTurns.participantId, participantIds))
          .run()
        tx.delete(conversationParticipants)
          .where(inArray(conversationParticipants.id, participantIds))
          .run()
      }

      const emptyConversationIds = candidateConversationIds.filter((conversationId) => {
        const participant = tx
          .select({ id: conversationParticipants.id })
          .from(conversationParticipants)
          .where(eq(conversationParticipants.conversationId, conversationId))
          .get()

        return !participant
      })

      if (emptyConversationIds.length > 0) {
        tx.delete(conversations).where(inArray(conversations.id, emptyConversationIds)).run()
      }

      tx.delete(agents).where(eq(agents.id, agent.id)).run()

      return AgentDeleteResultSchema.parse({
        deletedAgentId: agent.id,
        deletedConversationCount: emptyConversationIds.length,
        deletedTurnCount: deletedTurns.length,
        deletedLogRefs
      })
    })
  }

  updateAgentSettings(input: AgentUpdateSettingsInput): Agent {
    const parsed = AgentUpdateSettingsInputSchema.parse(input)
    const now = new Date().toISOString()
    const currentAgent = this.getAgent(parsed.id)

    if (currentAgent.enabled && !parsed.enabled) {
      this.assertAgentHasNoRunningWork(currentAgent.id, 'disable')
    }

    this.db
      .update(agents)
      .set({
        providerId: parsed.providerId,
        model: parsed.model,
        sandbox: parsed.sandbox,
        workspaceRoot: parsed.workspaceRoot,
        enabled: parsed.enabled,
        updatedAt: now
      })
      .where(eq(agents.id, parsed.id))
      .run()

    return this.getAgent(parsed.id)
  }

  createWorkRun(input: WorkRunCreateInput): WorkRun {
    const parsed = WorkRunCreateInputSchema.parse(input)
    const agent = this.requireActiveAgent(parsed.assignedAgentId)
    const parentRun = parsed.parentRunId ? this.getWorkRun(parsed.parentRunId) : null
    const requiredRunIds = uniqueValues(parsed.requiredRunIds)
    const requiredRuns = requiredRunIds.map((runId) => this.getWorkRun(runId))

    if (parsed.createdByAgentId) {
      this.getAgent(parsed.createdByAgentId)
    }
    if (parsed.createdByType === 'agent' && !parsed.createdByAgentId) {
      throw new Error('Agent-created work must include the creating agent.')
    }

    const now = new Date().toISOString()
    const runId = createWorkRunId()
    const satisfiedRequiredRunIds = getSatisfiedRequiredRunIds(requiredRuns)
    const status = getInitialWorkRunStatus(requiredRunIds, satisfiedRequiredRunIds)

    this.db.transaction((tx) => {
      tx.insert(workRuns)
        .values({
          id: runId,
          rootRunId: parentRun?.rootRunId ?? runId,
          parentRunId: parentRun?.id ?? null,
          assignedAgentId: agent.id,
          assignedAgentName: agent.name,
          assignedAgentRole: agent.role,
          createdByType: parsed.createdByType,
          createdByAgentId: parsed.createdByAgentId ?? null,
          sourceType: parsed.source?.type ?? null,
          sourceId: parsed.source?.id ?? null,
          sourceItemId: parsed.source?.itemId ?? null,
          title: parsed.title,
          instruction: parsed.instruction,
          status,
          priority: parsed.priority,
          providerId: agent.providerId,
          model: agent.model,
          providerSessionRef: null,
          workspaceRoot: agent.workspaceRoot,
          sandbox: agent.sandbox,
          expectedOutput: parsed.expectedOutput,
          resultSummary: '',
          resultArtifactRef: '',
          artifactRefs: JSON.stringify([]),
          changedFiles: JSON.stringify([]),
          error: '',
          createdAt: now,
          updatedAt: now,
          startedAt: null,
          completedAt: null
        })
        .run()

      requiredRunIds.forEach((dependsOnRunId) => {
        tx.insert(workRunDependencies)
          .values({
            id: createWorkRunDependencyId(),
            runId,
            dependsOnRunId,
            status: satisfiedRequiredRunIds.has(dependsOnRunId) ? 'satisfied' : 'pending',
            createdAt: now,
            resolvedAt: satisfiedRequiredRunIds.has(dependsOnRunId) ? now : null
          })
          .run()
      })
    })

    this.appendWorkRunEvent(runId, 'created', {
      assignedAgentId: agent.id,
      requiredRunIds
    })
    this.appendWorkRunEvent(runId, status, {})

    return this.getWorkRun(runId)
  }

  createWorkRequest(input: WorkboardStartRequestInput): WorkRequest {
    const parsed = WorkboardStartRequestInputSchema.parse(input)
    const plan = WorkboardDraftPlanSchema.parse(parsed.plan)
    const workspace = this.getWorkspaceConfig()
    if (!workspace) {
      throw new Error('Choose a workspace before creating a Work Request.')
    }

    const agentsById = new Map(
      this.listAgents()
        .filter((agent) => agent.enabled && agent.workspaceRoot === workspace.workspaceRoot)
        .map((agent) => [agent.id, agent])
    )
    plan.items.forEach((item) => {
      if (!agentsById.has(item.assignedAgentId)) {
        throw new Error(
          'One or more Work Items are assigned to an unavailable agent in this workspace.'
        )
      }
    })
    validateWorkboardDraftPlanDependencies(plan.items)

    const now = new Date().toISOString()
    const requestId = createWorkRequestId()
    const artifactRoot = createWorkRequestArtifactRoot(
      plan.title || parsed.originalRequest,
      requestId
    )
    const runIdsByTempId = new Map(plan.items.map((item) => [item.tempId, createWorkRunId()]))
    mkdirSync(join(workspace.workspaceRoot, artifactRoot), { recursive: true })

    this.db.transaction((tx) => {
      tx.insert(workRequests)
        .values({
          id: requestId,
          title: plan.title,
          originalRequest: parsed.originalRequest,
          summary: plan.summary,
          workspaceRoot: workspace.workspaceRoot,
          artifactRoot,
          status: 'active',
          createdAt: now,
          updatedAt: now,
          startedAt: null,
          completedAt: null
        })
        .run()

      plan.items.forEach((item) => {
        const agent = agentsById.get(item.assignedAgentId)
        const runId = runIdsByTempId.get(item.tempId)
        if (!agent || !runId) {
          throw new Error('Work Item could not be prepared.')
        }

        tx.insert(workRuns)
          .values({
            id: runId,
            rootRunId: runId,
            parentRunId: null,
            assignedAgentId: agent.id,
            assignedAgentName: agent.name,
            assignedAgentRole: agent.role,
            createdByType: 'user',
            createdByAgentId: null,
            sourceType: workRequestSourceType,
            sourceId: requestId,
            sourceItemId: item.tempId,
            title: item.title,
            instruction: item.instruction,
            status: item.dependsOnTempIds.length > 0 ? 'blocked' : 'queued',
            priority: item.priority,
            providerId: agent.providerId,
            model: agent.model,
            providerSessionRef: null,
            workspaceRoot: workspace.workspaceRoot,
            sandbox: agent.sandbox,
            expectedOutput: item.expectedOutput,
            resultSummary: '',
            resultArtifactRef: '',
            artifactRefs: JSON.stringify([]),
            changedFiles: JSON.stringify([]),
            error: '',
            createdAt: now,
            updatedAt: now,
            startedAt: null,
            completedAt: null
          })
          .run()
      })

      plan.items.forEach((item) => {
        const runId = runIdsByTempId.get(item.tempId)
        if (!runId) return

        item.dependsOnTempIds.forEach((dependsOnTempId) => {
          const dependsOnRunId = runIdsByTempId.get(dependsOnTempId)
          if (!dependsOnRunId) {
            throw new Error('Work Item dependency could not be prepared.')
          }

          tx.insert(workRunDependencies)
            .values({
              id: createWorkRunDependencyId(),
              runId,
              dependsOnRunId,
              status: 'pending',
              createdAt: now,
              resolvedAt: null
            })
            .run()
        })
      })

      plan.items.forEach((item) => {
        const runId = runIdsByTempId.get(item.tempId)
        if (!runId) return

        tx.insert(workRunEvents)
          .values({
            id: createWorkRunEventId(),
            runId,
            sequence: 1,
            kind: 'created',
            payload: JSON.stringify({
              workRequestId: requestId,
              assignedAgentId: item.assignedAgentId,
              requiredTempIds: item.dependsOnTempIds
            }),
            createdAt: now
          })
          .run()
        tx.insert(workRunEvents)
          .values({
            id: createWorkRunEventId(),
            runId,
            sequence: 2,
            kind: item.dependsOnTempIds.length > 0 ? 'blocked' : 'queued',
            payload: JSON.stringify({}),
            createdAt: now
          })
          .run()
      })
    })

    return this.getWorkRequest(requestId)
  }

  listWorkRequests(): WorkRequest[] {
    return this.db
      .select()
      .from(workRequests)
      .orderBy(desc(workRequests.updatedAt), desc(workRequests.createdAt))
      .all()
      .map((request) => WorkRequestSchema.parse(request))
  }

  getWorkRequest(requestId: string): WorkRequest {
    const request = this.db.select().from(workRequests).where(eq(workRequests.id, requestId)).get()

    if (!request) {
      throw new Error('Work Request was not found.')
    }

    return WorkRequestSchema.parse(request)
  }

  getWorkboardData(): WorkboardData {
    const requests = this.listWorkRequests()
    const requestById = new Map(requests.map((request) => [request.id, request]))
    const runs = this.db
      .select()
      .from(workRuns)
      .where(eq(workRuns.sourceType, workRequestSourceType))
      .orderBy(desc(workRuns.updatedAt), desc(workRuns.createdAt))
      .all()
      .map((run) => {
        const parsedRun = parseWorkRun(run)
        const displayRun = withExistingWorkspaceFileRefs(parsedRun)
        const requestId = parsedRun.source?.id ?? ''
        const request = requestById.get(requestId)

        return {
          ...displayRun,
          agentName: parsedRun.assignedAgentName.trim() || 'Former agent',
          agentRole: parsedRun.assignedAgentRole.trim() || 'Agent',
          requestId,
          requestTitle: request?.title ?? 'Work Request'
        }
      })
    const runIds = runs.map((run) => run.id)
    const dependencies =
      runIds.length > 0
        ? this.db
            .select()
            .from(workRunDependencies)
            .where(inArray(workRunDependencies.runId, runIds))
            .orderBy(asc(workRunDependencies.createdAt))
            .all()
            .map((dependency) => WorkRunDependencySchema.parse(dependency))
        : []
    const inputRequests =
      runIds.length > 0
        ? this.db
            .select()
            .from(workRunInputRequests)
            .where(inArray(workRunInputRequests.runId, runIds))
            .orderBy(asc(workRunInputRequests.createdAt))
            .all()
            .map(parseWorkRunInputRequest)
        : []

    return WorkboardDataSchema.parse({
      requests,
      runs,
      dependencies,
      inputRequests
    })
  }

  getWorkRun(runId: string): WorkRun {
    const parsed = WorkRunActionInputSchema.parse({ runId })
    const run = this.db.select().from(workRuns).where(eq(workRuns.id, parsed.runId)).get()

    if (!run) {
      throw new Error('Work run was not found.')
    }

    return parseWorkRun(run)
  }

  listWorkRuns(): WorkRun[] {
    return this.db
      .select()
      .from(workRuns)
      .orderBy(desc(workRuns.updatedAt), desc(workRuns.createdAt))
      .all()
      .map(parseWorkRun)
  }

  listRunnableWorkRuns(): WorkRun[] {
    return this.db
      .select()
      .from(workRuns)
      .where(eq(workRuns.status, 'queued'))
      .orderBy(desc(workRuns.priority), asc(workRuns.createdAt))
      .all()
      .map(parseWorkRun)
  }

  listRunnableWorkRunsForRequest(requestId: string, limit: number): WorkRun[] {
    this.getWorkRequest(requestId)

    return this.db
      .select()
      .from(workRuns)
      .where(
        and(
          eq(workRuns.sourceType, workRequestSourceType),
          eq(workRuns.sourceId, requestId),
          eq(workRuns.status, 'queued')
        )
      )
      .orderBy(desc(workRuns.priority), asc(workRuns.createdAt))
      .limit(limit)
      .all()
      .map(parseWorkRun)
  }

  countRunningWorkRunsForRequest(requestId: string): number {
    this.getWorkRequest(requestId)

    return this.db
      .select({ id: workRuns.id })
      .from(workRuns)
      .where(
        and(
          eq(workRuns.sourceType, workRequestSourceType),
          eq(workRuns.sourceId, requestId),
          eq(workRuns.status, 'running')
        )
      )
      .all().length
  }

  startWorkRun(input: WorkRunActionInput): WorkRun {
    const parsed = WorkRunActionInputSchema.parse(input)
    const run = this.getWorkRun(parsed.runId)

    if (run.status !== 'queued') {
      throw new Error('Only queued work can be started.')
    }

    const now = new Date().toISOString()
    this.db
      .update(workRuns)
      .set({
        status: 'running',
        startedAt: now,
        updatedAt: now
      })
      .where(eq(workRuns.id, run.id))
      .run()
    this.appendWorkRunEvent(run.id, 'started', {})
    this.refreshWorkRequestStatusForRun(run.id)

    return this.getWorkRun(run.id)
  }

  completeWorkRun(input: WorkRunCompleteInput): WorkRun {
    const parsed = WorkRunCompleteInputSchema.parse(input)
    const run = this.getWorkRun(parsed.runId)

    if (!isCompletableWorkRunStatus(run.status)) {
      throw new Error('Only running work or work waiting for user input can be completed.')
    }

    const now = new Date().toISOString()
    const artifactRefs = uniqueValues(parsed.artifactRefs)
    const changedFiles = uniqueValues(parsed.changedFiles)
    this.db.transaction((tx) => {
      const appendEvent = (
        runId: string,
        kind: WorkRunEventKind,
        payload: Record<string, unknown>
      ): void => {
        const latestEvent = tx
          .select({ sequence: workRunEvents.sequence })
          .from(workRunEvents)
          .where(eq(workRunEvents.runId, runId))
          .orderBy(desc(workRunEvents.sequence))
          .get()

        tx.insert(workRunEvents)
          .values({
            id: createWorkRunEventId(),
            runId,
            sequence: (latestEvent?.sequence ?? 0) + 1,
            kind,
            payload: JSON.stringify(payload),
            createdAt: now
          })
          .run()
      }

      tx.update(workRuns)
        .set({
          status: 'completed',
          resultSummary: parsed.resultSummary,
          resultArtifactRef: parsed.artifactRef ?? run.resultArtifactRef,
          artifactRefs: JSON.stringify(artifactRefs),
          changedFiles: JSON.stringify(changedFiles),
          providerSessionRef: parsed.providerSessionRef ?? run.providerSessionRef,
          error: '',
          completedAt: now,
          updatedAt: now
        })
        .where(eq(workRuns.id, run.id))
        .run()
      appendEvent(run.id, 'completed', {
        resultSummary: parsed.resultSummary,
        artifactRefs,
        changedFiles,
        artifactRef: parsed.artifactRef ?? run.resultArtifactRef
      })

      const pendingDependencies = tx
        .select()
        .from(workRunDependencies)
        .where(
          and(
            eq(workRunDependencies.dependsOnRunId, run.id),
            eq(workRunDependencies.status, 'pending')
          )
        )
        .all()

      pendingDependencies.forEach((dependency) => {
        tx.update(workRunDependencies)
          .set({
            status: 'satisfied',
            resolvedAt: now
          })
          .where(eq(workRunDependencies.id, dependency.id))
          .run()
        appendEvent(dependency.runId, 'dependency_satisfied', {
          dependsOnRunId: run.id
        })
      })

      uniqueValues(pendingDependencies.map((dependency) => dependency.runId)).forEach((runId) => {
        const dependentRun = tx
          .select({ status: workRuns.status })
          .from(workRuns)
          .where(eq(workRuns.id, runId))
          .get()
        if (dependentRun?.status !== 'blocked') {
          return
        }

        const remainingDependency = tx
          .select({ id: workRunDependencies.id })
          .from(workRunDependencies)
          .where(
            and(eq(workRunDependencies.runId, runId), eq(workRunDependencies.status, 'pending'))
          )
          .get()

        if (remainingDependency) {
          return
        }

        tx.update(workRuns)
          .set({
            status: 'queued',
            updatedAt: now
          })
          .where(eq(workRuns.id, runId))
          .run()
        appendEvent(runId, 'queued', {
          reason: 'required_outputs_ready'
        })
      })
    })
    this.refreshWorkRequestStatusForRun(run.id)

    return this.getWorkRun(run.id)
  }

  waitForWorkRunInput(input: {
    runId: string
    providerSessionRef: string
    outcome: Extract<AgentTurnOutcome, { outcome: 'needs_input' }>
  }): WorkRun {
    const run = this.getWorkRun(input.runId)
    if (run.status === 'cancelled') {
      return run
    }
    if (run.status !== 'running') {
      throw new Error('Only running work can request user input.')
    }

    const now = new Date().toISOString()
    const requestId = createWorkRunInputRequestId()

    this.db.transaction((tx) => {
      tx.update(workRuns)
        .set({
          status: 'waiting_for_user',
          providerSessionRef: input.providerSessionRef,
          resultSummary: input.outcome.detail || input.outcome.title,
          updatedAt: now
        })
        .where(eq(workRuns.id, run.id))
        .run()
      tx.insert(workRunInputRequests)
        .values({
          id: requestId,
          runId: run.id,
          status: 'pending',
          title: input.outcome.title,
          detail: input.outcome.detail ?? '',
          questions: JSON.stringify(input.outcome.questions),
          answers: null,
          createdAt: now,
          updatedAt: now
        })
        .run()
      tx.insert(workRunEvents)
        .values({
          id: createWorkRunEventId(),
          runId: run.id,
          sequence: this.getNextWorkRunEventSequence(run.id),
          kind: 'started',
          payload: JSON.stringify({ waitingForUser: true }),
          createdAt: now
        })
        .run()
    })
    this.refreshWorkRequestStatusForRun(run.id)

    return this.getWorkRun(run.id)
  }

  answerWorkRunInputRequest(input: WorkboardAnswerInputRequestInput): PreparedWorkRun {
    const parsed = WorkboardAnswerInputRequestInputSchema.parse(input)
    const request = this.getWorkRunInputRequest(parsed.requestId)
    if (request.status !== 'pending') {
      throw new Error('This work input request is no longer waiting for an answer.')
    }

    const run = this.getWorkRun(request.runId)
    if (run.status !== 'waiting_for_user') {
      throw new Error('This Work Item is not waiting for user input.')
    }

    const answers = validateInputRequestAnswers(request.questions, parsed.answers)
    const agent = this.requireActiveAgent(run.assignedAgentId)
    const now = new Date().toISOString()
    const message = buildWorkInputRequestContinuationMessage(request, answers)

    this.db.transaction((tx) => {
      tx.update(workRunInputRequests)
        .set({
          status: 'resolved',
          answers: JSON.stringify(answers),
          updatedAt: now
        })
        .where(eq(workRunInputRequests.id, request.id))
        .run()
      tx.update(workRuns)
        .set({
          status: 'running',
          updatedAt: now
        })
        .where(eq(workRuns.id, run.id))
        .run()
      tx.insert(workRunEvents)
        .values({
          id: createWorkRunEventId(),
          runId: run.id,
          sequence: this.getNextWorkRunEventSequence(run.id),
          kind: 'started',
          payload: JSON.stringify({ resumedFromInputRequestId: request.id }),
          createdAt: now
        })
        .run()
    })
    this.refreshWorkRequestStatusForRun(run.id)

    return {
      run: this.getWorkRun(run.id),
      agent,
      message,
      providerSessionRef: run.providerSessionRef
    }
  }

  failWorkRun(input: WorkRunFailInput): WorkRun {
    const parsed = WorkRunFailInputSchema.parse(input)
    const run = this.getWorkRun(parsed.runId)

    if (isTerminalWorkRunStatus(run.status)) {
      throw new Error('Completed, failed, or cancelled work cannot be failed again.')
    }

    const now = new Date().toISOString()
    this.db
      .update(workRuns)
      .set({
        status: 'failed',
        error: parsed.error,
        completedAt: now,
        updatedAt: now
      })
      .where(eq(workRuns.id, run.id))
      .run()
    this.appendWorkRunEvent(run.id, 'failed', { error: parsed.error })
    this.propagateBlockedDependentsToTerminalStatus(run.id, 'failed', 'upstream_failed')
    this.refreshWorkRequestStatusForRun(run.id)

    return this.getWorkRun(run.id)
  }

  cancelWorkRun(input: WorkRunActionInput): WorkRun {
    const parsed = WorkRunActionInputSchema.parse(input)
    const run = this.getWorkRun(parsed.runId)

    if (isTerminalWorkRunStatus(run.status)) {
      throw new Error('Completed, failed, or cancelled work cannot be cancelled again.')
    }

    const now = new Date().toISOString()
    this.db.transaction((tx) => {
      tx.update(workRuns)
        .set({
          status: 'cancelled',
          completedAt: now,
          updatedAt: now
        })
        .where(eq(workRuns.id, run.id))
        .run()

      tx.update(workRunInputRequests)
        .set({
          status: 'cancelled',
          updatedAt: now
        })
        .where(
          and(eq(workRunInputRequests.runId, run.id), eq(workRunInputRequests.status, 'pending'))
        )
        .run()
    })
    this.appendWorkRunEvent(run.id, 'cancelled', {})
    this.propagateBlockedDependentsToTerminalStatus(run.id, 'cancelled', 'upstream_cancelled')
    this.refreshWorkRequestStatusForRun(run.id)

    return this.getWorkRun(run.id)
  }

  getRequiredInputSummaries(runId: string): WorkRunInputSummary[] {
    const parsed = WorkRunActionInputSchema.parse({ runId })
    this.getWorkRun(parsed.runId)

    return this.db
      .select()
      .from(workRunDependencies)
      .where(eq(workRunDependencies.runId, parsed.runId))
      .orderBy(asc(workRunDependencies.createdAt))
      .all()
      .map((dependency) => {
        const parsedRun = this.getWorkRun(dependency.dependsOnRunId)
        if (!hasCompletedWorkRunOutput(parsedRun)) {
          throw new Error('Required work output is not ready yet.')
        }

        return WorkRunInputSummarySchema.parse({
          runId: parsedRun.id,
          title: parsedRun.title,
          agentName: parsedRun.assignedAgentName.trim() || 'Former agent',
          agentRole: parsedRun.assignedAgentRole.trim() || 'Agent',
          resultSummary: parsedRun.resultSummary,
          artifactRefs: parsedRun.artifactRefs,
          changedFiles: parsedRun.changedFiles
        })
      })
  }

  listWorkRunEvents(runId: string): WorkRunEvent[] {
    const parsed = WorkRunActionInputSchema.parse({ runId })
    this.getWorkRun(parsed.runId)

    return this.db
      .select()
      .from(workRunEvents)
      .where(eq(workRunEvents.runId, parsed.runId))
      .orderBy(asc(workRunEvents.sequence))
      .all()
      .map(parseWorkRunEvent)
  }

  listWorkRunDependencies(runId: string): WorkRunDependency[] {
    const parsed = WorkRunActionInputSchema.parse({ runId })
    this.getWorkRun(parsed.runId)

    return this.db
      .select()
      .from(workRunDependencies)
      .where(eq(workRunDependencies.runId, parsed.runId))
      .orderBy(asc(workRunDependencies.createdAt))
      .all()
      .map((dependency) => WorkRunDependencySchema.parse(dependency))
  }

  listConversations(): ConversationListItem[] {
    return this.db
      .select()
      .from(conversations)
      .orderBy(desc(conversations.updatedAt))
      .all()
      .map((conversation) => {
        const participants = this.db
          .select()
          .from(conversationParticipants)
          .where(eq(conversationParticipants.conversationId, conversation.id))
          .all()
        const participantAgents = participants.map((participant) =>
          this.getAgent(participant.agentId)
        )
        const agentName = formatConversationAgentNames(participantAgents.map((agent) => agent.name))
        const latestTurn = this.db
          .select()
          .from(conversationTurns)
          .where(eq(conversationTurns.conversationId, conversation.id))
          .orderBy(desc(conversationTurns.sequence), desc(conversationTurns.createdAt))
          .get()

        return ConversationListItemSchema.parse({
          ...conversation,
          agentName,
          participantCount: participants.length,
          lastPreview: latestTurn?.preview ?? conversation.summary
        })
      })
  }

  getConversation(input: { conversationId: string }): ConversationDetail {
    const parsed = ConversationGetInputSchema.parse(input)
    const conversation = this.db
      .select()
      .from(conversations)
      .where(eq(conversations.id, parsed.conversationId))
      .get()

    if (!conversation) {
      throw new Error('Conversation was not found.')
    }

    const participants = this.db
      .select()
      .from(conversationParticipants)
      .where(eq(conversationParticipants.conversationId, conversation.id))
      .orderBy(asc(conversationParticipants.createdAt))
      .all()
      .map((participant) => {
        const agent = this.getAgent(participant.agentId)
        return {
          ...participant,
          agentName: agent.name,
          agentRole: agent.role
        }
      })

    const turns = this.db
      .select()
      .from(conversationTurns)
      .where(eq(conversationTurns.conversationId, conversation.id))
      .orderBy(asc(conversationTurns.sequence), asc(conversationTurns.createdAt))
      .all()
      .map((turn) => ConversationTurnSchema.parse(turn))
    const inputRequests = this.listConversationInputRequests(conversation.id)

    return ConversationDetailSchema.parse({
      ...conversation,
      participants,
      turns,
      inputRequests
    })
  }

  createDirectConversation(input: { agentId: string; title?: string }): ConversationDetail {
    const parsed = ConversationCreateDirectInputSchema.parse(input)
    const agent = this.requireActiveAgent(parsed.agentId)

    const now = new Date().toISOString()
    const conversationId = createConversationId()
    const participantId = createConversationParticipantId()

    this.db
      .insert(conversations)
      .values({
        id: conversationId,
        title: parsed.title?.trim() || agent.name,
        mode: 'direct',
        status: 'active',
        summary: '',
        createdAt: now,
        updatedAt: now
      })
      .run()
    this.db
      .insert(conversationParticipants)
      .values({
        id: participantId,
        conversationId,
        agentId: agent.id,
        providerId: agent.providerId,
        model: agent.model,
        providerSessionRef: null,
        status: 'ready',
        createdAt: now,
        updatedAt: now
      })
      .run()

    return this.getConversation({ conversationId })
  }

  createManualConversation(input: ConversationCreateManualInput): ConversationDetail {
    const parsed = ConversationCreateManualInputSchema.parse(input)
    const agentIds = uniqueValues(parsed.agentIds)

    if (agentIds.length < 2) {
      throw new Error('Choose at least two agents for a multi-agent conversation.')
    }

    const selectedAgents = agentIds.map((agentId) => this.requireActiveAgent(agentId))
    const now = new Date().toISOString()
    const conversationId = createConversationId()
    const title =
      parsed.title?.trim() ||
      formatConversationAgentNames(selectedAgents.map((agent) => agent.name))

    this.db.transaction((tx) => {
      tx.insert(conversations)
        .values({
          id: conversationId,
          title,
          mode: 'manual',
          status: 'active',
          summary: '',
          createdAt: now,
          updatedAt: now
        })
        .run()

      for (const agent of selectedAgents) {
        tx.insert(conversationParticipants)
          .values({
            id: createConversationParticipantId(),
            conversationId,
            agentId: agent.id,
            providerId: agent.providerId,
            model: agent.model,
            providerSessionRef: null,
            status: 'ready',
            createdAt: now,
            updatedAt: now
          })
          .run()
      }
    })

    return this.getConversation({ conversationId })
  }

  updateConversationRoutingMode(input: ConversationUpdateRoutingModeInput): ConversationDetail {
    const parsed = ConversationUpdateRoutingModeInputSchema.parse(input)
    const now = new Date().toISOString()

    this.db
      .update(conversations)
      .set({
        routingMode: parsed.routingMode,
        updatedAt: now
      })
      .where(eq(conversations.id, parsed.conversationId))
      .run()

    return this.getConversation({ conversationId: parsed.conversationId })
  }

  prepareConversationTurn(input: ConversationSendTurnInput): PreparedConversationTurn {
    const parsed = ConversationSendTurnInputSchema.parse(input)
    const detail = this.getConversation({ conversationId: parsed.conversationId })

    if (detail.turns.some((turn) => turn.status === 'running')) {
      throw new Error('Wait for the current turn to finish before sending another message.')
    }
    if (detail.inputRequests.some((request) => request.status === 'pending')) {
      throw new Error('Answer or cancel the pending input request before sending another message.')
    }

    const targetParticipants = this.resolveConversationTurnTargets(
      detail,
      parsed.targetParticipantIds
    )

    if (targetParticipants.length === 0) {
      throw new Error('Choose at least one agent before sending.')
    }

    return this.prepareConversationAssignments(
      detail,
      parsed.message,
      targetParticipants.map((participant) => ({
        participantId: participant.id,
        instruction: parsed.message
      }))
    )
  }

  prepareOrchestratedConversationTurn(
    input: ConversationSendTurnInput,
    assignments: OrchestrationAssignment[]
  ): PreparedConversationTurn {
    const parsed = ConversationSendTurnInputSchema.parse(input)
    const detail = this.getConversation({ conversationId: parsed.conversationId })

    if (detail.turns.some((turn) => turn.status === 'running')) {
      throw new Error('Wait for the current turn to finish before sending another message.')
    }
    if (detail.inputRequests.some((request) => request.status === 'pending')) {
      throw new Error('Answer or cancel the pending input request before sending another message.')
    }

    const uniqueAssignments = mergeAssignmentsByParticipant(assignments)

    if (uniqueAssignments.length === 0) {
      throw new Error('Orchestrator did not choose an agent for this message.')
    }

    const targetParticipants = this.resolveConversationTurnTargets(
      detail,
      uniqueAssignments.map((assignment) => assignment.participantId)
    )

    if (targetParticipants.length === 0) {
      throw new Error('Orchestrator did not choose an agent for this message.')
    }

    return this.prepareConversationAssignments(detail, parsed.message, uniqueAssignments)
  }

  private prepareConversationAssignments(
    detail: ConversationDetail,
    userMessage: string,
    assignments: OrchestrationAssignment[]
  ): PreparedConversationTurn {
    const participantsById = new Map(
      detail.participants.map((participant) => [participant.id, participant])
    )
    const targetParticipants = assignments.map((assignment) => {
      const participant = participantsById.get(assignment.participantId)
      if (!participant) {
        throw new Error('One or more target agents are not part of this conversation.')
      }

      return participant
    })

    const targetAgents = targetParticipants.map((participant) =>
      this.requireActiveAgent(participant.agentId)
    )

    const now = new Date().toISOString()
    const userTurn = createBoundedTurnContent(userMessage)
    const userTurnId = createConversationTurnId()
    const nextSequence = this.getNextConversationTurnSequence(detail.id)

    const agentTurns = targetParticipants.map((participant, index) => ({
      conversationId: detail.id,
      participantId: participant.id,
      agentTurnId: createConversationTurnId(),
      agent: targetAgents[index],
      providerSessionRef: participant.providerSessionRef,
      message: buildAssignedConversationMessage(userMessage, assignments[index].instruction)
    }))

    this.db.transaction((tx) => {
      tx.insert(conversationTurns)
        .values({
          id: userTurnId,
          conversationId: detail.id,
          participantId: targetParticipants[0].id,
          sequence: nextSequence,
          speaker: 'user',
          content: userTurn.content,
          preview: userTurn.preview,
          status: 'completed',
          error: '',
          logRef: '',
          truncated: userTurn.truncated,
          createdAt: now,
          updatedAt: now
        })
        .run()

      agentTurns.forEach((agentTurn, index) => {
        tx.insert(conversationTurns)
          .values({
            id: agentTurn.agentTurnId,
            conversationId: detail.id,
            participantId: agentTurn.participantId,
            sequence: nextSequence + index + 1,
            speaker: 'agent',
            content: '',
            preview: 'Running',
            status: 'running',
            error: '',
            logRef: '',
            truncated: false,
            createdAt: now,
            updatedAt: now
          })
          .run()
      })

      tx.update(conversations)
        .set({
          status: 'running',
          updatedAt: now
        })
        .where(eq(conversations.id, detail.id))
        .run()

      tx.update(conversationParticipants)
        .set({
          status: 'running',
          updatedAt: now
        })
        .where(
          inArray(
            conversationParticipants.id,
            targetParticipants.map((participant) => participant.id)
          )
        )
        .run()
    })

    return {
      conversationId: detail.id,
      agentTurns
    }
  }

  completeConversationTurn(input: {
    turnId: string
    providerSessionRef: string
    outcome: AgentTurnOutcome
    logRef: string
  }): ConversationDetail {
    const turn = this.getConversationTurn(input.turnId)
    if (turn.status === 'cancelled') {
      return this.getConversation({ conversationId: turn.conversationId })
    }

    const now = new Date().toISOString()

    if (input.outcome.outcome === 'needs_input') {
      const outcome = input.outcome
      const requestId = createConversationInputRequestId()
      const preview = createBoundedTurnContent(outcome.title).preview

      this.db.transaction((tx) => {
        tx.update(conversationTurns)
          .set({
            content: outcome.detail || outcome.title,
            preview,
            status: 'waiting_for_user',
            error: '',
            logRef: input.logRef,
            truncated: false,
            updatedAt: now
          })
          .where(eq(conversationTurns.id, input.turnId))
          .run()
        tx.insert(conversationInputRequests)
          .values({
            id: requestId,
            conversationId: turn.conversationId,
            turnId: turn.id,
            participantId: turn.participantId,
            status: 'pending',
            title: outcome.title,
            detail: outcome.detail ?? '',
            questions: JSON.stringify(outcome.questions),
            answers: null,
            createdAt: now,
            updatedAt: now
          })
          .run()
        tx.update(conversationParticipants)
          .set({
            providerSessionRef: input.providerSessionRef,
            status: 'waiting_for_user',
            updatedAt: now
          })
          .where(eq(conversationParticipants.id, turn.participantId))
          .run()
        tx.update(conversations)
          .set({
            status: 'waiting_for_user',
            summary: preview,
            updatedAt: now
          })
          .where(eq(conversations.id, turn.conversationId))
          .run()
      })

      return this.getConversation({ conversationId: turn.conversationId })
    }

    const output = createBoundedTurnContent(input.outcome.content)

    this.db
      .update(conversationTurns)
      .set({
        content: output.content,
        preview: output.preview,
        status: 'completed',
        error: '',
        logRef: input.logRef,
        truncated: output.truncated,
        updatedAt: now
      })
      .where(eq(conversationTurns.id, input.turnId))
      .run()
    this.db
      .update(conversationParticipants)
      .set({
        providerSessionRef: input.providerSessionRef,
        status: 'ready',
        updatedAt: now
      })
      .where(eq(conversationParticipants.id, turn.participantId))
      .run()
    this.db
      .update(conversations)
      .set({
        status: this.getConversationStatusAfterTurnUpdate(turn.conversationId, turn.sequence),
        summary: output.preview,
        updatedAt: now
      })
      .where(eq(conversations.id, turn.conversationId))
      .run()

    return this.getConversation({ conversationId: turn.conversationId })
  }

  answerConversationInputRequest(input: {
    requestId: string
    answers: InteractionAnswer[]
  }): PreparedConversationTurn {
    const parsed = ConversationAnswerInputRequestInputSchema.parse(input)
    const request = this.getConversationInputRequest(parsed.requestId)
    if (request.status !== 'pending') {
      throw new Error('This input request is no longer waiting for an answer.')
    }

    const detail = this.getConversation({ conversationId: request.conversationId })
    if (hasRunningTurnForParticipant(detail.turns, request.participantId)) {
      throw new Error('Wait for this agent to finish before answering its next input request.')
    }

    const participant = detail.participants.find((item) => item.id === request.participantId)
    if (!participant) {
      throw new Error('The input request participant is no longer part of this conversation.')
    }

    const answers = validateInputRequestAnswers(request.questions, parsed.answers)
    const agent = this.requireActiveAgent(participant.agentId)
    const now = new Date().toISOString()
    const userMessage = buildInputRequestAnswerSummary(request.questions, answers)
    const userTurn = createBoundedTurnContent(userMessage)
    const userTurnId = createConversationTurnId()
    const agentTurnId = createConversationTurnId()
    const nextSequence = this.getNextConversationTurnSequence(request.conversationId)
    const agentMessage = buildInputRequestContinuationMessage(request, answers)

    this.db.transaction((tx) => {
      tx.update(conversationInputRequests)
        .set({
          status: 'resolved',
          answers: JSON.stringify(answers),
          updatedAt: now
        })
        .where(eq(conversationInputRequests.id, request.id))
        .run()
      tx.update(conversationTurns)
        .set({
          status: 'completed',
          updatedAt: now
        })
        .where(eq(conversationTurns.id, request.turnId))
        .run()
      tx.insert(conversationTurns)
        .values({
          id: userTurnId,
          conversationId: request.conversationId,
          participantId: request.participantId,
          sequence: nextSequence,
          speaker: 'user',
          content: userTurn.content,
          preview: userTurn.preview,
          status: 'completed',
          error: '',
          logRef: '',
          truncated: userTurn.truncated,
          createdAt: now,
          updatedAt: now
        })
        .run()
      tx.insert(conversationTurns)
        .values({
          id: agentTurnId,
          conversationId: request.conversationId,
          participantId: request.participantId,
          sequence: nextSequence + 1,
          speaker: 'agent',
          content: '',
          preview: 'Running',
          status: 'running',
          error: '',
          logRef: '',
          truncated: false,
          createdAt: now,
          updatedAt: now
        })
        .run()
      tx.update(conversationParticipants)
        .set({
          status: 'running',
          updatedAt: now
        })
        .where(eq(conversationParticipants.id, request.participantId))
        .run()
      tx.update(conversations)
        .set({
          status: 'running',
          summary: userTurn.preview,
          updatedAt: now
        })
        .where(eq(conversations.id, request.conversationId))
        .run()
    })

    return {
      conversationId: request.conversationId,
      agentTurns: [
        {
          conversationId: request.conversationId,
          participantId: request.participantId,
          agentTurnId,
          agent,
          providerSessionRef: participant.providerSessionRef,
          message: agentMessage
        }
      ]
    }
  }

  cancelConversationInputRequest(input: { requestId: string }): ConversationDetail {
    const parsed = ConversationCancelInputRequestInputSchema.parse(input)
    const request = this.getConversationInputRequest(parsed.requestId)
    if (request.status === 'cancelled') {
      return this.getConversation({ conversationId: request.conversationId })
    }
    if (request.status !== 'pending') {
      throw new Error('Only a pending input request can be cancelled.')
    }

    const now = new Date().toISOString()
    const turn = this.getConversationTurn(request.turnId)

    this.db.transaction((tx) => {
      tx.update(conversationInputRequests)
        .set({
          status: 'cancelled',
          updatedAt: now
        })
        .where(eq(conversationInputRequests.id, request.id))
        .run()
      tx.update(conversationTurns)
        .set({
          preview: 'Input request cancelled',
          status: 'cancelled',
          error: '',
          updatedAt: now
        })
        .where(eq(conversationTurns.id, request.turnId))
        .run()
      tx.update(conversationParticipants)
        .set({
          status: 'cancelled',
          updatedAt: now
        })
        .where(eq(conversationParticipants.id, request.participantId))
        .run()
      tx.update(conversations)
        .set({
          status: this.getConversationStatusAfterTurnUpdate(request.conversationId, turn.sequence),
          updatedAt: now
        })
        .where(eq(conversations.id, request.conversationId))
        .run()
    })

    return this.getConversation({ conversationId: request.conversationId })
  }

  failConversationTurn(input: {
    turnId: string
    error: string
    logRef: string
  }): ConversationDetail {
    const turn = this.getConversationTurn(input.turnId)
    if (turn.status === 'cancelled') {
      return this.getConversation({ conversationId: turn.conversationId })
    }

    const now = new Date().toISOString()
    const message = input.error.trim() || 'Conversation turn failed.'

    this.db
      .update(conversationTurns)
      .set({
        preview: message,
        status: 'failed',
        error: message,
        logRef: input.logRef,
        updatedAt: now
      })
      .where(eq(conversationTurns.id, input.turnId))
      .run()
    this.db
      .update(conversationParticipants)
      .set({
        status: 'failed',
        updatedAt: now
      })
      .where(eq(conversationParticipants.id, turn.participantId))
      .run()
    this.db
      .update(conversations)
      .set({
        status: this.getConversationStatusAfterTurnUpdate(turn.conversationId, turn.sequence),
        updatedAt: now
      })
      .where(eq(conversations.id, turn.conversationId))
      .run()

    return this.getConversation({ conversationId: turn.conversationId })
  }

  cancelConversationTurn(input: { turnId: string }): ConversationDetail {
    const parsed = ConversationCancelTurnInputSchema.parse(input)
    const turn = this.getConversationTurn(parsed.turnId)

    if (turn.status === 'cancelled') {
      return this.getConversation({ conversationId: turn.conversationId })
    }

    if (turn.status !== 'running') {
      throw new Error('Only a running conversation turn can be cancelled.')
    }

    const now = new Date().toISOString()

    this.db
      .update(conversationTurns)
      .set({
        preview: 'Cancelled',
        status: 'cancelled',
        error: '',
        updatedAt: now
      })
      .where(eq(conversationTurns.id, parsed.turnId))
      .run()
    this.db
      .update(conversationParticipants)
      .set({
        status: 'cancelled',
        updatedAt: now
      })
      .where(eq(conversationParticipants.id, turn.participantId))
      .run()
    this.db
      .update(conversations)
      .set({
        status: this.getConversationStatusAfterTurnUpdate(turn.conversationId, turn.sequence),
        updatedAt: now
      })
      .where(eq(conversations.id, turn.conversationId))
      .run()

    return this.getConversation({ conversationId: turn.conversationId })
  }

  getAgent(id: string): Agent {
    const agent = this.db.select().from(agents).where(eq(agents.id, id)).get()

    if (!agent) {
      throw new Error('Agent was not found.')
    }

    return AgentSchema.parse(agent)
  }

  requireActiveAgent(id: string): Agent {
    const agent = this.getAgent(id)

    if (!agent.enabled) {
      throw new Error('Enable this agent before assigning work.')
    }

    return agent
  }

  private getConversationTurn(id: string): ConversationTurn {
    const turn = this.db.select().from(conversationTurns).where(eq(conversationTurns.id, id)).get()

    if (!turn) {
      throw new Error('Conversation turn was not found.')
    }

    return ConversationTurnSchema.parse(turn)
  }

  private getConversationInputRequest(id: string): ConversationInputRequest {
    const request = this.db
      .select()
      .from(conversationInputRequests)
      .where(eq(conversationInputRequests.id, id))
      .get()

    if (!request) {
      throw new Error('Input request was not found.')
    }

    return parseConversationInputRequest(request)
  }

  private listConversationInputRequests(conversationId: string): ConversationInputRequest[] {
    return this.db
      .select()
      .from(conversationInputRequests)
      .where(eq(conversationInputRequests.conversationId, conversationId))
      .orderBy(asc(conversationInputRequests.createdAt))
      .all()
      .map(parseConversationInputRequest)
  }

  private getWorkRunInputRequest(id: string): WorkRunInputRequest {
    const request = this.db
      .select()
      .from(workRunInputRequests)
      .where(eq(workRunInputRequests.id, id))
      .get()

    if (!request) {
      throw new Error('Work input request was not found.')
    }

    return parseWorkRunInputRequest(request)
  }

  private getNextConversationTurnSequence(conversationId: string): number {
    const latestTurn = this.db
      .select({ sequence: conversationTurns.sequence })
      .from(conversationTurns)
      .where(eq(conversationTurns.conversationId, conversationId))
      .orderBy(desc(conversationTurns.sequence))
      .get()

    return (latestTurn?.sequence ?? 0) + 1
  }

  private hasRunningConversationWorkForAgent(agentId: string): boolean {
    const participantIds = this.db
      .select({ id: conversationParticipants.id })
      .from(conversationParticipants)
      .where(eq(conversationParticipants.agentId, agentId))
      .all()
      .map((participant) => participant.id)

    if (participantIds.length === 0) {
      return false
    }

    return Boolean(
      this.db
        .select({ id: conversationTurns.id })
        .from(conversationTurns)
        .where(
          and(
            inArray(conversationTurns.participantId, participantIds),
            inArray(conversationTurns.status, ['running', 'waiting_for_user'])
          )
        )
        .get()
    )
  }

  private hasActiveWorkRunsForAgent(agentId: string): boolean {
    return Boolean(
      this.db
        .select({ id: workRuns.id })
        .from(workRuns)
        .where(
          and(
            eq(workRuns.assignedAgentId, agentId),
            inArray(workRuns.status, activeWorkRunStatuses)
          )
        )
        .get()
    )
  }

  private appendWorkRunEvent(
    runId: string,
    kind: WorkRunEventKind,
    payload: Record<string, unknown>
  ): void {
    const latestEvent = this.db
      .select({ sequence: workRunEvents.sequence })
      .from(workRunEvents)
      .where(eq(workRunEvents.runId, runId))
      .orderBy(desc(workRunEvents.sequence))
      .get()

    this.db
      .insert(workRunEvents)
      .values({
        id: createWorkRunEventId(),
        runId,
        sequence: (latestEvent?.sequence ?? 0) + 1,
        kind,
        payload: JSON.stringify(payload),
        createdAt: new Date().toISOString()
      })
      .run()
  }

  private getNextWorkRunEventSequence(runId: string): number {
    return getNextWorkRunEventSequence(this.db, runId)
  }

  private refreshWorkRequestStatusForRun(runId: string): void {
    const run = this.getWorkRun(runId)
    const requestId = run.source?.type === workRequestSourceType ? run.source.id : ''
    if (!requestId) {
      return
    }

    const requestRuns = this.db
      .select()
      .from(workRuns)
      .where(and(eq(workRuns.sourceType, workRequestSourceType), eq(workRuns.sourceId, requestId)))
      .all()
      .map(parseWorkRun)
    if (requestRuns.length === 0) {
      return
    }

    const now = new Date().toISOString()
    const status = getWorkRequestStatus(requestRuns)
    this.db
      .update(workRequests)
      .set({
        status,
        updatedAt: now,
        startedAt: requestRuns.some((item) => item.startedAt)
          ? (this.getWorkRequest(requestId).startedAt ?? now)
          : null,
        completedAt: isTerminalWorkRequestStatus(status) ? now : null
      })
      .where(eq(workRequests.id, requestId))
      .run()
  }

  private propagateBlockedDependentsToTerminalStatus(
    upstreamRunId: string,
    status: Extract<WorkRun['status'], 'failed' | 'cancelled'>,
    reason: 'upstream_failed' | 'upstream_cancelled'
  ): void {
    const now = new Date().toISOString()
    const queue = [upstreamRunId]
    const visited = new Set<string>()

    this.db.transaction((tx) => {
      while (queue.length > 0) {
        const dependsOnRunId = queue.shift()
        if (!dependsOnRunId || visited.has(dependsOnRunId)) {
          continue
        }
        visited.add(dependsOnRunId)

        const dependents = tx
          .select()
          .from(workRunDependencies)
          .where(eq(workRunDependencies.dependsOnRunId, dependsOnRunId))
          .all()

        dependents.forEach((dependency) => {
          const dependentRun = tx
            .select({ id: workRuns.id, status: workRuns.status })
            .from(workRuns)
            .where(eq(workRuns.id, dependency.runId))
            .get()

          if (dependentRun?.status !== 'blocked') {
            return
          }

          tx.update(workRuns)
            .set({
              status,
              error:
                status === 'failed'
                  ? 'Required upstream Work Item failed.'
                  : 'Required upstream Work Item was cancelled.',
              completedAt: now,
              updatedAt: now
            })
            .where(eq(workRuns.id, dependentRun.id))
            .run()
          tx.insert(workRunEvents)
            .values({
              id: createWorkRunEventId(),
              runId: dependentRun.id,
              sequence: getNextWorkRunEventSequence(tx, dependentRun.id),
              kind: status,
              payload: JSON.stringify({
                reason,
                dependsOnRunId
              }),
              createdAt: now
            })
            .run()
          queue.push(dependentRun.id)
        })
      }
    })
  }

  private resolveConversationTurnTargets(
    detail: ConversationDetail,
    targetParticipantIds: string[] | undefined
  ): ConversationDetail['participants'] {
    if (detail.mode === 'direct') {
      return detail.participants[0] ? [detail.participants[0]] : []
    }

    const uniqueTargetIds = uniqueValues(targetParticipantIds ?? [])
    const targets = uniqueTargetIds
      .map((targetParticipantId) =>
        detail.participants.find((participant) => participant.id === targetParticipantId)
      )
      .filter((participant): participant is ConversationDetail['participants'][number] =>
        Boolean(participant)
      )

    if (targets.length !== uniqueTargetIds.length) {
      throw new Error('One or more target agents are not part of this conversation.')
    }

    return targets
  }

  private getConversationStatusAfterTurnUpdate(
    conversationId: string,
    turnSequence: number
  ): 'active' | 'running' | 'waiting_for_user' | 'failed' | 'cancelled' {
    const pendingInputRequest = this.db
      .select({ id: conversationInputRequests.id })
      .from(conversationInputRequests)
      .where(
        and(
          eq(conversationInputRequests.conversationId, conversationId),
          eq(conversationInputRequests.status, 'pending')
        )
      )
      .get()
    const userTurn = this.db
      .select({ sequence: conversationTurns.sequence })
      .from(conversationTurns)
      .where(
        and(
          eq(conversationTurns.conversationId, conversationId),
          eq(conversationTurns.speaker, 'user')
        )
      )
      .orderBy(desc(conversationTurns.sequence))
      .all()
      .find((turn) => turn.sequence < turnSequence)

    const agentTurns = this.db
      .select({ sequence: conversationTurns.sequence, status: conversationTurns.status })
      .from(conversationTurns)
      .where(
        and(
          eq(conversationTurns.conversationId, conversationId),
          eq(conversationTurns.speaker, 'agent')
        )
      )
      .all()
      .filter((turn) => !userTurn || turn.sequence > userTurn.sequence)

    if (agentTurns.some((turn) => turn.status === 'running')) {
      return 'running'
    }

    if (pendingInputRequest || agentTurns.some((turn) => turn.status === 'waiting_for_user')) {
      return 'waiting_for_user'
    }

    if (agentTurns.some((turn) => turn.status === 'completed')) {
      return 'active'
    }

    if (agentTurns.some((turn) => turn.status === 'failed')) {
      return 'failed'
    }

    if (agentTurns.some((turn) => turn.status === 'cancelled')) {
      return 'cancelled'
    }

    return 'active'
  }

  close(): void {
    this.sqlite.close()
  }
}

function getUniqueAgentId(idExists: (id: string) => boolean): string {
  let candidate = createAgentId()

  while (idExists(candidate)) {
    candidate = createAgentId()
  }

  return candidate
}

function createAgentId(): string {
  return `agt-${randomUUID()}`
}

function createConversationId(): string {
  return `cnv-${randomUUID()}`
}

function createConversationParticipantId(): string {
  return `cpt-${randomUUID()}`
}

function createConversationTurnId(): string {
  return `trn-${randomUUID()}`
}

function createConversationInputRequestId(): string {
  return `cir-${randomUUID()}`
}

function createWorkRunId(): string {
  return `wrk-${randomUUID()}`
}

function createWorkRequestId(): string {
  return `wrq-${randomUUID()}`
}

function createWorkRunDependencyId(): string {
  return `wrd-${randomUUID()}`
}

function createWorkRunEventId(): string {
  return `wre-${randomUUID()}`
}

function createWorkRunInputRequestId(): string {
  return `wir-${randomUUID()}`
}

function createWorkRequestArtifactRoot(title: string, requestId: string): string {
  const slug = slugifyPathSegment(title) || 'work-request'
  return `workboard/${slug}-${shortStableId(requestId)}`
}

function slugifyPathSegment(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '')
}

function shortStableId(value: string): string {
  return (
    value
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(-6)
      .toLowerCase() || '000000'
  )
}

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values))
}

function parseWorkRun(value: unknown): WorkRun {
  if (!isDatabaseWorkRun(value)) {
    throw new Error('Work run row was invalid.')
  }

  return WorkRunSchema.parse({
    ...value,
    artifactRefs: parseJsonStringArray(value.artifactRefs),
    changedFiles: parseJsonStringArray(value.changedFiles),
    source:
      value.sourceType && value.sourceId
        ? {
            type: value.sourceType,
            id: value.sourceId,
            itemId: value.sourceItemId ?? undefined
          }
        : null
  })
}

function isDatabaseWorkRun(value: unknown): value is {
  sourceType: string | null
  sourceId: string | null
  sourceItemId: string | null
  artifactRefs: string
  changedFiles: string
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    'sourceType' in value &&
    'sourceId' in value &&
    'sourceItemId' in value &&
    'artifactRefs' in value &&
    'changedFiles' in value
  )
}

function parseWorkRunEvent(value: unknown): WorkRunEvent {
  if (!isDatabaseWorkRunEvent(value)) {
    throw new Error('Work run event row was invalid.')
  }

  return WorkRunEventSchema.parse({
    ...value,
    payload: parseJsonObject(value.payload)
  })
}

function parseWorkRunInputRequest(value: unknown): WorkRunInputRequest {
  if (!isDatabaseWorkRunInputRequest(value)) {
    throw new Error('Work input request row was invalid.')
  }

  return WorkRunInputRequestSchema.parse({
    ...value,
    questions: parseJsonArray(value.questions),
    answers: value.answers ? parseJsonArray(value.answers) : null
  })
}

function isDatabaseWorkRunInputRequest(value: unknown): value is {
  questions: string
  answers: string | null
} {
  return typeof value === 'object' && value !== null && 'questions' in value && 'answers' in value
}

function isDatabaseWorkRunEvent(value: unknown): value is {
  payload: string
} {
  return typeof value === 'object' && value !== null && 'payload' in value
}

function isTerminalWorkRunStatus(status: WorkRun['status']): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}

function isCompletableWorkRunStatus(status: WorkRun['status']): boolean {
  return status === 'running' || status === 'waiting_for_user'
}

function getSatisfiedRequiredRunIds(requiredRuns: WorkRun[]): Set<string> {
  return new Set(requiredRuns.filter(hasCompletedWorkRunOutput).map((run) => run.id))
}

function hasCompletedWorkRunOutput(run: WorkRun): boolean {
  return run.status === 'completed' && Boolean(run.resultSummary.trim())
}

function withExistingWorkspaceFileRefs(run: WorkRun): WorkRun {
  return {
    ...run,
    artifactRefs: filterExistingWorkspacePaths(run.workspaceRoot, run.artifactRefs),
    changedFiles: filterExistingWorkspacePaths(run.workspaceRoot, run.changedFiles)
  }
}

function filterExistingWorkspacePaths(workspaceRoot: string, relativePaths: string[]): string[] {
  return relativePaths.filter((path) => workspaceRelativePathExists(workspaceRoot, path))
}

function workspaceRelativePathExists(workspaceRoot: string, relativePath: string): boolean {
  try {
    const absolutePath = join(workspaceRoot, relativePath)
    const relativeToWorkspace = relativePathFromWorkspace(workspaceRoot, absolutePath)
    return Boolean(relativeToWorkspace) && existsSync(absolutePath)
  } catch {
    return false
  }
}

function relativePathFromWorkspace(workspaceRoot: string, absolutePath: string): string {
  const relativePath = relative(workspaceRoot, absolutePath)
  if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath)) {
    return ''
  }
  return relativePath
}

function getInitialWorkRunStatus(
  requiredRunIds: string[],
  satisfiedRequiredRunIds: Set<string>
): InitialWorkRunStatus {
  if (requiredRunIds.length > 0 && satisfiedRequiredRunIds.size !== requiredRunIds.length) {
    return 'blocked'
  }

  return 'queued'
}

function getWorkRequestStatus(runs: WorkRun[]): WorkRequest['status'] {
  if (runs.some((run) => run.status === 'running')) {
    return 'running'
  }
  if (runs.some((run) => run.status === 'waiting_for_user')) {
    return 'waiting_for_user'
  }
  if (runs.some((run) => run.status === 'failed')) {
    return 'failed'
  }
  if (runs.some((run) => run.status === 'cancelled')) {
    return 'cancelled'
  }
  if (runs.some((run) => run.status === 'queued' || run.status === 'blocked')) {
    return 'active'
  }
  if (runs.every((run) => run.status === 'completed')) {
    return 'completed'
  }

  return 'active'
}

function getNextWorkRunEventSequence(
  db: Pick<ReturnType<typeof drizzle>, 'select'>,
  runId: string
): number {
  const latestEvent = db
    .select({ sequence: workRunEvents.sequence })
    .from(workRunEvents)
    .where(eq(workRunEvents.runId, runId))
    .orderBy(desc(workRunEvents.sequence))
    .get()

  return (latestEvent?.sequence ?? 0) + 1
}

function isTerminalWorkRequestStatus(status: WorkRequest['status']): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}

function parseConversationInputRequest(value: unknown): ConversationInputRequest {
  if (!isDatabaseInputRequest(value)) {
    throw new Error('Input request row was invalid.')
  }

  return ConversationInputRequestSchema.parse({
    ...value,
    questions: parseJsonArray(value.questions),
    answers: value.answers ? parseJsonArray(value.answers) : null
  })
}

function isDatabaseInputRequest(value: unknown): value is {
  questions: string
  answers: string | null
} {
  return typeof value === 'object' && value !== null && 'questions' in value && 'answers' in value
}

function parseJsonArray(value: string): unknown[] {
  const parsed = JSON.parse(value)
  if (!Array.isArray(parsed)) {
    throw new Error('Expected a JSON array.')
  }
  return parsed
}

function parseJsonStringArray(value: string): string[] {
  return parseJsonArray(value).filter((item): item is string => typeof item === 'string')
}

function parseJsonObject(value: string): Record<string, unknown> {
  const parsed = JSON.parse(value)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Expected a JSON object.')
  }
  return parsed as Record<string, unknown>
}

function validateInputRequestAnswers(
  questions: InteractionQuestion[],
  answers: InteractionAnswer[]
): InteractionAnswer[] {
  const questionById = new Map(questions.map((question) => [question.id, question]))
  const answerByQuestionId = new Map<string, InteractionAnswer>()

  answers.forEach((answer) => {
    const question = questionById.get(answer.questionId)
    if (!question) {
      throw new Error('One or more answers do not match this input request.')
    }
    if (answerByQuestionId.has(answer.questionId)) {
      throw new Error('Each question can only be answered once.')
    }

    validateAnswerForQuestion(question, answer)
    answerByQuestionId.set(answer.questionId, answer)
  })

  const unansweredRequiredQuestion = questions.find(
    (question) => question.required && !answerByQuestionId.has(question.id)
  )
  if (unansweredRequiredQuestion) {
    throw new Error('Answer all required questions before continuing.')
  }

  return questions
    .map((question) => answerByQuestionId.get(question.id))
    .filter((answer): answer is InteractionAnswer => Boolean(answer))
}

function validateAnswerForQuestion(question: InteractionQuestion, answer: InteractionAnswer): void {
  if (question.kind === 'choice') {
    validateChoiceAnswer(question, answer)
    return
  }

  if (question.kind === 'text' && answer.type !== 'text') {
    throw new Error('Text questions require a text answer.')
  }

  if (question.kind === 'boolean' && answer.type !== 'boolean') {
    throw new Error('Yes/no questions require a yes or no answer.')
  }
}

function validateChoiceAnswer(
  question: Extract<InteractionQuestion, { kind: 'choice' }>,
  answer: InteractionAnswer
): void {
  if (answer.type === 'option') {
    if (!question.options.some((option) => option.id === answer.optionId)) {
      throw new Error('One or more selected options are not available for this request.')
    }
    return
  }

  if (answer.type === 'custom') {
    if (question.allowCustom === false) {
      throw new Error('This question does not accept a custom answer.')
    }
    return
  }

  throw new Error('Choice questions require an option or custom answer.')
}

function hasRunningTurnForParticipant(turns: ConversationTurn[], participantId: string): boolean {
  return turns.some((turn) => turn.participantId === participantId && turn.status === 'running')
}

function buildInputRequestAnswerSummary(
  questions: InteractionQuestion[],
  answers: InteractionAnswer[]
): string {
  const answerByQuestionId = new Map(answers.map((answer) => [answer.questionId, answer]))
  const lines = ['User answered the pending input request:']

  questions.forEach((question, index) => {
    const answer = answerByQuestionId.get(question.id)
    if (!answer) {
      return
    }

    lines.push('', `${index + 1}. ${question.label}`, `Answer: ${formatAnswer(question, answer)}`)
  })

  return lines.join('\n')
}

function buildInputRequestContinuationMessage(
  request: ConversationInputRequest,
  answers: InteractionAnswer[]
): string {
  return [
    buildInputRequestAnswerSummary(request.questions, answers),
    '',
    'Continue the task using these answers. If more information is required, ask another explicit input request.'
  ].join('\n')
}

function buildWorkInputRequestContinuationMessage(
  request: WorkRunInputRequest,
  answers: InteractionAnswer[]
): string {
  return [
    buildInputRequestAnswerSummary(request.questions, answers),
    '',
    'Continue this Work Item using these answers. If more information is required, ask another explicit input request.'
  ].join('\n')
}

function formatAnswer(question: InteractionQuestion, answer: InteractionAnswer): string {
  if (answer.type === 'option' && question.kind === 'choice') {
    const option = question.options.find((item) => item.id === answer.optionId)
    return option?.label ?? answer.optionId
  }

  if (answer.type === 'custom') {
    return `Custom - ${answer.text}`
  }

  if (answer.type === 'text') {
    return answer.text
  }

  if (answer.type === 'boolean' && question.kind === 'boolean') {
    return answer.value ? question.trueLabel : question.falseLabel
  }

  return ''
}

function buildAssignedConversationMessage(userMessage: string, instruction: string): string {
  const trimmedInstruction = instruction.trim()

  if (!trimmedInstruction || trimmedInstruction === userMessage.trim()) {
    return userMessage
  }

  return [
    'Original user message:',
    userMessage,
    '',
    'Orchestrator assignment:',
    trimmedInstruction,
    '',
    'Respond only to your assignment while preserving the relevant user context.'
  ].join('\n')
}

function mergeAssignmentsByParticipant(
  assignments: OrchestrationAssignment[]
): OrchestrationAssignment[] {
  const merged = new Map<string, string[]>()

  assignments.forEach((assignment) => {
    const instruction = assignment.instruction.trim()
    if (!instruction) {
      return
    }

    merged.set(assignment.participantId, [
      ...(merged.get(assignment.participantId) ?? []),
      instruction
    ])
  })

  return Array.from(merged, ([participantId, instructions]) => ({
    participantId,
    instruction: uniqueValues(instructions).join('\n\n')
  }))
}

function formatConversationAgentNames(agentNames: string[]): string {
  const names = agentNames.filter(Boolean)
  const [firstName] = names

  if (!firstName) {
    return ''
  }

  if (names.length === 1) {
    return firstName
  }

  return `${firstName} + ${names.length - 1}`
}

function createBoundedTurnContent(value: string): {
  content: string
  preview: string
  truncated: boolean
} {
  const normalized = value.trim()
  const truncated = normalized.length > turnContentLimit
  const content = truncated ? normalized.slice(0, turnContentLimit) : normalized
  const previewSource = content.replace(/\s+/g, ' ').trim()
  const preview =
    previewSource.length > turnPreviewLimit
      ? `${previewSource.slice(0, turnPreviewLimit - 3)}...`
      : previewSource

  return {
    content,
    preview,
    truncated
  }
}

export function resolveWorkspaceRoot(value: string): string {
  const workspaceRoot = value.trim()
  if (!workspaceRoot) {
    throw new Error('Workspace folder is required.')
  }

  const resolved = realpathSync.native(workspaceRoot)
  const stat = statSync(resolved)

  if (!stat.isDirectory()) {
    throw new Error('Workspace path must be a folder.')
  }

  return resolved
}
