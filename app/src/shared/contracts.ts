import { z } from 'zod'

export const AppInfoSchema = z.object({
  name: z.literal('Ordinus'),
  version: z.string(),
  platform: z.string(),
  arch: z.string(),
  isPackaged: z.boolean()
})

export const SystemPathsSchema = z.object({
  userData: z.string(),
  database: z.string(),
  runtime: z.string(),
  logs: z.string()
})

export const DbStatusSchema = z.object({
  databasePath: z.string(),
  exists: z.boolean(),
  initialized: z.boolean(),
  schemaVersion: z.number().int().nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable()
})

export const ProviderIdSchema = z.enum(['codex', 'claude', 'gemini'])

export const WorkspaceConfigSchema = z.object({
  workspaceRoot: z.string(),
  workspaceName: z.string(),
  defaultProviderId: ProviderIdSchema.default('codex'),
  defaultModel: z.string().trim().min(1).default('default'),
  createdAt: z.string(),
  updatedAt: z.string()
})

export const WorkspaceSaveConfigInputSchema = z.object({
  workspaceRoot: z.string().trim().min(1, 'Workspace folder is required.'),
  workspaceName: z.string().trim().min(1, 'Project name is required.').max(80)
})

export const WorkspaceSelectFolderResultSchema = z.object({
  cancelled: z.boolean(),
  workspaceRoot: z.string(),
  workspaceName: z.string()
})

export const AgentSandboxSchema = z.enum(['read-only', 'workspace-write', 'full-access'])
export const ProviderLoginMethodSchema = z.enum(['default', 'claudeai', 'console', 'sso'])

export const WorkspaceUpdateSystemDefaultInputSchema = z.object({
  providerId: ProviderIdSchema,
  model: z.string().trim().min(1, 'Model is required.').max(120)
})

export const ProviderStatusSchema = z.object({
  id: ProviderIdSchema,
  label: z.string(),
  installed: z.boolean(),
  connected: z.boolean(),
  version: z.string().nullable(),
  accountLabel: z.string(),
  authUrl: z.string(),
  loginInProgress: z.boolean(),
  lastError: z.string(),
  note: z.string()
})

export const ProviderActionInputSchema = z.object({
  providerId: ProviderIdSchema
})

export const ProviderConnectInputSchema = ProviderActionInputSchema.extend({
  loginMethod: ProviderLoginMethodSchema.default('default')
})

export const ProviderConnectResultSchema = z.object({
  status: ProviderStatusSchema,
  authUrl: z.string(),
  alreadyConnected: z.boolean().optional(),
  alreadyStarted: z.boolean().optional()
})

export const SetupStatusSchema = z.object({
  ready: z.boolean(),
  workspaceConfigured: z.boolean(),
  workspace: WorkspaceConfigSchema.nullable(),
  providers: z.array(ProviderStatusSchema)
})

export const AgentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.string().min(1),
  requestedWork: z.string().min(1),
  instructions: z.string().min(1),
  providerId: ProviderIdSchema,
  model: z.string().min(1),
  sandbox: AgentSandboxSchema,
  workspaceRoot: z.string().min(1),
  enabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string()
})

export const AgentDraftFromIntentInputSchema = z.object({
  requestedWork: z.string().trim().min(12, 'Describe what the agent should help with.'),
  sandbox: AgentSandboxSchema.default('workspace-write'),
  workspaceRoot: z.string().trim().min(1).optional()
})

export const AgentDraftSchema = z.object({
  requestedWork: z.string().min(1),
  name: z.string().min(1).max(80),
  role: z.string().min(1).max(120),
  instructions: z.string().min(1),
  providerId: ProviderIdSchema,
  model: z.string().min(1),
  sandbox: AgentSandboxSchema,
  workspaceRoot: z.string().min(1)
})

export const AgentCreateInputSchema = AgentDraftSchema

export const AgentUpdateInstructionsInputSchema = z.object({
  id: z.string().min(1),
  instructions: z.string().min(1)
})

export const AgentUpdateSettingsInputSchema = z.object({
  id: z.string().min(1),
  providerId: ProviderIdSchema,
  model: z.string().min(1),
  sandbox: AgentSandboxSchema,
  workspaceRoot: z.string().min(1),
  enabled: z.boolean()
})

export const AgentDeleteInputSchema = z.object({
  id: z.string().min(1)
})

export const AgentDeleteResultSchema = z.object({
  deletedAgentId: z.string().min(1),
  deletedConversationCount: z.number().int().nonnegative(),
  deletedTurnCount: z.number().int().nonnegative(),
  deletedLogRefs: z.array(z.string())
})

export const AgentSkillSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  relativePath: z.string().min(1),
  updatedAt: z.string()
})

export const AgentSkillsListInputSchema = z.object({
  agentId: z.string().min(1)
})

export const AgentSkillCreateInputSchema = z.object({
  agentId: z.string().min(1),
  name: z.string().trim().min(1, 'Skill name is required.').max(80),
  description: z.string().trim().max(500).optional()
})

export const ConversationModeSchema = z.enum(['direct', 'manual'])
export const ConversationStatusSchema = z.enum(['active', 'running', 'failed', 'cancelled'])
export const ConversationParticipantStatusSchema = z.enum([
  'ready',
  'running',
  'failed',
  'cancelled'
])
export const ConversationTurnSpeakerSchema = z.enum(['user', 'agent'])
export const ConversationTurnStatusSchema = z.enum(['running', 'completed', 'failed', 'cancelled'])

