import { z } from 'zod'

export const WORKBOARD_AGENT_LIMIT = 32

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
  logs: z.string(),
  // Ordinus-scoped npm prefix. The managed-install service writes provider
  // CLIs here so they cannot collide with any user-level install. See ADR-028.
  cliPrefix: z.string(),
  cliBin: z.string()
})

// Declared up here (not next to its historical neighbors) so the install /
// onboarding schemas below can reference it. Re-exported under the same name
// so existing imports keep working.
export const ProviderIdSchema = z.enum(['codex', 'claude', 'gemini'])

export const ProviderInstallEventSchema = z.discriminatedUnion('phase', [
  z.object({
    phase: z.literal('start'),
    providerId: ProviderIdSchema,
    packageName: z.string(),
    packageVersion: z.string()
  }),
  z.object({
    phase: z.literal('download'),
    providerId: ProviderIdSchema,
    message: z.string()
  }),
  z.object({
    phase: z.literal('verify'),
    providerId: ProviderIdSchema,
    version: z.string()
  }),
  z.object({
    phase: z.literal('done'),
    providerId: ProviderIdSchema,
    binPath: z.string()
  }),
  z.object({
    phase: z.literal('error'),
    providerId: ProviderIdSchema,
    message: z.string(),
    stderrTail: z.string().optional()
  })
])

export type ProviderInstallEvent = z.infer<typeof ProviderInstallEventSchema>

// --- Onboarding state machine (ADR-028) -------------------------------------

export const OnboardingStageSchema = z.enum([
  'welcome',
  'providers',
  'workspace',
  'install',
  'colleague',
  'done'
])

export const OnboardingProviderStatusSchema = z.enum([
  'pending',
  'installing',
  'installed',
  'authed',
  'failed'
])

// Last phase observed for an in-flight install. Renderer uses this to drive
// the progress bar (shimmer during 'download', determinate during 'verify').
export const OnboardingInstallPhaseSchema = z.enum([
  'idle',
  'start',
  'download',
  'verify',
  'done',
  'error'
])

export const OnboardingStateSchema = z.object({
  stage: OnboardingStageSchema,
  selectedProviders: z.array(ProviderIdSchema),
  workspace: z
    .object({
      workspaceRoot: z.string(),
      workspaceName: z.string()
    })
    .nullable(),
  // Zod v4 makes `z.record(EnumSchema, V)` strict — every enum key must be
  // present. We need a partial map (only the providers the user has
  // selected/installed appear), so we type the key as plain string and
  // narrow at the type level via the Partial<Record<...>> transform output.
  installResults: z
    .record(z.string(), OnboardingProviderStatusSchema)
    .transform(
      (value) =>
        value as Partial<
          Record<z.infer<typeof ProviderIdSchema>, z.infer<typeof OnboardingProviderStatusSchema>>
        >
    ),
  installPhases: z
    .record(z.string(), OnboardingInstallPhaseSchema)
    .optional()
    .transform(
      (value) =>
        (value ?? {}) as Partial<
          Record<z.infer<typeof ProviderIdSchema>, z.infer<typeof OnboardingInstallPhaseSchema>>
        >
    ),
  installErrors: z
    .record(z.string(), z.string())
    .transform((value) => value as Partial<Record<z.infer<typeof ProviderIdSchema>, string>>),
  firstAgentId: z.string().nullable(),
  // Lightweight stage transition log for future telemetry. Kept in state so it
  // survives restart and is observable for debugging onboarding drop-off.
  stageHistory: z.array(
    z.object({
      stage: OnboardingStageSchema,
      at: z.string()
    })
  )
})

export type OnboardingStage = z.infer<typeof OnboardingStageSchema>
export type OnboardingProviderStatus = z.infer<typeof OnboardingProviderStatusSchema>
export type OnboardingInstallPhase = z.infer<typeof OnboardingInstallPhaseSchema>
export type OnboardingState = z.infer<typeof OnboardingStateSchema>

export const OnboardingStatusSchema = z.object({
  onboardedAt: z.string().nullable(),
  state: OnboardingStateSchema
})

export type OnboardingStatus = z.infer<typeof OnboardingStatusSchema>

export const OnboardingSelectProvidersInputSchema = z.object({
  providerIds: z.array(ProviderIdSchema).min(1)
})

export const OnboardingConfirmWorkspaceInputSchema = z.object({
  workspaceRoot: z.string().trim().min(1),
  workspaceName: z.string().trim().min(1).max(80)
})

export const OnboardingInstallProviderInputSchema = z.object({
  providerId: ProviderIdSchema
})

export const OnboardingMarkProviderAuthedInputSchema = z.object({
  providerId: ProviderIdSchema,
  authed: z.boolean()
})

export const OnboardingCompleteInputSchema = z.object({
  agentId: z.string().min(1)
})

export const OnboardingInstallEventEnvelopeSchema = z.object({
  event: ProviderInstallEventSchema,
  state: OnboardingStateSchema
})

export type OnboardingInstallEventEnvelope = z.infer<typeof OnboardingInstallEventEnvelopeSchema>

export const DbStatusSchema = z.object({
  databasePath: z.string(),
  exists: z.boolean(),
  initialized: z.boolean(),
  schemaVersion: z.number().int().nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable()
})

// ADR-029 M5: side-effect events that Ordinus action tools broadcast to the
// renderer after they succeed. The renderer subscribes once and routes:
//   - workboard_plan_ready → fill workboardDraftReview state, navigate to /workboard
//   - schedule_created     → toast + (optionally) navigate to /schedules
//   - workflow_created     → toast + (optionally) navigate to /workflows
//
// Events carry minimal context. Heavy payloads (full plan, schedule, workflow)
// are included so the renderer doesn't need an extra IPC round-trip.
// ADR-029 M6 — Pending-confirmation payload shared between the MCP layer and
// the renderer panel. Stable shape across IPC events and list queries.
export const OrdinusPendingConfirmationSchema = z.object({
  pendingId: z.string(),
  toolName: z.string(),
  /** Human-readable label for the panel ("Cancel Work Run"). */
  toolLabel: z.string(),
  reversibility: z.enum(['reversible', 'soft-delete', 'irreversible']),
  affectedRecords: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      status: z.string().optional()
    })
  ),
  /** Raw JSON-ish args, shown in the disclosure. */
  args: z.unknown(),
  why: z.string().optional(),
  createdAt: z.string()
})

