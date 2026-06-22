// ADR-045 B5 — provider brand icon (Codex / Claude). Thin wrapper over
// BrandIcon: supplies the per-provider color + monogram. Drop an official SVG at
// `./logos/<providerId>.svg` to replace the monogram.

import { BrandIcon } from './brand-icon'

type Brand = { color: string; mono: string }

const BRAND: Record<string, Brand> = {
  codex: { color: '#0F0F0F', mono: '›_' },
  claude: { color: '#D97757', mono: 'C' }
}

export function ProviderIcon({
  providerId,
  label,
  className
}: {
  providerId: string
  label: string
  className?: string
}): React.JSX.Element {
  const brand = BRAND[providerId] ?? {
    color: '#64748B',
    mono: (label.trim()[0] ?? '?').toUpperCase()
  }
  return <BrandIcon id={providerId} color={brand.color} mono={brand.mono} className={className} />
}
