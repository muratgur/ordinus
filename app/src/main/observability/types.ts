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

// ADR-037: token usage as the provider reported it. `semantics` declares how
// the counters behave: Codex reports thread-cumulative values (the whole
// resumed session so far), Claude and Gemini report per-invocation values.
// The observability service derives the run's true cost (delta) from this.
export type ProviderUsageReport = {
  semantics: 'cumulative' | 'invocation'
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  totalTokens?: number
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
  // ADR-037: the provider session/thread id this invocation actually runs on,
  // emitted when the CLI announces it (thread.started / system init). Keeps
  // the run row's chain key correct even after a fresh-session fallback
  // (ADR-013) replaced the resume target mid-run.
  sessionRef?: string
  usage?: ProviderUsageReport
}

export type RuntimeObservationSink = {
  stdout(text: string): void
  stderr(text: string): void
  record(event: RuntimeObservation): void
  complete(status: Extract<ObservedRunLifecycleStatus, 'completed' | 'failed' | 'cancelled'>): void
}
