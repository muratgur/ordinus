// ADR-029 — Ordinus needs_input question panel.
//
// Unlike agent conversations (which render questions inline in the transcript),
// Ordinus surfaces clarifying questions as a panel that emerges from the input
// area (project_ordinus_home_design — questions stay OUT of the transcript;
// the panel is where the user acts). It floats just above HomeInput, mirroring
// the position of HomeConfirmationPanel so the focus path is "see questions →
// answer → keep going."
//
// One request at a time. The user answers all required questions, then submits;
// the answers become a normal user turn (in the transcript) and Ordinus
// resumes. The user can also dismiss the request entirely.

import { useMemo, useState } from 'react'
import { Check, X } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { cn } from '@renderer/lib/utils'
import type {
  InteractionAnswer,
  InteractionQuestion,
  OrdinusPendingInputRequest
} from '@shared/contracts'

const CUSTOM_OPTION_VALUE = '__custom__'

type ChoiceDraft = { optionId: string | null; customText: string }
type QuestionDraft =
  | { kind: 'choice'; choice: ChoiceDraft }
  | { kind: 'text'; text: string }
  | { kind: 'boolean'; value: boolean | null }

export type HomeQuestionPanelProps = {
  request: OrdinusPendingInputRequest | null
  busy: boolean
  onAnswer: (requestId: string, answers: InteractionAnswer[]) => void
  onCancel: (requestId: string) => void
}

function initialDraft(question: InteractionQuestion): QuestionDraft {
  if (question.kind === 'choice') {
    return {
      kind: 'choice',
      choice: { optionId: question.recommendedOptionId ?? null, customText: '' }
    }
  }
  if (question.kind === 'text') {
    return { kind: 'text', text: '' }
  }
  return { kind: 'boolean', value: null }
}

export function HomeQuestionPanel({
  request,
  busy,
  onAnswer,
  onCancel
}: HomeQuestionPanelProps): React.JSX.Element | null {
  // Keyed by request id so switching requests resets the draft.
  const [drafts, setDrafts] = useState<Record<string, QuestionDraft>>({})

  const questionKey = useMemo(
    () => (request ? request.questions.map((q) => q.id).join('|') : ''),
    [request]
  )

  if (!request) return null

  const draftFor = (question: InteractionQuestion): QuestionDraft => {
    const key = `${request.requestId}:${question.id}`
    return drafts[key] ?? initialDraft(question)
  }

  const setDraft = (questionId: string, draft: QuestionDraft): void => {
    setDrafts((prev) => ({ ...prev, [`${request.requestId}:${questionId}`]: draft }))
  }

  const buildAnswers = (): InteractionAnswer[] | null => {
    const answers: InteractionAnswer[] = []
    for (const question of request.questions) {
      const draft = draftFor(question)
      if (question.kind === 'choice' && draft.kind === 'choice') {
        const { optionId, customText } = draft.choice
        if (optionId === CUSTOM_OPTION_VALUE) {
          const text = customText.trim()
          if (!text) {
            if (question.required) return null
            continue
          }
          answers.push({ questionId: question.id, type: 'custom', text })
        } else if (optionId) {
          answers.push({ questionId: question.id, type: 'option', optionId })
        } else if (question.required) {
          return null
        }
      } else if (question.kind === 'text' && draft.kind === 'text') {
        const text = draft.text.trim()
        if (!text) {
          if (question.required) return null
          continue
        }
        answers.push({ questionId: question.id, type: 'text', text })
      } else if (question.kind === 'boolean' && draft.kind === 'boolean') {
        if (draft.value === null) {
          if (question.required) return null
          continue
        }
        answers.push({ questionId: question.id, type: 'boolean', value: draft.value })
      }
    }
    return answers
  }

  const answers = buildAnswers()
  const canSubmit = answers !== null && !busy

  return (
    <div className="border-t bg-[#ff7a18]/5 px-4 py-3">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3" key={questionKey}>
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold">{request.title}</span>
            <span className="text-[11px] uppercase tracking-wide text-[#ff7a18]">
              Ordinus needs a moment
            </span>
          </div>
          {request.detail ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{request.detail}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-4">
          {request.questions.map((question) => (
            <QuestionField
              key={question.id}
              question={question}
              draft={draftFor(question)}
              disabled={busy}
              onChange={(draft) => setDraft(question.id, draft)}
            />
          ))}
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onCancel(request.requestId)}
            disabled={busy}
          >
            <X className="size-3.5" /> Dismiss
          </Button>
          <Button
            type="button"
            size="sm"
            className="bg-[#ff7a18] text-white hover:bg-[#ff7a18]/90"
            onClick={() => {
              if (answers) onAnswer(request.requestId, answers)
            }}
            disabled={!canSubmit}
          >
            <Check className="size-3.5" /> Continue
          </Button>
        </div>
      </div>
    </div>
  )
}

