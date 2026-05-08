export const providerIds = ['codex', 'claude', 'gemini'] as const

export type ProviderId = (typeof providerIds)[number]

export type RuntimeRunId = string

export type RuntimeProcessStatus =
  | 'queued'
  | 'starting'
  | 'running'
  | 'cancelling'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timed_out'

export type RuntimeOutputStream = 'stdout' | 'stderr'

export type RuntimeEventKind = 'status' | 'output' | 'diagnostic' | 'result' | 'error'

export type RuntimeSecretRef = {
  readonly id: string
  readonly provider: ProviderId
  readonly label: string
}

export type RuntimeWorkspaceBoundary = {
  readonly rootPath: string
  readonly allowedWritePaths: readonly string[]
}

export type RuntimeEnvironmentPolicy = {
  readonly inheritEnvironment: false
  readonly allowlist: readonly string[]
  readonly secretRefs: readonly RuntimeSecretRef[]
}

export type RuntimeTimeoutPolicy = {
  readonly timeoutMs: number
  readonly gracefulShutdownMs: number
}

export type RuntimeRunRequest = {
  readonly provider: ProviderId
  readonly workspace: RuntimeWorkspaceBoundary
  readonly prompt: string
  readonly args: readonly string[]
  readonly environment: RuntimeEnvironmentPolicy
  readonly timeout: RuntimeTimeoutPolicy
}

export type RuntimeRunEvent = {
  readonly runId: RuntimeRunId
  readonly provider: ProviderId
  readonly sequence: number
  readonly timestamp: string
  readonly kind: RuntimeEventKind
  readonly status?: RuntimeProcessStatus
  readonly stream?: RuntimeOutputStream
  readonly text?: string
  readonly code?: string
}

export type RuntimeRunResult = {
  readonly runId: RuntimeRunId
  readonly provider: ProviderId
  readonly status: Extract<RuntimeProcessStatus, 'completed' | 'failed' | 'cancelled' | 'timed_out'>
  readonly startedAt: string
  readonly finishedAt: string
  readonly exitCode: number | null
}

export type RuntimeEventListener = (event: RuntimeRunEvent) => void

export type RuntimeProviderCapabilities = {
  readonly provider: ProviderId
  readonly detection: 'not_implemented'
  readonly auth: 'not_implemented'
  readonly runs: 'not_implemented'
}
