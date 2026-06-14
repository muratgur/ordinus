// ADR-045 B5 — shared brand icon tile for connectors and providers.
//
// Renders an official logo when one exists at `./logos/<id>.svg`, otherwise a
// brand-colored monogram so nothing is a blank box. ConnectorIcon and
// ProviderIcon are thin wrappers that supply the per-id color + monogram; this
// is the single place the tile markup lives.

import { cn } from '@renderer/lib/utils'
import { logoUrl } from './logos'

export function BrandIcon({
  id,
  color,
  mono,
  className
}: {
  id: string
  color: string
  mono: string
  className?: string
}): React.JSX.Element {
  const url = logoUrl(id)
  if (url) {
    return (
      <div
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-lg bg-white p-1.5 ring-1 ring-black/5',
          className
        )}
      >
        <img src={url} alt="" className="size-full object-contain" />
      </div>
    )
  }
  return (
    <div
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-white',
        className
      )}
      style={{ backgroundColor: color }}
      aria-hidden="true"
    >
      {mono}
    </div>
  )
}