export const OrdinusConfirmationDecisionSchema = z.enum(['approved', 'cancelled'])

export const OrdinusResolveConfirmationInputSchema = z.object({
  pendingId: z.string().min(1),
  decision: OrdinusConfirmationDecisionSchema
})

export const OrdinusActionEventSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('workboard_plan_ready'),
    request: z.string(),
    // Typed as WorkboardDraftPlan downstream; widened here to avoid forward-
    // reference TDZ issues (WorkboardDraftPlanSchema is defined later in the
    // file). The renderer narrows via WorkboardDraftPlanSchema.parse.
    plan: z.unknown()
  }),
  z.object({
    kind: z.literal('schedule_created'),
    scheduleId: z.string(),
    scheduleName: z.string()
  }),
  z.object({
    kind: z.literal('workflow_created'),
    workflowId: z.string(),
    workflowName: z.string()
  }),
  // ADR-029 M6: confirmation lifecycle events.
  // `requested` — show the panel.
  // `resolved`  — remove the panel (covers the case where the same panel was
  //               approved/cancelled in another window, or by us programmatically).
  z.object({
    kind: z.literal('confirmation_requested'),
    pending: OrdinusPendingConfirmationSchema
  }),
  z.object({
    kind: z.literal('confirmation_resolved'),
    pendingId: z.string(),
    decision: OrdinusConfirmationDecisionSchema
  }),
  // needs_input lifecycle. The renderer surfaces these as the question panel
  // (NOT inline in the transcript). `request` is typed as OrdinusPendingInputRequest
  // downstream; widened to z.unknown() here to avoid a forward reference to
  // InteractionQuestionSchema (defined later in this file). The renderer
  // narrows via OrdinusPendingInputRequestSchema.parse.
  z.object({
    kind: z.literal('input_request_requested'),
    request: z.unknown()
  }),
  z.object({
    kind: z.literal('input_request_resolved'),
    requestId: z.string()
  }),
  // Turn lifecycle. The Ordinus transcript's "thinking" indicator is ephemeral
  // UI (there is no running-turn row in the DB), so — unlike Workboard, whose
  // status is server-persisted — it cannot be recovered by re-fetching after
  // the screen unmounts on navigation. These events let any (re)mounted window
  // rehydrate the busy indicator and refresh the transcript when a turn settles
  // while the user was on another screen. `started` fires when a turn begins;
  // `settled` fires when it finishes for any reason (final response, needs_input,
  // or error).
  z.object({
    kind: z.literal('turn_started'),
    conversationId: z.string()
  }),
  z.object({
    kind: z.literal('turn_settled'),
    conversationId: z.string()
  })
])

// ADR-029 M8: Ordinus memory CRUD shapes for the renderer-side memory
// panel. The same `ordinus_memory` table is also exposed to the LLM via
// memory_search / memory_write MCP tools; both paths share the same
// upsert-by-(type,name) semantics.
export const OrdinusMemoryEntrySchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  body: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
})

export const OrdinusWriteMemoryInputSchema = z.object({
  type: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(2000)
})

export const OrdinusDeleteMemoryInputSchema = z.object({
  id: z.string().min(1)
})

// ADR-029 M7: Ordinus persona + provider/model singleton — the editable
// row behind Settings → Ordinus. Provider changes go through a separate
// confirmation flow in the renderer (provider-change dialog) before this
// schema is invoked.
export const OrdinusSingletonSchema = z.object({
  providerId: ProviderIdSchema,
  model: z.string(),
  displayName: z.string(),
  avatarRef: z.string().nullable(),
  extraInstructions: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
})

export const OrdinusUpdateSingletonInputSchema = z.object({
  providerId: ProviderIdSchema.optional(),
  model: z.string().trim().min(1).max(120).optional(),
  displayName: z.string().trim().min(1).max(80).optional(),
  // Nullable-but-present: client passes `null` to clear, omits to leave
  // unchanged. We discriminate undefined vs null at the DB layer.
  avatarRef: z.string().trim().max(200).nullable().optional(),
  extraInstructions: z.string().trim().max(8_000).nullable().optional()
})

export const OrdinusArchiveConversationInputSchema = z.object({
  conversationId: z.string().min(1)
})

export const OrdinusUnarchiveConversationInputSchema = z.object({
  conversationId: z.string().min(1)
})

export const OrdinusDeleteConversationInputSchema = z.object({
  conversationId: z.string().min(1)
})

export const OrdinusUpdateConversationTitleInputSchema = z.object({
  conversationId: z.string().min(1),
  title: z.string().trim().min(1).max(120)
})

export const OrdinusSetConversationPinnedInputSchema = z.object({
  conversationId: z.string().min(1),
  pinned: z.boolean()
})

// ADR-034: stop a running Ordinus turn from the composer's Stop button.
export const OrdinusCancelTurnInputSchema = z.object({
  conversationId: z.string().min(1)
})

// ADR-035: reveal a file referenced by an Ordinus transcript turn. The main
// process re-checks the path against the turn's recorded references.
export const OrdinusRevealPathInputSchema = z.object({
  conversationId: z.string().min(1),
  turnRowId: z.string().min(1),
  relativePath: z.string().min(1)
})

// ADR-029 M4.5: persisted transcript turn shape. ADR-034 adds 'cancelled' —
// a permanent muted marker left when the user stops a running turn, so a
// truncated response is explainable when re-reading the conversation.
export const OrdinusConversationTurnKindSchema = z.enum(['user', 'assistant', 'error', 'cancelled'])

