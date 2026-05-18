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
  workspaceName: z.string().trim().min(1, 'Project name is required.').max(80),
  defaultProviderId: ProviderIdSchema.optional(),
  defaultModel: z.string().trim().min(1, 'Model is required.').max(120).optional()
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
  enabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string()
})

export const AgentDraftFromIntentInputSchema = z.object({
  requestedWork: z.string().trim().min(12, 'Describe what the agent should help with.'),
  sandbox: AgentSandboxSchema.default('workspace-write')
})

export const AgentProfileSchema = z.object({
  id: z
    .string()
    .regex(
      /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/,
      'Profile id must use the category/profile-slug namespace.'
    )
    .refine((value) => !value.startsWith('agt-'), 'Profile ids must not use the agent namespace.'),
  category: z.string().min(1),
  name: z.string().min(1).max(80),
  role: z.string().min(1).max(120),
  summary: z.string().min(1).max(300),
  tags: z.array(z.string().min(1).max(40)).default([]),
  recommended: z.boolean().default(false),
  instructions: z.string().min(1)
})

export const AgentProfileCategorySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  count: z.number().int().nonnegative()
})

export const AgentProfileCatalogSchema = z.object({
  categories: z.array(AgentProfileCategorySchema),
  profiles: z.array(AgentProfileSchema)
})

export const AgentDraftFromProfileInputSchema = z.object({
  profileId: AgentProfileSchema.shape.id
})

export const AgentDraftSchema = z.object({
  requestedWork: z.string().min(1),
  name: z.string().min(1).max(80),
  role: z.string().min(1).max(120),
  instructions: z.string().min(1),
  providerId: ProviderIdSchema,
  model: z.string().min(1),
  sandbox: AgentSandboxSchema,
  enabled: z.boolean().default(true)
})

export const AgentCreateInputSchema = AgentDraftSchema

export const AgentUpdateInstructionsInputSchema = z.object({
  id: z.string().min(1),
  instructions: z.string().min(1)
})

export const AgentUpdateSettingsInputSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, 'Agent name is required.').max(80),
  role: z.string().trim().min(1, 'Role is required.').max(120),
  providerId: ProviderIdSchema,
  model: z.string().min(1),
  sandbox: AgentSandboxSchema,
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

export const AgentSkillDetailSchema = AgentSkillSchema.extend({
  body: z.string()
})

export const AgentSkillsListInputSchema = z.object({
  agentId: z.string().min(1)
})

export const AgentSkillGetInputSchema = z.object({
  agentId: z.string().min(1),
  skillId: z.string().min(1)
})

export const AgentSkillCreateInputSchema = z.object({
  agentId: z.string().min(1),
  name: z.string().trim().min(1, 'Skill name is required.').max(80),
  description: z.string().trim().max(500).optional(),
  body: z.string().max(64_000).optional()
})

export const AgentSkillUpdateInputSchema = z.object({
  agentId: z.string().min(1),
  skillId: z.string().min(1),
  name: z.string().trim().min(1, 'Skill name is required.').max(80),
  description: z.string().trim().max(500).optional(),
  body: z.string().max(64_000)
})

export const AgentSkillDeleteInputSchema = AgentSkillGetInputSchema

