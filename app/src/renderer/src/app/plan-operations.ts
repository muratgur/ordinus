import { useCallback, useEffect, useState } from 'react'
import type { PendingPlan, PendingPlanTarget, WorkboardDraftPlan } from '@shared/contracts'
import type { WorkComposerTarget } from '../screens/workboard-draft-review'

export type PlanOperationStatus = 'generating' | 'ready' | 'failed'

export type PlanOperation = {
  id: string
  target: WorkComposerTarget
  request: string
  status: PlanOperationStatus
  plan: WorkboardDraftPlan | null
  error: string
  runVersion: string | null
  persistedId: string | null
  createdAt: number
}

export type PlanOperationsController = {
  operations: PlanOperation[]
  startPlanOp: (target: WorkComposerTarget, request: string, runVersion: string | null) => string
  dismissPlanOp: (id: string) => void
  retryPlanOp: (id: string) => void
  removePersisted: (persistedId: string | null) => void
}

function createOperationId(): string {
  return `planop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }
  return 'Plan could not be generated.'
}

function toPendingPlanTarget(target: WorkComposerTarget): PendingPlanTarget {
  return {
    kind: 'request',
    destinationRequestId: target.destinationRequestId,
    contextReferences: target.contextReferences,
    requestedAgentIds: target.requestedAgentIds,
    // ADR-031: preserve the Existing-folder choice across persisted/background plans.
    workingRoot: target.workingRoot
  }
}

function fromPendingPlanTarget(target: PendingPlanTarget): WorkComposerTarget {
  if (target.kind === 'follow_up') {
    return {
      destinationRequestId: target.requestId,
      contextReferences: [],
      contextLabels: [],
      requestedAgentIds: []
    }
  }
  return {
    destinationRequestId: target.destinationRequestId,
    contextReferences: target.contextReferences,
    contextLabels: [],
    requestedAgentIds: target.requestedAgentIds,
    workingRoot: target.workingRoot
  }
}

function hydratedOperation(pendingPlan: PendingPlan): PlanOperation {
  return {
    id: createOperationId(),
    target: fromPendingPlanTarget(pendingPlan.target),
    request: pendingPlan.request,
    status: 'ready',
    plan: pendingPlan.plan,
    error: '',
    runVersion: pendingPlan.targetRunVersion,
    persistedId: pendingPlan.id,
    createdAt: Date.parse(pendingPlan.createdAt) || Date.now()
  }
}

/**
 * App-level controller for background plan generation. Ops are owned here,
 * outside the route tree, so an in-flight generation survives navigating away
 * from the Workboard and lands its result even after the screen unmounts.
 * Ready plans are persisted so they outlive an app restart; in-flight and
 * failed ops are intentionally not persisted.
 */
export function usePlanOperations(): PlanOperationsController {
  const [operations, setOperations] = useState<PlanOperation[]>([])

  useEffect(() => {
    let active = true
    void window.ordinus.workboard
      .listPendingPlans()
      .then((pendingPlans) => {
        if (!active) {
          return
        }
        setOperations((current) => [...pendingPlans.map(hydratedOperation), ...current])
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  const updateOperation = useCallback((id: string, patch: Partial<PlanOperation>): void => {
    setOperations((current) =>
      current.map((operation) => (operation.id === id ? { ...operation, ...patch } : operation))
    )
  }, [])

  const runGeneration = useCallback(
    (id: string, target: WorkComposerTarget, request: string, runVersion: string | null): void => {
      void (async () => {
        let plan: WorkboardDraftPlan
        try {
          plan = await window.ordinus.workboard.generateRequestPlan({
            request,
            destinationRequestId: target.destinationRequestId,
            contextReferences: target.contextReferences,
            requestedAgentIds: target.requestedAgentIds
          })
        } catch (error) {
          updateOperation(id, { status: 'failed', error: getErrorMessage(error) })
          return
        }

        // Persist BEFORE marking ready so the op carries its persistedId at the
        // moment a watcher routes it into review. Otherwise the routed context
        // captures persistedId=null and a later discard cannot delete the row,
        // leaving it to resurface on the next launch.
        try {
          const pendingPlan = await window.ordinus.workboard.createPendingPlan({
            kind: 'request',
            request,
            target: toPendingPlanTarget(target),
            plan,
            targetRunVersion: runVersion
          })
          updateOperation(id, {
            status: 'ready',
            plan,
            error: '',
            persistedId: pendingPlan.id
          })
        } catch {
          updateOperation(id, { status: 'ready', plan, error: '' })
        }
      })()
    },
    [updateOperation]
  )

  const startPlanOp = useCallback(
    (target: WorkComposerTarget, request: string, runVersion: string | null): string => {
      const id = createOperationId()
      setOperations((current) => [
        ...current,
        {
          id,
          target,
          request,
          status: 'generating',
          plan: null,
          error: '',
          runVersion,
          persistedId: null,
          createdAt: Date.now()
        }
      ])
      runGeneration(id, target, request, runVersion)
      return id
    },
    [runGeneration]
  )

  const dismissPlanOp = useCallback((id: string): void => {
    setOperations((current) => current.filter((operation) => operation.id !== id))
  }, [])

  const retryPlanOp = useCallback(
    (id: string): void => {
      setOperations((current) => {
        const existing = current.find((operation) => operation.id === id)
        if (!existing) {
          return current
        }
        runGeneration(id, existing.target, existing.request, existing.runVersion)
        return current.map((operation) =>
          operation.id === id
            ? { ...operation, status: 'generating', error: '', plan: null }
            : operation
        )
      })
    },
    [runGeneration]
  )

  const removePersisted = useCallback((persistedId: string | null): void => {
    if (!persistedId) {
      return
    }
    void window.ordinus.workboard.deletePendingPlan(persistedId).catch(() => {})
    setOperations((current) => current.filter((operation) => operation.persistedId !== persistedId))
  }, [])

  return { operations, startPlanOp, dismissPlanOp, retryPlanOp, removePersisted }
}
