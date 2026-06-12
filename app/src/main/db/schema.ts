import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const appMeta = sqliteTable('app_meta', {
  id: integer('id').primaryKey(),
  schemaVersion: integer('schema_version').notNull(),
  // ISO timestamp set the moment the user successfully completes onboarding.
  // App.tsx gates the legacy setup screen on this — null means "still
  // onboarding". See ADR-028.
  onboardedAt: text('onboarded_at'),
  // Resumable onboarding state machine snapshot, JSON-encoded
  // OnboardingState (see contracts.ts). Null until the user starts the
  // flow; cleared once onboardedAt is set.
  onboardingState: text('onboarding_state'),
  // The ADR-029 `ordinus_v1` kill switch was retired once M0–M8 shipped —
  // Ordinus is unconditionally on. The drop is handled by migration
  // 0035_drop_ordinus_v1.sql so existing DBs lose the column too.
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

export const workspaceConfig = sqliteTable('workspace_config', {
  id: integer('id').primaryKey(),
  workspaceRoot: text('workspace_root').notNull(),
  workspaceName: text('workspace_name').notNull(),
  defaultProviderId: text('default_provider_id').notNull().default('codex'),
  defaultModel: text('default_model').notNull().default('default'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  role: text('role').notNull(),
  capabilities: text('capabilities').notNull().default(''),
  requestedWork: text('requested_work').notNull(),
  instructions: text('instructions').notNull(),
  providerId: text('provider_id').notNull(),
  model: text('model').notNull(),
  sandbox: text('sandbox').notNull(),
  connectors: text('connectors', { mode: 'json' }).$type<string[]>().notNull().default([]),
  extraDirectories: text('extra_directories', { mode: 'json' })
    .$type<string[]>()
    .notNull()
    .default([]),
  enabled: integer('enabled', { mode: 'boolean' }).notNull(),
  avatar: text('avatar').notNull().default(''),
  pinnedAt: text('pinned_at'),
  lastUsedAt: text('last_used_at'),
  useCount: integer('use_count').notNull().default(0),
  archivedAt: text('archived_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

export const agentMemory = sqliteTable(
  'agent_memory',
  {
    id: text('id').primaryKey(),
    agentId: text('agent_id').notNull(),
    rule: text('rule').notNull(),
    sourceFeedbackId: text('source_feedback_id'),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull()
  },
  (table) => ({
    agentActiveIdx: index('agent_memory_agent_active_idx').on(table.agentId, table.active)
  })
)

export const conversations = sqliteTable(
  'conversations',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    workingRoot: text('working_root').notNull().default(''),
    mode: text('mode').notNull(),
    // 'room' = an agent's canonical 1:1 home conversation; 'group' = everything
    // shown in the Conversations area (multi-agent). See ADR-027.
    kind: text('kind').notNull().default('group'),
    routingMode: text('routing_mode').notNull().default('manual'),
    status: text('status').notNull(),
    summary: text('summary').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull()
  },
  (table) => ({
    kindIdx: index('conversations_kind_idx').on(table.kind)
  })
)

export const conversationParticipants = sqliteTable('conversation_participants', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull(),
  agentId: text('agent_id').notNull(),
  providerId: text('provider_id').notNull(),
  model: text('model').notNull(),
  providerSessionRef: text('provider_session_ref'),
  // ADR-040: JSON map of skillId → SKILL.md mtime announced to THIS session.
  // Lives and dies with providerSessionRef (written together, reset together);
  // Codex resume turns carry only the diff against it. Null = nothing
  // announced yet → the next resume announces the full current set once.
  announcedSkills: text('announced_skills'),
  status: text('status').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

export const conversationTurns = sqliteTable('conversation_turns', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull(),
  participantId: text('participant_id').notNull(),
  sequence: integer('sequence').notNull(),
  speaker: text('speaker').notNull(),
  content: text('content').notNull(),
  // ADR-030 parity: `content` holds the always-shown summary; `resultContent`
  // holds the optional full body the agent produced (surfaced on demand).
  resultContent: text('result_content').notNull().default(''),
  preview: text('preview').notNull(),
  status: text('status').notNull(),
  error: text('error').notNull(),
  logRef: text('log_ref').notNull(),
  artifactRefs: text('artifact_refs').notNull().default('[]'),
  changedFiles: text('changed_files').notNull().default('[]'),
  truncated: integer('truncated', { mode: 'boolean' }).notNull(),
  // True when the provider session could not resume and a fresh session was
  // started for this turn (ADR-013 fallback). The room shows a gentle note.
  sessionReset: integer('session_reset', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

export const conversationInputRequests = sqliteTable('conversation_input_requests', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull(),
  turnId: text('turn_id').notNull(),
  participantId: text('participant_id').notNull(),
  status: text('status').notNull(),
  title: text('title').notNull(),
  detail: text('detail').notNull(),
  questions: text('questions').notNull(),
  answers: text('answers'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

export const workRuns = sqliteTable('work_runs', {
  id: text('id').primaryKey(),
  rootRunId: text('root_run_id').notNull(),
  parentRunId: text('parent_run_id'),
  assignedAgentId: text('assigned_agent_id').notNull(),
  assignedAgentName: text('assigned_agent_name').notNull().default('Former agent'),
  assignedAgentRole: text('assigned_agent_role').notNull().default(''),
  createdByType: text('created_by_type').notNull(),
  createdByAgentId: text('created_by_agent_id'),
  sourceType: text('source_type'),
  sourceId: text('source_id'),
  sourceItemId: text('source_item_id'),
  title: text('title').notNull(),
  instruction: text('instruction').notNull(),
  status: text('status').notNull(),
  priority: integer('priority').notNull().default(0),
  providerId: text('provider_id').notNull(),
  model: text('model').notNull(),
  providerSessionRef: text('provider_session_ref'),
  workingRoot: text('working_root').notNull().default(''),
  sandbox: text('sandbox').notNull(),
  expectedOutput: text('expected_output').notNull().default(''),
  resultSummary: text('result_summary').notNull().default(''),
  resultContent: text('result_content').notNull().default(''),
  resultArtifactRef: text('result_artifact_ref').notNull().default(''),
  artifactRefs: text('artifact_refs').notNull().default('[]'),
  changedFiles: text('changed_files').notNull().default('[]'),
  error: text('error').notNull().default(''),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  startedAt: text('started_at'),
  completedAt: text('completed_at')
})

export const workRequestAgentSessions = sqliteTable(
  'work_request_agent_sessions',
  {
    id: text('id').primaryKey(),
    requestId: text('request_id').notNull(),
    agentId: text('agent_id').notNull(),
    providerId: text('provider_id').notNull(),
    model: text('model').notNull(),
    providerSessionRef: text('provider_session_ref'),
    // ADR-040: same announced-skills contract as conversation_participants.
    // Column ships now; the Workboard delta wiring is a known follow-up.
    announcedSkills: text('announced_skills'),
    status: text('status').notNull(),
    lastRunId: text('last_run_id'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull()
  },
  (table) => ({
    requestAgentUnique: uniqueIndex('work_request_agent_sessions_request_agent_unique').on(
      table.requestId,
      table.agentId
    )
  })
)

export const workRequests = sqliteTable('work_requests', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  originalRequest: text('original_request').notNull(),
  summary: text('summary').notNull(),
  workingRoot: text('working_root').notNull().default(''),
  status: text('status').notNull(),
  // Set only when a Work Request is created from a saved workflow design (new-WR
  // path). Null for planner-authored requests and for follow-up appends. See
  // ADR-025.
  workflowDesignId: text('workflow_design_id'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
  archivedAt: text('archived_at')
})

export const workflowDesigns = sqliteTable('workflow_designs', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  // Single canvas blob: nodes (task fields + x/y) and edges. Positions live only
  // here; they are stripped when compiling to a WorkboardDraftPlan. See ADR-025.
  canvas: text('canvas', { mode: 'json' }).$type<unknown>().notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

export const pendingPlans = sqliteTable('pending_plans', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  request: text('request').notNull(),
  target: text('target', { mode: 'json' }).$type<unknown>().notNull(),
  plan: text('plan', { mode: 'json' }).$type<unknown>().notNull(),
  targetRunVersion: text('target_run_version'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

export const workRunDependencies = sqliteTable('work_run_dependencies', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull(),
  dependsOnRunId: text('depends_on_run_id').notNull(),
  status: text('status').notNull(),
  createdAt: text('created_at').notNull(),
  resolvedAt: text('resolved_at')
})

export const workRunContextReferences = sqliteTable(
  'work_run_context_references',
  {
    id: text('id').primaryKey(),
    runId: text('run_id').notNull(),
    kind: text('kind').notNull(),
    refId: text('ref_id').notNull(),
    label: text('label').notNull(),
    metadata: text('metadata').notNull().default('{}'),
    createdAt: text('created_at').notNull()
  },
  (table) => ({
    runIdx: index('work_run_context_references_run_id_idx').on(table.runId),
    kindRefIdx: index('work_run_context_references_kind_ref_idx').on(table.kind, table.refId)
  })
)

export const workRunEvents = sqliteTable('work_run_events', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull(),
  sequence: integer('sequence').notNull(),
  kind: text('kind').notNull(),
  payload: text('payload').notNull(),
  createdAt: text('created_at').notNull()
})

export const workRunInputRequests = sqliteTable('work_run_input_requests', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull(),
  status: text('status').notNull(),
  title: text('title').notNull(),
  detail: text('detail').notNull(),
  questions: text('questions').notNull(),
  answers: text('answers'),
  resumeMessage: text('resume_message').notNull().default(''),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

export const observedRuns = sqliteTable(
  'observed_runs',
  {
    id: text('id').primaryKey(),
    sourceSurface: text('source_surface').notNull(),
    sourceItemId: text('source_item_id').notNull(),
    sourceItemTitle: text('source_item_title').notNull().default(''),
    assignedAgentId: text('assigned_agent_id').notNull().default(''),
    assignedAgentName: text('assigned_agent_name').notNull().default(''),
    assignedAgentRole: text('assigned_agent_role').notNull().default(''),
    providerId: text('provider_id').notNull(),
    model: text('model').notNull(),
    lifecycleStatus: text('lifecycle_status').notNull(),
    livenessHealth: text('liveness_health').notNull(),
    currentPhase: text('current_phase').notNull(),
    latestActivity: text('latest_activity').notNull().default(''),
    latestActivityAt: text('latest_activity_at'),
    queuedAt: text('queued_at'),
    startedAt: text('started_at'),
    firstActivityAt: text('first_activity_at'),
    lastActivityAt: text('last_activity_at'),
    completedAt: text('completed_at'),
    inputTokens: integer('input_tokens'),
    cachedInputTokens: integer('cached_input_tokens'),
    outputTokens: integer('output_tokens'),
    totalTokens: integer('total_tokens'),
    // ADR-037: per-run cost derived from the raw counters above. For
    // cumulative reporters (Codex) this is raw minus the previous run's raw
    // on the same provider session; for per-invocation reporters it equals
    // the raw values.
    deltaInputTokens: integer('delta_input_tokens'),
    deltaCachedInputTokens: integer('delta_cached_input_tokens'),
    deltaOutputTokens: integer('delta_output_tokens'),
    deltaTotalTokens: integer('delta_total_tokens'),
    usageSource: text('usage_source').notNull().default('unavailable'),
    // ADR-037: '' until known, then 'cumulative' or 'invocation'; plus the
    // provider session/thread this run executed on — the chain key delta
    // computation uses to find its baseline.
    usageSemantics: text('usage_semantics').notNull().default(''),
    providerSessionRef: text('provider_session_ref').notNull().default(''),
    sanitizedInvocation: text('sanitized_invocation').notNull().default('{}'),
    logRef: text('log_ref').notNull().default(''),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull()
  },
  (table) => ({
    sourceUnique: uniqueIndex('observed_runs_source_unique').on(
      table.sourceSurface,
      table.sourceItemId
    )
  })
)

export const agentSchedules = sqliteTable(
  'agent_schedules',
  {
    id: text('id').primaryKey(),
    agentId: text('agent_id').notNull(),
    name: text('name').notNull(),
    prompt: text('prompt').notNull(),
    cron: text('cron'),
    runAt: text('run_at'),
    timezone: text('timezone').notNull(),
    linkedWorkRequestId: text('linked_work_request_id'),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    lastRunAt: text('last_run_at'),
    nextRunAt: text('next_run_at'),
    lastRunId: text('last_run_id'),
    lastRunStatus: text('last_run_status'),
    consecutiveFailures: integer('consecutive_failures').notNull().default(0),
    disableReason: text('disable_reason'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull()
  },
  (table) => ({
    agentIdx: index('agent_schedules_agent_idx').on(table.agentId),
    linkedRequestIdx: index('agent_schedules_linked_request_idx').on(table.linkedWorkRequestId),
    enabledNextRunIdx: index('agent_schedules_enabled_next_run_idx').on(
      table.enabled,
      table.nextRunAt
    )
  })
)

export const observedRunEvents = sqliteTable(
  'observed_run_events',
  {
    id: text('id').primaryKey(),
    observedRunId: text('observed_run_id').notNull(),
    sequence: integer('sequence').notNull(),
    timestamp: text('timestamp').notNull(),
    kind: text('kind').notNull(),
    source: text('source').notNull(),
    confidence: text('confidence').notNull(),
    phase: text('phase'),
    lifecycleStatus: text('lifecycle_status'),
    summary: text('summary').notNull().default(''),
    payload: text('payload').notNull().default('{}'),
    createdAt: text('created_at').notNull()
  },
  (table) => ({
    runSequenceIdx: index('observed_run_events_run_sequence_idx').on(
      table.observedRunId,
      table.sequence
    )
  })
)

// --- ADR-029: Ordinus assistant ---------------------------------------------
// Single-row table holding the Ordinus persona + provider/model config. Following
// the workspace_config pattern, the row is keyed at `id = 1` and lazily seeded
// on first read using the active workspace's default provider/model.
export const ordinusSingleton = sqliteTable('ordinus_singleton', {
  id: integer('id').primaryKey(),
  providerId: text('provider_id').notNull(),
  model: text('model').notNull().default('default'),
  displayName: text('display_name').notNull().default('Ordinus'),
  // Optional avatar identifier (URL, asset key, or built-in name). Resolution
  // policy lives in the renderer; the DB just stores the string.
  avatarRef: text('avatar_ref'),
  // Free-form text appended to the system prompt at session init. Lets the user
  // shape Ordinus's tone or add personal context without editing the knowledge
  // pack. Null until the user opens the persona editor.
  extraInstructions: text('extra_instructions'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

// Per-conversation metadata. Transcripts live in the provider CLI's resumable
// session (ADR-003 pattern reused); we only persist what's needed to list,
// resume, archive, and detect provider drift.
//   - providerId/model: the provider this conversation was opened against.
//     Stays fixed for the conversation's lifetime; new conversations pick up
//     the current singleton provider.
//   - providerSessionRef: the CLI's session id, used with `--resume`. Null
//     before the first turn returns; cleared if ADR-013 fresh-start fallback
//     fires and the runtime decides to abandon the old session.
//   - archivedAt / frozenReason: soft state. Frozen happens when the original
//     provider becomes unavailable (ADR-029 §7); the banner UI keys off this.
export const ordinusConversations = sqliteTable('ordinus_conversations', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  providerId: text('provider_id').notNull(),
  model: text('model').notNull(),
  providerSessionRef: text('provider_session_ref'),
  archivedAt: text('archived_at'),
  pinnedAt: text('pinned_at'),
  frozenReason: text('frozen_reason'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

// Cross-conversation persistent memory (ADR-029 §6). Surfaced to Ordinus through
// memory_search / memory_write tools (added in M3). Type taxonomy starts loose
// and is allowed to evolve — kept as a text column rather than an enum so the
// LLM can introduce new types without a migration.
export const ordinusMemory = sqliteTable('ordinus_memory', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  name: text('name').notNull(),
  body: text('body').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

// ADR-029 M4.5 — Per-turn transcript persistence for Ordinus conversations.
//
// We initially relied on the provider CLI's own resumable session to hold the
// transcript (ADR-003 pattern, which is correct for agent conversations) and
// only kept the rendered messages in renderer React state. That broke when the
// user navigated away from Home and back — the React state unmounted and the
// transcript "vanished" even though the CLI session was still alive.
//
// Adding our own copy of the rendered turns gives the UI a durable source of
// truth across renderer remounts (and app restarts). The CLI continues to be
// the source of truth for the LLM's working context via --resume; this table
// is purely a UI/display copy.
//
// Kind taxonomy:
//   - 'user'      — what the user typed (always paired with a downstream
//                   assistant or error turn from the same sendTurn call)
//   - 'assistant' — Ordinus's final_response content
//   - 'error'     — failure surfacing (runtime error, MCP failure, etc.)
// Status indicators ("Ordinus is thinking…") are transient and intentionally
// NOT persisted — they belong to the in-flight UI moment, not the record.
export const ordinusConversationTurns = sqliteTable(
  'ordinus_conversation_turns',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id').notNull(),
    kind: text('kind').notNull(),
    content: text('content').notNull(),
    // ADR-030 parity: `content` holds the always-shown summary; `resultContent`
    // holds the optional full produced body, surfaced on demand in the
    // transcript ("Show full response"). Empty for user/error turns and for
    // assistant turns whose deliverable was a file rather than text.
    resultContent: text('result_content').notNull().default(''),
    // ADR-030/ADR-035 parity with conversation turns: JSON-encoded arrays of
    // workspace-relative paths the turn produced/changed, so Home can render
    // the "files touched" row like agent rooms do.
    artifactRefs: text('artifact_refs').notNull().default('[]'),
    changedFiles: text('changed_files').notNull().default('[]'),
    // The runtime turnId (`ot-...`) when the turn was the assistant's reply or
    // an error within a sendTurn cycle. Null for the user-message turn that
    // initiated the cycle, since the runtime turnId is only minted in the
    // backend after the user message is recorded.
    turnId: text('turn_id'),
    createdAt: text('created_at').notNull()
  },
  (table) => ({
    conversationCreatedIdx: index('ordinus_conversation_turns_conversation_created_idx').on(
      table.conversationId,
      table.createdAt
    )
  })
)

// Ordinus needs_input requests. Unlike agent conversations, Ordinus does NOT
// render questions inline in the transcript — they surface as a panel that
// emerges from the input area (project_ordinus_home_design). Persisting them
// here (rather than the in-memory confirmation store) lets the panel rehydrate
// after an app restart while a question is still pending.
//   - questions: JSON-encoded InteractionQuestion[] (mirrors conversation_input_requests)
//   - status: 'pending' | 'answered' | 'cancelled'
export const ordinusInputRequests = sqliteTable(
  'ordinus_input_requests',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id').notNull(),
    turnId: text('turn_id').notNull(),
    status: text('status').notNull().default('pending'),
    title: text('title').notNull(),
    detail: text('detail').notNull().default(''),
    questions: text('questions').notNull(),
    answers: text('answers'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull()
  },
  (table) => ({
    conversationStatusIdx: index('ordinus_input_requests_conversation_status_idx').on(
      table.conversationId,
      table.status
    )
  })
)
