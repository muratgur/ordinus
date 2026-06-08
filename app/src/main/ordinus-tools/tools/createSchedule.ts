// ADR-029 M5 — `create_schedule` action tool.
//
// Creates a recurring or one-shot scheduled task that fires an agent against
// a Work Request prompt. Used when the user wants to turn a conversation into
// "do X every morning" or "remind me tomorrow at 9".
//
// Ordinus picks the agent (via list_agents) and translates the user's natural
// description into cron + timezone. The tool writes the schedule directly —
// no separate review screen — because schedules are easy to inspect and
// reverse from the Schedules screen if Ordinus got it wrong.
//
// Capability: 'write'. No confirmation panel — the action is reversible
// (user can disable / delete from the Schedules screen). ADR §9 reserves
// destructive-and-confirmed for irreversible operations.

import { z } from 'zod'
import { computeNextRunAt } from '../../scheduler/service'
import { defineOrdinusTool } from '../types'

const InputSchema = z
  .object({
    /** Existing agent's id. Use list_agents first to pick a suitable one. */
    agentId: z.string().min(1),
    /** Human-readable label for the schedule list. */
    name: z.string().trim().min(1).max(120),
    /**
     * The Work Request prompt the agent runs on each firing. Treat this
     * like a small standing instruction — must be self-contained, the
     * scheduler does not replay conversation context to the agent.
     */
    prompt: z.string().trim().min(1).max(16_000),
    /**
     * Cron expression in standard 5- or 6-field form. Required unless
     * `runAt` is set. Evaluate using the supplied `timezone`.
     */
    cron: z.string().trim().min(1).max(200).nullable().optional(),
    /**
     * One-shot ISO timestamp. Use INSTEAD OF cron for "remind me at X" /
     * "run once at Y" requests.
     */
    runAt: z.string().trim().min(1).max(40).nullable().optional(),
    /**
     * IANA timezone string (e.g. "Europe/Istanbul"). Pick the user's
     * timezone if known; otherwise prefer UTC.
     */
    timezone: z.string().trim().min(1).max(80),
    enabled: z.boolean().optional()
  })
  .refine((value) => Boolean(value.cron || value.runAt), {
    message: 'Schedule must provide a cron expression or a runAt timestamp.'
  })

const OutputSchema = z.object({
  outcome: z.literal('created'),
  scheduleId: z.string(),
  scheduleName: z.string(),
  agentId: z.string(),
  agentName: z.string(),
  nextRunAt: z.string().nullable()
})

export const createSchedule = defineOrdinusTool({
  manifest: {
    name: 'create_schedule',
    description:
      'Create a scheduled task — recurring (cron) or one-shot (runAt) — that fires ' +
      'an existing agent against a Work Request prompt. Use this when the user wants ' +
      "to set up 'every morning', 'every Monday', 'tomorrow at 9', etc., or types " +
      '/schedule. ALWAYS call list_agents first to pick a suitable agentId. ' +
      "Translate the user's natural-language schedule into a proper cron expression " +
      'or ISO runAt. The schedule is reversible from the Schedules screen, so no ' +
      'approval prompt is shown — confirm details in chat before calling.',
    capability: 'write'
  },
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  execute: (input, ctx) => {
    const nextRunAt = computeNextRunAt({
      cron: input.cron ?? null,
      runAt: input.runAt ?? null,
      timezone: input.timezone
    })

    const schedule = ctx.database.createAgentSchedule({
      agentId: input.agentId,
      name: input.name,
      prompt: input.prompt,
      cron: input.cron ?? null,
      runAt: input.runAt ?? null,
      timezone: input.timezone,
      enabled: input.enabled ?? true,
      nextRunAt
    })

    ctx.events.publish({
      kind: 'schedule_created',
      scheduleId: schedule.id,
      scheduleName: schedule.name
    })

    // Look up agent name for a friendlier LLM reply ("Created 'Daily report'
    // for agent Aria"). Failure to find is benign — we just omit the name.
    let agentName = input.agentId
    try {
      agentName =
        ctx.database.listAgents().find((a) => a.id === input.agentId)?.name ?? input.agentId
    } catch {
      // ignore
    }

    return {
      outcome: 'created' as const,
      scheduleId: schedule.id,
      scheduleName: schedule.name,
      agentId: input.agentId,
      agentName,
      nextRunAt: schedule.nextRunAt
    }
  }
})
