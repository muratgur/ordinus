// ADR-029 §10 — First-run welcome panel.
//
// A one-time, dismissible overlay that opens OVER the Home empty state the
// first time a freshly-onboarded user lands here. It *primes the map* (what
// Agents / Workboard / Workflows / Schedules are, and who Ordinus is) and then
// hands off: closing it reveals the real empty state with its starter buttons,
// where the user sends their first message. It deliberately does NOT replace
// the empty state and Ordinus never auto-greets — the welcome copy is static
// and lives here, keeping Ordinus reactive (§1).
//
// Five swipeable steps (agent-first, mirroring the prerequisite order):
//   1. Who Ordinus is        — the animated mark, no screenshot
//   2. Agents                — the prerequisite colleagues
//   3. Workboard
//   4. Workflows + Schedules — combined (no schedules screenshot exists)
//   5. Let's start           — the hand-off
//
// "Seen" persistence lives in storage.ts; this component is purely the UI and
// reports dismissal via onDismiss. It is also re-openable from the Home header,
// which just re-mounts it open without clearing the seen flag.

import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import { OrdinusMark } from './ordinus-mark'
import agentsShot from '@renderer/assets/onboarding/agents.png'
import workboardShot from '@renderer/assets/onboarding/workboard.png'
import workflowShot from '@renderer/assets/onboarding/workflow-designer.png'

export type HomeWelcomePanelProps = {
  onDismiss: () => void
}

type WelcomeStep = {
  id: string
  title: string
  body: string
  /** Screenshot URL, or null for the mark-only intro step. */
  image: string | null
}

const STEPS: ReadonlyArray<WelcomeStep> = [
  {
    id: 'ordinus',
    title: "Hi, I'm Ordinus.",
    body: "Your teammate inside this app. I help you shape your work and figure out how to get things done here — just ask. Here's a quick tour of what you can build.",
    image: null
  },
  {
    id: 'agents',
    title: 'Agents do the work',
    body: 'Agents are your hired colleagues — each one a configured persona that actually carries out tasks. This is the place to start: you bring in an agent first, then put it to work.',
    image: agentsShot
  },
  {
    id: 'workboard',
    title: 'Workboard is where work happens',
    body: 'Hand a task to an agent as a Work Request and watch it run. The Workboard is your board of everything in flight, done, or waiting.',
    image: workboardShot
  },
  {
    id: 'workflows',
    title: 'Automate the repeating stuff',
    body: 'Chain tasks into a visual Workflow for multi-step work, or set a Schedule to run something on a cadence — a daily summary, a weekly report. Set it once, let it run.',
    image: workflowShot
  },
  {
    id: 'start',
    title: "Let's get you started",
    body: "I'll be right here. Pick one of the starters below the box — or just tell me what you're working on. Creating your first agent is a great place to begin.",
    image: null
  }
]

// The parent mounts this only while the tour is open, so each open is a fresh
// mount — `index` starts at 0 with no reset effect needed.
export function HomeWelcomePanel({ onDismiss }: HomeWelcomePanelProps): React.JSX.Element {
  const [index, setIndex] = useState(0)

  const isFirst = index === 0
  const isLast = index === STEPS.length - 1

  const goNext = useCallback(() => {
    setIndex((i) => Math.min(i + 1, STEPS.length - 1))
  }, [])
  const goPrev = useCallback(() => {
    setIndex((i) => Math.max(i - 1, 0))
  }, [])

  // Keyboard: Esc dismisses, arrows navigate.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onDismiss()
      else if (e.key === 'ArrowRight') goNext()
      else if (e.key === 'ArrowLeft') goPrev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDismiss, goNext, goPrev])

  const step = STEPS[index]

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-background/70 p-6 backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Ordinus"
      onClick={onDismiss}
    >
      <div
        className="relative flex w-full max-w-lg flex-col overflow-hidden rounded-xl border bg-card shadow-xl motion-safe:animate-in motion-safe:zoom-in-95 motion-safe:duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Skip / close — unobtrusive, top-right. */}
        <button
          type="button"
          aria-label="Skip welcome"
          title="Skip"
          className="absolute right-3 top-3 z-10 rounded-md p-1.5 text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
          onClick={onDismiss}
        >
          <X className="size-4" />
        </button>

        {/* Visual: a screenshot, or the mark for the intro/outro steps. */}
        <div className="flex h-52 items-center justify-center bg-muted/40 px-8 pt-2">
          {step.image ? (
            <img src={step.image} alt="" className="max-h-44 w-auto rounded-md border shadow-sm" />
          ) : (
            <OrdinusMark size="hero" state="idle" />
          )}
        </div>

        {/* Copy. */}
        <div className="flex flex-col gap-2 px-8 pb-2 pt-6 text-center">
          <h2 className="text-xl font-semibold tracking-tight">{step.title}</h2>
          <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
            {step.body}
          </p>
        </div>

        {/* Step dots. */}
        <div className="flex items-center justify-center gap-1.5 py-4">
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              aria-label={`Go to step ${i + 1}`}
              onClick={() => setIndex(i)}
              className={cn(
                'h-1.5 rounded-full transition-all',
                i === index
                  ? 'w-5 bg-primary'
                  : 'w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50'
              )}
            />
          ))}
        </div>

        {/* Footer nav. */}
        <div className="flex items-center justify-between border-t px-5 py-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={goPrev}
            disabled={isFirst}
            className={cn(isFirst && 'invisible')}
          >
            <ArrowLeft className="mr-1 size-4" />
            Back
          </Button>

          {isLast ? (
            <Button type="button" size="sm" onClick={onDismiss}>
              Let&apos;s start
            </Button>
          ) : (
            <Button type="button" size="sm" onClick={goNext}>
              Next
              <ArrowRight className="ml-1 size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
