// ADR-048 phase 3 — `propose_agent` tool.
//
// Ordinus's way of helping the user create a teammate. After shaping the intent
// in conversation, Ordinus distills a brief and calls this; it runs the SAME
// profile engine the manual wizard uses (runtime.generateAgentDraft) so there's
// one quality standard, then surfaces the agent creation flow pre-seeded at the
// "shape" step (name / avatar / color). Ordinus does NOT create the agent — the
// user confirms in the pop-up. This keeps the bright line: Ordinus prepares, the
// user pulls the trigger.

import { z } from 'zod'
import { defineOrdinusTool } from '../types'
import { AgentSandboxSchema } from '@shared/contracts'

const InputSchema = z.object({
  requestedWork: z
    .string()
    .trim()
    .min(12)
    .describe(
      'A self-contained brief of what this teammate should help with, distilled from your ' +
        'conversation with the user. The profile engine cannot see the chat — bake in the ' +
        'role, the kind of work, and any standards the user mentioned.'
    ),
  sandbox: AgentSandboxSchema.optional().describe(
    'How much access the agent needs. Default to the least powerful that does the job; ' +
      'omit to use the workspace default.'
  )
})

const OutputSchema = z.object({
  proposed: z.literal(true),
  name: z.string(),
  role: z.string()
})

export const proposeAgent = defineOrdinusTool({
  manifest: {
    name: 'propose_agent',
    description:
      'Propose a new agent (teammate) for the user. Give a self-contained requestedWork ' +
      'brief distilled from the conversation; this runs the same profile engine the manual ' +
      'creation flow uses and opens the agent creation pop-up pre-filled at the name/avatar/' +
      'color step for the user to confirm. Use this once the user clearly wants to create an ' +
      'agent and you understand the work it should do. You do NOT create the agent — the user ' +
      'confirms in the pop-up. After proposing, tell them what they will be able to do with ' +
      'it and what connection it may need next.',
    capability: 'write'
  },
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  execute: async (input, ctx) => {
    const workspace = ctx.database.getWorkspaceConfig()
    if (!workspace) {
      throw new Error('Choose a workspace before creating an agent.')
    }
    const draft = await ctx.runtime.generateAgentDraft({
      requestedWork: input.requestedWork,
      sandbox: input.sandbox ?? 'workspace-write',
      providerId: workspace.defaultProviderId,
      model: workspace.defaultModel
    })
    const named = {
      ...draft,
      name: ctx.database.getAvailableAgentName(draft.name),
      enabled: draft.enabled ?? true
    }
    ctx.events.publish({ kind: 'agent_draft_ready', draft: named })
    return { proposed: true as const, name: named.name, role: named.role }
  }
})
