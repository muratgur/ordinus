import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock3,
  ClipboardList,
  FolderOpen,
  Loader2,
  MessageSquareText,
  Plus,
  Route,
  SendHorizontal,
  Square,
  UserRound,
  XCircle
} from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@renderer/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { cn } from '@renderer/lib/utils'
import type {
  Agent,
  ConversationDetail,
  ConversationInputRequest,
  ConversationListItem,
  ConversationParticipant,
  ConversationStatus,
  InteractionAnswer,
  InteractionQuestion,
  ConversationTurn,
  ConversationTurnStatus
} from '@shared/contracts'
import { appRoutePaths } from '@renderer/app/routes'

type DraftMention = {
  participantIds: string[]
  label: string
  start: number
  end: number
}

type MentionOption = {
  id: string
  label: string
  detail: string
  participantIds: string[]
}

type MentionPickerState = {
  start: number
  end: number
  query: string
}

type AnswerDraft =
  | { type: 'option'; optionId: string }
  | { type: 'custom'; text: string }
  | { type: 'text'; text: string }
  | { type: 'boolean'; value: boolean }

type RequestDrafts = Record<string, Record<string, AnswerDraft>>

type InputRequestProgress = {
  answers: InteractionAnswer[]
  answeredCount: number
  canContinue: boolean
}

