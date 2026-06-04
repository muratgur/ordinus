import { useMemo } from 'react'
import type { Agent, AgentSchedule } from '@shared/contracts'
import { cn } from '@renderer/lib/utils'
import { humanizeRelative } from '@renderer/lib/humanize-cadence'

export interface WhatsNextStripProps {
  schedules: AgentSchedule[]
  agentsById: Map<string, Agent>
  agentColorFor: (agentId: string) => string
  now: Date
  onSelect: (schedule: AgentSchedule) => void
}

// Default window: next 24h.
const WINDOW_MS = 24 * 3_600_000

export function WhatsNextStrip({
  schedules,
  agentsById,
  agentColorFor,
  now,
  onSelect
}: WhatsNextStripProps): React.JSX.Element {
  const upcoming = useMemo(() => {
    const cutoff = now.getTime() + WINDOW_MS
    return schedules
      .filter((s) => s.enabled && s.nextRunAt)
      .map((s) => ({ s, t: new Date(s.nextRunAt as string).getTime() }))
      .filter(({ t }) => !Number.isNaN(t) && t >= now.getTime() - 10_000 && t <= cutoff)
      .sort((a, b) => a.t - b.t)
  }, [schedules, now])

  if (upcoming.length === 0) {
    return (
      <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        Quiet — nothing scheduled in the next 24 hours.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex items-stretch gap-2 pb-1">
        {upcoming.map(({ s, t }, idx) => {
          const agent = agentsById.get(s.agentId)
          const isFailed = s.lastRunStatus === 'failed'
          const ms = t - now.getTime()
          const isImminent = ms > 0 && ms < 60 * 60 * 1000
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(s)}
              className={cn(
                'group inline-flex max-w-[200px] shrink-0 items-center gap-2 rounded-full border border-border/60 bg-card px-3 py-1.5 text-left text-xs transition-all duration-200 hover:bg-muted/40 hover:shadow-sm animate-in fade-in slide-in-from-left-1',
                isFailed && 'border-destructive/40',
                isImminent && 'border-primary/40'
              )}
              style={{ animationDelay: `${idx * 30}ms` }}
              title={`${s.name} — ${agent?.name ?? ''}`}
            >
              <span
                aria-hidden
                className={cn(
                  'inline-block h-2 w-2 shrink-0 rounded-full transition-transform duration-150 group-hover:scale-110',
                  isFailed && 'ring-2 ring-destructive/50'
                )}
                style={{ backgroundColor: agentColorFor(s.agentId) }}
              />
              <span className="min-w-0 truncate font-medium">{s.name}</span>
              <span
                className={cn(
                  'shrink-0 tabular-nums',
                  isFailed
                    ? 'text-destructive'
                    : isImminent
                      ? 'text-primary'
                      : 'text-muted-foreground'
                )}
              >
                {humanizeRelative(new Date(t), now)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
