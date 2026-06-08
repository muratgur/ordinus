// ADR-029 §9 / M6 — `archive_work_request` destructive tool.
//
// Soft-deletes a Work Request: it disappears from the active Workboard but
// can be restored via Unarchive in the existing UI. Reversibility:
// 'soft-delete' in the confirmation panel — the copy makes clear the user
// can put it back.
//
// We do NOT expose a "hard delete WR" tool. That's a destructive action
// with no good in-product recovery, and the existing UI doesn't surface it
// either. Archive is the right granularity for an Ordinus action.

import { z } from 'zod'
import { defineOrdinusTool } from '../types'

const InputSchema = z.object({
  workRequestId: z.string().min(1),
  reason: z.string().trim().max(500).optional()
})

const OutputSchema = z.object({
  outcome: z.literal('archived'),
  workRequestId: z.string(),
  title: z.string(),
  archivedAt: z.string().nullable()
})

export const archiveWorkRequest = defineOrdinusTool({
  manifest: {
    name: 'archive_work_request',
    description:
      'Archive a Work Request — soft-delete that hides it from the active Workboard ' +
      'but keeps the record for later restore via Unarchive. Use when the user wants ' +
      "to 'archive', 'hide', 'clean up' a WR. Do NOT use for a hard delete; the app " +
      'intentionally keeps WRs around. Include a short `reason` for the confirmation ' +
      "panel's Why? disclosure.",
    capability: 'destructive'
  },
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  summarize: (input, ctx) => {
    let label = input.workRequestId
    let status: string | undefined
    try {
      const wr = ctx.database.getWorkRequest(input.workRequestId)
      label = wr.title || wr.id
      status = wr.status
    } catch {
      // ignore
    }
    return {
      affectedRecords: [{ id: input.workRequestId, label, status }],
      reversibility: 'soft-delete',
      why: input.reason
    }
  },
  execute: (input, ctx) => {
    const archived = ctx.database.archiveWorkRequest(input.workRequestId)
    return {
      outcome: 'archived' as const,
      workRequestId: archived.id,
      title: archived.title,
      archivedAt: archived.archivedAt
    }
  }
})
