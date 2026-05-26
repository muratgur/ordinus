import type { AgentSchedule } from '@shared/contracts'

export function disableReasonLabel(schedule: AgentSchedule): string | null {
  if (schedule.enabled) return null
  switch (schedule.disableReason) {
    case 'failures':
      return `Auto-disabled after ${schedule.consecutiveFailures} failed fires`
    case 'wr_archived':
      return 'Linked Work Request was archived'
    case 'completed':
      return 'Completed'
    case 'manual':
    case null:
    default:
      return 'Disabled'
  }
}
