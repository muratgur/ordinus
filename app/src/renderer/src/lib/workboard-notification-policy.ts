import type { WorkboardData, WorkboardDraftPlan } from '@shared/contracts'
import { appRoutePaths } from '@renderer/app/routes'
import { notificationIds } from './notifications'

type NotifyKind = 'success' | 'attention' | 'error'

export type NotificationPolicyEvent = {
  id: string
  kind: NotifyKind
  title: string
  description: string
  actionLabel: string
  dedupeKey: string
  duration?: number
}

export type WorkboardNotificationPolicyInput = {
  previousData: WorkboardData | null
  nextData: WorkboardData
  currentPath: string
  seen: Set<string>
}

export function getWorkboardPlanSignature(plan: WorkboardDraftPlan): string {
  return [
    plan.title,
    plan.items.length,
    plan.items.map((item) => `${item.tempId}:${item.title}:${item.assignedAgentId}`).join('|')
  ].join(':')
}

export function getWorkboardPlanReadyEvent(plan: WorkboardDraftPlan): NotificationPolicyEvent {
  return {
    id: notificationIds.workboardPlanReady,
    kind: 'success',
    title: 'Plan ready',
    description: 'Review assignments and dependencies before agents start.',
    actionLabel: 'Review plan',
    dedupeKey: `workboard:plan-ready:${getWorkboardPlanSignature(plan)}`,
    duration: 8000
  }
}

export function evaluateWorkboardNotifications({
  previousData,
  nextData,
  currentPath,
  seen
}: WorkboardNotificationPolicyInput): NotificationPolicyEvent[] {
  const events: NotificationPolicyEvent[] = []
  const workboardActive = currentPath === appRoutePaths.workboard

  for (const inputRequest of nextData.inputRequests) {
    if (inputRequest.status !== 'pending') continue

    const dedupeKey = `workboard:input-needed:${inputRequest.id}`
    if (shouldSkipNotification(dedupeKey, workboardActive, seen)) continue

    const run = nextData.runs.find((item) => item.id === inputRequest.runId)
    events.push({
      id: `${notificationIds.workboardInputNeeded}:${inputRequest.id}`,
      kind: 'attention',
      title: 'Input needed',
      description: `${run?.title ?? 'A Work Item'} is waiting for your answer.`,
      actionLabel: 'Open Workboard',
      dedupeKey,
      duration: 10000
    })
  }

  if (!previousData) return events

  const previousRequestStatus = new Map(
    previousData.requests.map((request) => [request.id, request.status])
  )

  for (const request of nextData.requests) {
    if (!isTerminalRequest(request.status)) continue

    const previousStatus = previousRequestStatus.get(request.id)
    if (previousStatus && isTerminalRequest(previousStatus)) continue

    const summary = summarizeRequestRuns(nextData, request.id)
    if (!summary?.terminal) continue

    const completed = summary.completedCount === summary.totalCount
    const needsAttention = !completed
    const dedupeKey = needsAttention
      ? `workboard:request-attention:${request.id}`
      : `workboard:request-completed:${request.id}`

    if (shouldSkipNotification(dedupeKey, workboardActive, seen)) continue

    events.push({
      id: needsAttention
        ? `${notificationIds.workboardRequestAttention}:${request.id}`
        : `${notificationIds.workboardRequestCompleted}:${request.id}`,
      kind: needsAttention ? 'attention' : 'success',
      title: needsAttention ? 'Work needs attention' : 'Work completed',
      description: needsAttention
        ? buildAttentionDescription(summary)
        : `${summary.totalCount} Work ${summary.totalCount === 1 ? 'Item' : 'Items'} finished. Review the result in Workboard.`,
      actionLabel: 'Open Workboard',
      dedupeKey,
      duration: needsAttention ? 10000 : 8000
    })
  }

  return events
}

export function seedSeenWorkboardNotifications(data: WorkboardData, seen: Set<string>): void {
  for (const inputRequest of data.inputRequests) {
    if (inputRequest.status === 'pending') {
      seen.add(`workboard:input-needed:${inputRequest.id}`)
    }
  }

  for (const request of data.requests) {
    if (!isTerminalRequest(request.status)) continue
    const summary = summarizeRequestRuns(data, request.id)
    if (!summary?.terminal) continue
    seen.add(
      summary.completedCount !== summary.totalCount
        ? `workboard:request-attention:${request.id}`
        : `workboard:request-completed:${request.id}`
    )
  }
}

type RequestRunSummary = {
  terminal: boolean
  totalCount: number
  completedCount: number
  failedCount: number
  cancelledCount: number
}

function shouldSkipNotification(
  dedupeKey: string,
  surfaceActive: boolean,
  seen: Set<string>
): boolean {
  if (seen.has(dedupeKey)) return true
  if (surfaceActive) {
    seen.add(dedupeKey)
    return true
  }
  return false
}

function summarizeRequestRuns(data: WorkboardData, requestId: string): RequestRunSummary | null {
  const requestRuns = data.runs.filter((run) => run.requestId === requestId)
  if (requestRuns.length === 0) return null

  return {
    terminal: requestRuns.every((run) => isTerminalRun(run.status)),
    totalCount: requestRuns.length,
    completedCount: requestRuns.filter((run) => run.status === 'completed').length,
    failedCount: requestRuns.filter((run) => run.status === 'failed').length,
    cancelledCount: requestRuns.filter((run) => run.status === 'cancelled').length
  }
}

function buildAttentionDescription(summary: RequestRunSummary): string {
  const parts = [`${summary.completedCount} completed`]
  if (summary.failedCount > 0) {
    parts.push(`${summary.failedCount} failed`)
  }
  if (summary.cancelledCount > 0) {
    parts.push(`${summary.cancelledCount} cancelled`)
  }

  return `${parts.join(', ')}. Review the Work Request.`
}

function isTerminalRun(status: WorkboardData['runs'][number]['status']): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}

function isTerminalRequest(status: WorkboardData['requests'][number]['status']): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}
