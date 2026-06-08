// ADR-029 §5 / M5 — Slash command registry.
//
// Slash commands are UX sugar over Ordinus's natural-language understanding:
// the LLM can do all the same things if the user just types a request, but
// slash commands give a deterministic, autocompletable shortcut for the
// common intents (turn this into a work request, schedule it, design a
// workflow, get help, look at agents).
//
// Each command has two strings:
//   - `displayPrefix`: what the user sees in the transcript after they hit
//     send. Just `/cmd <args>` — clean and short.
//   - `expandPrompt(args)`: the rich prompt the LLM actually sees. Embeds
//     explicit directives ("use the propose_work_request tool"), so Ordinus
//     reaches for the right action without us having to over-explain in the
//     knowledge pack.
//
// /help and /agent stay as conversation only — Ordinus answers from the
// knowledge pack / list_agents, no side-effect tools involved.

export type SlashCommandDefinition = {
  /** Command name without the leading slash. Lowercase, kebab-case if needed. */
  name: string
  /** Short label for the autocomplete row. */
  label: string
  /** One-line hint for the autocomplete row. */
  hint: string
  /** Tells the user what to write after the command (used as input placeholder hint). */
  argsHint: string
  /**
   * Render the prompt that's actually sent to Ordinus. The user-facing
   * transcript shows `/name <args>` unchanged (see HomeScreen's send path).
   */
  expandPrompt(args: string): string
}

export const slashCommands: ReadonlyArray<SlashCommandDefinition> = [
  {
    name: 'workboard',
    label: '/workboard',
    hint: 'Turn this into a Work Request draft for review',
    argsHint: 'short description (or refer to what we just discussed)',
    expandPrompt: (args) =>
      [
        'The user wants to turn this conversation into a Work Request and just typed `/workboard`',
        args ? `with this hint: "${args}".` : 'without extra arguments.',
        '',
        'Use the propose_work_request tool. Synthesize a short title (3–8 words) and a',
        'self-contained `request` string the planner can act on — bake in any context from',
        'our conversation, since the planner cannot see it. After the tool runs, briefly',
        'confirm to the user that the Workboard plan-review surface has been opened.'
      ].join(' ')
  },
  {
    name: 'schedule',
    label: '/schedule',
    hint: 'Create a one-shot or recurring scheduled task',
    argsHint: 'when + what (e.g. "every weekday 9am, daily summary")',
    expandPrompt: (args) =>
      [
        'The user wants to set up a schedule and just typed `/schedule`',
        args ? `with this hint: "${args}".` : 'without extra arguments.',
        '',
        'First call list_agents to pick a suitable agentId. Then confirm the agent choice,',
        'cron/runAt, timezone, and the standing prompt back to the user in one short message.',
        'If they confirm (or the request was already explicit), call create_schedule.',
        'If anything is unclear, ask one targeted question first.'
      ].join(' ')
  },
  {
    name: 'workflow',
    label: '/workflow',
    hint: 'Design a reusable visual workflow from this conversation',
    argsHint: 'short description of the flow',
    expandPrompt: (args) =>
      [
        'The user wants to design a Workflow and just typed `/workflow`',
        args ? `with this hint: "${args}".` : 'without extra arguments.',
        '',
        'Call list_agents first so you know who can be assigned. Walk through the node',
        'shape with the user in 2–3 short sentences (each node = a task, edges = ordering),',
        'then call create_workflow with the node+edge spec. Each node MUST have an',
        'assignedAgentId from list_agents. Empty title/instruction fields are fine —',
        'the user can refine in the designer.'
      ].join(' ')
  },
  {
    name: 'agent',
    label: '/agent',
    hint: "Look up or talk about the user's agents (read-only)",
    argsHint: 'question about your agents',
    expandPrompt: (args) =>
      [
        'The user typed `/agent`',
        args ? `with this question: "${args}".` : '.',
        '',
        'Use list_agents and respond conversationally. You do NOT create, modify,',
        'or delete agents — that lives in the Agents screen. If the user asks for an',
        'agent change, point them to that screen.'
      ].join(' ')
  },
  {
    name: 'help',
    label: '/help',
    hint: 'Get guidance on Ordinus features and recipes',
    argsHint: 'optional topic',
    expandPrompt: (args) =>
      [
        'The user typed `/help`',
        args ? `asking about: "${args}".` : '— offer a quick overview of what you can do.',
        '',
        'Answer from your knowledge pack (workflows, agents, schedules, connectors,',
        'recipes, actions). Be concise — link to the right screen if action is needed.'
      ].join(' ')
  }
]

const slashCommandsByName = new Map(slashCommands.map((cmd) => [cmd.name, cmd]))

export function getSlashCommand(name: string): SlashCommandDefinition | undefined {
  return slashCommandsByName.get(name.toLowerCase())
}

/**
 * Parse a raw user input. Returns the command + args if the input starts
 * with a slash and matches a registered command; null otherwise (treat as
 * plain message).
 */
export function parseSlashCommand(raw: string): {
  command: SlashCommandDefinition
  args: string
} | null {
  if (!raw.startsWith('/')) return null
  const space = raw.indexOf(' ')
  const nameRaw = space === -1 ? raw.slice(1) : raw.slice(1, space)
  const args = space === -1 ? '' : raw.slice(space + 1).trim()
  const command = getSlashCommand(nameRaw)
  if (!command) return null
  return { command, args }
}

/**
 * For autocomplete: given the current input (starting with `/`), return the
 * commands that match the typed prefix.
 */
export function filterSlashCommands(input: string): SlashCommandDefinition[] {
  if (!input.startsWith('/')) return []
  const space = input.indexOf(' ')
  // If the user has already typed past the command into args, no autocomplete.
  if (space !== -1) return []
  const prefix = input.slice(1).toLowerCase()
  return slashCommands.filter((cmd) => cmd.name.startsWith(prefix))
}
