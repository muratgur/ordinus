import { AgentTurnOutcomeSchema, type AgentTurnOutcome } from '@shared/contracts'
import { parseJsonFromCliOutput } from '../cli/output'

export const agentTurnOutcomeJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    outcome: { type: 'string', enum: ['final_response', 'needs_input'] },
    content: { type: 'string', maxLength: 64000 },
    title: { type: 'string', maxLength: 160 },
    detail: { type: 'string', maxLength: 1000 },
    questions: {
      type: 'array',
      minItems: 1,
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', minLength: 1, maxLength: 80 },
          label: { type: 'string', minLength: 1, maxLength: 300 },
          detail: { type: 'string', maxLength: 1000 },
          kind: { type: 'string', enum: ['choice', 'text', 'boolean'] },
          required: { type: 'boolean' },
          options: {
            type: 'array',
            minItems: 1,
            maxItems: 4,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', minLength: 1, maxLength: 80 },
                label: { type: 'string', minLength: 1, maxLength: 120 },
                description: { type: 'string', maxLength: 500 }
              },
              required: ['id', 'label']
            }
          },
          recommendedOptionId: { type: 'string', minLength: 1, maxLength: 80 },
          allowCustom: { type: 'boolean' },
          placeholder: { type: 'string', maxLength: 300 },
          trueLabel: { type: 'string', minLength: 1, maxLength: 80 },
          falseLabel: { type: 'string', minLength: 1, maxLength: 80 }
        },
        required: ['id', 'label', 'kind', 'required']
      }
    }
  },
  required: ['outcome']
} as const

export function parseAgentTurnOutcome(value: unknown): AgentTurnOutcome {
  const parsed = typeof value === 'string' ? parseJsonFromCliOutput(value) : value
  return AgentTurnOutcomeSchema.parse(parsed)
}

export function buildConversationOutcomeInstructions(): string {
  return `Return JSON only. Do not include markdown fences, prose, or comments.

Your response must match exactly one of these shapes:

For a normal answer:
{
  "outcome": "final_response",
  "content": "Your complete response to the user."
}

If you cannot continue without user input:
{
  "outcome": "needs_input",
  "title": "Short title for what you need",
  "detail": "Optional brief explanation.",
  "questions": [
    {
      "id": "stable_snake_case_id",
      "label": "Question for the user",
      "kind": "choice",
      "required": true,
      "options": [
        { "id": "option_id", "label": "Option label", "description": "Optional detail" }
      ],
      "recommendedOptionId": "option_id",
      "allowCustom": true
    }
  ]
}

Input request rules:
- Ask at most 3 questions.
- Use text questions for free-form facts
- Use choice questions only when the options are real alternatives the user can select.
- Prefer choice questions with 2 or 3 useful options when there are meaningful alternatives.
- Use 1 to 4 options for any choice question.
- Do not create placeholder choice options such as "I will write it myself"; use a text question instead.
- Set recommendedOptionId only for a substantive recommended option, not for a custom-entry placeholder.
- Set allowCustom to true unless custom answers would be unsafe.
- Ask only for information that is necessary to continue.`
}
