import { BrowserWindow } from 'electron'
import { existsSync, openSync, readSync, statSync, closeSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import {
  ObservedRunDiagnosticsSchema,
  type Agent,
  type ConversationTurn,
  type ObservedRunDiagnostics,
  type ObservedRunEvent,
  type ObservedRunEventKind,
  type ObservedRunLivenessHealth,
  type ObservedRunPhase,
  type ObservedRunSnapshot,
  type ObservedRunSourceSurface,
  type WorkRun
} from '@shared/contracts'
import { ipcChannels } from '@shared/ipc'
import type { OrdinusDatabase } from '../db/database'
import { getSystemPaths } from '../paths'
import { redactDiagnosticsText, sanitizeActivityDetail } from './redaction'
import type {
  RuntimeObservation,
  RuntimeObservationSink,
  SanitizedInvocationSummary
} from './types'

const quietThresholdMs = 90_000
const stalledThresholdMs = 180_000
const diagnosticsTailBytes = 64 * 1024

// ADR-034 — live-activity decoration. Kept in memory only: snapshots in the
// DB stay as-is, and the renderer's live line is fed by decorating snapshots
// at broadcast/list time. Entries are dropped when a run reaches a terminal
// lifecycle, so the map only ever holds in-flight runs.
type LiveActivityDecoration = {
  conversationId: string | null
  latestEventKind: ObservedRunEventKind | null
  latestEventLabel: string | null
}

const liveActivityByRunId = new Map<string, LiveActivityDecoration>()

type StartObservedRunInput = {
  sourceSurface: ObservedRunSourceSurface
  sourceItemId: string
  sourceItemTitle: string
  queuedAt: string
  agent: Pick<Agent, 'id' | 'name' | 'role'>
  providerId: WorkRun['providerId']
  model: string
  logRef: string
  invocation: SanitizedInvocationSummary
  eventPayload: Record<string, unknown>
  // ADR-037: the provider session this run will try to resume (null for a
  // fresh session). Seeds the row's chain key for usage delta computation;
  // the adapter's sessionRef observation overrides it with the actual thread.
  providerSessionRef: string | null
}

export type ObservabilityService = {
  startWorkboardRun(input: {
    run: WorkRun
    agent: Agent
    logRef: string
    invocation: SanitizedInvocationSummary
    providerSessionRef?: string | null
  }): RuntimeObservationSink
  startConversationTurn(input: {
    turn: ConversationTurn
    conversationId: string
    conversationTitle: string
    agent: Agent
    logRef: string
    invocation: SanitizedInvocationSummary
    providerSessionRef?: string | null
  }): RuntimeObservationSink
  /**
   * ADR-034 — Ordinus Home turns. Ordinus is a phantom agent (no Agent row,
   * no ConversationTurn row), so this takes the raw identifiers instead.
   * Uses the 'conversation' source surface with the turn id as the source
   * item, which keeps markConversation*(turnId) working unchanged.
   */
  startOrdinusTurn(input: {
    conversationId: string
    conversationTitle: string
    turnId: string
    queuedAt: string
    providerId: WorkRun['providerId']
    model: string
    logRef: string
    invocation: SanitizedInvocationSummary
    providerSessionRef?: string | null
  }): RuntimeObservationSink
  markWorkboardWaitingForUser(runId: string, summary: string): void
  markWorkboardCompleted(runId: string, summary: string): void
  markWorkboardFailed(runId: string, error: string): void
  markWorkboardCancelled(runId: string): void
  markConversationWaitingForUser(turnId: string, summary: string): void
  markConversationCompleted(turnId: string, summary: string): void
  markConversationFailed(turnId: string, error: string): void
  markConversationCancelled(turnId: string): void
  listWorkboardRuns(): ObservedRunSnapshot[]
  listConversationRuns(conversationId: string): ObservedRunSnapshot[]
  getTurnRun(turnId: string): ObservedRunSnapshot | null
  listEvents(observedRunId: string): ObservedRunEvent[]
  getDiagnostics(input: {
    observedRunId: string
    stdoutOffset?: number
    stderrOffset?: number
  }): ObservedRunDiagnostics
}

export function createObservabilityService(database: OrdinusDatabase): ObservabilityService {
  return {
    startWorkboardRun(input) {
      return startObservedRun(database, {
        sourceSurface: 'workboard',
        sourceItemId: input.run.id,
        sourceItemTitle: input.run.title,
        queuedAt: input.run.createdAt,
        agent: input.agent,
        providerId: input.run.providerId,
        model: input.run.model,
        logRef: input.logRef,
        invocation: input.invocation,
        eventPayload: {},
        providerSessionRef: input.providerSessionRef ?? null
      })
    },
    startConversationTurn(input) {
      return startObservedRun(database, {
        sourceSurface: 'conversation',
        sourceItemId: input.turn.id,
        sourceItemTitle: input.conversationTitle || `Conversation turn ${input.turn.sequence}`,
        queuedAt: input.turn.createdAt,
        agent: input.agent,
        providerId: input.agent.providerId,
        model: input.agent.model,
        logRef: input.logRef,
        invocation: input.invocation,
        eventPayload: {
          conversationId: input.conversationId,
          turnId: input.turn.id
        },
        providerSessionRef: input.providerSessionRef ?? null
      })
    },
    startOrdinusTurn(input) {
      return startObservedRun(database, {
        sourceSurface: 'conversation',
        sourceItemId: input.turnId,
        sourceItemTitle: input.conversationTitle || 'Ordinus conversation',
        queuedAt: input.queuedAt,
        agent: { id: 'ordinus', name: 'Ordinus', role: 'In-app personal assistant' },
        providerId: input.providerId,
        model: input.model,
        logRef: input.logRef,
        invocation: input.invocation,
        eventPayload: {
          conversationId: input.conversationId,
          turnId: input.turnId
        },
        providerSessionRef: input.providerSessionRef ?? null
      })
    },
    markWorkboardWaitingForUser(runId, summary) {
      patchSourceRun(database, 'workboard', runId, {
        lifecycleStatus: 'waiting_for_user',
        livenessHealth: 'exited',
        currentPhase: 'waiting_for_user',
        summary: summary || 'Waiting for user input.'
      })
    },
    markWorkboardCompleted(runId, summary) {
      patchSourceRun(database, 'workboard', runId, {
        lifecycleStatus: 'completed',
        livenessHealth: 'exited',
        currentPhase: 'completed',
        summary: summary || 'Completed.'
      })
    },
    markWorkboardFailed(runId, error) {
      patchSourceRun(database, 'workboard', runId, {
        lifecycleStatus: 'failed',
        livenessHealth: 'exited',
        currentPhase: 'failed',
        summary: error || 'Work Item failed.',
        kind: 'error'
      })
    },
    markWorkboardCancelled(runId) {
      patchSourceRun(database, 'workboard', runId, {
        lifecycleStatus: 'cancelled',
        livenessHealth: 'exited',
        currentPhase: 'cancelled',
        summary: 'Cancelled.'
      })
    },
    markConversationWaitingForUser(turnId, summary) {
      patchSourceRun(database, 'conversation', turnId, {
        lifecycleStatus: 'waiting_for_user',
        livenessHealth: 'exited',
        currentPhase: 'waiting_for_user',
        summary: summary || 'Waiting for user input.'
      })
    },
    markConversationCompleted(turnId, summary) {
      patchSourceRun(database, 'conversation', turnId, {
        lifecycleStatus: 'completed',
        livenessHealth: 'exited',
        currentPhase: 'completed',
        summary: summary || 'Completed.'
      })
    },
    markConversationFailed(turnId, error) {
      patchSourceRun(database, 'conversation', turnId, {
        lifecycleStatus: 'failed',
        livenessHealth: 'exited',
        currentPhase: 'failed',
        summary: error || 'Conversation turn failed.',
        kind: 'error'
      })
    },
    markConversationCancelled(turnId) {
      patchSourceRun(database, 'conversation', turnId, {
        lifecycleStatus: 'cancelled',
        livenessHealth: 'exited',
        currentPhase: 'cancelled',
        summary: 'Cancelled.'
      })
    },
    listWorkboardRuns() {
      return database.listWorkboardObservedRuns().map(withCurrentLiveness)
    },
    listConversationRuns(conversationId) {
      return database.listConversationObservedRuns(conversationId).map(withCurrentLiveness)
    },
    getTurnRun(turnId) {
      // ADR-036: both ordinary conversation turns and Ordinus turns register
      // their observed run on the 'conversation' source surface keyed by the
      // runtime turn id (ADR-034) — the id transcript rows carry as `turnId`.
      const run = database.getObservedRunBySource('conversation', turnId)
      return run ? withCurrentLiveness(run) : null
    },
    listEvents(observedRunId) {
      return database.listObservedRunEvents(observedRunId)
    },
    getDiagnostics(input) {
      const observedRun = database.getObservedRunInternal(input.observedRunId)
      const logPath = resolveInsideRoot(getSystemPaths().logs, observedRun.logRef)
      const invocation = normalizeInvocation(observedRun.sanitizedInvocation)

      return ObservedRunDiagnosticsSchema.parse({
        observedRunId: observedRun.id,
        invocation,
        stdout: readTail(join(logPath, 'events.jsonl'), input.stdoutOffset),
        stderr: readTail(join(logPath, 'stderr.txt'), input.stderrOffset)
      })
    }
  }
}

function startObservedRun(
  database: OrdinusDatabase,
  input: StartObservedRunInput
): RuntimeObservationSink {
  const now = new Date().toISOString()
  const observedRun = database.upsertObservedRun({
    sourceSurface: input.sourceSurface,
    sourceItemId: input.sourceItemId,
    sourceItemTitle: input.sourceItemTitle,
    assignedAgentId: input.agent.id,
    assignedAgentName: input.agent.name,
    assignedAgentRole: input.agent.role,
    providerId: input.providerId,
    model: input.model,
    lifecycleStatus: 'starting',
    livenessHealth: 'healthy',
    currentPhase: 'starting',
    latestActivity: 'Starting provider process.',
    latestActivityAt: now,
    queuedAt: input.queuedAt,
    startedAt: now,
    firstActivityAt: now,
    lastActivityAt: now,
    usageSource: 'unavailable',
    providerSessionRef: input.providerSessionRef ?? '',
    sanitizedInvocation: input.invocation,
    logRef: input.logRef
  })
  // ADR-034: remember which conversation (if any) this run belongs to so the
  // renderer's live-activity hook can match push updates without new queries.
  const conversationId = input.eventPayload.conversationId
  liveActivityByRunId.set(observedRun.id, {
    conversationId: typeof conversationId === 'string' ? conversationId : null,
    latestEventKind: null,
    latestEventLabel: null
  })
  appendAndBroadcast(database, observedRun.id, {
    kind: 'status',
    source: 'runtime',
    confidence: 'reported',
    phase: 'starting',
    lifecycleStatus: 'starting',
    summary: 'Starting provider process.',
    payload: {
      ...input.eventPayload,
      provider: input.invocation.provider,
      executable: input.invocation.executable,
      args: input.invocation.args,
      cwd: input.invocation.cwd
    }
  })

  return createRuntimeObservationSink(database, observedRun.id)
}

function createRuntimeObservationSink(
  database: OrdinusDatabase,
  observedRunId: string
): RuntimeObservationSink {
  return {
    stdout(text) {
      if (!text.trim()) return
      touchActivity(database, observedRunId, 'Provider emitted output.')
    },
    stderr(text) {
      if (!text.trim()) return
      touchActivity(database, observedRunId, 'Provider emitted diagnostics.')
    },
    record(event) {
      updateActivity(database, observedRunId, event)
    },
    complete(status) {
      const summaryByStatus = {
        completed: 'Provider process completed.',
        failed: 'Provider process exited with an error.',
        cancelled: 'Provider process was cancelled.'
      } as const
      updateActivity(database, observedRunId, {
        kind: status === 'failed' ? 'error' : 'status',
        source: 'runtime',
        confidence: 'reported',
        phase: status,
        lifecycleStatus: status,
        livenessHealth: 'exited',
        summary: summaryByStatus[status]
      })
    }
  }
}

function touchActivity(
  database: OrdinusDatabase,
  observedRunId: string,
  fallbackSummary: string
): void {
  const now = new Date().toISOString()
  const current = database.getObservedRunInternal(observedRunId)
  if (isTerminalLifecycle(current.lifecycleStatus)) {
    return
  }

  database.patchObservedRun({
    id: observedRunId,
    lifecycleStatus: current.lifecycleStatus === 'starting' ? 'running' : current.lifecycleStatus,
    livenessHealth: 'healthy',
    currentPhase: current.currentPhase === 'starting' ? 'running' : current.currentPhase,
    latestActivity: shouldReplaceWithGenericActivity(current.latestActivity)
      ? fallbackSummary
      : current.latestActivity,
    latestActivityAt: now,
    firstActivityAt: current.firstActivityAt ?? now,
    lastActivityAt: now
  })
  broadcast(database.getObservedRunInternal(observedRunId))
}

function shouldReplaceWithGenericActivity(value: string): boolean {
  return (
    !value.trim() ||
    value === 'Starting provider process.' ||
    value === 'Provider emitted output.' ||
    value === 'Provider emitted diagnostics.'
  )
}

function updateActivity(
  database: OrdinusDatabase,
  observedRunId: string,
  event: RuntimeObservation
): void {
  const now = new Date().toISOString()
  const summary = sanitizeActivityDetail(event.summary, 240) || 'Run activity.'
  const current = database.getObservedRunInternal(observedRunId)
  updateLiveActivityDecoration(observedRunId, event)

  database.patchObservedRun({
    id: observedRunId,
    lifecycleStatus: event.lifecycleStatus ?? current.lifecycleStatus,
    livenessHealth: event.livenessHealth ?? 'healthy',
    currentPhase: event.phase ?? current.currentPhase,
    latestActivity: summary,
    latestActivityAt: now,
    firstActivityAt: current.firstActivityAt ?? now,
    lastActivityAt: now,
    completedAt: isTerminalLifecycle(event.lifecycleStatus) ? now : current.completedAt,
    ...buildUsagePatch(database, current, event)
  })
  appendAndBroadcast(database, observedRunId, {
    ...event,
    summary,
    payload: compactPayload(event.payload)
  })
  // Drop the decoration only after the terminal snapshot has been broadcast,
  // so the renderer still sees conversationId on the final push and can clear
  // its live line.
  if (isTerminalLifecycle(event.lifecycleStatus)) {
    liveActivityByRunId.delete(observedRunId)
  }
}

// ADR-037 — fold a provider usage report (and/or an announced session ref)
// into the run row. Raw counters are stored as reported; the delta fields are
// the run's true cost. For 'invocation' reporters (Claude, Gemini) the delta
// IS the raw report. For 'cumulative' reporters (Codex) the delta is raw
// minus the latest prior run's raw counters on the same provider session —
// a fresh session (or an ADR-013 fresh-session fallback, which re-announces
// a new sessionRef) has no baseline, so the delta equals the raw values.
function buildUsagePatch(
  database: OrdinusDatabase,
  current: ReturnType<OrdinusDatabase['getObservedRunInternal']>,
  event: RuntimeObservation
): Partial<Parameters<OrdinusDatabase['patchObservedRun']>[0]> {
  const patch: Partial<Parameters<OrdinusDatabase['patchObservedRun']>[0]> = {}

  const sessionRef = event.sessionRef?.trim()
  if (sessionRef && sessionRef !== current.providerSessionRef) {
    patch.providerSessionRef = sessionRef
  }

  const usage = event.usage
  if (!usage) {
    return patch
  }

  const chainRef = patch.providerSessionRef ?? current.providerSessionRef
  const totalTokens = usage.totalTokens ?? usage.inputTokens + usage.outputTokens

  patch.inputTokens = usage.inputTokens
  patch.cachedInputTokens = usage.cachedInputTokens
  patch.outputTokens = usage.outputTokens
  patch.totalTokens = totalTokens
  patch.usageSource = 'provider'
  patch.usageSemantics = usage.semantics

  if (usage.semantics === 'invocation') {
    patch.deltaInputTokens = usage.inputTokens
    patch.deltaCachedInputTokens = usage.cachedInputTokens
    patch.deltaOutputTokens = usage.outputTokens
    patch.deltaTotalTokens = totalTokens
    return patch
  }

  const baseline = database.getObservedRunUsageBaseline(chainRef, current.id)
  patch.deltaInputTokens = Math.max(0, usage.inputTokens - (baseline?.inputTokens ?? 0))
  patch.deltaCachedInputTokens = Math.max(
    0,
    usage.cachedInputTokens - (baseline?.cachedInputTokens ?? 0)
  )
  patch.deltaOutputTokens = Math.max(0, usage.outputTokens - (baseline?.outputTokens ?? 0))
  patch.deltaTotalTokens = Math.max(0, totalTokens - (baseline?.totalTokens ?? 0))
  return patch
}

function appendAndBroadcast(
  database: OrdinusDatabase,
  observedRunId: string,
  event: RuntimeObservation
): void {
  database.appendObservedRunEvent({
    observedRunId,
    kind: event.kind,
    source: event.source,
    confidence: event.confidence,
    phase: event.phase ?? null,
    lifecycleStatus: event.lifecycleStatus ?? null,
    summary: event.summary,
    payload: event.payload ?? {}
  })
  broadcast(database.getObservedRunInternal(observedRunId))
}

function patchSourceRun(
  database: OrdinusDatabase,
  sourceSurface: ObservedRunSourceSurface,
  runId: string,
  input: {
    lifecycleStatus: Extract<
      RuntimeObservation['lifecycleStatus'],
      'waiting_for_user' | 'completed' | 'failed' | 'cancelled'
    >
    livenessHealth: ObservedRunLivenessHealth
    currentPhase: ObservedRunPhase
    summary: string
    kind?: RuntimeObservation['kind']
  }
): void {
  const observedRun = database.getObservedRunBySource(sourceSurface, runId)
  if (!observedRun) {
    return
  }

  updateActivity(database, observedRun.id, {
    kind: input.kind ?? 'status',
    source: 'runtime',
    confidence: 'reported',
    phase: input.currentPhase,
    lifecycleStatus: input.lifecycleStatus,
    livenessHealth: input.livenessHealth,
    summary: input.summary
  })
}

function broadcast(snapshot: ObservedRunSnapshot): void {
  const publicSnapshot = withCurrentLiveness(snapshot)
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(ipcChannels.observabilityRunChanged, publicSnapshot)
  }
}

