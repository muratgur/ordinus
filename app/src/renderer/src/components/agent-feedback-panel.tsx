import { useCallback, useEffect, useState } from 'react'
import type { AgentMemoryRule } from '@shared/contracts'
import { Button } from './ui/button'
import { Switch } from './ui/switch'
import { notify } from '../lib/notifications'

type AgentFeedbackPanelProps = {
  agentId: string
  agentName: string
  sourceFeedbackId?: string
}

/**
 * Lets the user leave feedback on a completed run. If the "make permanent
 * rule" switch is on, the feedback text is persisted into the agent's memory
 * via `agents.addMemory`. Existing active rules are listed below the form so
 * the user can see what this agent already knows about them.
 */
export function AgentFeedbackPanel({
  agentId,
  agentName,
  sourceFeedbackId
}: AgentFeedbackPanelProps): React.JSX.Element {
  const [text, setText] = useState('')
  const [makePermanent, setMakePermanent] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [rules, setRules] = useState<AgentMemoryRule[]>([])
  const [rulesLoaded, setRulesLoaded] = useState(false)

  const refreshRules = useCallback(async () => {
    try {
      const next = await window.ordinus.agents.listMemory({ agentId })
      setRules(next)
    } catch (error) {
      console.error('Failed to load agent memory', error)
    } finally {
      setRulesLoaded(true)
    }
  }, [agentId])

  useEffect(() => {
    void refreshRules()
  }, [refreshRules])

  const handleSubmit = useCallback(async (): Promise<void> => {
    const trimmed = text.trim()
    if (!trimmed) {
      return
    }

    setSubmitting(true)
    try {
      if (makePermanent) {
        await window.ordinus.agents.addMemory({
          agentId,
          rule: trimmed,
          sourceFeedbackId
        })
        notify.success({
          title: `${agentName} learned this`,
          description: trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed
        })
        await refreshRules()
      } else {
        notify.info({
          title: 'Thanks for the feedback',
          description: 'Noted for this run — not saved as a permanent rule.'
        })
      }
      setText('')
    } catch (error) {
      notify.attention({
        title: 'Could not save feedback',
        description: error instanceof Error ? error.message : 'Unknown error.'
      })
    } finally {
      setSubmitting(false)
    }
  }, [agentId, agentName, makePermanent, refreshRules, sourceFeedbackId, text])

  const handleDeactivate = useCallback(
    async (ruleId: string): Promise<void> => {
      try {
        await window.ordinus.agents.deactivateMemory({ agentId, ruleId })
        await refreshRules()
      } catch (error) {
        notify.attention({
          title: 'Could not remove rule',
          description: error instanceof Error ? error.message : 'Unknown error.'
        })
      }
    },
    [agentId, refreshRules]
  )

  return (
    <div className="mt-5 border-t pt-4">
      <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
        Feedback for this agent
      </p>
      <textarea
        className="ordinus-scrollbar min-h-20 w-full resize-y rounded-lg border bg-card p-3 text-sm leading-6 text-foreground shadow-none outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        placeholder="e.g. Keep summaries under 3 bullets, prefer a warm tone."
        value={text}
        onChange={(event) => setText(event.target.value)}
        disabled={submitting}
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <Switch
            checked={makePermanent}
            onCheckedChange={(next) => setMakePermanent(Boolean(next))}
            disabled={submitting}
          />
          <span>Make this a permanent rule</span>
        </label>
        <Button
          type="button"
          size="sm"
          onClick={() => void handleSubmit()}
          disabled={submitting || text.trim().length === 0}
        >
          {submitting ? 'Saving…' : 'Send'}
        </Button>
      </div>

      {rulesLoaded && rules.length > 0 ? (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
            What {agentName} learned from you
          </p>
          <ul className="grid gap-1.5">
            {rules.map((rule) => (
              <li
                key={rule.id}
                className="flex items-start justify-between gap-3 rounded-md border bg-card px-3 py-2 text-sm"
              >
                <span className="min-w-0 break-words [overflow-wrap:anywhere]">{rule.rule}</span>
                <button
                  type="button"
                  className="shrink-0 text-xs text-muted-foreground transition-colors hover:text-destructive"
                  onClick={() => void handleDeactivate(rule.id)}
                  aria-label="Remove rule"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