type QuestionFieldProps = {
  question: InteractionQuestion
  draft: QuestionDraft
  disabled: boolean
  onChange: (draft: QuestionDraft) => void
}

function QuestionField({
  question,
  draft,
  disabled,
  onChange
}: QuestionFieldProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-1.5">
        <span className="text-sm font-medium">{question.label}</span>
        {question.required ? null : (
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            optional
          </span>
        )}
      </div>
      {question.detail ? <p className="text-xs text-muted-foreground">{question.detail}</p> : null}

      {question.kind === 'choice' && draft.kind === 'choice' ? (
        <ChoiceField
          question={question}
          choice={draft.choice}
          disabled={disabled}
          onChange={(choice) => onChange({ kind: 'choice', choice })}
        />
      ) : null}

      {question.kind === 'text' && draft.kind === 'text' ? (
        <Input
          value={draft.text}
          placeholder={question.placeholder}
          disabled={disabled}
          onChange={(event) => onChange({ kind: 'text', text: event.target.value })}
        />
      ) : null}

      {question.kind === 'boolean' && draft.kind === 'boolean' ? (
        <div className="flex gap-2">
          {[
            { value: true, label: question.trueLabel },
            { value: false, label: question.falseLabel }
          ].map((option) => (
            <Button
              key={String(option.value)}
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              className={cn(
                draft.value === option.value && 'border-[#ff7a18] bg-[#ff7a18]/10 text-[#ff7a18]'
              )}
              onClick={() => onChange({ kind: 'boolean', value: option.value })}
            >
              {option.label}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

type ChoiceFieldProps = {
  question: Extract<InteractionQuestion, { kind: 'choice' }>
  choice: ChoiceDraft
  disabled: boolean
  onChange: (choice: ChoiceDraft) => void
}

function ChoiceField({
  question,
  choice,
  disabled,
  onChange
}: ChoiceFieldProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      {question.options.map((option) => {
        const selected = choice.optionId === option.id
        return (
          <button
            key={option.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange({ ...choice, optionId: option.id })}
            className={cn(
              'flex flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left text-sm transition-colors',
              'hover:border-[#ff7a18]/60 disabled:cursor-not-allowed disabled:opacity-60',
              selected ? 'border-[#ff7a18] bg-[#ff7a18]/10' : 'border-border bg-background/60'
            )}
          >
            <span className="flex items-center gap-2 font-medium">
              {option.label}
              {question.recommendedOptionId === option.id ? (
                <span className="rounded bg-[#ff7a18]/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[#ff7a18]">
                  Recommended
                </span>
              ) : null}
            </span>
            {option.description ? (
              <span className="text-xs text-muted-foreground">{option.description}</span>
            ) : null}
          </button>
        )
      })}

      {question.allowCustom ? (
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange({ ...choice, optionId: CUSTOM_OPTION_VALUE })}
            className={cn(
              'rounded-md border px-3 py-2 text-left text-sm transition-colors',
              'hover:border-[#ff7a18]/60 disabled:cursor-not-allowed disabled:opacity-60',
              choice.optionId === CUSTOM_OPTION_VALUE
                ? 'border-[#ff7a18] bg-[#ff7a18]/10'
                : 'border-border bg-background/60'
            )}
          >
            Something else…
          </button>
          {choice.optionId === CUSTOM_OPTION_VALUE ? (
            <Input
              autoFocus
              value={choice.customText}
              placeholder="Type your answer"
              disabled={disabled}
              onChange={(event) => onChange({ ...choice, customText: event.target.value })}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
