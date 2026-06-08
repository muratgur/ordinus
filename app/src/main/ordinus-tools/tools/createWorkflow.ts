// ADR-029 M5 — `create_workflow` action tool.
//
// Creates a saved Workflow design (ADR-025) from a node+edge specification
// Ordinus assembled out of the conversation. Designs are lenient: empty
// nodes are allowed at save time, only run-gating is strict — so a draft
// Ordinus produces is always saveable even if details are still missing.
//
// Node positions are an authoring-time concern; Ordinus doesn't know layout.
// We auto-arrange nodes in a single vertical column before saving so the
// designer's canvas opens with something visible. The user can rearrange in
// the designer afterwards.
//
// Capability: 'write'. No confirmation panel — the design is reversible
// (deletable from the Workflows screen).

import { z } from 'zod'
import { defineOrdinusTool } from '../types'

const NodeSchema = z.object({
  id: z.string().trim().min(1).max(80),
  title: z.string().trim().max(160).default(''),
  instruction: z.string().trim().max(16_000).default(''),
  expectedOutput: z.string().trim().max(2_000).default(''),
  assignedAgentId: z.string().max(160).default(''),
  priority: z.number().int().min(-100).max(100).default(0)
})

const EdgeSchema = z.object({
  id: z.string().trim().min(1).max(80),
  source: z.string().trim().min(1).max(80),
  target: z.string().trim().min(1).max(80)
})

const InputSchema = z.object({
  /** Human-readable workflow name shown in the Workflows list. */
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2_000).optional(),
  /**
   * Nodes WITHOUT positions — the tool auto-arranges them vertically in a
   * single column. Node ids must be unique within the array; edges reference
   * these ids. Cap matches the Workboard plan compile target (16 max).
   */
  nodes: z.array(NodeSchema).min(1).max(16),
  /**
   * Directed edges, source → target. Omit for a single-node design. Both
   * endpoints must reference node ids declared above; cycles are tolerated
   * at save time but flagged at compile time by the designer.
   */
  edges: z.array(EdgeSchema).max(256).default([])
})

const OutputSchema = z.object({
  outcome: z.literal('created'),
  workflowId: z.string(),
  workflowName: z.string(),
  nodeCount: z.number().int().nonnegative(),
  edgeCount: z.number().int().nonnegative()
})

// Auto-layout: stack nodes in a column. Spacing chosen to leave the user
// room to drag without overlap immediately; the designer also has a "fit to
// view" so the absolute pixel values aren't critical.
const COLUMN_X = 200
const ROW_SPACING_Y = 140
const FIRST_NODE_Y = 80

export const createWorkflow = defineOrdinusTool({
  manifest: {
    name: 'create_workflow',
    description:
      'Create a saved Workflow design from a node+edge specification. Use this when ' +
      "the user wants to 'turn this into a workflow' / 'design a flow' / types " +
      '/workflow. Each node becomes a task in the visual designer; each node MUST ' +
      'have an assignedAgentId from list_agents (run that tool first). Empty fields ' +
      'are allowed — the user can fill them in the designer. Edges declare ordering: ' +
      'source must finish before target starts. Positions are added automatically ' +
      '(vertical column); the user can rearrange in the canvas.',
    capability: 'write'
  },
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  execute: (input, ctx) => {
    // Reject duplicate node ids early so the Drizzle insert doesn't fail
    // with a less helpful constraint error.
    const seen = new Set<string>()
    for (const node of input.nodes) {
      if (seen.has(node.id)) {
        throw new Error(`Duplicate node id "${node.id}" in workflow.`)
      }
      seen.add(node.id)
    }
    for (const edge of input.edges) {
      if (!seen.has(edge.source) || !seen.has(edge.target)) {
        throw new Error(`Edge ${edge.id} references unknown node id.`)
      }
    }

    const positioned = input.nodes.map((node, index) => ({
      ...node,
      position: { x: COLUMN_X, y: FIRST_NODE_Y + index * ROW_SPACING_Y }
    }))

    const created = ctx.database.createWorkflowDesign({
      name: input.name,
      description: input.description ?? '',
      canvas: {
        nodes: positioned,
        edges: input.edges
      }
    })

    ctx.events.publish({
      kind: 'workflow_created',
      workflowId: created.id,
      workflowName: created.name
    })

    return {
      outcome: 'created' as const,
      workflowId: created.id,
      workflowName: created.name,
      nodeCount: created.canvas.nodes.length,
      edgeCount: created.canvas.edges.length
    }
  }
})
