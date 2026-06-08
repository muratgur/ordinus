// ADR-029 §3 — `get_run` read tool.
//
// Wraps OrdinusDatabase.getWorkRun(runId). The repository function throws when
// the run is missing; the tool catches and returns a structured `not_found`
// outcome so Ordinus can react gracefully (e.g. retry with a list tool) instead
// of surfacing a raw stack trace in the transcript.

import { z } from 'zod'
import { defineOrdinusTool } from '../types'

const InputSchema = z.object({
  runId: z.string().min(1)
})

const RunSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  assignedAgentId: z.string(),
  assignedAgentName: z.string(),
  providerId: z.string(),
  model: z.string(),
  workingRoot: z.string(),
  resultSummary: z.string(),
  error: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable()
})

const OutputSchema = z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal('found'), run: RunSchema }),
  z.object({ outcome: z.literal('not_found'), runId: z.string() })
])

export const getRun = defineOrdinusTool({
  manifest: {
    name: 'get_run',
    description:
      'Fetch a single Work Run by id. Returns {outcome:"found", run} with the run\'s ' +
      'status, agent assignment, provider/model, result summary, and error text; or ' +
      '{outcome:"not_found", runId} if the id does not exist. Use this when the user ' +
      'references a specific run (e.g. "what happened in WR-42\'s run?") and you have ' +
      'the runId. Pair with get_run_log when the user asks "why" or "what did it do".',
    capability: 'read'
  },
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  execute: (input, ctx) => {
    try {
      const run = ctx.database.getWorkRun(input.runId)
      return {
        outcome: 'found' as const,
        run: {
          id: run.id,
          title: run.title,
          status: run.status,
          assignedAgentId: run.assignedAgentId,
          assignedAgentName: run.assignedAgentName,
          providerId: run.providerId,
          model: run.model,
          workingRoot: run.workingRoot,
          resultSummary: run.resultSummary,
          error: run.error,
          createdAt: run.createdAt,
          updatedAt: run.updatedAt,
          startedAt: run.startedAt,
          completedAt: run.completedAt
        }
      }
    } catch {
      return { outcome: 'not_found' as const, runId: input.runId }
    }
  }
})
