// ADR-036 — Run inspector bottom sheet.
//
// Full-width bottom sheet replacing the narrow side inspect overlay: a compact
// meta strip in the header, then two tabs — a row-based activity timeline and
// a terminal-style console (sanitized invocation + stdout/stderr). Run-
// agnostic by design: inputs are the observability surface (snapshot +
// events + diagnostics IPC) plus header naming props. Mounted by the
// Workboard (work items), Home (Ordinus turns), and Agent Room (agent turns).

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronRight, Copy, Loader2, TerminalSquare, XCircle } from 'lucide-react'
import type {
  ObservedRunDiagnostics,
  ObservedRunEvent,
  ObservedRunSnapshot
} from '@shared/contracts'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import {
  formatLivenessHealth,
  formatObservedPhase,
  mergeDiagnostics
} from '@renderer/components/observability-diagnostics'
import { useLiveTurnActivity } from '@renderer/hooks/use-live-turn-activity'
import { copyTextToClipboard } from '@renderer/lib/clipboard'
import { cn } from '@renderer/lib/utils'

const POLL_INTERVAL_MS = 2000

// Clipboard write + transient ✓ feedback, shared by the copy affordances in
// this sheet.
function useCopyFeedback(value: string): { copied: boolean; copy: () => void } {
  const [copied, setCopied] = useState(false)

  async function copy(): Promise<void> {
    const copiedNow = await copyTextToClipboard(value)
    setCopied(copiedNow)
    if (copiedNow) window.setTimeout(() => setCopied(false), 1400)
  }

  return { copied, copy: () => void copy() }
}

// The hover affordance transcripts use to open the sheet for one finished
// turn: floats in the left gutter (absolute, outside the text column) so the
// transcript keeps its width and alignment.
export function InspectGutterButton({ onClick }: { onClick: () => void }): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label="Inspect how this turn happened"
      title="Inspect how this turn happened"
      onClick={onClick}
      className="absolute -left-7 top-1 text-muted-foreground opacity-0 transition-all duration-150 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 motion-safe:scale-90 motion-safe:group-hover:scale-100"
    >
      <TerminalSquare className="size-4" />
    </button>
  )
}

// The transcript's live status row ("Reading x… · 12s"). With an onClick it
// doubles as the entry point to the sheet for the in-flight turn (ADR-036);
// without one it stays a plain, non-interactive line.
export function LiveStatusRow({
  label,
  onClick
}: {
  label: string
  onClick?: () => void
}): React.JSX.Element {
  // Polish pass: the label carries a soft shimmer sweep while the turn is in
  // flight — the same words, just visibly alive. On hover the sweep settles
  // into solid ink and a small chevron slides in to hint "inspectable".
  const content = (
    <>
      <Loader2 className="h-3 w-3 animate-spin" />
      <span className="ordinus-text-shimmer group-hover/live:[--shimmer-base:hsl(var(--foreground))]">
        {label}
      </span>
    </>
  )
  if (!onClick) {
    return <span className="flex items-center gap-2 text-xs text-muted-foreground">{content}</span>
  }
  return (
    <button
      type="button"
      className="group/live flex w-fit items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
      title="Inspect how this turn is happening"
      onClick={onClick}
    >
      {content}
      <ChevronRight className="size-3 -translate-x-0.5 opacity-0 transition-all duration-150 group-hover/live:translate-x-0 group-hover/live:opacity-100" />
    </button>
  )
}

export type RunInspectorMeta = {
  agentName: string
  agentRole: string
  providerId: string
  model: string
  /** Null on surfaces that have no sandbox concept (e.g. Home turns). */
  sandbox: string | null
  sessionRef: string | null
  createdAt: string | null
  startedAt: string | null
}

