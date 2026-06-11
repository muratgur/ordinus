// ADR-034 — Live turn activity line.
//
// Single mutating status line fed by the observability pipeline: while a turn
// is in flight this hook turns ObservedRunSnapshot pushes into one calm
// English sentence ("Reading agenda.md… · 12s"). Provider-agnostic with
// graceful degradation — providers that emit no events (Gemini today) fall
// back to the opening label + elapsed timer, and the quiet/stalled softening
// still works because liveness is recomputed locally from lastActivityAt.
//
// Shared by design: Home consumes it first; agent rooms and the Conversations
// screen can adopt it later by passing their conversation id (the
// observability service decorates snapshots for those surfaces too).

import { useEffect, useRef, useState } from 'react'
import type { ObservedRunSnapshot } from '@shared/contracts'

const OPENING_LABEL = 'Ordinus is thinking...'
const QUIET_THRESHOLD_MS = 90_000
const STALLED_THRESHOLD_MS = 180_000
const TIMER_VISIBLE_AFTER_MS = 5_000
// Anti-flicker: a phrase stays on screen at least this long; newer snapshots
// simply replace the pending value (latest-event-wins, no queue).
const MIN_DISPLAY_MS = 1_500

export type LiveTurnActivity = {
  /** The full line to render, or null when no turn is in flight. */
  label: string | null
}

type LiveState = {
  snapshot: ObservedRunSnapshot | null
  busySince: number
}

function isTerminal(snapshot: ObservedRunSnapshot): boolean {
  return (
    snapshot.lifecycleStatus === 'completed' ||
    snapshot.lifecycleStatus === 'failed' ||
    snapshot.lifecycleStatus === 'cancelled'
  )
}

// The kind→phrase dictionary — the single product-voice source for activity
// wording (ADR-034). Labels arrive pre-calmed from the main process (command
// labels are blanked there; file labels are basenames).
function phraseFor(snapshot: ObservedRunSnapshot, openingLabel: string): string {
  const label = snapshot.latestEventLabel
  switch (snapshot.latestEventKind) {
    case 'command':
      return 'Running a command…'
    case 'file':
    case 'tool':
      if (snapshot.currentPhase === 'reading') {
        return label ? `Reading ${label}…` : 'Reading…'
      }
      if (snapshot.currentPhase === 'editing') {
        return label ? `Editing ${label}…` : 'Editing…'
      }
      return label ? `Using ${label}…` : 'Using a tool…'
    case 'message':
      return 'Preparing a response…'
    default:
      return snapshot.currentPhase === 'starting' ? openingLabel : 'Working…'
  }
}

export type LiveTurnActivityOptions = {
  /**
   * Label shown before the first snapshot arrives and while the run is in its
   * 'starting' phase. Home keeps the default; agent rooms pass
   * "<agent name> is thinking…".
   */
  openingLabel?: string
  /**
   * ADR-036: match snapshots by observed-run id instead of conversation id.
   * Workboard runs have no conversation; the run inspector passes the
   * snapshot id it is already showing. When set, `conversationId` is ignored
   * for matching (pass any non-null key so the hook runs).
   */
  observedRunId?: string
}

export function useLiveTurnActivity(
  conversationId: string | null,
  busy: boolean,
  stopping = false,
  options?: LiveTurnActivityOptions
): LiveTurnActivity {
  const openingLabel = options?.openingLabel ?? OPENING_LABEL
  const [label, setLabel] = useState<string | null>(null)
  const stateRef = useRef<LiveState>({ snapshot: null, busySince: 0 })
  const lastChangeRef = useRef<{ phrase: string; at: number }>({ phrase: '', at: 0 })

  // Track the latest snapshot for this conversation. Updates land in a ref;
  // the ticker below owns when they become visible (min-display throttle).
  useEffect(() => {
    if (!conversationId || !busy) {
      stateRef.current.snapshot = null
      return undefined
    }
    const observedRunId = options?.observedRunId
    const off = window.ordinus.observability.onRunChanged((snapshot) => {
      const matches = observedRunId
        ? snapshot.id === observedRunId
        : snapshot.conversationId === conversationId
      if (!matches) return
      stateRef.current.snapshot = isTerminal(snapshot) ? null : snapshot
    })
    return off
  }, [conversationId, busy, options?.observedRunId])

  // Tick once per second while busy: compose the line from the latest
  // snapshot + local clocks (elapsed timer, quiet/stalled from idle time).
  useEffect(() => {
    if (!conversationId || !busy) {
      // No setLabel(null) here — the hook already returns null while idle,
      // so a stale label is never visible.
      stateRef.current = { snapshot: null, busySince: 0 }
      lastChangeRef.current = { phrase: '', at: 0 }
      return undefined
    }

    // Only seed the fallback clock once per turn — this effect also re-runs
    // when `stopping` flips, and that must not reset the elapsed timer.
    if (stateRef.current.busySince === 0) {
      stateRef.current.busySince = Date.now()
    }

    const compose = (): void => {
      const now = Date.now()
      const { snapshot, busySince } = stateRef.current

      if (stopping) {
        setLabel('Stopping…')
        return
      }

      let phrase = snapshot ? phraseFor(snapshot, openingLabel) : openingLabel

      // Quiet/stalled softening — computed locally because pushes stop
      // exactly when the provider goes silent.
      const lastActivityAt = snapshot?.lastActivityAt ? Date.parse(snapshot.lastActivityAt) : NaN
      const idleMs = Number.isNaN(lastActivityAt) ? 0 : now - lastActivityAt
      if (idleMs >= STALLED_THRESHOLD_MS) {
        phrase = 'Something may be stuck.'
      } else if (idleMs >= QUIET_THRESHOLD_MS) {
        phrase = 'Still working — this is taking a bit longer…'
      } else if (
        phrase !== lastChangeRef.current.phrase &&
        now - lastChangeRef.current.at < MIN_DISPLAY_MS &&
        lastChangeRef.current.phrase
      ) {
        // Min-display: keep the previous phrase; the new one is picked up on
        // a later tick (latest snapshot wins by then).
        phrase = lastChangeRef.current.phrase
      }

      if (phrase !== lastChangeRef.current.phrase) {
        lastChangeRef.current = { phrase, at: now }
      }

      const startedAt = snapshot?.startedAt ? Date.parse(snapshot.startedAt) : NaN
      const elapsedMs = now - (Number.isNaN(startedAt) ? busySince : startedAt)
      const withTimer =
        elapsedMs >= TIMER_VISIBLE_AFTER_MS
          ? `${phrase} · ${Math.floor(elapsedMs / 1000)}s`
          : phrase
      setLabel(withTimer)
    }

    compose()
    const interval = setInterval(compose, 1000)
    return () => clearInterval(interval)
  }, [conversationId, busy, stopping, openingLabel])

  return { label: busy ? label : null }
}
