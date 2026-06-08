// ADR-029 §4 — Ordinus tool layer type contracts.
//
// Every Ordinus tool is a single module exporting a four-piece object:
//   1. manifest      — name, description (Ordinus uses this to pick the tool),
//                      capability tier, and confirmation policy
//   2. inputSchema   — Zod schema validating LLM-supplied arguments
//   3. outputSchema  — Zod schema validating the executor's return value
//   4. execute       — async function doing the actual work, given a typed
//                      context (database, observability service, ...).
//
// The registry in ./index.ts collects these and derives the JSON-Schema tool
// catalog that the runtime layer (M3) hands to the CLI at session init. By
// design, runtime never has to know about individual tools — only the registry.
//
// Capability tiers shape how the runtime treats the call:
//   - 'read'        → executes immediately, no confirmation.
//   - 'write'       → executes immediately, no confirmation (memory_write etc.).
//   - 'destructive' → runtime MUST publish a confirmation request and await
//                     the user's decision before invoking execute().
//                     M2 only defines the contract; the runtime enforcement
//                     lands in M6.

import type { z } from 'zod'
import type { OrdinusDatabase } from '../db/database'
import type { ObservabilityService } from '../observability/service'
import type { RuntimeService } from '../runtime/service'
import type { OrdinusActionEvent } from '@shared/contracts'

export type ToolCapability = 'read' | 'write' | 'destructive'

export type OrdinusToolManifest = {
  /** Stable identifier used as the JSON tool name. snake_case, no spaces. */
  name: string
  /**
   * One- or two-sentence description Ordinus reads when deciding whether to
   * call this tool. Write it for an LLM audience, not a human reader — be
   * concrete about inputs, outputs, and when *not* to call it.
   */
  description: string
  capability: ToolCapability
  /**
   * Whether the runtime must collect explicit user approval before executing.
   * Derived default in the registry: false for read/write, true for destructive.
   * Tools may opt in (e.g. a 'write' that touches workspace config) but must
   * not opt out of destructive confirmation — the registry enforces this.
   */
  requiresConfirmation?: boolean
}

/**
 * Runtime services tools may consume. Kept narrow on purpose so we don't grow
 * a god-context: add fields here only when a real tool needs them.
 *
 * `events.publish` lets a tool broadcast an OrdinusActionEvent to every renderer
 * window after a successful side-effect. The renderer subscribes once at App
 * mount and routes events (e.g. open Workboard plan-review, show a toast).
 * Publishing is fire-and-forget; failures are not surfaced back to the LLM.
 */
export type OrdinusToolContext = {
  database: OrdinusDatabase
  observability: ObservabilityService
  runtime: RuntimeService
  events: {
    publish(event: OrdinusActionEvent): void
  }
}

export type OrdinusToolExecutor<TInput, TOutput> = (
  input: TInput,
  ctx: OrdinusToolContext
) => Promise<TOutput> | TOutput

/**
 * ADR-029 M6 — Summary destructive tools provide for the confirmation panel.
 *
 *   - affectedRecords: one row per record the tool will touch. The renderer
 *     shows these so the user can verify the exact target before approving.
 *   - reversibility: drives copy ("Reversible from the X screen" vs "This
 *     cannot be undone"). 'reversible' = trivially undoable via UI (cancel
 *     a queued run); 'soft-delete' = recoverable via a counterpart action
 *     (archive ↔ unarchive); 'irreversible' = data loss.
 *   - why: optional short rationale to render in a "Why?" disclosure.
 *     Pull from input if the LLM provided one; otherwise omit.
 */
export type OrdinusToolSummary = {
  affectedRecords: Array<{ id: string; label: string; status?: string }>
  reversibility: 'reversible' | 'soft-delete' | 'irreversible'
  why?: string
}

export type OrdinusToolSummarizer<TInput> = (
  input: TInput,
  ctx: OrdinusToolContext
) => OrdinusToolSummary | Promise<OrdinusToolSummary>

export type OrdinusTool<TInput = unknown, TOutput = unknown> = {
  manifest: OrdinusToolManifest
  inputSchema: z.ZodType<TInput>
  outputSchema: z.ZodType<TOutput>
  execute: OrdinusToolExecutor<TInput, TOutput>
  /**
   * Destructive tools SHOULD provide this so the confirmation panel can show
   * the user what will happen. If omitted, the panel falls back to "{toolName}
   * with {json args}" which is functional but less informative. The runtime
   * never invokes summarize for non-destructive capabilities.
   */
  summarize?: OrdinusToolSummarizer<TInput>
}

/**
 * Helper to author a tool with full type inference from the schemas. Prefer
 * this over hand-typing `OrdinusTool<I, O>` — it forces the executor signature
 * to match the schemas at the declaration site.
 */
export function defineOrdinusTool<TInput, TOutput>(
  tool: OrdinusTool<TInput, TOutput>
): OrdinusTool<TInput, TOutput> {
  return tool
}
