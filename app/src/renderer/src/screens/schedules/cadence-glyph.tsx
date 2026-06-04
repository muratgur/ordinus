import { cn } from '@renderer/lib/utils'
import type { CadenceKind } from '@renderer/lib/humanize-cadence'

interface CadenceGlyphProps {
  kind: CadenceKind
  weeklyDays?: number[]
  color?: string
  className?: string
  // Visual state: 'ok' (normal), 'failed' (red ring), 'paused' (muted).
  state?: 'ok' | 'failed' | 'paused'
}

export function CadenceGlyph({
  kind,
  weeklyDays,
  color,
  className,
  state = 'ok'
}: CadenceGlyphProps): React.JSX.Element {
  const ringClass =
    state === 'failed'
      ? 'ring-2 ring-destructive/50'
      : state === 'paused'
        ? 'ring-1 ring-muted-foreground/30'
        : ''
  const dotColor =
    state === 'paused' ? 'hsl(var(--muted-foreground))' : (color ?? 'hsl(var(--primary))')

  // weekly: 7 tiny bars, filled for active days
  if (kind === 'weekly') {
    const days = weeklyDays ?? []
    return (
      <span
        aria-hidden
        className={cn(
          'inline-flex h-5 w-5 items-center justify-center gap-[1px] rounded-full p-[3px]',
          ringClass,
          className
        )}
      >
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <span
            key={i}
            className="h-2 w-[1.5px] rounded-sm"
            style={{
              backgroundColor: days.includes(i) ? dotColor : 'hsl(var(--muted-foreground) / 0.3)'
            }}
          />
        ))}
      </span>
    )
  }

  // daily: three dots
  if (kind === 'daily') {
    return (
      <span
        aria-hidden
        className={cn(
          'inline-flex h-5 w-5 items-center justify-center gap-[2px] rounded-full',
          ringClass,
          className
        )}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: dotColor }}
          />
        ))}
      </span>
    )
  }

  // hourly: ring with tick
  if (kind === 'hourly') {
    return (
      <span
        aria-hidden
        className={cn(
          'inline-flex h-5 w-5 items-center justify-center rounded-full',
          ringClass,
          className
        )}
      >
        <span className="h-3.5 w-3.5 rounded-full border-2" style={{ borderColor: dotColor }} />
      </span>
    )
  }

  // advanced: small braces glyph
  if (kind === 'advanced') {
    return (
      <span
        aria-hidden
        className={cn(
          'inline-flex h-5 w-5 items-center justify-center rounded-full font-mono text-[10px] font-semibold',
          ringClass,
          className
        )}
        style={{ color: dotColor }}
      >
        {'{}'}
      </span>
    )
  }

  // once: single solid dot
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex h-5 w-5 items-center justify-center rounded-full',
        ringClass,
        className
      )}
    >
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: dotColor }} />
    </span>
  )
}
