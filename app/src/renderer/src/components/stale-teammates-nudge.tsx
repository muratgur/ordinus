import { useEffect, useState } from 'react'
import { Archive, ChevronDown, ChevronRight, Clock, Loader2, X } from 'lucide-react'
import type { AgentReflectionEntry } from '@shared/contracts'
import { AgentAvatar } from './agent-avatar'

/**
 * A quiet team nudge (ADR-027 §8): when teammates have gone untouched past the
 * stale threshold, offer a gentle, dismissible prompt to archive them. Replaces
 * the global reflection dialog's archive job; per-agent rule pruning now lives
 * in each agent's About tab.
 */
export function StaleTeammatesNudge({
  onArchived
}: {
  onArchived: () => void
}): React.JSX.Element | null {
  const [entries, setEntries] = useState<AgentReflectionEntry[]>([])
  const [thresholdDays, setThresholdDays] = useState(14)
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [busyId, setBusyId] = useState('')

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      window.ordinus.agents
        .listReflection()
        .then((summary) => {
          if (cancelled) return
          setEntries(summary.entries.filter((entry) => entry.isStale))
          setThresholdDays(summary.staleThresholdDays)
        })
        .catch(() => {})
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function archive(agentId: string): Promise<void> {
    try {
      setBusyId(agentId)
      await window.ordinus.agents.archive({ id: agentId })
      setEntries((current) => current.filter((entry) => entry.agent.id !== agentId))
      onArchived()
    } catch {
      // Non-blocking: leave the entry in place if archiving fails.
    } finally {
      setBusyId('')
    }
  }

  if (dismissed || entries.length === 0) {
    return null
  }

  const summary = `${entries.length} teammate${entries.length === 1 ? '' : 's'} quiet for ${thresholdDays}+ days`

  return (
    <div className="rounded-lg border border-dashed bg-accent/40">
      <div className="flex items-center gap-2 px-3 py-2">
        <Clock className="size-3.5 shrink-0 text-muted-foreground" />
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex min-w-0 flex-1 items-center gap-1 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {open ? (
            <ChevronDown className="size-3.5 shrink-0" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0" />
          )}
          <span className="truncate">{summary}</span>
        </button>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => setDismissed(true)}
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
      {open ? (
        <ul className="grid gap-1 border-t px-2 py-2">
          {entries.map((entry) => (
            <li key={entry.agent.id} className="flex items-center gap-2 rounded-md px-1 py-1">
              <AgentAvatar avatar={entry.agent.avatar} size={24} className="shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{entry.agent.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {entry.daysSinceUsed === null
                    ? 'Never used'
                    : `Used ${entry.daysSinceUsed} day${entry.daysSinceUsed === 1 ? '' : 's'} ago`}
                </p>
              </div>
              <button
                type="button"
                disabled={busyId === entry.agent.id}
                onClick={() => void archive(entry.agent.id)}
                className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                {busyId === entry.agent.id ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Archive className="size-3" />
                )}
                Archive
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
