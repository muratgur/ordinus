import Database from 'better-sqlite3'
import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, realpathSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
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
  workspaceConfig
} from './schema'

const turnContentLimit = 16_000
const turnPreviewLimit = 240

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
    const agentParticipants = this.db
      .select({ id: conversationParticipants.id })
      .from(conversationParticipants)
      .where(eq(conversationParticipants.agentId, agent.id))
      .all()
    const participantIds = agentParticipants.map((participant) => participant.id)

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

  private getNextConversationTurnSequence(conversationId: string): number {
    const latestTurn = this.db
      .select({ sequence: conversationTurns.sequence })
      .from(conversationTurns)
      .where(eq(conversationTurns.conversationId, conversationId))
      .orderBy(desc(conversationTurns.sequence))
      .get()

    return (latestTurn?.sequence ?? 0) + 1
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

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values))
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
