import type { Agent } from '@shared/contracts'

// Shared styling + helpers for Work Item task fields, used by the planner's
// PlanReviewDialog and the visual workflow designer (ADR-025). Kept in a
// non-component module so the component file can stay fast-refresh friendly.

export const draftFieldClassName = 'grid min-w-0 gap-1.5 text-xs font-medium text-foreground'
export const draftInputClassName =
  'h-10 min-w-0 rounded-md border border-input bg-card px-3 text-sm font-normal text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background'
export const draftTextareaClassName =
  'ordinus-scrollbar min-w-0 resize-none rounded-md border border-input bg-card px-3 py-2 text-sm font-normal leading-6 text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background'

export const draftPriorityOptions = [
  { label: 'Low', value: -1 },
  { label: 'Normal', value: 0 },
  { label: 'High', value: 1 }
] as const

export interface DraftItemFieldValues {
  title: string
  assignedAgentId: string
  instruction: string
  expectedOutput: string
  priority: number
}

export function sortAgentsByUsage(agents: Agent[]): Agent[] {
  return [...agents].sort((left, right) => {
    const leftUsed = left.lastUsedAt ? Date.parse(left.lastUsedAt) : 0
    const rightUsed = right.lastUsedAt ? Date.parse(right.lastUsedAt) : 0
    if (leftUsed !== rightUsed) {
      return rightUsed - leftUsed
    }
    if (left.useCount !== right.useCount) {
      return right.useCount - left.useCount
    }
    return left.name.localeCompare(right.name)
  })
}
