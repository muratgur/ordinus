// ADR-029 §6 — `memory_write` write tool.
//
// Persists a single memory entry. Upserts by (type, name): re-writing the same
// named fact updates it, so "remember my favorite editor is Helix" → later
// "actually it's Vim now" cleanly replaces rather than accumulating.
//
// This tool is `capability: 'write'` — runs WITHOUT confirmation. Two safety
// guards keep that safe:
//   1. The renderer (M8) exposes a memory panel where the user can read and
//      delete every entry. Silent writes are recoverable.
//   2. You SHOULD only call this when the user explicitly asks ("remember
//      that ...") or when you propose it in chat and they agree. Do NOT
//      auto-write from your own inferences. ADR-029 §6 explicitly rules out
//      silent auto-learning; that's a future opt-in mode.

import { z } from 'zod'
import { defineOrdinusTool } from '../types'

const InputSchema = z.object({
  /**
   * Loose taxonomy. Start with: 'user' (about the human), 'preference'
   * (how they like things done), 'project' (a thing they're working on),
   * 'decision' (a choice they made you should respect later). Other values
   * are allowed.
   */
  type: z.string().trim().min(1).max(40),
  /**
   * Short stable identifier for this fact, used as the upsert key together
   * with type. Examples: 'favorite-editor', 'preferred-tone',
   * 'project:redesign-2026'. Avoid timestamps or transient values.
   */
  name: z.string().trim().min(1).max(120),
  /**
   * The fact itself. Keep it terse — every entry rides in the system prompt
   * for every new conversation, so memory bytes = recurring prompt tokens.
   * One or two sentences is the right shape.
   */
  body: z.string().trim().min(1).max(2000)
})

const OutputSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  body: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** True if this call replaced an existing entry with the same (type, name). */
  replaced: z.boolean()
})

export const memoryWrite = defineOrdinusTool({
  manifest: {
    name: 'memory_write',
    description:
      'Persist a single Ordinus memory entry. Upserts by (type, name): writing ' +
      'the same name under the same type replaces the body rather than creating ' +
      'a duplicate. Use ONLY when the user explicitly asks you to remember ' +
      'something, or after you have proposed remembering it and they agreed. ' +
      'Do not write inferred or guessed facts — keep memory user-controlled.',
    capability: 'write'
  },
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  execute: (input, ctx) => {
    const before = ctx.database
      .listOrdinusMemory()
      .find((entry) => entry.type === input.type && entry.name === input.name)
    const written = ctx.database.writeOrdinusMemory(input)
    return {
      ...written,
      replaced: Boolean(before)
    }
  }
})