export const AgentSkillDeleteResultSchema = z.object({
  deletedSkillId: z.string().min(1)
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

export const WorkspaceRelativePathSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine((value) => !value.includes('\0'), 'Path cannot contain null bytes.')
  .refine((value) => !/^(?:[a-zA-Z]:|[\\/])/.test(value), 'Path must be workspace-relative.')
  .refine(
    (value) => !value.split(/[\\/]+/).some((segment) => segment === '..'),
    'Path cannot contain parent directory segments.'
  )

export const AgentTurnOutcomeSchema = z.discriminatedUnion('outcome', [
  z.object({
    outcome: z.literal('final_response'),
    content: z.string().trim().min(1).max(64_000),
    artifactRefs: z.array(WorkspaceRelativePathSchema).max(64).default([]),
    changedFiles: z.array(WorkspaceRelativePathSchema).max(128).default([])
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
  artifactRefs: z.array(WorkspaceRelativePathSchema),
  changedFiles: z.array(WorkspaceRelativePathSchema),
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
  workingRoot: WorkspaceRelativePathSchema,
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

export const ConversationUpdateTitleInputSchema = z.object({
  conversationId: z.string().min(1),
  title: z.string().trim().min(1, 'Conversation name is required.').max(120)
})

export const ConversationCancelTurnInputSchema = z.object({
  turnId: z.string().min(1)
})

export const ConversationRevealPathInputSchema = ConversationCancelTurnInputSchema.extend({
  relativePath: WorkspaceRelativePathSchema
})

export const ConversationDeletePreviewInputSchema = ConversationGetInputSchema

export const ConversationDeletePreviewSchema = z.object({
  conversationId: z.string().min(1),
  title: z.string().min(1),
  workingRoot: WorkspaceRelativePathSchema,
  absolutePath: z.string().min(1),
  folderExists: z.boolean(),
  fileCount: z.number().int().nonnegative(),
  directoryCount: z.number().int().nonnegative()
})

export const ConversationDeleteInputSchema = ConversationGetInputSchema.extend({
  deleteWorkspaceFiles: z.boolean()
})

export const ConversationDeleteResultSchema = z.object({
  deletedConversationId: z.string().min(1),
  deletedTurnCount: z.number().int().nonnegative(),
  trashedWorkspaceFolder: z.boolean(),
  workspaceFolderMissing: z.boolean(),
  fileWarning: z.string().optional()
})

export const ConversationAnswerInputRequestInputSchema = z.object({
  requestId: z.string().min(1),
  answers: z.array(InteractionAnswerSchema).max(3)
})

export const ConversationCancelInputRequestInputSchema = z.object({
  requestId: z.string().min(1)
})

export const WorkRunStatusSchema = z.enum([
  'queued',
  'running',
  'blocked',
  'waiting_for_user',
  'completed',
  'failed',
  'cancelled'
])

export const WorkRequestStatusSchema = z.enum([
  'active',
  'running',
  'waiting_for_user',
  'completed',
  'failed',
  'cancelled'
])
export const WorkRunCreatedByTypeSchema = z.enum(['user', 'agent', 'system'])
export const WorkRunDependencyStatusSchema = z.enum(['pending', 'satisfied'])
export const WorkRunEventKindSchema = z.enum([
  'created',
  'blocked',
  'queued',
  'started',
  'completed',
  'failed',
  'cancelled',
  'dependency_satisfied'
])
export const WorkRunInputRequestStatusSchema = z.enum([
  'pending',
  'queued_for_resume',
  'resolved',
  'cancelled'
])

export const WorkRunSourceSchema = z.object({
  type: z.string().trim().min(1).max(80),
  id: z.string().trim().min(1).max(160),
  itemId: z.string().trim().min(1).max(160).optional()
})

export const WorkRequestSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  originalRequest: z.string().min(1),
  summary: z.string(),
  workingRoot: WorkspaceRelativePathSchema,
  status: WorkRequestStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable()
})

export const WorkRunSchema = z.object({
  id: z.string().min(1),
  rootRunId: z.string().min(1),
  parentRunId: z.string().min(1).nullable(),
  assignedAgentId: z.string().min(1),
  assignedAgentName: z.string(),
  assignedAgentRole: z.string(),
  createdByType: WorkRunCreatedByTypeSchema,
  createdByAgentId: z.string().min(1).nullable(),
  source: WorkRunSourceSchema.nullable(),
  title: z.string().min(1),
  instruction: z.string().min(1),
  status: WorkRunStatusSchema,
  priority: z.number().int(),
  providerId: ProviderIdSchema,
  model: z.string().min(1),
  providerSessionRef: z.string().nullable(),
  workingRoot: WorkspaceRelativePathSchema,
  sandbox: AgentSandboxSchema,
  expectedOutput: z.string(),
  resultSummary: z.string(),
  resultArtifactRef: z.string(),
  artifactRefs: z.array(WorkspaceRelativePathSchema),
  changedFiles: z.array(WorkspaceRelativePathSchema),
  error: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable()
})

export const WorkboardRunSchema = WorkRunSchema.extend({
  agentName: z.string().min(1),
  agentRole: z.string().min(1),
  requestId: z.string().min(1),
  requestTitle: z.string().min(1)
})

export const WorkRunDependencySchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  dependsOnRunId: z.string().min(1),
  status: WorkRunDependencyStatusSchema,
  createdAt: z.string(),
  resolvedAt: z.string().nullable()
})

export const WorkRunContextReferenceKindSchema = z.enum([
  'work_item',
  'work_request',
  'workspace_path'
])

export const WorkRunContextReferenceSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  kind: WorkRunContextReferenceKindSchema,
  refId: z.string().min(1),
  label: z.string(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string()
})

export const WorkRunEventSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  sequence: z.number().int().positive(),
  kind: WorkRunEventKindSchema,
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.string()
})

