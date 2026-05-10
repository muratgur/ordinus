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
            maxLength: 80
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
Do not perform the user's task.

Return JSON only. Do not include markdown fences, prose, or comments.

Output:
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

Rules:
- Use only assignedAgentId values from the available agents list.
- Create the smallest useful number of Work Items. Prefer 1 item when one agent can do the work.
- Split work only when roles, independent analysis, or sequencing make the split useful.
- Add dependencies only when one Work Item truly needs another Work Item's output before it can start.
- Do not add a final synthesis, report, summary, or review Work Item unless the user explicitly asks for one.
- If the user explicitly asks for a final report or review, represent it as a normal dependent Work Item.
- Preserve the user's language where practical.
- Write each instruction as the complete task for the assigned agent.
- expectedOutput should describe the concrete output the user can inspect.
- tempId values must be stable within this draft, such as item-1, item-2, item-3.

Planning input JSON:
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
