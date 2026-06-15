// ADR-048 §7 — `list_schedules` lazy detail read tool.
//
// Detail behind get_app_status's schedule counts: the user's standing routines,
// which agent runs each, its cadence, and last outcome. Use when the user asks
// about their schedules or you need to reference a specific one (e.g. before
// proposing delete_schedule). Read-only; managing routines happens on the
// Schedules surface or via create_schedule / delete_schedule.

import { z } from 'zod'
import { defineOrdinusTool } from '../types'

const InputSchema = z.object({
  agentId: z.string().optional(),
  enabled: z.boolean().optional()
})

const ScheduleSummarySchema = z.object({
  id: z.string(),
  agentId: z.string(),
  name: z.string(),
  cron: z.string().nullable(),
  runAt: z.string().nullable(),
  timezone: z.string(),
  enabled: z.boolean(),
  nextRunAt: z.string().nullable(),
  lastRunStatus: z.string().nullable()
})

const OutputSchema = z.object({
  schedules: z.array(ScheduleSummarySchema)
})

export const listSchedules = defineOrdinusTool({
  manifest: {
    name: 'list_schedules',
    description:
      "List the user's standing routines (schedules): which agent runs each, its cadence " +
      '(cron or one-time), timezone, whether it is enabled, when it next fires, and its ' +
      'last outcome. Filter by agentId or enabled if useful. Use when the user asks about ' +
      'their routines or you need to reference a specific one before proposing a change.',
    capability: 'read'
  },
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  execute: (input, ctx) => {
    const schedules = ctx.database.listAgentSchedules({
      agentId: input.agentId,
      enabled: input.enabled
    })
    return {
      schedules: schedules.map((s) => ({
        id: s.id,
        agentId: s.agentId,
        name: s.name,
        cron: s.cron,
        runAt: s.runAt,
        timezone: s.timezone,
        enabled: s.enabled,
        nextRunAt: s.nextRunAt,
        lastRunStatus: s.lastRunStatus
      }))
    }
  }
})
