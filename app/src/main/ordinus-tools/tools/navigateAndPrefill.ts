// ADR-048 §6 — `navigate_and_prefill` handoff tool.
//
// Ordinus's way of pointing the user at the right surface. It does NOT navigate
// or send anything itself — it surfaces a distinct, clickable chip in the
// transcript. The user clicks it to go to the target (with the input optionally
// pre-filled); the send decision is always theirs. This is the mechanical
// guarantee behind "Ordinus guides, the user pulls the trigger."
//
// One mechanism serves every handoff: onboarding→Ordinus, Ordinus→Connections,
// Ordinus→an agent's chat, Ordinus→Workboard/Schedules, etc.

import { z } from 'zod'
import { defineOrdinusTool } from '../types'
import { OrdinusHandoffTargetSchema } from '@shared/contracts'

const InputSchema = z.object({
  target: OrdinusHandoffTargetSchema.describe(
    'Which surface to take the user to. Use "agent" with agentId for a specific ' +
      'agent\'s 1:1 chat; "connections" for the Connections settings; "home" to drop a ' +
      'suggestion into your own input.'
  ),
  agentId: z
    .string()
    .optional()
    .describe('Required when target is "agent": the id of the agent whose chat to open.'),
  label: z
    .string()
    .min(1)
    .max(60)
    .describe('Short chip text, e.g. "Connect Gmail" or "Talk to your research agent".'),
  prefill: z
    .string()
    .optional()
    .describe(
      'Optional text to pre-fill into the destination input (Home or an agent chat). ' +
        'Never sent automatically — the user reviews and sends it.'
    ),
  reason: z.string().optional().describe('Optional one-line rationale shown with the chip.')
})

const OutputSchema = z.object({
  surfaced: z.literal(true)
})

export const navigateAndPrefill = defineOrdinusTool({
  manifest: {
    name: 'navigate_and_prefill',
    description:
      'Surface a distinct handoff chip in the transcript that takes the user to a target ' +
      'surface, optionally pre-filling its input. Use this to GUIDE the user to the next ' +
      'step instead of doing it for them — e.g. point them to Connections to link a tool, ' +
      "to an agent's chat to start working with it, or to Workboard. You never navigate or " +
      'send anything yourself; the chip only appears, and the user decides whether to follow ' +
      'it. Always set a clear label. For target "agent" you must pass agentId (from ' +
      'list_agents). prefill is optional and is only used by input-bearing targets (home, agent).',
    capability: 'write'
  },
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  execute: (input, ctx) => {
    if (input.target === 'agent' && !input.agentId) {
      throw new Error('navigate_and_prefill: target "agent" requires agentId.')
    }
    ctx.events.publish({
      kind: 'handoff_suggested',
      handoff: {
        target: input.target,
        agentId: input.agentId ?? null,
        label: input.label,
        prefill: input.prefill ?? '',
        reason: input.reason ?? ''
      }
    })
    return { surfaced: true as const }
  }
})
