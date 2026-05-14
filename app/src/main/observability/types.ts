import type {
  ObservedRunEventConfidence,
  ObservedRunEventKind,
  ObservedRunEventSource,
  ObservedRunLifecycleStatus,
  ObservedRunLivenessHealth,
  ObservedRunPhase
} from '@shared/contracts'

export type SanitizedInvocationSummary = {
  provider: string
  executable: string
  args: string[]
  cwd: string
  startedAt: string | null
}

export type RuntimeObservation = {
  kind: ObservedRunEventKind
  source: ObservedRunEventSource
  confidence: ObservedRunEventConfidence
  summary: string
  phase?: ObservedRunPhase
  lifecycleStatus?: ObservedRunLifecycleStatus
  livenessHealth?: ObservedRunLivenessHealth
  payload?: Record<string, unknown>
}

export type RuntimeObservationSink = {
  stdout(text: string): void
  stderr(text: string): void
  record(event: RuntimeObservation): void
  complete(status: Extract<ObservedRunLifecycleStatus, 'completed' | 'failed' | 'cancelled'>): void
}
