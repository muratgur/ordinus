import type { WorkboardContextReferenceInput, WorkboardDraftPlan } from '@shared/contracts'

export type WorkComposerTarget = {
  destinationRequestId?: string
  destinationRequestTitle?: string
  contextReferences: WorkboardContextReferenceInput[]
  contextLabels: string[]
  requestedAgentIds: string[]
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
