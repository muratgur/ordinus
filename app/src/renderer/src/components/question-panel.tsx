// Shared needs_input question panel (ADR-029 origin, generalized for the
// agent-room transcript refactor).
//
// Questions stay OUT of the transcript; the panel emerges from the input area
// (project_ordinus_home_design). Originally Home-only (home-question-panel);
// now provider-agnostic: it takes the request fields directly so both the
// Ordinus surface (OrdinusPendingInputRequest) and agent rooms
// (ConversationInputRequest) can feed it.
//
// One request at a time, and within a request ONE QUESTION AT A TIME: the
// panel is a compact wizard. The user answers the current question
// (choice/boolean selections auto-advance), can step Back, and submits on the
// last step. The user can also dismiss the request entirely. Keeping a single
// question on screen keeps the panel short so it never overflows the docked
// input.

import { useMemo, useState } from 'react'
import { ArrowLeft, Check, X } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { cn } from '@renderer/lib/utils'
import type { InteractionAnswer, InteractionQuestion } from '@shared/contracts'

const CUSTOM_OPTION_VALUE = '__custom__'

type ChoiceDraft = { optionId: string | null; customText: string }
type QuestionDraft =
  | { kind: 'choice'; choice: ChoiceDraft }
  | { kind: 'text'; text: string }
  | { kind: 'boolean'; value: boolean | null }

export type QuestionPanelRequest = {
  requestId: string
  title: string
  detail?: string
  questions: InteractionQuestion[]
}

export type QuestionPanelProps = {
  request: QuestionPanelRequest | null
  busy: boolean
  /** Small accent caption next to the title, e.g. "Ordinus needs a moment". */
  accentLabel: string
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

// Whether a draft holds a complete answer for its question (used to gate
// auto-advance and the final submit).
function isAnswered(question: InteractionQuestion, draft: QuestionDraft): boolean {
  if (question.kind === 'choice' && draft.kind === 'choice') {
    const { optionId, customText } = draft.choice
    if (optionId === CUSTOM_OPTION_VALUE) return customText.trim().length > 0
    return optionId !== null
  }
  if (question.kind === 'text' && draft.kind === 'text') {
    return draft.text.trim().length > 0
  }
  if (question.kind === 'boolean' && draft.kind === 'boolean') {
    return draft.value !== null
  }
  return false
}

export function QuestionPanel({
  request,
  busy,
  accentLabel,
  onAnswer,
  onCancel
}: QuestionPanelProps): React.JSX.Element | null {
  // Keyed by request id so switching requests resets the draft.
  const [drafts, setDrafts] = useState<Record<string, QuestionDraft>>({})
  const [stepByRequest, setStepByRequest] = useState<Record<string, number>>({})

  const questionKey = useMemo(
    () => (request ? request.questions.map((q) => q.id).join('|') : ''),
    [request]
  )

  if (!request) return null

  const total = request.questions.length
  const stepIndex = Math.min(stepByRequest[request.requestId] ?? 0, total - 1)
  const currentQuestion = request.questions[stepIndex]

  const setStep = (index: number): void => {
    setStepByRequest((prev) => ({
      ...prev,
      [request.requestId]: Math.max(0, Math.min(index, total - 1))
    }))
  }

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

  const isLastStep = stepIndex === total - 1
  const currentDraft = draftFor(currentQuestion)
  const currentAnswered = isAnswered(currentQuestion, currentDraft)
  // The current step blocks forward motion only when it's required and unanswered.
  const canAdvance = currentAnswered || !currentQuestion.required

  const answers = buildAnswers()
  const canSubmit = answers !== null && !busy

  // Selecting a choice/boolean should feel like tapping through — advance to the
  // next step automatically (but never off the last one, where the user submits).
  // "Something else…" needs a typed answer, so don't jump away from it.
  const handleAutoAdvance = (draft: QuestionDraft): void => {
    if (isLastStep) return
    const advances =
      (draft.kind === 'boolean' && draft.value !== null) ||
      (draft.kind === 'choice' &&
        draft.choice.optionId !== null &&
        draft.choice.optionId !== CUSTOM_OPTION_VALUE)
    if (advances) setStep(stepIndex + 1)
  }

  return (
    <div className="border-t bg-primary/5 px-4 py-2.5">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-2" key={questionKey}>
        <div className="flex min-w-0 items-baseline justify-between gap-2">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-sm font-semibold">{request.title}</span>
            <span className="shrink-0 text-[11px] uppercase tracking-wide text-primary">
              {accentLabel}
            </span>
          </div>
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {stepIndex + 1} / {total}
          </span>
        </div>

        {/* Segmented progress: filled = visited/answered, accent = current. */}
        {total > 1 ? (
          <div className="flex gap-1">
            {request.questions.map((q, index) => {
              const answered = isAnswered(q, draftFor(q))
              return (
                <button
                  key={q.id}
                  type="button"
                  aria-label={`Question ${index + 1}`}
                  disabled={busy}
                  onClick={() => setStep(index)}
                  className={cn(
                    'h-1 flex-1 rounded-full transition-colors',
                    index === stepIndex ? 'bg-primary' : answered ? 'bg-primary/40' : 'bg-border'
                  )}
                />
              )
            })}
          </div>
        ) : (
          <div className="h-0" />
        )}

        {request.detail && stepIndex === 0 ? (
          <p className="text-xs text-muted-foreground">{request.detail}</p>
        ) : null}

        <QuestionField
          // Re-key per step so inner autoFocus / state resets cleanly.
          key={currentQuestion.id}
          question={currentQuestion}
          draft={currentDraft}
          disabled={busy}
          onChange={(draft) => setDraft(currentQuestion.id, draft)}
          onCommit={handleAutoAdvance}
        />

        <div className="flex items-center justify-between gap-2 pt-0.5">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onCancel(request.requestId)}
              disabled={busy}
            >
              <X className="size-3.5" /> Dismiss
            </Button>
            {stepIndex > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setStep(stepIndex - 1)}
                disabled={busy}
              >
                <ArrowLeft className="size-3.5" /> Back
              </Button>
            ) : null}
          </div>

          {isLastStep ? (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                if (answers) onAnswer(request.requestId, answers)
              }}
              disabled={!canSubmit}
            >
              <Check className="size-3.5" /> Continue
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setStep(stepIndex + 1)}
              disabled={busy || !canAdvance}
            >
              Next
            </Button>
          )}
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
  // Fired on a discrete selection (choice option / boolean) so the wizard can
  // auto-advance. Not fired on every keystroke for free-text inputs.
  onCommit: (draft: QuestionDraft) => void
}

