import { AgentTurnOutcomeSchema, type AgentTurnOutcome } from '@shared/contracts'
import { parseJsonFromCliOutput } from '../cli/output'

export const agentTurnOutcomeJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    outcome: { type: 'string', enum: ['final_response', 'needs_input'] },
    content: { type: ['string', 'null'], maxLength: 64000 },
    artifactRefs: {
      type: ['array', 'null'],
      maxItems: 64,
      items: { type: 'string', minLength: 1, maxLength: 500 }
    },
    changedFiles: {
      type: ['array', 'null'],
      maxItems: 128,
      items: { type: 'string', minLength: 1, maxLength: 500 }
    },
    title: { type: ['string', 'null'], maxLength: 160 },
    detail: { type: ['string', 'null'], maxLength: 1000 },
    questions: {
      type: ['array', 'null'],
      minItems: 1,
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', minLength: 1, maxLength: 80 },
          label: { type: 'string', minLength: 1, maxLength: 300 },
          detail: { type: ['string', 'null'], maxLength: 1000 },
          kind: { type: 'string', enum: ['choice', 'text', 'boolean'] },
          required: { type: 'boolean' },
          options: {
            type: ['array', 'null'],
            minItems: 1,
            maxItems: 4,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', minLength: 1, maxLength: 80 },
                label: { type: 'string', minLength: 1, maxLength: 120 },
                description: { type: ['string', 'null'], maxLength: 500 }
              },
              required: ['id', 'label', 'description']
            }
          },
          recommendedOptionId: { type: ['string', 'null'], maxLength: 80 },
          allowCustom: { type: ['boolean', 'null'] },
          placeholder: { type: ['string', 'null'], maxLength: 300 },
          trueLabel: { type: ['string', 'null'], maxLength: 80 },
          falseLabel: { type: ['string', 'null'], maxLength: 80 }
        },
        required: [
          'id',
          'label',
          'detail',
          'kind',
          'required',
          'options',
          'recommendedOptionId',
          'allowCustom',
          'placeholder',
          'trueLabel',
          'falseLabel'
        ]
      }
    }
  },
  required: ['outcome', 'content', 'artifactRefs', 'changedFiles', 'title', 'detail', 'questions']
} as const

export function parseAgentTurnOutcome(value: unknown): AgentTurnOutcome {
  const parsed = typeof value === 'string' ? parseJsonFromCliOutput(value) : value
  return AgentTurnOutcomeSchema.parse(normalizeAgentTurnOutcome(parsed))
}

function normalizeAgentTurnOutcome(value: unknown): unknown {
  if (!isRecord(value)) {
    return value
  }

  if (value.outcome === 'final_response') {
    return {
      outcome: 'final_response',
      content: typeof value.content === 'string' ? value.content : '',
      artifactRefs: normalizeStringArray(value.artifactRefs),
      changedFiles: normalizeStringArray(value.changedFiles)
    }
  }

  if (value.outcome !== 'needs_input') {
    return value
  }

  return {
    outcome: 'needs_input',
    title: typeof value.title === 'string' ? value.title : '',
    ...optionalStringProperty('detail', value.detail),
    questions: Array.isArray(value.questions) ? value.questions.map(normalizeQuestion) : []
  }
}

function normalizeQuestion(value: unknown): unknown {
  if (!isRecord(value)) {
    return value
  }

  const base = {
    id: value.id,
    label: value.label,
    ...optionalStringProperty('detail', value.detail),
    kind: value.kind,
    required: value.required
  }

  if (value.kind === 'choice') {
    return {
      ...base,
      options: Array.isArray(value.options) ? value.options.map(normalizeChoiceOption) : [],
      ...optionalStringProperty('recommendedOptionId', value.recommendedOptionId),
      ...(typeof value.allowCustom === 'boolean' ? { allowCustom: value.allowCustom } : {})
    }
  }

  if (value.kind === 'text') {
    return {
      ...base,
      ...optionalStringProperty('placeholder', value.placeholder)
    }
  }

  if (value.kind === 'boolean') {
    return {
      ...base,
      ...optionalStringProperty('trueLabel', value.trueLabel),
      ...optionalStringProperty('falseLabel', value.falseLabel)
    }
  }

  return value
}

function normalizeChoiceOption(value: unknown): unknown {
  if (!isRecord(value)) {
    return value
  }

  return {
    id: value.id,
    label: value.label,
    ...optionalStringProperty('description', value.description)
  }
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function optionalStringProperty(key: string, value: unknown): Record<string, string> {
  return typeof value === 'string' && value.trim() ? { [key]: value } : {}
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function buildConversationOutcomeInstructions(): string {
  return `Return JSON only. Do not wrap the JSON response in markdown fences, prose, or comments.

Your response must match exactly one of these shapes:

For a normal answer:
{
  "outcome": "final_response",
  "content": "Concise GitHub-flavored Markdown summary of the completed work.",
  "artifactRefs": ["workspace-relative/path/to/user-facing-output.md"],
  "changedFiles": ["workspace-relative/path/to/created-or-modified-file.md"]
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
- Ask only for information that is necessary to continue.

Final response rules:
- Keep content as a concise result summary, not a full copied report when files were created.
- Format content as GitHub-flavored Markdown.
- Use paragraph breaks, bullet lists, or numbered lists instead of dense inline prose when presenting multiple points.
- Use fenced code blocks for code, commands, diffs, logs, or structured snippets.
- Do not use raw HTML in content.
- Use artifactRefs for user-facing deliverables such as reports, PDFs, spreadsheets, images, or final documents.
- Newly created user-facing Markdown artifacts should follow the workspace Markdown frontmatter and References policy.
- Use changedFiles for every file you created or modified, including artifacts.
- All file paths must be relative to the workspace root. Do not return absolute paths or paths with "..".
- Do not include a file path unless you actually created or modified that file in the workspace.`
}
