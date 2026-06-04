import { useMemo } from 'react'
import { ChevronRight, Pin, Plus } from 'lucide-react'
import type { Agent, AgentSchedule } from '@shared/contracts'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import { humanizeRelative } from '@renderer/lib/humanize-cadence'
import { ScheduleRow } from './schedule-row'

export interface AgentScheduleGroupProps {
  agent: Agent | null
  schedules: AgentSchedule[]
  busyId: string
  agentColor: string
  variant?: 'standalone' | 'embedded'
  collapsed?: boolean
  highlightId?: string | null
  now: Date
  onToggleCollapse?: () => void
  onAdd?: () => void
  onFire: (s: AgentSchedule) => void
  onToggle: (s: AgentSchedule) => void
  onDelete: (s: AgentSchedule) => void
}

export function AgentScheduleGroup({
  agent,
  schedules,
  busyId,
  agentColor,
  variant = 'standalone',
  collapsed = false,
  highlightId,
  now,
  onToggleCollapse,
  onAdd,
  onFire,
  onToggle,
  onDelete
}: AgentScheduleGroupProps): React.JSX.Element {
  const counts = useMemo(() => {
    const total = schedules.length
    const needsAttention = schedules.filter(
      (s) =>
        s.lastRunStatus === 'failed' ||
        (!s.enabled && s.disableReason && s.disableReason !== 'manual')
    ).length
    const nextRun = schedules
      .filter((s) => s.enabled && s.nextRunAt)
      .map((s) => new Date(s.nextRunAt as string))
      .filter((d) => !Number.isNaN(d.getTime()) && d.getTime() >= now.getTime())
      .sort((a, b) => a.getTime() - b.getTime())[0]
    return { total, needsAttention, nextRun }
  }, [schedules, now])

  const embedded = variant === 'embedded'

  const summary = (
    <span className="text-xs text-muted-foreground">
      {counts.total} standing
      {counts.nextRun ? (
        <>
          {' · '}
          <span className="text-foreground/70">next {humanizeRelative(counts.nextRun, now)}</span>
        </>
      ) : null}
      {counts.needsAttention > 0 ? (
        <>
          {' · '}
          <span className="text-amber-600 dark:text-amber-400">
            {counts.needsAttention} need{counts.needsAttention === 1 ? 's' : ''} attention
          </span>
        </>
      ) : null}
    </span>
  )

  return (
    <section
      className={cn(
        embedded ? '' : 'overflow-hidden rounded-lg border border-border/60 bg-card shadow-sm'
      )}
    >
      {embedded ? (
        <div className="flex items-center justify-between px-1 pb-2">
          {summary}
          {onAdd ? (
            <Button size="sm" variant="ghost" onClick={onAdd} className="h-7 gap-1">
              <Plus className="size-3.5" />
              Add
            </Button>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={onToggleCollapse}
          className={cn(
            'flex w-full items-center gap-2 px-3 py-2 text-left transition-colors',
            'hover:bg-muted/40',
            !collapsed && 'border-b border-border/40'
          )}
        >
          <ChevronRight
            className={cn(
              'size-4 shrink-0 text-muted-foreground transition-transform duration-150',
              !collapsed && 'rotate-90'
            )}
          />
          <span
            className="inline-block h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: agentColor }}
            aria-hidden
          />
          <span className="truncate text-sm font-medium">
            {agent ? agent.name : 'Missing agent'}
          </span>
          {agent?.pinnedAt ? (
            <Pin className="size-3 shrink-0 text-muted-foreground" aria-label="Pinned" />
          ) : null}
          <span className="mx-1 text-muted-foreground/40">·</span>
          {summary}
          <span className="ml-auto flex items-center">
            {onAdd ? (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation()
                  onAdd()
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    e.stopPropagation()
                    onAdd()
                  }
                }}
                className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Add schedule"
              >
                <Plus className="size-3.5" />
              </span>
            ) : null}
          </span>
        </button>
      )}

      {!collapsed || embedded ? (
        <div className={cn(embedded ? 'mt-1 space-y-px' : 'p-2 pt-1')}>
          {schedules.length === 0 ? (
            <button
              type="button"
              onClick={onAdd}
              className="flex w-full items-center gap-2 rounded-md border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
            >
              <Plus className="size-3.5" />
              No standing work yet · Add schedule
            </button>
          ) : (
            <>
              <div className="grid grid-cols-[1fr_minmax(8rem,14rem)_minmax(5.5rem,7rem)_auto] gap-4 px-3 pb-1 pt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
                <span>Name</span>
                <span>Cadence</span>
                <span className="text-right">Next run</span>
                <span className="w-[3.75rem]" aria-hidden />
              </div>
              {schedules.map((s) => (
                <ScheduleRow
                  key={s.id}
                  schedule={s}
                  busy={busyId === s.id}
                  highlight={highlightId === s.id}
                  now={now}
                  onFire={onFire}
                  onToggle={onToggle}
                  onDelete={onDelete}
                />
              ))}
            </>
          )}
        </div>
      ) : null}
    </section>
  )
}
