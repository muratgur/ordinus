// ADR-045 B5 — connector brand icon. Thin wrapper over BrandIcon: supplies the
// per-connector color + monogram; the tile markup and logo lookup live in
// BrandIcon. Drop an official SVG at `./logos/<connectorId>.svg` to replace the
// monogram (see ./logos/README.md for the filename list).

import { BrandIcon } from './brand-icon'

type Brand = { color: string; mono: string }

const BRAND: Record<string, Brand> = {
  datadog: { color: '#632CA6', mono: 'D' },
  linear: { color: '#5E6AD2', mono: 'L' },
  notion: { color: '#0F0F0F', mono: 'N' },
  canva: { color: '#00C4CC', mono: 'C' },
  linkedin: { color: '#0A66C2', mono: 'in' },
  whatsapp: { color: '#25D366', mono: 'W' },
  atlassian: { color: '#0052CC', mono: 'A' },
  google: { color: '#4285F4', mono: 'G' },
  'dev-fixture': { color: '#64748B', mono: '{ }' }
}

export function ConnectorIcon({
  connectorId,
  label,
  className
}: {
  connectorId: string
  label: string
  className?: string
}): React.JSX.Element {
  const brand = BRAND[connectorId] ?? {
    color: '#64748B',
    mono: (label.trim()[0] ?? '?').toUpperCase()
  }
  return <BrandIcon id={connectorId} color={brand.color} mono={brand.mono} className={className} />
}