export const OrdinusConversationTurnSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  kind: OrdinusConversationTurnKindSchema,
  content: z.string(),
  // ADR-030 parity: optional full produced body, shown on demand in the
  // transcript ("Show full response"). Empty when there is no extra body.
  resultContent: z.string().default(''),
  // ADR-035: files the turn produced/changed, so Home renders the same
  // "files touched" row as agent rooms.
  artifactRefs: z.array(z.string()).default([]),
  changedFiles: z.array(z.string()).default([]),
  turnId: z.string().nullable(),
  createdAt: z.string()
})

export const OrdinusListTurnsInputSchema = z.object({
  conversationId: z.string().min(1)
})

// ADR-029 M3: Ordinus conversation surface contracts.
export const OrdinusConversationSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  providerId: z.string(),
  model: z.string(),
  providerSessionRef: z.string().nullable(),
  archivedAt: z.string().nullable(),
  pinnedAt: z.string().nullable(),
  frozenReason: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
})

export const OrdinusCreateConversationInputSchema = z.object({
  title: z.string().trim().min(1).max(120).optional()
})

export const OrdinusSendTurnInputSchema = z.object({
  conversationId: z.string().min(1),
  message: z.string().trim().min(1).max(16_000),
  /**
   * ADR-029 M5: optional override for what gets stored as the user-visible
   * transcript line. When a slash command is used, the renderer sends the
   * EXPANDED prompt as `message` (the LLM sees rich instructions) but the
   * UNEXPANDED `/cmd <args>` as `displayMessage` so the transcript stays
   * clean for human reading. Defaults to `message` when omitted (M3
   * behavior preserved).
   */
  displayMessage: z.string().trim().min(1).max(16_000).optional()
})

// OrdinusTurnOutcomeSchema is defined after AgentTurnOutcomeSchema below
// (it embeds that schema). The forward declaration would TDZ-throw at module
// load if we placed it here; the type alias still lives in the Ordinus types
// block below.

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

export const ConnectorIdSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'Connector id must be a lowercase slug.')

export const ConnectorTransportSchema = z.enum(['mcp-http', 'mcp-stdio', 'api'])
export const ConnectorAuthMethodSchema = z.enum(['oauth', 'api-key', 'none'])

export const AgentConnectorsSchema = z.array(ConnectorIdSchema).default([])

export const AgentExtraDirectoriesSchema = z.array(z.string().min(1)).default([])

export const ConnectorSummarySchema = z.object({
  id: ConnectorIdSchema,
  label: z.string().min(1),
  transport: ConnectorTransportSchema,
  authMethod: ConnectorAuthMethodSchema,
  connected: z.boolean()
})

export const ConnectorActionInputSchema = z.object({
  connectorId: ConnectorIdSchema
})

export type ConnectorSummary = z.infer<typeof ConnectorSummarySchema>
export type ConnectorActionInput = z.infer<typeof ConnectorActionInputSchema>

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

export const AgentCapabilitiesSchema = z
  .string()
  .trim()
  .max(300, 'Capabilities must be 300 characters or fewer.')
  .default('')

export const AgentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.string().min(1),
  capabilities: AgentCapabilitiesSchema,
  requestedWork: z.string().min(1),
  instructions: z.string().min(1),
  providerId: ProviderIdSchema,
  model: z.string().min(1),
  sandbox: AgentSandboxSchema,
  connectors: AgentConnectorsSchema,
  extraDirectories: AgentExtraDirectoriesSchema,
  enabled: z.boolean(),
  avatar: z.string().default(''),
  pinnedAt: z.string().nullable().default(null),
  lastUsedAt: z.string().nullable().default(null),
  useCount: z.number().int().nonnegative().default(0),
  archivedAt: z.string().nullable().default(null),
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
  categories: z.array(z.string().min(1)).default([]),
  name: z.string().min(1).max(80),
  role: z.string().min(1).max(120),
  capabilities: AgentCapabilitiesSchema,
  tags: z.array(z.string().min(1).max(40)).default([]),
  recommended: z.boolean().default(false),
  suggestedConnectors: AgentConnectorsSchema,
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
  capabilities: AgentCapabilitiesSchema,
  instructions: z.string().min(1),
  providerId: ProviderIdSchema,
  model: z.string().min(1),
  sandbox: AgentSandboxSchema,
  connectors: AgentConnectorsSchema,
  extraDirectories: AgentExtraDirectoriesSchema,
  avatar: z.string().default(''),
  enabled: z.boolean().default(true)
})

export const AgentCreateInputSchema = AgentDraftSchema

export const AgentExtraDirectoryAddInputSchema = z.object({
  agentId: z.string().min(1)
})

export const AgentExtraDirectoryRemoveInputSchema = z.object({
  agentId: z.string().min(1),
  path: z.string().min(1)
})

export const AgentExtraDirectoryListInputSchema = z.object({
  agentId: z.string().min(1)
})

export const AgentExtraDirectoryErrorCodeSchema = z.enum([
  'empty',
  'not_absolute',
  'null_bytes',
  'path_contains_comma',
  'not_found',
  'not_directory',
  'broken_symlink',
  'workspace_descendant',
  'workspace_ancestor',
  'workspace_not_configured',
  'denylisted',
  'duplicate',
  'cancelled'
])

export const AgentExtraDirectoryEntrySchema = z.object({
  path: z.string().min(1),
  exists: z.boolean()
})

export const AgentExtraDirectoryListSchema = z.object({
  agentId: z.string().min(1),
  entries: z.array(AgentExtraDirectoryEntrySchema)
})

export const AgentExtraDirectoryAddResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), list: AgentExtraDirectoryListSchema }),
  z.object({
    ok: z.literal(false),
    code: AgentExtraDirectoryErrorCodeSchema,
    message: z.string()
  })
])

export const AgentUpdateInstructionsInputSchema = z.object({
  id: z.string().min(1),
  instructions: z.string().min(1)
})

export const AgentUpdateSettingsInputSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, 'Agent name is required.').max(80),
  role: z.string().trim().min(1, 'Role is required.').max(120),
  capabilities: AgentCapabilitiesSchema,
  providerId: ProviderIdSchema,
  model: z.string().min(1),
  sandbox: AgentSandboxSchema,
  connectors: AgentConnectorsSchema,
  avatar: z.string().optional(),
  enabled: z.boolean()
})

export const AgentSetPinnedInputSchema = z.object({
  id: z.string().min(1),
  pinned: z.boolean()
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

export const AgentMemoryRuleSchema = z.object({
  id: z.string().min(1),
  agentId: z.string().min(1),
  rule: z.string().min(1),
  sourceFeedbackId: z.string().nullable(),
  active: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string()
})

export const AgentMemoryListInputSchema = z.object({
  agentId: z.string().min(1),
  includeInactive: z.boolean().optional()
})

export const AgentMemoryAddInputSchema = z.object({
  agentId: z.string().min(1),
  rule: z.string().trim().min(1, 'Memory rule cannot be empty.').max(2_000),
  sourceFeedbackId: z.string().min(1).optional()
})

export const AgentMemoryUpdateInputSchema = z.object({
  agentId: z.string().min(1),
  ruleId: z.string().min(1),
  rule: z.string().trim().min(1, 'Memory rule cannot be empty.').max(2_000)
})

export const AgentMemoryDeactivateInputSchema = z.object({
  agentId: z.string().min(1),
  ruleId: z.string().min(1)
})

export const AgentMemoryDeactivateResultSchema = z.object({
  deactivatedRuleId: z.string().min(1)
})

export const AgentArchiveInputSchema = z.object({
  id: z.string().min(1)
})

export const AgentReflectionEntrySchema = z.object({
  agent: AgentSchema,
  rules: z.array(AgentMemoryRuleSchema),
  isStale: z.boolean(),
  daysSinceUsed: z.number().nullable()
})

export const AgentReflectionSummarySchema = z.object({
  entries: z.array(AgentReflectionEntrySchema),
  staleThresholdDays: z.number().int().positive(),
  generatedAt: z.string()
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
export const ConversationTurnSpeakerSchema = z.enum(['user', 'agent', 'moderator'])
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

export const workRunResultSummaryMaxLength = 16_000
export const agentTurnOutcomeContentMaxLength = 256_000
// ADR-030: full result body cap for database-backed result content.
export const workRunResultContentMaxLength = agentTurnOutcomeContentMaxLength

export const AgentTurnOutcomeSchema = z.discriminatedUnion('outcome', [
  z.object({
    outcome: z.literal('final_response'),
    // ADR-030: `summary` is the always-present short narrative shown to the user
    // and passed inline in handoffs. `content` is the optional full textual body
    // (the produced report/analysis); it is empty when the deliverable is a file.
    summary: z.string().trim().min(1).max(workRunResultSummaryMaxLength),
    content: z.string().trim().max(agentTurnOutcomeContentMaxLength).default(''),
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

// ADR-029 M3: Ordinus turn result envelope. Embeds AgentTurnOutcomeSchema (defined
// just above) so renderer code receives the same discriminated union the existing
// conversation runtime returns — Ordinus rides the same pipeline.
export const OrdinusTurnOutcomeSchema = z.object({
  conversationId: z.string(),
  turnId: z.string(),
  providerSessionRef: z.string(),
  outcome: AgentTurnOutcomeSchema,
  sessionReset: z.boolean()
})

// ADR-029 — Ordinus needs_input request surfaced as the input-area panel.
// Defined here (after InteractionQuestionSchema) so the questions array is
// strongly typed; the OrdinusActionEvent above carries it as z.unknown() to
// dodge the forward reference.
export const OrdinusPendingInputRequestSchema = z.object({
  requestId: z.string(),
  conversationId: z.string(),
  turnId: z.string(),
  title: z.string(),
  detail: z.string(),
  questions: z.array(InteractionQuestionSchema).min(1).max(3),
  createdAt: z.string()
})

export const OrdinusAnswerInputRequestInputSchema = z.object({
  requestId: z.string().min(1),
  answers: z.array(InteractionAnswerSchema).max(3)
})

export const OrdinusCancelInputRequestInputSchema = z.object({
  requestId: z.string().min(1)
})

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
  // ADR-030 parity: optional full body produced by the agent, shown on demand.
  resultContent: z.string().default(''),
  preview: z.string(),
  status: ConversationTurnStatusSchema,
  error: z.string(),
  logRef: z.string(),
  artifactRefs: z.array(WorkspaceRelativePathSchema),
  changedFiles: z.array(WorkspaceRelativePathSchema),
  truncated: z.boolean(),
  sessionReset: z.boolean().default(false),
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

// 'room' = an agent's canonical 1:1 home conversation; 'group' = a multi-agent
// conversation shown in the Conversations area. See ADR-027.
export const ConversationKindSchema = z.enum(['room', 'group'])

export const ConversationSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  workingRoot: WorkspaceRelativePathSchema,
  mode: ConversationModeSchema,
  kind: ConversationKindSchema.default('group'),
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

export const AgentRoomSummarySchema = z.object({
  agentId: z.string().min(1),
  conversationId: z.string().min(1),
  lastPreview: z.string(),
  lastSpeaker: ConversationTurnSpeakerSchema.nullable(),
  lastActivityAt: z.string().nullable(),
  lastTurnStatus: ConversationTurnStatusSchema.nullable(),
  hasPendingInputRequest: z.boolean()
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

export const ConversationGetOrCreateRoomInputSchema = z.object({
  agentId: z.string().min(1)
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
  workflowDesignId: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  archivedAt: z.string().nullable()
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
  resultContent: z.string(),
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
  agentAvatar: z.string().default(''),
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
  resultContent: z.string().default(''),
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
  resultSummary: z
    .string()
    .trim()
    .min(1, 'Result summary is required.')
    .max(workRunResultSummaryMaxLength),
  resultContent: z.string().trim().max(workRunResultContentMaxLength).default(''),
  artifactRef: z.string().trim().max(500).optional(),
  artifactRefs: z.array(WorkspaceRelativePathSchema).max(64).default([]),
  changedFiles: z.array(WorkspaceRelativePathSchema).max(128).default([]),
  providerSessionRef: z.string().trim().min(1).optional()
})

export const WorkRunFailInputSchema = WorkRunActionInputSchema.extend({
  error: z.string().trim().min(1, 'Error is required.').max(2_000)
})

export const WorkboardDraftItemSchema = z.object({
  tempId: z
    .string()
    .trim()
    .regex(/^item-[0-9]+$/)
    .max(80),
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
  plan: WorkboardDraftPlanSchema,
  // Set only when the request is compiled from a saved workflow design. Null for
  // planner-authored requests. See ADR-025.
  workflowDesignId: z.string().min(1).nullable().default(null)
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
  requestedAgentIds: z.array(z.string().min(1)).max(WORKBOARD_AGENT_LIMIT).default([])
})

export const WorkboardStartRequestPlanInputSchema = z.object({
  originalRequest: z.string().trim().min(1).max(64_000),
  destinationRequestId: z.string().min(1).optional(),
  contextReferences: z.array(WorkboardContextReferenceInputSchema).max(32).default([]),
  requestedAgentIds: z.array(z.string().min(1)).max(WORKBOARD_AGENT_LIMIT).default([]),
  // ADR-031: an explicit Existing-folder choice for a brand-new Work Request.
  // Ignored when destinationRequestId is set (the request inherits that
  // request's folder). When omitted, a new title-based folder is allocated.
  workingRoot: WorkspaceRelativePathSchema.optional(),
  plan: WorkboardDraftPlanSchema
})

// ADR-031: browse folders under the workspace root for the Existing-folder
// picker. `path` is the workspace-relative folder to list (root when omitted).
export const WorkboardListWorkspaceFoldersInputSchema = z.object({
  path: WorkspaceRelativePathSchema.optional()
})

export const WorkboardWorkspaceFolderEntrySchema = z.object({
  name: z.string(),
  // Workspace-relative path of this folder (used as the Work Request workingRoot).
  path: WorkspaceRelativePathSchema,
  hasChildren: z.boolean(),
  // System buckets (e.g. the Projects bucket root) are navigable but not
  // selectable, so the agent is never bound to a bucket root.
  selectable: z.boolean()
})

export const WorkboardListWorkspaceFoldersResultSchema = z.object({
  // The folder currently being listed ('' = workspace root).
  path: z.string(),
  entries: z.array(WorkboardWorkspaceFolderEntrySchema)
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

export const PendingPlanTargetSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('request'),
    destinationRequestId: z.string().min(1).optional(),
    contextReferences: z.array(WorkboardContextReferenceInputSchema).max(32).default([]),
    requestedAgentIds: z.array(z.string().min(1)).max(WORKBOARD_AGENT_LIMIT).default([]),
    // ADR-031: carry the Existing-folder choice through plan review.
    workingRoot: WorkspaceRelativePathSchema.optional()
  }),
  z.object({
    kind: z.literal('follow_up'),
    requestId: z.string().min(1),
    anchorRunId: z.string().min(1).optional()
  })
])

export const PendingPlanSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['request', 'follow_up']),
  request: z.string().trim().min(1).max(64_000),
  target: PendingPlanTargetSchema,
  plan: WorkboardDraftPlanSchema,
  targetRunVersion: z.string().min(1).nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string()
})

export const PendingPlanCreateInputSchema = PendingPlanSchema.pick({
  kind: true,
  request: true,
  target: true,
  plan: true,
  targetRunVersion: true
})

export const WorkboardDataSchema = z.object({
  requests: z.array(WorkRequestSchema),
  runs: z.array(WorkboardRunSchema),
  dependencies: z.array(WorkRunDependencySchema),
  contextReferences: z.array(WorkRunContextReferenceSchema),
  inputRequests: z.array(WorkRunInputRequestSchema)
})

// --- Workflow designs (ADR-025) -------------------------------------------
//
// A workflow design is the durable, reusable canvas the user authors visually.
// Node fields mirror WorkboardDraftItem but are LENIENT (empty allowed): a
// design is a work-in-progress that may have unfilled nodes. The strict
// non-empty + assigned-agent checks live in run-gating at compile time, not at
// save time. Compiling a design strips positions and maps nodes to
// WorkboardDraftItems.

export const WorkflowCanvasNodeSchema = z.object({
  id: z.string().trim().min(1).max(80),
  title: z.string().trim().max(160).default(''),
  instruction: z.string().trim().max(64_000).default(''),
  expectedOutput: z.string().trim().max(2_000).default(''),
  assignedAgentId: z.string().max(160).default(''),
  priority: z.number().int().min(-100).max(100).default(0),
  position: z.object({ x: z.number(), y: z.number() })
})

export const WorkflowCanvasEdgeSchema = z.object({
  id: z.string().trim().min(1).max(80),
  source: z.string().trim().min(1).max(80),
  target: z.string().trim().min(1).max(80)
})

export const WorkflowCanvasSchema = z.object({
  // Capped at 16 to match the WorkboardDraftPlan compile target. A DAG over 16
  // nodes has at most 120 edges; 256 leaves headroom without being unbounded.
  nodes: z.array(WorkflowCanvasNodeSchema).max(16).default([]),
  edges: z.array(WorkflowCanvasEdgeSchema).max(256).default([])
})

export const WorkflowDesignSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2_000).default(''),
  canvas: WorkflowCanvasSchema,
  createdAt: z.string(),
  updatedAt: z.string()
})

export const WorkflowDesignCreateInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2_000).default(''),
  canvas: WorkflowCanvasSchema
})

export const WorkflowDesignUpdateInputSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(2_000).optional(),
  canvas: WorkflowCanvasSchema.optional()
})

export const WorkflowDesignDeleteInputSchema = z.object({
  id: z.string().min(1)
})

export const WorkflowRunTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('new') }),
  z.object({ kind: z.literal('append'), requestId: z.string().min(1) })
])

export const WorkflowRunInputSchema = z.object({
  designId: z.string().min(1),
  target: WorkflowRunTargetSchema
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
  updatedAt: z.string(),
  // ADR-034: live-activity decoration. Populated in-memory by the
  // observability service (not persisted): the conversation this run belongs
  // to (when known) and the latest provider event reduced to a kind + calm
  // label the renderer can phrase. Command labels are blanked in the main
  // process so raw shell text never reaches the renderer.
  conversationId: z.string().nullable().default(null),
  latestEventKind: ObservedRunEventKindSchema.nullable().default(null),
  latestEventLabel: z.string().nullable().default(null)
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

// ADR-036: look up the observed run behind one conversation turn. The turn id
// is the runtime turn id observability records runs under (carried on the
// transcript row as `turnId` — NOT the transcript row id itself). Null when
// the turn was never observed (pre-observability records).
export const ObservedTurnRunInputSchema = z.object({
  turnId: z.string().min(1)
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

export const WorkboardCheckPathsInputSchema = z.object({
  requestId: z.string().min(1)
})

export const WorkboardArchiveRequestInputSchema = z.object({
  requestId: z.string().min(1)
})

export const WorkboardUnarchiveRequestInputSchema = z.object({
  requestId: z.string().min(1)
})

export const WorkboardPathStatusSchema = z.object({
  path: WorkspaceRelativePathSchema,
  exists: z.boolean()
})

export const WorkboardPathStatusListSchema = z.array(WorkboardPathStatusSchema)

export const MarkdownRelativePathSchema = WorkspaceRelativePathSchema.refine(
  (value) => value.toLowerCase().endsWith('.md'),
  'Only Markdown (.md) files can be opened in the document viewer.'
)

export const FileReadInputSchema = z.object({
  path: MarkdownRelativePathSchema
})

export const FileContentSchema = z.object({
  path: MarkdownRelativePathSchema,
  content: z.string(),
  revision: z.string().min(1)
})

// ADR-030: "Save as" materializes a work run's database-backed result content
// into a new Markdown file under the run's module working folder, reported as a
// workspace artifact so it appears in the file provenance panel.
export const WorkboardSaveRunResultResultSchema = z.object({
  path: MarkdownRelativePathSchema
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

export const OrchestrationActionSchema = z.enum(['route', 'conclude'])

export const OrchestrationPlanSchema = z
  .object({
    action: OrchestrationActionSchema.default('route'),
    assignments: z.array(OrchestrationAssignmentSchema).max(8).default([]),
    // Strict structured output emits null (not omission) for the unused branch.
    summary: z
      .string()
      .trim()
      .min(1)
      .max(16_000)
      .nullish()
      .transform((value) => value ?? undefined)
  })
  .superRefine((plan, ctx) => {
    if (plan.action === 'route' && plan.assignments.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['assignments'],
        message: 'A route plan must include at least one assignment.'
      })
    }
    if (plan.action === 'conclude' && !plan.summary) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['summary'],
        message: 'A conclude plan must include a summary.'
      })
    }
  })

export const AgentScheduleDisableReasonSchema = z.enum([
  'failures',
  'wr_archived',
  'manual',
  'completed'
])

export const AgentScheduleLastRunStatusSchema = z.enum(['succeeded', 'failed'])

export const AgentScheduleSchema = z.object({
  id: z.string().min(1),
  agentId: z.string().min(1),
  name: z.string().min(1).max(120),
  prompt: z.string().min(1),
  cron: z.string().nullable(),
  runAt: z.string().nullable(),
  timezone: z.string().min(1),
  linkedWorkRequestId: z.string().min(1).nullable(),
  enabled: z.boolean(),
  lastRunAt: z.string().nullable(),
  nextRunAt: z.string().nullable(),
  lastRunId: z.string().min(1).nullable(),
  lastRunStatus: AgentScheduleLastRunStatusSchema.nullable(),
  consecutiveFailures: z.number().int().nonnegative(),
  disableReason: AgentScheduleDisableReasonSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
})

export const AgentScheduleCreateInputSchema = z
  .object({
    agentId: z.string().min(1),
    name: z.string().trim().min(1).max(120),
    prompt: z.string().trim().min(1).max(16_000),
    cron: z.string().trim().min(1).max(200).nullable().optional(),
    runAt: z.string().trim().min(1).max(40).nullable().optional(),
    timezone: z.string().trim().min(1).max(80),
    linkedWorkRequestId: z.string().min(1).nullable().optional(),
    enabled: z.boolean().optional()
  })
  .refine((value) => Boolean(value.cron || value.runAt), {
    message: 'Schedule must provide a cron expression or a runAt timestamp.'
  })

export const AgentScheduleUpdateInputSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120).optional(),
  prompt: z.string().trim().min(1).max(16_000).optional(),
  cron: z.string().trim().min(1).max(200).nullable().optional(),
  runAt: z.string().trim().min(1).max(40).nullable().optional(),
  timezone: z.string().trim().min(1).max(80).optional(),
  linkedWorkRequestId: z.string().min(1).nullable().optional(),
  enabled: z.boolean().optional()
})

