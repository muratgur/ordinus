// ADR-029 §9 / M6 — `delete_schedule` destructive tool.
//
// Permanently removes a scheduled task. There is no soft-delete or restore
// path for schedules in the app — once gone, gone. Reversibility:
// 'irreversible' in the confirmation panel; the copy makes the data-loss
// nature explicit so the user opts in deliberately.
//
// For "just pause this for now" intents, Ordinus should prefer the
// (write-capability, no-confirm) disable path — but we don't ship a
// disable tool in M6. For now, if the user says "stop X for a while",
// Ordinus should explain that the only programmatic option is delete, and
// suggest the Schedules screen for a one-click disable. M5+ may add a
// `disable_schedule` write tool to round this out.

import { z } from 'zod'
import { defineOrdinusTool } from '../types'

const InputSchema = z.object({
  scheduleId: z.string().min(1),
  reason: z.string().trim().max(500).optional()
})

const OutputSchema = z.object({
  outcome: z.literal('deleted'),
  scheduleId: z.string(),
  scheduleName: z.string()
})

export const deleteSchedule = defineOrdinusTool({
  manifest: {
    name: 'delete_schedule',
    description:
      'Permanently delete a scheduled task. This cannot be undone — there is no ' +
      'restore path. Use only when the user clearly wants the schedule GONE (e.g. ' +
      "'delete it', 'remove that schedule'). For 'pause' / 'stop for a while', tell " +
      'the user to disable it from the Schedules screen instead. Always include a ' +
      'short `reason` for the confirmation panel.',
    capability: 'destructive'
  },
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  summarize: (input, ctx) => {
    let label = input.scheduleId
    let status: string | undefined
    try {
      const schedule = ctx.database.getAgentSchedule({ id: input.scheduleId })
      label = schedule.name || schedule.id
      status = schedule.enabled ? 'enabled' : 'disabled'
    } catch {
      // ignore
    }
    return {
      affectedRecords: [{ id: input.scheduleId, label, status }],
      reversibility: 'irreversible',
      why: input.reason
    }
  },
  execute: (input, ctx) => {
    // Capture the name BEFORE deletion so we can echo it back to the LLM.
    let name = input.scheduleId
    try {
      name = ctx.database.getAgentSchedule({ id: input.scheduleId }).name || input.scheduleId
    } catch {
      // ignore — fallback to id
    }
    ctx.database.deleteAgentSchedule({ id: input.scheduleId })
    return {
      outcome: 'deleted' as const,
      scheduleId: input.scheduleId,
      scheduleName: name
    }
  }
})
