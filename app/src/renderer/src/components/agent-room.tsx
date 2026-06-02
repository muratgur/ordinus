import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUp, Bookmark, Check, ChevronDown, ChevronRight, Loader2, Square } from 'lucide-react'
import type {
  Agent,
  ConversationDetail,
  ConversationInputRequest,
  ConversationTurn,
  InteractionAnswer,
  InteractionQuestion
} from '@shared/contracts'
import { AgentAvatar } from './agent-avatar'
import { MarkdownContent } from './markdown-content'
import { FileReferenceList } from './file-reference-list'
import { getFileReferences } from './file-reference-utils'
import { Button } from './ui/button'
import { cn } from '../lib/utils'

/**
 * The agent's 1:1 home room (ADR-027, Phase 2). A bare, single-participant chat
 * over the existing conversation engine: send/stream/cancel, inline agent
 * questions, and a collapsed per-turn "what did they do?" detail. Multi-agent
 * chrome (mentions, routing, orchestration) is intentionally absent — that
 * lives in the Conversations group surface.
 */
// A friendly user-side opener for a brand-new teammate. The agent replies in
// its own voice (persona comes from its instructions/role), which also
// establishes the room's provider session. See ADR-027 Phase 8 / ADR-018 §1.
const AUTO_GREETING_OPENER =
  'Hey! Before we dive in — quick intro: who are you, and how will you help me?'

