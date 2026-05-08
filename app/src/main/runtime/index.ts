import { providerIds, type RuntimeEventListener, type RuntimeProviderCapabilities } from './types'

export type RuntimeService = {
  readonly ready: boolean
  getProviderCapabilities(): readonly RuntimeProviderCapabilities[]
  subscribe(listener: RuntimeEventListener): () => void
}

export function createRuntimeService(): RuntimeService {
  const listeners = new Set<RuntimeEventListener>()

  return {
    ready: true,
    getProviderCapabilities() {
      return providerIds.map((provider) => ({
        provider,
        detection: 'not_implemented',
        auth: 'not_implemented',
        runs: 'not_implemented'
      }))
    },
    subscribe(listener) {
      listeners.add(listener)

      return () => {
        listeners.delete(listener)
      }
    }
  }
}

export type {
  ProviderId,
  RuntimeEnvironmentPolicy,
  RuntimeEventKind,
  RuntimeEventListener,
  RuntimeOutputStream,
  RuntimeProcessStatus,
  RuntimeProviderCapabilities,
  RuntimeRunEvent,
  RuntimeRunId,
  RuntimeRunRequest,
  RuntimeRunResult,
  RuntimeSecretRef,
  RuntimeTimeoutPolicy,
  RuntimeWorkspaceBoundary
} from './types'
