// ADR-029 M5 — Renderer-side bridge for Ordinus action events.
//
// Lives inside <HashRouter> so it can use useNavigate(). Subscribes once at
// mount to `window.ordinus.ordinus.onActionEvent`, routes each kind:
//
//   workboard_plan_ready → hand the plan to the parent (App) so it lands in
//                          workboardDraftReview state, then navigate to
//                          /workboard so the existing review UI surfaces it.
//   schedule_created     → toast.
//   workflow_created     → toast.
//
// No UI of its own; this is a side-effect handler component.

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { WorkboardDraftPlanSchema, type OrdinusActionEvent } from '@shared/contracts'
import { appRoutePaths } from './routes'
import { notify } from '@renderer/lib/notifications'
import type { WorkboardDraftReviewState } from '@renderer/screens/workboard-draft-review'

export type OrdinusActionBridgeProps = {
  onWorkboardPlanReady: (state: WorkboardDraftReviewState) => void
  // ADR-044: the plan was started elsewhere (Telegram). Close the open review
  // surface for the matching request.
  onWorkboardPlanDismissed: (request: string) => void
}

export function OrdinusActionBridge({
  onWorkboardPlanReady,
  onWorkboardPlanDismissed
}: OrdinusActionBridgeProps): null {
  const navigate = useNavigate()

  useEffect(() => {
    const off = window.ordinus.ordinus.onActionEvent((event: OrdinusActionEvent) => {
      switch (event.kind) {
        case 'workboard_plan_dismissed': {
          onWorkboardPlanDismissed(event.request)
          break
        }
        case 'workboard_plan_ready': {
          // Re-parse the plan (it's typed as unknown across the IPC boundary
          // to dodge a forward-reference issue; see contracts.ts header).
          const plan = WorkboardDraftPlanSchema.parse(event.plan)
          onWorkboardPlanReady({
            plan,
            context: {
              // No specific destination/agents — Ordinus drafted a fresh
              // request, so the review UI treats it as a plan-mode draft.
              target: {
                contextReferences: [],
                contextLabels: [],
                requestedAgentIds: []
              },
              request: event.request,
              runVersion: null,
              persistedId: null
            },
            selectedItemId: plan.items[0]?.tempId ?? ''
          })
          notify.info({
            id: 'ordinus-workboard-plan',
            title: 'Plan ready for review',
            description: 'Ordinus opened the Workboard plan-review surface.'
          })
          navigate(appRoutePaths.workboard)
          break
        }
        case 'schedule_created': {
          notify.success({
            title: 'Schedule created',
            description: event.scheduleName
          })
          break
        }
        case 'workflow_created': {
          notify.success({
            title: 'Workflow created',
            description: event.workflowName
          })
          break
        }
      }
    })
    return off
  }, [navigate, onWorkboardPlanReady, onWorkboardPlanDismissed])

  return null
}