// ADR-034 — reduce a runtime observation to the live-line decoration. The
// renderer phrases the line from kind + label; the label is the only detail
// that crosses the boundary, so this is where the product's "calm" rule is
// enforced: command labels are dropped entirely (raw shell text never reaches
// the renderer — diagnostics keep the full fidelity on their own channel),
// and other labels are reduced to a short human object (file basename, tool
// name) rather than full paths or arguments.
function updateLiveActivityDecoration(observedRunId: string, event: RuntimeObservation): void {
  const meaningfulKinds: ObservedRunEventKind[] = ['tool', 'command', 'file', 'message']
  if (!meaningfulKinds.includes(event.kind)) {
    return
  }

  const decoration = liveActivityByRunId.get(observedRunId)
  if (!decoration) {
    return
  }

  const nextLabel = event.kind === 'command' ? null : deriveCalmEventLabel(event.payload)
  // Completion echoes ("Tool completed.") arrive without a label; don't let
  // them downgrade a specific phrase ("Editing report.md…") to a generic one
  // while the kind hasn't changed.
  if (nextLabel === null && decoration.latestEventKind === event.kind) {
    return
  }

  decoration.latestEventKind = event.kind
  decoration.latestEventLabel = nextLabel
}

function deriveCalmEventLabel(payload: Record<string, unknown> | undefined): string | null {
  if (!payload) {
    return null
  }

  const name = typeof payload.name === 'string' ? payload.name : ''
  const label = typeof payload.label === 'string' ? payload.label : ''
  // Adapter labels look like "<tool-name> <detail>" (e.g. "Read /a/b/c.ts").
  // Prefer the detail's last path segment; fall back to a humanized tool name.
  const detail = name && label.startsWith(name) ? label.slice(name.length).trim() : label
  if (detail) {
    const firstToken = detail.split(/\s+/)[0]
    const segments = firstToken.split('/').filter(Boolean)
    const candidate = segments.length > 0 ? segments[segments.length - 1] : firstToken
    if (candidate && candidate.length <= 60) {
      return candidate
    }
  }

  if (name) {
    // MCP tool ids read as mcp__<server>__<tool>; surface "<tool>" plainly.
    const cleaned = name
      .replace(/^mcp__[^_]+(?:__)?/, '')
      .replace(/[_-]+/g, ' ')
      .trim()
    return cleaned ? cleaned.slice(0, 60) : null
  }

  return null
}

