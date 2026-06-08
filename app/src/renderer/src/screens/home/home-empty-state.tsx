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

import { HomeInput, type HomeInputProps } from './home-input'
import { OrdinusMark } from './ordinus-mark'
import { slashCommands } from './slash-commands'

export type HomeEmptyStateProps = {
  onSend: HomeInputProps['onSend']
  busy: boolean
  disabled?: boolean
}

export function HomeEmptyState(props: HomeEmptyStateProps): React.JSX.Element {
  return (
    <div className="ordinus-scrollbar flex h-full flex-col items-center justify-center overflow-y-auto px-6 py-12">
      {/* Optically balanced — the hero stack sits slightly ABOVE true vertical
          center, which reads as intentional/classy rather than machine-centered
          (ADR-029 §8). */}
      <div className="-mt-[6vh] flex w-full max-w-2xl flex-col items-stretch gap-7">
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
          onSend={props.onSend}
          busy={props.busy}
          disabled={props.disabled}
          placeholder="What are you working on?  Type / for shortcuts…"
          variant="hero"
        />

        {/* Slash-command chips — kept deliberately secondary (ADR-029 §8): no
            border, no fill, faint by default; they only surface on hover so the
            input stays the focal point and the stage reads calm. Clicking one
            sends the bare /cmd so Ordinus opens with its default flow. */}
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs">
          {slashCommands.map((cmd) => (
            <button
              key={cmd.name}
              type="button"
              disabled={props.busy || props.disabled}
              onClick={() => props.onSend(`/${cmd.name}`)}
              className="rounded-md px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground/60 transition-colors hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              title={cmd.hint}
            >
              {cmd.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
