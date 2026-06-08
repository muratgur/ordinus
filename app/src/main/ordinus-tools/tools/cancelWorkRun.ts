// ADR-029 §9 / M6 — `cancel_work_run` destructive tool.
//
// Cancels a single running (or queued) Work Run. The run is terminated
// in-flight; any partial output it produced before cancellation is preserved
// on disk per the standard run lifecycle. Re-running is a normal operation
// from the Workboard, so this is the lightest member of the destructive
// trio — reversibility:'reversible' in the confirmation panel.
//
// Capability: 'destructive' — always gated by user approval. Even though
// the action is reversible, "stop something already running" is the kind of
// thing the user wants to confirm before it happens.

import { z } from 'zod'
import { defineOrdinusTool } from '../types'

const InputSchema = z.object({
  runId: z.string().min(1),
  /** Optional short reason the LLM chose to cancel — shown in "Why?" disclosure. */
  reason: z.string().trim().max(500).optional()
})

const OutputSchema = z.object({
  outcome: z.literal('cancelled'),
  runId: z.string(),
  runTitle: z.string()
})

export const cancelWorkRun = defineOrdinusTool({
  manifest: {
    name: 'cancel_work_run',
    description:
      'Cancel a Work Run that is currently queued or running. The run terminates ' +
      'in-flight; any partial output is preserved. Use when the user asks to "stop ' +
      'that run", "cancel it", or when triaging stuck runs. Re-running the underlying ' +
      'Work Request is a separate, normal action from the Workboard. Always include a ' +
      'short `reason` so the confirmation panel can show why you proposed the cancel.',
    capability: 'destructive'
  },
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  summarize: (input, ctx) => {
    // Look up the run for a friendlier panel. Fail-soft: if the run is gone
    // by the time we summarize, surface just the id — the user can still
    // approve or cancel.
    let label = input.runId
    let status: string | undefined
    try {
      const run = ctx.database.getWorkRun(input.runId)
      label = run.title || run.id
      status = run.status
    } catch {
      // ignore — fallback values stand
    }
    return {
      affectedRecords: [{ id: input.runId, label, status }],
      reversibility: 'reversible',
      why: input.reason
    }
  },
  execute: (input, ctx) => {
    const cancelled = ctx.database.cancelWorkRun({ runId: input.runId })
    return {
      outcome: 'cancelled' as const,
      runId: cancelled.id,
      runTitle: cancelled.title
    }
  }
})
