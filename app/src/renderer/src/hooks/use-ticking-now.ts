import { useEffect, useMemo, useState } from 'react'

// Returns a `Date` that updates at an adaptive cadence. Pass the absolute
// timestamps (ms since epoch) of upcoming events you care about, and the hook
// picks the tick rate from the distance to the nearest one:
// <2m → 5s, <1h → 30s, otherwise → 60s.
export function useTickingNow(targetsMs: ReadonlyArray<number> | number | null = null): Date {
  const [now, setNow] = useState(() => new Date())
  const normalized = useMemo(() => {
    if (targetsMs == null) return null
    if (typeof targetsMs === 'number') return [targetsMs]
    return targetsMs.length ? targetsMs : null
  }, [targetsMs])

  useEffect(() => {
    let cancelled = false
    function schedule(): number {
      const nowMs = Date.now()
      let nearest: number | null = null
      if (normalized) {
        for (const t of normalized) {
          const delta = t - nowMs
          if (delta <= 0) continue
          if (nearest == null || delta < nearest) nearest = delta
        }
      }
      const interval = pickInterval(nearest)
      return window.setTimeout(() => {
        if (cancelled) return
        setNow(new Date())
        id = schedule()
      }, interval)
    }
    let id = schedule()
    return () => {
      cancelled = true
      window.clearTimeout(id)
    }
  }, [normalized])

  return now
}

function pickInterval(nearestMs: number | null): number {
  if (nearestMs == null) return 30_000
  if (nearestMs < 120_000) return 5_000
  if (nearestMs < 3_600_000) return 30_000
  return 60_000
}
