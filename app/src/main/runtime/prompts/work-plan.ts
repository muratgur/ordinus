import {
  WorkboardDraftPlanSchema,
  type Agent,
  type ProviderId,
  type WorkboardDraftPlan
} from '@shared/contracts'

export type RuntimeWorkboardPlanInput = {
  providerId: ProviderId
  model: string
  workspaceRoot: string
  agents: Agent[]
  request: string
}

export const workboardDraftPlanJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: {
      type: 'string',
      minLength: 1,
      maxLength: 160
    },
    summary: {
      type: 'string',
      maxLength: 2000
    },
    items: {
      type: 'array',
      minItems: 1,
      maxItems: 16,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          tempId: {
            type: 'string',
            minLength: 1,
            maxLength: 80,
            pattern: '^item-[0-9]+$'
          },
          title: {
            type: 'string',
            minLength: 1,
            maxLength: 160
          },
          instruction: {
            type: 'string',
            minLength: 1,
            maxLength: 64000
          },
          expectedOutput: {
            type: 'string',
            minLength: 1,
            maxLength: 2000
          },
          assignedAgentId: {
            type: 'string',
            minLength: 1
          },
          dependsOnTempIds: {
            type: 'array',
            maxItems: 16,
            items: {
              type: 'string',
              minLength: 1,
              maxLength: 80
            }
          },
          priority: {
            type: 'integer',
            minimum: -100,
            maximum: 100
          }
        },
        required: [
          'tempId',
          'title',
          'instruction',
          'expectedOutput',
          'assignedAgentId',
          'dependsOnTempIds',
          'priority'
        ]
      }
    }
  },
  required: ['title', 'summary', 'items']
} as const

export function parseWorkboardDraftPlan(value: unknown): WorkboardDraftPlan {
  return WorkboardDraftPlanSchema.parse(value)
}

export function buildWorkboardPlanPrompt(input: RuntimeWorkboardPlanInput): string {
  return `You are the Ordinus Workboard planning pass.
Your job is to break the user's request into a small set of agent-owned Work Items.
Do not perform the user's task itself - only plan it.

============================================================
OUTPUT SCHEMA
============================================================
Return a single JSON object with this exact shape:

{
  "title": "...",
  "summary": "...",
  "items": [
    {
      "tempId": "item-1",
      "title": "...",
      "instruction": "...",
      "expectedOutput": "...",
      "assignedAgentId": "...",
      "dependsOnTempIds": [],
      "priority": 0
    }
  ]
}

Field notes:
- tempId: must match ^item-[0-9]+$, sequential starting at item-1, no gaps.
- dependsOnTempIds: always an array. Use [] when there are no dependencies. Never null, never omitted.
- priority: 0 = normal, 1 = should start first when no dependency forces order, -1 = lowest. Default to 0 unless you have a clear reason.

============================================================
SPLITTING PRINCIPLE (most important rule)
============================================================
Default to the SMALLEST number of Work Items that fully covers the request.

Split into multiple items ONLY when at least one of these is true:
  (a) Different agents are genuinely better suited for different parts.
  (b) Two parts can run in parallel and the user benefits from that parallelism.
  (c) A later step needs the concrete output of an earlier step before its instruction can be written precisely.

Do NOT split just to:
  - Make the plan look more thorough or structured.
  - Separate "thinking" from "doing" when one agent can do both.

============================================================
AGENT ASSIGNMENT
============================================================
- Use only assignedAgentId values from the available agents list.
- Match each Work Item to the agent whose described capabilities most directly cover the instruction.
- If multiple agents could do the work, pick the most specialized one.
- If no agent is a clean fit, still produce the plan: pick the closest match and note the mismatch briefly inside the instruction field so the agent knows.

============================================================
INSTRUCTION QUALITY
============================================================
Each instruction must be:
- Self-contained: the assigned agent must be able to act on it without seeing the original user request or other items.
- Concrete on inputs: include the file paths, excerpts, parameters, or constraints the agent needs.
- Goal-oriented: state what to achieve, not just what to look at ("analyze X to determine Y" beats "look at X").
- Free of planning meta-talk: do not write things like "this is part of a larger task" or "after item-2 finishes".

For references to prior work:
- If the planning input references prior artifacts or changed files, tell the assigned agent which paths to inspect rather than copying large prior content into the plan.
- If the continuation depends on prior text-only output with no file reference, include the relevant available excerpt directly in the instruction. Do not instruct the agent to fetch output that isn't available.

expectedOutput must describe the concrete artifact or answer the user can inspect (e.g. "A markdown summary of...", "A patch to file X that...", "A list of...").

============================================================
DEPENDENCY TEST
============================================================
Add a dependency ONLY if the dependent item's instruction cannot be written concretely right now without the predecessor's output.

Concrete test: if you can fully write both instructions at this moment, they are independent - even if they relate to the same topic or file.

============================================================
DEPENDENT ITEM INSTRUCTIONS
============================================================
When a Work Item depends on another Work Item, its instruction should still be actionable.

For dependent items:
- Do not mention tempId values as user-facing context.
- Do not write vague instructions like "continue from the previous item" or "use item-1's output".
- Instead, state what kind of upstream output the agent should use when Workboard provides it at execution time.
- If the dependent item needs a specific artifact path that is already known, include that path.
- If the artifact path or finding will only be known after the predecessor runs, describe the expected upstream output type rather than inventing a path.

Good:
"Use the upstream security review findings provided by Workboard to write a concise report that groups issues by severity and includes file references when available."

Bad:
"Use item-1 and write the report."

============================================================
OUTPUT FORMAT (strict)
============================================================
- The response must start with { and end with }.
- No leading or trailing whitespace beyond the JSON.
- No markdown fences (no \`\`\`json), no preamble like "Here is the plan:", no trailing commentary.
- Preserve the user's language (Turkish, English, etc.) in title, summary, instruction, expectedOutput.

============================================================
EXAMPLES
============================================================

Example 1 - single item, no split:
User request: "Bu Django projesindeki conflict_event tablosu icin partial index onerisi yaz."
Good plan: 1 item, assigned to the database/backend agent.
Why: One agent can do the analysis and write the recommendation. No parallelism, no role split.

Example 2 - explicit report requested:
User request: "API endpoint'lerini guvenlik acisindan incele, sonra bulgulari rapor et."
Good plan: 2 items.
  - item-1: security review (security agent), dependsOnTempIds: [].
  - item-2: write report (suitable writing/security agent), dependsOnTempIds: ["item-1"].
Why: The user explicitly asked for a report, and the report's content depends on the review's findings.

Example 3 - parallel independent work:
User request: "Frontend'de login formu yap, backend'de de auth endpoint'i yaz."
Good plan: 2 items, independent (both dependsOnTempIds: []), different agents.
Bad plan for the same request: 4 items (design, implement frontend, implement backend, integrate). This is over-split - there is no integration step the user asked for, and design is part of implementation here.

============================================================
PLANNING INPUT
============================================================

${JSON.stringify(
  {
    agents: input.agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      requestedWork: agent.requestedWork,
      providerId: agent.providerId,
      model: agent.model
    })),
    request: input.request
  },
  null,
  2
)}`
}
