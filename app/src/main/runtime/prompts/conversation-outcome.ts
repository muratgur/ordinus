import {
  AgentTurnOutcomeSchema,
  agentTurnOutcomeContentMaxLength,
  workRunResultSummaryMaxLength,
  type AgentTurnOutcome
} from '@shared/contracts'
import { parseJsonFromCliOutput } from '../cli/output'

export const agentTurnOutcomeJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    outcome: { type: 'string', enum: ['final_response', 'needs_input'] },
    summary: { type: ['string', 'null'], maxLength: workRunResultSummaryMaxLength },
    content: { type: ['string', 'null'], maxLength: agentTurnOutcomeContentMaxLength },
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
  required: [
    'outcome',
    'summary',
    'content',
    'artifactRefs',
    'changedFiles',
    'title',
    'detail',
    'questions'
  ]
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
    const rawSummary = typeof value.summary === 'string' ? value.summary : ''
    const rawContent = typeof value.content === 'string' ? value.content : ''
    const artifacts = splitWorkspaceAndExternalPaths(normalizeStringArray(value.artifactRefs))
    const changes = splitWorkspaceAndExternalPaths(normalizeStringArray(value.changedFiles))
    const externalPaths = Array.from(new Set([...artifacts.external, ...changes.external]))
    // ADR-030: the external-writes notice is a user-facing addendum, so it is
    // appended to the summary (always shown) rather than the optional body.
    return {
      outcome: 'final_response',
      summary: appendExternalWritesNotice(rawSummary, externalPaths),
      content: rawContent,
      artifactRefs: artifacts.workspaceRelative,
      changedFiles: changes.workspaceRelative
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

const absolutePathPattern = /^(?:[a-zA-Z]:|[\\/])/

function isWorkspaceRelativePath(path: string): boolean {
  if (absolutePathPattern.test(path)) return false
  return !path.split(/[\\/]+/).some((segment) => segment === '..')
}

function splitWorkspaceAndExternalPaths(paths: string[]): {
  workspaceRelative: string[]
  external: string[]
} {
  const workspaceRelative: string[] = []
  const external: string[] = []
  for (const path of paths) {
    const trimmed = path.trim()
    if (!trimmed) continue
    if (isWorkspaceRelativePath(trimmed)) {
      workspaceRelative.push(trimmed)
    } else {
      external.push(trimmed)
    }
  }
  return { workspaceRelative, external }
}

function appendExternalWritesNotice(content: string, externalPaths: string[]): string {
  if (externalPaths.length === 0) {
    return content
  }
  const trimmed = content.trimEnd()
  const lines = externalPaths.map((path) => `- \`${path}\``).join('\n')
  const notice = `**External writes (outside the workspace):**\n${lines}`
  return trimmed ? `${trimmed}\n\n${notice}` : notice
}

function optionalStringProperty(key: string, value: unknown): Record<string, string> {
  return typeof value === 'string' && value.trim() ? { [key]: value } : {}
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

// ADR-037 — resumed sessions already hold the workspace, private-folder and
// outcome-format rules from the session's first turn, and the outcome shape
// is independently enforced by the CLI schema flags. Re-sending the full
// blocks every resumed turn wasted ~3-4k chars and pushed the variable user
// message behind a repeated prefix; a one-line pointer is enough.
// Wording note: "given at the start of this session" is deliberately
// channel-neutral. For Claude those rules live in the system prompt
// (--append-system-prompt-file); for Codex and Gemini they were part of the
// session's first user message. "First message" would point Claude at the
// wrong place.
export function buildResumeReminderInstructions(): string {
  return 'Reminder: the workspace, private-folder, and structured JSON outcome rules given at the start of this session still apply unchanged.'
}

export function buildConversationOutcomeInstructions(): string {
  return `Return JSON only. Do not wrap the JSON response in markdown fences, prose, or comments.

Your response must match exactly one of these shapes:

For a normal answer:
{
  "outcome": "final_response",
  "summary": "Concise GitHub-flavored Markdown describing what you did.",
  "content": "Optional full textual body (the produced report or analysis). Empty when the deliverable is a file.",
  "artifactRefs": ["workspace-relative/path/to/user-facing-output.pdf"],
  "changedFiles": ["workspace-relative/path/to/created-or-modified-file.ts"]
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
- "summary" is required: a concise GitHub-flavored Markdown description of what you did. It is always shown to the user and passed to any dependent work. Keep it under ${workRunResultSummaryMaxLength} characters.
- "content" is optional: the full textual body you produced (a report, an analysis, a written document) as GitHub-flavored Markdown. Put long produced text here; it lives in the app and is shown on demand. Leave it empty ("") when the result is just the summary or when the deliverable is a file.
- Do NOT write your textual result to a workspace file to get around any length limit. Long text belongs in "content", not in an extra file.
- Only write a workspace file when the output is inherently a file: an edit to an existing project file, source code, HTML, JavaScript, a PDF, a spreadsheet, an image, or another binary/format-bearing deliverable; or when the user explicitly asked for a file. Reports, analyses, plans, and summaries are not files by default.
- In "summary" and "content": use paragraph breaks, bullet lists, or numbered lists instead of dense inline prose; use fenced code blocks for code, commands, diffs, logs, or snippets; do not use raw HTML.
- Use artifactRefs for genuine user-facing file deliverables (PDFs, spreadsheets, images, exported documents).
- Newly created user-facing Markdown files should follow the workspace Markdown frontmatter and References policy.
- Use changedFiles for every file you created or modified, including artifacts.
- All file paths must be relative to the workspace root. Do not return absolute paths or paths with "..".
- Do not include a file path unless you actually created or modified that file in the workspace.`
}
