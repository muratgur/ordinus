import { AGENT_COLORS, AGENT_SYMBOLS } from './agent-palette'
import { cn } from '../lib/utils'

type AgentAvatarPickerProps = {
  color: string
  symbol: string
  onColorChange: (id: string) => void
  onSymbolChange: (id: string) => void
  className?: string
}

/**
 * Shared color + symbol picker for agent avatars. Used by the creation flow
 * (ShapeStage) and the agent home identity header (avatar edit). The packed
 * `"<colorId>|<symbolId>"` value is assembled by the caller. See agent-palette.
 */
export function AgentAvatarPicker({
  color,
  symbol,
  onColorChange,
  onSymbolChange,
  className
}: AgentAvatarPickerProps): React.JSX.Element {
  return (
    <div className={cn('grid gap-4', className)}>
      <div className="flex justify-center gap-2">
        {AGENT_COLORS.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-label={option.id}
            onClick={() => onColorChange(option.id)}
            className={cn(
              'size-6 rounded-full transition-all duration-200',
              option.className,
              color === option.id
                ? 'scale-110 ring-2 ring-foreground ring-offset-2 ring-offset-background'
                : 'opacity-75 hover:opacity-100'
            )}
          />
        ))}
      </div>

      <div className="grid grid-cols-8 gap-1.5">
        {AGENT_SYMBOLS.map(({ id, Icon }) => (
          <button
            key={id}
            type="button"
            aria-label={id}
            onClick={() => onSymbolChange(id)}
            className={cn(
              'flex aspect-square items-center justify-center rounded-full transition-all duration-200',
              symbol === id
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="size-4" strokeWidth={1.75} />
          </button>
        ))}
      </div>
    </div>
  )
}
