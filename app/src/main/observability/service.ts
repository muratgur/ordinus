import { BrowserWindow } from 'electron'
import { existsSync, openSync, readSync, statSync, closeSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import {
  ObservedRunDiagnosticsSchema,
  type Agent,
  type ConversationTurn,
  type ObservedRunDiagnostics,
  type ObservedRunEvent,
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

type StartObservedRunInput = {
  sourceSurface: ObservedRunSourceSurface
  sourceItemId: string
  sourceItemTitle: string
  queuedAt: string
  agent: Agent
  providerId: WorkRun['providerId']
  model: string
  logRef: string
  invocation: SanitizedInvocationSummary
  eventPayload: Record<string, unknown>
}

export type ObservabilityService = {
  startWorkboardRun(input: {
    run: WorkRun
    agent: Agent
    logRef: string
    invocation: SanitizedInvocationSummary
  }): RuntimeObservationSink
  startConversationTurn(input: {
    turn: ConversationTurn
    conversationId: string
    conversationTitle: string
    agent: Agent
    logRef: string
    invocation: SanitizedInvocationSummary
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
        eventPayload: {}
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
        }
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
    sanitizedInvocation: input.invocation,
    logRef: input.logRef
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

  database.patchObservedRun({
    id: observedRunId,
    lifecycleStatus: event.lifecycleStatus ?? current.lifecycleStatus,
    livenessHealth: event.livenessHealth ?? 'healthy',
    currentPhase: event.phase ?? current.currentPhase,
    latestActivity: summary,
    latestActivityAt: now,
    firstActivityAt: current.firstActivityAt ?? now,
    lastActivityAt: now,
    completedAt: isTerminalLifecycle(event.lifecycleStatus) ? now : current.completedAt
  })
  appendAndBroadcast(database, observedRunId, {
    ...event,
    summary,
    payload: compactPayload(event.payload)
  })
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

function withCurrentLiveness(snapshot: ObservedRunSnapshot): ObservedRunSnapshot {
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

  if (
    value === null ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
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
