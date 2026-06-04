import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, MoreHorizontal, Play, Power, Trash2 } from 'lucide-react'
import type { AgentSchedule } from '@shared/contracts'
import { Button } from '@renderer/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { cn } from '@renderer/lib/utils'
import { formatAbsolute, humanizeCadence, humanizeRelative } from '@renderer/lib/humanize-cadence'
import { disableReasonLabel } from '../schedule-labels'

export interface ScheduleRowProps {
  schedule: AgentSchedule
  busy?: boolean
  highlight?: boolean
  now: Date
  onFire: (s: AgentSchedule) => void
  onToggle: (s: AgentSchedule) => void
  onDelete: (s: AgentSchedule) => void
}

export function ScheduleRow({
  schedule,
  busy,
  highlight,
  now,
  onFire,
  onToggle,
  onDelete
}: ScheduleRowProps): React.JSX.Element {
  const cadence = useMemo(() => humanizeCadence(schedule), [schedule])
  const disabledLabel = disableReasonLabel(schedule)
  const isFailed = schedule.lastRunStatus === 'failed'
  const isPaused = !schedule.enabled

  const nextDate = schedule.nextRunAt ? new Date(schedule.nextRunAt) : null
  const nextDiff = nextDate ? nextDate.getTime() - now.getTime() : null
  const isImminent = nextDiff != null && nextDiff > 0 && nextDiff < 60 * 60 * 1000

  const [expanded, setExpanded] = useState(false)

  const ref = useRef<HTMLDivElement | null>(null)
  const [pulse, setPulse] = useState(false)
  const wasHighlight = useRef(false)
  useEffect(() => {
    if (highlight && !wasHighlight.current) {
      setPulse(true)
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      const t = window.setTimeout(() => setPulse(false), 1000)
      wasHighlight.current = true
      return () => window.clearTimeout(t)
    }
    if (!highlight) wasHighlight.current = false
    return undefined
  }, [highlight])

  const promptText = (schedule.prompt ?? '').trim()

  return (
    <div
      ref={ref}
      data-row-id={schedule.id}
      className={cn(
        'group border-t border-border/30 transition-colors duration-200 first:border-t-0',
        'hover:bg-muted/30',
        isPaused && 'opacity-60',
        pulse && 'ring-2 ring-primary/40'
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="grid w-full grid-cols-[1fr_minmax(8rem,14rem)_minmax(5.5rem,7rem)_auto] items-center gap-4 rounded-md px-3 py-2 text-left"
        aria-expanded={expanded}
        title={expanded ? 'Hide prompt' : 'Show prompt'}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <ChevronRight
            className={cn(
              'size-3 shrink-0 text-muted-foreground/50 transition-transform duration-150',
              expanded && 'rotate-90'
            )}
            aria-hidden
          />
          <span className="truncate text-sm font-medium" title={schedule.name}>
            {schedule.name}
          </span>
          {isPaused && disabledLabel ? (
            <span className="ml-1 truncate text-xs text-amber-600 dark:text-amber-400">
              {disabledLabel}
            </span>
          ) : null}
        </div>

        <span className="truncate text-xs tabular-nums text-muted-foreground" title={cadence.label}>
          {cadence.label}
        </span>

        <div className="flex flex-col items-end leading-tight">
          {isPaused ? (
            <span className="text-xs text-muted-foreground">Paused</span>
          ) : (
            <>
              <span
                className={cn(
                  'text-sm tabular-nums',
                  isFailed
                    ? 'text-destructive'
                    : isImminent
                      ? 'font-medium text-primary'
                      : 'text-muted-foreground'
                )}
              >
                {humanizeRelative(nextDate, now)}
              </span>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {formatAbsolute(nextDate)}
              </span>
            </>
          )}
        </div>

        <div
          className="flex items-center gap-0.5"
          onClick={(e) => e.stopPropagation()}
          role="presentation"
        >
          <Button
            variant="ghost"
            size="icon"
            disabled={busy}
            onClick={() => onFire(schedule)}
            title="Run now"
            className="h-7 w-7"
          >
            <Play className="size-3.5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" disabled={busy} className="h-7 w-7" title="More">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44 bg-card text-foreground">
              <DropdownMenuItem onSelect={() => onToggle(schedule)}>
                <Power className="size-3.5" />
                {schedule.enabled ? 'Pause' : 'Resume'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => onDelete(schedule)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="size-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </button>

      {expanded ? (
        <div className="border-t border-border/30 bg-muted/20 px-3 py-2 pl-[1.65rem]">
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
            Prompt
          </div>
          {promptText ? (
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground/80">
              {promptText}
            </p>
          ) : (
            <p className="text-xs italic text-muted-foreground">No prompt recorded.</p>
          )}
        </div>
      ) : null}
    </div>
  )
}
