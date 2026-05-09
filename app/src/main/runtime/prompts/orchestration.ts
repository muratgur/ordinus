import {
  OrchestrationPlanSchema,
  type ConversationParticipant,
  type OrchestrationPlan,
  type ProviderId
} from '@shared/contracts'

export type RuntimeOrchestrationPlanInput = {
  providerId: ProviderId
  model: string
  workspaceRoot: string
  participants: ConversationParticipant[]
  mentionedParticipantIds: string[]
  userMessage: string
}

export const orchestrationPlanJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    action: {
      type: 'string',
      enum: ['route']
    },
    assignments: {
      type: 'array',
      minItems: 1,
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          participantId: {
            type: 'string',
            minLength: 1
          },
          instruction: {
            type: 'string',
            minLength: 1,
            maxLength: 16000
          }
        },
        required: ['participantId', 'instruction']
      }
    }
  },
  required: ['action', 'assignments']
} as const

export function parseOrchestrationPlan(value: unknown): OrchestrationPlan {
  return OrchestrationPlanSchema.parse(value)
}

export function buildOrchestrationPrompt(input: RuntimeOrchestrationPlanInput): string {
  return `You are the Ordinus Orchestrator.

Your job is routing only. Do not perform the user's task.
Create a routing plan for the available agents.

Return JSON only. Do not include markdown fences, prose, or comments.

Output:
{
  "action": "route",
  "assignments": [
    {
      "participantId": "...",
      "instruction": "..."
    }
  ]
}

Rules:
- Use only participantId values from the provided participants list.
- Orchestrator mode is enabled, so every user message must be routed through this plan.
- Explicit mentions are routing signals, not final targets.
- If one participant is clearly requested, route to that participant.
- If multiple participants are mentioned and the user gives one shared task, assign the same clear instruction to each relevant participant.
- If the user gives different responsibilities, create a separate assignment for each relevant participant.
- If no participant is mentioned, choose the best participant or participants from their roles.
- If the best target is ambiguous, route to all available participants with the same concise instruction.
- If the message mentions all participants, decide whether every participant needs the same instruction or role-specific instructions.
- Preserve the user's language.
- Keep each instruction focused on what that participant should do.

Routing input JSON:
${JSON.stringify(
  {
    participants: input.participants.map((participant) => ({
      participantId: participant.id,
      agentName: participant.agentName,
      agentRole: participant.agentRole,
      providerId: participant.providerId,
      model: participant.model
    })),
    mentionedParticipantIds: input.mentionedParticipantIds,
    userMessage: input.userMessage
  },
  null,
  2
)}`
}