export function ConversationsScreen(): React.JSX.Element {
  const [agents, setAgents] = useState<Agent[]>([])
  const [conversations, setConversations] = useState<ConversationListItem[]>([])
  const [selectedConversationId, setSelectedConversationId] = useState('')
  const [detail, setDetail] = useState<ConversationDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [draftMentions, setDraftMentions] = useState<DraftMention[]>([])
  const [sending, setSending] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [answeringRequestId, setAnsweringRequestId] = useState('')
  const [cancellingRequestId, setCancellingRequestId] = useState('')
  const [activeInputRequestId, setActiveInputRequestId] = useState('')
  const [inputDrafts, setInputDrafts] = useState<RequestDrafts>({})
  const [updatingRoutingMode, setUpdatingRoutingMode] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  const runningTurns = detail?.turns.filter((turn) => turn.status === 'running') ?? []
  const runningTurn = runningTurns[0] ?? null
  const pendingInputRequest = detail?.inputRequests.find((request) => request.status === 'pending')
  const activeInputRequest =
    detail?.inputRequests.find((request) => request.id === activeInputRequestId) ?? null
  const participant = detail?.participants[0] ?? null
  const composerBlocked =
    !detail ||
    Boolean(runningTurn) ||
    Boolean(pendingInputRequest) ||
    sending ||
    !participant ||
    !message.trim() ||
    (requiresMentionTarget(detail) && draftMentions.length === 0)
  const latestTurn = detail?.turns.at(-1)
  const latestTurnSignature = latestTurn
    ? `${detail?.id}:${latestTurn.id}:${latestTurn.status}:${latestTurn.content}`
    : detail?.id

  function updateInputDraft(requestId: string, questionId: string, draft: AnswerDraft): void {
    setInputDrafts((current) => ({
      ...current,
      [requestId]: {
        ...(current[requestId] ?? {}),
        [questionId]: draft
      }
    }))
  }

  function clearInputDraft(requestId: string): void {
    setInputDrafts((current) => {
      const remainingDrafts = { ...current }
      delete remainingDrafts[requestId]
      return remainingDrafts
    })
  }

  async function loadConversations(nextSelectedId = selectedConversationId): Promise<void> {
    const nextConversations = await window.ordinus.conversations.list()
    setConversations(nextConversations)

    const conversationId =
      nextSelectedId && nextConversations.some((conversation) => conversation.id === nextSelectedId)
        ? nextSelectedId
        : (nextConversations[0]?.id ?? '')

    setSelectedConversationId(conversationId)

    if (conversationId) {
      setDetail(await window.ordinus.conversations.get({ conversationId }))
    } else {
      setDetail(null)
    }
  }

  useEffect(() => {
    let mounted = true

    async function loadInitialState(): Promise<void> {
      try {
        setLoading(true)
        const [nextAgents, nextConversations] = await Promise.all([
          window.ordinus.agents.list(),
          window.ordinus.conversations.list()
        ])
        if (!mounted) return

        setAgents(nextAgents)
        setConversations(nextConversations)
        const conversationId = nextConversations[0]?.id ?? ''
        setSelectedConversationId(conversationId)
        setDetail(
          conversationId ? await window.ordinus.conversations.get({ conversationId }) : null
        )
        setError('')
      } catch (loadError) {
        if (!mounted) return
        setError(getErrorMessage(loadError, 'Conversations could not be loaded.'))
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    void loadInitialState()

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (!selectedConversationId || !runningTurn) {
      return
    }

    const timer = window.setInterval(() => {
      void Promise.all([
        window.ordinus.conversations.get({ conversationId: selectedConversationId }),
        window.ordinus.conversations.list()
      ]).then(([nextDetail, nextConversations]) => {
        setDetail(nextDetail)
        setConversations(nextConversations)
      })
    }, 1500)

    return () => window.clearInterval(timer)
  }, [runningTurn, selectedConversationId])

  useEffect(() => {
    if (!detail || detail.turns.length === 0) {
      return
    }

    const animationFrame = window.requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ block: 'end' })
    })

    return () => window.cancelAnimationFrame(animationFrame)
  }, [detail, latestTurnSignature])

  async function selectConversation(conversationId: string): Promise<void> {
    setMessage('')
    setDraftMentions([])
    setSelectedConversationId(conversationId)
    setDetail(await window.ordinus.conversations.get({ conversationId }))
  }

  async function handleCreateConversation(agentIds: string[], title: string): Promise<void> {
    if (agentIds.length === 0) {
      return
    }

    const nextDetail = await createConversationForAgents(agentIds, title)
    setDetail(nextDetail)
    setSelectedConversationId(nextDetail.id)
    setDraftMentions([])
    await loadConversations(nextDetail.id)
    setCreateOpen(false)
  }

  async function handleSend(): Promise<void> {
    if (composerBlocked || !detail) {
      return
    }

    try {
      setSending(true)
      setError('')
      const nextDetail = await window.ordinus.conversations.sendTurn({
        conversationId: detail.id,
        targetParticipantIds: sendsMentionTargets(detail)
          ? getDraftMentionParticipantIds(draftMentions)
          : undefined,
        message
      })
      setMessage('')
      setDraftMentions([])
      setDetail(nextDetail)
      await loadConversations(nextDetail.id)
    } catch (sendError) {
      setError(getErrorMessage(sendError, 'Message could not be sent.'))
    } finally {
      setSending(false)
    }
  }

  function handleMessageChange(nextMessage: string): void {
    setMessage(nextMessage)

    if (draftMentions.length === 0) {
      return
    }

    setDraftMentions((mentions) =>
      mentions.filter((mention) => hasIntactMention(nextMessage, mention))
    )
  }

  async function handleCancelTurns(turnIds: string[]): Promise<void> {
    if (turnIds.length === 0) {
      return
    }

    try {
      setCancelling(true)
      const details = await Promise.all(
        turnIds.map((turnId) => window.ordinus.conversations.cancelTurn({ turnId }))
      )
      const nextDetail = details.at(-1)
      if (!nextDetail) {
        return
      }

      setDetail(nextDetail)
      await loadConversations(nextDetail.id)
    } catch (cancelError) {
      setError(getErrorMessage(cancelError, 'Turn could not be cancelled.'))
    } finally {
      setCancelling(false)
    }
  }

  async function handleRevealPath(turnId: string, relativePath: string): Promise<void> {
    try {
      setError('')
      await window.ordinus.conversations.revealPath({ turnId, relativePath })
    } catch (revealError) {
      setError(getErrorMessage(revealError, 'File could not be shown.'))
    }
  }

  async function handleAnswerInputRequest(
    requestId: string,
    answers: InteractionAnswer[]
  ): Promise<void> {
    try {
      setAnsweringRequestId(requestId)
      setError('')
      const nextDetail = await window.ordinus.conversations.answerInputRequest({
        requestId,
        answers
      })
      setActiveInputRequestId('')
      clearInputDraft(requestId)
      setDetail(nextDetail)
      await loadConversations(nextDetail.id)
    } catch (answerError) {
      setError(getErrorMessage(answerError, 'Input request could not be answered.'))
    } finally {
      setAnsweringRequestId('')
    }
  }

  async function handleCancelInputRequest(requestId: string): Promise<void> {
    try {
      setCancellingRequestId(requestId)
      setError('')
      const nextDetail = await window.ordinus.conversations.cancelInputRequest({ requestId })
      setActiveInputRequestId('')
      clearInputDraft(requestId)
      setDetail(nextDetail)
      await loadConversations(nextDetail.id)
    } catch (cancelError) {
      setError(getErrorMessage(cancelError, 'Input request could not be cancelled.'))
    } finally {
      setCancellingRequestId('')
    }
  }

  async function handleRoutingModeChange(orchestrated: boolean): Promise<void> {
    if (!detail) {
      return
    }

    try {
      setUpdatingRoutingMode(true)
      setError('')
      const nextDetail = await window.ordinus.conversations.updateRoutingMode({
        conversationId: detail.id,
        routingMode: orchestrated ? 'orchestrated' : 'manual'
      })
      setDetail(nextDetail)
      await loadConversations(nextDetail.id)
    } catch (routingError) {
      setError(getErrorMessage(routingError, 'Routing mode could not be updated.'))
    } finally {
      setUpdatingRoutingMode(false)
    }
  }

  return (
    <div className="grid h-[calc(100vh-7rem)] min-h-0 gap-4 overflow-hidden py-6 xl:grid-cols-[280px_minmax(0,1fr)]">
      <ConversationList
        conversations={conversations}
        loading={loading}
        selectedConversationId={selectedConversationId}
        onCreateConversation={() => setCreateOpen(true)}
        onSelectConversation={(conversationId) => void selectConversation(conversationId)}
      />

      <main className="min-h-0 min-w-0">
        <Card className="flex h-full min-h-0 flex-col overflow-hidden">
          {error ? <InlineError message={error} /> : null}
          {detail ? (
            <>
              <ConversationHeader
                detail={detail}
                participantName={participant?.agentName ?? ''}
                runningTurns={runningTurns}
                cancelling={cancelling}
                updatingRoutingMode={updatingRoutingMode}
                onCancelTurns={(turnIds) => void handleCancelTurns(turnIds)}
                onRoutingModeChange={(orchestrated) => void handleRoutingModeChange(orchestrated)}
              />
              <ScrollArea className="min-h-0 flex-1">
                <CardContent className="grid gap-3 p-4">
                  {detail.turns.length > 0 ? (
                    detail.turns.map((turn, index) => {
                      const turnInputRequests = detail.inputRequests.filter(
                        (request) => request.turnId === turn.id
                      )

                      return (
                        <div key={turn.id} className="grid gap-3">
                          <TurnCard
                            turn={turn}
                            participantName={getTurnParticipantLabel(detail, turn, index)}
                            onRevealPath={(path) => void handleRevealPath(turn.id, path)}
                          />
                          {turnInputRequests.map((request) => (
                            <InputRequestCard
                              key={request.id}
                              request={request}
                              participantName={getParticipantName(
                                detail.participants,
                                request.participantId
                              )}
                              disabled={hasRunningTurnForParticipant(
                                detail.turns,
                                request.participantId
                              )}
                              drafts={inputDrafts[request.id] ?? {}}
                              answering={answeringRequestId === request.id}
                              cancelling={cancellingRequestId === request.id}
                              onOpen={() => setActiveInputRequestId(request.id)}
                              onCancel={() => void handleCancelInputRequest(request.id)}
                            />
                          ))}
                        </div>
                      )
                    })
                  ) : (
                    <EmptyState
                      icon={<MessageSquareText />}
                      title="No messages yet"
                      detail="Send the first request to start this agent session."
                    />
                  )}
                  <div ref={messagesEndRef} aria-hidden="true" />
                </CardContent>
              </ScrollArea>
              <Composer
                value={message}
                participants={detail.participants}
                routingMode={detail.routingMode}
                selectedMentions={draftMentions}
                blockedReason={getBlockedReason(
                  detail,
                  participant,
                  runningTurn,
                  pendingInputRequest,
                  draftMentions
                )}
                disabled={composerBlocked}
                sending={sending}
                onChange={handleMessageChange}
                onSelectMention={(mention) =>
                  setDraftMentions((mentions) => mergeDraftMention(mentions, mention))
                }
                onSend={() => void handleSend()}
              />
            </>
          ) : (
            <NoConversationState
              agents={agents}
              loading={loading}
              onCreateConversation={() => setCreateOpen(true)}
            />
          )}
        </Card>
      </main>

      <CreateConversationDialog
        agents={agents}
        open={createOpen}
        onCreateConversation={handleCreateConversation}
        onOpenChange={setCreateOpen}
      />
      {detail && activeInputRequest ? (
        <InputRequestDialog
          request={activeInputRequest}
          participantName={getParticipantName(
            detail.participants,
            activeInputRequest.participantId
          )}
          drafts={inputDrafts[activeInputRequest.id] ?? {}}
          disabled={hasRunningTurnForParticipant(detail.turns, activeInputRequest.participantId)}
          answering={answeringRequestId === activeInputRequest.id}
          cancelling={cancellingRequestId === activeInputRequest.id}
          onDraftChange={(questionId, draft) =>
            updateInputDraft(activeInputRequest.id, questionId, draft)
          }
          onAnswer={(answers) => void handleAnswerInputRequest(activeInputRequest.id, answers)}
          onCancel={() => void handleCancelInputRequest(activeInputRequest.id)}
          onOpenChange={(open) => {
            if (!open) {
              setActiveInputRequestId('')
            }
          }}
        />
      ) : null}
    </div>
  )
}

