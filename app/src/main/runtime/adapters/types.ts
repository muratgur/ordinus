import type { ChildProcess } from 'node:child_process'
import type {
  AgentDraft,
  AgentSkillDraft,
  AgentDraftFromIntentInput,
  AgentSandbox,
  AgentTurnOutcome,
  OrchestrationPlan,
  ProviderActionInput,
  ProviderConnectInput,
  ProviderConnectResult,
  ProviderId,
  ProviderStatus,
  WorkboardDraftPlan,
  WorkRunInputSummary
} from '@shared/contracts'
import type { RuntimeOrchestrationPlanInput } from '../prompts/orchestration'
import type { RuntimeWorkboardPlanInput } from '../prompts/work-plan'
import type { RuntimeObservationSink } from '../../observability/types'

export type { RuntimeOrchestrationPlanInput } from '../prompts/orchestration'
export type { RuntimeWorkboardPlanInput } from '../prompts/work-plan'

export type ProviderLoginProcess = {
  child: ChildProcess
  authUrl: string
  finished: boolean
  cleanupTimer: NodeJS.Timeout | null
}

export type ProviderConversationProcess = {
  child: ChildProcess
  cancelled: boolean
  cleanupTimer: NodeJS.Timeout | null
}

export type RuntimeAgentDraftInput = AgentDraftFromIntentInput & {
  providerId: ProviderId
  model: string
}

// ADR-040: one-shot skill drafting by the owning agent (no session, JSON out).
export type RuntimeSkillDraftInput = {
  providerId: ProviderId
  model: string
  agentName: string
  agentRole: string
  instructions: string
  request: string
}

export type ProviderRuntimeContext = {
  loginProcesses: Map<ProviderId, ProviderLoginProcess>
  conversationProcesses: Map<string, ProviderConversationProcess>
}

export type RuntimeConversationTurnInput = {
  turnId: string
  conversationId: string
  providerId: ProviderId
  model: string
  sandbox: AgentSandbox
  workspaceRoot: string
  workingRoot: string
  agentHomePath: string
  extraDirectories: string[]
  agentName: string
  agentRole: string
  instructions: string
  connectors: string[]
  providerSessionRef: string | null
  // ADR-040: skill set already announced to the session being resumed
  // (skillId → SKILL.md mtime). `null` = session tracked but nothing announced
  // yet (announce the full current set once); `undefined` = caller does not
  // track announcements, so no delta is emitted (Workboard today).
  announcedSkills?: Record<string, string> | null
  message: string
  logRef: string
  eventLogPath: string
  lastMessagePath: string
  observability?: RuntimeObservationSink
  // ADR-029: extra MCP servers to merge alongside `connectors` when materializing
  // the CLI's MCP config. Used by the Ordinus assistant runtime to inject its
  // internal tool server (ordinus-mcp/server.ts). No vault auth — these are
  // process-local servers reached over loopback. Adapters that ignore this
  // field stay backward-compatible; the existing connector path is unchanged.
  additionalMcpServers?: ReadonlyArray<{
    id: string
    url: string
    codexDefaultToolsApprovalMode?: 'auto' | 'prompt' | 'approve'
  }>
}

export type RuntimeConversationTurnResult = {
  providerSessionRef: string
  outcome: AgentTurnOutcome
  logRef: string
  // True when this turn ran on a fresh provider session after the stored one
  // could not resume (ADR-013 fallback). Adapters leave this unset; the runtime
  // service sets it on the fallback path.
  sessionReset?: boolean
  // ADR-040: the skill set this turn made known to the provider session
  // (skillId → mtime). Persisted next to providerSessionRef so later resumes
  // diff against it. Only adapters with prompt-based discovery (Codex) set it.
  announcedSkills?: Record<string, string>
}

export type RuntimeWorkRunInput = {
  runId: string
  workRequestId: string
  providerId: ProviderId
  model: string
  sandbox: AgentSandbox
  workspaceRoot: string
  workingRoot: string
  agentHomePath: string
  extraDirectories: string[]
  agentName: string
  agentRole: string
  instructions: string
  connectors: string[]
  providerSessionRef: string | null
  // ADR-040: same announced-skills contract as RuntimeConversationTurnInput.
  announcedSkills?: Record<string, string> | null
  title: string
  instruction: string
  expectedOutput: string
  requiredInputs: WorkRunInputSummary[]
  resumeMessage?: string
  logRef: string
  eventLogPath: string
  lastMessagePath: string
  observability?: RuntimeObservationSink
  // ADR-037: the request-scoped worker MCP endpoint (get_work_run_result),
  // injected alongside connectors exactly like the assistant's server above.
  additionalMcpServers?: RuntimeConversationTurnInput['additionalMcpServers']
}

export type RuntimeWorkRunResult = RuntimeConversationTurnResult

export type ProviderAdapter = {
  id: ProviderId
  label: string
  getStatus(context: ProviderRuntimeContext): Promise<ProviderStatus> | ProviderStatus
  refreshProvider?(
    input: ProviderActionInput,
    context: ProviderRuntimeContext
  ): Promise<ProviderStatus> | ProviderStatus
  connectProvider?(
    input: ProviderConnectInput,
    context: ProviderRuntimeContext
  ): Promise<ProviderConnectResult>
  disconnectProvider?(
    input: ProviderActionInput,
    context: ProviderRuntimeContext
  ): Promise<ProviderStatus> | ProviderStatus
  generateAgentDraft?(
    input: RuntimeAgentDraftInput,
    context: ProviderRuntimeContext
  ): Promise<AgentDraft>
  generateSkillDraft?(
    input: RuntimeSkillDraftInput,
    context: ProviderRuntimeContext
  ): Promise<AgentSkillDraft>
  generateOrchestrationPlan?(
    input: RuntimeOrchestrationPlanInput,
    context: ProviderRuntimeContext
  ): Promise<OrchestrationPlan>
  generateWorkboardPlan?(
    input: RuntimeWorkboardPlanInput,
    context: ProviderRuntimeContext
  ): Promise<WorkboardDraftPlan>
  sendConversationTurn?(
    input: RuntimeConversationTurnInput,
    context: ProviderRuntimeContext
  ): Promise<RuntimeConversationTurnResult>
}
