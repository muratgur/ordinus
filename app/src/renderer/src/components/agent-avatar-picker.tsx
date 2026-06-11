import { ChevronLeft, ChevronRight } from 'lucide-react'
import { AGENT_COLORS, MASCOT_VARIANTS, packAgentAvatar } from './mascots'
import { AgentAvatar } from './agent-avatar'
import { cn } from '../lib/utils'

type AgentAvatarPickerProps = {
  variantId: number
  colorId: string
  onVariantChange: (id: number) => void
  onColorChange: (id: string) => void
  className?: string
}

/**
 * Mascot picker (ADR-038): one large character at a time with left/right
 * navigation and a dot indicator, color swatches below, live preview of the
 * character on the selected background. Used by the creation flow
 * (ShapeStage) and the agent profile editor.
 */
export function AgentAvatarPicker({
  variantId,
  colorId,
  onVariantChange,
  onColorChange,
  className
}: AgentAvatarPickerProps): React.JSX.Element {
  const index = Math.max(
    0,
    MASCOT_VARIANTS.findIndex((variant) => variant.id === variantId)
  )

  function step(delta: number): void {
    if (MASCOT_VARIANTS.length === 0) return
    const next = (index + delta + MASCOT_VARIANTS.length) % MASCOT_VARIANTS.length
    onVariantChange(MASCOT_VARIANTS[next].id)
  }

  return (
    <div className={cn('grid justify-items-center gap-3', className)}>
      <div className="flex items-center gap-4">
        <CarouselArrow direction="previous" onClick={() => step(-1)}>
          <ChevronLeft className="size-4" />
        </CarouselArrow>
        <AgentAvatar avatar={packAgentAvatar(variantId, colorId)} size={96} />
        <CarouselArrow direction="next" onClick={() => step(1)}>
          <ChevronRight className="size-4" />
        </CarouselArrow>
      </div>

      <div className="flex items-center gap-1">
        {MASCOT_VARIANTS.map((variant, dotIndex) => (
          <button
            key={variant.id}
            type="button"
            aria-label={`Character ${dotIndex + 1}`}
            onClick={() => onVariantChange(variant.id)}
            className={cn(
              'size-1.5 rounded-full transition-colors',
              dotIndex === index ? 'bg-foreground' : 'bg-muted hover:bg-muted-foreground/40'
            )}
          />
        ))}
      </div>

      <div className="flex justify-center gap-2 pt-1">
        {AGENT_COLORS.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-label={option.id}
            onClick={() => onColorChange(option.id)}
            className={cn(
              'size-6 rounded-full transition-all duration-200',
              option.className,
              colorId === option.id
                ? 'scale-110 ring-2 ring-foreground ring-offset-2 ring-offset-background'
                : 'opacity-75 hover:opacity-100'
            )}
          />
        ))}
      </div>
    </div>
  )
}

function CarouselArrow({
  direction,
  onClick,
  children
}: {
  direction: 'previous' | 'next'
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={direction === 'previous' ? 'Previous character' : 'Next character'}
      onClick={onClick}
      className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {children}
    </button>
  )
}