export function RunInspectorSheet({
  observedRun,
  meta,
  busy,
  heading,
  subheading,
  openingLabel,
  onClose
}: {
  observedRun: ObservedRunSnapshot | null
  meta: RunInspectorMeta
  /** True while the underlying run is in flight — drives polling + live line. */
  busy: boolean
  heading: string
  subheading: string
  openingLabel?: string
  onClose: () => void
}): React.JSX.Element {
  const [tab, setTab] = useState<'activity' | 'console'>('activity')

  return (
    <div className="fixed inset-0 z-50">
      {/* Polish pass: the sheet rises from the bottom edge instead of
          snapping in — same entrance grammar as the app's other overlays. */}
      <button
        type="button"
        className="absolute inset-0 bg-foreground/20 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
        aria-label="Close inspector"
        onClick={onClose}
      />
      <section className="absolute inset-x-0 bottom-0 z-10 flex h-[68vh] flex-col rounded-t-2xl border-t bg-card shadow-2xl motion-safe:animate-in motion-safe:slide-in-from-bottom-8 motion-safe:fade-in-0 motion-safe:duration-300 motion-safe:ease-out">
        <header className="flex items-center justify-between gap-4 border-b px-6 py-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">{heading}</h3>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{subheading}</p>
          </div>
          <div className="flex min-w-0 items-center gap-4">
            <RunMetaStrip observedRun={observedRun} meta={meta} />
            <Button variant="ghost" size="icon" className="shrink-0" onClick={onClose}>
              <XCircle />
              <span className="sr-only">Close inspector</span>
            </Button>
          </div>
        </header>
        {observedRun ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center gap-1 border-b px-6 py-1.5">
              <SheetTab
                label="Activity"
                active={tab === 'activity'}
                onSelect={() => setTab('activity')}
              />
              <SheetTab
                label="Console"
                active={tab === 'console'}
                onSelect={() => setTab('console')}
              />
            </div>
            {/* Both tabs stay mounted so event/diagnostic accumulation and
                scroll positions survive switching. */}
            <div className={cn('min-h-0 flex-1 flex-col', tab === 'activity' ? 'flex' : 'hidden')}>
              <RunTimelineRegion
                observedRun={observedRun}
                busy={busy}
                openingLabel={openingLabel}
              />
            </div>
            <div className={cn('min-h-0 flex-1 flex-col', tab === 'console' ? 'flex' : 'hidden')}>
              <RunConsoleRegion observedRun={observedRun} busy={busy} />
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center p-8">
            <p className="rounded-lg border border-dashed bg-background px-4 py-3 text-sm text-muted-foreground">
              No observability record for this work — nothing was captured while it ran.
            </p>
          </div>
        )}
      </section>
    </div>
  )
}

function RunMetaStrip({
  observedRun,
  meta
}: {
  observedRun: ObservedRunSnapshot | null
  meta: RunInspectorMeta
}): React.JSX.Element {
  const startedAt = observedRun?.startedAt ?? meta.startedAt
  const startedLabel = startedAt
    ? new Date(startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'Not started'
  const createdTitle =
    meta.createdAt && meta.createdAt !== startedAt
      ? `Created ${new Date(meta.createdAt).toLocaleString()}`
      : undefined
  const elapsed = observedRun ? formatElapsedMs(observedRun.elapsedMs) : null

  return (
    <div className="hidden min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-0.5 text-xs text-muted-foreground md:flex">
      <span className="truncate font-medium text-foreground" title={meta.agentRole || undefined}>
        {meta.agentName}
      </span>
      <MetaDot />
      <span className="truncate">
        {meta.providerId} / {meta.model}
      </span>
      {meta.sandbox ? (
        <>
          <MetaDot />
          <span className="truncate">{meta.sandbox}</span>
        </>
      ) : null}
      <MetaDot />
      <span title={createdTitle}>
        {startedLabel}
        {elapsed ? ` → ${elapsed}` : ''}
      </span>
      {meta.sessionRef ? (
        <>
          <MetaDot />
          <SessionRefChip sessionRef={meta.sessionRef} />
        </>
      ) : null}
    </div>
  )
}

function SheetTab({
  label,
  active,
  onSelect
}: {
  label: string
  active: boolean
  onSelect: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={cn(
        'rounded-md px-3 py-1 text-xs font-medium transition-colors',
        active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'
      )}
      onClick={onSelect}
    >
      {label}
    </button>
  )
}

function MetaDot(): React.JSX.Element {
  return <span aria-hidden="true">·</span>
}

function SessionRefChip({ sessionRef }: { sessionRef: string }): React.JSX.Element {
  const { copied, copy } = useCopyFeedback(sessionRef)
  const short =
    sessionRef.length > 14 ? `${sessionRef.slice(0, 8)}…${sessionRef.slice(-4)}` : sessionRef

  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 font-mono transition-colors hover:text-foreground"
      title={`Copy session id ${sessionRef}`}
      onClick={copy}
    >
      {short}
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
    </button>
  )
}