export function AgentRoom({
  agent,
  autoGreet = false,
  onRoomChanged
}: {
  agent: Agent
  autoGreet?: boolean
  onRoomChanged?: () => void
}): React.JSX.Element {
  const [detail, setDetail] = useState<ConversationDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [pending, setPending] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [answering, setAnswering] = useState(false)
  const [rememberingId, setRememberingId] = useState('')
  const [rememberedTurnIds, setRememberedTurnIds] = useState<Set<string>>(new Set())
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const followRef = useRef(true)
  const autoGreetRef = useRef(autoGreet)
  const greetedRef = useRef(false)

  const runningTurn = useMemo(
    () => detail?.turns.find((turn) => turn.status === 'running') ?? null,
    [detail]
  )
  const pendingRequest = useMemo(
    () => detail?.inputRequests.find((request) => request.status === 'pending') ?? null,
    [detail]
  )
  const conversationId = detail?.id ?? ''
  const turnSignature = detail
    ? detail.turns.map((turn) => `${turn.id}:${turn.status}:${turn.content.length}`).join('|')
    : ''

  // Open (or lazily create) this agent's canonical room when the agent changes.
  useEffect(() => {
    let cancelled = false

    function maybeStartAutoGreeting(room: ConversationDetail): void {
      if (!autoGreetRef.current || room.turns.length > 0 || greetedRef.current) {
        return
      }

      greetedRef.current = true
      setSending(true)
      window.ordinus.conversations
        .sendTurn({ conversationId: room.id, message: AUTO_GREETING_OPENER })
        .then((greeted) => {
          if (!cancelled) {
            setDetail(greeted)
            onRoomChanged?.()
          }
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setSending(false)
        })
    }

    queueMicrotask(() => {
      if (cancelled) {
        return
      }
      setLoading(true)
      setError('')
      setDetail(null)
      setMessage('')
      setPending(null)
      followRef.current = true
      window.ordinus.conversations
        .getOrCreateRoom({ agentId: agent.id })
        .then((next) => {
          if (cancelled) return
          setDetail(next)
          onRoomChanged?.()
          maybeStartAutoGreeting(next)
        })
        .catch((openError) => {
          if (!cancelled) setError(getErrorMessage(openError, 'This room could not be opened.'))
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    })
    return () => {
      cancelled = true
    }
  }, [agent.id, onRoomChanged])

  // Stream by polling the conversation while a turn is running.
  useEffect(() => {
    if (!conversationId || !runningTurn) {
      return
    }
    const timer = window.setInterval(() => {
      window.ordinus.conversations
        .get({ conversationId })
        .then((next) => {
          setDetail(next)
          onRoomChanged?.()
        })
        .catch(() => {})
    }, 1200)
    return () => window.clearInterval(timer)
  }, [conversationId, runningTurn, onRoomChanged])

  // Keep pinned to the latest message unless the user scrolled up.
  useEffect(() => {
    if (!followRef.current) {
      return
    }
    const element = scrollRef.current
    if (element) {
      element.scrollTop = element.scrollHeight
    }
  }, [turnSignature, pending, loading])

  function handleScroll(): void {
    const element = scrollRef.current
    if (!element) {
      return
    }
    followRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80
  }

  const composerBlocked =
    !detail || Boolean(runningTurn) || Boolean(pendingRequest) || sending || !message.trim()

  async function handleSend(): Promise<void> {
    if (composerBlocked || !detail) {
      return
    }
    const text = message
    followRef.current = true
    try {
      setSending(true)
      setError('')
      setPending(text)
      setMessage('')
      const next = await window.ordinus.conversations.sendTurn({
        conversationId: detail.id,
        message: text
      })
      setPending(null)
      setDetail(next)
      onRoomChanged?.()
    } catch (sendError) {
      setPending(null)
      setMessage(text)
      setError(getErrorMessage(sendError, 'Message could not be sent.'))
    } finally {
      setSending(false)
    }
  }

  async function handleCancel(): Promise<void> {
    if (!runningTurn) {
      return
    }
    try {
      setCancelling(true)
      const next = await window.ordinus.conversations.cancelTurn({ turnId: runningTurn.id })
      setDetail(next)
      onRoomChanged?.()
    } catch (cancelError) {
      setError(getErrorMessage(cancelError, 'The turn could not be stopped.'))
    } finally {
      setCancelling(false)
    }
  }

  async function handleAnswer(answers: InteractionAnswer[]): Promise<void> {
    if (!pendingRequest) {
      return
    }
    try {
      setAnswering(true)
      setError('')
      followRef.current = true
      const next = await window.ordinus.conversations.answerInputRequest({
        requestId: pendingRequest.id,
        answers
      })
      setDetail(next)
      onRoomChanged?.()
    } catch (answerError) {
      setError(getErrorMessage(answerError, 'Your answer could not be sent.'))
    } finally {
      setAnswering(false)
    }
  }

  // Phase 3 (ADR-027): turn something you said into a standing rule the agent
  // remembers. Reuses the agent_memory store; nothing is saved without this tap.
  async function handleRemember(turnId: string, content: string): Promise<void> {
    const rule = content.trim()
    if (!rule || rememberingId || rememberedTurnIds.has(turnId)) {
      return
    }
    try {
      setRememberingId(turnId)
      setError('')
      await window.ordinus.agents.addMemory({ agentId: agent.id, rule: rule.slice(0, 2000) })
      setRememberedTurnIds((current) => new Set(current).add(turnId))
    } catch (rememberError) {
      setError(getErrorMessage(rememberError, 'Could not save that to memory.'))
    } finally {
      setRememberingId('')
    }
  }

  async function handleReveal(turnId: string, relativePath: string): Promise<void> {
    try {
      await window.ordinus.conversations.revealPath({ turnId, relativePath })
    } catch (revealError) {
      setError(getErrorMessage(revealError, 'That file could not be shown.'))
    }
  }

  if (loading) {
    return (
      <RoomCenter>
        <Loader2 className="size-4 animate-spin" />
        <span>Opening your room with {agent.name}…</span>
      </RoomCenter>
    )
  }

  if (!detail) {
    return <RoomCenter>{error || 'This room is unavailable.'}</RoomCenter>
  }

  const isEmpty = detail.turns.length === 0 && !pending

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="ordinus-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4"
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          {isEmpty ? <RoomEmptyState agent={agent} /> : null}

          {detail.turns.map((turn) => (
            <TurnBubble
              key={turn.id}
              turn={turn}
              agent={agent}
              inputRequest={turn.status === 'waiting_for_user' ? pendingRequest : null}
              answering={answering}
              remembered={rememberedTurnIds.has(turn.id)}
              remembering={rememberingId === turn.id}
              onRemember={() => void handleRemember(turn.id, turn.content)}
              onAnswer={handleAnswer}
              onReveal={(path) => void handleReveal(turn.id, path)}
            />
          ))}

          {pending ? <UserBubble content={pending} /> : null}
          {error && !pending ? <p className="px-1 text-xs text-status-attention">{error}</p> : null}
        </div>
      </div>

      <Composer
        agent={agent}
        value={message}
        running={Boolean(runningTurn)}
        cancelling={cancelling}
        blocked={composerBlocked}
        waitingForInput={Boolean(pendingRequest)}
        onChange={setMessage}
        onSend={() => void handleSend()}
        onCancel={() => void handleCancel()}
      />
    </div>
  )
}

function Composer({
  agent,
  value,
  running,
  cancelling,
  blocked,
  waitingForInput,
  onChange,
  onSend,
  onCancel
}: {
  agent: Agent
  value: string
  running: boolean
  cancelling: boolean
  blocked: boolean
  waitingForInput: boolean
  onChange: (value: string) => void
  onSend: () => void
  onCancel: () => void
}): React.JSX.Element {
  const placeholder = waitingForInput
    ? `Answer ${agent.name}'s question above to continue…`
    : `Message ${agent.name}…`

  return (
    <div className="border-t p-3">
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <textarea
          className="ordinus-scrollbar max-h-40 min-h-11 flex-1 resize-none rounded-lg border bg-card px-3 py-2.5 text-sm leading-6 text-foreground shadow-none outline-none transition-colors placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          placeholder={placeholder}
          rows={1}
          value={value}
          disabled={waitingForInput}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              if (!running) onSend()
            }
          }}
        />
        {running ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-11 shrink-0"
            aria-label="Stop"
            disabled={cancelling}
            onClick={onCancel}
          >
            {cancelling ? <Loader2 className="animate-spin" /> : <Square className="size-4" />}
          </Button>
        ) : (
          <Button
            type="button"
            size="icon"
            className="size-11 shrink-0"
            aria-label="Send"
            disabled={blocked}
            onClick={onSend}
          >
            <ArrowUp className="size-4" />
          </Button>
        )}
      </div>
    </div>
  )
}

