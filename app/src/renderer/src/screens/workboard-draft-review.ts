import type { WorkboardDraftPlan } from '@shared/contracts'

export type WorkComposerTarget =
  | { mode: 'new' }
  | {
      mode: 'request'
      requestId: string
      requestTitle: string
    }
  | {
      mode: 'item'
      requestId: string
      requestTitle: string
      anchorRunId: string
      anchorRunTitle: string
    }

export type WorkboardDraftPlanContext = {
  target: WorkComposerTarget
  request: string
}

export type WorkboardDraftReviewState = {
  plan: WorkboardDraftPlan | null
  context: WorkboardDraftPlanContext | null
  selectedItemId: string
}

export const emptyWorkboardDraftReviewState: WorkboardDraftReviewState = {
  plan: null,
  context: null,
  selectedItemId: ''
}