export const AgentScheduleListInputSchema = z.object({
  agentId: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  linkedWorkRequestId: z.string().min(1).optional()
})

export const AgentScheduleGetInputSchema = z.object({ id: z.string().min(1) })
export const AgentScheduleDeleteInputSchema = z.object({ id: z.string().min(1) })
export const AgentScheduleSetEnabledInputSchema = z.object({
  id: z.string().min(1),
  enabled: z.boolean()
})
export const AgentScheduleFireNowInputSchema = z.object({ id: z.string().min(1) })

export type SchedulerEvent =
  | { kind: 'fired'; scheduleId: string; runId: string; requestId: string }
  | { kind: 'fire_failed'; scheduleId: string; error: string }
  | { kind: 'auto_disabled'; scheduleId: string; reason: 'failures' | 'wr_archived' }

export type AgentSchedule = z.infer<typeof AgentScheduleSchema>
export type AgentScheduleDisableReason = z.infer<typeof AgentScheduleDisableReasonSchema>
export type AgentScheduleLastRunStatus = z.infer<typeof AgentScheduleLastRunStatusSchema>
export type AgentScheduleCreateInput = z.infer<typeof AgentScheduleCreateInputSchema>
export type AgentScheduleUpdateInput = z.infer<typeof AgentScheduleUpdateInputSchema>
export type AgentScheduleListInput = z.infer<typeof AgentScheduleListInputSchema>
export type AgentScheduleGetInput = z.infer<typeof AgentScheduleGetInputSchema>
export type AgentScheduleDeleteInput = z.infer<typeof AgentScheduleDeleteInputSchema>
export type AgentScheduleSetEnabledInput = z.infer<typeof AgentScheduleSetEnabledInputSchema>
export type AgentScheduleFireNowInput = z.infer<typeof AgentScheduleFireNowInputSchema>

