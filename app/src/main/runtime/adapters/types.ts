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
  ProviderStatus
} from '@shared/contracts'
import type { RuntimeOrchestrationPlanInput } from '../prompts/orchestration'

export type { RuntimeOrchestrationPlanInput } from '../prompts/orchestration'

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
  agentName: string
  agentRole: string
  instructions: string
  providerSessionRef: string | null
  message: string
  logRef: string
  eventLogPath: string
  lastMessagePath: string
}

export type RuntimeConversationTurnResult = {
  providerSessionRef: string
  outcome: AgentTurnOutcome
  logRef: string
}

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
  generateAgentDraft?(
    input: RuntimeAgentDraftInput,
    context: ProviderRuntimeContext
  ): Promise<AgentDraft>
  generateOrchestrationPlan?(
    input: RuntimeOrchestrationPlanInput,
    context: ProviderRuntimeContext
  ): Promise<OrchestrationPlan>
  sendConversationTurn?(
    input: RuntimeConversationTurnInput,
    context: ProviderRuntimeContext
  ): Promise<RuntimeConversationTurnResult>
}
