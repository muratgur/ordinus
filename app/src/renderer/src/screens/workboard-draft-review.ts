import type { WorkboardContextReferenceInput, WorkboardDraftPlan } from '@shared/contracts'

export type WorkComposerTarget = {
  destinationRequestId?: string
  destinationRequestTitle?: string
  contextReferences: WorkboardContextReferenceInput[]
  contextLabels: string[]
  requestedAgentIds: string[]
  // ADR-031: explicit Existing-folder choice for a brand-new Work Request.
  // Undefined for continuations (folder inherited) and for New folder (allocated).
  workingRoot?: string
}

export type WorkboardDraftPlanContext = {
  target: WorkComposerTarget
  request: string
  runVersion: string | null
  persistedId: string | null
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
