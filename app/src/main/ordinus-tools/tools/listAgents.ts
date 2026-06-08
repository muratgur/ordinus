// ADR-029 §3 — `list_agents` read tool.
//
// Returns the user's agents (excluding archived). Trims to the fields Ordinus
// uses when reasoning about who can do what: identity, role, what they
// requested to work on, provider, and basic state. Full agent records (with
// instructions, capabilities, connectors, extra directories) are intentionally
// not returned — Ordinus can call run_sql_readonly against the `agents` table
// if it needs the long-form picture.

import { z } from 'zod'
import { defineOrdinusTool } from '../types'

const InputSchema = z.object({
  includeDisabled: z.boolean().optional()
})

const AgentSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  requestedWork: z.string(),
  providerId: z.string(),
  model: z.string(),
  enabled: z.boolean(),
  pinnedAt: z.string().nullable(),
  lastUsedAt: z.string().nullable(),
  useCount: z.number().int().nonnegative()
})

const OutputSchema = z.object({
  agents: z.array(AgentSummarySchema)
})

export const listAgents = defineOrdinusTool({
  manifest: {
    name: 'list_agents',
    description:
      "List the user's agents (excludes archived). Returns id, name, role, the work " +
      'they were created for, provider/model, and usage stats. Use when the user asks ' +
      '"which agents do I have?", or when you need to recommend a specialist for a task ' +
      "and want to see who's available. Set includeDisabled:true to include agents the " +
      'user has turned off (default false).',
    capability: 'read'
  },
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  execute: (input, ctx) => {
    const all = ctx.database.listAgents()
    const filtered = input.includeDisabled ? all : all.filter((a) => a.enabled)
    return {
      agents: filtered.map((a) => ({
        id: a.id,
        name: a.name,
        role: a.role,
        requestedWork: a.requestedWork,
        providerId: a.providerId,
        model: a.model,
        enabled: a.enabled,
        pinnedAt: a.pinnedAt,
        lastUsedAt: a.lastUsedAt,
        useCount: a.useCount
      }))
    }
  }
})
