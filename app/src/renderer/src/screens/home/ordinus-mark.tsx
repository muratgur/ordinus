// ADR-029 §1 / P1 — the Ordinus mark.
//
// Ordinus's visual identity: a distinctive abstract "concentric ring" — an open
// arc orbiting a calm breathing core (a quiet "O"), in the app's signature tint.
// Deliberately NOT the generic Sparkles/AI-cliché icon and NOT a human avatar.
// The mark is a *presence*: it breathes when idle and animates faster while
// thinking, so the same object is also Ordinus's working indicator (§8 top
// strip). Animation + reduced-motion handling live in main.css
// (.ordinus-mark-arc / .ordinus-mark-core).
//
// One component, two scales:
//   - 'hero'  → welcoming/empty state, large focal point.
//   - 'strip' → active-conversation top strip, small.

import { cn } from '@renderer/lib/utils'

export type OrdinusMarkState = 'idle' | 'thinking'

export type OrdinusMarkProps = {
  size?: 'hero' | 'strip'
  state?: OrdinusMarkState
  className?: string
}

const SIZE_PX: Record<'hero' | 'strip', number> = {
  hero: 56,
  strip: 22
}

export function OrdinusMark({
  size = 'hero',
  state = 'idle',
  className
}: OrdinusMarkProps): React.JSX.Element {
  const px = SIZE_PX[size]
  // Heavier strokes at the small size so the ring stays legible in the strip.
  const isHero = size === 'hero'
  const trackWidth = isHero ? 2 : 4
  const arcWidth = isHero ? 3 : 6
  const coreR = isHero ? 11 : 13
  // Dash = visible arc + gap; the gap is what makes the rotation readable.
  const arcDash = isHero ? '120 94' : '130 96'

  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 100 100"
      className={cn('shrink-0', className)}
      role="img"
      aria-label="Ordinus"
    >
      {/* Faint full track so the ring reads as a closed "O" even mid-rotation. */}
      <circle
        cx="50"
        cy="50"
        r="34"
        fill="none"
        stroke="hsl(var(--muted-foreground) / 0.18)"
        strokeWidth={trackWidth}
      />
      {/* The moving arc — Ordinus's signature element. */}
      <circle
        className="ordinus-mark-arc"
        data-state={state}
        cx="50"
        cy="50"
        r="34"
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth={arcWidth}
        strokeLinecap="round"
        strokeDasharray={arcDash}
      />
      {/* The calm core — "someone is here". */}
      <circle
        className="ordinus-mark-core"
        data-state={state}
        cx="50"
        cy="50"
        r={coreR}
        fill="hsl(var(--primary))"
      />
    </svg>
  )
}