export const ConversationParticipantSchema = z.object({
  id: z.string().min(1),
  conversationId: z.string().min(1),
  agentId: z.string().min(1),
  agentName: z.string().min(1),
  agentRole: z.string().min(1),
  providerId: ProviderIdSchema,
  model: z.string().min(1),
  providerSessionRef: z.string().nullable(),
  status: ConversationParticipantStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string()
})

export const ConversationTurnSchema = z.object({
  id: z.string().min(1),
  conversationId: z.string().min(1),
  participantId: z.string().min(1),
  sequence: z.number().int().positive(),
  speaker: ConversationTurnSpeakerSchema,
  content: z.string(),
  preview: z.string(),
  status: ConversationTurnStatusSchema,
  error: z.string(),
  logRef: z.string(),
  truncated: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string()
})

export const ConversationSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  mode: ConversationModeSchema,
  status: ConversationStatusSchema,
  summary: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
})

export const ConversationListItemSchema = ConversationSchema.extend({
  agentName: z.string(),
  participantCount: z.number().int().nonnegative(),
  lastPreview: z.string()
})

export const ConversationDetailSchema = ConversationSchema.extend({
  participants: z.array(ConversationParticipantSchema),
  turns: z.array(ConversationTurnSchema)
})

export const ConversationGetInputSchema = z.object({
  conversationId: z.string().min(1)
})

export const ConversationCreateDirectInputSchema = z.object({
  agentId: z.string().min(1),
  title: z.string().trim().min(1).max(120).optional()
})

export const ConversationCreateManualInputSchema = z.object({
  agentIds: z.array(z.string().min(1)).min(2).max(8),
  title: z.string().trim().min(1).max(120).optional()
})

export const ConversationSendTurnInputSchema = z.object({
  conversationId: z.string().min(1),
  targetParticipantId: z.string().min(1).optional(),
  message: z.string().trim().min(1, 'Message is required.').max(64_000)
})

export const ConversationCancelTurnInputSchema = z.object({
  turnId: z.string().min(1)
})

export type AppInfo = z.infer<typeof AppInfoSchema>
export type SystemPaths = z.infer<typeof SystemPathsSchema>
export type DbStatus = z.infer<typeof DbStatusSchema>
export type WorkspaceConfig = z.infer<typeof WorkspaceConfigSchema>
export type WorkspaceSaveConfigInput = z.infer<typeof WorkspaceSaveConfigInputSchema>
export type WorkspaceSelectFolderResult = z.infer<typeof WorkspaceSelectFolderResultSchema>
export type ProviderId = z.infer<typeof ProviderIdSchema>
export type AgentSandbox = z.infer<typeof AgentSandboxSchema>
export type WorkspaceUpdateSystemDefaultInput = z.infer<
  typeof WorkspaceUpdateSystemDefaultInputSchema
>
export type ProviderLoginMethod = z.infer<typeof ProviderLoginMethodSchema>
export type ProviderStatus = z.infer<typeof ProviderStatusSchema>
export type ProviderActionInput = z.infer<typeof ProviderActionInputSchema>
export type ProviderConnectInput = z.input<typeof ProviderConnectInputSchema>
export type ProviderConnectResult = z.infer<typeof ProviderConnectResultSchema>
export type SetupStatus = z.infer<typeof SetupStatusSchema>
export type Agent = z.infer<typeof AgentSchema>
export type AgentDraftFromIntentInput = z.infer<typeof AgentDraftFromIntentInputSchema>
export type AgentDraft = z.infer<typeof AgentDraftSchema>
export type AgentCreateInput = z.infer<typeof AgentCreateInputSchema>
export type AgentUpdateInstructionsInput = z.infer<typeof AgentUpdateInstructionsInputSchema>
export type AgentUpdateSettingsInput = z.infer<typeof AgentUpdateSettingsInputSchema>
export type AgentDeleteInput = z.infer<typeof AgentDeleteInputSchema>
export type AgentDeleteResult = z.infer<typeof AgentDeleteResultSchema>
export type AgentSkill = z.infer<typeof AgentSkillSchema>
export type AgentSkillsListInput = z.infer<typeof AgentSkillsListInputSchema>
export type AgentSkillCreateInput = z.infer<typeof AgentSkillCreateInputSchema>
export type ConversationMode = z.infer<typeof ConversationModeSchema>
export type ConversationStatus = z.infer<typeof ConversationStatusSchema>
export type ConversationParticipantStatus = z.infer<typeof ConversationParticipantStatusSchema>
export type ConversationTurnSpeaker = z.infer<typeof ConversationTurnSpeakerSchema>
export type ConversationTurnStatus = z.infer<typeof ConversationTurnStatusSchema>
export type ConversationParticipant = z.infer<typeof ConversationParticipantSchema>
export type ConversationTurn = z.infer<typeof ConversationTurnSchema>
export type Conversation = z.infer<typeof ConversationSchema>
export type ConversationListItem = z.infer<typeof ConversationListItemSchema>
export type ConversationDetail = z.infer<typeof ConversationDetailSchema>
export type ConversationGetInput = z.infer<typeof ConversationGetInputSchema>
export type ConversationCreateDirectInput = z.infer<typeof ConversationCreateDirectInputSchema>
export type ConversationCreateManualInput = z.infer<typeof ConversationCreateManualInputSchema>
export type ConversationSendTurnInput = z.infer<typeof ConversationSendTurnInputSchema>
export type ConversationCancelTurnInput = z.infer<typeof ConversationCancelTurnInputSchema>
