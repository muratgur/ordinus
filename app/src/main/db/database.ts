import Database from 'better-sqlite3'
import { and, asc, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, realpathSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  AgentCreateInputSchema,
  AgentDeleteInputSchema,
  AgentDeleteResultSchema,
  AgentMemoryAddInputSchema,
  AgentMemoryDeactivateInputSchema,
  AgentMemoryDeactivateResultSchema,
  AgentMemoryListInputSchema,
  AgentMemoryRuleSchema,
  AgentMemoryUpdateInputSchema,
  AgentReflectionSummarySchema,
  AgentScheduleCreateInputSchema,
  AgentScheduleDeleteInputSchema,
  AgentScheduleGetInputSchema,
  AgentScheduleListInputSchema,
  AgentScheduleSchema,
  AgentScheduleSetEnabledInputSchema,
  AgentScheduleUpdateInputSchema,
  AgentSchema,
  AgentUpdateInstructionsInputSchema,
  AgentUpdateSettingsInputSchema,
  ConversationCancelTurnInputSchema,
  ConversationAnswerInputRequestInputSchema,
  ConversationCancelInputRequestInputSchema,
  ConversationCreateDirectInputSchema,
  ConversationCreateManualInputSchema,
  ConversationDeleteInputSchema,
  ConversationDeleteResultSchema,
  ConversationDetailSchema,
  ConversationInputRequestSchema,
  ConversationGetInputSchema,
  ConversationListItemSchema,
  ConversationSendTurnInputSchema,
  ConversationUpdateTitleInputSchema,
  ConversationTurnSchema,
  ConversationUpdateRoutingModeInputSchema,
  DbStatusSchema,
  ObservedRunEventSchema,
  ObservedRunSnapshotSchema,
  WorkspaceConfigSchema,
  WorkspaceSaveConfigInputSchema,
  WorkspaceUpdateSystemDefaultInputSchema,
  PendingPlanCreateInputSchema,
  PendingPlanSchema,
  type PendingPlan,
  type PendingPlanCreateInput,
  WorkboardAnswerInputRequestInputSchema,
  WorkboardDataSchema,
  WorkboardDraftPlanSchema,
  WorkboardStartRequestPlanInputSchema,
  WorkboardStartFollowUpInputSchema,
  WorkboardStartRequestInputSchema,
  WorkRunActionInputSchema,
  WorkRunCompleteInputSchema,
  WorkRunContextReferenceSchema,
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
  type AgentMemoryAddInput,
  type AgentMemoryDeactivateInput,
  type AgentMemoryDeactivateResult,
  type AgentMemoryListInput,
  type AgentMemoryRule,
  type AgentMemoryUpdateInput,
  type AgentReflectionSummary,
  type AgentSchedule,
  type AgentScheduleCreateInput,
  type AgentScheduleDeleteInput,
  type AgentScheduleGetInput,
  type AgentScheduleListInput,
  type AgentScheduleSetEnabledInput,
  type AgentScheduleUpdateInput,
  type AgentUpdateInstructionsInput,
  type AgentUpdateSettingsInput,
  type AgentTurnOutcome,
  type ConversationCreateManualInput,
  type ConversationDeleteInput,
  type ConversationDeleteResult,
  type ConversationDetail,
  type ConversationInputRequest,
  type ConversationListItem,
  type ConversationSendTurnInput,
  type ConversationTurn,
  type ConversationUpdateTitleInput,
  type ConversationUpdateRoutingModeInput,
  type DbStatus,
  type InteractionAnswer,
  type InteractionQuestion,
  type OrchestrationAssignment,
  type ObservedRunEvent,
  type ObservedRunEventConfidence,
  type ObservedRunEventKind,
  type ObservedRunEventSource,
  type ObservedRunLifecycleStatus,
  type ObservedRunLivenessHealth,
  type ObservedRunPhase,
  type ObservedRunSnapshot,
  type ObservedRunSourceSurface,
  type ObservedRunUsageSource,
  type WorkRun,
  type WorkRunActionInput,
  type WorkboardAnswerInputRequestInput,
  type WorkboardData,
  type WorkboardContextReferenceInput,
  type WorkboardStartFollowUpInput,
  type WorkboardStartRequestPlanInput,
  type WorkboardStartRequestInput,
  type WorkRunCompleteInput,
  type WorkRunContextReference,
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
  agentMemory,
  agentSchedules,
  agents,
  appMeta,
  conversationInputRequests,
  conversationParticipants,
  conversations,
  conversationTurns,
  observedRunEvents,
  observedRuns,
  pendingPlans,
  workRequestAgentSessions,
  workRequests,
  workRunContextReferences,
  workRunDependencies,
  workRunEvents,
  workRunInputRequests,
  workRuns,
  workspaceConfig
} from './schema'
import {
  createConversationWorkingRoot,
  createWorkboardWorkingRoot,
  ensureWorkspaceRelativeDirectory,
  filterExistingWorkspacePaths,
  resolveWorkspaceRelativePath
} from '../workspace/path-policy'

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

export type ObservedRunUpsertInput = {
  sourceSurface: ObservedRunSourceSurface
  sourceItemId: string
  sourceItemTitle: string
  assignedAgentId: string
  assignedAgentName: string
  assignedAgentRole: string
  providerId: WorkRun['providerId']
  model: string
  lifecycleStatus: ObservedRunLifecycleStatus
  livenessHealth: ObservedRunLivenessHealth
  currentPhase: ObservedRunPhase
  latestActivity: string
  latestActivityAt?: string | null
  queuedAt?: string | null
  startedAt?: string | null
  firstActivityAt?: string | null
  lastActivityAt?: string | null
  completedAt?: string | null
  inputTokens?: number | null
  outputTokens?: number | null
  totalTokens?: number | null
  usageSource?: ObservedRunUsageSource
  sanitizedInvocation?: Record<string, unknown>
  logRef: string
}

export type ObservedRunPatchInput = {
  id: string
  lifecycleStatus?: ObservedRunLifecycleStatus
  livenessHealth?: ObservedRunLivenessHealth
  currentPhase?: ObservedRunPhase
  latestActivity?: string
  latestActivityAt?: string | null
  firstActivityAt?: string | null
  lastActivityAt?: string | null
  completedAt?: string | null
  inputTokens?: number | null
  outputTokens?: number | null
  totalTokens?: number | null
  usageSource?: ObservedRunUsageSource
  sanitizedInvocation?: Record<string, unknown>
}

export type ObservedRunEventCreateInput = {
  observedRunId: string
  kind: ObservedRunEventKind
  source: ObservedRunEventSource
  confidence: ObservedRunEventConfidence
  phase?: ObservedRunPhase | null
  lifecycleStatus?: ObservedRunLifecycleStatus | null
  summary: string
  payload?: Record<string, unknown>
}

export type ObservedRunInternal = ObservedRunSnapshot & {
  logRef: string
  sanitizedInvocation: Record<string, unknown>
}

export type QueuedWorkRunResume = {
  inputRequestId: string
  message: string
}

export type ConversationDeleteDatabaseResult = ConversationDeleteResult & {
  deletedLogRefs: string[]
}

