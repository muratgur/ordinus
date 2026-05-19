import { useEffect, useState } from 'react'

export const livenessReassurance = [
  'Matching the work to your agents.',
  'Weighing capabilities and connectors.',
  'Shaping items and dependencies.',
  'Almost there — finishing the draft.'
]

export function formatElapsed(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export type Liveness = {
  elapsed: number
  phase: string
  /** null while elapsed < 2s — callers supply their own pre-2s copy if any. */
  reassurance: string | null
  elapsedLabel: string
}

/**
 * Honest liveness for the one real coarse phase boundary: a brief "Preparing"
 * while the prompt/agents are assembled, then the long opaque drafting call.
 * Rotating copy + elapsed time signal that work is alive without claiming
 * fabricated sub-steps. No countdown or estimate (high variance). `active`
 * gates the ticker so a settled (failed) state stops counting.
 */
export function useLiveness(createdAt: number, active: boolean): Liveness {
  const [elapsed, setElapsed] = useState(() =>
    Math.max(0, Math.floor((Date.now() - createdAt) / 1000))
  )

  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - createdAt) / 1000)))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [createdAt, active])

  const phase = elapsed < 2 ? 'Preparing…' : 'Drafting your plan…'
  const reassurance =
    elapsed < 2 ? null : livenessReassurance[Math.floor(elapsed / 4) % livenessReassurance.length]

  return { elapsed, phase, reassurance, elapsedLabel: formatElapsed(elapsed) }
}