function TurnBubble({
  turn,
  agent,
  inputRequest,
  answering,
  remembered,
  remembering,
  onRemember,
  onAnswer,
  onReveal
}: {
  turn: ConversationTurn
  agent: Agent
  inputRequest: ConversationInputRequest | null
  answering: boolean
  remembered: boolean
  remembering: boolean
  onRemember: () => void
  onAnswer: (answers: InteractionAnswer[]) => void
  onReveal: (path: string) => void
}): React.JSX.Element {
  if (turn.speaker === 'user') {
    return (
      <UserBubble
        content={turn.content}
        remembered={remembered}
        remembering={remembering}
        onRemember={onRemember}
      />
    )
  }

  const isRunning = turn.status === 'running'
  const isFailed = turn.status === 'failed'

  return (
    <>
      {turn.sessionReset ? <SessionResetNote /> : null}
      <div className="flex min-w-0 max-w-full gap-2.5">
        <AgentAvatar avatar={agent.avatar} size={28} className="mt-0.5 shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="text-xs font-semibold text-muted-foreground">{agent.name}</p>
          <div className="min-w-0 rounded-lg rounded-tl-sm border bg-surface-subtle/70 px-3.5 py-2.5 dark:bg-surface-subtle/55">
            {isRunning && turn.content.trim().length === 0 ? (
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                Thinking…
              </span>
            ) : isFailed ? (
              <p className="select-text text-sm text-status-attention [overflow-wrap:anywhere]">
                {turn.error || 'This turn failed.'}
              </p>
            ) : (
              <MarkdownContent content={turn.content} />
            )}
            {turn.truncated ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Long output was shortened for this view.
              </p>
            ) : null}
          </div>

          {inputRequest ? (
            <InlineInputRequest request={inputRequest} answering={answering} onAnswer={onAnswer} />
          ) : null}

          {turn.status === 'completed' ? <TurnDetail turn={turn} onReveal={onReveal} /> : null}
        </div>
      </div>
    </>
  )
}

