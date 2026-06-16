import { FlaskConical } from 'lucide-react'
import type { AppInfo } from '@shared/contracts'
import { cn } from '@renderer/lib/utils'

// ADR-051 — the scratch data profile is visually identical to real except for this
// marker. A fixed, unobtrusive pill (plus the "Ordinus — SCRATCH" window title set in
// the main process) keeps the isolated sandbox from being mistaken for real data.
export function ScratchProfileBadge({
  appInfo
}: {
  appInfo: AppInfo | null
}): React.JSX.Element | null {
  if (appInfo?.profile !== 'scratch') return null

  return (
    <div
      className={cn(
        'pointer-events-none fixed bottom-3 right-3 z-50 flex items-center gap-1.5',
        'rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-1',
        'text-[11px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400',
        'shadow-sm backdrop-blur-sm select-none'
      )}
      title="Scratch data profile — isolated, resettable sandbox (ADR-051)"
    >
      <FlaskConical className="size-3" />
      Scratch
    </div>
  )
}
