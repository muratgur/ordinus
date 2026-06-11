import { getColorClassName, getMascotUrl, parseAgentAvatar } from './mascots'
import { cn } from '../lib/utils'

type AgentAvatarProps = {
  avatar: string
  size?: number
  /** Used for the initial shown at tiny sizes where the mascot is unreadable. */
  name?: string
  className?: string
}

// Below this size the mascot face is an unreadable smudge; render a colored
// chip with the agent's initial instead (color alone collides with only six
// hues in the palette).
const MASCOT_MIN_SIZE = 24
// Slack-style squircle: corner radius proportional to the rendered size.
const CORNER_RADIUS_RATIO = 0.24

/**
 * Renders an agent's avatar from its packed `"<variantId>|<colorId>"`
 * representation (ADR-038): the transparent mascot render on the user-chosen
 * background color, in a squircle. Legacy values (color|symbol, emoji, empty)
 * degrade to the Base variant via parseAgentAvatar.
 */
export function AgentAvatar({
  avatar,
  size = 40,
  name,
  className
}: AgentAvatarProps): React.JSX.Element {
  const { variantId, colorId } = parseAgentAvatar(avatar)
  const mascotUrl = getMascotUrl(variantId)
  const style = {
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: `${Math.round(size * CORNER_RADIUS_RATIO)}px`
  }
  const colorClass = getColorClassName(colorId) ?? 'bg-muted'

  if (size < MASCOT_MIN_SIZE || !mascotUrl) {
    const initial = name?.trim().charAt(0).toUpperCase() ?? ''
    return (
      <span
        className={cn(
          'inline-flex select-none items-center justify-center font-semibold text-white',
          colorClass,
          className
        )}
        style={{ ...style, fontSize: `${Math.round(size * 0.55)}px` }}
      >
        {initial}
      </span>
    )
  }

  return (
    <span className={cn('inline-flex overflow-hidden', colorClass, className)} style={style}>
      <img src={mascotUrl} alt="" draggable={false} className="size-full object-cover" />
    </span>
  )
}