export type AppInfo = z.infer<typeof AppInfoSchema>
export type SystemPaths = z.infer<typeof SystemPathsSchema>
export type DbStatus = z.infer<typeof DbStatusSchema>
export type OrdinusConversationSummary = z.infer<typeof OrdinusConversationSummarySchema>
export type OrdinusCreateConversationInput = z.infer<typeof OrdinusCreateConversationInputSchema>
export type OrdinusSendTurnInput = z.infer<typeof OrdinusSendTurnInputSchema>
export type OrdinusTurnOutcome = z.infer<typeof OrdinusTurnOutcomeSchema>
export type OrdinusConversationTurnKind = z.infer<typeof OrdinusConversationTurnKindSchema>
export type OrdinusConversationTurn = z.infer<typeof OrdinusConversationTurnSchema>
export type OrdinusListTurnsInput = z.infer<typeof OrdinusListTurnsInputSchema>
export type OrdinusActionEvent = z.infer<typeof OrdinusActionEventSchema>
export type OrdinusPendingConfirmation = z.infer<typeof OrdinusPendingConfirmationSchema>
export type OrdinusConfirmationDecision = z.infer<typeof OrdinusConfirmationDecisionSchema>
export type OrdinusResolveConfirmationInput = z.infer<typeof OrdinusResolveConfirmationInputSchema>
export type OrdinusPendingInputRequest = z.infer<typeof OrdinusPendingInputRequestSchema>
export type OrdinusAnswerInputRequestInput = z.infer<typeof OrdinusAnswerInputRequestInputSchema>
export type OrdinusCancelInputRequestInput = z.infer<typeof OrdinusCancelInputRequestInputSchema>
export type OrdinusSingleton = z.infer<typeof OrdinusSingletonSchema>
export type OrdinusUpdateSingletonInput = z.infer<typeof OrdinusUpdateSingletonInputSchema>
export type OrdinusArchiveConversationInput = z.infer<typeof OrdinusArchiveConversationInputSchema>
export type OrdinusUnarchiveConversationInput = z.infer<
  typeof OrdinusUnarchiveConversationInputSchema
>
export type OrdinusDeleteConversationInput = z.infer<typeof OrdinusDeleteConversationInputSchema>
export type OrdinusUpdateConversationTitleInput = z.infer<
  typeof OrdinusUpdateConversationTitleInputSchema
>
export type OrdinusSetConversationPinnedInput = z.infer<
  typeof OrdinusSetConversationPinnedInputSchema
>
export type OrdinusCancelTurnInput = z.infer<typeof OrdinusCancelTurnInputSchema>
export type OrdinusRevealPathInput = z.infer<typeof OrdinusRevealPathInputSchema>
export type OrdinusMemoryEntry = z.infer<typeof OrdinusMemoryEntrySchema>
export type OrdinusWriteMemoryInput = z.infer<typeof OrdinusWriteMemoryInputSchema>
export type OrdinusDeleteMemoryInput = z.infer<typeof OrdinusDeleteMemoryInputSchema>
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

