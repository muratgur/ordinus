import { AVATAR_DELIMITER, getColorClassName, renderSymbolIcon } from './agent-palette'
import { cn } from '../lib/utils'

type AgentAvatarProps = {
  avatar: string
  size?: number
  className?: string
}

/**
 * Renders an agent's avatar from its packed `color|symbol` representation.
 *
 * Falls back gracefully when the string is empty, malformed, or contains
 * a legacy emoji value: in those cases the emoji is rendered as-is in a
 * muted circle so old agents still display correctly.
 */
export function AgentAvatar({ avatar, size = 40, className }: AgentAvatarProps): React.JSX.Element {
  const parsed = parseAvatar(avatar)
  const dimension = `${size}px`
  const iconSize = Math.round(size * 0.45)

  if (parsed.kind === 'composed') {
    return (
      <span
        className={cn(
          'inline-flex items-center justify-center rounded-full text-white',
          getColorClassName(parsed.color) ?? 'bg-muted',
          className
        )}
        style={{ width: dimension, height: dimension }}
      >
        {renderSymbolIcon(parsed.symbol, {
          style: { width: iconSize, height: iconSize },
          strokeWidth: 1.75
        })}
      </span>
    )
  }

  if (parsed.kind === 'legacy-emoji') {
    return (
      <span
        className={cn('inline-flex items-center justify-center rounded-full bg-muted', className)}
        style={{ width: dimension, height: dimension, fontSize: `${iconSize + 4}px` }}
      >
        {parsed.emoji}
      </span>
    )
  }

  return (
    <span
      className={cn('inline-block rounded-full bg-muted', className)}
      style={{ width: dimension, height: dimension }}
    />
  )
}

type ParsedAvatar =
  | { kind: 'composed'; color: string; symbol: string }
  | { kind: 'legacy-emoji'; emoji: string }
  | { kind: 'empty' }

function parseAvatar(raw: string): ParsedAvatar {
  if (!raw) return { kind: 'empty' }
  if (raw.includes(AVATAR_DELIMITER)) {
    const [color, symbol] = raw.split(AVATAR_DELIMITER, 2)
    if (color && symbol) {
      return { kind: 'composed', color, symbol }
    }
  }
  return { kind: 'legacy-emoji', emoji: raw }
}