export const WorkRunInputSummarySchema = z.object({
  runId: z.string().min(1),
  title: z.string().min(1),
  agentName: z.string().min(1),
  agentRole: z.string().min(1),
  resultSummary: z.string().min(1),
  artifactRefs: z.array(WorkspaceRelativePathSchema),
  changedFiles: z.array(WorkspaceRelativePathSchema)
})

export const WorkRunInputRequestSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  status: WorkRunInputRequestStatusSchema,
  title: z.string().min(1),
  detail: z.string(),
  questions: z.array(InteractionQuestionSchema).min(1).max(3),
  answers: z.array(InteractionAnswerSchema).nullable(),
  resumeMessage: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
})

export const WorkRunCreateInputSchema = z.object({
  assignedAgentId: z.string().min(1),
  title: z.string().trim().min(1, 'Title is required.').max(160),
  instruction: z.string().trim().min(1, 'Instruction is required.').max(64_000),
  expectedOutput: z.string().trim().max(2_000).default(''),
  parentRunId: z.string().min(1).optional(),
  requiredRunIds: z.array(z.string().min(1)).max(16).default([]),
  createdByType: WorkRunCreatedByTypeSchema.default('user'),
  createdByAgentId: z.string().min(1).optional(),
  source: WorkRunSourceSchema.optional(),
  priority: z.number().int().min(-100).max(100).default(0)
})

export const WorkRunActionInputSchema = z.object({
  runId: z.string().min(1)
})

export const WorkRunCompleteInputSchema = WorkRunActionInputSchema.extend({
  resultSummary: z.string().trim().min(1, 'Result summary is required.').max(16_000),
  artifactRef: z.string().trim().max(500).optional(),
  artifactRefs: z.array(WorkspaceRelativePathSchema).max(64).default([]),
  changedFiles: z.array(WorkspaceRelativePathSchema).max(128).default([]),
  providerSessionRef: z.string().trim().min(1).optional()
})

export const WorkRunFailInputSchema = WorkRunActionInputSchema.extend({
  error: z.string().trim().min(1, 'Error is required.').max(2_000)
})

export const WorkboardDraftItemSchema = z.object({
  tempId: z.string().trim().regex(/^item-[0-9]+$/).max(80),
  title: z.string().trim().min(1).max(160),
  instruction: z.string().trim().min(1).max(64_000),
  expectedOutput: z.string().trim().min(1).max(2_000),
  assignedAgentId: z.string().min(1),
  dependsOnTempIds: z.array(z.string().trim().min(1).max(80)).max(16).default([]),
  priority: z.number().int().min(-100).max(100).default(0)
})

export const WorkboardDraftPlanSchema = z.object({
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().max(2_000).default(''),
  items: z.array(WorkboardDraftItemSchema).min(1).max(16)
})