type InitialWorkRunStatus = Extract<WorkRun['status'], 'queued' | 'blocked'>
type PreparedContextReference = {
  kind: WorkRunContextReference['kind']
  refId: string
  label: string
  metadata: Record<string, unknown>
  dependencyRun?: WorkRun
  anchorRun?: WorkRun
}
type WorkRequestAgentSession = typeof workRequestAgentSessions.$inferSelect

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
        observedRunEvents,
        observedRuns,
        workRequestAgentSessions,
        workRequests,
        workRunContextReferences,
        workRunDependencies,
        workRunEvents,
        workRunInputRequests,
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
    const parsed = WorkspaceSaveConfigInputSchema.parse(input)
    const workspaceRoot = resolveWorkspaceRoot(parsed.workspaceRoot)
    const workspaceName = parsed.workspaceName.trim()
    const now = new Date().toISOString()
    const existing = this.db.select().from(workspaceConfig).where(eq(workspaceConfig.id, 1)).get()
    const defaultProviderId = parsed.defaultProviderId ?? existing?.defaultProviderId ?? 'codex'
    const defaultModel = parsed.defaultModel ?? existing?.defaultModel ?? 'default'

    if (existing) {
      if (existing.workspaceRoot !== workspaceRoot && this.hasRunningWorkspaceWork()) {
        throw new Error('Stop running work before changing the workspace folder.')
      }

      this.db
        .update(workspaceConfig)
        .set({
          workspaceRoot,
          workspaceName,
          defaultProviderId,
          defaultModel,
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
          defaultProviderId,
          defaultModel,
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
      .where(isNull(agents.archivedAt))
      .orderBy(desc(agents.createdAt))
      .all()
      .map((agent) => AgentSchema.parse(agent))
  }

  listAgentsIncludingArchived(): Agent[] {
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
      .where(and(eq(agents.enabled, true), isNull(agents.archivedAt)))
      .orderBy(desc(agents.createdAt))
      .all()
      .map((agent) => AgentSchema.parse(agent))
  }

  recordAgentUsage(agentId: string): void {
    if (!this.hasAgent(agentId)) {
      return
    }
    const now = new Date().toISOString()
    this.db
      .update(agents)
      .set({
        lastUsedAt: now,
        useCount: sql`${agents.useCount} + 1`,
        updatedAt: now
      })
      .where(eq(agents.id, agentId))
      .run()
  }

  archiveAgent(agentId: string): Agent {
    if (!this.hasAgent(agentId)) {
      throw new Error('Agent was not found.')
    }
    const now = new Date().toISOString()
    this.db
      .update(agents)
      .set({ archivedAt: now, updatedAt: now })
      .where(eq(agents.id, agentId))
      .run()
    return this.getAgent(agentId)
  }

  getAgentReflectionSummary(staleThresholdDays = 14): AgentReflectionSummary {
    const now = Date.now()
    const dayMs = 24 * 60 * 60 * 1000
    const thresholdMs = staleThresholdDays * dayMs
    const agentRows = this.listAgents()

    // Single batched read for all active memory rules across every agent;
    // group client-side to avoid N+1 SQLite queries when this summary screen
    // opens.
    const allRules = this.db
      .select()
      .from(agentMemory)
      .where(eq(agentMemory.active, true))
      .orderBy(asc(agentMemory.createdAt))
      .all()
      .map((row) => AgentMemoryRuleSchema.parse(row))

    const rulesByAgentId = new Map<string, AgentMemoryRule[]>()
    for (const rule of allRules) {
      const bucket = rulesByAgentId.get(rule.agentId)
      if (bucket) {
        bucket.push(rule)
      } else {
        rulesByAgentId.set(rule.agentId, [rule])
      }
    }

    const entries = agentRows.map((agent) => {
      const referenceIso = agent.lastUsedAt ?? agent.createdAt
      const referenceMs = Date.parse(referenceIso)
      const ageMs = Number.isNaN(referenceMs) ? Number.POSITIVE_INFINITY : now - referenceMs
      const daysSinceUsed = agent.lastUsedAt
        ? Math.floor((now - Date.parse(agent.lastUsedAt)) / dayMs)
        : null
      return {
        agent,
        rules: rulesByAgentId.get(agent.id) ?? [],
        isStale: ageMs >= thresholdMs,
        daysSinceUsed
      }
    })

    return AgentReflectionSummarySchema.parse({
      entries,
      staleThresholdDays,
      generatedAt: new Date().toISOString()
    })
  }

  unarchiveAgent(agentId: string): Agent {
    if (!this.hasAgent(agentId)) {
      throw new Error('Agent was not found.')
    }
    const now = new Date().toISOString()
    this.db
      .update(agents)
      .set({ archivedAt: null, updatedAt: now })
      .where(eq(agents.id, agentId))
      .run()
    return this.getAgent(agentId)
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

  hasRunningWorkspaceWork(): boolean {
    const activeStatuses = ['running', 'waiting_for_user'] as const
    const activeConversationTurn = this.db
      .select({ id: conversationTurns.id })
      .from(conversationTurns)
      .where(inArray(conversationTurns.status, activeStatuses))
      .get()
    if (activeConversationTurn) {
      return true
    }

    return Boolean(
      this.db
        .select({ id: workRuns.id })
        .from(workRuns)
        .where(inArray(workRuns.status, activeStatuses))
        .get()
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
    if (this.hasDuplicateAgentName(parsed.name, '')) {
      throw new Error('Another agent already uses this name.')
    }

    const now = new Date().toISOString()
    const agent = AgentSchema.parse({
      ...parsed,
      name: parsed.name.trim(),
      model: parsed.model.trim(),
      id: getUniqueAgentId((id) => this.hasAgent(id)),
      createdAt: now,
      updatedAt: now
    })

    this.db.insert(agents).values(agent).run()

    return agent
  }

  getAvailableAgentName(name: string): string {
    const baseName = cleanAgentName(name) || 'New agent'
    if (!this.hasDuplicateAgentName(baseName, '')) {
      return baseName
    }

    let suffix = 2
    let candidate = `${baseName} ${suffix}`
    while (this.hasDuplicateAgentName(candidate, '')) {
      suffix += 1
      candidate = `${baseName} ${suffix}`
    }

    return candidate
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

      tx.delete(agentSchedules).where(eq(agentSchedules.agentId, agent.id)).run()
      tx.delete(agentMemory).where(eq(agentMemory.agentId, agent.id)).run()
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
    if (this.hasDuplicateAgentName(parsed.name, currentAgent.id)) {
      throw new Error('Another agent already uses this name.')
    }

    this.db
      .update(agents)
      .set({
        name: parsed.name,
        role: parsed.role,
        capabilities: parsed.capabilities,
        providerId: parsed.providerId,
        model: parsed.model,
        sandbox: parsed.sandbox,
        connectors: parsed.connectors,
        enabled: parsed.enabled,
        ...(parsed.avatar !== undefined ? { avatar: parsed.avatar } : {}),
        updatedAt: now
      })
      .where(eq(agents.id, parsed.id))
      .run()

    return this.getAgent(parsed.id)
  }

  listPendingPlans(): PendingPlan[] {
    return this.db
      .select()
      .from(pendingPlans)
      .orderBy(asc(pendingPlans.createdAt))
      .all()
      .map((row) => PendingPlanSchema.parse(row))
  }

  createPendingPlan(input: PendingPlanCreateInput): PendingPlan {
    const parsed = PendingPlanCreateInputSchema.parse(input)
    const now = new Date().toISOString()
    const pendingPlan = PendingPlanSchema.parse({
      ...parsed,
      id: `pp-${randomUUID()}`,
      createdAt: now,
      updatedAt: now
    })

    this.db.insert(pendingPlans).values(pendingPlan).run()

    return pendingPlan
  }

  deletePendingPlan(id: string): void {
    this.db.delete(pendingPlans).where(eq(pendingPlans.id, id)).run()
  }

  listAgentMemoryRules(input: AgentMemoryListInput): AgentMemoryRule[] {
    const parsed = AgentMemoryListInputSchema.parse(input)
    const condition = parsed.includeInactive
      ? eq(agentMemory.agentId, parsed.agentId)
      : and(eq(agentMemory.agentId, parsed.agentId), eq(agentMemory.active, true))

    return this.db
      .select()
      .from(agentMemory)
      .where(condition)
      .orderBy(asc(agentMemory.createdAt))
      .all()
      .map((row) => AgentMemoryRuleSchema.parse(row))
  }

  addAgentMemoryRule(input: AgentMemoryAddInput): AgentMemoryRule {
    const parsed = AgentMemoryAddInputSchema.parse(input)
    if (!this.hasAgent(parsed.agentId)) {
      throw new Error('Agent was not found.')
    }

    const now = new Date().toISOString()
    const rule = AgentMemoryRuleSchema.parse({
      id: `am-${randomUUID()}`,
      agentId: parsed.agentId,
      rule: parsed.rule,
      sourceFeedbackId: parsed.sourceFeedbackId ?? null,
      active: true,
      createdAt: now,
      updatedAt: now
    })

    this.db.insert(agentMemory).values(rule).run()

    return rule
  }

  updateAgentMemoryRule(input: AgentMemoryUpdateInput): AgentMemoryRule {
    const parsed = AgentMemoryUpdateInputSchema.parse(input)
    const existing = this.db
      .select()
      .from(agentMemory)
      .where(and(eq(agentMemory.id, parsed.ruleId), eq(agentMemory.agentId, parsed.agentId)))
      .get()

    if (!existing) {
      throw new Error('Memory rule was not found.')
    }

    const now = new Date().toISOString()
    this.db
      .update(agentMemory)
      .set({ rule: parsed.rule, updatedAt: now })
      .where(eq(agentMemory.id, parsed.ruleId))
      .run()

    return AgentMemoryRuleSchema.parse({ ...existing, rule: parsed.rule, updatedAt: now })
  }

  deactivateAgentMemoryRule(input: AgentMemoryDeactivateInput): AgentMemoryDeactivateResult {
    const parsed = AgentMemoryDeactivateInputSchema.parse(input)
    const existing = this.db
      .select({ id: agentMemory.id })
      .from(agentMemory)
      .where(and(eq(agentMemory.id, parsed.ruleId), eq(agentMemory.agentId, parsed.agentId)))
      .get()

    if (!existing) {
      throw new Error('Memory rule was not found.')
    }

    const now = new Date().toISOString()
    this.db
      .update(agentMemory)
      .set({ active: false, updatedAt: now })
      .where(eq(agentMemory.id, parsed.ruleId))
      .run()

    return AgentMemoryDeactivateResultSchema.parse({ deactivatedRuleId: parsed.ruleId })
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
    const workingRoot =
      parentRun?.workingRoot ??
      (parsed.source?.type === workRequestSourceType && parsed.source.id
        ? this.getWorkRequest(parsed.source.id).workingRoot
        : createWorkboardWorkingRoot(parsed.title, runId))
    const satisfiedRequiredRunIds = getSatisfiedRequiredRunIds(requiredRuns)
    const status = getInitialWorkRunStatus(requiredRunIds, satisfiedRequiredRunIds)
    const workspace = this.getWorkspaceConfig()
    if (workspace) {
      ensureWorkspaceRelativeDirectory(workspace.workspaceRoot, workingRoot)
    }

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
          workingRoot,
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
    this.ensureWorkRequestAgentSessionsForRuns([runId])

    this.appendWorkRunEvent(runId, 'created', {
      assignedAgentId: agent.id,
      requiredRunIds
    })
    this.appendWorkRunEvent(runId, status, {})

    return this.getWorkRun(runId)
  }

  createWorkRequestPlan(input: WorkboardStartRequestPlanInput): WorkRequest {
    const parsed = WorkboardStartRequestPlanInputSchema.parse(input)
    const plan = WorkboardDraftPlanSchema.parse(parsed.plan)
    const workspace = this.getWorkspaceConfig()
    if (!workspace) {
      throw new Error('Choose a workspace before creating a Work Request.')
    }

    const destinationRequest = parsed.destinationRequestId
      ? this.getWorkRequest(parsed.destinationRequestId)
      : null
    const contextReferences = this.prepareWorkboardContextReferences(
      parsed.contextReferences,
      workspace.workspaceRoot
    )
    const workItemContextRuns = contextReferences
      .map((reference) => reference.anchorRun)
      .filter((run): run is WorkRun => Boolean(run))
    const parentRun = workItemContextRuns.length === 1 ? workItemContextRuns[0] : null
    const contextDependencyRuns = contextReferences
      .map((reference) => reference.dependencyRun)
      .filter((run): run is WorkRun => Boolean(run))
    const contextDependencyRunIds = contextDependencyRuns.map((run) => run.id)

    const agentsById = new Map(
      this.listAgents()
        .filter((agent) => agent.enabled)
        .map((agent) => [agent.id, agent])
    )
    plan.items.forEach((item) => {
      if (!agentsById.has(item.assignedAgentId)) {
        throw new Error('One or more Work Items are assigned to an unavailable agent.')
      }
    })
    validateWorkboardDraftPlanDependencies(plan.items)

    const now = new Date().toISOString()
    const requestId = destinationRequest?.id ?? createWorkRequestId()
    const workingRoot =
      destinationRequest?.workingRoot ??
      createWorkboardWorkingRoot(plan.title || parsed.originalRequest, requestId)
    const runIdsByTempId = new Map(plan.items.map((item) => [item.tempId, createWorkRunId()]))
    ensureWorkspaceRelativeDirectory(workspace.workspaceRoot, workingRoot)

    this.db.transaction((tx) => {
      if (!destinationRequest) {
        tx.insert(workRequests)
          .values({
            id: requestId,
            title: plan.title,
            originalRequest: parsed.originalRequest,
            summary: plan.summary,
            workingRoot,
            status: 'active',
            createdAt: now,
            updatedAt: now,
            startedAt: null,
            completedAt: null
          })
          .run()
      } else {
        tx.update(workRequests)
          .set({
            summary: plan.summary || destinationRequest.summary,
            status:
              destinationRequest.status === 'completed' ? 'active' : destinationRequest.status,
            updatedAt: now,
            completedAt: null,
            archivedAt: null
          })
          .where(eq(workRequests.id, destinationRequest.id))
          .run()
      }

      plan.items.forEach((item) => {
        const agent = agentsById.get(item.assignedAgentId)
        const runId = runIdsByTempId.get(item.tempId)
        if (!agent || !runId) {
          throw new Error('Work Item could not be prepared.')
        }

        const planDependencyRunIds = item.dependsOnTempIds.map((tempId) => {
          const dependsOnRunId = runIdsByTempId.get(tempId)
          if (!dependsOnRunId) {
            throw new Error('Work Item dependency could not be prepared.')
          }
          return dependsOnRunId
        })
        const requiredRunIds = uniqueValues([...contextDependencyRunIds, ...planDependencyRunIds])
        const satisfiedRequiredRunIds = getSatisfiedRequiredRunIds(contextDependencyRuns)
        const status = getInitialWorkRunStatus(requiredRunIds, satisfiedRequiredRunIds)
        const providerSessionRef = getContinuationProviderSessionRef(
          parentRun,
          agent,
          requiredRunIds
        )

        tx.insert(workRuns)
          .values({
            id: runId,
            rootRunId: parentRun?.rootRunId ?? runId,
            parentRunId: parentRun?.id ?? null,
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
            status,
            priority: item.priority,
            providerId: agent.providerId,
            model: agent.model,
            providerSessionRef,
            workingRoot,
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

        contextReferences.forEach((reference) => {
          tx.insert(workRunContextReferences)
            .values({
              id: createWorkRunContextReferenceId(),
              runId,
              kind: reference.kind,
              refId: reference.refId,
              label: reference.label,
              metadata: JSON.stringify(reference.metadata),
              createdAt: now
            })
            .run()
        })

        tx.insert(workRunEvents)
          .values({
            id: createWorkRunEventId(),
            runId,
            sequence: 1,
            kind: 'created',
            payload: JSON.stringify({
              workRequestId: requestId,
              assignedAgentId: item.assignedAgentId,
              parentRunId: parentRun?.id ?? null,
              requiredRunIds,
              contextReferences: contextReferences.map((reference) => ({
                kind: reference.kind,
                refId: reference.refId,
                label: reference.label
              }))
            }),
            createdAt: now
          })
          .run()
        tx.insert(workRunEvents)
          .values({
            id: createWorkRunEventId(),
            runId,
            sequence: 2,
            kind: status,
            payload: JSON.stringify({}),
            createdAt: now
          })
          .run()
      })
    })

    const firstRunId = plan.items
      .map((item) => runIdsByTempId.get(item.tempId))
      .find((runId): runId is string => Boolean(runId))
    if (firstRunId) {
      this.refreshWorkRequestStatusForRun(firstRunId)
    }
    this.ensureWorkRequestAgentSessionsForRuns(Array.from(runIdsByTempId.values()))

    return this.getWorkRequest(requestId)
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
        .filter((agent) => agent.enabled)
        .map((agent) => [agent.id, agent])
    )
    plan.items.forEach((item) => {
      if (!agentsById.has(item.assignedAgentId)) {
        throw new Error('One or more Work Items are assigned to an unavailable agent.')
      }
    })
    validateWorkboardDraftPlanDependencies(plan.items)

    const now = new Date().toISOString()
    const requestId = createWorkRequestId()
    const workingRoot = createWorkboardWorkingRoot(plan.title || parsed.originalRequest, requestId)
    const runIdsByTempId = new Map(plan.items.map((item) => [item.tempId, createWorkRunId()]))
    ensureWorkspaceRelativeDirectory(workspace.workspaceRoot, workingRoot)

    this.db.transaction((tx) => {
      tx.insert(workRequests)
        .values({
          id: requestId,
          title: plan.title,
          originalRequest: parsed.originalRequest,
          summary: plan.summary,
          workingRoot,
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
            workingRoot,
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

    this.ensureWorkRequestAgentSessionsForRuns(Array.from(runIdsByTempId.values()))

    return this.getWorkRequest(requestId)
  }

  createWorkRequestFollowUp(input: WorkboardStartFollowUpInput): WorkRequest {
    const parsed = WorkboardStartFollowUpInputSchema.parse(input)
    const plan = WorkboardDraftPlanSchema.parse(parsed.plan)
    const request = this.getWorkRequest(parsed.requestId)
    const workspace = this.getWorkspaceConfig()
    if (!workspace) {
      throw new Error('Choose a workspace before adding continuation work.')
    }

    const anchorRun = parsed.anchorRunId ? this.getWorkRun(parsed.anchorRunId) : null
    if (anchorRun && !isWorkRunInRequest(anchorRun, request.id)) {
      throw new Error('Follow-up work must stay inside the selected Work Request.')
    }

    const agentsById = new Map(
      this.listAgents()
        .filter((agent) => agent.enabled)
        .map((agent) => [agent.id, agent])
    )
    plan.items.forEach((item) => {
      if (!agentsById.has(item.assignedAgentId)) {
        throw new Error('One or more continuation Work Items are assigned to an unavailable agent.')
      }
    })
    validateWorkboardDraftPlanDependencies(plan.items)

    const now = new Date().toISOString()
    const runIdsByTempId = new Map(plan.items.map((item) => [item.tempId, createWorkRunId()]))
    ensureWorkspaceRelativeDirectory(workspace.workspaceRoot, request.workingRoot)

    this.db.transaction((tx) => {
      if (request.archivedAt) {
        tx.update(workRequests)
          .set({ archivedAt: null, updatedAt: now })
          .where(eq(workRequests.id, request.id))
          .run()
      }
      plan.items.forEach((item) => {
        const agent = agentsById.get(item.assignedAgentId)
        const runId = runIdsByTempId.get(item.tempId)
        if (!agent || !runId) {
          throw new Error('Continuation Work Item could not be prepared.')
        }

        const dependentRunIds = item.dependsOnTempIds.map((tempId) => {
          const dependsOnRunId = runIdsByTempId.get(tempId)
          if (!dependsOnRunId) {
            throw new Error('Continuation Work Item dependency could not be prepared.')
          }

          return dependsOnRunId
        })
        const shouldDependOnAnchor = shouldUseAnchorDependency(anchorRun, item.dependsOnTempIds)
        const requiredRunIds = uniqueValues([
          ...(shouldDependOnAnchor && anchorRun ? [anchorRun.id] : []),
          ...dependentRunIds
        ])
        const satisfiedRequiredRunIds = anchorRun
          ? getSatisfiedRequiredRunIds([anchorRun])
          : new Set<string>()
        const status = getInitialWorkRunStatus(requiredRunIds, satisfiedRequiredRunIds)
        const providerSessionRef =
          anchorRun &&
          anchorRun.assignedAgentId === agent.id &&
          anchorRun.providerId === agent.providerId &&
          requiredRunIds.includes(anchorRun.id)
            ? anchorRun.providerSessionRef
            : null

        tx.insert(workRuns)
          .values({
            id: runId,
            rootRunId: anchorRun?.rootRunId ?? runId,
            parentRunId: anchorRun?.id ?? null,
            assignedAgentId: agent.id,
            assignedAgentName: agent.name,
            assignedAgentRole: agent.role,
            createdByType: 'user',
            createdByAgentId: null,
            sourceType: workRequestSourceType,
            sourceId: request.id,
            sourceItemId: item.tempId,
            title: item.title,
            instruction: item.instruction,
            status,
            priority: item.priority,
            providerId: agent.providerId,
            model: agent.model,
            providerSessionRef,
            workingRoot: request.workingRoot,
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

        tx.insert(workRunEvents)
          .values({
            id: createWorkRunEventId(),
            runId,
            sequence: 1,
            kind: 'created',
            payload: JSON.stringify({
              workRequestId: request.id,
              assignedAgentId: item.assignedAgentId,
              followUpToRunId: anchorRun?.id ?? null,
              requiredRunIds
            }),
            createdAt: now
          })
          .run()
        tx.insert(workRunEvents)
          .values({
            id: createWorkRunEventId(),
            runId,
            sequence: 2,
            kind: status,
            payload: JSON.stringify({}),
            createdAt: now
          })
          .run()
      })
    })

    const firstRunId = plan.items
      .map((item) => runIdsByTempId.get(item.tempId))
      .find((runId): runId is string => Boolean(runId))
    if (firstRunId) {
      this.refreshWorkRequestStatusForRun(firstRunId)
    }
    this.ensureWorkRequestAgentSessionsForRuns(Array.from(runIdsByTempId.values()))

    return this.getWorkRequest(request.id)
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

  archiveWorkRequest(requestId: string): WorkRequest {
    const request = this.getWorkRequest(requestId)
    if (!isTerminalWorkRequestStatus(request.status)) {
      throw new Error('Only finished Work Requests can be archived.')
    }
    if (request.archivedAt) {
      return request
    }
    const now = new Date().toISOString()
    this.db
      .update(workRequests)
      .set({ archivedAt: now, updatedAt: now })
      .where(eq(workRequests.id, requestId))
      .run()
    this.disableAgentSchedulesForArchivedRequest(requestId)
    return this.getWorkRequest(requestId)
  }

  unarchiveWorkRequest(requestId: string): WorkRequest {
    const request = this.getWorkRequest(requestId)
    if (!request.archivedAt) {
      return request
    }
    const now = new Date().toISOString()
    this.db
      .update(workRequests)
      .set({ archivedAt: null, updatedAt: now })
      .where(eq(workRequests.id, requestId))
      .run()
    return this.getWorkRequest(requestId)
  }

  listAgentSchedules(input: AgentScheduleListInput = {}): AgentSchedule[] {
    const parsed = AgentScheduleListInputSchema.parse(input)
    const conditions = [] as Parameters<typeof and>[number][]
    if (parsed.agentId) conditions.push(eq(agentSchedules.agentId, parsed.agentId))
    if (typeof parsed.enabled === 'boolean')
      conditions.push(eq(agentSchedules.enabled, parsed.enabled))
    if (parsed.linkedWorkRequestId)
      conditions.push(eq(agentSchedules.linkedWorkRequestId, parsed.linkedWorkRequestId))

    const rows = this.db
      .select()
      .from(agentSchedules)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(agentSchedules.nextRunAt), desc(agentSchedules.createdAt))
      .all()
    return rows.map((row) => AgentScheduleSchema.parse(row))
  }

  getAgentSchedule(input: AgentScheduleGetInput): AgentSchedule {
    const parsed = AgentScheduleGetInputSchema.parse(input)
    const row = this.db
      .select()
      .from(agentSchedules)
      .where(eq(agentSchedules.id, parsed.id))
      .get()
    if (!row) throw new Error('Schedule was not found.')
    return AgentScheduleSchema.parse(row)
  }

  createAgentSchedule(
    input: AgentScheduleCreateInput & { nextRunAt: string | null }
  ): AgentSchedule {
    const parsed = AgentScheduleCreateInputSchema.parse(input)
    const agent = this.getAgent(parsed.agentId)
    if (agent.archivedAt) throw new Error('Cannot schedule work for an archived agent.')

    if (parsed.linkedWorkRequestId) {
      const request = this.getWorkRequest(parsed.linkedWorkRequestId)
      if (request.archivedAt) {
        throw new Error('Cannot link a schedule to an archived Work Request.')
      }
    }

    const id = `sch_${randomUUID()}`
    const now = new Date().toISOString()
    this.db
      .insert(agentSchedules)
      .values({
        id,
        agentId: parsed.agentId,
        name: parsed.name,
        prompt: parsed.prompt,
        cron: parsed.cron ?? null,
        runAt: parsed.runAt ?? null,
        timezone: parsed.timezone,
        linkedWorkRequestId: parsed.linkedWorkRequestId ?? null,
        enabled: parsed.enabled ?? true,
        lastRunAt: null,
        nextRunAt: input.nextRunAt,
        lastRunId: null,
        lastRunStatus: null,
        consecutiveFailures: 0,
        disableReason: null,
        createdAt: now,
        updatedAt: now
      })
      .run()
    return this.getAgentSchedule({ id })
  }

  updateAgentSchedule(
    input: AgentScheduleUpdateInput & { nextRunAt?: string | null }
  ): AgentSchedule {
    const parsed = AgentScheduleUpdateInputSchema.parse(input)
    const current = this.getAgentSchedule({ id: parsed.id })
    const now = new Date().toISOString()

    if (parsed.linkedWorkRequestId) {
      const request = this.getWorkRequest(parsed.linkedWorkRequestId)
      if (request.archivedAt) {
        throw new Error('Cannot link a schedule to an archived Work Request.')
      }
    }

    const patch: Partial<typeof agentSchedules.$inferInsert> = { updatedAt: now }
    if (parsed.name !== undefined) patch.name = parsed.name
    if (parsed.prompt !== undefined) patch.prompt = parsed.prompt
    if (parsed.cron !== undefined) patch.cron = parsed.cron
    if (parsed.runAt !== undefined) patch.runAt = parsed.runAt
    if (parsed.timezone !== undefined) patch.timezone = parsed.timezone
    if (parsed.linkedWorkRequestId !== undefined)
      patch.linkedWorkRequestId = parsed.linkedWorkRequestId
    if (parsed.enabled !== undefined) {
      patch.enabled = parsed.enabled
      if (parsed.enabled) {
        patch.disableReason = null
        patch.consecutiveFailures = 0
      }
    }
    if (input.nextRunAt !== undefined) patch.nextRunAt = input.nextRunAt

    this.db.update(agentSchedules).set(patch).where(eq(agentSchedules.id, current.id)).run()
    return this.getAgentSchedule({ id: current.id })
  }

  setAgentScheduleEnabled(input: AgentScheduleSetEnabledInput): AgentSchedule {
    const parsed = AgentScheduleSetEnabledInputSchema.parse(input)
    return this.updateAgentSchedule({ id: parsed.id, enabled: parsed.enabled })
  }

  deleteAgentSchedule(input: AgentScheduleDeleteInput): { deletedScheduleId: string } {
    const parsed = AgentScheduleDeleteInputSchema.parse(input)
    const schedule = this.getAgentSchedule({ id: parsed.id })
    this.db.delete(agentSchedules).where(eq(agentSchedules.id, schedule.id)).run()
    return { deletedScheduleId: schedule.id }
  }

  recordAgentScheduleFire(input: {
    id: string
    firedAt: string
    runId: string | null
    linkedWorkRequestId: string | null
    nextRunAt: string | null
  }): void {
    const now = new Date().toISOString()
    const patch: Partial<typeof agentSchedules.$inferInsert> = {
      lastRunAt: input.firedAt,
      lastRunId: input.runId,
      nextRunAt: input.nextRunAt,
      updatedAt: now
    }
    if (input.linkedWorkRequestId) patch.linkedWorkRequestId = input.linkedWorkRequestId
    this.db.update(agentSchedules).set(patch).where(eq(agentSchedules.id, input.id)).run()
  }

  markAgentScheduleCompleted(scheduleId: string): void {
    const now = new Date().toISOString()
    this.db
      .update(agentSchedules)
      .set({ enabled: false, disableReason: 'completed', nextRunAt: null, updatedAt: now })
      .where(eq(agentSchedules.id, scheduleId))
      .run()
  }

  recordAgentScheduleOutcome(input: {
    id: string
    runId: string
    success: boolean
  }): AgentSchedule {
    const schedule = this.getAgentSchedule({ id: input.id })
    if (schedule.lastRunId !== input.runId) {
      return schedule
    }
    const now = new Date().toISOString()
    const patch: Partial<typeof agentSchedules.$inferInsert> = { updatedAt: now }
    if (input.success) {
      patch.consecutiveFailures = 0
      patch.lastRunStatus = 'succeeded'
    } else {
      const failures = schedule.consecutiveFailures + 1
      patch.consecutiveFailures = failures
      patch.lastRunStatus = 'failed'
      if (failures >= 5) {
        patch.enabled = false
        patch.disableReason = 'failures'
        patch.nextRunAt = null
      }
    }
    this.db.update(agentSchedules).set(patch).where(eq(agentSchedules.id, schedule.id)).run()
    return this.getAgentSchedule({ id: schedule.id })
  }

  createScheduleFireRun(scheduleId: string): { runId: string; requestId: string } {
    const schedule = this.getAgentSchedule({ id: scheduleId })
    const agent = this.requireActiveAgent(schedule.agentId)
    const workspace = this.getWorkspaceConfig()
    if (!workspace) {
      throw new Error('Choose a workspace before firing a schedule.')
    }

    let request: WorkRequest | null = null
    if (schedule.linkedWorkRequestId) {
      request = this.getWorkRequest(schedule.linkedWorkRequestId)
      if (request.archivedAt) {
        throw new Error('Linked Work Request is archived.')
      }
    }

    const now = new Date().toISOString()
    const runId = createWorkRunId()
    const requestId = request?.id ?? createWorkRequestId()
    const workingRoot = request?.workingRoot ?? createWorkboardWorkingRoot(schedule.name, requestId)
    ensureWorkspaceRelativeDirectory(workspace.workspaceRoot, workingRoot)

    this.db.transaction((tx) => {
      if (!request) {
        tx.insert(workRequests)
          .values({
            id: requestId,
            title: schedule.name,
            originalRequest: schedule.prompt,
            summary: '',
            workingRoot,
            status: 'active',
            createdAt: now,
            updatedAt: now,
            startedAt: null,
            completedAt: null
          })
          .run()
      }

      tx.insert(workRuns)
        .values({
          id: runId,
          rootRunId: runId,
          parentRunId: null,
          assignedAgentId: agent.id,
          assignedAgentName: agent.name,
          assignedAgentRole: agent.role,
          createdByType: 'system',
          createdByAgentId: null,
          sourceType: workRequestSourceType,
          sourceId: requestId,
          sourceItemId: null,
          title: schedule.name,
          instruction: schedule.prompt,
          status: 'queued',
          priority: 0,
          providerId: agent.providerId,
          model: agent.model,
          providerSessionRef: null,
          workingRoot,
          sandbox: agent.sandbox,
          expectedOutput: '',
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

      tx.insert(workRunEvents)
        .values({
          id: createWorkRunEventId(),
          runId,
          sequence: 1,
          kind: 'created',
          payload: JSON.stringify({
            workRequestId: requestId,
            assignedAgentId: agent.id,
            scheduleId: schedule.id
          }),
          createdAt: now
        })
        .run()
      tx.insert(workRunEvents)
        .values({
          id: createWorkRunEventId(),
          runId,
          sequence: 2,
          kind: 'queued',
          payload: JSON.stringify({}),
          createdAt: now
        })
        .run()
    })

    this.ensureWorkRequestAgentSessionsForRuns([runId])
    return { runId, requestId }
  }

  findScheduleByRunId(runId: string): AgentSchedule | null {
    const row = this.db
      .select()
      .from(agentSchedules)
      .where(eq(agentSchedules.lastRunId, runId))
      .get()
    return row ? AgentScheduleSchema.parse(row) : null
  }

  disableAgentSchedulesForArchivedRequest(requestId: string): string[] {
    const rows = this.db
      .select({ id: agentSchedules.id })
      .from(agentSchedules)
      .where(
        and(eq(agentSchedules.linkedWorkRequestId, requestId), eq(agentSchedules.enabled, true))
      )
      .all()
    if (rows.length === 0) return []
    const now = new Date().toISOString()
    this.db
      .update(agentSchedules)
      .set({
        enabled: false,
        disableReason: 'wr_archived',
        nextRunAt: null,
        updatedAt: now
      })
      .where(
        and(eq(agentSchedules.linkedWorkRequestId, requestId), eq(agentSchedules.enabled, true))
      )
      .run()
    return rows.map((row) => row.id)
  }

  getWorkboardData(): WorkboardData {
    const requests = this.listWorkRequests()
    const requestById = new Map(requests.map((request) => [request.id, request]))
    const avatarByAgentId = new Map(
      this.db
        .select({ id: agents.id, avatar: agents.avatar })
        .from(agents)
        .all()
        .map((agent) => [agent.id, agent.avatar ?? ''])
    )
    const workspace = this.getWorkspaceConfig()
    const runs = this.db
      .select()
      .from(workRuns)
      .where(eq(workRuns.sourceType, workRequestSourceType))
      .orderBy(desc(workRuns.updatedAt), desc(workRuns.createdAt))
      .all()
      .map((run) => {
        const parsedRun = parseWorkRun(run)
        const displayRun = workspace
          ? withExistingWorkspaceFileRefs(parsedRun, workspace.workspaceRoot)
          : parsedRun
        const requestId = parsedRun.source?.id ?? ''
        const request = requestById.get(requestId)

        return {
          ...displayRun,
          agentName: parsedRun.assignedAgentName.trim() || 'Former agent',
          agentRole: parsedRun.assignedAgentRole.trim() || 'Agent',
          agentAvatar: avatarByAgentId.get(parsedRun.assignedAgentId) ?? '',
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
    const contextReferences =
      runIds.length > 0
        ? this.db
            .select()
            .from(workRunContextReferences)
            .where(inArray(workRunContextReferences.runId, runIds))
            .orderBy(asc(workRunContextReferences.createdAt))
            .all()
            .map(parseWorkRunContextReference)
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
      contextReferences,
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

  private prepareWorkboardContextReferences(
    references: WorkboardContextReferenceInput[],
    workspaceRoot: string
  ): PreparedContextReference[] {
    const prepared: PreparedContextReference[] = []
    const seen = new Set<string>()

    references.forEach((reference) => {
      if (reference.kind === 'work_item') {
        const run = this.getWorkRun(reference.runId)
        const key = `work_item:${run.id}`
        if (!markContextReferenceSeen(seen, key)) return

        prepared.push({
          kind: 'work_item',
          refId: run.id,
          label: run.title,
          metadata: {
            requestId: getOptionalWorkRequestId(run),
            status: run.status,
            artifactRefs: run.artifactRefs,
            changedFiles: run.changedFiles
          },
          dependencyRun: shouldUseContextDependency(run) ? run : undefined,
          anchorRun: run
        })
        return
      }

      if (reference.kind === 'work_request') {
        const request = this.getWorkRequest(reference.requestId)
        const key = `work_request:${request.id}`
        if (!markContextReferenceSeen(seen, key)) return

        prepared.push({
          kind: 'work_request',
          refId: request.id,
          label: request.title,
          metadata: {
            status: request.status,
            summary: request.summary
          }
        })
        return
      }

      const absolutePath = resolveWorkspaceRelativePath(workspaceRoot, reference.path)
      if (!existsSync(absolutePath)) {
        throw new Error('Selected workspace path does not exist.')
      }

      const key = `workspace_path:${reference.path}`
      if (!markContextReferenceSeen(seen, key)) return

      prepared.push({
        kind: 'workspace_path',
        refId: reference.path,
        label: reference.path,
        metadata: {
          path: reference.path,
          isDirectory: statSync(absolutePath).isDirectory()
        }
      })
    })

    return prepared
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
    if (limit <= 0) {
      return []
    }

    const runningAgentIds = new Set(
      this.db
        .select({ agentId: workRuns.assignedAgentId })
        .from(workRuns)
        .where(
          and(
            eq(workRuns.sourceType, workRequestSourceType),
            eq(workRuns.sourceId, requestId),
            eq(workRuns.status, 'running')
          )
        )
        .all()
        .map((run) => run.agentId)
    )
    const selectedAgentIds = new Set<string>()
    const queuedRuns = this.db
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
      .all()
      .map(parseWorkRun)
    const queuedResumeRunIds = this.getQueuedResumeRunIds(queuedRuns.map((run) => run.id))

    return queuedRuns
      .sort((left, right) => {
        const leftResume = queuedResumeRunIds.has(left.id) ? 1 : 0
        const rightResume = queuedResumeRunIds.has(right.id) ? 1 : 0

        return (
          rightResume - leftResume ||
          right.priority - left.priority ||
          left.createdAt.localeCompare(right.createdAt)
        )
      })
      .filter((run) => {
        if (runningAgentIds.has(run.assignedAgentId) || selectedAgentIds.has(run.assignedAgentId)) {
          return false
        }

        selectedAgentIds.add(run.assignedAgentId)
        return true
      })
      .slice(0, limit)
  }

  prepareWorkRunProviderSession(runId: string): string | null {
    const run = this.getWorkRun(runId)
    const session = this.ensureWorkRequestAgentSessionForRun(run)
    if (!session) {
      return run.providerSessionRef
    }

    const providerSessionRef = this.getCompatibleProviderSessionRefForRun(run, session)
    const now = new Date().toISOString()
    this.db
      .update(workRequestAgentSessions)
      .set({
        providerId: run.providerId,
        model: run.model,
        providerSessionRef,
        status: 'active',
        lastRunId: run.id,
        updatedAt: now
      })
      .where(eq(workRequestAgentSessions.id, session.id))
      .run()

    if (run.providerSessionRef !== providerSessionRef) {
      this.db
        .update(workRuns)
        .set({
          providerSessionRef,
          updatedAt: now
        })
        .where(eq(workRuns.id, run.id))
        .run()
    }

    return providerSessionRef
  }

  getQueuedWorkRunResume(runId: string): QueuedWorkRunResume | null {
    const request = this.db
      .select({
        id: workRunInputRequests.id,
        resumeMessage: workRunInputRequests.resumeMessage
      })
      .from(workRunInputRequests)
      .where(
        and(
          eq(workRunInputRequests.runId, runId),
          eq(workRunInputRequests.status, 'queued_for_resume')
        )
      )
      .orderBy(desc(workRunInputRequests.updatedAt), desc(workRunInputRequests.createdAt))
      .get()

    if (!request) {
      return null
    }

    return {
      inputRequestId: request.id,
      message: request.resumeMessage
    }
  }

  resolveQueuedWorkRunResume(inputRequestId: string): void {
    const now = new Date().toISOString()
    this.db
      .update(workRunInputRequests)
      .set({
        status: 'resolved',
        updatedAt: now
      })
      .where(
        and(
          eq(workRunInputRequests.id, inputRequestId),
          eq(workRunInputRequests.status, 'queued_for_resume')
        )
      )
      .run()
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

  startWorkRun(input: WorkRunActionInput, eventPayload: Record<string, unknown> = {}): WorkRun {
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
    this.appendWorkRunEvent(run.id, 'started', eventPayload)
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
    this.recordWorkRunProviderSession(run.id, parsed.providerSessionRef ?? run.providerSessionRef)
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
          resumeMessage: '',
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
    this.recordWorkRunProviderSession(run.id, input.providerSessionRef)
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
    const shouldQueueResume = this.hasRunningWorkRunForRequestAgent(run)

    if (shouldQueueResume) {
      this.db.transaction((tx) => {
        tx.update(workRunInputRequests)
          .set({
            status: 'queued_for_resume',
            answers: JSON.stringify(answers),
            resumeMessage: message,
            updatedAt: now
          })
          .where(eq(workRunInputRequests.id, request.id))
          .run()
        tx.update(workRuns)
          .set({
            status: 'queued',
            updatedAt: now
          })
          .where(eq(workRuns.id, run.id))
          .run()
        tx.insert(workRunEvents)
          .values({
            id: createWorkRunEventId(),
            runId: run.id,
            sequence: this.getNextWorkRunEventSequence(run.id),
            kind: 'queued',
            payload: JSON.stringify({
              resumedFromInputRequestId: request.id,
              reason: 'agent_session_busy'
            }),
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

    this.db.transaction((tx) => {
      tx.update(workRunInputRequests)
        .set({
          status: 'resolved',
          answers: JSON.stringify(answers),
          resumeMessage: message,
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
          and(
            eq(workRunInputRequests.runId, run.id),
            inArray(workRunInputRequests.status, ['pending', 'queued_for_resume'])
          )
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

  upsertObservedRun(input: ObservedRunUpsertInput): ObservedRunInternal {
    const now = new Date().toISOString()
    const existing = this.db
      .select()
      .from(observedRuns)
      .where(
        and(
          eq(observedRuns.sourceSurface, input.sourceSurface),
          eq(observedRuns.sourceItemId, input.sourceItemId)
        )
      )
      .get()
    const row = {
      sourceSurface: input.sourceSurface,
      sourceItemId: input.sourceItemId,
      sourceItemTitle: input.sourceItemTitle,
      assignedAgentId: input.assignedAgentId,
      assignedAgentName: input.assignedAgentName,
      assignedAgentRole: input.assignedAgentRole,
      providerId: input.providerId,
      model: input.model,
      lifecycleStatus: input.lifecycleStatus,
      livenessHealth: input.livenessHealth,
      currentPhase: input.currentPhase,
      latestActivity: input.latestActivity,
      latestActivityAt: input.latestActivityAt ?? null,
      queuedAt: input.queuedAt ?? null,
      startedAt: input.startedAt ?? null,
      firstActivityAt: input.firstActivityAt ?? null,
      lastActivityAt: input.lastActivityAt ?? null,
      completedAt: input.completedAt ?? null,
      inputTokens: input.inputTokens ?? null,
      outputTokens: input.outputTokens ?? null,
      totalTokens: input.totalTokens ?? null,
      usageSource: input.usageSource ?? 'unavailable',
      sanitizedInvocation: JSON.stringify(input.sanitizedInvocation ?? {}),
      logRef: input.logRef,
      updatedAt: now
    }

    if (existing) {
      this.db.update(observedRuns).set(row).where(eq(observedRuns.id, existing.id)).run()
      return this.getObservedRunInternal(existing.id)
    }

    const id = createObservedRunId()
    this.db
      .insert(observedRuns)
      .values({
        id,
        ...row,
        createdAt: now
      })
      .run()

    return this.getObservedRunInternal(id)
  }

  patchObservedRun(input: ObservedRunPatchInput): ObservedRunInternal {
    this.getObservedRunInternal(input.id)
    const row: Partial<typeof observedRuns.$inferInsert> = {
      updatedAt: new Date().toISOString()
    }

    if (input.lifecycleStatus !== undefined) row.lifecycleStatus = input.lifecycleStatus
    if (input.livenessHealth !== undefined) row.livenessHealth = input.livenessHealth
    if (input.currentPhase !== undefined) row.currentPhase = input.currentPhase
    if (input.latestActivity !== undefined) row.latestActivity = input.latestActivity
    if (input.latestActivityAt !== undefined) row.latestActivityAt = input.latestActivityAt
    if (input.firstActivityAt !== undefined) row.firstActivityAt = input.firstActivityAt
    if (input.lastActivityAt !== undefined) row.lastActivityAt = input.lastActivityAt
    if (input.completedAt !== undefined) row.completedAt = input.completedAt
    if (input.inputTokens !== undefined) row.inputTokens = input.inputTokens
    if (input.outputTokens !== undefined) row.outputTokens = input.outputTokens
    if (input.totalTokens !== undefined) row.totalTokens = input.totalTokens
    if (input.usageSource !== undefined) row.usageSource = input.usageSource
    if (input.sanitizedInvocation !== undefined) {
      row.sanitizedInvocation = JSON.stringify(input.sanitizedInvocation)
    }

    this.db.update(observedRuns).set(row).where(eq(observedRuns.id, input.id)).run()

    return this.getObservedRunInternal(input.id)
  }

  appendObservedRunEvent(input: ObservedRunEventCreateInput): ObservedRunEvent {
    this.getObservedRunInternal(input.observedRunId)
    const latestEvent = this.db
      .select({ sequence: observedRunEvents.sequence })
      .from(observedRunEvents)
      .where(eq(observedRunEvents.observedRunId, input.observedRunId))
      .orderBy(desc(observedRunEvents.sequence))
      .get()
    const now = new Date().toISOString()
    const eventId = createObservedRunEventId()
    const sequence = (latestEvent?.sequence ?? 0) + 1

    this.db
      .insert(observedRunEvents)
      .values({
        id: eventId,
        observedRunId: input.observedRunId,
        sequence,
        timestamp: now,
        kind: input.kind,
        source: input.source,
        confidence: input.confidence,
        phase: input.phase ?? null,
        lifecycleStatus: input.lifecycleStatus ?? null,
        summary: input.summary,
        payload: JSON.stringify(input.payload ?? {}),
        createdAt: now
      })
      .run()

    return ObservedRunEventSchema.parse({
      id: eventId,
      observedRunId: input.observedRunId,
      sequence,
      timestamp: now,
      kind: input.kind,
      source: input.source,
      confidence: input.confidence,
      phase: input.phase ?? null,
      lifecycleStatus: input.lifecycleStatus ?? null,
      summary: input.summary,
      payload: input.payload ?? {}
    })
  }

  listWorkboardObservedRuns(): ObservedRunSnapshot[] {
    return this.db
      .select()
      .from(observedRuns)
      .where(eq(observedRuns.sourceSurface, 'workboard'))
      .orderBy(desc(observedRuns.updatedAt))
      .all()
      .map(parseObservedRunSnapshot)
  }

  listConversationObservedRuns(conversationId: string): ObservedRunSnapshot[] {
    this.getConversation({ conversationId })
    const turnIds = this.db
      .select({ id: conversationTurns.id })
      .from(conversationTurns)
      .where(eq(conversationTurns.conversationId, conversationId))
      .all()
      .map((turn) => turn.id)

    if (turnIds.length === 0) {
      return []
    }

    return this.db
      .select()
      .from(observedRuns)
      .where(
        and(
          eq(observedRuns.sourceSurface, 'conversation'),
          inArray(observedRuns.sourceItemId, turnIds)
        )
      )
      .orderBy(desc(observedRuns.updatedAt))
      .all()
      .map(parseObservedRunSnapshot)
  }

  getObservedRunBySource(
    sourceSurface: ObservedRunSourceSurface,
    sourceItemId: string
  ): ObservedRunSnapshot | null {
    const run = this.db
      .select()
      .from(observedRuns)
      .where(
        and(
          eq(observedRuns.sourceSurface, sourceSurface),
          eq(observedRuns.sourceItemId, sourceItemId)
        )
      )
      .get()

    return run ? parseObservedRunSnapshot(run) : null
  }

  listObservedRunEvents(observedRunId: string): ObservedRunEvent[] {
    this.getObservedRunInternal(observedRunId)

    return this.db
      .select()
      .from(observedRunEvents)
      .where(eq(observedRunEvents.observedRunId, observedRunId))
      .orderBy(asc(observedRunEvents.sequence))
      .all()
      .map(parseObservedRunEvent)
  }

  getObservedRunInternal(observedRunId: string): ObservedRunInternal {
    const run = this.db.select().from(observedRuns).where(eq(observedRuns.id, observedRunId)).get()

    if (!run) {
      throw new Error('Observed run was not found.')
    }

    return parseObservedRunInternal(run)
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
      .map(parseConversationTurn)
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
    const workspace = this.getWorkspaceConfig()
    if (!workspace) {
      throw new Error('Choose a workspace before creating a conversation.')
    }

    const now = new Date().toISOString()
    const conversationId = createConversationId()
    const participantId = createConversationParticipantId()
    const title = parsed.title?.trim() || agent.name
    const workingRoot = createConversationWorkingRoot(title, conversationId)
    ensureWorkspaceRelativeDirectory(workspace.workspaceRoot, workingRoot)

    this.db
      .insert(conversations)
      .values({
        id: conversationId,
        title,
        workingRoot,
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
    const workspace = this.getWorkspaceConfig()
    if (!workspace) {
      throw new Error('Choose a workspace before creating a conversation.')
    }

    if (agentIds.length < 2) {
      throw new Error('Choose at least two agents for a multi-agent conversation.')
    }

    const selectedAgents = agentIds.map((agentId) => this.requireActiveAgent(agentId))
    const now = new Date().toISOString()
    const conversationId = createConversationId()
    const title =
      parsed.title?.trim() ||
      formatConversationAgentNames(selectedAgents.map((agent) => agent.name))
    const workingRoot = createConversationWorkingRoot(title, conversationId)
    ensureWorkspaceRelativeDirectory(workspace.workspaceRoot, workingRoot)

    this.db.transaction((tx) => {
      tx.insert(conversations)
        .values({
          id: conversationId,
          title,
          workingRoot,
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

  updateConversationTitle(input: ConversationUpdateTitleInput): ConversationDetail {
    const parsed = ConversationUpdateTitleInputSchema.parse(input)
    const now = new Date().toISOString()

    this.getConversation({ conversationId: parsed.conversationId })

    this.db
      .update(conversations)
      .set({
        title: parsed.title,
        updatedAt: now
      })
      .where(eq(conversations.id, parsed.conversationId))
      .run()

    return this.getConversation({ conversationId: parsed.conversationId })
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

    const agentTurns = targetParticipants.map((participant, index) => {
      const agent = targetAgents[index]

      return {
        conversationId: detail.id,
        participantId: participant.id,
        agentTurnId: createConversationTurnId(),
        agent,
        providerSessionRef:
          participant.providerId === agent.providerId ? participant.providerSessionRef : null,
        message: buildAssignedConversationMessage(userMessage, assignments[index].instruction)
      }
    })

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

      targetParticipants.forEach((participant) => {
        tx.update(conversationParticipants)
          .set({
            status: 'running',
            updatedAt: now
          })
          .where(eq(conversationParticipants.id, participant.id))
          .run()
      })
    })

    return {
      conversationId: detail.id,
      agentTurns
    }
  }

  completeConversationTurn(input: {
    turnId: string
    providerId: Agent['providerId']
    model: string
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
            providerId: input.providerId,
            model: input.model,
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
    const artifactRefs = uniqueValues(input.outcome.artifactRefs)
    const changedFiles = uniqueValues(input.outcome.changedFiles)

    this.db
      .update(conversationTurns)
      .set({
        content: output.content,
        preview: output.preview,
        status: 'completed',
        error: '',
        logRef: input.logRef,
        artifactRefs: JSON.stringify(artifactRefs),
        changedFiles: JSON.stringify(changedFiles),
        truncated: output.truncated,
        updatedAt: now
      })
      .where(eq(conversationTurns.id, input.turnId))
      .run()
    this.db
      .update(conversationParticipants)
      .set({
        providerId: input.providerId,
        model: input.model,
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
    const providerSessionRef =
      participant.providerId === agent.providerId ? participant.providerSessionRef : null

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
          providerSessionRef,
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

  deleteConversation(input: ConversationDeleteInput): ConversationDeleteDatabaseResult {
    const parsed = ConversationDeleteInputSchema.parse(input)
    const detail = this.getConversation({ conversationId: parsed.conversationId })

    if (detail.status === 'running' || detail.turns.some((turn) => turn.status === 'running')) {
      throw new Error('Stop this conversation before deleting it.')
    }

    return this.db.transaction((tx) => {
      const deletedTurns = tx
        .select({
          id: conversationTurns.id,
          logRef: conversationTurns.logRef
        })
        .from(conversationTurns)
        .where(eq(conversationTurns.conversationId, detail.id))
        .all()
      const deletedLogRefs = uniqueValues(
        deletedTurns.map((turn) => turn.logRef).filter((logRef) => logRef.trim())
      )

      tx.delete(conversationInputRequests)
        .where(eq(conversationInputRequests.conversationId, detail.id))
        .run()
      tx.delete(conversationTurns).where(eq(conversationTurns.conversationId, detail.id)).run()
      tx.delete(conversationParticipants)
        .where(eq(conversationParticipants.conversationId, detail.id))
        .run()
      tx.delete(conversations).where(eq(conversations.id, detail.id)).run()

      return {
        ...ConversationDeleteResultSchema.parse({
          deletedConversationId: detail.id,
          deletedTurnCount: deletedTurns.length,
          trashedWorkspaceFolder: false,
          workspaceFolderMissing: false
        }),
        deletedLogRefs
      }
    })
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

  private hasDuplicateAgentName(name: string, currentAgentId: string): boolean {
    const normalizedName = normalizeAgentName(name)

    return this.db
      .select({ name: agents.name })
      .from(agents)
      .where(ne(agents.id, currentAgentId))
      .all()
      .some((agent) => normalizeAgentName(agent.name) === normalizedName)
  }

  getConversationTurn(id: string): ConversationTurn {
    const turn = this.db.select().from(conversationTurns).where(eq(conversationTurns.id, id)).get()

    if (!turn) {
      throw new Error('Conversation turn was not found.')
    }

    return parseConversationTurn(turn)
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

  private getQueuedResumeRunIds(runIds: string[]): Set<string> {
    if (runIds.length === 0) {
      return new Set()
    }

    return new Set(
      this.db
        .select({ runId: workRunInputRequests.runId })
        .from(workRunInputRequests)
        .where(
          and(
            inArray(workRunInputRequests.runId, runIds),
            eq(workRunInputRequests.status, 'queued_for_resume')
          )
        )
        .all()
        .map((request) => request.runId)
    )
  }

  private ensureWorkRequestAgentSessionsForRuns(runIds: string[]): void {
    uniqueValues(runIds).forEach((runId) => {
      this.ensureWorkRequestAgentSessionForRun(this.getWorkRun(runId))
    })
  }

  private ensureWorkRequestAgentSessionForRun(run: WorkRun): WorkRequestAgentSession | null {
    const requestId = run.source?.type === workRequestSourceType ? run.source.id : ''
    if (!requestId) {
      return null
    }

    const existing = this.db
      .select()
      .from(workRequestAgentSessions)
      .where(
        and(
          eq(workRequestAgentSessions.requestId, requestId),
          eq(workRequestAgentSessions.agentId, run.assignedAgentId)
        )
      )
      .get()
    if (existing) {
      return existing
    }

    const now = new Date().toISOString()
    const providerSessionRef =
      run.providerSessionRef ??
      this.getLatestProviderSessionRefForRequestAgent(
        requestId,
        run.assignedAgentId,
        run.providerId,
        run.id
      )
    const session: WorkRequestAgentSession = {
      id: createWorkRequestAgentSessionId(),
      requestId,
      agentId: run.assignedAgentId,
      providerId: run.providerId,
      model: run.model,
      providerSessionRef,
      status: 'active',
      lastRunId: null,
      createdAt: now,
      updatedAt: now
    }

    this.db.insert(workRequestAgentSessions).values(session).run()

    return session
  }

  private getCompatibleProviderSessionRefForRun(
    run: WorkRun,
    session: WorkRequestAgentSession
  ): string | null {
    const requestId = run.source?.type === workRequestSourceType ? run.source.id : ''
    const sessionRef =
      session.providerId === run.providerId
        ? session.providerSessionRef || run.providerSessionRef
        : null

    if (sessionRef) {
      return sessionRef
    }

    if (!requestId) {
      return null
    }

    return this.getLatestProviderSessionRefForRequestAgent(
      requestId,
      run.assignedAgentId,
      run.providerId,
      run.id
    )
  }

  private getLatestProviderSessionRefForRequestAgent(
    requestId: string,
    agentId: string,
    providerId: WorkRun['providerId'],
    excludeRunId?: string
  ): string | null {
    return (
      this.db
        .select({ providerSessionRef: workRuns.providerSessionRef })
        .from(workRuns)
        .where(
          and(
            eq(workRuns.sourceType, workRequestSourceType),
            eq(workRuns.sourceId, requestId),
            eq(workRuns.assignedAgentId, agentId),
            eq(workRuns.providerId, providerId),
            excludeRunId ? ne(workRuns.id, excludeRunId) : undefined
          )
        )
        .orderBy(desc(workRuns.updatedAt), desc(workRuns.createdAt))
        .all()
        .find((run) => Boolean(run.providerSessionRef))?.providerSessionRef ?? null
    )
  }

  private recordWorkRunProviderSession(
    runId: string,
    providerSessionRef: string | null | undefined
  ): void {
    if (!providerSessionRef) {
      return
    }

    const run = this.getWorkRun(runId)
    const session = this.ensureWorkRequestAgentSessionForRun(run)
    if (!session) {
      return
    }

    this.db
      .update(workRequestAgentSessions)
      .set({
        providerId: run.providerId,
        model: run.model,
        providerSessionRef,
        status: 'active',
        lastRunId: run.id,
        updatedAt: new Date().toISOString()
      })
      .where(eq(workRequestAgentSessions.id, session.id))
      .run()
  }

  private hasRunningWorkRunForRequestAgent(run: WorkRun): boolean {
    const requestId = run.source?.type === workRequestSourceType ? run.source.id : ''
    if (!requestId) {
      return false
    }

    return Boolean(
      this.db
        .select({ id: workRuns.id })
        .from(workRuns)
        .where(
          and(
            eq(workRuns.sourceType, workRequestSourceType),
            eq(workRuns.sourceId, requestId),
            eq(workRuns.assignedAgentId, run.assignedAgentId),
            eq(workRuns.status, 'running'),
            ne(workRuns.id, run.id)
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

function createWorkRequestAgentSessionId(): string {
  return `wrs-${randomUUID()}`
}

function createWorkRunDependencyId(): string {
  return `wrd-${randomUUID()}`
}

function createWorkRunContextReferenceId(): string {
  return `wcr-${randomUUID()}`
}

function createWorkRunEventId(): string {
  return `wre-${randomUUID()}`
}

function createWorkRunInputRequestId(): string {
  return `wir-${randomUUID()}`
}

function createObservedRunId(): string {
  return `obs-${randomUUID()}`
}

function createObservedRunEventId(): string {
  return `obe-${randomUUID()}`
}

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values))
}

function cleanAgentName(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

function normalizeAgentName(name: string): string {
  return cleanAgentName(name).toLocaleLowerCase()
}

function parseConversationTurn(value: unknown): ConversationTurn {
  if (!isDatabaseConversationTurn(value)) {
    throw new Error('Conversation turn row was invalid.')
  }

  return ConversationTurnSchema.parse({
    ...value,
    artifactRefs: parseJsonStringArray(value.artifactRefs),
    changedFiles: parseJsonStringArray(value.changedFiles)
  })
}

function isDatabaseConversationTurn(value: unknown): value is {
  artifactRefs: string
  changedFiles: string
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    'artifactRefs' in value &&
    'changedFiles' in value
  )
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

function parseWorkRunContextReference(value: unknown): WorkRunContextReference {
  if (!isDatabaseWorkRunContextReference(value)) {
    throw new Error('Work run context reference row was invalid.')
  }

  return WorkRunContextReferenceSchema.parse({
    ...value,
    metadata: parseJsonObject(value.metadata)
  })
}

function isDatabaseWorkRunContextReference(value: unknown): value is { metadata: string } {
  return typeof value === 'object' && value !== null && 'metadata' in value
}

function markContextReferenceSeen(seen: Set<string>, key: string): boolean {
  if (seen.has(key)) return false
  seen.add(key)
  return true
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
    answers: value.answers ? parseJsonArray(value.answers) : null,
    resumeMessage: typeof value.resumeMessage === 'string' ? value.resumeMessage : ''
  })
}

function isDatabaseWorkRunInputRequest(value: unknown): value is {
  questions: string
  answers: string | null
  resumeMessage?: string
} {
  return typeof value === 'object' && value !== null && 'questions' in value && 'answers' in value
}

function isDatabaseWorkRunEvent(value: unknown): value is {
  payload: string
} {
  return typeof value === 'object' && value !== null && 'payload' in value
}

function parseObservedRunSnapshot(value: unknown): ObservedRunSnapshot {
  return ObservedRunSnapshotSchema.parse({
    ...parseObservedRunBase(value),
    elapsedMs: calculateObservedElapsedMs(value),
    idleMs: calculateObservedIdleMs(value)
  })
}

function parseObservedRunInternal(value: unknown): ObservedRunInternal {
  if (!isDatabaseObservedRun(value)) {
    throw new Error('Observed run row was invalid.')
  }

  return {
    ...parseObservedRunSnapshot(value),
    logRef: value.logRef,
    sanitizedInvocation: parseJsonObjectSafe(value.sanitizedInvocation)
  }
}

function parseObservedRunBase(value: unknown): Record<string, unknown> {
  if (!isDatabaseObservedRun(value)) {
    throw new Error('Observed run row was invalid.')
  }

  return {
    id: value.id,
    sourceSurface: value.sourceSurface,
    sourceItemId: value.sourceItemId,
    sourceItemTitle: value.sourceItemTitle,
    assignedAgentId: value.assignedAgentId,
    assignedAgentName: value.assignedAgentName,
    assignedAgentRole: value.assignedAgentRole,
    providerId: value.providerId,
    model: value.model,
    lifecycleStatus: value.lifecycleStatus,
    livenessHealth: value.livenessHealth,
    currentPhase: value.currentPhase,
    latestActivity: value.latestActivity,
    latestActivityAt: value.latestActivityAt,
    queuedAt: value.queuedAt,
    startedAt: value.startedAt,
    firstActivityAt: value.firstActivityAt,
    lastActivityAt: value.lastActivityAt,
    completedAt: value.completedAt,
    inputTokens: value.inputTokens,
    outputTokens: value.outputTokens,
    totalTokens: value.totalTokens,
    usageSource: value.usageSource,
    updatedAt: value.updatedAt
  }
}

function isDatabaseObservedRun(value: unknown): value is {
  id: string
  sourceSurface: string
  sourceItemId: string
  sourceItemTitle: string
  assignedAgentId: string
  assignedAgentName: string
  assignedAgentRole: string
  providerId: string
  model: string
  lifecycleStatus: string
  livenessHealth: string
  currentPhase: string
  latestActivity: string
  latestActivityAt: string | null
  queuedAt: string | null
  startedAt: string | null
  firstActivityAt: string | null
  lastActivityAt: string | null
  completedAt: string | null
  inputTokens: number | null
  outputTokens: number | null
  totalTokens: number | null
  usageSource: string
  sanitizedInvocation: string
  logRef: string
  updatedAt: string
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'sourceSurface' in value &&
    'sourceItemId' in value &&
    'sanitizedInvocation' in value &&
    'logRef' in value
  )
}

function parseObservedRunEvent(value: unknown): ObservedRunEvent {
  if (!isDatabaseObservedRunEvent(value)) {
    throw new Error('Observed run event row was invalid.')
  }

  return ObservedRunEventSchema.parse({
    id: value.id,
    observedRunId: value.observedRunId,
    sequence: value.sequence,
    timestamp: value.timestamp,
    kind: value.kind,
    source: value.source,
    confidence: value.confidence,
    phase: value.phase,
    lifecycleStatus: value.lifecycleStatus,
    summary: value.summary,
    payload: parseJsonObjectSafe(value.payload)
  })
}

function isDatabaseObservedRunEvent(value: unknown): value is {
  id: string
  observedRunId: string
  sequence: number
  timestamp: string
  kind: string
  source: string
  confidence: string
  phase: string | null
  lifecycleStatus: string | null
  summary: string
  payload: string
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'observedRunId' in value &&
    'payload' in value
  )
}

function calculateObservedElapsedMs(value: unknown): number {
  if (!isDatabaseObservedRun(value)) {
    return 0
  }

  const start = Date.parse(value.startedAt ?? value.queuedAt ?? value.updatedAt)
  if (Number.isNaN(start)) {
    return 0
  }

  const end = getObservedEndTime(value)

  return Math.max(0, end - start)
}

function calculateObservedIdleMs(value: unknown): number | null {
  if (!isDatabaseObservedRun(value) || !value.lastActivityAt) {
    return null
  }

  const lastActivity = Date.parse(value.lastActivityAt)
  if (Number.isNaN(lastActivity)) {
    return null
  }

  const end = getObservedEndTime(value)

  return Math.max(0, end - lastActivity)
}

function getObservedEndTime(value: { completedAt: string | null }): number {
  const completedAt = value.completedAt ? Date.parse(value.completedAt) : Number.NaN
  return Number.isNaN(completedAt) ? Date.now() : completedAt
}

function isTerminalWorkRunStatus(status: WorkRun['status']): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}

function isCompletableWorkRunStatus(status: WorkRun['status']): boolean {
  return status === 'running' || status === 'waiting_for_user'
}

function isWorkRunInRequest(run: WorkRun, requestId: string): boolean {
  return run.source?.type === workRequestSourceType && run.source.id === requestId
}

function getOptionalWorkRequestId(run: WorkRun): string {
  return run.source?.type === workRequestSourceType ? run.source.id : ''
}

function shouldUseAnchorDependency(anchorRun: WorkRun | null, dependsOnTempIds: string[]): boolean {
  if (!anchorRun || dependsOnTempIds.length > 0) {
    return false
  }

  return !isTerminalWorkRunStatus(anchorRun.status) || hasCompletedWorkRunOutput(anchorRun)
}

function shouldUseContextDependency(run: WorkRun): boolean {
  if (run.status === 'failed' || run.status === 'cancelled') {
    return false
  }

  return !isTerminalWorkRunStatus(run.status) || hasCompletedWorkRunOutput(run)
}

function getContinuationProviderSessionRef(
  parentRun: WorkRun | null,
  agent: Agent,
  requiredRunIds: string[]
): string | null {
  if (
    parentRun &&
    parentRun.assignedAgentId === agent.id &&
    parentRun.providerId === agent.providerId &&
    requiredRunIds.includes(parentRun.id)
  ) {
    return parentRun.providerSessionRef
  }

  return null
}

function getSatisfiedRequiredRunIds(requiredRuns: WorkRun[]): Set<string> {
  return new Set(requiredRuns.filter(hasCompletedWorkRunOutput).map((run) => run.id))
}

function hasCompletedWorkRunOutput(run: WorkRun): boolean {
  return run.status === 'completed' && Boolean(run.resultSummary.trim())
}

function withExistingWorkspaceFileRefs(run: WorkRun, workspaceRoot: string): WorkRun {
  return {
    ...run,
    artifactRefs: filterExistingWorkspacePaths(workspaceRoot, run.artifactRefs),
    changedFiles: filterExistingWorkspacePaths(workspaceRoot, run.changedFiles)
  }
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

function parseJsonObjectSafe(value: string): Record<string, unknown> {
  try {
    return parseJsonObject(value)
  } catch {
    return {}
  }
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