function SessionResetNote(): React.JSX.Element {
  return (
    <p className="mx-auto max-w-md py-1 text-center text-xs text-muted-foreground/80">
      I might not clearly recall the details of our earlier conversation.
    </p>
  )
}

function UserBubble({
  content,
  remembered,
  remembering,
  onRemember
}: {
  content: string
  remembered?: boolean
  remembering?: boolean
  onRemember?: () => void
}): React.JSX.Element {
  return (
    <div className="group ml-auto flex w-fit max-w-[88%] flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        {onRemember && !remembered ? (
          <button
            type="button"
            aria-label="Remember this"
            title="Remember this"
            disabled={remembering}
            onClick={onRemember}
            className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-50"
          >
            {remembering ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Bookmark className="size-3.5" />
            )}
          </button>
        ) : null}
        <div className="min-w-0 rounded-lg rounded-tr-sm border border-primary/20 bg-primary-soft/70 px-3.5 py-2.5 dark:border-primary/30 dark:bg-primary-soft/45">
          <p className="min-w-0 select-text whitespace-pre-wrap break-words text-sm leading-6 text-foreground [overflow-wrap:anywhere]">
            {content}
          </p>
        </div>
      </div>
      {remembered ? (
        <span className="flex items-center gap-1 pr-1 text-[11px] text-muted-foreground">
          <Check className="size-3" /> Added to memory
        </span>
      ) : null}
    </div>
  )
}

// Collapsed "what did they do?" — files the turn touched. Bare by default;
// deeper observability stays in the Conversations surface.
function TurnDetail({
  turn,
  onReveal
}: {
  turn: ConversationTurn
  onReveal: (path: string) => void
}): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  const files = getFileReferences(turn.artifactRefs, turn.changedFiles)

  if (files.length === 0) {
    return null
  }

  return (
    <div className="ml-0.5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        {files.length} file{files.length === 1 ? '' : 's'} touched
      </button>
      {open ? (
        <div className="mt-1.5 rounded-md border bg-card p-2.5">
          <FileReferenceList files={files} onRevealPath={onReveal} />
        </div>
      ) : null}
    </div>
  )
}

function InlineInputRequest({
  request,
  answering,
  onAnswer
}: {
  request: ConversationInputRequest
  answering: boolean
  onAnswer: (answers: InteractionAnswer[]) => void
}): React.JSX.Element {
  const [drafts, setDrafts] = useState<Record<string, InteractionAnswer>>({})

  function setAnswer(answer: InteractionAnswer): void {
    setDrafts((current) => ({ ...current, [answer.questionId]: answer }))
  }

  const allAnswered = request.questions.every((question) => {
    const answer = drafts[question.id]
    if (!answer) {
      return question.required === false
    }
    if (answer.type === 'text' || answer.type === 'custom') {
      return answer.text.trim().length > 0
    }
    return true
  })

  const answers = request.questions
    .map((question) => drafts[question.id])
    .filter((answer): answer is InteractionAnswer => Boolean(answer))

  return (
    <div className="grid gap-3 rounded-lg border border-status-blocked/30 bg-status-blocked/5 p-3.5">
      <div>
        <p className="text-sm font-semibold">{request.title}</p>
        {request.detail ? (
          <p className="mt-0.5 text-xs text-muted-foreground [overflow-wrap:anywhere]">
            {request.detail}
          </p>
        ) : null}
      </div>
      {request.questions.map((question) => (
        <QuestionField
          key={question.id}
          question={question}
          answer={drafts[question.id]}
          disabled={answering}
          onSet={setAnswer}
        />
      ))}
      <div>
        <Button
          type="button"
          size="sm"
          disabled={!allAnswered || answering}
          onClick={() => onAnswer(answers)}
        >
          {answering ? <Loader2 className="animate-spin" /> : null}
          Send answer
        </Button>
      </div>
    </div>
  )
}

