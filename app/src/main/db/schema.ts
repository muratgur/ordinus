import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const appMeta = sqliteTable('app_meta', {
  id: integer('id').primaryKey(),
  schemaVersion: integer('schema_version').notNull(),
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
  requestedWork: text('requested_work').notNull(),
  instructions: text('instructions').notNull(),
  providerId: text('provider_id').notNull(),
  model: text('model').notNull(),
  sandbox: text('sandbox').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  workingRoot: text('working_root').notNull().default(''),
  mode: text('mode').notNull(),
  routingMode: text('routing_mode').notNull().default('manual'),
  status: text('status').notNull(),
  summary: text('summary').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

export const conversationParticipants = sqliteTable('conversation_participants', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull(),
  agentId: text('agent_id').notNull(),
  providerId: text('provider_id').notNull(),
  model: text('model').notNull(),
  providerSessionRef: text('provider_session_ref'),
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
  preview: text('preview').notNull(),
  status: text('status').notNull(),
  error: text('error').notNull(),
  logRef: text('log_ref').notNull(),
  artifactRefs: text('artifact_refs').notNull().default('[]'),
  changedFiles: text('changed_files').notNull().default('[]'),
  truncated: integer('truncated', { mode: 'boolean' }).notNull(),
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
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  startedAt: text('started_at'),
  completedAt: text('completed_at')
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
    outputTokens: integer('output_tokens'),
    totalTokens: integer('total_tokens'),
    usageSource: text('usage_source').notNull().default('unavailable'),
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
