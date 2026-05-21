import {
  Anchor,
  Atom,
  Compass,
  Crown,
  Feather,
  Flame,
  Gem,
  Heart,
  Leaf,
  Microscope,
  Moon,
  Puzzle,
  Sparkles,
  Sun,
  Target,
  Waves,
  type LucideIcon
} from 'lucide-react'

/**
 * Single source of truth for the agent avatar palette. Both the creation
 * flow (which renders pickers) and the AgentAvatar component (which renders
 * a saved avatar) read from these tables. Adding a color or symbol here
 * propagates to both without further edits.
 *
 * Agent avatars are persisted as `"<colorId>|<symbolId>"`.
 */

export const AVATAR_DELIMITER = '|'

export const AGENT_COLORS = [
  { id: 'slate', className: 'bg-slate-500' },
  { id: 'rose', className: 'bg-rose-500' },
  { id: 'amber', className: 'bg-amber-500' },
  { id: 'emerald', className: 'bg-emerald-500' },
  { id: 'sky', className: 'bg-sky-500' },
  { id: 'indigo', className: 'bg-indigo-500' },
  { id: 'violet', className: 'bg-violet-500' },
  { id: 'fuchsia', className: 'bg-fuchsia-500' }
] as const

export const AGENT_SYMBOLS: ReadonlyArray<{ id: string; Icon: LucideIcon }> = [
  { id: 'Sparkles', Icon: Sparkles },
  { id: 'Compass', Icon: Compass },
  { id: 'Microscope', Icon: Microscope },
  { id: 'Target', Icon: Target },
  { id: 'Puzzle', Icon: Puzzle },
  { id: 'Leaf', Icon: Leaf },
  { id: 'Anchor', Icon: Anchor },
  { id: 'Flame', Icon: Flame },
  { id: 'Atom', Icon: Atom },
  { id: 'Crown', Icon: Crown },
  { id: 'Feather', Icon: Feather },
  { id: 'Gem', Icon: Gem },
  { id: 'Heart', Icon: Heart },
  { id: 'Moon', Icon: Moon },
  { id: 'Sun', Icon: Sun },
  { id: 'Waves', Icon: Waves }
]

export function getColorClassName(colorId: string): string | undefined {
  return AGENT_COLORS.find((entry) => entry.id === colorId)?.className
}

export function getSymbolIcon(symbolId: string): LucideIcon | undefined {
  return AGENT_SYMBOLS.find((entry) => entry.id === symbolId)?.Icon
}