export const WorkboardGeneratePlanInputSchema = z.object({
  request: z.string().trim().min(12, 'Describe the work request.').max(64_000)
})

export const WorkboardStartRequestInputSchema = z.object({
  originalRequest: z.string().trim().min(1).max(64_000),
  plan: WorkboardDraftPlanSchema
})

export const WorkboardDirectStartInputSchema = WorkboardGeneratePlanInputSchema

export const WorkboardRequestDestinationSchema = z.object({
  requestId: z.string().min(1).optional()
})

export const WorkboardContextReferenceInputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('work_item'),
    runId: z.string().min(1)
  }),
  z.object({
    kind: z.literal('work_request'),
    requestId: z.string().min(1)
  }),
  z.object({
    kind: z.literal('workspace_path'),
    path: WorkspaceRelativePathSchema
  })
])

export const WorkboardGenerateRequestPlanInputSchema = z.object({
  request: z.string().trim().min(12, 'Describe the work request.').max(64_000),
  destinationRequestId: z.string().min(1).optional(),
  contextReferences: z.array(WorkboardContextReferenceInputSchema).max(32).default([]),
  requestedAgentIds: z.array(z.string().min(1)).max(16).default([])
})

export const WorkboardStartRequestPlanInputSchema = z.object({
  originalRequest: z.string().trim().min(1).max(64_000),
  destinationRequestId: z.string().min(1).optional(),
  contextReferences: z.array(WorkboardContextReferenceInputSchema).max(32).default([]),
  requestedAgentIds: z.array(z.string().min(1)).max(16).default([]),
  plan: WorkboardDraftPlanSchema
})

export const WorkboardGenerateFollowUpPlanInputSchema = z.object({
  requestId: z.string().min(1),
  anchorRunId: z.string().min(1).optional(),
  request: z.string().trim().min(12, 'Describe the continuation work.').max(64_000)
})

export const WorkboardStartFollowUpInputSchema = z.object({
  requestId: z.string().min(1),
  anchorRunId: z.string().min(1).optional(),
  plan: WorkboardDraftPlanSchema
})

export const WorkboardDataSchema = z.object({
  requests: z.array(WorkRequestSchema),
  runs: z.array(WorkboardRunSchema),
  dependencies: z.array(WorkRunDependencySchema),
  contextReferences: z.array(WorkRunContextReferenceSchema),
  inputRequests: z.array(WorkRunInputRequestSchema)
})

export const ObservedRunSourceSurfaceSchema = z.enum(['workboard', 'conversation'])
export const ObservedRunLifecycleStatusSchema = z.enum([
  'queued',
  'starting',
  'running',
  'waiting_for_user',
  'completed',
  'failed',
  'cancelled'
])
export const ObservedRunLivenessHealthSchema = z.enum([
  'unknown',
  'healthy',
  'quiet',
  'stalled',
  'exited'
])
export const ObservedRunPhaseSchema = z.enum([
  'queued',
  'starting',
  'running',
  'reading',
  'editing',
  'waiting_for_user',
  'blocked',
  'completed',
  'failed',
  'cancelled'
])
export const ObservedRunEventKindSchema = z.enum([
  'status',
  'phase',
  'message',
  'tool',
  'file',
  'command',
  'output',
  'metric',
  'error'
])
export const ObservedRunEventSourceSchema = z.enum([
  'provider',
  'runtime',
  'inferred',
  'user',
  'system'
])
export const ObservedRunEventConfidenceSchema = z.enum([
  'reported',
  'derived',
  'estimated',
  'unknown'
])
export const ObservedRunUsageSourceSchema = z.enum(['provider', 'estimated', 'unavailable'])