function QuestionField({
  question,
  answer,
  disabled,
  onSet
}: {
  question: InteractionQuestion
  answer: InteractionAnswer | undefined
  disabled: boolean
  onSet: (answer: InteractionAnswer) => void
}): React.JSX.Element {
  return (
    <div className="grid gap-1.5">
      <p className="text-sm font-medium text-foreground">{question.label}</p>
      {question.detail ? (
        <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{question.detail}</p>
      ) : null}

      {question.kind === 'text' ? (
        <textarea
          className="ordinus-scrollbar min-h-16 resize-y rounded-md border bg-card p-2.5 text-sm leading-6 text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          placeholder={question.placeholder || 'Type your answer'}
          disabled={disabled}
          value={answer?.type === 'text' ? answer.text : ''}
          onChange={(event) =>
            onSet({ questionId: question.id, type: 'text', text: event.target.value })
          }
        />
      ) : null}

      {question.kind === 'boolean' ? (
        <div className="flex gap-2">
          {[
            { value: true, label: question.trueLabel },
            { value: false, label: question.falseLabel }
          ].map((option) => (
            <OptionChip
              key={String(option.value)}
              label={option.label}
              active={answer?.type === 'boolean' && answer.value === option.value}
              disabled={disabled}
              onClick={() =>
                onSet({ questionId: question.id, type: 'boolean', value: option.value })
              }
            />
          ))}
        </div>
      ) : null}

      {question.kind === 'choice' ? (
        <div className="grid gap-2">
          <div className="flex flex-wrap gap-2">
            {question.options.map((option) => (
              <OptionChip
                key={option.id}
                label={option.label}
                hint={option.id === question.recommendedOptionId ? 'Recommended' : undefined}
                active={answer?.type === 'option' && answer.optionId === option.id}
                disabled={disabled}
                onClick={() =>
                  onSet({ questionId: question.id, type: 'option', optionId: option.id })
                }
              />
            ))}
          </div>
          {question.allowCustom ? (
            <input
              type="text"
              className="rounded-md border bg-card px-2.5 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              placeholder="Or type your own answer"
              disabled={disabled}
              value={answer?.type === 'custom' ? answer.text : ''}
              onChange={(event) =>
                onSet({ questionId: question.id, type: 'custom', text: event.target.value })
              }
            />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function OptionChip({
  label,
  hint,
  active,
  disabled,
  onClick
}: {
  label: string
  hint?: string
  active: boolean
  disabled: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50',
        active
          ? 'border-primary bg-primary-soft text-foreground'
          : 'text-muted-foreground hover:border-foreground/30 hover:text-foreground'
      )}
    >
      {label}
      {hint ? <span className="text-[10px] text-muted-foreground">· {hint}</span> : null}
    </button>
  )
}

function RoomEmptyState({ agent }: { agent: Agent }): React.JSX.Element {
  return (
    <div className="mx-auto mt-10 flex max-w-sm flex-col items-center gap-2 text-center">
      <AgentAvatar avatar={agent.avatar} size={48} />
      <p className="text-sm font-semibold">{agent.name}</p>
      {agent.role ? <p className="text-xs text-muted-foreground">{agent.role}</p> : null}
      <p className="mt-1 text-sm text-muted-foreground">
        Say hi, or hand {agent.name} a task to get started.
      </p>
    </div>
  )
}

function RoomCenter({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
      {children}
    </div>
  )
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
