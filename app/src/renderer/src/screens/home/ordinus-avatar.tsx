// ADR-048 §4 — Ordinus's signature character avatar.
//
// Ordinus is no longer just an abstract mark: it has a face. This renders the
// fixed signature portrait (built from docs/Chars/Ordinus.png — same clay family
// as the agent mascots, but a distinct class: reserved brand tint + headset).
// The portrait is static (state-based animation is deferred, ADR-048 phase 6);
// while Ordinus is thinking we wrap it in a soft pulsing brand ring so the same
// object doubles as the working indicator, the way the old mark did.
//
// Two scales mirror the old mark: 'hero' (empty/welcome focal point) and 'strip'
// (the small active-conversation top-strip presence).

import portraitUrl from '@renderer/assets/ordinus/portrait.webp'
import { cn } from '@renderer/lib/utils'

export type OrdinusAvatarProps = {
  size?: 'hero' | 'strip'
  thinking?: boolean
  className?: string
}

const SIZE_PX: Record<'hero' | 'strip', number> = {
  hero: 96,
  strip: 28
}

export function OrdinusAvatar({
  size = 'hero',
  thinking = false,
  className
}: OrdinusAvatarProps): React.JSX.Element {
  const px = SIZE_PX[size]
  return (
    <div
      className={cn(
        'relative inline-flex shrink-0 items-end justify-center overflow-hidden rounded-[28%] bg-primary/10 ring-1 ring-primary/30',
        thinking && 'ring-2 ring-primary/60 motion-safe:animate-pulse',
        className
      )}
      style={{ width: px, height: px }}
      role="img"
      aria-label={thinking ? 'Ordinus, thinking' : 'Ordinus'}
    >
      <img
        src={portraitUrl}
        alt=""
        className="h-full w-full object-contain object-bottom select-none"
        draggable={false}
      />
    </div>
  )
}
