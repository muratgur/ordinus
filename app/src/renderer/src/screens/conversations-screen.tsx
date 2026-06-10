import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Sparkles,
  ClipboardList,
  Activity,
  FolderOpen,
  Loader2,
  MessageSquareText,
  MoreHorizontal,
  Pencil,
  Plus,
  SendHorizontal,
  Square,
  TerminalSquare,
  Trash2,
  UserRound,
  XCircle
} from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Rail, RailItem, RailItemAction, RailList } from '@renderer/components/rail'
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
import { DiagnosticBlock } from '@renderer/components/observability-details'
import {
  formatLivenessHealth,
  formatObservedPhase,
  mergeDiagnostics
} from '@renderer/components/observability-diagnostics'
import { FileReferenceList } from '@renderer/components/file-reference-list'
import { getFileReferences, type FileReference } from '@renderer/components/file-reference-utils'
import { MarkdownContent } from '@renderer/components/markdown-content'
import { cn } from '@renderer/lib/utils'
import type {
  Agent,
  ConversationDeletePreview,
  ConversationDetail,
  ConversationInputRequest,
  ConversationListItem,
  ConversationParticipant,
  ConversationStatus,
  InteractionAnswer,
  InteractionQuestion,
  ConversationTurn,
  ConversationTurnStatus,
  ObservedRunDiagnostics,
  ObservedRunEvent,
  ObservedRunSnapshot
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

type PendingSend = {
  conversationId: string
  message: string
  orchestrated: boolean
}

type ObservationDrawerTab = 'activity' | 'diagnostics'

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

const composerTextareaMaxHeight = 160

export function ConversationsScreen(): React.JSX.Element {
  const [agents, setAgents] = useState<Agent[]>([])
  const [conversations, setConversations] = useState<ConversationListItem[]>([])
  const [selectedConversationId, setSelectedConversationId] = useState('')
  const [detail, setDetail] = useState<ConversationDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sidebarDocked, setSidebarDocked] = useState(true)
  const [message, setMessage] = useState('')
  const [draftMentions, setDraftMentions] = useState<DraftMention[]>([])
  const [pendingSend, setPendingSend] = useState<PendingSend | null>(null)
  const [sending, setSending] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [answeringRequestId, setAnsweringRequestId] = useState('')
  const [cancellingRequestId, setCancellingRequestId] = useState('')
  const [activeInputRequestId, setActiveInputRequestId] = useState('')
  const [inputDrafts, setInputDrafts] = useState<RequestDrafts>({})
  const [updatingRoutingMode, setUpdatingRoutingMode] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletePreview, setDeletePreview] = useState<ConversationDeletePreview | null>(null)
  const [deleteWorkspaceFiles, setDeleteWorkspaceFiles] = useState(false)
  const [loadingDeletePreview, setLoadingDeletePreview] = useState(false)
  const [deletingConversation, setDeletingConversation] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [renameOpen, setRenameOpen] = useState(false)
  const [renamingConversation, setRenamingConversation] = useState(false)
  const [renameError, setRenameError] = useState('')
  const [openingConversationFolder, setOpeningConversationFolder] = useState(false)
  const [observedRuns, setObservedRuns] = useState<ObservedRunSnapshot[]>([])
  const messagesScrollAreaRef = useRef<HTMLDivElement | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const shouldFollowMessagesRef = useRef(true)

  const runningTurns = detail?.turns.filter((turn) => turn.status === 'running') ?? []
  const runningTurn = runningTurns[0] ?? null
  // ADR-032: a moderated discussion keeps the conversation 'running' across the gaps
  // between sequential agent turns, so poll on that too (not just a live turn).
  const conversationRunning = detail?.status === 'running'
  const pendingInputRequest = detail?.inputRequests.find((request) => request.status === 'pending')
  const activeInputRequest =
    detail?.inputRequests.find((request) => request.id === activeInputRequestId) ?? null
  const participant = detail?.participants[0] ?? null
  const composerBlocked =
    !detail ||
    Boolean(runningTurn) ||
    // ADR-032: a moderated discussion keeps the conversation 'running' across the
    // gaps between sequential turns; block sends for the whole discussion.
    conversationRunning ||
    Boolean(pendingInputRequest) ||
    sending ||
    !participant ||
    !message.trim()
  const latestTurn = detail?.turns.at(-1)
  const latestTurnSignature = latestTurn
    ? `${detail?.id}:${latestTurn.id}:${latestTurn.status}:${latestTurn.content}`
    : detail?.id
  const observedRunByTurnId = useMemo(
    () => new Map(observedRuns.map((run) => [run.sourceItemId, run])),
    [observedRuns]
  )
  const activePendingSend = pendingSend?.conversationId === detail?.id ? pendingSend : null

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
      const [nextDetail, nextObservedRuns] = await Promise.all([
        window.ordinus.conversations.get({ conversationId }),
        window.ordinus.observability.listConversation({ conversationId })
      ])
      setDetail(nextDetail)
      setObservedRuns(nextObservedRuns)
    } else {
      setDetail(null)
      setObservedRuns([])
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
        if (conversationId) {
          const [nextDetail, nextObservedRuns] = await Promise.all([
            window.ordinus.conversations.get({ conversationId }),
            window.ordinus.observability.listConversation({ conversationId })
          ])
          if (!mounted) return
          setDetail(nextDetail)
          setObservedRuns(nextObservedRuns)
        } else {
          setDetail(null)
          setObservedRuns([])
        }
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
    return window.ordinus.observability.onRunChanged((snapshot) => {
      if (snapshot.sourceSurface !== 'conversation') return
      setObservedRuns((current) => {
        const withoutSnapshot = current.filter((item) => item.id !== snapshot.id)
        return [snapshot, ...withoutSnapshot]
      })
    })
  }, [])

  useEffect(() => {
    if (!selectedConversationId || (!runningTurn && !conversationRunning)) {
      return
    }

    const timer = window.setInterval(() => {
      void Promise.all([
        window.ordinus.conversations.get({ conversationId: selectedConversationId }),
        window.ordinus.conversations.list(),
        window.ordinus.observability.listConversation({ conversationId: selectedConversationId })
      ]).then(([nextDetail, nextConversations, nextObservedRuns]) => {
        setDetail(nextDetail)
        setConversations(nextConversations)
        setObservedRuns(nextObservedRuns)
      })
    }, 1500)

    return () => window.clearInterval(timer)
  }, [runningTurn, conversationRunning, selectedConversationId])

  useEffect(() => {
    shouldFollowMessagesRef.current = true
  }, [selectedConversationId])

  useEffect(() => {
    if (!detail || (detail.turns.length === 0 && !activePendingSend)) {
      return
    }

    if (!shouldFollowMessagesRef.current) {
      return
    }

    const animationFrame = window.requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ block: 'end' })
    })

    return () => window.cancelAnimationFrame(animationFrame)
  }, [activePendingSend, detail, latestTurnSignature])

  useEffect(() => {
    const viewport = getScrollAreaViewport(messagesScrollAreaRef.current)
    if (!viewport) {
      return
    }
    const scrollViewport = viewport

    function handleScroll(): void {
      shouldFollowMessagesRef.current = isScrollViewportNearBottom(scrollViewport)
    }

    scrollViewport.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()

    return () => scrollViewport.removeEventListener('scroll', handleScroll)
  }, [detail?.id])

  async function selectConversation(conversationId: string): Promise<void> {
    setMessage('')
    setDraftMentions([])
    setSelectedConversationId(conversationId)
    const [nextDetail, nextObservedRuns] = await Promise.all([
      window.ordinus.conversations.get({ conversationId }),
      window.ordinus.observability.listConversation({ conversationId })
    ])
    setDetail(nextDetail)
    setObservedRuns(nextObservedRuns)
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

    shouldFollowMessagesRef.current = true
    const sentMessage = message
    const sentMentions = draftMentions
    const sentConversationId = detail.id
    const sentViaOrchestrator = usesOrchestrator(detail)

    try {
      setSending(true)
      setError('')
      setPendingSend({
        conversationId: sentConversationId,
        message: sentMessage,
        orchestrated: sentViaOrchestrator
      })
      setMessage('')
      setDraftMentions([])
      const nextDetail = await window.ordinus.conversations.sendTurn({
        conversationId: sentConversationId,
        targetParticipantIds: getSendTargetParticipantIds(detail, sentMentions),
        message: sentMessage
      })
      setPendingSend(null)
      setDetail(nextDetail)
      await loadConversations(nextDetail.id)
    } catch (sendError) {
      setPendingSend(null)
      setMessage(sentMessage)
      setDraftMentions(sentMentions)
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

  async function handleRenameConversation(title: string): Promise<void> {
    if (!detail) {
      return
    }

    try {
      setRenamingConversation(true)
      setRenameError('')
      setError('')
      const nextDetail = await window.ordinus.conversations.updateTitle({
        conversationId: detail.id,
        title
      })
      setDetail(nextDetail)
      await loadConversations(nextDetail.id)
      setRenameOpen(false)
    } catch (renameFailure) {
      setRenameError(getErrorMessage(renameFailure, 'Conversation name could not be saved.'))
    } finally {
      setRenamingConversation(false)
    }
  }

  async function handleOpenConversationFolder(): Promise<void> {
    if (!detail) {
      return
    }

    try {
      setOpeningConversationFolder(true)
      setError('')
      await window.ordinus.conversations.openFolder({ conversationId: detail.id })
    } catch (openFailure) {
      setError(getErrorMessage(openFailure, 'Conversation folder could not be opened.'))
    } finally {
      setOpeningConversationFolder(false)
    }
  }

  async function openDeleteConversation(conversationId: string): Promise<void> {
    setDeleteOpen(true)
    setDeletePreview(null)
    setDeleteWorkspaceFiles(false)
    setDeleteError('')

    try {
      setLoadingDeletePreview(true)
      setDeletePreview(await window.ordinus.conversations.deletePreview({ conversationId }))
    } catch (previewError) {
      setDeleteError(getErrorMessage(previewError, 'Delete details could not be loaded.'))
    } finally {
      setLoadingDeletePreview(false)
    }
  }

  async function handleDeleteConversation(): Promise<void> {
    if (!deletePreview) {
      return
    }

    try {
      setDeletingConversation(true)
      setDeleteError('')
      setError('')
      const result = await window.ordinus.conversations.delete({
        conversationId: deletePreview.conversationId,
        deleteWorkspaceFiles
      })
      setDeleteOpen(false)
      setDeletePreview(null)
      setDeleteWorkspaceFiles(false)
      await loadConversations(
        selectedConversationId === result.deletedConversationId ? '' : selectedConversationId
      )
      if (result.fileWarning) {
        setError(result.fileWarning)
      }
    } catch (deleteFailure) {
      setDeleteError(getErrorMessage(deleteFailure, 'Conversation could not be deleted.'))
    } finally {
      setDeletingConversation(false)
    }
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] gap-3 py-4">
      <ConversationList
        conversations={conversations}
        loading={loading}
        selectedConversationId={selectedConversationId}
        collapsed={!sidebarDocked}
        onToggleCollapsed={() => setSidebarDocked((value) => !value)}
        onCreateConversation={() => setCreateOpen(true)}
        onDeleteConversation={(conversationId) => void openDeleteConversation(conversationId)}
        onSelectConversation={(conversationId) => void selectConversation(conversationId)}
      />

      <main className="relative min-w-0 flex-1 xl:min-h-0">
        <Card className="flex min-h-[420px] flex-col overflow-hidden xl:h-full xl:min-h-0">
          {error ? <InlineError message={error} /> : null}
          {detail ? (
            <>
              <ConversationHeader
                detail={detail}
                participantName={participant?.agentName ?? ''}
                runningTurns={runningTurns}
                cancelling={cancelling}
                openingFolder={openingConversationFolder}
                onCancelTurns={(turnIds) => void handleCancelTurns(turnIds)}
                onOpenFolder={() => void handleOpenConversationFolder()}
                onOpenRename={() => {
                  setRenameError('')
                  setRenameOpen(true)
                }}
              />
              <ScrollArea ref={messagesScrollAreaRef} className="min-h-0 flex-1">
                <CardContent className="grid gap-3 p-4">
                  {detail.turns.length > 0 || activePendingSend ? (
                    (() => {
                      const turnIndexById = new Map(
                        detail.turns.map((turnItem, turnIndex) => [turnItem.id, turnIndex] as const)
                      )
                      const renderTurnCard = (turn: ConversationTurn): React.JSX.Element => {
                        const index = turnIndexById.get(turn.id) ?? 0
                        const turnInputRequest = detail.inputRequests.find(
                          (request) => request.turnId === turn.id && request.status === 'pending'
                        )
                        const turnInputRequestDisabled = turnInputRequest
                          ? hasRunningTurnForParticipant(
                              detail.turns,
                              turnInputRequest.participantId
                            )
                          : false
                        const answeringTurnInputRequest = turnInputRequest
                          ? answeringRequestId === turnInputRequest.id
                          : false

                        return (
                          <TurnCard
                            key={turn.id}
                            turn={turn}
                            participantName={getTurnParticipantLabel(detail, turn, index)}
                            observedRun={observedRunByTurnId.get(turn.id) ?? null}
                            inputRequest={turnInputRequest ?? null}
                            inputRequestDrafts={
                              turnInputRequest ? (inputDrafts[turnInputRequest.id] ?? {}) : {}
                            }
                            answeringInputRequest={answeringTurnInputRequest}
                            inputRequestDisabled={turnInputRequestDisabled}
                            onOpenInputRequest={(requestId) => setActiveInputRequestId(requestId)}
                            onRevealPath={(path) => void handleRevealPath(turn.id, path)}
                          />
                        )
                      }

                      return buildTurnRenderItems(detail.turns).map((item) =>
                        item.kind === 'discussion' ? (
                          <DiscussionCard
                            key={item.moderator.id}
                            moderator={item.moderator}
                            agentTurns={item.agentTurns}
                            renderTurnCard={renderTurnCard}
                          />
                        ) : (
                          renderTurnCard(item.turn)
                        )
                      )
                    })()
                  ) : (
                    <EmptyState
                      icon={<MessageSquareText />}
                      title="No messages yet"
                      detail="Send the first request to start this agent session."
                    />
                  )}
                  {activePendingSend ? (
                    <PendingSendTimeline pendingSend={activePendingSend} />
                  ) : null}
                  {conversationRunning && !runningTurn && usesOrchestrator(detail) ? (
                    <ModeratorDeliberatingRow />
                  ) : null}
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
                  conversationRunning,
                  pendingInputRequest
                )}
                disabled={composerBlocked}
                sending={sending}
                routingDisabled={Boolean(runningTurn) || conversationRunning}
                updatingRoutingMode={updatingRoutingMode}
                onChange={handleMessageChange}
                onRoutingModeChange={(orchestrated) => void handleRoutingModeChange(orchestrated)}
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
      <DeleteConversationDialog
        deleting={deletingConversation}
        deleteWorkspaceFiles={deleteWorkspaceFiles}
        error={deleteError}
        loading={loadingDeletePreview}
        open={deleteOpen}
        preview={deletePreview}
        onDelete={() => void handleDeleteConversation()}
        onDeleteWorkspaceFilesChange={setDeleteWorkspaceFiles}
        onOpenChange={(open) => {
          setDeleteOpen(open)
          if (!open) {
            setDeletePreview(null)
            setDeleteWorkspaceFiles(false)
            setDeleteError('')
          }
        }}
      />
      {detail ? (
        <RenameConversationDialog
          currentTitle={detail.title}
          error={renameError}
          open={renameOpen}
          saving={renamingConversation}
          onOpenChange={(open) => {
            setRenameOpen(open)
            if (!open) {
              setRenameError('')
            }
          }}
          onRename={(title) => void handleRenameConversation(title)}
        />
      ) : null}
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
  collapsed,
  onToggleCollapsed,
  onCreateConversation,
  onDeleteConversation,
  onSelectConversation
}: {
  conversations: ConversationListItem[]
  loading: boolean
  selectedConversationId: string
  collapsed: boolean
  onToggleCollapsed: () => void
  onCreateConversation: () => void
  onDeleteConversation: (conversationId: string) => void
  onSelectConversation: (conversationId: string) => void
}): React.JSX.Element {
  return (
    <Rail
      aria-label="Conversations"
      collapsed={collapsed}
      onToggleCollapsed={onToggleCollapsed}
      cta={{ label: 'New conversation', onClick: onCreateConversation }}
      searchPlaceholder="Find conversation"
      search={conversations.map((conversation) => ({
        id: conversation.id,
        label: conversation.title,
        meta: conversation.lastPreview || undefined,
        onSelect: () => onSelectConversation(conversation.id)
      }))}
    >
      <RailList isEmpty={!loading && conversations.length === 0} empty="No conversations yet.">
        {loading
          ? null
          : conversations.map((conversation) => {
              const running = conversation.status === 'running'
              return (
                <RailItem
                  key={conversation.id}
                  title={conversation.title}
                  selected={selectedConversationId === conversation.id}
                  running={running}
                  runningLabel="Working…"
                  meta={conversation.lastPreview || 'No messages yet'}
                  rightSlot={<StatusDot status={conversation.status} />}
                  onSelect={() => onSelectConversation(conversation.id)}
                  actions={
                    <RailItemAction
                      icon={Trash2}
                      label={
                        running
                          ? 'Stop this conversation before deleting it.'
                          : 'Delete conversation'
                      }
                      disabled={running}
                      className="hover:text-status-attention"
                      onClick={() => onDeleteConversation(conversation.id)}
                    />
                  }
                />
              )
            })}
      </RailList>
    </Rail>
  )
}