export const ObservedRunSnapshotSchema = z.object({
  id: z.string().min(1),
  sourceSurface: ObservedRunSourceSurfaceSchema,
  sourceItemId: z.string().min(1),
  sourceItemTitle: z.string(),
  assignedAgentId: z.string(),
  assignedAgentName: z.string(),
  assignedAgentRole: z.string(),
  providerId: ProviderIdSchema,
  model: z.string().min(1),
  lifecycleStatus: ObservedRunLifecycleStatusSchema,
  livenessHealth: ObservedRunLivenessHealthSchema,
  currentPhase: ObservedRunPhaseSchema,
  latestActivity: z.string(),
  latestActivityAt: z.string().nullable(),
  queuedAt: z.string().nullable(),
  startedAt: z.string().nullable(),
  firstActivityAt: z.string().nullable(),
  lastActivityAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  elapsedMs: z.number().int().nonnegative(),
  idleMs: z.number().int().nonnegative().nullable(),
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  totalTokens: z.number().int().nonnegative().nullable(),
  usageSource: ObservedRunUsageSourceSchema,
  updatedAt: z.string()
})

export const ObservedRunEventSchema = z.object({
  id: z.string().min(1),
  observedRunId: z.string().min(1),
  sequence: z.number().int().positive(),
  timestamp: z.string(),
  kind: ObservedRunEventKindSchema,
  source: ObservedRunEventSourceSchema,
  confidence: ObservedRunEventConfidenceSchema,
  phase: ObservedRunPhaseSchema.nullable(),
  lifecycleStatus: ObservedRunLifecycleStatusSchema.nullable(),
  summary: z.string(),
  payload: z.record(z.string(), z.unknown())
})

export const ObservedRunListEventsInputSchema = z.object({
  observedRunId: z.string().min(1)
})

export const ObservedConversationRunsInputSchema = z.object({
  conversationId: z.string().min(1)
})

export const ObservedRunDiagnosticsInputSchema = z.object({
  observedRunId: z.string().min(1),
  stdoutOffset: z.number().int().nonnegative().optional(),
  stderrOffset: z.number().int().nonnegative().optional()
})

export const ObservedRunDiagnosticsStreamSchema = z.object({
  text: z.string(),
  startOffset: z.number().int().nonnegative(),
  nextOffset: z.number().int().nonnegative(),
  truncated: z.boolean()
})

export const ObservedRunDiagnosticsSchema = z.object({
  observedRunId: z.string().min(1),
  invocation: z.object({
    provider: z.string(),
    executable: z.string(),
    args: z.array(z.string()),
    cwd: z.string(),
    startedAt: z.string().nullable()
  }),
  stdout: ObservedRunDiagnosticsStreamSchema,
  stderr: ObservedRunDiagnosticsStreamSchema
})

export const WorkboardAnswerInputRequestInputSchema = z.object({
  requestId: z.string().min(1),
  answers: z.array(InteractionAnswerSchema).max(3)
})

export const WorkboardRevealPathInputSchema = WorkRunActionInputSchema.extend({
  relativePath: WorkspaceRelativePathSchema
})

export type WorkboardDraftDependencyItem = {
  tempId: string
  dependsOnTempIds: string[]
}

export function validateWorkboardDraftPlanDependencies(
  items: WorkboardDraftDependencyItem[]
): void {
  const tempIds = new Set(items.map((item) => item.tempId))
  if (tempIds.size !== items.length) {
    throw new Error('The generated plan contains duplicate Work Item ids.')
  }
  items.forEach((item, index) => {
    if (item.tempId !== `item-${index + 1}`) {
      throw new Error('The generated plan must use sequential Work Item ids.')
    }
  })

  items.forEach((item) => {
    item.dependsOnTempIds.forEach((dependsOnTempId) => {
      if (!tempIds.has(dependsOnTempId)) {
        throw new Error('The generated plan contains a missing dependency.')
      }
      if (dependsOnTempId === item.tempId) {
        throw new Error('A Work Item cannot depend on itself.')
      }
    })
  })

  validateAcyclicWorkboardPlan(items)
}

