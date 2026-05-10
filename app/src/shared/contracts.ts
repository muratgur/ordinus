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
export const ConversationRoutingModeSchema = z.enum(['manual', 'orchestrated'])
export const ConversationStatusSchema = z.enum([
  'active',
  'running',
  'waiting_for_user',
  'failed',
  'cancelled'
])
export const ConversationParticipantStatusSchema = z.enum([
  'ready',
  'running',
  'waiting_for_user',
  'failed',
  'cancelled'
])
export const ConversationTurnSpeakerSchema = z.enum(['user', 'agent'])
export const ConversationTurnStatusSchema = z.enum([
  'running',
  'waiting_for_user',
  'completed',
  'failed',
  'cancelled'
])

export const InteractionChoiceOptionSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional()
})

export const InteractionChoiceQuestionSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    label: z.string().trim().min(1).max(300),
    detail: z.string().trim().max(1_000).optional(),
    kind: z.literal('choice'),
    required: z.boolean().default(true),
    options: z.array(InteractionChoiceOptionSchema).min(1).max(4),
    recommendedOptionId: z.string().trim().min(1).max(80).optional(),
    allowCustom: z.boolean().default(true)
  })
  .superRefine((question, context) => {
    if (
      question.recommendedOptionId &&
      !question.options.some((option) => option.id === question.recommendedOptionId)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Recommended option must reference one of the provided options.',
        path: ['recommendedOptionId']
      })
    }
  })

export const InteractionTextQuestionSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(300),
  detail: z.string().trim().max(1_000).optional(),
  kind: z.literal('text'),
  required: z.boolean().default(true),
  placeholder: z.string().trim().max(300).optional()
})

export const InteractionBooleanQuestionSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(300),
  detail: z.string().trim().max(1_000).optional(),
  kind: z.literal('boolean'),
  required: z.boolean().default(true),
  trueLabel: z.string().trim().min(1).max(80).default('Yes'),
  falseLabel: z.string().trim().min(1).max(80).default('No')
})

export const InteractionQuestionSchema = z.discriminatedUnion('kind', [
  InteractionChoiceQuestionSchema,
  InteractionTextQuestionSchema,
  InteractionBooleanQuestionSchema
])

export const InteractionAnswerSchema = z.discriminatedUnion('type', [
  z.object({
    questionId: z.string().trim().min(1).max(80),
    type: z.literal('option'),
    optionId: z.string().trim().min(1).max(80)
  }),
  z.object({
    questionId: z.string().trim().min(1).max(80),
    type: z.literal('custom'),
    text: z.string().trim().min(1).max(1_000)
  }),
  z.object({
    questionId: z.string().trim().min(1).max(80),
    type: z.literal('text'),
    text: z.string().trim().min(1).max(1_000)
  }),
  z.object({
    questionId: z.string().trim().min(1).max(80),
    type: z.literal('boolean'),
    value: z.boolean()
  })
])

export const AgentTurnOutcomeSchema = z.discriminatedUnion('outcome', [
  z.object({
    outcome: z.literal('final_response'),
    content: z.string().trim().min(1).max(64_000)
  }),
  z.object({
    outcome: z.literal('needs_input'),
    title: z.string().trim().min(1).max(160),
    detail: z.string().trim().max(1_000).optional(),
    questions: z.array(InteractionQuestionSchema).min(1).max(3)
  })
])

export const ConversationInputRequestStatusSchema = z.enum(['pending', 'resolved', 'cancelled'])

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

export const ConversationInputRequestSchema = z.object({
  id: z.string().min(1),
  conversationId: z.string().min(1),
  turnId: z.string().min(1),
  participantId: z.string().min(1),
  status: ConversationInputRequestStatusSchema,
  title: z.string().min(1),
  detail: z.string(),
  questions: z.array(InteractionQuestionSchema).min(1).max(3),
  answers: z.array(InteractionAnswerSchema).nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
})

export const ConversationSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  mode: ConversationModeSchema,
  routingMode: ConversationRoutingModeSchema.default('manual'),
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
  turns: z.array(ConversationTurnSchema),
  inputRequests: z.array(ConversationInputRequestSchema)
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
  targetParticipantIds: z.array(z.string().min(1)).max(8).optional(),
  message: z.string().trim().min(1, 'Message is required.').max(64_000)
})

export const ConversationUpdateRoutingModeInputSchema = z.object({
  conversationId: z.string().min(1),
  routingMode: ConversationRoutingModeSchema
})

export const ConversationCancelTurnInputSchema = z.object({
  turnId: z.string().min(1)
})

export const ConversationAnswerInputRequestInputSchema = z.object({
  requestId: z.string().min(1),
  answers: z.array(InteractionAnswerSchema).max(3)
})

export const ConversationCancelInputRequestInputSchema = z.object({
  requestId: z.string().min(1)
})

export const OrchestrationAssignmentSchema = z.object({
  participantId: z.string().min(1),
  instruction: z.string().trim().min(1).max(16_000)
})

export const OrchestrationPlanSchema = z.object({
  action: z.literal('route'),
  assignments: z.array(OrchestrationAssignmentSchema).min(1).max(8)
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
export type ConversationRoutingMode = z.infer<typeof ConversationRoutingModeSchema>
export type ConversationStatus = z.infer<typeof ConversationStatusSchema>
export type ConversationParticipantStatus = z.infer<typeof ConversationParticipantStatusSchema>
export type ConversationTurnSpeaker = z.infer<typeof ConversationTurnSpeakerSchema>
export type ConversationTurnStatus = z.infer<typeof ConversationTurnStatusSchema>
export type InteractionChoiceOption = z.infer<typeof InteractionChoiceOptionSchema>
export type InteractionQuestion = z.infer<typeof InteractionQuestionSchema>
export type InteractionAnswer = z.infer<typeof InteractionAnswerSchema>
export type AgentTurnOutcome = z.infer<typeof AgentTurnOutcomeSchema>
export type ConversationInputRequestStatus = z.infer<typeof ConversationInputRequestStatusSchema>
export type ConversationParticipant = z.infer<typeof ConversationParticipantSchema>
export type ConversationTurn = z.infer<typeof ConversationTurnSchema>
export type ConversationInputRequest = z.infer<typeof ConversationInputRequestSchema>
export type Conversation = z.infer<typeof ConversationSchema>
export type ConversationListItem = z.infer<typeof ConversationListItemSchema>
export type ConversationDetail = z.infer<typeof ConversationDetailSchema>
export type ConversationGetInput = z.infer<typeof ConversationGetInputSchema>
export type ConversationCreateDirectInput = z.infer<typeof ConversationCreateDirectInputSchema>
export type ConversationCreateManualInput = z.infer<typeof ConversationCreateManualInputSchema>
export type ConversationSendTurnInput = z.infer<typeof ConversationSendTurnInputSchema>
export type ConversationUpdateRoutingModeInput = z.infer<
  typeof ConversationUpdateRoutingModeInputSchema
>
export type ConversationCancelTurnInput = z.infer<typeof ConversationCancelTurnInputSchema>
export type ConversationAnswerInputRequestInput = z.infer<
  typeof ConversationAnswerInputRequestInputSchema
>
export type ConversationCancelInputRequestInput = z.infer<
  typeof ConversationCancelInputRequestInputSchema
>
export type OrchestrationAssignment = z.infer<typeof OrchestrationAssignmentSchema>
export type OrchestrationPlan = z.infer<typeof OrchestrationPlanSchema>