function ConversationList({
  conversations,
  loading,
  selectedConversationId,
  onCreateConversation,
  onSelectConversation
}: {
  conversations: ConversationListItem[]
  loading: boolean
  selectedConversationId: string
  onCreateConversation: () => void
  onSelectConversation: (conversationId: string) => void
}): React.JSX.Element {
  return (
    <aside className="min-h-0 min-w-0">
      <Card className="flex h-full min-h-0 flex-col overflow-hidden">
        <CardHeader className="border-b">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2">
                <MessageSquareText className="size-4 text-primary" />
                Conversations
              </CardTitle>
              <CardDescription>
                {loading
                  ? 'Loading'
                  : `${conversations.length} thread${conversations.length === 1 ? '' : 's'}`}
              </CardDescription>
            </div>
            <Button size="icon" aria-label="New conversation" onClick={onCreateConversation}>
              <Plus />
            </Button>
          </div>
        </CardHeader>
        <ScrollArea className="min-h-0 flex-1">
          <CardContent className="grid gap-2 p-3">
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                className={cn(
                  'grid min-w-0 gap-2 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  selectedConversationId === conversation.id && 'border-primary/40 bg-primary-soft'
                )}
                onClick={() => onSelectConversation(conversation.id)}
              >
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{conversation.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {conversation.agentName || 'No participant'}
                    </p>
                  </div>
                  <StatusDot status={conversation.status} />
                </div>
                <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
                  {conversation.lastPreview || 'No messages yet'}
                </p>
              </button>
            ))}

            {!loading && conversations.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-accent p-4 text-sm text-muted-foreground">
                No conversations yet.
              </div>
            ) : null}
          </CardContent>
        </ScrollArea>
      </Card>
    </aside>
  )
}

function ConversationHeader({
  detail,
  participantName,
  runningTurns,
  cancelling,
  updatingRoutingMode,
  onCancelTurns,
  onRoutingModeChange
}: {
  detail: ConversationDetail
  participantName: string
  runningTurns: ConversationTurn[]
  cancelling: boolean
  updatingRoutingMode: boolean
  onCancelTurns: (turnIds: string[]) => void
  onRoutingModeChange: (orchestrated: boolean) => void
}): React.JSX.Element {
  const orchestrated = usesOrchestrator(detail)

  return (
    <CardHeader className="border-b bg-accent/50">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <CardTitle className="truncate">{detail.title}</CardTitle>
          <CardDescription className="mt-1 flex flex-wrap items-center gap-2">
            <span className="rounded-full border bg-card px-2 py-0.5 text-xs capitalize">
              {detail.mode}
            </span>
            <span>{getParticipantSummary(detail.participants, participantName)}</span>
          </CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusPill status={detail.status} />
          {detail.participants.length > 1 ? (
            <Button
              type="button"
              variant={orchestrated ? 'default' : 'outline'}
              size="sm"
              disabled={updatingRoutingMode || detail.status === 'running'}
              title={
                orchestrated
                  ? 'Ordinus routes every message before agents run.'
                  : 'Messages go directly to mentioned agents.'
              }
              onClick={() => onRoutingModeChange(!orchestrated)}
            >
              {updatingRoutingMode ? <Loader2 className="animate-spin" /> : <Route />}
              Orchestrator
            </Button>
          ) : null}
          {runningTurns.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={cancelling}
              onClick={() => onCancelTurns(runningTurns.map((turn) => turn.id))}
            >
              {cancelling ? <Loader2 className="animate-spin" /> : <Square />}
              {runningTurns.length > 1 ? 'Stop all' : 'Stop'}
            </Button>
          ) : null}
        </div>
      </div>
    </CardHeader>
  )
}

