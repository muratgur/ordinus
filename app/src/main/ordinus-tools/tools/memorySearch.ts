// ADR-029 §6 — `memory_search` read tool.
//
// Lists Ordinus's cross-conversation memory entries, with an optional
// substring filter against name/body. Use this when:
//   - The user references something they previously asked you to remember
//     ("you noted last week that ...")
//   - You want to check whether you already know a preference before asking
//   - The user asks "what do you remember about me/X?"
//
// Memory entries are also folded into the system prompt at session init, so
// for new conversations you already "know" them implicitly. Use this tool to
// inspect / verify within an existing conversation, or when the user wants
// to see the explicit list.

import { z } from 'zod'
import { defineOrdinusTool } from '../types'

const InputSchema = z.object({
  /** Optional substring (case-insensitive) to filter name + body. */
  query: z.string().trim().optional(),
  /** Optional type filter. Memory types are loose; common values: user, preference, project, decision. */
  type: z.string().trim().optional()
})

const EntrySchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  body: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
})

const OutputSchema = z.object({
  entries: z.array(EntrySchema),
  totalCount: z.number().int().nonnegative()
})

export const memorySearch = defineOrdinusTool({
  manifest: {
    name: 'memory_search',
    description:
      'Search Ordinus memory entries (cross-conversation persistent facts). ' +
      'Optionally filter by case-insensitive substring against name+body, and/or ' +
      'by type. Returns up to 50 entries newest-first. Use to verify what you ' +
      'already remember before asking the user to repeat themselves, or to surface ' +
      'the memory list when the user asks.',
    capability: 'read'
  },
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  execute: (input, ctx) => {
    const all = ctx.database.listOrdinusMemory()
    const sorted = [...all].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    const q = input.query?.toLowerCase()
    const matches = sorted.filter((entry) => {
      if (input.type && entry.type !== input.type) return false
      if (!q) return true
      return entry.name.toLowerCase().includes(q) || entry.body.toLowerCase().includes(q)
    })
    return {
      entries: matches.slice(0, 50),
      totalCount: matches.length
    }
  }
})
