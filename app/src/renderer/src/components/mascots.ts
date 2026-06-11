/**
 * Single source of truth for agent mascot avatars (ADR-038).
 *
 * Every agent is a variant of the same mascot character, differentiated by
 * outfit (the numbered renders) and a user-chosen background color. Variants
 * are discovered from the built assets at bundle time — adding a new
 * `<n>.webp` (via `npm run mascots:build`) makes it appear in the picker with
 * no code changes. Variant ids are never reused for a different character.
 *
 * Agent avatars are persisted as `"<variantId>|<colorId>"` in the existing
 * `avatar` column. Legacy values (`"<color>|<symbol>"` from the retired
 * symbol system, plain emoji, or empty) degrade to the Base variant, keeping
 * the legacy color as background where possible.
 */

const mascotModules = import.meta.glob('../assets/mascots/*.webp', {
  eager: true,
  query: '?url',
  import: 'default'
}) as Record<string, string>

export const MASCOT_VARIANTS: ReadonlyArray<{ id: number; url: string }> = Object.entries(
  mascotModules
)
  .map(([path, url]) => ({ id: Number(path.match(/(\d+)\.webp$/)?.[1] ?? Number.NaN), url }))
  .filter((variant) => Number.isFinite(variant.id))
  .sort((a, b) => a.id - b.id)

const AVATAR_DELIMITER = '|'

export const AGENT_COLORS = [
  { id: 'slate', className: 'bg-slate-500' },
  { id: 'rose', className: 'bg-rose-500' },
  { id: 'amber', className: 'bg-amber-500' },
  { id: 'emerald', className: 'bg-emerald-500' },
  { id: 'sky', className: 'bg-sky-500' },
  { id: 'violet', className: 'bg-violet-500' }
] as const

// Colors retired when the palette shrank to six; old avatars map to the
// nearest surviving hue instead of falling back to neutral.
const LEGACY_COLOR_MAP: Record<string, string> = {
  indigo: 'violet',
  fuchsia: 'rose'
}

const DEFAULT_COLOR_ID = 'slate'
const BASE_VARIANT_ID = 0

export function getColorClassName(colorId: string): string | undefined {
  return AGENT_COLORS.find((entry) => entry.id === colorId)?.className
}

export function getMascotUrl(variantId: number): string | undefined {
  return MASCOT_VARIANTS.find((variant) => variant.id === variantId)?.url
}

export function packAgentAvatar(variantId: number, colorId: string): string {
  return `${variantId}${AVATAR_DELIMITER}${colorId}`
}

export type ParsedAgentAvatar = { variantId: number; colorId: string }

export function parseAgentAvatar(raw: string): ParsedAgentAvatar {
  const [left, right] = raw.split(AVATAR_DELIMITER, 2)

  if (left && /^\d+$/.test(left)) {
    const variantId = Number(left)
    return {
      // A retired variant id (no matching asset) degrades to Base.
      variantId: getMascotUrl(variantId) !== undefined ? variantId : BASE_VARIANT_ID,
      colorId: normalizeColorId(right)
    }
  }

  // Legacy "<color>|<symbol>" — keep the color, drop the symbol. Legacy
  // emoji / empty values land here too and get the defaults.
  return { variantId: BASE_VARIANT_ID, colorId: normalizeColorId(left) }
}

function normalizeColorId(candidate: string | undefined): string {
  if (!candidate) return DEFAULT_COLOR_ID
  const mapped = LEGACY_COLOR_MAP[candidate] ?? candidate
  return getColorClassName(mapped) ? mapped : DEFAULT_COLOR_ID
}

export function randomAvatarParts(): ParsedAgentAvatar {
  const variant = MASCOT_VARIANTS[Math.floor(Math.random() * MASCOT_VARIANTS.length)]
  const color = AGENT_COLORS[Math.floor(Math.random() * AGENT_COLORS.length)]
  return { variantId: variant?.id ?? BASE_VARIANT_ID, colorId: color?.id ?? DEFAULT_COLOR_ID }
}

export function randomAgentAvatar(): string {
  const parts = randomAvatarParts()
  return packAgentAvatar(parts.variantId, parts.colorId)
}