function TurnCard({
  turn,
  participantName,
  onRevealPath
}: {
  turn: ConversationTurn
  participantName: string
  onRevealPath: (path: string) => void
}): React.JSX.Element {
  const isUser = turn.speaker === 'user'
  const Icon = isUser ? UserRound : Bot

  return (
    <article
      className={cn(
        'grid min-w-0 gap-2 rounded-lg border bg-card p-4',
        isUser && 'ml-auto w-full max-w-[86%] bg-accent/60'
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="size-4 shrink-0 text-primary" />
          <p className="truncate text-sm font-semibold">
            {isUser
              ? `You${participantName ? ` to @${participantName}` : ''}`
              : participantName || 'Agent'}
          </p>
        </div>
        {turn.status !== 'completed' ? <TurnStatus status={turn.status} /> : null}
      </div>
      {turn.status === 'running' ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Working on this turn
        </div>
      ) : turn.status === 'failed' ? (
        <p className="rounded-md border border-status-attention/30 bg-status-attention/10 px-3 py-2 text-sm text-status-attention">
          {turn.error || 'This turn failed.'}
        </p>
      ) : (
        <p className="min-w-0 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
          {turn.content}
        </p>
      )}
      {turn.truncated ? (
        <p className="text-xs text-muted-foreground">Long output was shortened for this view.</p>
      ) : null}
      {!isUser && turn.status === 'completed' ? (
        <TurnFiles turn={turn} onRevealPath={onRevealPath} />
      ) : null}
    </article>
  )
}

function TurnFiles({
  turn,
  onRevealPath
}: {
  turn: ConversationTurn
  onRevealPath: (path: string) => void
}): React.JSX.Element | null {
  const hasFiles = turn.artifactRefs.length > 0 || turn.changedFiles.length > 0

  if (!hasFiles) {
    return null
  }

  return (
    <div className="grid gap-2 border-t pt-2">
      {turn.artifactRefs.length > 0 ? (
        <TurnFileSection label="Artifacts" paths={turn.artifactRefs} onReveal={onRevealPath} />
      ) : null}
      {turn.changedFiles.length > 0 ? (
        <TurnFileSection label="Changed files" paths={turn.changedFiles} onReveal={onRevealPath} />
      ) : null}
    </div>
  )
}

function TurnFileSection({
  label,
  paths,
  onReveal
}: {
  label: string
  paths: string[]
  onReveal: (path: string) => void
}): React.JSX.Element {
  return (
    <div className="grid gap-1.5">
      <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
      <PathList paths={paths} onReveal={onReveal} />
    </div>
  )
}

function PathList({
  paths,
  onReveal
}: {
  paths: string[]
  onReveal: (path: string) => void
}): React.JSX.Element {
  return (
    <div className="grid gap-2">
      {paths.map((path) => (
        <div
          key={path}
          className="flex items-center justify-between gap-2 rounded-md border bg-card px-2 py-1.5"
        >
          <code className="min-w-0 flex-1 break-all font-mono text-xs leading-5 text-foreground">
            {path}
          </code>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            onClick={() => onReveal(path)}
          >
            <FolderOpen />
            <span className="sr-only">Show in Finder</span>
          </Button>
        </div>
      ))}
    </div>
  )
}

function InputRequestCard({
  request,
  participantName,
  disabled,
  drafts,
  answering,
  cancelling,
  onOpen,
  onCancel
}: {
  request: ConversationInputRequest
  participantName: string
  disabled: boolean
  drafts: Record<string, AnswerDraft>
  answering: boolean
  cancelling: boolean
  onOpen: () => void
  onCancel: () => void
}): React.JSX.Element {
  const progress = getInputRequestProgress(request, drafts)
  const actionDisabled = disabled || answering || cancelling

  return (
    <article className="mr-auto grid w-full max-w-[92%] gap-3 rounded-lg border border-status-blocked/30 bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 rounded-md border border-status-blocked/20 bg-status-blocked/10 p-2 text-status-blocked">
            <ClipboardList className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">{participantName || 'Agent'} needs your input</p>
            <p className="mt-1 text-sm font-medium text-foreground">{request.title}</p>
          </div>
        </div>
        <TurnStatus status={getTurnStatusForInputRequest(request.status)} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={progress.canContinue ? 'completed' : 'blocked'}>
          {progress.answeredCount}/{request.questions.length} answered
        </Badge>
        {request.detail ? (
          <span className="line-clamp-1 text-xs text-muted-foreground">{request.detail}</span>
        ) : null}
      </div>

      {request.status === 'resolved' && request.answers && request.answers.length > 0 ? (
        <AnsweredRequestSummary request={request} />
      ) : null}

      {request.status === 'pending' ? (
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" disabled={actionDisabled} onClick={onCancel}>
            {cancelling ? <Loader2 className="animate-spin" /> : <XCircle />}
            Cancel
          </Button>
          <Button type="button" disabled={actionDisabled} onClick={onOpen}>
            {answering ? <Loader2 className="animate-spin" /> : <ClipboardList />}
            {progress.canContinue ? 'Review answers' : 'Answer'}
          </Button>
        </div>
      ) : null}
    </article>
  )
}

function InputRequestDialog({
  request,
  participantName,
  drafts,
  disabled,
  answering,
  cancelling,
  onDraftChange,
  onAnswer,
  onCancel,
  onOpenChange
}: {
  request: ConversationInputRequest
  participantName: string
  drafts: Record<string, AnswerDraft>
  disabled: boolean
  answering: boolean
  cancelling: boolean
  onDraftChange: (questionId: string, draft: AnswerDraft) => void
  onAnswer: (answers: InteractionAnswer[]) => void
  onCancel: () => void
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const progress = getInputRequestProgress(request, drafts)
  const formDisabled = disabled || request.status !== 'pending' || answering || cancelling
  const actionDisabled = disabled || answering || cancelling

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0">
        <DialogHeader className="border-b px-6 py-5">
          <div className="flex items-start justify-between gap-4 pr-8">
            <div className="min-w-0">
              <DialogTitle>{participantName || 'Agent'} needs your input</DialogTitle>
              <DialogDescription className="mt-2">{request.title}</DialogDescription>
            </div>
            <Badge variant={progress.canContinue ? 'completed' : 'blocked'}>
              {progress.answeredCount}/{request.questions.length} answered
            </Badge>
          </div>
          {request.detail ? (
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{request.detail}</p>
          ) : null}
        </DialogHeader>
        <ScrollArea className="max-h-[min(680px,calc(100vh-14rem))]">
          <div className="grid gap-5 px-6 py-5">
            {request.questions.map((question, index) => (
              <QuestionInput
                key={question.id}
                index={index}
                question={question}
                draft={drafts[question.id]}
                disabled={formDisabled}
                onChange={(draft) => onDraftChange(question.id, draft)}
              />
            ))}
          </div>
        </ScrollArea>
        <DialogFooter className="border-t px-6 py-4">
          <Button type="button" variant="secondary" disabled={actionDisabled} onClick={onCancel}>
            {cancelling ? <Loader2 className="animate-spin" /> : <XCircle />}
            Cancel request
          </Button>
          <Button
            type="button"
            disabled={actionDisabled || !progress.canContinue}
            onClick={() => onAnswer(progress.answers)}
          >
            {answering ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AnsweredRequestSummary({
  request
}: {
  request: ConversationInputRequest
}): React.JSX.Element {
  const summaries = getAnsweredRequestSummaries(request)

  return (
    <div className="grid gap-1 rounded-md border bg-accent/50 px-3 py-2 text-xs leading-5 text-muted-foreground">
      {summaries.map((summary) => (
        <p key={summary.questionId} className="line-clamp-1">
          <span className="font-medium text-foreground">{summary.label}:</span> {summary.answer}
        </p>
      ))}
    </div>
  )
}

function QuestionInput({
  index,
  question,
  draft,
  disabled,
  onChange
}: {
  index: number
  question: InteractionQuestion
  draft: AnswerDraft | undefined
  disabled: boolean
  onChange: (draft: AnswerDraft) => void
}): React.JSX.Element {
  return (
    <div className="grid gap-2">
      <div>
        <p className="text-sm font-medium">
          {index + 1}. {question.label}
        </p>
        {question.detail ? (
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{question.detail}</p>
        ) : null}
      </div>

      {question.kind === 'choice' ? (
        <ChoiceQuestionInput
          question={question}
          draft={draft}
          disabled={disabled}
          onChange={onChange}
        />
      ) : question.kind === 'boolean' ? (
        <div className="flex flex-wrap gap-2">
          <OptionButton
            selected={draft?.type === 'boolean' && draft.value}
            disabled={disabled}
            onClick={() => onChange({ type: 'boolean', value: true })}
          >
            {question.trueLabel}
          </OptionButton>
          <OptionButton
            selected={draft?.type === 'boolean' && !draft.value}
            disabled={disabled}
            onClick={() => onChange({ type: 'boolean', value: false })}
          >
            {question.falseLabel}
          </OptionButton>
        </div>
      ) : (
        <textarea
          className="ordinus-scrollbar min-h-20 resize-y rounded-md border bg-card p-3 text-sm leading-6 outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          placeholder={question.placeholder || 'Type your answer'}
          value={draft?.type === 'text' ? draft.text : ''}
          disabled={disabled}
          onChange={(event) => onChange({ type: 'text', text: event.target.value })}
        />
      )}
    </div>
  )
}

function ChoiceQuestionInput({
  question,
  draft,
  disabled,
  onChange
}: {
  question: Extract<InteractionQuestion, { kind: 'choice' }>
  draft: AnswerDraft | undefined
  disabled: boolean
  onChange: (draft: AnswerDraft) => void
}): React.JSX.Element {
  const customSelected = draft?.type === 'custom'
  const singleCustomEntry = question.options.length === 1 && question.allowCustom !== false

  if (singleCustomEntry) {
    return (
      <textarea
        className="ordinus-scrollbar min-h-20 resize-y rounded-md border bg-card p-3 text-sm leading-6 outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        placeholder="Type your answer"
        value={draft?.type === 'custom' ? draft.text : ''}
        disabled={disabled}
        onChange={(event) => onChange({ type: 'custom', text: event.target.value })}
      />
    )
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        {question.options.map((option) => (
          <OptionButton
            key={option.id}
            selected={draft?.type === 'option' && draft.optionId === option.id}
            disabled={disabled}
            onClick={() => onChange({ type: 'option', optionId: option.id })}
          >
            <span>{option.label}</span>
            {question.options.length > 1 && question.recommendedOptionId === option.id ? (
              <span className="text-[11px] text-status-completed">Recommended</span>
            ) : null}
          </OptionButton>
        ))}
        {question.allowCustom !== false ? (
          <OptionButton
            selected={customSelected}
            disabled={disabled}
            onClick={() => onChange({ type: 'custom', text: '' })}
          >
            Custom
          </OptionButton>
        ) : null}
      </div>
      {customSelected ? (
        <textarea
          className="ordinus-scrollbar min-h-20 resize-y rounded-md border bg-card p-3 text-sm leading-6 outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          placeholder="Type your own answer"
          value={draft.text}
          disabled={disabled}
          onChange={(event) => onChange({ type: 'custom', text: event.target.value })}
        />
      ) : null}
    </div>
  )
}

function OptionButton({
  selected,
  disabled,
  onClick,
  children
}: {
  selected: boolean
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      className={cn(
        'inline-flex min-h-9 items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
        selected
          ? 'border-primary/40 bg-primary-soft text-foreground'
          : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground'
      )}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function Composer({
  value,
  participants,
  routingMode,
  selectedMentions,
  blockedReason,
  disabled,
  sending,
  onChange,
  onSelectMention,
  onSend
}: {
  value: string
  participants: ConversationParticipant[]
  routingMode: ConversationDetail['routingMode']
  selectedMentions: DraftMention[]
  blockedReason: string
  disabled: boolean
  sending: boolean
  onChange: (value: string) => void
  onSelectMention: (mention: DraftMention) => void
  onSend: () => void
}): React.JSX.Element {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [mentionPicker, setMentionPicker] = useState<MentionPickerState | null>(null)
  const [activeMentionIndex, setActiveMentionIndex] = useState(0)
  const mentionOptions = useMemo(
    () => getMentionOptions(participants, mentionPicker?.query ?? ''),
    [mentionPicker?.query, participants]
  )
  const showMentionPicker =
    participants.length > 1 && Boolean(mentionPicker && mentionOptions.length > 0)
  const selectedMentionIds = selectedMentions.map((mention) =>
    getMentionOptionId(mention.participantIds)
  )
  const placeholder =
    routingMode === 'orchestrated'
      ? 'Describe the work. Mentions are routing hints for Orchestrator.'
      : 'Ask this agent to inspect, explain, plan, or change something in the workspace.'

  function selectMention(
    option: MentionOption,
    range = getTextareaSelectionRange(textareaRef.current, value.length)
  ): void {
    const textarea = textareaRef.current
    const insertion = insertMention(value, option.label, range.start, range.end)

    onChange(insertion.value)
    onSelectMention({
      participantIds: option.participantIds,
      label: option.label,
      start: insertion.start,
      end: insertion.end
    })
    setMentionPicker(null)
    setActiveMentionIndex(0)

    window.requestAnimationFrame(() => {
      textarea?.focus()
      textarea?.setSelectionRange(insertion.caret, insertion.caret)
    })
  }

  function updateMentionPicker(nextValue: string, caret: number): void {
    const nextMentionPicker = getActiveMentionPicker(nextValue, caret)
    setMentionPicker(nextMentionPicker)
    setActiveMentionIndex(0)
  }

  function handleTextareaChange(event: React.ChangeEvent<HTMLTextAreaElement>): void {
    onChange(event.target.value)
    updateMentionPicker(event.target.value, event.target.selectionStart)
  }

  function handleTextareaKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (showMentionPicker && mentionPicker) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActiveMentionIndex((index) => (index + 1) % mentionOptions.length)
        return
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveMentionIndex(
          (index) => (index - 1 + mentionOptions.length) % mentionOptions.length
        )
        return
      }

      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault()
        selectMention(mentionOptions[activeMentionIndex], mentionPicker)
        return
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        setMentionPicker(null)
        return
      }
    }

    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      onSend()
    }
  }

  function updateMentionPickerFromCaret(event: React.SyntheticEvent<HTMLTextAreaElement>): void {
    updateMentionPicker(event.currentTarget.value, event.currentTarget.selectionStart)
  }

  return (
    <div className="border-t bg-card p-4">
      {blockedReason ? (
        <p className="mb-3 rounded-md border border-status-attention/30 bg-status-attention/10 px-3 py-2 text-xs text-status-attention">
          {blockedReason}
        </p>
      ) : null}
      <div className="grid gap-3">
        {participants.length > 1 ? (
          <MentionShortcutChips
            participants={participants}
            selectedMentionIds={selectedMentionIds}
            onSelect={selectMention}
          />
        ) : null}
        <div className="relative">
          {showMentionPicker ? (
            <MentionPicker
              activeIndex={activeMentionIndex}
              options={mentionOptions}
              onActiveIndexChange={setActiveMentionIndex}
              onSelect={(participant) => {
                if (mentionPicker) {
                  selectMention(participant, mentionPicker)
                }
              }}
            />
          ) : null}
          <textarea
            ref={textareaRef}
            className="ordinus-scrollbar max-h-52 min-h-28 w-full resize-y overflow-y-auto rounded-lg border bg-card p-3 text-sm leading-6 text-foreground shadow-none outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            placeholder={placeholder}
            value={value}
            onChange={handleTextareaChange}
            onKeyDown={handleTextareaKeyDown}
            onClick={updateMentionPickerFromCaret}
            onKeyUp={(event) => {
              if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                updateMentionPickerFromCaret(event)
              }
            }}
          />
        </div>
        <div className="flex justify-end">
          <Button type="button" disabled={disabled} onClick={onSend}>
            {sending ? <Loader2 className="animate-spin" /> : <SendHorizontal />}
            Send
          </Button>
        </div>
      </div>
    </div>
  )
}