function ConversationHeader({
  detail,
  participantName,
  runningTurns,
  cancelling,
  openingFolder,
  onCancelTurns,
  onOpenFolder,
  onOpenRename
}: {
  detail: ConversationDetail
  participantName: string
  runningTurns: ConversationTurn[]
  cancelling: boolean
  openingFolder: boolean
  onCancelTurns: (turnIds: string[]) => void
  onOpenFolder: () => void
  onOpenRename: () => void
}): React.JSX.Element {
  return (
    <CardHeader className="border-b bg-accent/50 px-4 py-3">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <CardTitle className="truncate text-base leading-6">{detail.title}</CardTitle>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 text-muted-foreground"
            title="Rename conversation"
            aria-label="Rename conversation"
            onClick={onOpenRename}
          >
            <Pencil className="size-4" />
          </Button>
          <CardDescription className="hidden min-w-0 truncate sm:block">
            {getParticipantSummary(detail.participants, participantName)}
          </CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {detail.status !== 'active' ? <StatusPill status={detail.status} /> : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 text-muted-foreground"
            title={`Open conversation folder: ${detail.workingRoot}`}
            aria-label="Open conversation folder"
            disabled={openingFolder}
            onClick={onOpenFolder}
          >
            {openingFolder ? <Loader2 className="size-4 animate-spin" /> : <FolderOpen />}
          </Button>
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

function RenameConversationDialog({
  currentTitle,
  error,
  open,
  saving,
  onOpenChange,
  onRename
}: {
  currentTitle: string
  error: string
  open: boolean
  saving: boolean
  onOpenChange: (open: boolean) => void
  onRename: (title: string) => void
}): React.JSX.Element {
  const [title, setTitle] = useState(currentTitle)
  const trimmedTitle = title.trim()
  const canSave = Boolean(trimmedTitle) && trimmedTitle !== currentTitle && !saving

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (open && !cancelled) {
        setTitle(currentTitle)
      }
    })
    return () => {
      cancelled = true
    }
  }, [currentTitle, open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Rename conversation</DialogTitle>
          <DialogDescription>
            Only the conversation name changes. The workspace folder stays linked.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <label className="grid gap-2">
            <span className="text-xs font-medium text-muted-foreground">Conversation name</span>
            <Input
              maxLength={120}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && canSave) {
                  onRename(trimmedTitle)
                }
              }}
            />
          </label>
          {error ? <InlineError message={error} /> : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={!canSave} onClick={() => onRename(trimmedTitle)}>
            {saving ? <Loader2 className="animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeleteConversationDialog({
  deleting,
  deleteWorkspaceFiles,
  error,
  loading,
  open,
  preview,
  onDelete,
  onDeleteWorkspaceFilesChange,
  onOpenChange
}: {
  deleting: boolean
  deleteWorkspaceFiles: boolean
  error: string
  loading: boolean
  open: boolean
  preview: ConversationDeletePreview | null
  onDelete: () => void
  onDeleteWorkspaceFilesChange: (deleteWorkspaceFiles: boolean) => void
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const canDelete = Boolean(preview) && !loading && !deleting

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-status-attention" />
            Delete conversation
          </DialogTitle>
          <DialogDescription>
            This removes the conversation history from Ordinus. This cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          {loading ? (
            <div className="flex items-center gap-2 rounded-lg border bg-accent px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Checking conversation folder
            </div>
          ) : null}

          {preview ? (
            <>
              <div className="grid gap-2 rounded-lg border bg-accent p-3 text-sm">
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">
                    Conversation
                  </p>
                  <p className="truncate font-semibold">{preview.title}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">
                    Workspace folder
                  </p>
                  <code className="block break-all rounded-md bg-card px-2 py-1 font-mono text-xs">
                    {preview.workingRoot}
                  </code>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">
                    Full location
                  </p>
                  <code className="block break-all rounded-md bg-card px-2 py-1 font-mono text-xs">
                    {preview.absolutePath}
                  </code>
                </div>
                <p className="text-xs text-muted-foreground">
                  {preview.folderExists
                    ? `${formatEntryCount(preview.fileCount, 'file')} and ${formatEntryCount(
                        preview.directoryCount,
                        'folder'
                      )} will be moved if you include workspace files.`
                    : 'No conversation folder found.'}
                </p>
              </div>

              <label className="flex items-start gap-3 rounded-lg border border-status-attention/30 bg-status-attention/10 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 size-4 shrink-0 accent-primary"
                  checked={deleteWorkspaceFiles}
                  disabled={!preview.folderExists || deleting}
                  onChange={(event) => onDeleteWorkspaceFilesChange(event.target.checked)}
                />
                <span className="grid gap-1">
                  <span className="font-medium text-status-attention">
                    Also move this conversation folder to Trash
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Only this folder is moved. Project files changed outside this folder are not
                    deleted.
                  </span>
                </span>
              </label>
            </>
          ) : null}

          {error ? (
            <p className="rounded-md border border-status-attention/30 bg-status-attention/10 px-3 py-2 text-xs text-status-attention">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            disabled={deleting}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={!canDelete} onClick={onDelete}>
            {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
            Delete conversation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ADR-032: a concluded advisory discussion renders as a single Result card with the
// agent turns collapsed beneath it. Manual conversations (no moderator turn) keep a
// flat list — every turn becomes its own item, exactly as before.
type TurnRenderItem =
  | { kind: 'turn'; turn: ConversationTurn }
  | { kind: 'discussion'; moderator: ConversationTurn; agentTurns: ConversationTurn[] }

function buildTurnRenderItems(turns: ConversationTurn[]): TurnRenderItem[] {
  const items: TurnRenderItem[] = []
  let buffer: ConversationTurn[] = []
  const flush = (): void => {
    buffer.forEach((bufferedTurn) => items.push({ kind: 'turn', turn: bufferedTurn }))
    buffer = []
  }

  for (const turn of turns) {
    if (turn.speaker === 'moderator') {
      items.push({ kind: 'discussion', moderator: turn, agentTurns: buffer })
      buffer = []
    } else if (turn.speaker === 'user') {
      flush()
      items.push({ kind: 'turn', turn })
    } else {
      buffer.push(turn)
    }
  }

  flush()
  return items
}

function DiscussionCard({
  moderator,
  agentTurns,
  renderTurnCard
}: {
  moderator: ConversationTurn
  agentTurns: ConversationTurn[]
  renderTurnCard: (turn: ConversationTurn) => React.JSX.Element
}): React.JSX.Element {
  const [open, setOpen] = useState(false)

  return (
    <article className="mr-auto grid w-full min-w-0 max-w-full gap-3 overflow-hidden rounded-lg border border-primary/30 bg-primary-soft/40 p-4 sm:max-w-[82%] dark:border-primary/40 dark:bg-primary-soft/30">
      <div className="flex min-w-0 items-center gap-2">
        <Sparkles className="size-4 shrink-0 text-primary" />
        <p className="truncate text-sm font-semibold">Result</p>
      </div>
      <AgentMarkdown content={moderator.content} />
      {moderator.truncated ? (
        <p className="text-xs text-muted-foreground">Long output was shortened for this view.</p>
      ) : null}
      {agentTurns.length > 0 ? (
        <div className="grid gap-3">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="flex w-fit items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            aria-expanded={open}
          >
            {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            {open
              ? 'Hide discussion'
              : `See discussion (${agentTurns.length} ${
                  agentTurns.length === 1 ? 'reply' : 'replies'
                })`}
          </button>
          {open ? (
            <div className="grid gap-3 border-l-2 border-primary/20 pl-3">
              {agentTurns.map((turn) => renderTurnCard(turn))}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}

function TurnCard({
  turn,
  participantName,
  observedRun,
  inputRequest,
  inputRequestDrafts,
  answeringInputRequest,
  inputRequestDisabled,
  onOpenInputRequest,
  onRevealPath
}: {
  turn: ConversationTurn
  participantName: string
  observedRun: ObservedRunSnapshot | null
  inputRequest: ConversationInputRequest | null
  inputRequestDrafts: Record<string, AnswerDraft>
  answeringInputRequest: boolean
  inputRequestDisabled: boolean
  onOpenInputRequest: (requestId: string) => void
  onRevealPath: (path: string) => void
}): React.JSX.Element {
  const isUser = turn.speaker === 'user'
  const Icon = isUser ? UserRound : Bot
  const showStatus = shouldShowTurnStatus(turn, inputRequest)
  const showInputRequestAction =
    !isUser && turn.status === 'waiting_for_user' && inputRequest?.status === 'pending'

  return (
    <article
      className={cn(
        'grid w-full min-w-0 max-w-full gap-2 overflow-hidden rounded-lg border bg-card p-4',
        isUser
          ? 'ml-auto w-fit border-primary/20 bg-primary-soft/70 sm:max-w-[86%] dark:border-primary/30 dark:bg-primary-soft/45'
          : 'mr-auto border-border bg-surface-subtle/70 border-l-4 border-l-primary/30 sm:max-w-[82%] dark:bg-surface-subtle/55 dark:border-l-primary/45',
        showInputRequestAction &&
          'border-status-blocked/30 bg-status-blocked/10 dark:border-status-blocked/35 dark:bg-status-blocked/10'
      )}
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="size-4 shrink-0 text-primary" />
          <p className="truncate text-sm font-semibold">
            {isUser
              ? `You${participantName ? ` to @${participantName}` : ''}`
              : participantName || 'Agent'}
          </p>
        </div>
        {showInputRequestAction ? (
          <InputRequestTurnAction
            request={inputRequest}
            drafts={inputRequestDrafts}
            disabled={inputRequestDisabled || answeringInputRequest}
            answering={answeringInputRequest}
            onOpen={() => onOpenInputRequest(inputRequest.id)}
          />
        ) : showStatus ? (
          <TurnStatus status={turn.status} />
        ) : null}
      </div>
      {turn.status === 'running' ? null : turn.status === 'failed' ? (
        <p className="select-text rounded-md border border-status-attention/30 bg-status-attention/10 px-3 py-2 text-sm text-status-attention [overflow-wrap:anywhere]">
          {turn.error || 'This turn failed.'}
        </p>
      ) : isUser ? (
        <p className="min-w-0 select-text whitespace-pre-wrap break-words text-sm leading-6 text-foreground [overflow-wrap:anywhere]">
          {turn.content}
        </p>
      ) : (
        <AgentMarkdown content={turn.content} />
      )}
      {turn.truncated ? (
        <p className="text-xs text-muted-foreground">Long output was shortened for this view.</p>
      ) : null}
      {!isUser && turn.status === 'completed' && turn.resultContent.trim() ? (
        <TurnFullResponse content={turn.resultContent} />
      ) : null}
      {!isUser && turn.status === 'completed' ? (
        <TurnFiles turn={turn} onRevealPath={onRevealPath} />
      ) : null}
      {!isUser && !showInputRequestAction ? (
        <TurnObservabilityPanel observedRun={observedRun} turnStatus={turn.status} />
      ) : null}
    </article>
  )
}

function InputRequestTurnAction({
  request,
  drafts,
  disabled,
  answering,
  onOpen
}: {
  request: ConversationInputRequest
  drafts: Record<string, AnswerDraft>
  disabled: boolean
  answering: boolean
  onOpen: () => void
}): React.JSX.Element {
  const progress = getInputRequestProgress(request, drafts)

  return (
    <Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={onOpen}>
      {answering ? <Loader2 className="animate-spin" /> : <ClipboardList />}
      {progress.canContinue ? 'Review' : 'Answer'}
    </Button>
  )
}

function PendingSendTimeline({ pendingSend }: { pendingSend: PendingSend }): React.JSX.Element {
  return (
    <div className="grid gap-3">
      <article className="ml-auto grid w-fit max-w-full gap-2 overflow-hidden rounded-lg border border-primary/20 bg-primary-soft/70 p-4 dark:border-primary/30 dark:bg-primary-soft/45 sm:max-w-[86%]">
        <div className="flex min-w-0 items-center gap-2">
          <UserRound className="size-4 shrink-0 text-primary" />
          <p className="truncate text-sm font-semibold">You</p>
        </div>
        <p className="min-w-0 select-text whitespace-pre-wrap break-words text-sm leading-6 text-foreground [overflow-wrap:anywhere]">
          {pendingSend.message}
        </p>
      </article>
      {pendingSend.orchestrated ? <OrchestratorPlanningRow /> : null}
    </div>
  )
}

function OrchestratorPlanningRow(): React.JSX.Element {
  return (
    <div className="mr-auto flex min-w-0 max-w-full items-center gap-2 rounded-lg border border-dashed bg-surface-subtle/60 px-3 py-2 text-xs text-muted-foreground sm:max-w-[82%]">
      <Activity className="size-3.5 shrink-0 text-primary" />
      <span className="shrink-0 font-medium text-foreground">Orchestrator</span>
      <span className="min-w-0 truncate">is planning the route</span>
      <Loader2 className="ml-auto size-3.5 shrink-0 animate-spin text-status-running" />
    </div>
  )
}

// ADR-032: shown between sequential agent turns while the moderator decides who
// speaks next (or concludes), so the discussion never looks idle/finished.
function ModeratorDeliberatingRow(): React.JSX.Element {
  return (
    <div className="mr-auto flex min-w-0 max-w-full items-center gap-2 rounded-lg border border-dashed bg-surface-subtle/60 px-3 py-2 text-xs text-muted-foreground sm:max-w-[82%]">
      <Sparkles className="size-3.5 shrink-0 text-primary" />
      <span className="shrink-0 font-medium text-foreground">Moderator</span>
      <span className="min-w-0 truncate">is reviewing the discussion</span>
      <Loader2 className="ml-auto size-3.5 shrink-0 animate-spin text-status-running" />
    </div>
  )
}

// ADR-030 parity: the summary is always shown; the agent's full produced body
// (resultContent) is surfaced on demand so the room stays calm by default.
function TurnFullResponse({ content }: { content: string }): React.JSX.Element {
  const [open, setOpen] = useState(false)

  return (
    <div className="grid gap-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-fit items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        aria-expanded={open}
      >
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        {open ? 'Hide full response' : 'Show full response'}
      </button>
      {open ? (
        <div className="border-l-2 border-primary/20 pl-3">
          <AgentMarkdown content={content} />
        </div>
      ) : null}
    </div>
  )
}

function AgentMarkdown({ content }: { content: string }): React.JSX.Element {
  return <MarkdownContent content={content} />
}

function TurnObservabilityPanel({
  observedRun,
  turnStatus
}: {
  observedRun: ObservedRunSnapshot | null
  turnStatus: ConversationTurnStatus
}): React.JSX.Element | null {
  const [drawerTab, setDrawerTab] = useState<ObservationDrawerTab | null>(null)

  if (!observedRun) {
    return turnStatus === 'running' ? (
      <div className="flex min-w-0 items-center gap-2 border-t pt-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        <span className="truncate">Thinking</span>
      </div>
    ) : null
  }

  const running = isConversationObservationRunning(turnStatus, observedRun)
  if (!shouldShowConversationObservability(turnStatus, observedRun, running)) {
    return null
  }

  const activityLabel = getConversationActivityLabel(observedRun)
  const showActivityLabel = shouldShowConversationActivityLabel(observedRun, running)

  return (
    <div className="min-w-0 max-w-full overflow-hidden border-t pt-2">
      <button
        type="button"
        className="flex min-w-0 max-w-full items-center gap-2 overflow-hidden rounded-md px-1 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        title="Open run details"
        onClick={() => setDrawerTab('activity')}
      >
        {running ? (
          <Loader2 className="size-3.5 shrink-0 animate-spin text-status-running" />
        ) : (
          <Activity className="size-3.5 shrink-0" />
        )}
        <span className="shrink-0 font-medium text-foreground">
          {running ? 'Thinking' : formatObservedPhase(observedRun.currentPhase)}
        </span>
        {showActivityLabel ? (
          <span className="min-w-0 flex-1 truncate">{activityLabel}</span>
        ) : null}
      </button>
      <TurnObservationDrawer
        openTab={drawerTab}
        observedRun={observedRun}
        onTabChange={setDrawerTab}
        onClose={() => setDrawerTab(null)}
      />
    </div>
  )
}

function TurnObservationDrawer({
  openTab,
  observedRun,
  onTabChange,
  onClose
}: {
  openTab: ObservationDrawerTab | null
  observedRun: ObservedRunSnapshot
  onTabChange: (tab: ObservationDrawerTab) => void
  onClose: () => void
}): React.JSX.Element | null {
  if (!openTab) return null

  return (
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        className="absolute inset-0 bg-background/60 backdrop-blur-[1px]"
        aria-label="Close run details"
        onClick={onClose}
      />
      <aside className="absolute inset-y-0 right-0 z-10 flex w-full flex-col border-l bg-background shadow-2xl sm:w-[86vw] sm:max-w-[620px] xl:w-[44vw] xl:max-w-[680px]">
        <header className="flex items-start justify-between gap-4 border-b p-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold leading-6">
              {openTab === 'diagnostics' ? 'Diagnostics' : 'Activity'}
            </h2>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {observedRun.assignedAgentName} / {formatObservedPhase(observedRun.currentPhase)} /{' '}
              {formatLivenessHealth(observedRun.livenessHealth)}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            aria-label="Close run details"
            onClick={onClose}
          >
            <XCircle className="size-4" />
          </Button>
        </header>

        <div className="flex gap-2 border-b px-4 py-3">
          <Button
            type="button"
            variant={openTab === 'activity' ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => onTabChange('activity')}
          >
            <Activity />
            Activity
          </Button>
          <Button
            type="button"
            variant={openTab === 'diagnostics' ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => onTabChange('diagnostics')}
          >
            <TerminalSquare />
            Diagnostics
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 ordinus-scrollbar">
          {openTab === 'diagnostics' ? (
            <TurnDiagnosticsPanel observedRun={observedRun} />
          ) : (
            <TurnActivityTimeline observedRun={observedRun} />
          )}
        </div>
      </aside>
    </div>
  )
}

function TurnActivityTimeline({
  observedRun
}: {
  observedRun: ObservedRunSnapshot
}): React.JSX.Element {
  const [events, setEvents] = useState<ObservedRunEvent[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    const observedRunId = observedRun.id

    async function loadEvents(): Promise<void> {
      try {
        const nextEvents = await window.ordinus.observability.listEvents({ observedRunId })
        if (!mounted) return
        setEvents(nextEvents)
        setError('')
      } catch (loadError) {
        if (!mounted) return
        setError(getErrorMessage(loadError, 'Activity could not be loaded.'))
      }
    }

    void loadEvents()
    const timer = window.setInterval(() => void loadEvents(), 2000)
    return () => {
      mounted = false
      window.clearInterval(timer)
    }
  }, [observedRun.id, observedRun.updatedAt])

  if (error) {
    return <ObservationEmptyState>{error}</ObservationEmptyState>
  }

  if (events.length === 0) {
    return <ObservationEmptyState>No timeline events yet.</ObservationEmptyState>
  }

  return (
    <div className="grid gap-2">
      {events.map((event) => (
        <div key={event.id} className="flex min-w-0 gap-3 rounded-md border bg-background p-3">
          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary/70" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium">{event.summary}</p>
              <Badge variant="secondary">{event.kind}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {new Date(event.timestamp).toLocaleTimeString()} / {event.source} / {event.confidence}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

function TurnDiagnosticsPanel({
  observedRun
}: {
  observedRun: ObservedRunSnapshot
}): React.JSX.Element {
  const [diagnostics, setDiagnostics] = useState<ObservedRunDiagnostics | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    const observedRunId = observedRun.id

    async function loadDiagnostics(): Promise<void> {
      try {
        const nextDiagnostics = await window.ordinus.observability.getDiagnostics({
          observedRunId,
          stdoutOffset: diagnostics?.stdout.nextOffset,
          stderrOffset: diagnostics?.stderr.nextOffset
        })
        if (!mounted) return
        setDiagnostics((current) => mergeDiagnostics(current, nextDiagnostics))
        setError('')
      } catch (loadError) {
        if (!mounted) return
        setError(getErrorMessage(loadError, 'Diagnostics could not be loaded.'))
      }
    }

    void loadDiagnostics()
    const timer = window.setInterval(() => void loadDiagnostics(), 2000)
    return () => {
      mounted = false
      window.clearInterval(timer)
    }
  }, [observedRun.id, diagnostics?.stdout.nextOffset, diagnostics?.stderr.nextOffset])

  if (error) {
    return <ObservationEmptyState>{error}</ObservationEmptyState>
  }

  if (!diagnostics) {
    return <ObservationEmptyState>Loading diagnostics...</ObservationEmptyState>
  }

  return (
    <div className="grid gap-2">
      <DiagnosticBlock label="Invocation">
        {[
          `Provider: ${diagnostics.invocation.provider || observedRun.providerId}`,
          `Executable: ${diagnostics.invocation.executable || observedRun.providerId}`,
          `Args: ${diagnostics.invocation.args.join(' ') || 'Not available'}`,
          `Cwd: ${diagnostics.invocation.cwd || 'Not available'}`,
          `Started: ${diagnostics.invocation.startedAt || 'Not available'}`
        ].join('\n')}
      </DiagnosticBlock>
      <DiagnosticBlock label="stdout">
        {diagnostics.stdout.text || 'No stdout output yet.'}
      </DiagnosticBlock>
      <DiagnosticBlock label="stderr">
        {diagnostics.stderr.text || 'No stderr output yet.'}
      </DiagnosticBlock>
    </div>
  )
}

function ObservationEmptyState({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="rounded-md border border-dashed bg-background px-3 py-2 text-sm text-muted-foreground">
      {children}
    </div>
  )
}

function TurnFiles({
  turn,
  onRevealPath
}: {
  turn: ConversationTurn
  onRevealPath: (path: string) => void
}): React.JSX.Element | null {
  const files = getFileReferences(turn.artifactRefs, turn.changedFiles)

  if (files.length === 0) {
    return null
  }

  return (
    <div className="grid gap-2 border-t pt-2">
      <TurnFileSection files={files} onReveal={onRevealPath} />
    </div>
  )
}

function TurnFileSection({
  files,
  onReveal
}: {
  files: FileReference[]
  onReveal: (path: string) => void
}): React.JSX.Element {
  return (
    <div className="grid gap-1.5">
      <p className="text-xs font-medium uppercase text-muted-foreground">Files</p>
      <FileReferenceList files={files} onRevealPath={onReveal} />
    </div>
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
  const [activeQuestionCursor, setActiveQuestionCursor] = useState({
    requestId: request.id,
    index: 0
  })
  const storedQuestionIndex =
    activeQuestionCursor.requestId === request.id ? activeQuestionCursor.index : 0
  const activeQuestionIndex = Math.min(
    storedQuestionIndex,
    Math.max(0, request.questions.length - 1)
  )
  const activeQuestion = request.questions[activeQuestionIndex] ?? null
  const currentQuestionAnswered = activeQuestion ? hasAnswer(activeQuestion, drafts) : true
  const canMoveBack = activeQuestionIndex > 0
  const isLastQuestion = activeQuestionIndex >= request.questions.length - 1
  const canMoveForward = Boolean(activeQuestion) && !formDisabled && currentQuestionAnswered

  function moveForward(): void {
    if (!activeQuestion || !canMoveForward) return

    advanceOrAnswer(progress)
  }

  function handleQuestionDraftChange(question: InteractionQuestion, draft: AnswerDraft): void {
    onDraftChange(question.id, draft)

    if (!shouldAdvanceAfterDraft(question, draft)) {
      return
    }

    advanceOrAnswer(getInputRequestProgress(request, getDraftsWithQuestionDraft(question, draft)))
  }

  function submitQuestionDraft(question: InteractionQuestion, draft: AnswerDraft): void {
    onDraftChange(question.id, draft)

    const nextDrafts = getDraftsWithQuestionDraft(question, draft)
    if (!hasAnswer(question, nextDrafts)) {
      return
    }

    advanceOrAnswer(getInputRequestProgress(request, nextDrafts))
  }

  function advanceOrAnswer(nextProgress: InputRequestProgress): void {
    if (isLastQuestion) {
      if (nextProgress.canContinue) {
        onAnswer(nextProgress.answers)
      }
      return
    }

    setActiveQuestionCursor((current) => ({
      requestId: request.id,
      index: Math.min(
        current.requestId === request.id ? current.index + 1 : 1,
        request.questions.length - 1
      )
    }))
  }

  function getDraftsWithQuestionDraft(
    question: InteractionQuestion,
    draft: AnswerDraft
  ): Record<string, AnswerDraft> {
    return { ...drafts, [question.id]: draft }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0">
        <DialogHeader className="border-b px-6 py-5">
          <div className="flex items-start justify-between gap-4 pr-8">
            <div className="min-w-0">
              <DialogTitle>{participantName || 'Agent'} needs your input</DialogTitle>
              <DialogDescription className="mt-2">
                {request.detail || request.title}
              </DialogDescription>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <InputRequestActionsMenu
                cancelling={cancelling}
                disabled={disabled || answering || cancelling}
                onCancel={onCancel}
              />
            </div>
          </div>
        </DialogHeader>
        <ScrollArea className="max-h-[min(520px,calc(100vh-14rem))]">
          <div className="px-6 py-5">
            {activeQuestion ? (
              <QuestionInput
                key={activeQuestion.id}
                question={activeQuestion}
                draft={drafts[activeQuestion.id]}
                disabled={formDisabled}
                onChange={(draft) => handleQuestionDraftChange(activeQuestion, draft)}
                onSubmit={(draft) => submitQuestionDraft(activeQuestion, draft)}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                This request does not include any questions.
              </p>
            )}
          </div>
        </ScrollArea>
        <DialogFooter className="flex-row items-center justify-center border-t px-6 py-3 sm:justify-center">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            disabled={formDisabled || !canMoveBack}
            aria-label="Previous question"
            onClick={() =>
              setActiveQuestionCursor((current) => ({
                requestId: request.id,
                index: Math.max(0, current.requestId === request.id ? current.index - 1 : 0)
              }))
            }
          >
            <ChevronLeft />
          </Button>
          <span className="min-w-10 text-center text-xs font-medium text-muted-foreground">
            {request.questions.length > 0
              ? `${activeQuestionIndex + 1}/${request.questions.length}`
              : '0/0'}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            disabled={!canMoveForward || (isLastQuestion && !progress.canContinue)}
            aria-label={isLastQuestion ? 'Send answers' : 'Next question'}
            onClick={moveForward}
          >
            {answering ? <Loader2 className="animate-spin" /> : <ChevronRight />}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function InputRequestActionsMenu({
  cancelling,
  disabled,
  onCancel
}: {
  cancelling: boolean
  disabled: boolean
  onCancel: () => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="relative">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8"
        disabled={disabled}
        aria-expanded={open}
        aria-label="Request options"
        onClick={() => {
          setOpen((current) => !current)
          setConfirming(false)
        }}
      >
        <MoreHorizontal />
      </Button>
      {open ? (
        <div className="absolute right-0 top-10 z-50 grid w-64 gap-2 rounded-lg border bg-card p-2 text-card-foreground shadow-lg">
          {confirming ? (
            <>
              <p className="px-2 pt-1 text-xs leading-5 text-muted-foreground">
                This cancels the agent request, not just this window.
              </p>
              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={cancelling}
                  onClick={() => setConfirming(false)}
                >
                  Keep
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="border-status-failed/30 text-status-failed hover:bg-status-failed/10"
                  disabled={cancelling}
                  onClick={onCancel}
                >
                  {cancelling ? <Loader2 className="animate-spin" /> : <XCircle />}
                  Cancel request
                </Button>
              </div>
            </>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="justify-start text-status-failed hover:bg-status-failed/10 hover:text-status-failed"
              onClick={() => setConfirming(true)}
            >
              <XCircle />
              Cancel request
            </Button>
          )}
        </div>
      ) : null}
    </div>
  )
}

function QuestionInput({
  question,
  draft,
  disabled,
  onChange,
  onSubmit
}: {
  question: InteractionQuestion
  draft: AnswerDraft | undefined
  disabled: boolean
  onChange: (draft: AnswerDraft) => void
  onSubmit: (draft: AnswerDraft) => void
}): React.JSX.Element {
  return (
    <div className="grid gap-4">
      <div>
        <p className="text-base font-semibold leading-7">{question.label}</p>
        {question.detail ? (
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{question.detail}</p>
        ) : null}
      </div>

      {question.kind === 'choice' ? (
        <ChoiceQuestionInput
          question={question}
          draft={draft}
          disabled={disabled}
          onChange={onChange}
          onSubmit={onSubmit}
        />
      ) : question.kind === 'boolean' ? (
        <div className="grid gap-2">
          <AnswerOptionRow
            selected={draft?.type === 'boolean' && draft.value}
            disabled={disabled}
            onClick={() => onChange({ type: 'boolean', value: true })}
          >
            {question.trueLabel}
          </AnswerOptionRow>
          <AnswerOptionRow
            selected={draft?.type === 'boolean' && !draft.value}
            disabled={disabled}
            onClick={() => onChange({ type: 'boolean', value: false })}
          >
            {question.falseLabel}
          </AnswerOptionRow>
        </div>
      ) : (
        <textarea
          className="ordinus-scrollbar min-h-20 resize-y rounded-md border bg-card p-3 text-sm leading-6 outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          placeholder={question.placeholder || 'Type your answer'}
          value={draft?.type === 'text' ? draft.text : ''}
          disabled={disabled}
          onChange={(event) => onChange({ type: 'text', text: event.target.value })}
          onKeyDown={(event) =>
            handleAnswerTextareaKeyDown(
              event,
              { type: 'text', text: event.currentTarget.value },
              onSubmit
            )
          }
        />
      )}
    </div>
  )
}

function ChoiceQuestionInput({
  question,
  draft,
  disabled,
  onChange,
  onSubmit
}: {
  question: Extract<InteractionQuestion, { kind: 'choice' }>
  draft: AnswerDraft | undefined
  disabled: boolean
  onChange: (draft: AnswerDraft) => void
  onSubmit: (draft: AnswerDraft) => void
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
        onKeyDown={(event) =>
          handleAnswerTextareaKeyDown(
            event,
            { type: 'custom', text: event.currentTarget.value },
            onSubmit
          )
        }
      />
    )
  }

  return (
    <div className="grid gap-2">
      <div className="grid gap-2">
        {question.options.map((option) => (
          <AnswerOptionRow
            key={option.id}
            selected={draft?.type === 'option' && draft.optionId === option.id}
            disabled={disabled}
            onClick={() => onChange({ type: 'option', optionId: option.id })}
            meta={
              question.options.length > 1 && question.recommendedOptionId === option.id
                ? 'Recommended'
                : undefined
            }
          >
            {option.label}
          </AnswerOptionRow>
        ))}
        {question.allowCustom !== false ? (
          <AnswerOptionRow
            selected={customSelected}
            disabled={disabled}
            onClick={() => onChange({ type: 'custom', text: '' })}
          >
            Custom
          </AnswerOptionRow>
        ) : null}
      </div>
      {customSelected ? (
        <textarea
          className="ordinus-scrollbar min-h-20 resize-y rounded-md border bg-card p-3 text-sm leading-6 outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          placeholder="Type your own answer"
          value={draft.text}
          disabled={disabled}
          onChange={(event) => onChange({ type: 'custom', text: event.target.value })}
          onKeyDown={(event) =>
            handleAnswerTextareaKeyDown(
              event,
              { type: 'custom', text: event.currentTarget.value },
              onSubmit
            )
          }
        />
      ) : null}
    </div>
  )
}

function handleAnswerTextareaKeyDown(
  event: React.KeyboardEvent<HTMLTextAreaElement>,
  draft: Extract<AnswerDraft, { type: 'custom' | 'text' }>,
  onSubmit: (draft: AnswerDraft) => void
): void {
  if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
    return
  }

  event.preventDefault()
  if (draft.text.trim()) {
    onSubmit(draft)
  }
}

function AnswerOptionRow({
  selected,
  disabled,
  onClick,
  meta,
  children
}: {
  selected: boolean
  disabled: boolean
  onClick: () => void
  meta?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      className={cn(
        'flex min-h-11 w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors disabled:pointer-events-none disabled:opacity-50',
        selected
          ? 'border-primary/50 bg-primary-soft text-foreground shadow-sm'
          : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground'
      )}
      onClick={onClick}
    >
      <span
        className={cn(
          'flex size-4 shrink-0 items-center justify-center rounded-full border',
          selected ? 'border-primary text-primary' : 'border-muted-foreground/40'
        )}
        aria-hidden="true"
      >
        {selected ? <CheckCircle2 className="size-3.5" /> : null}
      </span>
      <span className="min-w-0 flex-1 font-medium leading-5">{children}</span>
      {meta ? (
        <span className="shrink-0 rounded-full bg-status-completed/10 px-2 py-0.5 text-[11px] font-medium text-status-completed">
          {meta}
        </span>
      ) : null}
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
  routingDisabled,
  updatingRoutingMode,
  onChange,
  onRoutingModeChange,
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
  routingDisabled: boolean
  updatingRoutingMode: boolean
  onChange: (value: string) => void
  onRoutingModeChange: (orchestrated: boolean) => void
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
  const orchestrated = routingMode === 'orchestrated'
  const placeholder = orchestrated
    ? 'Describe the work. Mentions are routing hints for Orchestrator.'
    : 'Ask this agent to inspect, explain, plan, or change something in the workspace.'

  useEffect(() => {
    resizeComposerTextarea(textareaRef.current)
  }, [value])

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
    <div className="border-t">
      {blockedReason ? (
        <p className="mx-4 mt-4 rounded-md border border-status-attention/30 bg-status-attention/10 px-3 py-2 text-xs text-status-attention">
          {blockedReason}
        </p>
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
          className="ordinus-scrollbar max-h-40 min-h-14 w-full resize-none overflow-y-hidden bg-transparent px-4 py-3 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-0"
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
      <div className="flex flex-col gap-2 border-t px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {participants.length > 1 ? (
            <>
              <RoutingModeSwitch
                orchestrated={orchestrated}
                disabled={routingDisabled || updatingRoutingMode || sending}
                onChange={onRoutingModeChange}
              />
              <MentionShortcutChips
                participants={participants}
                selectedMentionIds={selectedMentionIds}
                onSelect={selectMention}
              />
            </>
          ) : null}
        </div>
        <Button type="button" size="sm" disabled={disabled} onClick={onSend}>
          {sending ? <Loader2 className="animate-spin" /> : <SendHorizontal />}
          Send
        </Button>
      </div>
    </div>
  )
}

function resizeComposerTextarea(textarea: HTMLTextAreaElement | null): void {
  if (!textarea) return

  textarea.style.height = '0px'
  const nextHeight = Math.min(textarea.scrollHeight, composerTextareaMaxHeight)
  textarea.style.height = `${nextHeight}px`
  textarea.style.overflowY = textarea.scrollHeight > composerTextareaMaxHeight ? 'auto' : 'hidden'
}

function RoutingModeSwitch({
  orchestrated,
  disabled,
  onChange
}: {
  orchestrated: boolean
  disabled: boolean
  onChange: (orchestrated: boolean) => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={orchestrated}
      disabled={disabled}
      title={
        orchestrated
          ? 'Ordinus routes every message before agents run.'
          : 'Messages go directly to mentioned agents.'
      }
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-2 rounded-md border px-2.5 text-xs font-medium transition-colors disabled:pointer-events-none',
        orchestrated
          ? 'border-primary/30 bg-primary-soft text-foreground'
          : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground'
      )}
      onClick={() => onChange(!orchestrated)}
    >
      <span
        className={cn(
          'flex h-4 w-7 items-center rounded-full border p-0.5 transition-colors',
          orchestrated ? 'border-primary bg-primary' : 'border-border bg-card'
        )}
        aria-hidden="true"
      >
        <span
          className={cn(
            'size-2.5 rounded-full bg-background transition-transform duration-150 ease-out',
            orchestrated && 'translate-x-3'
          )}
        />
      </span>
      <span className="shrink-0">Orchestrator</span>
    </button>
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
    if (selectedAgentIds.length < 2 || saving) return

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
          <DialogTitle>New group conversation</DialogTitle>
          <DialogDescription>
            Bring two or more agents together. One-on-one chats live in each agent&apos;s room on
            the Agents screen.
          </DialogDescription>
        </DialogHeader>
        {enabledAgents.length >= 2 ? (
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
            {selectedAgentIds.length === 1 ? (
              <p className="text-xs text-muted-foreground">
                Pick at least one more agent — a 1:1 chat lives in that agent&apos;s room on the
                Agents screen.
              </p>
            ) : null}
            {error ? <InlineError message={error} /> : null}
          </div>
        ) : (
          <EmptyState
            icon={<Bot />}
            title="Need at least two agents"
            detail="Group conversations bring two or more enabled agents together. Enable another agent to start one."
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
            disabled={selectedAgentIds.length < 2 || enabledAgents.length === 0 || saving}
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
            {agents.length > 1 ? 'Start a group conversation' : 'No group conversations yet'}
          </p>
          <p className="text-sm leading-6 text-muted-foreground">
            {agents.length > 1
              ? 'Bring two or more agents together and @mention them to route the work. One-on-one chats live in each agent’s room on the Agents screen.'
              : 'Group conversations need at least two agents. For a 1:1, open an agent’s room on the Agents screen.'}
          </p>
        </div>
        {agents.length > 1 ? (
          <Button type="button" className="mx-auto" onClick={onCreateConversation}>
            <Plus />
            New group conversation
          </Button>
        ) : (
          <Button asChild className="mx-auto">
            <Link to={appRoutePaths.agents}>Go to Agents</Link>
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

function shouldShowTurnStatus(
  turn: ConversationTurn,
  inputRequest: ConversationInputRequest | null
): boolean {
  if (turn.status === 'running') {
    return false
  }

  if (turn.status === 'completed') {
    return false
  }

  if (turn.status === 'waiting_for_user' && inputRequest?.status === 'pending') {
    return false
  }

  return true
}

function getScrollAreaViewport(root: HTMLDivElement | null): HTMLDivElement | null {
  return root?.querySelector<HTMLDivElement>('[data-radix-scroll-area-viewport]') ?? null
}

function isScrollViewportNearBottom(viewport: HTMLDivElement): boolean {
  const remainingScroll = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
  return remainingScroll < 80
}

function isConversationObservationRunning(
  turnStatus: ConversationTurnStatus,
  observedRun: ObservedRunSnapshot
): boolean {
  return turnStatus === 'running' || observedRun.lifecycleStatus === 'running'
}

function shouldShowConversationObservability(
  turnStatus: ConversationTurnStatus,
  observedRun: ObservedRunSnapshot,
  running: boolean
): boolean {
  if (running) {
    return true
  }

  return (
    turnStatus === 'failed' ||
    turnStatus === 'cancelled' ||
    turnStatus === 'waiting_for_user' ||
    observedRun.lifecycleStatus === 'failed' ||
    observedRun.lifecycleStatus === 'cancelled' ||
    observedRun.lifecycleStatus === 'waiting_for_user'
  )
}

function shouldShowConversationActivityLabel(
  observedRun: ObservedRunSnapshot,
  running: boolean
): boolean {
  return (
    !running &&
    (observedRun.lifecycleStatus === 'failed' || observedRun.lifecycleStatus === 'waiting_for_user')
  )
}

function getConversationActivityLabel(observedRun: ObservedRunSnapshot): string {
  const summary = observedRun.latestActivity.trim()
  if (!summary || summary === 'Provider emitted output.') {
    return formatObservedPhase(observedRun.currentPhase)
  }

  return summary
}

function getBlockedReason(
  detail: ConversationDetail,
  participant: ConversationDetail['participants'][number] | null,
  runningTurn: ConversationTurn | null,
  conversationRunning: boolean,
  pendingInputRequest: ConversationInputRequest | undefined
): string {
  if (!runningTurn && conversationRunning && usesOrchestrator(detail)) {
    return 'The advisory discussion is in progress. The moderator is deciding who speaks next.'
  }

  if (runningTurn || conversationRunning) {
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

  return ''
}

function formatStatusLabel(status: string): string {
  return status === 'waiting_for_user' ? 'waiting for user' : status
}

function formatEntryCount(count: number, label: string): string {
  return `${count} ${label}${count === 1 ? '' : 's'}`
}

function hasRunningTurnForParticipant(turns: ConversationTurn[], participantId: string): boolean {
  return turns.some((turn) => turn.participantId === participantId && turn.status === 'running')
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

function shouldAdvanceAfterDraft(question: InteractionQuestion, draft: AnswerDraft): boolean {
  if (question.kind === 'boolean') {
    return draft.type === 'boolean'
  }

  if (question.kind === 'choice') {
    return draft.type === 'option'
  }

  return false
}

function usesOrchestrator(detail: ConversationDetail): boolean {
  return detail.routingMode === 'orchestrated'
}

function getSendTargetParticipantIds(
  detail: ConversationDetail,
  mentions: DraftMention[]
): string[] | undefined {
  const mentionedParticipantIds = getDraftMentionParticipantIds(mentions)

  if (mentionedParticipantIds.length > 0) {
    return mentionedParticipantIds
  }

  if (detail.mode === 'manual' && !usesOrchestrator(detail)) {
    return detail.participants.map((participant) => participant.id)
  }

  return undefined
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function createConversationForAgents(
  agentIds: string[],
  title: string
): Promise<ConversationDetail> {
  const trimmedTitle = title.trim() || undefined

  // ADR-027: the Conversations area is the multi-agent group space. One-on-one
  // chats live in each agent's room on the Agents screen.
  if (agentIds.length < 2) {
    throw new Error('Choose at least two agents for a group conversation.')
  }

  return window.ordinus.conversations.createManual({
    agentIds,
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

  // ADR-032: in orchestrated mode the user addresses the room, not a chosen agent.
  // The moderator decides who responds, so don't pin the user turn to a target.
  if (usesOrchestrator(detail)) {
    return ''
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