function validateAcyclicWorkboardPlan(items: WorkboardDraftDependencyItem[]): void {
  const itemById = new Map(items.map((item) => [item.tempId, item]))
  const visiting = new Set<string>()
  const visited = new Set<string>()

  function visit(tempId: string): void {
    if (visited.has(tempId)) {
      return
    }
    if (visiting.has(tempId)) {
      throw new Error('Work Item dependencies cannot contain a cycle.')
    }

    const item = itemById.get(tempId)
    if (!item) {
      return
    }

    visiting.add(tempId)
    item.dependsOnTempIds.forEach(visit)
    visiting.delete(tempId)
    visited.add(tempId)
  }

  items.forEach((item) => visit(item.tempId))
}

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
export type AgentProfile = z.infer<typeof AgentProfileSchema>
export type AgentProfileCategory = z.infer<typeof AgentProfileCategorySchema>
export type AgentProfileCatalog = z.infer<typeof AgentProfileCatalogSchema>
export type AgentDraftFromIntentInput = z.infer<typeof AgentDraftFromIntentInputSchema>
export type AgentDraftFromProfileInput = z.infer<typeof AgentDraftFromProfileInputSchema>
export type AgentDraft = z.infer<typeof AgentDraftSchema>
export type AgentCreateInput = z.infer<typeof AgentCreateInputSchema>
export type AgentUpdateInstructionsInput = z.infer<typeof AgentUpdateInstructionsInputSchema>
export type AgentUpdateSettingsInput = z.infer<typeof AgentUpdateSettingsInputSchema>
export type AgentDeleteInput = z.infer<typeof AgentDeleteInputSchema>
export type AgentDeleteResult = z.infer<typeof AgentDeleteResultSchema>
export type AgentSkill = z.infer<typeof AgentSkillSchema>
export type AgentSkillDetail = z.infer<typeof AgentSkillDetailSchema>
export type AgentSkillsListInput = z.infer<typeof AgentSkillsListInputSchema>
export type AgentSkillGetInput = z.infer<typeof AgentSkillGetInputSchema>
export type AgentSkillCreateInput = z.infer<typeof AgentSkillCreateInputSchema>
export type AgentSkillUpdateInput = z.infer<typeof AgentSkillUpdateInputSchema>
export type AgentSkillDeleteInput = z.infer<typeof AgentSkillDeleteInputSchema>
export type AgentSkillDeleteResult = z.infer<typeof AgentSkillDeleteResultSchema>
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
export type ConversationUpdateTitleInput = z.infer<typeof ConversationUpdateTitleInputSchema>
export type ConversationCancelTurnInput = z.infer<typeof ConversationCancelTurnInputSchema>
export type ConversationRevealPathInput = z.infer<typeof ConversationRevealPathInputSchema>
export type ConversationDeletePreviewInput = z.infer<typeof ConversationDeletePreviewInputSchema>
export type ConversationDeletePreview = z.infer<typeof ConversationDeletePreviewSchema>
export type ConversationDeleteInput = z.infer<typeof ConversationDeleteInputSchema>
export type ConversationDeleteResult = z.infer<typeof ConversationDeleteResultSchema>
export type ConversationAnswerInputRequestInput = z.infer<
  typeof ConversationAnswerInputRequestInputSchema
>
export type ConversationCancelInputRequestInput = z.infer<
  typeof ConversationCancelInputRequestInputSchema
