import { MarkerType, type Edge, type Node } from '@xyflow/react'
import type { Agent, WorkflowCanvas } from '@shared/contracts'

// Canvas types + pure transforms shared between the Workflows screen and its
// canvas view components. Keeping these JSX-free keeps the view module
// fast-refresh friendly.

export interface TaskFields {
  title: string
  instruction: string
  expectedOutput: string
  assignedAgentId: string
  priority: number
}

export interface TaskNodeData extends TaskFields, Record<string, unknown> {
  agentName: string
  invalid: boolean
}

export type TaskNode = Node<TaskNodeData, 'task'>
export type TaskEdge = Edge

export function nodeInvalidReason(data: TaskNodeData, agentExists: boolean): string | null {
  if (!data.title.trim()) return 'Give this step a name'
  if (!data.instruction.trim()) return 'Tell the teammate what to do'
  if (!data.expectedOutput.trim()) return 'Describe what they should hand back'
  if (!data.assignedAgentId.trim()) return 'Pick a teammate for this step'
  if (!agentExists) return 'This teammate is no longer around'
  return null
}

/** True if adding source -> target would create a cycle in the dependency DAG. */
export function wouldCreateCycle(edges: TaskEdge[], source: string, target: string): boolean {
  const adjacency = new Map<string, string[]>()
  edges.forEach((edge) => {
    const list = adjacency.get(edge.source) ?? []
    list.push(edge.target)
    adjacency.set(edge.source, list)
  })

  const stack = [target]
  const seen = new Set<string>()
  while (stack.length > 0) {
    const current = stack.pop() as string
    if (current === source) return true
    if (seen.has(current)) continue
    seen.add(current)
    for (const next of adjacency.get(current) ?? []) {
      stack.push(next)
    }
  }
  return false
}

export function decorateNodeData(base: TaskFields, agentsById: Map<string, Agent>): TaskNodeData {
  const agent = agentsById.get(base.assignedAgentId)
  const data: TaskNodeData = { ...base, agentName: agent?.name ?? '', invalid: false }
  data.invalid = nodeInvalidReason(data, Boolean(agent)) !== null
  return data
}

export function toReactFlowNodes(
  canvas: WorkflowCanvas,
  agentsById: Map<string, Agent>
): TaskNode[] {
  return canvas.nodes.map((node) => ({
    id: node.id,
    type: 'task',
    position: node.position,
    data: decorateNodeData(
      {
        title: node.title,
        instruction: node.instruction,
        expectedOutput: node.expectedOutput,
        assignedAgentId: node.assignedAgentId,
        priority: node.priority
      },
      agentsById
    )
  }))
}

export function toReactFlowEdges(canvas: WorkflowCanvas): TaskEdge[] {
  return canvas.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: 'deletable',
    markerEnd: { type: MarkerType.ArrowClosed }
  }))
}

export function serializeCanvas(nodes: TaskNode[], edges: TaskEdge[]): WorkflowCanvas {
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      title: node.data.title,
      instruction: node.data.instruction,
      expectedOutput: node.data.expectedOutput,
      assignedAgentId: node.data.assignedAgentId,
      priority: node.data.priority,
      position: { x: node.position.x, y: node.position.y }
    })),
    edges: edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target }))
  }
}
