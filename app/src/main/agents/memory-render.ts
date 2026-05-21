import type { OrdinusDatabase } from '../db/database'

const MEMORY_HEADER = '## Kalıcı tercihler'
const MEMORY_PREAMBLE =
  'The user has taught this agent the following persistent preferences through prior feedback. ' +
  'Honor them in this run unless the current instruction explicitly overrides one.'

/**
 * Compose the agent's static instructions with its learned memory rules.
 *
 * Memory rules are loaded from SQLite (active only) and appended as a clearly
 * labeled section after the base instructions. The combined text is what the
 * provider runtime will treat as the agent's system-channel context.
 *
 * If no active rules exist, the original instructions are returned unchanged.
 */
export function composeInstructionsWithMemory(
  database: OrdinusDatabase,
  agentId: string,
  baseInstructions: string
): string {
  const rules = database.listAgentMemoryRules({ agentId })
  if (rules.length === 0) {
    return baseInstructions
  }

  const renderedRules = rules.map((rule) => `- ${rule.rule}`).join('\n')
  const memorySection = `${MEMORY_HEADER}\n${MEMORY_PREAMBLE}\n\n${renderedRules}`

  const trimmedBase = baseInstructions.trimEnd()
  if (!trimmedBase) {
    return memorySection
  }

  return `${trimmedBase}\n\n${memorySection}`
}