>
export type WorkRunStatus = z.infer<typeof WorkRunStatusSchema>
export type WorkRequestStatus = z.infer<typeof WorkRequestStatusSchema>
export type WorkRunCreatedByType = z.infer<typeof WorkRunCreatedByTypeSchema>
export type WorkRunDependencyStatus = z.infer<typeof WorkRunDependencyStatusSchema>
export type WorkRunEventKind = z.infer<typeof WorkRunEventKindSchema>
export type WorkRunInputRequestStatus = z.infer<typeof WorkRunInputRequestStatusSchema>
export type WorkRunSource = z.infer<typeof WorkRunSourceSchema>
export type WorkRequest = z.infer<typeof WorkRequestSchema>
export type WorkRun = z.infer<typeof WorkRunSchema>
export type WorkboardRun = z.infer<typeof WorkboardRunSchema>
export type WorkRunDependency = z.infer<typeof WorkRunDependencySchema>
export type WorkRunContextReferenceKind = z.infer<typeof WorkRunContextReferenceKindSchema>
export type WorkRunContextReference = z.infer<typeof WorkRunContextReferenceSchema>
export type WorkRunEvent = z.infer<typeof WorkRunEventSchema>
export type WorkRunInputSummary = z.infer<typeof WorkRunInputSummarySchema>
export type WorkRunInputRequest = z.infer<typeof WorkRunInputRequestSchema>
export type WorkRunCreateInput = z.input<typeof WorkRunCreateInputSchema>
export type WorkRunActionInput = z.infer<typeof WorkRunActionInputSchema>
export type WorkRunCompleteInput = z.infer<typeof WorkRunCompleteInputSchema>
export type WorkRunFailInput = z.infer<typeof WorkRunFailInputSchema>
export type WorkboardDraftItem = z.infer<typeof WorkboardDraftItemSchema>
export type WorkboardDraftPlan = z.infer<typeof WorkboardDraftPlanSchema>
export type WorkboardGeneratePlanInput = z.infer<typeof WorkboardGeneratePlanInputSchema>
export type WorkboardStartRequestInput = z.infer<typeof WorkboardStartRequestInputSchema>
export type WorkboardDirectStartInput = z.infer<typeof WorkboardDirectStartInputSchema>
export type WorkboardRequestDestination = z.infer<typeof WorkboardRequestDestinationSchema>
export type WorkboardContextReferenceInput = z.infer<
  typeof WorkboardContextReferenceInputSchema
>
export type WorkboardGenerateRequestPlanInput = z.infer<
  typeof WorkboardGenerateRequestPlanInputSchema
>
export type WorkboardStartRequestPlanInput = z.infer<
  typeof WorkboardStartRequestPlanInputSchema
>
export type WorkboardGenerateFollowUpPlanInput = z.infer<
  typeof WorkboardGenerateFollowUpPlanInputSchema
>
export type WorkboardStartFollowUpInput = z.infer<typeof WorkboardStartFollowUpInputSchema>
export type WorkboardData = z.infer<typeof WorkboardDataSchema>
export type ObservedRunSourceSurface = z.infer<typeof ObservedRunSourceSurfaceSchema>
export type ObservedRunLifecycleStatus = z.infer<typeof ObservedRunLifecycleStatusSchema>
export type ObservedRunLivenessHealth = z.infer<typeof ObservedRunLivenessHealthSchema>
export type ObservedRunPhase = z.infer<typeof ObservedRunPhaseSchema>
export type ObservedRunEventKind = z.infer<typeof ObservedRunEventKindSchema>
export type ObservedRunEventSource = z.infer<typeof ObservedRunEventSourceSchema>
export type ObservedRunEventConfidence = z.infer<typeof ObservedRunEventConfidenceSchema>
export type ObservedRunUsageSource = z.infer<typeof ObservedRunUsageSourceSchema>
export type ObservedRunSnapshot = z.infer<typeof ObservedRunSnapshotSchema>
export type ObservedRunEvent = z.infer<typeof ObservedRunEventSchema>
export type ObservedRunListEventsInput = z.infer<typeof ObservedRunListEventsInputSchema>
export type ObservedConversationRunsInput = z.infer<typeof ObservedConversationRunsInputSchema>
export type ObservedRunDiagnosticsInput = z.infer<typeof ObservedRunDiagnosticsInputSchema>
export type ObservedRunDiagnostics = z.infer<typeof ObservedRunDiagnosticsSchema>
export type WorkboardAnswerInputRequestInput = z.infer<
  typeof WorkboardAnswerInputRequestInputSchema
>
export type WorkboardRevealPathInput = z.infer<typeof WorkboardRevealPathInputSchema>
export type OrchestrationAssignment = z.infer<typeof OrchestrationAssignmentSchema>
export type OrchestrationPlan = z.infer<typeof OrchestrationPlanSchema>
