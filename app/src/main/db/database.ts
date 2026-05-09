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
  ConversationCreateDirectInputSchema,
  ConversationCreateManualInputSchema,
  ConversationDetailSchema,
  ConversationGetInputSchema,
  ConversationListItemSchema,
  ConversationSendTurnInputSchema,
  ConversationTurnSchema,
  DbStatusSchema,
  WorkspaceConfigSchema,
  WorkspaceUpdateSystemDefaultInputSchema,
  type Agent,
  type AgentCreateInput,
  type AgentDeleteInput,
  type AgentDeleteResult,
  type AgentUpdateInstructionsInput,
  type AgentUpdateSettingsInput,
  type ConversationCreateManualInput,
  type ConversationDetail,
  type ConversationListItem,
  type ConversationSendTurnInput,
  type ConversationTurn,
  type DbStatus,
  type WorkspaceConfig,
  type WorkspaceSaveConfigInput,
  type WorkspaceUpdateSystemDefaultInput
} from '@shared/contracts'
import { getSystemPaths } from '../paths'
import { databaseSchemaVersion, getMigrationsFolder } from './migrations'
import {
  agents,
  appMeta,
  conversationParticipants,
  conversations,
  conversationTurns,
  workspaceConfig
} from './schema'

const turnContentLimit = 16_000
const turnPreviewLimit = 240

export type PreparedConversationTurn = {
  conversationId: string
  participantId: string
  agentTurnId: string
  agent: Agent
  providerSessionRef: string | null
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
            eq(conversationTurns.status, 'running')
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

    return ConversationDetailSchema.parse({
      ...conversation,
      participants,
      turns
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

  prepareConversationTurn(input: ConversationSendTurnInput): PreparedConversationTurn {
    const parsed = ConversationSendTurnInputSchema.parse(input)
    const detail = this.getConversation({ conversationId: parsed.conversationId })

    if (detail.turns.some((turn) => turn.status === 'running')) {
      throw new Error('Wait for the current turn to finish before sending another message.')
    }

    const participant =
      detail.mode === 'direct'
        ? detail.participants[0]
        : detail.participants.find((item) => item.id === parsed.targetParticipantId)

    if (!participant) {
      throw new Error('Mention an agent in this conversation before sending.')
    }

    const agent = this.requireActiveAgent(participant.agentId)

    const now = new Date().toISOString()
    const userTurn = createBoundedTurnContent(parsed.message)
    const userTurnId = createConversationTurnId()
    const agentTurnId = createConversationTurnId()
    const nextSequence = this.getNextConversationTurnSequence(detail.id)

    this.db
      .insert(conversationTurns)
      .values({
        id: userTurnId,
        conversationId: detail.id,
        participantId: participant.id,
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
    this.db
      .insert(conversationTurns)
      .values({
        id: agentTurnId,
        conversationId: detail.id,
        participantId: participant.id,
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

    this.setConversationRunState(detail.id, participant.id, 'running', now)

    return {
      conversationId: detail.id,
      participantId: participant.id,
      agentTurnId,
      agent,
      providerSessionRef: participant.providerSessionRef
    }
  }

  completeConversationTurn(input: {
    turnId: string
    providerSessionRef: string
    responseText: string
    logRef: string
  }): ConversationDetail {
    const turn = this.getConversationTurn(input.turnId)
    if (turn.status === 'cancelled') {
      return this.getConversation({ conversationId: turn.conversationId })
    }

    const now = new Date().toISOString()
    const output = createBoundedTurnContent(input.responseText)

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
        status: 'active',
        summary: output.preview,
        updatedAt: now
      })
      .where(eq(conversations.id, turn.conversationId))
      .run()

    return this.getConversation({ conversationId: turn.conversationId })
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
        status: 'failed',
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
        status: 'cancelled',
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

  private getNextConversationTurnSequence(conversationId: string): number {
    const latestTurn = this.db
      .select({ sequence: conversationTurns.sequence })
      .from(conversationTurns)
      .where(eq(conversationTurns.conversationId, conversationId))
      .orderBy(desc(conversationTurns.sequence))
      .get()

    return (latestTurn?.sequence ?? 0) + 1
  }

  private setConversationRunState(
    conversationId: string,
    participantId: string,
    status: 'running',
    updatedAt: string
  ): void {
    this.db
      .update(conversations)
      .set({
        status,
        updatedAt
      })
      .where(eq(conversations.id, conversationId))
      .run()
    this.db
      .update(conversationParticipants)
      .set({
        status,
        updatedAt
      })
      .where(eq(conversationParticipants.id, participantId))
      .run()
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

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values))
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
