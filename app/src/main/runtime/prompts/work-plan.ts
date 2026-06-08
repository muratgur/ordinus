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
  requestedAgentIds?: string[]
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
Split work at capability and connector boundaries. Within a single boundary, keep the work as ONE item.

Create a separate Work Item when at least one of these objective triggers is true:
  (a) Capability boundary: the step needs a clearly different specialization than an adjacent step, and the available agents' "capabilities" describe that specialization as belonging to different agents.
  (b) Connector boundary: the step needs an external connector that a different agent has, or that no single agent covers together with the adjacent step's connector.
  (c) Parallelism: two parts have no boundary between them but can genuinely run in parallel and the user benefits from that.
  (d) Output dependency: a later step's instruction cannot be written precisely until an earlier step's concrete output exists.

Keep work as a single item when:
  - One agent's capabilities cover the whole request, even if it has several internal steps.
  - The work stays within one connector (or needs no connector at all).
  - You would only be separating "thinking" from "doing", or splitting to look more thorough.

Connectors are an optional signal, not a requirement:
  - An empty "connectors" list is neutral. Never split a request only because an agent has no connectors, and never treat a connectorless agent as less suitable.
  - When no agent has connectors, decide splitting purely from capability boundaries (a), parallelism (c), and output dependency (d).

============================================================
AGENT ASSIGNMENT
============================================================
- Use only assignedAgentId values from the available agents list.
- Match each Work Item to the agent whose "capabilities" (and, when relevant, "connectors") most directly cover the instruction; use role and requestedWork as weaker fallback signals when capabilities are sparse.
- If a step needs a specific connector, prefer an agent that has it. If none has it, still assign the closest-capability agent and note the missing connector briefly inside the instruction.
- If multiple agents could do the work, pick the most specialized one for that boundary.
- If no agent is a clean fit, still produce the plan: pick the closest match and note the mismatch briefly inside the instruction field so the agent knows.
- The user may provide preferred agent hints. Prefer those agents when they fit the work, but use another available agent when the hinted agents are clearly not suitable.

============================================================
INSTRUCTION QUALITY
============================================================
Each instruction must be:
- Self-contained: the assigned agent must be able to act on it without seeing the original user request or other items.
- Concrete on inputs: include the file paths, excerpts, parameters, or constraints the agent needs.
- Honour each agent's "extraDirectories": these are absolute paths outside the workspace that the assigned agent can read and write. When the user references a file that lives under one of those directories, use the exact absolute path as it appears (do not invent a workspace-relative path for it, and do not move the file into the workspace). If a file the user names cannot be found under the workspace or any of the assigned agent's extraDirectories, say so in the instruction instead of guessing a path.
- Goal-oriented: state what to achieve, not just what to look at ("analyze X to determine Y" beats "look at X").
- Free of planning meta-talk: do not write things like "this is part of a larger task" or "after item-2 finishes".

For references to prior work:
- Upstream textual results are delivered to the dependent agent inline at execution time (a summary and, when present, the full produced text). Do not instruct the agent to read a workspace file for an upstream textual result.
- Only tell the agent to inspect a workspace file when the upstream output is a genuine file deliverable (source code, HTML, a PDF, a spreadsheet, an image). When those referenced paths are Markdown files, tell the agent to inspect frontmatter and headings first before reading the full body.
- If the work should create a Markdown file based on upstream files, tell the assigned agent to include those sources in a final References section.

Textual results versus files:
- A textual deliverable (a report, analysis, plan, summary, or written answer) is an in-app result, not a file. Do not instruct the agent to "write a report file" or "save the analysis to a file" unless the user explicitly asked for a file.
- Only describe a file deliverable when the output is inherently a file: an edit to an existing project file, source code, HTML, JavaScript, a PDF, a spreadsheet, an image, or another binary/format-bearing artifact, or when the user explicitly asked for a file.

expectedOutput must describe the concrete result the user can inspect. For textual work this is an in-app result (e.g. "A summary of...", "A prioritized list of..."); for file work it is the file (e.g. "A patch to file X that...", "An index.html landing page that...").

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

Example 4 - capability/connector boundary split:
User request: "Bu Jira maddesini cek, icindeki alert numarasini Datadog'da incele ve bana bir inceleme raporu olustur."
Good plan: 3 items.
  - item-1: pull the Jira item and extract the alert number (agent whose capabilities/connectors cover Jira), dependsOnTempIds: [].
  - item-2: investigate that alert in Datadog (agent whose capabilities/connectors cover observability/Datadog), dependsOnTempIds: ["item-1"].
  - item-3: write the investigation report (agent whose capabilities cover report writing), dependsOnTempIds: ["item-2"].
Why: Each step crosses a connector or capability boundary, and each step's instruction needs the prior step's concrete output.
Note: If one agent's capabilities and connectors cover Jira AND Datadog AND reporting together, this becomes 1 item - the boundary, not the step count, drives the split.

============================================================
PLANNING INPUT
============================================================

${JSON.stringify(
  {
    agents: input.agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      capabilities: agent.capabilities,
      connectors: agent.connectors,
      extraDirectories: agent.extraDirectories,
      requestedWork: agent.requestedWork,
      providerId: agent.providerId,
      model: agent.model
    })),
    preferredAgentIds: input.requestedAgentIds ?? [],
    request: input.request
  },
  null,
  2
)}`
}
