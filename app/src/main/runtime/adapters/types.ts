import type { ChildProcess } from 'node:child_process'
import type {
  AgentDraft,
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
  agentName: string
  agentRole: string
  instructions: string
  connectors: string[]
  providerSessionRef: string | null
  message: string
  logRef: string
  eventLogPath: string
  lastMessagePath: string
  observability?: RuntimeObservationSink
}

export type RuntimeConversationTurnResult = {
  providerSessionRef: string
  outcome: AgentTurnOutcome
  logRef: string
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
  agentName: string
  agentRole: string
  instructions: string
  connectors: string[]
  providerSessionRef: string | null
  title: string
  instruction: string
  expectedOutput: string
  requiredInputs: WorkRunInputSummary[]
  resumeMessage?: string
  logRef: string
  eventLogPath: string
  lastMessagePath: string
  observability?: RuntimeObservationSink
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