function MentionShortcutChips({
  participants,
  selectedMentionIds,
  onSelect
}: {
  participants: ConversationParticipant[]
  selectedMentionIds: string[]
  onSelect: (option: MentionOption) => void
}): React.JSX.Element {
  const mentionOptions = getMentionOptions(participants, '')

  return (
    <div className="flex flex-wrap gap-2">
      {mentionOptions.map((option) => {
        const selected = selectedMentionIds.includes(option.id)

        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={selected}
            className={cn(
              'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-primary-soft hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected
                ? 'border-primary/40 bg-primary-soft text-foreground'
                : 'bg-accent text-muted-foreground'
            )}
            onMouseDown={(event) => {
              event.preventDefault()
              onSelect(option)
            }}
          >
            @{option.label}
          </button>
        )
      })}
    </div>
  )
}

function MentionPicker({
  activeIndex,
  options,
  onActiveIndexChange,
  onSelect
}: {
  activeIndex: number
  options: MentionOption[]
  onActiveIndexChange: (index: number) => void
  onSelect: (option: MentionOption) => void
}): React.JSX.Element {
  return (
    <div className="absolute bottom-full left-0 z-10 mb-2 w-full max-w-md overflow-hidden rounded-lg border bg-card shadow-lg">
      <div className="max-h-56 overflow-y-auto p-1">
        {options.map((option, index) => (
          <button
            key={option.id}
            type="button"
            className={cn(
              'grid w-full min-w-0 gap-1 rounded-md px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none',
              index === activeIndex ? 'bg-primary-soft' : 'hover:bg-accent'
            )}
            onMouseEnter={() => onActiveIndexChange(index)}
            onMouseDown={(event) => {
              event.preventDefault()
              onSelect(option)
            }}
          >
            <span className="truncate font-medium">@{option.label}</span>
            <span className="line-clamp-1 text-xs text-muted-foreground">{option.detail}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function CreateConversationDialog({
  agents,
  open,
  onCreateConversation,
  onOpenChange
}: {
  agents: Agent[]
  open: boolean
  onCreateConversation: (agentIds: string[], title: string) => Promise<void>
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const enabledAgents = useMemo(() => agents.filter((agent) => agent.enabled), [agents])
  const [agentIds, setAgentIds] = useState<string[]>([])
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const selectedAgentIds = getSelectedAgentIds(agentIds, enabledAgents)

  function handleOpenChange(nextOpen: boolean): void {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      setAgentIds([])
      setTitle('')
      setError('')
    }
  }

  async function handleCreate(): Promise<void> {
    if (selectedAgentIds.length === 0 || saving) return

    try {
      setSaving(true)
      setError('')
      await onCreateConversation(selectedAgentIds, title)
      setAgentIds([])
      setTitle('')
    } catch (createError) {
      setError(getErrorMessage(createError, 'Conversation could not be created.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New conversation</DialogTitle>
          <DialogDescription>
            Start a session-backed conversation with one or more agents.
          </DialogDescription>
        </DialogHeader>
        {enabledAgents.length > 0 ? (
          <div className="grid gap-3">
            <div className="grid gap-2">
              <span className="text-xs font-medium text-muted-foreground">Agents</span>
              <div className="grid max-h-64 gap-2 overflow-y-auto rounded-lg border bg-card p-2">
                {enabledAgents.map((agent) => {
                  const selected = selectedAgentIds.includes(agent.id)
                  return (
                    <button
                      key={agent.id}
                      type="button"
                      className={cn(
                        'grid min-w-0 gap-1 rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        selected ? 'border-primary/40 bg-primary-soft' : 'bg-card'
                      )}
                      onClick={() => setAgentIds(toggleAgentId(selectedAgentIds, agent.id))}
                    >
                      <span className="truncate font-medium">{agent.name}</span>
                      <span className="line-clamp-1 text-xs text-muted-foreground">
                        {agent.role}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
            <label className="grid gap-2">
              <span className="text-xs font-medium text-muted-foreground">Title</span>
              <Input
                placeholder="Defaults to the selected agents"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            {error ? <InlineError message={error} /> : null}
          </div>
        ) : (
          <EmptyState
            icon={<Bot />}
            title="No enabled agents"
            detail="Create or enable an agent before starting a conversation."
          />
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            disabled={saving}
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={selectedAgentIds.length === 0 || enabledAgents.length === 0 || saving}
            onClick={() => void handleCreate()}
          >
            {saving ? <Loader2 className="animate-spin" /> : <Plus />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function NoConversationState({
  agents,
  loading,
  onCreateConversation
}: {
  agents: Agent[]
  loading: boolean
  onCreateConversation: () => void
}): React.JSX.Element {
  if (loading) {
    return (
      <div className="grid flex-1 place-items-center p-6">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="grid flex-1 place-items-center p-6">
      <div className="grid max-w-md gap-4 text-center">
        <span className="mx-auto text-muted-foreground [&_svg]:size-8">
          <MessageSquareText />
        </span>
        <div className="grid gap-2">
          <p className="text-base font-semibold">
            {agents.length > 0 ? 'Start a conversation with an agent' : 'No agents yet'}
          </p>
          <p className="text-sm leading-6 text-muted-foreground">
            {agents.length > 0
              ? 'Mention an agent by name when a conversation has multiple participants.'
              : 'Create an agent before starting a session-backed conversation.'}
          </p>
        </div>
        {agents.length > 0 ? (
          <Button type="button" className="mx-auto" onClick={onCreateConversation}>
            <Plus />
            New conversation
          </Button>
        ) : (
          <Button asChild className="mx-auto">
            <Link to={appRoutePaths.agents}>Create agent</Link>
          </Button>
        )}
      </div>
    </div>
  )
}

function EmptyState({
  icon,
  title,
  detail
}: {
  icon: React.ReactNode
  title: string
  detail: string
}): React.JSX.Element {
  return (
    <div className="grid min-h-48 place-items-center rounded-lg border border-dashed bg-accent p-6 text-center">
      <div className="grid max-w-sm gap-2">
        <span className="mx-auto text-muted-foreground [&_svg]:size-7">{icon}</span>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground">{detail}</p>
      </div>
    </div>
  )
}

function InlineError({ message }: { message: string }): React.JSX.Element {
  return (
    <p className="m-4 mb-0 rounded-md border border-status-attention/30 bg-status-attention/10 px-3 py-2 text-xs text-status-attention">
      {message}
    </p>
  )
}

function StatusDot({ status }: { status: ConversationStatus }): React.JSX.Element {
  return (
    <span
      className={cn(
        'mt-1 size-2.5 shrink-0 rounded-full',
        status === 'active' && 'bg-status-completed',
        status === 'running' && 'bg-status-running',
        status === 'waiting_for_user' && 'bg-status-blocked',
        status === 'failed' && 'bg-status-failed',
        status === 'cancelled' && 'bg-status-planned'
      )}
    />
  )
}

function StatusPill({ status }: { status: ConversationStatus }): React.JSX.Element {
  return (
    <span className="rounded-full border bg-card px-2.5 py-1 text-xs font-medium capitalize text-muted-foreground">
      {formatStatusLabel(status)}
    </span>
  )
}

function TurnStatus({ status }: { status: ConversationTurnStatus }): React.JSX.Element {
  const Icon =
    status === 'running'
      ? Clock3
      : status === 'completed'
        ? CheckCircle2
        : status === 'cancelled'
          ? XCircle
          : status === 'waiting_for_user'
            ? AlertTriangle
            : AlertTriangle

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-xs font-medium capitalize',
        status === 'running' && 'text-status-running',
        status === 'waiting_for_user' && 'text-status-blocked',
        status === 'completed' && 'text-status-completed',
        status === 'failed' && 'text-status-failed',
        status === 'cancelled' && 'text-muted-foreground'
      )}
    >
      <Icon className="size-3.5" />
      {formatStatusLabel(status)}
    </span>
  )
}

function getBlockedReason(
  detail: ConversationDetail,
  participant: ConversationDetail['participants'][number] | null,
  runningTurn: ConversationTurn | null,
  pendingInputRequest: ConversationInputRequest | undefined,
  draftMentions: DraftMention[]
): string {
  if (runningTurn) {
    return 'This conversation is running. Stop it or wait for the agent response.'
  }

  if (pendingInputRequest) {
    return 'This conversation is waiting for your input. Answer or cancel the request to continue.'
  }

  if (!participant) {
    return 'This conversation has no agent participant.'
  }

  if (detail.status === 'cancelled') {
    return 'This conversation was cancelled. Send a new message to continue.'
  }

  if (requiresMentionTarget(detail) && draftMentions.length === 0) {
    return 'Choose a participant mention before sending.'
  }

  return ''
}

function formatStatusLabel(status: string): string {
  return status === 'waiting_for_user' ? 'waiting for user' : status
}

function hasRunningTurnForParticipant(turns: ConversationTurn[], participantId: string): boolean {
  return turns.some((turn) => turn.participantId === participantId && turn.status === 'running')
}

function getTurnStatusForInputRequest(
  status: ConversationInputRequest['status']
): ConversationTurnStatus {
  if (status === 'pending') {
    return 'waiting_for_user'
  }

  return status === 'cancelled' ? 'cancelled' : 'completed'
}

function getInputRequestProgress(
  request: ConversationInputRequest,
  drafts: Record<string, AnswerDraft>
): InputRequestProgress {
  const answers = getInteractionAnswers(request.questions, drafts)

  return {
    answers,
    answeredCount: answers.length,
    canContinue:
      request.status === 'pending' &&
      request.questions.every((question) => hasAnswer(question, drafts))
  }
}

function getInteractionAnswers(
  questions: InteractionQuestion[],
  drafts: Record<string, AnswerDraft>
): InteractionAnswer[] {
  return questions
    .map((question) => {
      const draft = drafts[question.id]
      if (!draft) return null

      if (draft.type === 'option') {
        return { questionId: question.id, type: 'option', optionId: draft.optionId } as const
      }

      if (draft.type === 'custom' && draft.text.trim()) {
        return { questionId: question.id, type: 'custom', text: draft.text.trim() } as const
      }

      if (draft.type === 'text' && draft.text.trim()) {
        return { questionId: question.id, type: 'text', text: draft.text.trim() } as const
      }

      if (draft.type === 'boolean') {
        return { questionId: question.id, type: 'boolean', value: draft.value } as const
      }

      return null
    })
    .filter((answer): answer is InteractionAnswer => Boolean(answer))
}

function hasAnswer(question: InteractionQuestion, drafts: Record<string, AnswerDraft>): boolean {
  if (!question.required) {
    return true
  }

  const draft = drafts[question.id]
  if (!draft) {
    return false
  }

  if (draft.type === 'custom' || draft.type === 'text') {
    return Boolean(draft.text.trim())
  }

  return true
}

function formatInteractionAnswer(question: InteractionQuestion, answer: InteractionAnswer): string {
  if (answer.type === 'option' && question.kind === 'choice') {
    return (
      question.options.find((option) => option.id === answer.optionId)?.label ?? answer.optionId
    )
  }

  if (answer.type === 'custom' || answer.type === 'text') {
    return answer.text
  }

  if (answer.type === 'boolean' && question.kind === 'boolean') {
    return answer.value ? question.trueLabel : question.falseLabel
  }

  return ''
}

function getAnsweredRequestSummaries(
  request: ConversationInputRequest
): Array<{ questionId: string; label: string; answer: string }> {
  return (request.answers ?? []).slice(0, 3).flatMap((answer) => {
    const question = request.questions.find((item) => item.id === answer.questionId)
    if (!question) {
      return []
    }

    return [
      {
        questionId: answer.questionId,
        label: question.label,
        answer: formatInteractionAnswer(question, answer)
      }
    ]
  })
}

function usesOrchestrator(detail: ConversationDetail): boolean {
  return detail.routingMode === 'orchestrated'
}

function requiresMentionTarget(detail: ConversationDetail): boolean {
  return detail.routingMode === 'manual' && detail.mode === 'manual'
}

function sendsMentionTargets(detail: ConversationDetail): boolean {
  return detail.mode === 'manual' || usesOrchestrator(detail)
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function createConversationForAgents(
  agentIds: string[],
  title: string
): Promise<ConversationDetail> {
  const trimmedTitle = title.trim() || undefined
  const [firstAgentId] = agentIds

  if (!firstAgentId) {
    throw new Error('Choose an agent before starting a conversation.')
  }

  if (agentIds.length > 1) {
    return window.ordinus.conversations.createManual({
      agentIds,
      title: trimmedTitle
    })
  }

  return window.ordinus.conversations.createDirect({
    agentId: firstAgentId,
    title: trimmedTitle
  })
}

function getSelectedAgentIds(selectedAgentIds: string[], enabledAgents: Agent[]): string[] {
  if (selectedAgentIds.length > 0) {
    return selectedAgentIds
  }

  const [firstAgent] = enabledAgents
  return firstAgent ? [firstAgent.id] : []
}

function getParticipantSummary(
  participants: ConversationParticipant[],
  fallbackName: string
): string {
  if (participants.length <= 1) {
    return fallbackName
  }

  return `${participants.length} agents`
}

function getTurnParticipantLabel(
  detail: ConversationDetail,
  turn: ConversationTurn,
  turnIndex: number
): string {
  if (turn.speaker === 'agent') {
    return getParticipantName(detail.participants, turn.participantId)
  }

  const targetParticipantIds = getAgentTurnTargetsAfterUserTurn(detail.turns, turnIndex)
  return getMentionTargetLabel(detail.participants, targetParticipantIds, turn.participantId)
}

function getMentionTargetLabel(
  participants: ConversationParticipant[],
  targetParticipantIds: string[],
  fallbackParticipantId: string
): string {
  if (targetParticipantIds.length === participants.length && participants.length > 1) {
    return 'all'
  }

  if (targetParticipantIds.length > 1) {
    return targetParticipantIds
      .map((participantId) => getParticipantName(participants, participantId))
      .filter(Boolean)
      .join(', ')
  }

  return getParticipantName(participants, targetParticipantIds[0] ?? fallbackParticipantId)
}

function getAgentTurnTargetsAfterUserTurn(
  turns: ConversationTurn[],
  userTurnIndex: number
): string[] {
  const targetParticipantIds: string[] = []

  for (const turn of turns.slice(userTurnIndex + 1)) {
    if (turn.speaker === 'user') {
      break
    }

    targetParticipantIds.push(turn.participantId)
  }

  return uniqueValues(targetParticipantIds)
}

function getParticipantName(
  participants: ConversationParticipant[],
  participantId: string
): string {
  return participants.find((participant) => participant.id === participantId)?.agentName ?? ''
}

function getMentionOptions(
  participants: ConversationParticipant[],
  query: string
): MentionOption[] {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const options = [
    getAllMentionOption(participants),
    ...participants.map(getParticipantMentionOption)
  ]

  if (!normalizedQuery) {
    return options
  }

  return options.filter((option) => option.label.toLocaleLowerCase().includes(normalizedQuery))
}

function getAllMentionOption(participants: ConversationParticipant[]): MentionOption {
  return {
    id: 'all',
    label: 'all',
    detail: `${participants.length} agents`,
    participantIds: participants.map((participant) => participant.id)
  }
}

function getParticipantMentionOption(participant: ConversationParticipant): MentionOption {
  return {
    id: participant.id,
    label: participant.agentName,
    detail: participant.agentRole,
    participantIds: [participant.id]
  }
}

function getMentionOptionId(participantIds: string[]): string {
  return participantIds.length > 1 ? 'all' : (participantIds[0] ?? '')
}

function getDraftMentionParticipantIds(mentions: DraftMention[]): string[] {
  return uniqueValues(mentions.flatMap((mention) => mention.participantIds))
}

function mergeDraftMention(mentions: DraftMention[], nextMention: DraftMention): DraftMention[] {
  if (isBroadcastMention(nextMention)) {
    return [nextMention]
  }

  const nextMentionOptionId = getMentionOptionId(nextMention.participantIds)

  return [
    ...mentions.filter(
      (mention) =>
        !isBroadcastMention(mention) &&
        getMentionOptionId(mention.participantIds) !== nextMentionOptionId
    ),
    nextMention
  ]
}

function isBroadcastMention(mention: DraftMention): boolean {
  return mention.participantIds.length > 1
}

function getActiveMentionPicker(value: string, caret: number): MentionPickerState | null {
  const mentionStart = value.lastIndexOf('@', caret - 1)

  if (mentionStart < 0 || !isMentionStart(value, mentionStart)) {
    return null
  }

  const query = value.slice(mentionStart + 1, caret)

  if (/\s/.test(query) || query.length > 80) {
    return null
  }

  return {
    start: mentionStart,
    end: caret,
    query
  }
}

function isMentionStart(value: string, index: number): boolean {
  return index === 0 || /\s/.test(value[index - 1])
}

function getTextareaSelectionRange(
  textarea: HTMLTextAreaElement | null,
  fallbackPosition: number
): { start: number; end: number } {
  const start = textarea?.selectionStart ?? fallbackPosition

  return {
    start,
    end: textarea?.selectionEnd ?? start
  }
}

function insertMention(
  value: string,
  agentName: string,
  selectionStart: number,
  selectionEnd: number
): { value: string; start: number; end: number; caret: number } {
  const mention = `@${agentName}`
  const beforeSelection = value.slice(0, selectionStart)
  const afterSelection = value.slice(selectionEnd)
  const prefix = beforeSelection.length > 0 && !beforeSelection.endsWith(' ') ? ' ' : ''
  const suffix = afterSelection.startsWith(' ') ? '' : ' '
  const insertedMention = `${prefix}${mention}${suffix}`
  const start = beforeSelection.length + prefix.length
  const end = start + mention.length
  const caret = end + suffix.length

  return {
    value: `${beforeSelection}${insertedMention}${afterSelection}`,
    start,
    end,
    caret
  }
}

function getMentionText(mention: DraftMention): string {
  return `@${mention.label}`
}

function hasIntactMention(value: string, mention: DraftMention): boolean {
  return value.slice(mention.start, mention.end) === getMentionText(mention)
}

function toggleAgentId(agentIds: string[], agentId: string): string[] {
  return agentIds.includes(agentId)
    ? agentIds.filter((item) => item !== agentId)
    : [...agentIds, agentId]
}

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values))
}
