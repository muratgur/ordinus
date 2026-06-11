// ADR-029 §8 — Empty-state landing.
//
// Renders inside the right-hand <section> card (see home-screen.tsx) so no
// border / background of its own. The page is a Codex-style hero stack:
// Ordinus mark on top, a centered prompt heading, the input itself centered
// (NOT pinned to the bottom), and slash-command chips just below the input.
//
// As soon as the user sends, home-screen.tsx swaps to the active-conversation
// branch and the input naturally docks at the bottom of the section. The
// empty state is purely the "nothing yet" landing.

import { useRef } from 'react'
import { HomeInput, type HomeInputHandle, type HomeInputProps } from './home-input'
import { OrdinusMark } from './ordinus-mark'

export type HomeEmptyStateProps = {
  onSend: HomeInputProps['onSend']
  busy: boolean
  disabled?: boolean
}

// ADR-029 §10 — human-phrased starter buttons replace the old bare slash-chip
// row. The new user lands here not knowing what to type; these hand them a
// first sentence. Ordered agent-first because an agent is the prerequisite for
// Workboard / Workflows.
//
// IMPORTANT: a starter does NOT send anything. It *prefills the input* with a
// natural, first-person opener and focuses the box; the user completes the
// sentence and presses Enter. This avoids the cold-context problem of the old
// slash-command auto-send (e.g. `/workboard` with no prior conversation made
// Ordinus respond confused), keeps the user in control, and shows a real
// human sentence in the transcript instead of a cryptic `/cmd`. The `/`
// autocomplete + slash commands remain as the power-user path, untouched.
// Prefills are deliberately HALF-templates — they end where the user's own
// specifics begin.
const STARTERS: ReadonlyArray<{ label: string; prefill: string }> = [
  {
    label: 'Create an agent',
    prefill: 'I want to create an agent. Help me figure out what kind I need — '
  },
  {
    label: 'Define work on the Workboard',
    prefill: 'I want to turn something into a work request: '
  },
  { label: 'Build a workflow', prefill: 'I want to build a workflow that ' },
  { label: 'Add a schedule', prefill: 'I want to schedule something to run regularly: ' }
]

export function HomeEmptyState(props: HomeEmptyStateProps): React.JSX.Element {
  const inputRef = useRef<HomeInputHandle | null>(null)
  return (
    <div className="ordinus-scrollbar flex h-full flex-col items-center justify-center overflow-y-auto px-6 py-12">
      {/* Optically balanced — the hero stack sits slightly ABOVE true vertical
          center, which reads as intentional/classy rather than machine-centered
          (ADR-029 §8). */}
      <div className="-mt-[6vh] flex w-full max-w-2xl flex-col items-stretch gap-7 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-500">
        {/* Presence anchor — the animated Ordinus mark (concentric ring), the
            emotional center of the welcoming stage. Breathes while idle. */}
        <div className="flex flex-col items-center gap-4">
          <OrdinusMark size="hero" state="idle" />
          <h1 className="text-center text-3xl font-semibold tracking-tight">
            Hi, I&apos;m Ordinus.
          </h1>
          <p className="max-w-md text-center text-sm leading-relaxed text-muted-foreground">
            Your teammate inside the app. Tell me what you&apos;re working on and I&apos;ll help you
            shape it — or just ask what happened in a run.
          </p>
        </div>

        {/* Input lives in the centered stack — not bottom-pinned. Once the
            user sends, the screen switches to the active-conversation
            layout where the input docks at the bottom of the section. */}
        <HomeInput
          ref={inputRef}
          onSend={props.onSend}
          busy={props.busy}
          disabled={props.disabled}
          placeholder="What are you working on?  Type / for shortcuts…"
          variant="hero"
        />

        {/* Starter buttons (ADR-029 §10). Secondary to the input but more
            present than the old faint slash chips — they're the answer to "what
            do I even type?". Clicking one PREFILLS the input (it does not send),
            then the user completes the sentence and hits Enter. Agent-first
            ordering. */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {STARTERS.map((starter) => (
            <button
              key={starter.label}
              type="button"
              disabled={props.busy || props.disabled}
              onClick={() => inputRef.current?.prefill(starter.prefill)}
              className="rounded-full border border-border/70 bg-background/40 px-3.5 py-1.5 text-xs text-muted-foreground transition duration-150 hover:border-border hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 motion-safe:active:scale-[0.97]"
            >
              {starter.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