function QuestionField({
  question,
  draft,
  disabled,
  onChange,
  onCommit
}: QuestionFieldProps): React.JSX.Element {
  return (
    <div className="flex max-h-[36vh] flex-col gap-1.5 overflow-y-auto">
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
          onCommit={(choice) => onCommit({ kind: 'choice', choice })}
        />
      ) : null}

      {question.kind === 'text' && draft.kind === 'text' ? (
        <Input
          autoFocus
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
                draft.value === option.value && 'border-primary bg-primary/10 text-primary'
              )}
              onClick={() => {
                onChange({ kind: 'boolean', value: option.value })
                onCommit({ kind: 'boolean', value: option.value })
              }}
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
  onCommit: (choice: ChoiceDraft) => void
}

function ChoiceField({
  question,
  choice,
  disabled,
  onChange,
  onCommit
}: ChoiceFieldProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      {question.options.map((option) => {
        const selected = choice.optionId === option.id
        return (
          <button
            key={option.id}
            type="button"
            disabled={disabled}
            onClick={() => {
              const next = { ...choice, optionId: option.id }
              onChange(next)
              onCommit(next)
            }}
            className={cn(
              'flex flex-col items-start gap-0.5 rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors',
              'hover:border-primary/60 disabled:cursor-not-allowed disabled:opacity-60',
              selected ? 'border-primary bg-primary/10' : 'border-border bg-background/60'
            )}
          >
            <span className="flex items-center gap-2 font-medium">
              {option.label}
              {question.recommendedOptionId === option.id ? (
                <span className="rounded bg-primary/15 px-1 py-px text-[9px] uppercase tracking-wide text-primary">
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
        <div className="flex flex-col gap-1">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange({ ...choice, optionId: CUSTOM_OPTION_VALUE })}
            className={cn(
              'rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors',
              'hover:border-primary/60 disabled:cursor-not-allowed disabled:opacity-60',
              choice.optionId === CUSTOM_OPTION_VALUE
                ? 'border-primary bg-primary/10'
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