/** Every category a profile belongs to: its home category plus any extras, de-duplicated. */
export function agentProfileCategories(
  profile: Pick<AgentProfile, 'category' | 'categories'>
): string[] {
  return [...new Set([profile.category, ...profile.categories])]
}
export type AgentProfileCatalog = z.infer<typeof AgentProfileCatalogSchema>
export type AgentDraftFromIntentInput = z.infer<typeof AgentDraftFromIntentInputSchema>
export type AgentDraftFromProfileInput = z.infer<typeof AgentDraftFromProfileInputSchema>
export type AgentDraft = z.infer<typeof AgentDraftSchema>
export type AgentCreateInput = z.infer<typeof AgentCreateInputSchema>
export type AgentUpdateInstructionsInput = z.infer<typeof AgentUpdateInstructionsInputSchema>
export type AgentUpdateSettingsInput = z.infer<typeof AgentUpdateSettingsInputSchema>
export type AgentSetPinnedInput = z.infer<typeof AgentSetPinnedInputSchema>
export type AgentDeleteInput = z.infer<typeof AgentDeleteInputSchema>
export type AgentDeleteResult = z.infer<typeof AgentDeleteResultSchema>
export type AgentExtraDirectoryAddInput = z.infer<typeof AgentExtraDirectoryAddInputSchema>
export type AgentExtraDirectoryRemoveInput = z.infer<typeof AgentExtraDirectoryRemoveInputSchema>
export type AgentExtraDirectoryListInput = z.infer<typeof AgentExtraDirectoryListInputSchema>
export type AgentExtraDirectoryEntry = z.infer<typeof AgentExtraDirectoryEntrySchema>
export type AgentExtraDirectoryList = z.infer<typeof AgentExtraDirectoryListSchema>
export type AgentExtraDirectoryAddResult = z.infer<typeof AgentExtraDirectoryAddResultSchema>
export type AgentExtraDirectoryErrorCode = z.infer<typeof AgentExtraDirectoryErrorCodeSchema>
export type AgentSkill = z.infer<typeof AgentSkillSchema>
export type AgentSkillDetail = z.infer<typeof AgentSkillDetailSchema>
export type AgentSkillsListInput = z.infer<typeof AgentSkillsListInputSchema>
export type AgentSkillGetInput = z.infer<typeof AgentSkillGetInputSchema>
export type AgentSkillCreateInput = z.infer<typeof AgentSkillCreateInputSchema>
export type AgentSkillUpdateInput = z.infer<typeof AgentSkillUpdateInputSchema>
export type AgentSkillDeleteInput = z.infer<typeof AgentSkillDeleteInputSchema>
export type AgentSkillDeleteResult = z.infer<typeof AgentSkillDeleteResultSchema>
export type AgentMemoryRule = z.infer<typeof AgentMemoryRuleSchema>
export type AgentMemoryListInput = z.infer<typeof AgentMemoryListInputSchema>
export type AgentMemoryAddInput = z.infer<typeof AgentMemoryAddInputSchema>
export type AgentMemoryUpdateInput = z.infer<typeof AgentMemoryUpdateInputSchema>
export type AgentMemoryDeactivateInput = z.infer<typeof AgentMemoryDeactivateInputSchema>
export type AgentMemoryDeactivateResult = z.infer<typeof AgentMemoryDeactivateResultSchema>
export type AgentArchiveInput = z.infer<typeof AgentArchiveInputSchema>
export type AgentReflectionEntry = z.infer<typeof AgentReflectionEntrySchema>
export type AgentReflectionSummary = z.infer<typeof AgentReflectionSummarySchema>
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
export type AgentRoomSummary = z.infer<typeof AgentRoomSummarySchema>
export type ConversationDetail = z.infer<typeof ConversationDetailSchema>
export type ConversationGetInput = z.infer<typeof ConversationGetInputSchema>
export type ConversationKind = z.infer<typeof ConversationKindSchema>
export type ConversationCreateDirectInput = z.infer<typeof ConversationCreateDirectInputSchema>
export type ConversationGetOrCreateRoomInput = z.infer<
  typeof ConversationGetOrCreateRoomInputSchema
>
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
export type PendingPlanTarget = z.infer<typeof PendingPlanTargetSchema>
export type PendingPlan = z.infer<typeof PendingPlanSchema>
export type PendingPlanCreateInput = z.input<typeof PendingPlanCreateInputSchema>
export type WorkboardGeneratePlanInput = z.infer<typeof WorkboardGeneratePlanInputSchema>
export type WorkboardStartRequestInput = z.infer<typeof WorkboardStartRequestInputSchema>
export type WorkboardStartRequestInputData = z.input<typeof WorkboardStartRequestInputSchema>
export type WorkflowCanvasNode = z.infer<typeof WorkflowCanvasNodeSchema>
export type WorkflowCanvasEdge = z.infer<typeof WorkflowCanvasEdgeSchema>
export type WorkflowCanvas = z.infer<typeof WorkflowCanvasSchema>
export type WorkflowDesign = z.infer<typeof WorkflowDesignSchema>
export type WorkflowDesignCreateInput = z.input<typeof WorkflowDesignCreateInputSchema>
export type WorkflowDesignUpdateInput = z.input<typeof WorkflowDesignUpdateInputSchema>
export type WorkflowDesignDeleteInput = z.infer<typeof WorkflowDesignDeleteInputSchema>
export type WorkflowRunTarget = z.infer<typeof WorkflowRunTargetSchema>
export type WorkflowRunInput = z.infer<typeof WorkflowRunInputSchema>
export type WorkboardDirectStartInput = z.infer<typeof WorkboardDirectStartInputSchema>
export type WorkboardRequestDestination = z.infer<typeof WorkboardRequestDestinationSchema>
export type WorkboardContextReferenceInput = z.infer<typeof WorkboardContextReferenceInputSchema>
export type WorkboardGenerateRequestPlanInput = z.infer<
  typeof WorkboardGenerateRequestPlanInputSchema
>
export type WorkboardStartRequestPlanInput = z.infer<typeof WorkboardStartRequestPlanInputSchema>
export type WorkboardListWorkspaceFoldersInput = z.infer<
  typeof WorkboardListWorkspaceFoldersInputSchema
>
export type WorkboardWorkspaceFolderEntry = z.infer<typeof WorkboardWorkspaceFolderEntrySchema>
export type WorkboardListWorkspaceFoldersResult = z.infer<
  typeof WorkboardListWorkspaceFoldersResultSchema
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
export type ObservedTurnRunInput = z.infer<typeof ObservedTurnRunInputSchema>
export type ObservedRunDiagnosticsInput = z.infer<typeof ObservedRunDiagnosticsInputSchema>
export type ObservedRunDiagnostics = z.infer<typeof ObservedRunDiagnosticsSchema>
export type WorkboardAnswerInputRequestInput = z.infer<
  typeof WorkboardAnswerInputRequestInputSchema
>
export type WorkboardRevealPathInput = z.infer<typeof WorkboardRevealPathInputSchema>
export type WorkboardCheckPathsInput = z.infer<typeof WorkboardCheckPathsInputSchema>
export type WorkboardArchiveRequestInput = z.infer<typeof WorkboardArchiveRequestInputSchema>
export type WorkboardUnarchiveRequestInput = z.infer<typeof WorkboardUnarchiveRequestInputSchema>
export type WorkboardPathStatus = z.infer<typeof WorkboardPathStatusSchema>
export type FileReadInput = z.infer<typeof FileReadInputSchema>
export type FileContent = z.infer<typeof FileContentSchema>
export type WorkboardSaveRunResultResult = z.infer<typeof WorkboardSaveRunResultResultSchema>
export type OrchestrationAssignment = z.infer<typeof OrchestrationAssignmentSchema>
export type OrchestrationAction = z.infer<typeof OrchestrationActionSchema>
export type OrchestrationPlan = z.infer<typeof OrchestrationPlanSchema>
