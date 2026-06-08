// ADR-029 §3 — `get_run_log` read tool.
//
// Thin wrapper over ObservabilityService.getDiagnostics(). Path-traversal
// protection, stream tailing, and the 64 KB byte cap all live in the service
// already (see app/src/main/observability/service.ts) — the tool only shapes
// the input/output. Offsets let Ordinus tail incrementally across multiple
// calls without re-reading megabytes; for the typical "what happened here?"
// question Ordinus omits the offsets and gets the tail.
//
// We pass through the raw diagnostics shape (stdout/stderr streams with their
// own metadata) so Ordinus can decide which side to read. The structure is
// identical to what the Workboard observation panel consumes — same data,
// different consumer.

import { z } from 'zod'
import { defineOrdinusTool } from '../types'

const InputSchema = z.object({
  observedRunId: z.string().min(1),
  stdoutOffset: z.number().int().nonnegative().optional(),
  stderrOffset: z.number().int().nonnegative().optional()
})

const StreamSchema = z.object({
  text: z.string(),
  startOffset: z.number().int().nonnegative(),
  nextOffset: z.number().int().nonnegative(),
  truncated: z.boolean()
})

const OutputSchema = z.object({
  observedRunId: z.string(),
  invocation: z.object({
    provider: z.string(),
    executable: z.string(),
    args: z.array(z.string()),
    cwd: z.string(),
    startedAt: z.string().nullable()
  }),
  stdout: StreamSchema,
  stderr: StreamSchema
})

export const getRunLog = defineOrdinusTool({
  manifest: {
    name: 'get_run_log',
    description:
      'Read the tail of stdout/stderr for an observed run by observedRunId. Returns ' +
      'the recent log tail plus byte offsets so you can paginate (pass the returned ' +
      'nextOffset as the next *Offset to read only new output). Use when the user asks ' +
      'what happened during a run, why it failed, or what an agent did step-by-step. ' +
      'Note: observedRunId is NOT the same as runId — get it from list_workboard_runs ' +
      "or from a run object's observation reference. Output is capped at ~64 KB per " +
      'stream by the underlying service.',
    capability: 'read'
  },
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  execute: (input, ctx) => {
    const diagnostics = ctx.observability.getDiagnostics({
      observedRunId: input.observedRunId,
      stdoutOffset: input.stdoutOffset,
      stderrOffset: input.stderrOffset
    })
    return {
      observedRunId: diagnostics.observedRunId,
      invocation: diagnostics.invocation,
      stdout: diagnostics.stdout,
      stderr: diagnostics.stderr
    }
  }
})
