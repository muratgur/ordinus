import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

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
  workspaceRoot: text('workspace_root').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
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
  workspaceRoot: text('workspace_root').notNull(),
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

export const workRequests = sqliteTable('work_requests', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  originalRequest: text('original_request').notNull(),
  summary: text('summary').notNull(),
  workspaceRoot: text('workspace_root').notNull().default(''),
  artifactRoot: text('artifact_root').notNull().default(''),
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
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})