type TimelineRow = {
  key: string
  summary: string
  kind: ObservedRunEvent['kind']
  source: ObservedRunEvent['source']
  confidence: ObservedRunEvent['confidence']
  count: number
  timestamp: string
}

function RunTimelineRegion({
  observedRun,
  busy,
  openingLabel
}: {
  observedRun: ObservedRunSnapshot
  busy: boolean
  openingLabel?: string
}): React.JSX.Element {
  const [events, setEvents] = useState<ObservedRunEvent[]>([])
  const [error, setError] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const observedRunId = observedRun.id

  // Live header line — shared ADR-034 hook, matched by observed-run id
  // (Workboard runs have no conversation).
  const { label: liveLabel } = useLiveTurnActivity(observedRunId, busy, false, {
    openingLabel,
    observedRunId
  })

  useEffect(() => {
    let mounted = true

    async function loadEvents(): Promise<void> {
      try {
        const nextEvents = await window.ordinus.observability.listEvents({ observedRunId })
        if (!mounted) return
        setEvents(nextEvents)
        setError('')
      } catch (loadError) {
        if (!mounted) return
        setError(loadError instanceof Error ? loadError.message : 'Activity could not be loaded.')
      }
    }

    void loadEvents()
    if (!busy) return () => void (mounted = false)
    const timer = window.setInterval(() => void loadEvents(), POLL_INTERVAL_MS)
    return () => {
      mounted = false
      window.clearInterval(timer)
    }
  }, [observedRunId, busy])

  // Keep the latest activity in view while the run is live.
  useEffect(() => {
    if (!busy) return
    const node = scrollRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [events.length, busy])

  const rows = useMemo(() => groupEvents(events), [events])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-3 px-6 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn(
              'size-2 shrink-0 rounded-full',
              busy ? 'animate-pulse bg-primary' : 'bg-muted-foreground/40'
            )}
            aria-hidden="true"
          />
          <p className="truncate text-sm font-medium">
            {busy
              ? (liveLabel ?? 'Working…')
              : `${capitalize(formatObservedPhase(observedRun.currentPhase))} · ${formatElapsedMs(observedRun.elapsedMs)}`}
          </p>
        </div>
        <Badge variant={observedRun.livenessHealth === 'stalled' ? 'attention' : 'outline'}>
          {formatLivenessHealth(observedRun.livenessHealth)}
        </Badge>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-6 pb-3 ordinus-scrollbar">
        {error ? <p className="py-2 text-sm text-destructive">{error}</p> : null}
        {rows.length > 0 ? (
          <ol className="grid gap-px">
            {rows.map((row) => (
              <li
                key={row.key}
                className="flex min-w-0 items-baseline gap-2.5 rounded-md px-1.5 py-1 hover:bg-accent/50"
                title={`${row.kind} · ${row.source} · ${row.confidence}`}
              >
                <span
                  className="size-1.5 shrink-0 translate-y-[-1px] rounded-full bg-primary/60"
                  aria-hidden="true"
                />
                <p className="min-w-0 flex-1 break-words text-sm leading-6 [overflow-wrap:anywhere]">
                  {row.summary}
                  {row.count > 1 ? (
                    <span className="ml-1.5 text-xs text-muted-foreground">×{row.count}</span>
                  ) : null}
                </p>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                  {new Date(row.timestamp).toLocaleTimeString()}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="py-2 text-sm text-muted-foreground">No timeline events yet.</p>
        )}
      </div>
    </div>
  )
}

function groupEvents(events: ObservedRunEvent[]): TimelineRow[] {
  const rows: TimelineRow[] = []
  for (const event of events) {
    const last = rows[rows.length - 1]
    if (last && last.summary === event.summary && last.kind === event.kind) {
      last.count += 1
      last.timestamp = event.timestamp
      continue
    }
    rows.push({
      key: event.id,
      summary: event.summary,
      kind: event.kind,
      source: event.source,
      confidence: event.confidence,
      count: 1,
      timestamp: event.timestamp
    })
  }
  return rows
}

function RunConsoleRegion({
  observedRun,
  busy
}: {
  observedRun: ObservedRunSnapshot
  busy: boolean
}): React.JSX.Element {
  const [diagnostics, setDiagnostics] = useState<ObservedRunDiagnostics | null>(null)
  const [error, setError] = useState('')
  const [follow, setFollow] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const observedRunId = observedRun.id

  useEffect(() => {
    let mounted = true

    async function loadDiagnostics(): Promise<void> {
      try {
        const next = await window.ordinus.observability.getDiagnostics({
          observedRunId,
          stdoutOffset: diagnostics?.stdout.nextOffset,
          stderrOffset: diagnostics?.stderr.nextOffset
        })
        if (!mounted) return
        setDiagnostics((current) => mergeDiagnostics(current, next))
        setError('')
      } catch (loadError) {
        if (!mounted) return
        setError(
          loadError instanceof Error ? loadError.message : 'Diagnostics could not be loaded.'
        )
      }
    }

    void loadDiagnostics()
    if (!busy) return () => void (mounted = false)
    const timer = window.setInterval(() => void loadDiagnostics(), POLL_INTERVAL_MS)
    return () => {
      mounted = false
      window.clearInterval(timer)
    }
  }, [observedRunId, busy, diagnostics?.stdout.nextOffset, diagnostics?.stderr.nextOffset])

  const stdoutText = diagnostics?.stdout.text ?? ''
  const stderrText = diagnostics?.stderr.text ?? ''

  // Auto-follow the tail unless the user scrolled up.
  useEffect(() => {
    if (!follow) return
    const node = scrollRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [stdoutText, stderrText, follow])

  const invocationText = diagnostics ? formatInvocation(diagnostics, observedRun) : ''
  const copyAllValue = [
    invocationText,
    stdoutText ? `--- stdout ---\n${stdoutText}` : '',
    stderrText ? `--- stderr ---\n${stderrText}` : ''
  ]
    .filter(Boolean)
    .join('\n\n')

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="flex items-center justify-end gap-3 border-b px-6 py-1.5">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn('h-7 text-xs', follow ? 'text-foreground' : 'text-muted-foreground')}
            onClick={() => setFollow((value) => !value)}
          >
            {follow ? 'Following' : 'Follow'}
          </Button>
          <CopyAllButton value={copyAllValue} />
        </div>
      </div>
      {diagnostics?.invocation ? (
        <pre className="shrink-0 overflow-x-hidden whitespace-pre-wrap break-all border-b px-6 py-2 font-mono text-xs leading-5 text-muted-foreground">
          {invocationText}
        </pre>
      ) : null}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-6 py-2 ordinus-scrollbar"
        onScroll={(event) => {
          const node = event.currentTarget
          setFollow(node.scrollHeight - node.scrollTop - node.clientHeight < 24)
        }}
      >
        {error ? <p className="py-1 text-sm text-destructive">{error}</p> : null}
        {diagnostics ? (
          <>
            <pre className="whitespace-pre-wrap break-all font-mono text-xs leading-5">
              {stdoutText || 'No output yet.'}
            </pre>
            {stderrText ? (
              <pre className="mt-2 whitespace-pre-wrap break-all rounded-md bg-status-failed/5 p-2 font-mono text-xs leading-5 text-status-failed">
                {stderrText}
              </pre>
            ) : null}
          </>
        ) : (
          <p className="py-1 text-sm text-muted-foreground">Loading diagnostics…</p>
        )}
      </div>
    </div>
  )
}

function CopyAllButton({ value }: { value: string }): React.JSX.Element {
  const { copied, copy } = useCopyFeedback(value)

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 text-xs text-muted-foreground hover:text-foreground"
      onClick={copy}
    >
      {copied ? <Check /> : <Copy />}
      Copy all
    </Button>
  )
}

function formatInvocation(
  diagnostics: ObservedRunDiagnostics,
  observedRun: ObservedRunSnapshot
): string {
  const executable = diagnostics.invocation.executable || observedRun.providerId
  const args = diagnostics.invocation.args.join(' ')
  const lines = [`$ ${[executable, args].filter(Boolean).join(' ')}`]
  if (diagnostics.invocation.cwd) lines.push(`  cwd: ${diagnostics.invocation.cwd}`)
  return lines.join('\n')
}

function formatElapsedMs(value: number): string {
  const totalSeconds = Math.max(0, Math.floor(value / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes === 0) return `${seconds}s`
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`
}

function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value
}
