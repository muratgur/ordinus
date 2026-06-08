// ADR-029 §4 — Ordinus tool registry.
//
// Single source of truth for the tool catalog Ordinus sees at session init.
// Tools are imported by name and bundled into a typed list; the runtime layer
// (M3) consumes:
//   - buildToolCatalog()  → JSON-Schema array passed to the CLI as tool defs
//   - invokeTool(name, ...) → dispatch with input validation + capability
//                              enforcement + output validation
//
// Adding a new tool = create a file under ./tools/ and add it to the `tools`
// constant below. Nothing else should need to change.
//
// The registry enforces the capability invariant: destructive tools MUST have
// requiresConfirmation = true. We default it on at registration time (rather
// than trusting each tool author to remember) — see normalizeManifest().

import type { z } from 'zod'
import { z as zod } from 'zod'
import type { OrdinusTool, OrdinusToolContext, OrdinusToolManifest } from './types'
import { archiveWorkRequest } from './tools/archiveWorkRequest'
import { cancelWorkRun } from './tools/cancelWorkRun'
import { createSchedule } from './tools/createSchedule'
import { createWorkflow } from './tools/createWorkflow'
import { deleteSchedule } from './tools/deleteSchedule'
import { getRun } from './tools/getRun'
import { getRunLog } from './tools/getRunLog'
import { listAgents } from './tools/listAgents'
import { listRecentWorkRequests } from './tools/listRecentWorkRequests'
import { memorySearch } from './tools/memorySearch'
import { memoryWrite } from './tools/memoryWrite'
import { proposeWorkRequest } from './tools/proposeWorkRequest'
import { runSqlReadonly } from './tools/runSqlReadonly'

// Order is irrelevant for execution but stable here so the JSON catalog comes
// out deterministic — easier diffs, easier prompt-cache reuse at session init.
const tools: ReadonlyArray<OrdinusTool<unknown, unknown>> = [
  listRecentWorkRequests as unknown as OrdinusTool<unknown, unknown>,
  getRun as unknown as OrdinusTool<unknown, unknown>,
  listAgents as unknown as OrdinusTool<unknown, unknown>,
  getRunLog as unknown as OrdinusTool<unknown, unknown>,
  memorySearch as unknown as OrdinusTool<unknown, unknown>,
  memoryWrite as unknown as OrdinusTool<unknown, unknown>,
  runSqlReadonly as unknown as OrdinusTool<unknown, unknown>,
  // ADR-029 M5: action tools that produce side effects + broadcast events.
  proposeWorkRequest as unknown as OrdinusTool<unknown, unknown>,
  createSchedule as unknown as OrdinusTool<unknown, unknown>,
  createWorkflow as unknown as OrdinusTool<unknown, unknown>,
  // ADR-029 M6: destructive tools — capability:'destructive', always gated by
  // the confirmation panel above the Home input.
  cancelWorkRun as unknown as OrdinusTool<unknown, unknown>,
  archiveWorkRequest as unknown as OrdinusTool<unknown, unknown>,
  deleteSchedule as unknown as OrdinusTool<unknown, unknown>
]

/**
 * Raw tool list (with input/output Zod schemas and executors), for callers
 * that need to wire tools into a downstream framework — primarily the MCP
 * server (see app/src/main/ordinus-mcp/server.ts). UI callers should use
 * invokeTool() instead; this is the "I'm bridging the registry to an
 * external runtime" door.
 */
export function getOrdinusToolsRaw(): ReadonlyArray<OrdinusTool<unknown, unknown>> {
  return tools
}

function normalizeManifest(manifest: OrdinusToolManifest): OrdinusToolManifest {
  // Destructive tools always require confirmation; the runtime keys off this
  // alone (M6). Authors cannot opt out — defense in depth against typos.
  const requiresConfirmation =
    manifest.capability === 'destructive' ? true : (manifest.requiresConfirmation ?? false)
  return { ...manifest, requiresConfirmation }
}

export type ToolCatalogEntry = {
  name: string
  description: string
  /**
   * JSON Schema representation of the tool's input. Shape is whatever
   * `zod.toJSONSchema` returns for a single root schema (the common Draft-2020
   * object form) — typed as `unknown` here because the runtime adapter is the
   * one that translates it into provider-specific tool-use formats.
   */
  inputSchema: unknown
}

/**
 * JSON-Schema view of every registered tool, in stable order. The runtime
 * adapter (M3) hands this list to the provider CLI at session init — it never
 * needs to be regenerated per turn.
 */
export function buildToolCatalog(): ToolCatalogEntry[] {
  return tools.map((tool) => ({
    name: tool.manifest.name,
    description: tool.manifest.description,
    inputSchema: zod.toJSONSchema(tool.inputSchema as z.ZodType<unknown>)
  }))
}

/**
 * Stable, alphabetized view of the manifest set. Useful for diagnostics, the
 * eventual /help knowledge pack section, and registry tests.
 */
export function listOrdinusTools(): OrdinusToolManifest[] {
  return tools
    .map((tool) => normalizeManifest(tool.manifest))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export type ToolInvocationResult =
  | { outcome: 'ok'; output: unknown }
  | { outcome: 'unknown_tool'; name: string }
  | { outcome: 'invalid_input'; name: string; errors: string }
  | { outcome: 'invalid_output'; name: string; errors: string }
  | { outcome: 'requires_confirmation'; name: string; manifest: OrdinusToolManifest }
  | { outcome: 'error'; name: string; message: string }

/**
 * Dispatch a tool call from the runtime layer. Validates input, enforces the
 * confirmation gate (callers that already collected user approval pass
 * `confirmed: true`), runs the executor, validates output.
 *
 * Output validation is intentionally strict — if a tool returns the wrong
 * shape we want the runtime to fail loudly here, not let malformed data flow
 * into the LLM's transcript where debugging becomes much harder.
 */
export async function invokeTool(
  name: string,
  rawInput: unknown,
  ctx: OrdinusToolContext,
  opts: { confirmed?: boolean } = {}
): Promise<ToolInvocationResult> {
  const tool = tools.find((candidate) => candidate.manifest.name === name)
  if (!tool) {
    return { outcome: 'unknown_tool', name }
  }

  const manifest = normalizeManifest(tool.manifest)
  if (manifest.requiresConfirmation && !opts.confirmed) {
    return { outcome: 'requires_confirmation', name, manifest }
  }

  const parsedInput = (tool.inputSchema as z.ZodType<unknown>).safeParse(rawInput)
  if (!parsedInput.success) {
    return {
      outcome: 'invalid_input',
      name,
      errors: parsedInput.error.message
    }
  }

  let output: unknown
  try {
    output = await tool.execute(parsedInput.data, ctx)
  } catch (err) {
    return {
      outcome: 'error',
      name,
      message: err instanceof Error ? err.message : String(err)
    }
  }

  const parsedOutput = (tool.outputSchema as z.ZodType<unknown>).safeParse(output)
  if (!parsedOutput.success) {
    return {
      outcome: 'invalid_output',
      name,
      errors: parsedOutput.error.message
    }
  }

  return { outcome: 'ok', output: parsedOutput.data }
}
