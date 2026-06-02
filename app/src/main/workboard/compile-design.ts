import {
  validateWorkboardDraftPlanDependencies,
  WorkboardDraftPlanSchema,
  type WorkboardDraftItem,
  type WorkboardDraftPlan,
  type WorkflowDesign
} from '@shared/contracts'

export interface CompiledWorkflowDesign {
  plan: WorkboardDraftPlan
  originalRequest: string
}

/**
 * Compiles a saved workflow design into a WorkboardDraftPlan so it can run
 * through the existing Workboard start path unchanged (ADR-025).
 *
 * Trigger-agnostic and pure: any caller (manual run, future cron/event) reaches
 * the engine through this single function. Canvas positions are stripped here;
 * the design's `description` becomes the request's `originalRequest`.
 *
 * Throws a user-facing Error if the design fails run-gating (empty/over-cap node
 * set, unfilled node fields, missing agent assignment, dangling edges, or a
 * dependency cycle). These mirror the renderer's run-gating so a design that the
 * UI would block can never reach the engine.
 */
export function compileWorkflowDesign(design: WorkflowDesign): CompiledWorkflowDesign {
  const { nodes, edges } = design.canvas

  if (nodes.length === 0) {
    throw new Error('Add at least one Work Item before running this workflow.')
  }
  if (nodes.length > 16) {
    throw new Error('A workflow can have at most 16 Work Items.')
  }

  // Stable design node id -> sequential 1-based tempId expected by the planner
  // contract (`item-1`, `item-2`, ...).
  const tempIdByNodeId = new Map<string, string>()
  nodes.forEach((node, index) => {
    tempIdByNodeId.set(node.id, `item-${index + 1}`)
  })

  // Edge source -> target means the target node depends on the source node.
  const dependsOnByNodeId = new Map<string, Set<string>>()
  nodes.forEach((node) => dependsOnByNodeId.set(node.id, new Set()))
  edges.forEach((edge) => {
    if (!tempIdByNodeId.has(edge.source) || !tempIdByNodeId.has(edge.target)) {
      throw new Error('A workflow connection points to a missing Work Item.')
    }
    if (edge.source === edge.target) {
      throw new Error('A Work Item cannot depend on itself.')
    }
    dependsOnByNodeId.get(edge.target)?.add(edge.source)
  })

  const items: WorkboardDraftItem[] = nodes.map((node) => {
    const tempId = tempIdByNodeId.get(node.id)
    if (!tempId) {
      throw new Error('Work Item could not be prepared.')
    }

    const title = node.title.trim()
    const instruction = node.instruction.trim()
    const expectedOutput = node.expectedOutput.trim()
    const assignedAgentId = node.assignedAgentId.trim()

    if (!title) {
      throw new Error('Every Work Item needs a name before running.')
    }
    if (!instruction) {
      throw new Error(`Work Item "${title}" needs an instruction before running.`)
    }
    if (!expectedOutput) {
      throw new Error(`Work Item "${title}" needs an expected output before running.`)
    }
    if (!assignedAgentId) {
      throw new Error(`Work Item "${title}" needs an assigned agent before running.`)
    }

    const dependsOnTempIds = Array.from(dependsOnByNodeId.get(node.id) ?? [])
      .map((dependencyNodeId) => tempIdByNodeId.get(dependencyNodeId))
      .filter((value): value is string => Boolean(value))

    return {
      tempId,
      title,
      instruction,
      expectedOutput,
      assignedAgentId,
      dependsOnTempIds,
      priority: node.priority
    }
  })

  // Reuses the shared planner validator (duplicate ids, missing/self deps,
  // cycles). Compiling fails fast and clearly rather than deferring to the DB.
  validateWorkboardDraftPlanDependencies(items)

  const plan = WorkboardDraftPlanSchema.parse({
    title: design.name,
    summary: design.description,
    items
  })

  // Visually-authored workflows have no free-text request. The design's
  // description doubles as the overarching request text fed to agents; fall back
  // to the name when the description is empty.
  const originalRequest = design.description.trim() || design.name.trim()

  return { plan, originalRequest }
}
