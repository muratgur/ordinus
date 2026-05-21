import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AgentReflectionEntry, AgentReflectionSummary } from '@shared/contracts'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { ScrollArea } from './ui/scroll-area'
import { notify } from '../lib/notifications'
import { cn } from '../lib/utils'
import { AgentAvatar } from './agent-avatar'

type AgentReflectionDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged?: () => void
}

/**
 * Monthly reflection surface. One screen, two jobs:
 *
 *  - Per active agent: review the rules the user has taught and prune them.
 *  - For agents untouched longer than the stale threshold: batch archive.
 *
 * No automatic action is taken; the user confirms every change.
 */
export function AgentReflectionDialog({
  open,
  onOpenChange,
  onChanged
}: AgentReflectionDialogProps): React.JSX.Element {
  const [summary, setSummary] = useState<AgentReflectionSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedToArchive, setSelectedToArchive] = useState<Set<string>>(new Set())

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const next = await window.ordinus.agents.listReflection()
      setSummary(next)
      setSelectedToArchive(
        new Set(next.entries.filter((entry) => entry.isStale).map((entry) => entry.agent.id))
      )
    } catch (error) {
      notify.attention({
        title: 'Could not load reflection data',
        description: error instanceof Error ? error.message : 'Unknown error.'
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      void refresh()
    } else {
      setSummary(null)
      setSelectedToArchive(new Set())
    }
  }, [open, refresh])

  const staleEntries = useMemo(
    () => (summary?.entries ?? []).filter((entry) => entry.isStale),
    [summary]
  )
  const freshEntries = useMemo(
    () => (summary?.entries ?? []).filter((entry) => !entry.isStale),
    [summary]
  )

  const toggleArchive = (agentId: string): void => {
    setSelectedToArchive((current) => {
      const next = new Set(current)
      if (next.has(agentId)) {
        next.delete(agentId)
      } else {
        next.add(agentId)
      }
      return next
    })
  }

  const handleArchiveSelected = async (): Promise<void> => {
    if (selectedToArchive.size === 0) return
    try {
      await Promise.all(
        Array.from(selectedToArchive).map((id) => window.ordinus.agents.archive({ id }))
      )
      notify.success({
        title: 'Archived',
        description: `${selectedToArchive.size} agent${selectedToArchive.size === 1 ? '' : 's'} moved to archive.`
      })
      onChanged?.()
      await refresh()
    } catch (error) {
      notify.attention({
        title: 'Archive failed',
        description: error instanceof Error ? error.message : 'Unknown error.'
      })
    }
  }

  const handleDeactivateRule = async (agentId: string, ruleId: string): Promise<void> => {
    try {
      await window.ordinus.agents.deactivateMemory({ agentId, ruleId })
      await refresh()
    } catch (error) {
      notify.attention({
        title: 'Could not remove rule',
        description: error instanceof Error ? error.message : 'Unknown error.'
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid h-[min(800px,calc(100vh-2rem))] max-w-3xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0">
        <div className="border-b p-5">
          <DialogHeader>
            <DialogTitle>Agent reflection</DialogTitle>
            <DialogDescription>
              Review what your agents learned this month. Prune their rules, archive the ones you no
              longer use.
            </DialogDescription>
          </DialogHeader>
        </div>

        <ScrollArea className="h-full min-h-0">
          <div className="grid gap-6 p-5">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : summary && summary.entries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No agents yet.</p>
            ) : (
              <>
                {staleEntries.length > 0 ? (
                  <section>
                    <h3 className="text-sm font-semibold">
                      Untouched for {summary?.staleThresholdDays ?? 14} days
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Review the selection — archive them in one click when you&apos;re ready.
                    </p>
                    <ul className="mt-3 grid gap-2">
                      {staleEntries.map((entry) => (
                        <li
                          key={entry.agent.id}
                          className={cn(
                            'flex items-start justify-between gap-3 rounded-md border bg-card px-3 py-2.5 text-sm transition-colors',
                            selectedToArchive.has(entry.agent.id) && 'border-primary bg-primary/5'
                          )}
                        >
                          <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                            <input
                              type="checkbox"
                              className="mt-1"
                              checked={selectedToArchive.has(entry.agent.id)}
                              onChange={() => toggleArchive(entry.agent.id)}
                            />
                            <AgentAvatar avatar={entry.agent.avatar} size={32} />
                            <span className="min-w-0">
                              <span className="block font-medium">{entry.agent.name}</span>
                              <span className="block text-xs text-muted-foreground">
                                {entry.agent.role}
                              </span>
                              <span className="mt-0.5 block text-xs text-muted-foreground">
                                {entry.daysSinceUsed === null
                                  ? 'Never used'
                                  : `Used ${entry.daysSinceUsed} day${entry.daysSinceUsed === 1 ? '' : 's'} ago`}
                              </span>
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                {freshEntries.length > 0 ? (
                  <section>
                    <h3 className="text-sm font-semibold">Your active agents</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Review what each of them has learned from you.
                    </p>
                    <ul className="mt-3 grid gap-3">
                      {freshEntries.map((entry) => (
                        <AgentRulesCard
                          key={entry.agent.id}
                          entry={entry}
                          onDeactivate={(ruleId) =>
                            void handleDeactivateRule(entry.agent.id, ruleId)
                          }
                        />
                      ))}
                    </ul>
                  </section>
                ) : null}
              </>
            )}
          </div>
        </ScrollArea>

        <div className="flex items-center justify-between gap-3 border-t bg-accent/40 px-5 py-3">
          <p className="text-xs text-muted-foreground">
            {staleEntries.length > 0
              ? `${selectedToArchive.size} selected for archive`
              : 'Nothing to archive'}
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button
              type="button"
              disabled={selectedToArchive.size === 0}
              onClick={() => void handleArchiveSelected()}
            >
              Archive selected
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function AgentRulesCard({
  entry,
  onDeactivate
}: {
  entry: AgentReflectionEntry
  onDeactivate: (ruleId: string) => void
}): React.JSX.Element {
  return (
    <li className="rounded-md border bg-card px-3 py-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <AgentAvatar avatar={entry.agent.avatar} size={32} />
          <div className="min-w-0">
            <span className="block font-medium">{entry.agent.name}</span>
            <span className="block text-xs text-muted-foreground">{entry.agent.role}</span>
          </div>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {entry.daysSinceUsed === null
            ? '—'
            : entry.daysSinceUsed === 0
              ? 'today'
              : `${entry.daysSinceUsed} day${entry.daysSinceUsed === 1 ? '' : 's'} ago`}
        </span>
      </div>
      {entry.rules.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">No permanent rules yet.</p>
      ) : (
        <ul className="mt-2 grid gap-1.5">
          {entry.rules.map((rule) => (
            <li
              key={rule.id}
              className="flex items-start justify-between gap-3 rounded-md border bg-background px-2.5 py-1.5"
            >
              <span className="min-w-0 break-words text-xs [overflow-wrap:anywhere]">
                {rule.rule}
              </span>
              <button
                type="button"
                className="shrink-0 text-xs text-muted-foreground transition-colors hover:text-destructive"
                onClick={() => onDeactivate(rule.id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