function withCurrentLiveness(snapshot: ObservedRunSnapshot): ObservedRunSnapshot {
  const decoration = liveActivityByRunId.get(snapshot.id)
  if (decoration) {
    snapshot = {
      ...snapshot,
      conversationId: decoration.conversationId,
      latestEventKind: decoration.latestEventKind,
      latestEventLabel: decoration.latestEventLabel
    }
  }

  if (isTerminalLifecycle(snapshot.lifecycleStatus) || !snapshot.lastActivityAt) {
    return snapshot
  }

  const idleMs = Date.now() - Date.parse(snapshot.lastActivityAt)
  if (Number.isNaN(idleMs)) {
    return snapshot
  }

  let livenessHealth: ObservedRunLivenessHealth = 'healthy'
  if (idleMs >= stalledThresholdMs) {
    livenessHealth = 'stalled'
  } else if (idleMs >= quietThresholdMs) {
    livenessHealth = 'quiet'
  }

  return {
    ...snapshot,
    livenessHealth,
    idleMs: Math.max(0, idleMs)
  }
}

function isTerminalLifecycle(status: RuntimeObservation['lifecycleStatus']): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}

function compactPayload(payload: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!payload) {
    return {}
  }

  return compactRecord(payload, 0)
}

function compactRecord(value: Record<string, unknown>, depth: number): Record<string, unknown> {
  if (depth >= 3) {
    return { truncated: true }
  }

  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 24)
      .map(([key, nested]) => [key, compactPayloadValue(nested, depth + 1)])
  )
}

