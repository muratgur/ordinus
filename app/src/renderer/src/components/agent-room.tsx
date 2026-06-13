import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUp, Bookmark, Check, Loader2, Square } from 'lucide-react'
import { MessageSourceBadge } from '@renderer/components/message-source-badge'
import type {
  Agent,
  ConversationDetail,
  ConversationTurn,
  InteractionAnswer
} from '@shared/contracts'
import { useLiveTurnActivity } from '../hooks/use-live-turn-activity'
import { useRunInspector } from '../hooks/use-run-inspector'
import { cn } from '../lib/utils'
import { InspectGutterButton, LiveStatusRow, RunInspectorSheet } from './run-inspector-sheet'
import { AgentAvatar } from './agent-avatar'
import { CopyButton } from './copy-button'
import { MarkdownContent } from './markdown-content'
import { TurnFullResponse } from './turn-full-response'
import { FilesTouched } from './files-touched'
import { QuestionPanel } from './question-panel'
import { Button } from './ui/button'

/**
 * The agent's 1:1 home room (ADR-027, Phase 2). A bare, single-participant chat
 * over the existing conversation engine: send/stream/cancel, agent questions
 * as a panel above the composer (shared QuestionPanel), and a collapsed
 * per-turn "what did they do?" detail. Multi-agent chrome (mentions, routing,
 * orchestration) is intentionally absent — that lives in the Conversations
 * group surface.
 *
 * Rendering follows the Home transcript language (ADR-029 §8): the agent is
 * doing work, not trading chat bubbles. User messages are right-aligned soft
 * cards; agent replies are flat full-width Markdown. The agent's identity
 * (avatar, name) lives in the room chrome, not on every message. The running
 * turn renders the ADR-034 live activity line.
 */
