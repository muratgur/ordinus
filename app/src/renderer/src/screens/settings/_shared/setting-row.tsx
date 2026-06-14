// ADR-045 A1 — Settings layout primitive.
//
// SettingBlock is the full-width form: label + description on top, a wide
// control (textarea, multi-step flow, path display, card list) below. Its
// companion split-row primitive (label/description left, compact control right)
// will land alongside the per-section file extraction that needs it; until a
// consumer exists it isn't shipped, to avoid dead code.

import { cn } from '@renderer/lib/utils'

function Label({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <span className="text-sm font-medium leading-tight text-foreground">{children}</span>
}

function Description({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <p className="text-sm leading-6 text-muted-foreground">{children}</p>
}

export function SettingBlock({
  label,
  description,
  children,
  className
}: {
  label: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <div className={cn('grid gap-2', className)}>
      <div className="grid gap-1">
        <Label>{label}</Label>
        {description ? <Description>{description}</Description> : null}
      </div>
      {children}
    </div>
  )
}
