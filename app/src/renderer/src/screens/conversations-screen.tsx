import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  Bot,
  Clock3,
  Loader2,
  MessageSquareText,
  Plus,
  SendHorizontal,
  Square,
  UserRound,
  XCircle
} from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
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
import { SelectControl } from '@renderer/components/select-control'
import { cn } from '@renderer/lib/utils'
import type {
  Agent,
  ConversationDetail,
  ConversationListItem,
  ConversationStatus,
  ConversationTurn,
  ConversationTurnStatus
} from '@shared/contracts'
import { appRoutePaths } from '@renderer/app/routes'

export function ConversationsScreen(): React.JSX.Element {
  const [agents, setAgents] = useState<Agent[]>([])
  const [conversations, setConversations] = useState<ConversationListItem[]>([])
  const [selectedConversationId, setSelectedConversationId] = useState('')
  const [detail, setDetail] = useState<ConversationDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [cancellingTurnId, setCancellingTurnId] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  const runningTurn = detail?.turns.find((turn) => turn.status === 'running') ?? null
  const participant = detail?.participants[0] ?? null
  const composerBlocked =
    !detail || Boolean(runningTurn) || sending || !participant || !message.trim()
  const latestTurn = detail?.turns.at(-1)
  const latestTurnSignature = latestTurn
    ? `${detail?.id}:${latestTurn.id}:${latestTurn.status}:${latestTurn.content}`
    : detail?.id

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
    setSelectedConversationId(conversationId)
    setDetail(await window.ordinus.conversations.get({ conversationId }))
  }

  async function handleCreateConversation(agentId: string, title: string): Promise<void> {
    const nextDetail = await window.ordinus.conversations.createDirect({
      agentId,
      title: title.trim() || undefined
    })
    setDetail(nextDetail)
    setSelectedConversationId(nextDetail.id)
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
        message
      })
      setMessage('')
      setDetail(nextDetail)
      await loadConversations(nextDetail.id)
    } catch (sendError) {
      setError(getErrorMessage(sendError, 'Message could not be sent.'))
    } finally {
      setSending(false)
    }
  }

  async function handleCancelTurn(turnId: string): Promise<void> {
    try {
      setCancellingTurnId(turnId)
      const nextDetail = await window.ordinus.conversations.cancelTurn({ turnId })
      setDetail(nextDetail)
      await loadConversations(nextDetail.id)
    } catch (cancelError) {
      setError(getErrorMessage(cancelError, 'Turn could not be cancelled.'))
    } finally {
      setCancellingTurnId('')
    }
  }

  return (
    <div className="grid h-[calc(100vh-7rem)] min-h-0 gap-4 overflow-hidden py-6 xl:grid-cols-[280px_minmax(0,1fr)_280px]">
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
                runningTurn={runningTurn}
                cancellingTurnId={cancellingTurnId}
                onCancelTurn={(turnId) => void handleCancelTurn(turnId)}
              />
              <ScrollArea className="min-h-0 flex-1">
                <CardContent className="grid gap-3 p-4">
                  {detail.turns.length > 0 ? (
                    detail.turns.map((turn) => <TurnCard key={turn.id} turn={turn} />)
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
                blockedReason={getBlockedReason(detail, participant, runningTurn)}
                disabled={composerBlocked}
                sending={sending}
                onChange={setMessage}
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

      <ParticipantsPanel detail={detail} agents={agents} runningTurn={runningTurn} />

      <CreateConversationDialog
        agents={agents}
        open={createOpen}
        onCreateConversation={handleCreateConversation}
        onOpenChange={setCreateOpen}
      />
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
  runningTurn,
  cancellingTurnId,
  onCancelTurn
}: {
  detail: ConversationDetail
  participantName: string
  runningTurn: ConversationTurn | null
  cancellingTurnId: string
  onCancelTurn: (turnId: string) => void
}): React.JSX.Element {
  return (
    <CardHeader className="border-b bg-accent/50">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <CardTitle className="truncate">{detail.title}</CardTitle>
          <CardDescription className="mt-1 flex flex-wrap items-center gap-2">
            <span className="rounded-full border bg-card px-2 py-0.5 text-xs">Direct</span>
            <span>{participantName}</span>
          </CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusPill status={detail.status} />
          {runningTurn ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={cancellingTurnId === runningTurn.id}
              onClick={() => onCancelTurn(runningTurn.id)}
            >
              {cancellingTurnId === runningTurn.id ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Square />
              )}
              Stop
            </Button>
          ) : null}
        </div>
      </div>
    </CardHeader>
  )
}

function TurnCard({ turn }: { turn: ConversationTurn }): React.JSX.Element {
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
          <p className="truncate text-sm font-semibold">{isUser ? 'You' : 'Agent'}</p>
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
    </article>
  )
}

function Composer({
  value,
  blockedReason,
  disabled,
  sending,
  onChange,
  onSend
}: {
  value: string
  blockedReason: string
  disabled: boolean
  sending: boolean
  onChange: (value: string) => void
  onSend: () => void
}): React.JSX.Element {
  return (
    <div className="border-t bg-card p-4">
      {blockedReason ? (
        <p className="mb-3 rounded-md border border-status-attention/30 bg-status-attention/10 px-3 py-2 text-xs text-status-attention">
          {blockedReason}
        </p>
      ) : null}
      <div className="grid gap-3">
        <textarea
          className="ordinus-scrollbar max-h-52 min-h-28 resize-y overflow-y-auto rounded-lg border bg-card p-3 text-sm leading-6 text-foreground shadow-none outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          placeholder="Ask this agent to inspect, explain, plan, or change something in the workspace."
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              onSend()
            }
          }}
        />
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