function compactPayloadValue(value: unknown, depth: number): unknown {
  if (typeof value === 'string') {
    return sanitizeActivityDetail(value, 500)
  }

  if (value === null || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }

  if (Array.isArray(value)) {
    return value.slice(0, 24).map((item) => compactPayloadValue(item, depth + 1))
  }

  if (typeof value === 'object') {
    return compactRecord(value as Record<string, unknown>, depth)
  }

  return String(value)
}

function normalizeInvocation(value: Record<string, unknown>): SanitizedInvocationSummary {
  return {
    provider: typeof value.provider === 'string' ? value.provider : '',
    executable: typeof value.executable === 'string' ? value.executable : '',
    args: Array.isArray(value.args) ? value.args.filter(isString) : [],
    cwd: typeof value.cwd === 'string' ? value.cwd : '',
    startedAt: typeof value.startedAt === 'string' ? value.startedAt : null
  }
}

function readTail(
  filePath: string,
  offset: number | undefined
): { text: string; startOffset: number; nextOffset: number; truncated: boolean } {
  if (!existsSync(filePath)) {
    return { text: '', startOffset: 0, nextOffset: 0, truncated: false }
  }

  const size = statSync(filePath).size
  const startOffset =
    typeof offset === 'number' && offset <= size ? offset : Math.max(0, size - diagnosticsTailBytes)
  const length = Math.min(diagnosticsTailBytes, Math.max(0, size - startOffset))
  if (length === 0) {
    return { text: '', startOffset, nextOffset: size, truncated: startOffset > 0 }
  }

  const buffer = Buffer.alloc(length)
  const fd = openSync(filePath, 'r')
  try {
    readSync(fd, buffer, 0, length, startOffset)
  } finally {
    closeSync(fd)
  }

  return {
    text: redactDiagnosticsText(buffer.toString('utf8')),
    startOffset,
    nextOffset: startOffset + length,
    truncated: startOffset > 0
  }
}

function resolveInsideRoot(root: string, pathSegment: string): string {
  const rootPath = resolve(root)
  const resolvedPath = resolve(rootPath, pathSegment)
  if (resolvedPath !== rootPath && !resolvedPath.startsWith(rootPath + sep)) {
    throw new Error('Diagnostics path must stay inside the Ordinus logs folder.')
  }
  return resolvedPath
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}
