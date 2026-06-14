// ADR-045 B5 — shared brand-logo lookup for connector and provider icon tiles.
//
// Drop an official SVG at `./logos/<id>.svg` (id = connector id or provider id,
// e.g. notion.svg, codex.svg) and it is picked up automatically; ids without a
// file fall back to a brand-colored monogram in BrandIcon. Resolved by matching
// the path's bare filename ("notion.svg").

const LOGO_URLS = import.meta.glob('./logos/*.svg', {
  eager: true,
  query: '?url',
  import: 'default'
}) as Record<string, string>

export function logoUrl(id: string): string | undefined {
  const match = Object.entries(LOGO_URLS).find(([path]) => path.endsWith(`/${id}.svg`))
  return match?.[1]
}
