import {
  OrchestrationPlanSchema,
  type ConversationParticipant,
  type OrchestrationPlan,
  type ProviderId
} from '@shared/contracts'

export type OrchestrationTranscriptEntry = {
  speaker: 'user' | 'agent' | 'moderator'
  agentName?: string
  content: string
}

export type RuntimeOrchestrationPlanInput = {
  providerId: ProviderId
  model: string
  workspaceRoot: string
  participants: ConversationParticipant[]
  mentionedParticipantIds: string[]
  userMessage: string
  /**
   * Sliding window of recent turns in the discussion so far (ADR-032). Absent or
   * empty on the first turn, where the moderator behaves as a pure router.
   */
  transcript?: OrchestrationTranscriptEntry[]
  /**
   * How many agent turns have already happened in this discussion. Used by the
   * moderator to respect the fixed turn cap (ADR-032).
   */
  priorAgentTurns?: number
  /**
   * Maximum agent turns allowed in this discussion (ADR-032 fixed cap).
   */
  maxAgentTurns?: number
}

export const orchestrationPlanJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    action: {
      type: 'string',
      enum: ['route', 'conclude']
    },
    assignments: {
      type: 'array',
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
    },
    summary: {
      type: ['string', 'null'],
      maxLength: 16000
    }
  },
  // Strict structured output (Codex/Claude) requires every property to be listed in
  // `required`; optionality is expressed via nullable types, not by omission.
  required: ['action', 'assignments', 'summary']
} as const

export function parseOrchestrationPlan(value: unknown): OrchestrationPlan {
  return OrchestrationPlanSchema.parse(value)
}

export function buildOrchestrationPrompt(input: RuntimeOrchestrationPlanInput): string {
  const transcript = input.transcript ?? []
  const isFirstTurn = transcript.length === 0
  const maxAgentTurns = input.maxAgentTurns ?? 4
  const priorAgentTurns = input.priorAgentTurns ?? 0
  const capReached = priorAgentTurns >= maxAgentTurns

  return `You are the Ordinus Moderator for a multi-agent advisory discussion.

This is an advisory board: the goal is to gather opinions on the user's topic, not to
execute tasks. You decide who speaks next, one speaker at a time, and when the discussion
is complete. You never perform the task yourself.

Return JSON only. Do not include markdown fences, prose, or comments.

Two possible outputs:

Always emit all three keys. Use null / [] for the branch you are not taking.

1. Route the next speaking turn to exactly one participant:
{
  "action": "route",
  "assignments": [
    { "participantId": "...", "instruction": "..." }
  ],
  "summary": null
}

2. Conclude the discussion with a synthesis of what was said:
{
  "action": "conclude",
  "assignments": [],
  "summary": "..."
}

Rules:
- Use only participantId values from the provided participants list.
- ${
    isFirstTurn
      ? 'This is the first turn. Choose the most relevant participant to open the discussion.'
      : 'Read the transcript so far. Either route ONE more turn to the participant who should respond next (e.g. to add expertise, agree, or challenge a prior point), or conclude.'
  }
- Explicit mentions are a membership list for this discussion: if mentionedParticipantIds is non-empty, only those participants may speak. Otherwise pick the participants whose roles are most relevant to the topic.
- Route to ONE participant per turn (a single assignment). Sequential turns let each speaker react to the previous ones.
- Conclude when the relevant participants have weighed in and the discussion is no longer adding new substance${
    capReached
      ? `, AND you MUST conclude now because the turn cap (${maxAgentTurns}) has been reached.`
      : `. The discussion is capped at ${maxAgentTurns} agent turns (${priorAgentTurns} used so far).`
  }
- The "summary" must be a clear synthesis a reader can act on: the question, the main points each participant made, and the resulting conclusion or recommendation.
- Keep each routing instruction focused on what that one participant should weigh in on. Tell participants to state assumptions explicitly rather than ask the user questions.
- Preserve the user's language.

Discussion input JSON:
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
    userMessage: input.userMessage,
    priorAgentTurns,
    maxAgentTurns,
    transcript
  },
  null,
  2
)}`
}