export function AgentRoom({
  agent,
  onRoomChanged,
  composerSeed,
  onComposerSeedConsumed
}: {
  agent: Agent
  onRoomChanged?: () => void
  /** ADR-040: prefill handed over by other tabs (skill trial), consumed once. */
  composerSeed?: string
  onComposerSeedConsumed?: () => void
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

  const runningTurn = useMemo(
    () => detail?.turns.find((turn) => turn.status === 'running') ?? null,
    [detail]
  )
  // Mirror of runningTurn for the onChanged listener (which subscribes once and
  // would otherwise read a stale value) so it can defer to the 1200ms poll.
  const runningTurnRef = useRef(false)
  useEffect(() => {
    runningTurnRef.current = Boolean(runningTurn)
  }, [runningTurn])
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

  // ADR-040: consume a composer seed handed over by another tab (e.g. the
  // skill trial). One-shot — consumed immediately so a tab roundtrip does not
  // resurrect it over the user's typing.
  useEffect(() => {
    // Wait out the room-open reset (it clears the composer via a microtask);
    // consuming after loading settles keeps the seed from being clobbered.
    if (!composerSeed || loading) {
      return undefined
    }
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) {
        return
      }
      setMessage(composerSeed)
      onComposerSeedConsumed?.()
    })
    return () => {
      cancelled = true
    }
  }, [composerSeed, loading, onComposerSeedConsumed])

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

  // ADR-044: a turn started from outside the renderer (Telegram) won't show in
  // the polling effect above, because this room's `detail` has no running turn
  // to trigger it. Refetch on the conversations:changed broadcast so the
  // externally-sent message + thinking indicator (and later the reply) appear
  // live, then the running-turn poll above takes over.
  useEffect(() => {
    if (!conversationId) {
      return
    }
    return window.ordinus.conversations.onChanged((payload) => {
      if (payload.conversationId !== conversationId) {
        return
      }
      // While a turn is running the 1200ms poll already covers updates; only
      // refetch here to kick off (no running turn yet) or catch the settle,
      // so the broadcast pair per turn doesn't stack a refetch storm on the poll.
      if (runningTurnRef.current) {
        return
      }
      window.ordinus.conversations
        .get({ conversationId })
        .then((next) => {
          setDetail(next)
          onRoomChanged?.()
        })
        .catch(() => {})
    })
  }, [conversationId, onRoomChanged])

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

  // 4a (transcript refactor): a pending question no longer locks the composer —
  // the panel above it is the answer path, but a plain message stays possible,
  // mirroring Home.
  const composerBlocked = !detail || Boolean(runningTurn) || sending || !message.trim()

  // ADR-034 — live activity line for the running turn. Agent conversation
  // turns are observed (startConversationTurn), so snapshots arrive decorated
  // with this conversation's id.
  const { label: liveActivityLabel } = useLiveTurnActivity(
    conversationId || null,
    Boolean(runningTurn),
    cancelling,
    { openingLabel: `${agent.name} is thinking…` }
  )

  // ADR-036 — run inspector bottom sheet (shared turn-scoped state machine).
  // Observed runs are keyed by the conversation turn id here, so finished
  // turns resolve via openTurn(turn.id) directly.
  const inspector = useRunInspector(conversationId || null)

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

  async function handleAnswer(requestId: string, answers: InteractionAnswer[]): Promise<void> {
    try {
      setAnswering(true)
      setError('')
      followRef.current = true
      const next = await window.ordinus.conversations.answerInputRequest({
        requestId,
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

  async function handleCancelRequest(requestId: string): Promise<void> {
    try {
      setError('')
      const next = await window.ordinus.conversations.cancelInputRequest({ requestId })
      setDetail(next)
      onRoomChanged?.()
    } catch (cancelError) {
      setError(getErrorMessage(cancelError, 'The question could not be dismissed.'))
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
            // Polish pass: turns settle in with a short fade-up on mount.
            <div
              key={turn.id}
              className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-300"
            >
              <TranscriptTurn
                turn={turn}
                liveActivityLabel={turn.status === 'running' ? liveActivityLabel : null}
                remembered={rememberedTurnIds.has(turn.id)}
                remembering={rememberingId === turn.id}
                onRemember={() => void handleRemember(turn.id, turn.content)}
                onReveal={(path) => void handleReveal(turn.id, path)}
                onOpenLiveInspector={turn.status === 'running' ? inspector.openLive : undefined}
                onInspect={
                  turn.speaker !== 'user' && turn.status === 'completed'
                    ? () => void inspector.openTurn(turn.id)
                    : undefined
                }
              />
            </div>
          ))}

          {pending ? <UserMessage content={pending} /> : null}
          {error && !pending ? <p className="px-1 text-xs text-status-attention">{error}</p> : null}
        </div>
      </div>

      <QuestionPanel
        request={
          pendingRequest
            ? {
                requestId: pendingRequest.id,
                title: pendingRequest.title,
                detail: pendingRequest.detail,
                questions: pendingRequest.questions
              }
            : null
        }
        busy={answering}
        accentLabel={`${agent.name} needs a moment`}
        onAnswer={(requestId, answers) => void handleAnswer(requestId, answers)}
        onCancel={(requestId) => void handleCancelRequest(requestId)}
      />

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

      {/* ADR-036 — shared run inspector bottom sheet, turn-scoped. */}
      {inspector.open ? (
        <RunInspectorSheet
          observedRun={inspector.run}
          meta={{
            agentName: agent.name,
            agentRole: agent.role,
            providerId: inspector.run?.providerId ?? agent.providerId,
            model: inspector.run?.model ?? agent.model,
            sandbox: null,
            sessionRef: null,
            createdAt: inspector.run?.queuedAt ?? null,
            startedAt: inspector.run?.startedAt ?? null
          }}
          busy={inspector.live && Boolean(runningTurn)}
          heading="Behind the scenes"
          subheading={`How ${agent.name} ${inspector.live ? 'is working' : 'worked'} on this turn.`}
          openingLabel={`${agent.name} is thinking…`}
          onClose={inspector.close}
        />
      ) : null}
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
  // The question panel above is the primary answer path, but the composer
  // stays usable (Home parity) — the placeholder only hints at the question.
  const placeholder = waitingForInput
    ? `Answer above, or message ${agent.name}…`
    : `Message ${agent.name}…`

  return (
    <div className="border-t p-3">
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <textarea
          className="ordinus-scrollbar max-h-40 min-h-11 flex-1 resize-none rounded-lg border bg-card px-3 py-2.5 text-sm leading-6 text-foreground shadow-none outline-none transition-colors placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          placeholder={placeholder}
          rows={1}
          value={value}
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

// Transcript row (Home language): user = right-aligned soft card, agent =
// flat full-width Markdown. No avatar/name per message — identity lives in
// the room chrome.
function TranscriptTurn({
  turn,
  liveActivityLabel,
  remembered,
  remembering,
  onRemember,
  onReveal,
  onOpenLiveInspector,
  onInspect
}: {
  turn: ConversationTurn
  liveActivityLabel: string | null
  remembered: boolean
  remembering: boolean
  onRemember: () => void
  onReveal: (path: string) => void
  onOpenLiveInspector?: () => void
  onInspect?: () => void
}): React.JSX.Element {
  if (turn.speaker === 'user') {
    return (
      <UserMessage
        content={turn.content}
        source={turn.source}
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
      <div className="group relative flex min-w-0 flex-col gap-1.5">
        {onInspect ? <InspectGutterButton onClick={onInspect} /> : null}
        {/* Copy shares the inspect gutter, stacked below it when both show. */}
        {!isRunning && !isFailed && turn.content.trim().length > 0 ? (
          <CopyButton
            text={turn.content}
            label="Copy message"
            className={cn(
              'absolute -left-7 opacity-0 transition-all duration-150 group-hover:opacity-100 motion-safe:scale-90 motion-safe:group-hover:scale-100',
              onInspect ? 'top-7' : 'top-1'
            )}
            iconClassName="size-4"
          />
        ) : null}
        {isRunning && turn.content.trim().length === 0 ? (
          // ADR-034 — live activity line instead of a static "Thinking…".
          // ADR-036: clicking it opens the run inspector for this turn.
          <LiveStatusRow label={liveActivityLabel ?? 'Thinking…'} onClick={onOpenLiveInspector} />
        ) : isFailed ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <p className="select-text whitespace-pre-wrap [overflow-wrap:anywhere]">
              {turn.error || 'This turn failed.'}
            </p>
          </div>
        ) : (
          <MarkdownContent content={turn.content} />
        )}
        {turn.truncated ? (
          <p className="text-xs text-muted-foreground">Long output was shortened for this view.</p>
        ) : null}

        {turn.status === 'completed' && turn.resultContent.trim() ? (
          <TurnFullResponse content={turn.resultContent} />
        ) : null}

        {turn.status === 'completed' ? (
          <FilesTouched
            artifactRefs={turn.artifactRefs}
            changedFiles={turn.changedFiles}
            onReveal={onReveal}
          />
        ) : null}
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

// Home-language user message: right-aligned soft card (token tint, no border),
// with the hover "Remember" bookmark kept from the bubble era.
function UserMessage({
  content,
  source,
  remembered,
  remembering,
  onRemember
}: {
  content: string
  source?: string | null
  remembered?: boolean
  remembering?: boolean
  onRemember?: () => void
}): React.JSX.Element {
  return (
    <div className="group ml-auto flex w-fit max-w-[85%] flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        <CopyButton
          text={content}
          label="Copy message"
          className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
        />
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
        <p className="min-w-0 select-text whitespace-pre-wrap break-words rounded-2xl bg-primary/10 px-3.5 py-2 text-sm text-foreground/90 [overflow-wrap:anywhere]">
          {content}
        </p>
      </div>
      {remembered ? (
        <span className="flex items-center gap-1 pr-1 text-[11px] text-muted-foreground motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-left-1 motion-safe:duration-300">
          <Check className="size-3" /> Added to memory
        </span>
      ) : (
        <MessageSourceBadge source={source ?? null} />
      )}
    </div>
  )
}

// Welcome scene (ADR-038 §14): a large mascot portrait greets the user in a
// fresh room. This replaces the retired auto-sent first greeting — the
// introduction is static, and the conversation starts when the user writes.
function RoomEmptyState({ agent }: { agent: Agent }): React.JSX.Element {
  return (
    <div className="mx-auto mt-10 flex max-w-sm flex-col items-center gap-3 text-center motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500">
      <AgentAvatar avatar={agent.avatar} size={140} />
      <div>
        <p className="text-lg font-semibold tracking-tight">{agent.name}</p>
        {agent.role ? <p className="mt-0.5 text-sm text-muted-foreground">{agent.role}</p> : null}
      </div>
      <p className="text-sm text-muted-foreground">Say hi, or hand them a task to get started.</p>
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
