import type { ChildProcess } from 'node:child_process'
import type {
  AgentDraft,
  AgentDraftFromIntentInput,
  ProviderActionInput,
  ProviderConnectInput,
  ProviderConnectResult,
  ProviderId,
  ProviderStatus
} from '@shared/contracts'

export type ProviderLoginProcess = {
  child: ChildProcess
  authUrl: string
  finished: boolean
  cleanupTimer: NodeJS.Timeout | null
}

export type RuntimeAgentDraftInput = AgentDraftFromIntentInput & {
  providerId: ProviderId
  model: string
}

export type ProviderRuntimeContext = {
  loginProcesses: Map<ProviderId, ProviderLoginProcess>
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
}
