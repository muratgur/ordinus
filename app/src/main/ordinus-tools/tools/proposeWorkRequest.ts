// ADR-029 M5 — `propose_work_request` action tool.
//
// Takes a free-form request string and a short title, runs the request
// through the existing Workboard Planner (ADR-007), broadcasts an
// `workboard_plan_ready` event to the renderer with the resulting draft plan,
// and returns a summary to the LLM.
//
// The renderer subscribes once at App mount; receiving the event fills the
// shared `workboardDraftReview` state and navigates to /workboard so the
// user reviews the plan in the existing surface (no new review UI). Ordinus
// itself doesn't create the Work Request — it only proposes a draft. The
// final approve/cancel decision stays with the user, in the place they
// expect to see WR drafts.
//
// Capability: 'write' — we are mutating no state at this point (just
// generating a plan); the WR comes into existence only after the user
// approves in Workboard. No confirmation panel is needed.

import type { Agent } from '@shared/contracts'
import { z } from 'zod'
import { defineOrdinusTool } from '../types'

const InputSchema = z.object({
  /** Short label for the WR. Surfaced as plan title and in user-facing toasts. */
  title: z.string().trim().min(1).max(160),
  /**
   * The actual request the planner consumes. Should be a self-contained
   * description of the work — do not assume the planner can see the Ordinus
   * conversation. Include any context the planner needs.
   */
  request: z.string().trim().min(1).max(16_000),
  /**
   * Optional explicit list of agent ids to consider. Defaults to every
   * enabled agent. Use this when the user named specific agents during the
   * conversation; leave empty to let the planner pick freely.
   */
  requestedAgentIds: z.array(z.string().min(1)).max(8).optional()
})

const OutputSchema = z.object({
  outcome: z.literal('draft_opened'),
  title: z.string(),
  itemCount: z.number().int().nonnegative(),
  agentNames: z.array(z.string()),
  // The renderer is the surface that opens the review; the LLM just sees
  // the summary. We don't echo the full plan back into the transcript.
  reviewSurface: z.literal('workboard')
})

export const proposeWorkRequest = defineOrdinusTool({
  manifest: {
    name: 'propose_work_request',
    description:
      'Turn a request into a Workboard Work Request draft. Runs the request through ' +
      "Ordinus's existing planner, returns immediately with a summary, and opens the " +
      'Workboard plan-review surface for the user. Use this when the user asks to ' +
      "'turn this into a WR', 'make this a work request', 'plan this out', or types " +
      '/workboard. The user approves the plan in Workboard — do not assume the WR ' +
      'exists until they do. Include a short title and a self-contained request ' +
      'string the planner can act on (assume the planner cannot see the conversation).',
    capability: 'write'
  },
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  execute: async (input, ctx) => {
    const workspace = ctx.database.getWorkspaceConfig()
    if (!workspace) {
      throw new Error('No workspace is configured.')
    }

    const agents: Agent[] = ctx.database.listAgents().filter((agent) => agent.enabled)
    if (agents.length === 0) {
      throw new Error('Create and enable at least one agent before proposing a Work Request.')
    }

    const plan = await ctx.runtime.generateWorkboardPlan({
      providerId: workspace.defaultProviderId,
      model: workspace.defaultModel,
      workspaceRoot: workspace.workspaceRoot,
      agents,
      request: input.request,
      requestedAgentIds: input.requestedAgentIds ?? []
    })

    // Inline validation: every assigned agent must exist + be enabled. The
    // planner sometimes hallucinates ids; the existing IPC handler performs
    // the same check before letting a plan into the review surface.
    const agentIds = new Set(agents.map((agent) => agent.id))
    if (plan.items.some((item) => !agentIds.has(item.assignedAgentId))) {
      throw new Error('The planner assigned work to an unavailable agent.')
    }

    ctx.events.publish({
      kind: 'workboard_plan_ready',
      request: input.request,
      plan
    })

    const assignedAgentNames = Array.from(
      new Set(
        plan.items
          .map((item) => agents.find((a) => a.id === item.assignedAgentId)?.name)
          .filter((name): name is string => Boolean(name))
      )
    )

    return {
      outcome: 'draft_opened' as const,
      title: input.title,
      itemCount: plan.items.length,
      agentNames: assignedAgentNames,
      reviewSurface: 'workboard' as const
    }
  }
})