function ParticipantsPanel({
  detail,
  agents,
  runningTurn
}: {
  detail: ConversationDetail | null
  agents: Agent[]
  runningTurn: ConversationTurn | null
}): React.JSX.Element {
  return (
    <aside className="min-h-0 min-w-0">
      <Card className="flex h-full min-h-0 flex-col overflow-hidden">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2">
            <Bot className="size-4 text-primary" />
            Participants
          </CardTitle>
          <CardDescription>
            {detail
              ? `${detail.participants.length} agent${detail.participants.length === 1 ? '' : 's'}`
              : 'No conversation selected'}
          </CardDescription>
        </CardHeader>
        <ScrollArea className="min-h-0 flex-1">
          <CardContent className="grid min-w-0 gap-3 p-4">
            {detail && detail.participants.length > 0 ? (
              <>
                {detail.participants.map((participant) => {
                  const agent = agents.find((item) => item.id === participant.agentId)
                  return (
                    <ParticipantRow
                      key={participant.id}
                      name={participant.agentName}
                      role={participant.agentRole}
                      enabled={agent?.enabled ?? true}
                      status={runningTurn ? 'running' : participant.status}
                    />
                  )
                })}
                <Button asChild variant="outline" size="sm" className="mt-1">
                  <Link to={appRoutePaths.agents}>Manage agents</Link>
                </Button>
              </>
            ) : (
              <p className="text-sm leading-6 text-muted-foreground">
                Select a conversation to see the active agent and session state.
              </p>
            )}
          </CardContent>
        </ScrollArea>
      </Card>
    </aside>
  )
}

function ParticipantRow({
  name,
  role,
  enabled,
  status
}: {
  name: string
  role: string
  enabled: boolean
  status: string
}): React.JSX.Element {
  return (
    <div className="grid min-w-0 gap-2 rounded-lg border bg-card p-3">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">{role}</p>
        </div>
        <span
          className={cn(
            'mt-1 size-2.5 shrink-0 rounded-full',
            !enabled && 'bg-muted-foreground',
            enabled && status === 'ready' && 'bg-status-completed',
            enabled && status === 'running' && 'bg-status-running',
            enabled && status === 'failed' && 'bg-status-failed',
            enabled && status === 'cancelled' && 'bg-status-planned'
          )}
        />
      </div>
      <span className="w-fit rounded-full border bg-accent px-2 py-0.5 text-xs font-medium capitalize text-muted-foreground">
        {enabled ? status : 'disabled'}
      </span>
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
  onCreateConversation: (agentId: string, title: string) => Promise<void>
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const enabledAgents = useMemo(() => agents.filter((agent) => agent.enabled), [agents])
  const [agentId, setAgentId] = useState('')
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const selectedAgentId = agentId || enabledAgents[0]?.id || ''

  function handleOpenChange(nextOpen: boolean): void {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      setAgentId('')
      setTitle('')
      setError('')
    }
  }

  async function handleCreate(): Promise<void> {
    if (!selectedAgentId || saving) return

    try {
      setSaving(true)
      setError('')
      await onCreateConversation(selectedAgentId, title)
      setAgentId('')
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
            Start a direct session-backed conversation with one agent.
          </DialogDescription>
        </DialogHeader>
        {enabledAgents.length > 0 ? (
          <div className="grid gap-3">
            <label className="grid gap-2">
              <span className="text-xs font-medium text-muted-foreground">Agent</span>
              <SelectControl value={selectedAgentId} onChange={setAgentId}>
                {enabledAgents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </SelectControl>
            </label>
            <label className="grid gap-2">
              <span className="text-xs font-medium text-muted-foreground">Title</span>
              <Input
                placeholder="Defaults to the agent name"
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
            disabled={!selectedAgentId || enabledAgents.length === 0 || saving}
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
              ? 'Direct conversations keep each agent in its own provider session.'
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
        status === 'failed' && 'bg-status-failed',
        status === 'cancelled' && 'bg-status-planned'
      )}
    />
  )
}

function StatusPill({ status }: { status: ConversationStatus }): React.JSX.Element {
  return (
    <span className="rounded-full border bg-card px-2.5 py-1 text-xs font-medium capitalize text-muted-foreground">
      {status}
    </span>
  )
}

function TurnStatus({ status }: { status: ConversationTurnStatus }): React.JSX.Element {
  const Icon = status === 'running' ? Clock3 : status === 'cancelled' ? XCircle : AlertTriangle

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-xs font-medium capitalize',
        status === 'running' && 'text-status-running',
        status === 'failed' && 'text-status-failed',
        status === 'cancelled' && 'text-muted-foreground'
      )}
    >
      <Icon className="size-3.5" />
      {status}
    </span>
  )
}

function getBlockedReason(
  detail: ConversationDetail,
  participant: ConversationDetail['participants'][number] | null,
  runningTurn: ConversationTurn | null
): string {
  if (runningTurn) {
    return 'This conversation is running. Stop it or wait for the agent response.'
  }

  if (!participant) {
    return 'This conversation has no agent participant.'
  }

  if (detail.status === 'cancelled') {
    return 'This conversation was cancelled. Send a new message to continue.'
  }

  return ''
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
