// ADR-029 §3 — `list_recent_work_requests` read tool.
//
// Thin shape over OrdinusDatabase.listWorkRequests(). We trim the payload to
// the fields Ordinus actually reasons about (title, status, timestamps) and
// cap the list so the model doesn't drown in a 200-row workboard. The full
// repository function is reused untouched; the tool is just a projection.

import { z } from 'zod'
import { defineOrdinusTool } from '../types'

const InputSchema = z.object({
  /** Cap the number of rows returned. Defaults to 25, hard max 100. */
  limit: z.number().int().positive().max(100).optional()
})

const ItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  archivedAt: z.string().nullable()
})

const OutputSchema = z.object({
  items: z.array(ItemSchema),
  totalCount: z.number().int().nonnegative()
})

export const listRecentWorkRequests = defineOrdinusTool({
  manifest: {
    name: 'list_recent_work_requests',
    description:
      "List the most recent Work Requests on the user's Workboard, newest first. " +
      'Returns id, title, status (queued|running|waiting_for_user|completed|failed|cancelled), ' +
      "and timestamps. Use this when the user asks about recent work, what's in flight, " +
      'or refers to a WR by title rather than id. Do NOT use to fetch a single known WR — ' +
      'use get_run or query the work_requests table via run_sql_readonly for that.',
    capability: 'read'
  },
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  execute: (input, ctx) => {
    const limit = input.limit ?? 25
    const all = ctx.database.listWorkRequests()
    const sorted = [...all].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    return {
      items: sorted.slice(0, limit).map((wr) => ({
        id: wr.id,
        title: wr.title,
        status: wr.status,
        createdAt: wr.createdAt,
        updatedAt: wr.updatedAt,
        archivedAt: wr.archivedAt ?? null
      })),
      totalCount: all.length
    }
  }
})
