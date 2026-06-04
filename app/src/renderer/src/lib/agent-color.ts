// Deterministic per-agent color used by the Schedules surfaces.
// The same agent.id always produces the same hue, so the strip chip, group
// header dot, and row cadence dot stay visually tied across the screen.

export type AgentColorTheme = 'light' | 'dark'

export interface AgentColor {
  // Solid color for the small dot / chip glyph.
  dot: string
  // Subtle background tint used for hover/pulse states.
  soft: string
  // Outline / ring color for focus or pulse.
  ring: string
  // Numeric hue for advanced cases (gradients, etc.).
  hue: number
}

function hashHue(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0
  }
  return h % 360
}

export function agentColor(agentId: string, theme: AgentColorTheme = 'light'): AgentColor {
  const hue = hashHue(agentId || 'default')
  const sat = 55
  const light = theme === 'dark' ? 65 : 50
  return {
    hue,
    dot: `hsl(${hue} ${sat}% ${light}%)`,
    soft: `hsl(${hue} ${sat}% ${light}% / 0.12)`,
    ring: `hsl(${hue} ${sat}% ${light}% / 0.45)`
  }
}

// Helper for callers that need an inline style object for `style={...}`.
export function agentColorStyle(
  agentId: string,
  theme: AgentColorTheme = 'light'
): React.CSSProperties {
  const c = agentColor(agentId, theme)
  return { backgroundColor: c.dot }
}
