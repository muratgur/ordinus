// ADR-036 — shared state machine for the run inspector bottom sheet on
// conversational surfaces (Home, Agent Room).
//
// The inspector is turn-scoped and targets one of two things:
//   - the LIVE in-flight turn (status-row click): its snapshot keeps mutating
//     with `observability:run-changed` pushes, matched by the in-memory
//     conversationId decoration (ADR-034 — current app session only);
//   - one specific FINISHED turn (gutter-icon click): its snapshot is fetched
//     once via `observability.getTurnRun`, which works across app restarts.
//
// All state is keyed by conversation id and derived against the current one,
// so switching conversations implicitly closes the sheet and drops the stale
// snapshot without effect-driven resets.

import { useEffect, useState } from 'react'
import type { ObservedRunSnapshot } from '@shared/contracts'

export type RunInspector = {
  /** Whether the sheet is open for the current conversation. */
  open: boolean
  /** The snapshot to show (null renders the sheet's empty state). */
  run: ObservedRunSnapshot | null
  /** True when targeting the in-flight turn (push-fed, mutating snapshot). */
  live: boolean
  openLive: () => void
  openTurn: (turnId: string) => Promise<void>
  close: () => void
}

export function useRunInspector(conversationId: string | null): RunInspector {
  const [target, setTarget] = useState<
    | { conversationId: string; mode: 'live' }
    | { conversationId: string; mode: 'turn'; snapshot: ObservedRunSnapshot | null }
    | null
  >(null)
  const [liveRun, setLiveRun] = useState<{
    conversationId: string
    snapshot: ObservedRunSnapshot
  } | null>(null)

  useEffect(() => {
    if (!conversationId) return undefined

    let cancelled = false
    let pushSeen = false
    const off = window.ordinus.observability.onRunChanged((snapshot) => {
      if (snapshot.conversationId !== conversationId) return
      pushSeen = true
      setLiveRun({ conversationId, snapshot })
    })
    // Seed from the persisted record so opening the live inspector right
    // after a remount (e.g. returning from another tab mid-turn) shows the
    // in-flight run instead of the "no record" empty state — pushes only
    // fire on provider events. A push that races in first wins.
    void window.ordinus.observability
      .listConversation({ conversationId })
      .then((runs) => {
        if (cancelled || pushSeen) return
        const live = runs.find(
          (run) =>
            run.lifecycleStatus !== 'completed' &&
            run.lifecycleStatus !== 'failed' &&
            run.lifecycleStatus !== 'cancelled'
        )
        if (live) setLiveRun({ conversationId, snapshot: live })
      })
      .catch(() => {
        // Best-effort: the sheet's empty state covers this.
      })
    return () => {
      cancelled = true
      off()
    }
  }, [conversationId])

  const open = Boolean(conversationId) && target?.conversationId === conversationId
  const live = open && target?.mode === 'live'
  const run = !open
    ? null
    : target?.mode === 'turn'
      ? target.snapshot
      : liveRun?.conversationId === conversationId
        ? liveRun.snapshot
        : null

  return {
    open,
    run,
    live,
    openLive: () => {
      if (conversationId) setTarget({ conversationId, mode: 'live' })
    },
    openTurn: async (turnId: string) => {
      if (!conversationId) return
      let snapshot: ObservedRunSnapshot | null = null
      try {
        snapshot = await window.ordinus.observability.getTurnRun({ turnId })
      } catch {
        // Best-effort: the sheet renders its "no record" empty state.
      }
      setTarget({ conversationId, mode: 'turn', snapshot })
    },
    close: () => setTarget(null)
  }
}
