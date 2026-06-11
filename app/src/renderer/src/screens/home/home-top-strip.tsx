// ADR-029 §8 / P4 — persistent presence strip for the active conversation.
//
// During a conversation Ordinus must stay "in the room" — the welcoming hero's
// large mark shrinks into this thin header instead of disappearing into a plain
// transcript. The strip's mark animates while a turn is running, so the same
// object that carries Ordinus's presence is also the working indicator (no
// separate spinner needed for the high-level "Ordinus is working" cue).

import { OrdinusMark } from './ordinus-mark'

export type HomeTopStripProps = {
  /** Conversation title shown after the Ordinus name. Empty is fine. */
  title: string
  /** True while a turn is in flight — drives the mark's thinking animation. */
  busy: boolean
  onRename?: () => void
}

export function HomeTopStrip({ title, busy, onRename }: HomeTopStripProps): React.JSX.Element {
  return (
    // `px-12` clears the section's absolute corner buttons (summon on the left,
    // memory on the right) so the strip content never collides with them.
    <div className="flex h-12 shrink-0 items-center gap-2 border-b px-12">
      <OrdinusMark size="strip" state={busy ? 'thinking' : 'idle'} />
      <span className="text-sm font-semibold tracking-tight">Ordinus</span>
      {title ? (
        <>
          <span className="text-muted-foreground/60">·</span>
          <button
            type="button"
            className="truncate rounded-sm text-left text-sm text-muted-foreground transition-colors hover:text-foreground"
            onDoubleClick={onRename}
            title="Double-click to rename"
          >
            {title}
          </button>
        </>
      ) : null}
    </div>
  )
}
