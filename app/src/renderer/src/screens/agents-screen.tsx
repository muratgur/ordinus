import { useCallback, useEffect, useMemo, useRef, useState, useId } from 'react'
import {
  AlertTriangle,
  Bot,
  CalendarClock,
  FileText,
  Info,
  Loader2,
  MessageSquareText,
  Pin,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  UserRound,
  WandSparkles
} from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { SelectControl } from '@renderer/components/select-control'
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
import { Switch } from '@renderer/components/ui/switch'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { cn } from '@renderer/lib/utils'
import { notify } from '@renderer/lib/notifications'
import { AgentCreationFlow } from '@renderer/components/agent-creation-flow'
import { AgentAvatar } from '@renderer/components/agent-avatar'
import { AgentAvatarPicker } from '@renderer/components/agent-avatar-picker'
import { AgentRoom } from '@renderer/components/agent-room'
import { AGENT_COLORS, AGENT_SYMBOLS, AVATAR_DELIMITER } from '@renderer/components/agent-palette'
import type {
  Agent,
  AgentExtraDirectoryEntry,
  AgentMemoryRule,
  AgentSandbox,
  AgentSchedule,
  AgentSkill,
  AgentUpdateSettingsInput,
  AgentRoomSummary,
  ConnectorSummary,
  ObservedRunSnapshot,
  ProviderId,
  WorkRequest
} from '@shared/contracts'
import { CreateScheduleDialog } from './schedules-screen'
import { disableReasonLabel } from './schedule-labels'
import { getDefaultModelForProvider, getProviderModelOptions } from '@shared/provider-models'

// Roster presence (ADR-027 Phase 7): a teammate is Working when any of their
// runs is in flight, otherwise Available / Needs setup / Off.
type AgentPresence = 'working' | 'available' | 'needs-setup' | 'off'
// ADR-027 agent home: the colleague profile tabs. Chat is the 1:1 room (built
// in Phase 2); CV/Agenda/About currently wrap the existing panels and are
// reorganized in Phases 4–6.
type AgentTab = 'chat' | 'cv' | 'agenda' | 'about'
// The Trust & access draft (ADR-027 Phase 6). Identity (name/role/enabled/avatar)
// lives in the header profile dialog and capabilities/connectors on the CV tab;
// all write through the same updateSettings IPC, sourced from the live agent.
type SettingsDraft = {
  providerId: ProviderId
  model: string
  sandbox: AgentSandbox
}

const sandboxOptions: Array<{
  value: AgentSandbox
  label: string
  description: string
  badge?: string
}> = [
  {
    value: 'read-only',
    label: 'Read only',
    description: 'Inspect context and propose changes without editing files.'
  },
  {
    value: 'workspace-write',
    label: 'Workspace write',
    description: 'Edit files inside this workspace for normal coding tasks.',
    badge: 'Recommended'
  },
  {
    value: 'full-access',
    label: 'Full access',
    description: 'Allow broader local operations for trusted agents and tasks only.'
  }
]

const tabs: Array<{ id: AgentTab; label: string; icon: typeof Bot }> = [
  { id: 'chat', label: 'Chat', icon: MessageSquareText },
  { id: 'cv', label: 'CV', icon: FileText },
  { id: 'agenda', label: 'Agenda', icon: CalendarClock },
  { id: 'about', label: 'About', icon: UserRound }
]

const WORKING_LIFECYCLE = new Set(['queued', 'starting', 'running'])

function getAgentPresence(agent: Agent, busy: boolean): AgentPresence {
  if (busy) return 'working'
  if (!agent.enabled) return 'off'
  if (!agent.instructions.trim()) return 'needs-setup'
  return 'available'
}

export function AgentsScreen(): React.JSX.Element {
  const [agents, setAgents] = useState<Agent[]>([])
  const [roomSummaries, setRoomSummaries] = useState<AgentRoomSummary[]>([])
  const [unreadAgentIds, setUnreadAgentIds] = useState<Set<string>>(new Set())
  const [selectedAgentId, setSelectedAgentId] = useState<string>('')
  const [activeTab, setActiveTab] = useState<AgentTab>('chat')
  const [createAgentOpen, setCreateAgentOpen] = useState(false)
  // The just-created agent greets itself on first room open (ADR-027 Phase 8).
  const [greetAgentId, setGreetAgentId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteTargetAgentId, setDeleteTargetAgentId] = useState('')
  const [deleting, setDeleting] = useState(false)
  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? agents[0] ?? null,
    [agents, selectedAgentId]
  )
  const deleteTargetAgent = useMemo(
    () => agents.find((agent) => agent.id === deleteTargetAgentId) ?? null,
    [agents, deleteTargetAgentId]
  )

  // Live "Working…" presence: track in-flight runs across surfaces. Seed from
  // the workboard, then keep updated from the global run-changed stream (which
  // covers both workboard and conversation runs).
  const observedRunsRef = useRef<Map<string, ObservedRunSnapshot>>(new Map())
  const roomSummariesRef = useRef<Map<string, AgentRoomSummary>>(new Map())
  const selectedAgentIdRef = useRef('')
  const roomSummariesLoadedRef = useRef(false)
  const [busyAgentIds, setBusyAgentIds] = useState<Set<string>>(new Set())
  const recomputeBusy = useCallback((): void => {
    const next = new Set<string>()
    for (const run of observedRunsRef.current.values()) {
      if (run.assignedAgentId && WORKING_LIFECYCLE.has(run.lifecycleStatus)) {
        next.add(run.assignedAgentId)
      }
    }
    setBusyAgentIds(next)
  }, [])

  useEffect(() => {
    selectedAgentIdRef.current = selectedAgent?.id ?? ''
  }, [selectedAgent?.id])

  const applyRoomSummaries = useCallback((nextSummaries: AgentRoomSummary[]): void => {
    const previousByAgentId = roomSummariesRef.current
    const nextByAgentId = new Map(nextSummaries.map((summary) => [summary.agentId, summary]))
    const selectedId = selectedAgentIdRef.current

    if (roomSummariesLoadedRef.current) {
      setUnreadAgentIds((current) => {
        const nextUnread = new Set(current)
        for (const summary of nextSummaries) {
          const previous = previousByAgentId.get(summary.agentId)
          const hasNewAgentMessage =
            summary.lastSpeaker === 'agent' &&
            summary.lastActivityAt &&
            summary.lastActivityAt !== previous?.lastActivityAt

          if (summary.agentId === selectedId) {
            nextUnread.delete(summary.agentId)
          } else if (hasNewAgentMessage) {
            nextUnread.add(summary.agentId)
          }
        }
        return nextUnread
      })
    }

    roomSummariesLoadedRef.current = true
    roomSummariesRef.current = nextByAgentId
    setRoomSummaries(nextSummaries)
  }, [])

  const reloadRoomSummaries = useCallback(async (): Promise<void> => {
    applyRoomSummaries(await window.ordinus.conversations.listAgentRoomSummaries())
  }, [applyRoomSummaries])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      window.ordinus.observability
        .listWorkboard()
        .then((runs) => {
          if (cancelled) return
          runs.forEach((run) => observedRunsRef.current.set(run.id, run))
          recomputeBusy()
        })
        .catch(() => {})
    })
    const off = window.ordinus.observability.onRunChanged((snapshot) => {
      observedRunsRef.current.set(snapshot.id, snapshot)
      recomputeBusy()
      if (snapshot.sourceSurface === 'conversation') {
        void reloadRoomSummaries()
      }
    })
    return () => {
      cancelled = true
      off()
    }
  }, [recomputeBusy, reloadRoomSummaries])

  const handleRoomChanged = useCallback((): void => {
    void reloadRoomSummaries()
  }, [reloadRoomSummaries])

  const reloadAgents = useCallback(async (): Promise<void> => {
    try {
      setLoading(true)
      const [nextAgents, nextRoomSummaries] = await Promise.all([
        window.ordinus.agents.list(),
        window.ordinus.conversations.listAgentRoomSummaries()
      ])
      setAgents(nextAgents)
      applyRoomSummaries(nextRoomSummaries)
      setSelectedAgentId((current) => {
        if (nextAgents.some((agent) => agent.id === current)) {
          return current
        }
        return nextAgents[0]?.id ?? ''
      })
      setError('')
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Agents could not be loaded.'))
    } finally {
      setLoading(false)
    }
  }, [applyRoomSummaries])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) void reloadAgents()
    })
    return () => {
      cancelled = true
    }
  }, [reloadAgents])

  function handleAgentSaved(nextAgent: Agent): void {
    setAgents((currentAgents) => {
      if (currentAgents.some((agent) => agent.id === nextAgent.id)) {
        return currentAgents.map((agent) => (agent.id === nextAgent.id ? nextAgent : agent))
      }
      return [nextAgent, ...currentAgents]
    })
    setSelectedAgentId(nextAgent.id)
    setUnreadAgentIds((current) => {
      if (!current.has(nextAgent.id)) return current
      const next = new Set(current)
      next.delete(nextAgent.id)
      return next
    })
  }

  function handleAgentCreated(nextAgent: Agent): void {
    handleAgentSaved(nextAgent)
    setGreetAgentId(nextAgent.id)
    setActiveTab('chat')
    setCreateAgentOpen(false)
  }

  function handleAgentDeleted(agentId: string): void {
    const nextAgents = agents.filter((agent) => agent.id !== agentId)

    setAgents(nextAgents)
    setUnreadAgentIds((current) => {
      if (!current.has(agentId)) return current
      const next = new Set(current)
      next.delete(agentId)
      return next
    })
    setSelectedAgentId((current) => {
      if (current !== agentId) {
        return current
      }
      return nextAgents[0]?.id ?? ''
    })
    setActiveTab('chat')
  }

  async function handleDeleteAgent(): Promise<void> {
    if (!deleteTargetAgent) {
      return
    }

    try {
      setDeleting(true)
      await window.ordinus.agents.delete({ id: deleteTargetAgent.id })
      setDeleteOpen(false)
      handleAgentDeleted(deleteTargetAgent.id)
      setDeleteTargetAgentId('')
    } catch (deleteError) {
      notify.error({
        title: 'Agent could not be deleted',
        description: getErrorMessage(deleteError, 'Please try again.')
      })
    } finally {
      setDeleting(false)
    }
  }

  async function handleTogglePinned(agent: Agent): Promise<void> {
    const previousAgents = agents
    const pinned = !agent.pinnedAt
    const now = new Date().toISOString()
    const optimisticPinnedAt = pinned ? now : null

    setAgents((currentAgents) =>
      currentAgents.map((currentAgent) =>
        currentAgent.id === agent.id
          ? { ...currentAgent, pinnedAt: optimisticPinnedAt, updatedAt: now }
          : currentAgent
      )
    )

    try {
      const nextAgent = await window.ordinus.agents.setPinned({ id: agent.id, pinned })
      setAgents((currentAgents) =>
        currentAgents.map((currentAgent) =>
          currentAgent.id === nextAgent.id ? nextAgent : currentAgent
        )
      )
    } catch (pinError) {
      setAgents(previousAgents)
      notify.error({
        title: pinned ? 'Agent could not be pinned' : 'Agent could not be unpinned',
        description: getErrorMessage(pinError, 'Please try again.')
      })
    }
  }

  return (
    <div className="grid min-h-[calc(100vh-3rem)] gap-4 py-4 xl:h-[calc(100vh-3rem)] xl:min-h-0 xl:grid-cols-[280px_minmax(0,1fr)] xl:overflow-hidden">
      <AgentLibrary
        agents={agents}
        loading={loading}
        selectedAgentId={selectedAgent?.id ?? ''}
        busyAgentIds={busyAgentIds}
        roomSummaries={roomSummaries}
        unreadAgentIds={unreadAgentIds}
        onCreateAgent={() => setCreateAgentOpen(true)}
        onDeleteAgent={(agent) => {
          setDeleteTargetAgentId(agent.id)
          setDeleteOpen(true)
        }}
        onSelectAgent={(agentId) => {
          setUnreadAgentIds((current) => {
            if (!current.has(agentId)) return current
            const next = new Set(current)
            next.delete(agentId)
            return next
          })
          setSelectedAgentId(agentId)
        }}
        onTogglePinned={(agent) => void handleTogglePinned(agent)}
      />

      <main className="min-w-0 xl:min-h-0">
        <Card className="flex min-h-[760px] flex-col overflow-hidden xl:h-full xl:min-h-0">
          {error ? (
            <CardContent className="flex min-h-0 flex-1 flex-col p-0">
              <EmptyState icon={<Bot />} title="Agents unavailable" detail={error} />
            </CardContent>
          ) : selectedAgent ? (
            <>
              <AgentIdentityHeader
                agent={selectedAgent}
                agents={agents}
                onAgentSaved={handleAgentSaved}
              />
              <div className="flex items-stretch gap-0 border-b">
                {tabs.map((tab) => {
                  const Icon = tab.icon
                  const isActive = activeTab === tab.id
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={cn(
                        'relative flex items-center gap-1.5 px-4 py-3 text-[12.5px] font-medium transition-colors',
                        isActive
                          ? 'text-foreground after:absolute after:bottom-0 after:left-4 after:right-4 after:h-[2px] after:rounded-t-sm after:bg-primary after:content-[""]'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <Icon className="size-3.5 shrink-0" />
                      {tab.label}
                    </button>
                  )
                })}
              </div>

              <CardContent className="flex min-h-0 flex-1 flex-col p-0">
                <AgentTabContent
                  agent={selectedAgent}
                  activeTab={activeTab}
                  autoGreet={greetAgentId === selectedAgent.id}
                  onAgentSaved={handleAgentSaved}
                  onRoomChanged={handleRoomChanged}
                />
              </CardContent>
            </>
          ) : (
            <CardContent className="flex min-h-0 flex-1 flex-col p-0">
              <EmptyState
                icon={<Bot />}
                title={loading ? 'Loading agents' : 'No agents yet'}
                detail={
                  loading
                    ? 'Agent records are being loaded from local storage.'
                    : 'Bring an agent to life to start working with a new teammate.'
                }
              />
            </CardContent>
          )}
        </Card>
      </main>

      <AgentCreationFlow
        open={createAgentOpen}
        onOpenChange={setCreateAgentOpen}
        onAgentCreated={handleAgentCreated}
        existingAgentNames={agents.map((agent) => agent.name)}
      />

      {deleteTargetAgent ? (
        <DeleteAgentDialog
          agentId={deleteTargetAgent.id}
          agentName={deleteTargetAgent.name}
          deleting={deleting}
          open={deleteOpen}
          onDelete={() => void handleDeleteAgent()}
          onOpenChange={(open) => {
            setDeleteOpen(open)
            if (!open && !deleting) {
              setDeleteTargetAgentId('')
            }
          }}
        />
      ) : null}
    </div>
  )
}

function AgentLibrary({
  agents,
  loading,
  selectedAgentId,
  busyAgentIds,
  roomSummaries,
  unreadAgentIds,
  onCreateAgent,
  onDeleteAgent,
  onSelectAgent,
  onTogglePinned
}: {
  agents: Agent[]
  loading: boolean
  selectedAgentId: string
  busyAgentIds: Set<string>
  roomSummaries: AgentRoomSummary[]
  unreadAgentIds: Set<string>
  onCreateAgent: () => void
  onDeleteAgent: (agent: Agent) => void
  onSelectAgent: (agentId: string) => void
  onTogglePinned: (agent: Agent) => void
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const roomSummaryByAgentId = useMemo(
    () => new Map(roomSummaries.map((summary) => [summary.agentId, summary])),
    [roomSummaries]
  )
  const normalizedQuery = query.trim().toLowerCase()
  const chatRows = agents
    .map((agent) => {
      const summary = roomSummaryByAgentId.get(agent.id)
      const busy = busyAgentIds.has(agent.id)
      return {
        agent,
        busy,
        pinned: Boolean(agent.pinnedAt),
        unread: unreadAgentIds.has(agent.id),
        summary,
        preview: getAgentRoomPreview(summary, busy),
        timestampLabel: formatAgentRoomTimestamp(summary?.lastActivityAt ?? null),
        sortTime: getAgentRoomSortTime(agent, summary)
      }
    })
    .filter(({ agent }) => {
      const searchable = `${agent.name} ${agent.role} ${agent.capabilities}`.toLowerCase()
      return searchable.includes(normalizedQuery)
    })
    .sort(compareAgentChatRows)
  const lastPinnedIndex = chatRows.reduce((lastIndex, row, index) => {
    return row.pinned ? index : lastIndex
  }, -1)

  return (
    <aside className="min-w-0 xl:min-h-0">
      <Card className="flex flex-col overflow-hidden xl:h-full xl:min-h-0">
        <CardHeader className="border-b">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2">
                <Bot className="size-4 text-primary" />
                Agents
              </CardTitle>
              <CardDescription>
                {loading ? 'Loading' : `${agents.length} agent${agents.length === 1 ? '' : 's'}`}
              </CardDescription>
            </div>
            <Button size="icon" aria-label="Create agent" onClick={onCreateAgent}>
              <Plus />
            </Button>
          </div>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search agents"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </CardHeader>

        <CardContent className="ordinus-scrollbar grid auto-rows-min content-start gap-0 p-2 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
          {chatRows.map(({ agent, busy, pinned, unread, preview, timestampLabel }, index) => (
            <div key={agent.id}>
              <div
                role="button"
                tabIndex={0}
                className={cn(
                  'group relative grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 rounded-md px-3 py-2 text-left transition-colors hover:bg-accent/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  selectedAgentId === agent.id && 'bg-primary-soft/70 pl-3.5'
                )}
                onClick={() => onSelectAgent(agent.id)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) {
                    return
                  }
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onSelectAgent(agent.id)
                  }
                }}
              >
                {selectedAgentId === agent.id ? (
                  <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary" />
                ) : null}
                <div className="relative row-span-2 size-9 shrink-0">
                  <AgentAvatar avatar={agent.avatar} size={36} />
                  <PresenceDot
                    presence={getAgentPresence(agent, busy)}
                    className="absolute bottom-0 right-0 ring-2 ring-background"
                  />
                </div>
                <p className="flex min-w-0 items-center gap-1.5 truncate text-sm font-semibold leading-5">
                  <span className="min-w-0 truncate">{agent.name}</span>
                  {pinned ? <Pin className="size-3 shrink-0 text-primary" /> : null}
                </p>
                <div className="relative min-w-16 pr-3 text-right">
                  <span
                    className={cn(
                      'text-[11px] transition-opacity group-hover:opacity-0 group-focus-within:opacity-0',
                      unread ? 'font-semibold text-foreground' : 'text-muted-foreground'
                    )}
                  >
                    {timestampLabel}
                  </span>
                  <div className="absolute right-0 top-1/2 flex -translate-y-1/2 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    <button
                      type="button"
                      aria-label={pinned ? `Unpin ${agent.name}` : `Pin ${agent.name}`}
                      title={pinned ? 'Unpin agent' : 'Pin agent'}
                      className={cn(
                        'flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        pinned && 'text-primary'
                      )}
                      onClick={(event) => {
                        event.stopPropagation()
                        onTogglePinned(agent)
                      }}
                    >
                      <Pin className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${agent.name}`}
                      title="Delete agent"
                      className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-status-attention/10 hover:text-status-attention focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={(event) => {
                        event.stopPropagation()
                        onDeleteAgent(agent)
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
                <p
                  className={cn(
                    'col-start-2 col-end-4 min-w-0 truncate text-xs leading-5',
                    unread ? 'font-semibold text-foreground' : 'text-muted-foreground'
                  )}
                >
                  {preview}
                </p>
                {unread ? (
                  <span className="absolute right-2 top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-primary transition-all group-hover:right-14 group-focus-within:right-14" />
                ) : null}
              </div>
              {index === lastPinnedIndex && index < chatRows.length - 1 ? (
                <div className="mx-3 my-1 border-t border-dashed border-border" />
              ) : null}
            </div>
          ))}

          {!loading && chatRows.length === 0 ? (
            <div className="m-2 rounded-lg border border-dashed bg-accent p-4 text-sm text-muted-foreground">
              {agents.length === 0 ? 'No agents yet.' : 'No agents match this search.'}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </aside>
  )
}

type AgentChatRow = {
  agent: Agent
  busy: boolean
  pinned: boolean
  unread: boolean
  summary: AgentRoomSummary | undefined
  preview: string
  timestampLabel: string
  sortTime: number
}

function compareAgentChatRows(left: AgentChatRow, right: AgentChatRow): number {
  const leftPinned = left.pinned ? 1 : 0
  const rightPinned = right.pinned ? 1 : 0
  if (leftPinned !== rightPinned) return rightPinned - leftPinned

  const leftPending = left.summary?.hasPendingInputRequest ? 1 : 0
  const rightPending = right.summary?.hasPendingInputRequest ? 1 : 0
  if (leftPending !== rightPending) return rightPending - leftPending

  const leftBusy = left.busy ? 1 : 0
  const rightBusy = right.busy ? 1 : 0
  if (leftBusy !== rightBusy) return rightBusy - leftBusy

  return right.sortTime - left.sortTime
}

function getAgentRoomPreview(summary: AgentRoomSummary | undefined, busy: boolean): string {
  if (summary?.hasPendingInputRequest) return 'Needs your answer'
  if (busy) return 'Working...'
  if (!summary?.lastPreview.trim()) return 'No messages yet'
  if (summary.lastSpeaker === 'user') return `You: ${summary.lastPreview}`
  return summary.lastPreview
}

function getAgentRoomSortTime(agent: Agent, summary: AgentRoomSummary | undefined): number {
  return Date.parse(summary?.lastActivityAt ?? agent.createdAt) || 0
}

function formatAgentRoomTimestamp(iso: string | null): string {
  if (!iso) return 'New'

  const timestamp = new Date(iso)
  if (Number.isNaN(timestamp.getTime())) return 'New'

  const now = new Date()
  const today = startOfLocalDay(now)
  const messageDay = startOfLocalDay(timestamp)
  const dayMs = 24 * 60 * 60 * 1000
  const dayDiff = Math.floor((today.getTime() - messageDay.getTime()) / dayMs)

  if (dayDiff === 0) {
    return timestamp.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  }
  if (dayDiff === 1) return 'Yesterday'
  if (dayDiff > 1 && dayDiff < 7) {
    return timestamp.toLocaleDateString(undefined, { weekday: 'short' })
  }
  return timestamp.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function AgentIdentityHeader({
  agent,
  agents,
  onAgentSaved
}: {
  agent: Agent
  agents: Agent[]
  onAgentSaved: (agent: Agent) => void
}): React.JSX.Element {
  const [profileOpen, setProfileOpen] = useState(false)

  return (
    <div className="flex items-center gap-3 border-b px-3 py-2.5">
      <button
        type="button"
        aria-label={`Edit ${agent.name}'s profile`}
        onClick={() => setProfileOpen(true)}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md p-1 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <AgentAvatar avatar={agent.avatar} size={44} className="shrink-0" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight">{agent.name}</p>
          <p className="truncate text-xs text-muted-foreground">{agent.role}</p>
        </div>
      </button>
      <EditProfileDialog
        key={agent.id}
        agent={agent}
        agents={agents}
        open={profileOpen}
        onOpenChange={setProfileOpen}
        onAgentSaved={onAgentSaved}
      />
    </div>
  )
}

// Identity editor reached from the header (ADR-027): avatar, name, role, and
// whether the teammate is active. Persists through the shared settings payload.
function EditProfileDialog({
  agent,
  agents,
  open,
  onOpenChange,
  onAgentSaved
}: {
  agent: Agent
  agents: Agent[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onAgentSaved: (agent: Agent) => void
}): React.JSX.Element {
  const [savedColor, savedSymbol] = agent.avatar.split(AVATAR_DELIMITER)
  const [color, setColor] = useState(savedColor || AGENT_COLORS[0]?.id || '')
  const [symbol, setSymbol] = useState(savedSymbol || AGENT_SYMBOLS[0]?.id || '')
  const [name, setName] = useState(agent.name)
  const [role, setRole] = useState(agent.role)
  const [enabled, setEnabled] = useState(agent.enabled)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const nextAvatar = `${color}${AVATAR_DELIMITER}${symbol}`
  const nameIssue = getAgentNameIssue(name, agent.name, agents, agent.id)
  const canSave = !nameIssue && Boolean(role.trim()) && !saving

  async function handleSave(): Promise<void> {
    if (!canSave) {
      return
    }
    try {
      setSaving(true)
      setError('')
      const nextAgent = await window.ordinus.agents.updateSettings(
        buildAgentSettingsPayload(agent, {
          name: name.trim(),
          role: role.trim(),
          enabled,
          avatar: nextAvatar
        })
      )
      onAgentSaved(nextAgent)
      onOpenChange(false)
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Profile could not be saved.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit profile</DialogTitle>
          <DialogDescription>How {agent.name} shows up on your team.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-1">
          <div className="flex flex-col items-center gap-3">
            <AgentAvatar avatar={nextAvatar} size={56} />
            <AgentAvatarPicker
              color={color}
              symbol={symbol}
              onColorChange={setColor}
              onSymbolChange={setSymbol}
              className="w-full"
            />
          </div>
          <AgentNameField
            name={name}
            enabled={enabled}
            nameIssue={nameIssue}
            onNameChange={setName}
            onEnabledChange={setEnabled}
          />
          <FormField label="Role">
            <Input
              maxLength={120}
              placeholder="Brief description of this agent's purpose"
              value={role}
              onChange={(event) => setRole(event.target.value)}
            />
          </FormField>
        </div>
        {error ? <InlineError message={error} /> : null}
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={!canSave} onClick={() => void handleSave()}>
            {saving ? <Loader2 className="animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AgentTabContent({
  agent,
  activeTab,
  autoGreet,
  onAgentSaved,
  onRoomChanged
}: {
  agent: Agent
  activeTab: AgentTab
  autoGreet: boolean
  onAgentSaved: (agent: Agent) => void
  onRoomChanged: () => void
}): React.JSX.Element {
  if (activeTab === 'chat') {
    return (
      <AgentRoom key={agent.id} agent={agent} autoGreet={autoGreet} onRoomChanged={onRoomChanged} />
    )
  }

  if (activeTab === 'cv') {
    return <CvTab key={agent.id} agent={agent} onAgentSaved={onAgentSaved} />
  }

  if (activeTab === 'agenda') {
    return <AgentSchedulesPanel key={agent.id} agent={agent} />
  }

  return <AboutTab key={agent.id} agent={agent} onAgentSaved={onAgentSaved} />
}

// CV tab (ADR-027 Phase 4): the colleague's résumé — what they're great at
// (capabilities), the tools they're fluent with (connectors), and their skills.
// Capabilities and connectors persist through the shared updateSettings IPC.
function buildAgentSettingsPayload(
  agent: Agent,
  overrides: Partial<{
    name: string
    role: string
    capabilities: string
    providerId: ProviderId
    model: string
    sandbox: AgentSandbox
    connectors: string[]
    avatar: string
    enabled: boolean
  }>
): AgentUpdateSettingsInput {
  return {
    id: agent.id,
    name: overrides.name ?? agent.name,
    role: overrides.role ?? agent.role,
    capabilities: overrides.capabilities ?? agent.capabilities,
    providerId: overrides.providerId ?? agent.providerId,
    model: overrides.model ?? agent.model,
    sandbox: overrides.sandbox ?? agent.sandbox,
    connectors: overrides.connectors ?? agent.connectors,
    avatar: overrides.avatar ?? agent.avatar,
    enabled: overrides.enabled ?? agent.enabled
  }
}

function CvTab({
  agent,
  onAgentSaved
}: {
  agent: Agent
  onAgentSaved: (agent: Agent) => void
}): React.JSX.Element {
  return (
    <ScrollArea className="h-full min-h-0">
      <div className="grid gap-6 p-5">
        <CvCapabilities agent={agent} onAgentSaved={onAgentSaved} />
        <CvConnectors agent={agent} onAgentSaved={onAgentSaved} />
      </div>
      <div className="border-t">
        <SkillsPanel agent={agent} />
      </div>
    </ScrollArea>
  )
}

function CvCapabilities({
  agent,
  onAgentSaved
}: {
  agent: Agent
  onAgentSaved: (agent: Agent) => void
}): React.JSX.Element {
  const [value, setValue] = useState(agent.capabilities)
  const [improving, setImproving] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const dirty = value !== agent.capabilities

  async function handleImprove(): Promise<void> {
    if (improving) {
      return
    }
    const source = agent.instructions.trim()
    if (source.length < 12) {
      return
    }
    try {
      setImproving(true)
      setError('')
      const nextDraft = await window.ordinus.agents.draftFromIntent({
        requestedWork: source,
        sandbox: agent.sandbox
      })
      setValue(nextDraft.capabilities)
    } catch (improveError) {
      setError(getErrorMessage(improveError, 'Capabilities could not be generated.'))
    } finally {
      setImproving(false)
    }
  }

  async function handleSave(): Promise<void> {
    if (!dirty || saving) {
      return
    }
    try {
      setSaving(true)
      setError('')
      const nextAgent = await window.ordinus.agents.updateSettings(
        buildAgentSettingsPayload(agent, { capabilities: value })
      )
      onAgentSaved(nextAgent)
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Capabilities could not be saved.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="grid gap-2">
      <CapabilitiesField
        value={value}
        improving={improving}
        canImprove={agent.instructions.trim().length >= 12}
        onChange={setValue}
        onImprove={() => void handleImprove()}
      />
      {error ? <InlineError message={error} /> : null}
      {dirty ? (
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            disabled={saving}
            onClick={() => setValue(agent.capabilities)}
          >
            Discard
          </button>
          <Button
            type="button"
            size="sm"
            className="h-8 px-3 text-xs"
            disabled={saving}
            onClick={() => void handleSave()}
          >
            {saving ? <Loader2 className="animate-spin" /> : null}
            Save
          </Button>
        </div>
      ) : null}
    </section>
  )
}

function CvConnectors({
  agent,
  onAgentSaved
}: {
  agent: Agent
  onAgentSaved: (agent: Agent) => void
}): React.JSX.Element {
  const [connectors, setConnectors] = useState<ConnectorSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    window.ordinus.connectors
      .list()
      .then((list) => {
        if (active) setConnectors(list)
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  async function toggle(connectorId: string, enabled: boolean): Promise<void> {
    const set = new Set(agent.connectors)
    if (enabled) {
      set.add(connectorId)
    } else {
      set.delete(connectorId)
    }
    try {
      setBusyId(connectorId)
      setError('')
      const nextAgent = await window.ordinus.agents.updateSettings(
        buildAgentSettingsPayload(agent, { connectors: [...set] })
      )
      onAgentSaved(nextAgent)
    } catch (toggleError) {
      setError(getErrorMessage(toggleError, 'That tool could not be updated.'))
    } finally {
      setBusyId('')
    }
  }

  return (
    <section className="grid gap-2">
      <div>
        <h3 className="text-sm font-semibold leading-tight">Tools &amp; integrations</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          External systems this teammate is fluent with. Authorize connections in Settings →
          Connections — a tool can be enabled here before its connection is set up.
        </p>
      </div>
      {error ? <InlineError message={error} /> : null}
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : connectors.length === 0 ? (
        <p className="text-xs text-muted-foreground">No tools available.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {connectors.map((connector) => (
            <li key={connector.id} className="flex items-center justify-between gap-4 px-3 py-2">
              <div className="min-w-0">
                <span className="text-sm font-medium">{connector.label}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {connector.connected ? 'Connected' : 'Not connected'}
                </span>
              </div>
              <Switch
                checked={agent.connectors.includes(connector.id)}
                disabled={busyId === connector.id}
                onCheckedChange={(checked) => void toggle(connector.id, checked)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// About tab (ADR-027 Phase 6): the working agreement (brief + what they've
// learned from you) and the quiet "Trust & access" corner.
function AboutTab({
  agent,
  onAgentSaved
}: {
  agent: Agent
  onAgentSaved: (agent: Agent) => void
}): React.JSX.Element {
  const [view, setView] = useState<'agreement' | 'access'>('agreement')

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1 border-b px-4 py-2">
        <AboutSegment
          label="Working agreement"
          icon={FileText}
          active={view === 'agreement'}
          onClick={() => setView('agreement')}
        />
        <AboutSegment
          label="Trust & access"
          icon={Settings2}
          active={view === 'access'}
          onClick={() => setView('access')}
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        {view === 'agreement' ? (
          <WorkingAgreement key={agent.id} agent={agent} onAgentSaved={onAgentSaved} />
        ) : (
          <TrustAccessPanel key={agent.id} agent={agent} onAgentSaved={onAgentSaved} />
        )}
      </div>
    </div>
  )
}

// The working agreement: a brief (static instructions) plus the standing rules
// the agent has learned from the user. Per-agent prune lives here (ADR-027 §8,
// replacing the global reflection dialog).
function WorkingAgreement({
  agent,
  onAgentSaved
}: {
  agent: Agent
  onAgentSaved: (agent: Agent) => void
}): React.JSX.Element {
  return (
    <ScrollArea className="h-full min-h-0">
      <div className="grid gap-5 p-5">
        <section className="grid gap-2">
          <div>
            <h3 className="text-sm font-semibold leading-tight">Brief</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              How {agent.name} should work — role, scope, and what to avoid.
            </p>
          </div>
          <div className="h-80 overflow-hidden rounded-lg border bg-card">
            <InstructionsPanel agent={agent} onAgentSaved={onAgentSaved} />
          </div>
        </section>
        <LearnedRules agent={agent} />
      </div>
    </ScrollArea>
  )
}

function LearnedRules({ agent }: { agent: Agent }): React.JSX.Element {
  const [rules, setRules] = useState<AgentMemoryRule[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) {
        return
      }
      setLoading(true)
      window.ordinus.agents
        .listMemory({ agentId: agent.id })
        .then((next) => {
          if (!cancelled) setRules(next)
        })
        .catch((loadError) => {
          if (!cancelled) {
            setError(getErrorMessage(loadError, 'Could not load what they learned.'))
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    })
    return () => {
      cancelled = true
    }
  }, [agent.id])

  async function remove(ruleId: string): Promise<void> {
    try {
      setBusyId(ruleId)
      setError('')
      await window.ordinus.agents.deactivateMemory({ agentId: agent.id, ruleId })
      setRules((current) => current.filter((rule) => rule.id !== ruleId))
    } catch (removeError) {
      setError(getErrorMessage(removeError, 'That rule could not be removed.'))
    } finally {
      setBusyId('')
    }
  }

  return (
    <section className="grid gap-2">
      <div>
        <h3 className="text-sm font-semibold leading-tight">What {agent.name} learned from you</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Standing preferences you&apos;ve taught. Remove any that no longer apply.
        </p>
      </div>
      {error ? <InlineError message={error} /> : null}
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : rules.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nothing yet — teach {agent.name} as you work together.
        </p>
      ) : (
        <ul className="grid gap-1.5">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className="group flex items-start gap-2 rounded-md border bg-card px-2.5 py-1.5 text-sm"
            >
              <Sparkles className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">
                {rule.rule}
              </span>
              <button
                type="button"
                disabled={busyId === rule.id}
                onClick={() => void remove(rule.id)}
                className="shrink-0 text-xs text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 disabled:opacity-50"
                aria-label="Remove rule"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function AboutSegment({
  label,
  icon: Icon,
  active,
  onClick
}: {
  label: string
  icon: typeof Bot
  active: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
        active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  )
}

const CAPABILITIES_MAX_LENGTH = 300

function CapabilitiesField({
  value,
  onChange,
  onImprove,
  improving,
  canImprove
}: {
  value: string
  onChange: (value: string) => void
  onImprove: () => void
  improving: boolean
  canImprove: boolean
}): React.JSX.Element {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-muted-foreground">Capabilities</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs"
          disabled={improving || !canImprove}
          onClick={onImprove}
        >
          {improving ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <WandSparkles className="size-3.5" />
          )}
          Improve with AI
        </Button>
      </div>
      <textarea
        className="ordinus-scrollbar min-h-20 resize-y rounded-lg border bg-card p-3 text-sm leading-5 text-foreground shadow-none outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        maxLength={CAPABILITIES_MAX_LENGTH}
        placeholder="What this agent is best at, the capability or connector boundary it owns, and when to route work to another agent."
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <p className="flex items-center justify-between gap-3 text-xs leading-5 text-muted-foreground">
        <span>Used by the planner to assign work to the right specialist.</span>
        <span className="shrink-0 tabular-nums">
          {value.length}/{CAPABILITIES_MAX_LENGTH}
        </span>
      </p>
    </div>
  )
}

type SkillEditorMode = 'create' | 'edit'
type SkillEditorState = {
  mode: SkillEditorMode
  skillId: string
  name: string
  description: string
  body: string
  bodyTouched: boolean
}

function buildDefaultSkillBody(name: string): string {
  const title = name.trim() || 'New skill'

  return [
    `# ${title}`,
    '',
    '## When To Use',
    '',
    '- Use this skill when ...',
    '',
    '## Workflow',
    '',
    '1. ...',
    '2. ...',
    '3. ...',
    '',
    '## Boundaries',
    '',
    '- Do not use this skill when ...'
  ].join('\n')
}

function createSkillEditorState(): SkillEditorState {
  return {
    mode: 'create',
    skillId: '',
    name: '',
    description: '',
    body: buildDefaultSkillBody(''),
    bodyTouched: false
  }
}

function createSkillEditState(skill: AgentSkill): SkillEditorState {
  return {
    mode: 'edit',
    skillId: skill.id,
    name: skill.name,
    description: skill.description,
    body: '',
    bodyTouched: false
  }
}

function upsertSkill(skills: AgentSkill[], skill: AgentSkill): AgentSkill[] {
  return [...skills.filter((currentSkill) => currentSkill.id !== skill.id), skill].sort(
    (left, right) => left.name.localeCompare(right.name)
  )
}

function SkillsPanel({ agent }: { agent: Agent }): React.JSX.Element {
  const [skills, setSkills] = useState<AgentSkill[]>([])
  const [loading, setLoading] = useState(true)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editor, setEditor] = useState<SkillEditorState>(() => createSkillEditorState())
  const [loadingSkill, setLoadingSkill] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [error, setError] = useState('')
  const skillLoadRequestRef = useRef(0)

  useEffect(() => {
    let mounted = true

    async function loadSkills(): Promise<void> {
      try {
        setLoading(true)
        setError('')
        const nextSkills = await window.ordinus.agents.listSkills({ agentId: agent.id })
        if (mounted) {
          setSkills(nextSkills)
        }
      } catch (loadError) {
        if (mounted) {
          setError(getErrorMessage(loadError, 'Skills could not be loaded.'))
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    void loadSkills()

    return () => {
      mounted = false
    }
  }, [agent.id])

  function openCreateSkill(): void {
    skillLoadRequestRef.current += 1
    setEditor(createSkillEditorState())
    setLoadingSkill(false)
    setDeleteOpen(false)
    setError('')
    setEditorOpen(true)
  }

  async function openEditSkill(skill: AgentSkill): Promise<void> {
    const requestId = skillLoadRequestRef.current + 1
    skillLoadRequestRef.current = requestId
    setEditor(createSkillEditState(skill))
    setDeleteOpen(false)
    setLoadingSkill(true)
    setError('')
    setEditorOpen(true)

    try {
      const detail = await window.ordinus.agents.getSkill({
        agentId: agent.id,
        skillId: skill.id
      })
      if (skillLoadRequestRef.current !== requestId) {
        return
      }
      setEditor({
        mode: 'edit',
        skillId: detail.id,
        name: detail.name,
        description: detail.description,
        body: detail.body,
        bodyTouched: false
      })
    } catch (loadError) {
      if (skillLoadRequestRef.current !== requestId) {
        return
      }
      setError(getErrorMessage(loadError, 'Skill could not be opened.'))
      setEditorOpen(false)
    } finally {
      if (skillLoadRequestRef.current === requestId) {
        setLoadingSkill(false)
      }
    }
  }

  function closeSkillEditor(): void {
    skillLoadRequestRef.current += 1
    setEditorOpen(false)
    setDeleteOpen(false)
    setLoadingSkill(false)
  }

  function handleSkillNameChange(value: string): void {
    setEditor((current) => ({
      ...current,
      name: value,
      body:
        current.mode === 'create' && !current.bodyTouched
          ? buildDefaultSkillBody(value)
          : current.body
    }))
  }

  function handleSkillBodyChange(value: string): void {
    setEditor((current) => ({ ...current, body: value, bodyTouched: true }))
  }

  async function handleSaveSkill(): Promise<void> {
    if (!editor.name.trim() || saving || deleting) {
      return
    }

    try {
      setSaving(true)
      setError('')
      const skill =
        editor.mode === 'create'
          ? await window.ordinus.agents.createSkill({
              agentId: agent.id,
              name: editor.name,
              description: editor.description,
              body: editor.body
            })
          : await window.ordinus.agents.updateSkill({
              agentId: agent.id,
              skillId: editor.skillId,
              name: editor.name,
              description: editor.description,
              body: editor.body
            })
      setSkills((current) => upsertSkill(current, skill))
      setEditor(createSkillEditorState())
      closeSkillEditor()
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Skill could not be saved.'))
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteSkill(): Promise<void> {
    if (editor.mode !== 'edit' || deleting || saving || loadingSkill) {
      return
    }

    try {
      setDeleting(true)
      setError('')
      const result = await window.ordinus.agents.deleteSkill({
        agentId: agent.id,
        skillId: editor.skillId
      })
      setSkills((current) => current.filter((skill) => skill.id !== result.deletedSkillId))
      closeSkillEditor()
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, 'Skill could not be deleted.'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="grid gap-3 p-5">
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 px-2.5 text-xs"
          onClick={openCreateSkill}
        >
          <Plus />
          Create skill
        </Button>
      </div>

      {error ? <InlineError message={error} /> : null}

      {skills.length > 0 ? (
        <div className="grid gap-2">
          {skills.map((skill) => (
            <button
              key={skill.id}
              type="button"
              className="grid gap-2 rounded-lg border bg-card p-4 text-left transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              onClick={() => void openEditSkill(skill)}
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{skill.name}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {skill.relativePath}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {new Date(skill.updatedAt).toLocaleDateString()}
                </span>
              </div>
              {skill.description ? (
                <p className="text-sm text-muted-foreground">{skill.description}</p>
              ) : null}
            </button>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Sparkles />}
          title={loading ? 'Loading skills' : 'No skills yet'}
          detail={
            loading
              ? 'Checking this agent skill folder.'
              : 'Create a skill to add reusable instructions for this agent.'
          }
        />
      )}

      <Dialog
        open={editorOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeSkillEditor()
            return
          }
          setEditorOpen(true)
        }}
      >
        <SkillEditorDialog
          deleting={deleting}
          editor={editor}
          loadingSkill={loadingSkill}
          saving={saving}
          onBodyChange={handleSkillBodyChange}
          onCancel={closeSkillEditor}
          onDelete={() => setDeleteOpen(true)}
          onDescriptionChange={(description) =>
            setEditor((current) => ({ ...current, description }))
          }
          onNameChange={handleSkillNameChange}
          onSave={() => void handleSaveSkill()}
        />
      </Dialog>
      <DeleteSkillDialog
        deleting={deleting}
        open={deleteOpen}
        skillName={editor.name}
        onDelete={() => void handleDeleteSkill()}
        onOpenChange={setDeleteOpen}
      />
    </div>
  )
}

function SkillEditorDialog({
  deleting,
  editor,
  loadingSkill,
  saving,
  onBodyChange,
  onCancel,
  onDelete,
  onDescriptionChange,
  onNameChange,
  onSave
}: {
  deleting: boolean
  editor: SkillEditorState
  loadingSkill: boolean
  saving: boolean
  onBodyChange: (body: string) => void
  onCancel: () => void
  onDelete: () => void
  onDescriptionChange: (description: string) => void
  onNameChange: (name: string) => void
  onSave: () => void
}): React.JSX.Element {
  const disabled = saving || deleting || loadingSkill

  return (
    <DialogContent className="max-w-3xl">
      <DialogHeader>
        <DialogTitle>{editor.mode === 'create' ? 'Create skill' : 'Edit skill'}</DialogTitle>
        <DialogDescription>
          Save frontmatter and instructions to this agent&apos;s SKILL.md file.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-3">
        <FormField label="Skill name">
          <Input
            value={editor.name}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder="Strategy review"
            disabled={loadingSkill}
          />
        </FormField>
        <label className="grid gap-2">
          <span className="text-xs font-medium text-muted-foreground">Description</span>
          <textarea
            className="ordinus-scrollbar min-h-28 resize-y rounded-lg border bg-card p-3 text-sm leading-5 text-foreground shadow-none outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            value={editor.description}
            onChange={(event) => onDescriptionChange(event.target.value)}
            placeholder="When should this skill be used?"
            disabled={loadingSkill}
          />
        </label>
        <label className="grid gap-2">
          <span className="text-xs font-medium text-muted-foreground">Skill instructions</span>
          <textarea
            className="ordinus-scrollbar min-h-80 resize-y rounded-lg border bg-card p-3 font-mono text-xs leading-5 text-foreground shadow-none outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            value={loadingSkill ? 'Loading skill...' : editor.body}
            onChange={(event) => onBodyChange(event.target.value)}
            placeholder="# Skill name"
            disabled={loadingSkill}
          />
        </label>
      </div>
      <DialogFooter>
        {editor.mode === 'edit' ? (
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className="mr-auto border-status-attention/40 text-status-attention hover:bg-status-attention/10"
            onClick={onDelete}
          >
            <Trash2 />
            Delete skill
          </Button>
        ) : null}
        <Button type="button" variant="ghost" disabled={disabled} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" disabled={!editor.name.trim() || disabled} onClick={onSave}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          {editor.mode === 'create' ? 'Create skill' : 'Save skill'}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

function DeleteSkillDialog({
  deleting,
  open,
  skillName,
  onDelete,
  onOpenChange
}: {
  deleting: boolean
  open: boolean
  skillName: string
  onDelete: () => void
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-status-attention" />
            Delete skill
          </DialogTitle>
          <DialogDescription>
            This removes {skillName || 'this skill'} and its entire skill folder. This cannot be
            undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            disabled={deleting}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={deleting} onClick={onDelete}>
            {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
            Delete permanently
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function InstructionsPanel({
  agent,
  onAgentSaved
}: {
  agent: Agent
  onAgentSaved: (agent: Agent) => void
}): React.JSX.Element {
  const [savedInstructions, setSavedInstructions] = useState(agent.instructions)
  const [instructions, setInstructions] = useState(agent.instructions)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [error, setError] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const revertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const revertTargetRef = useRef<string>(savedInstructions)

  async function save(value: string): Promise<void> {
    if (value === savedInstructions) return

    try {
      setSaving(true)
      setError('')
      const nextAgent = await window.ordinus.agents.updateInstructions({
        id: agent.id,
        instructions: value
      })
      revertTargetRef.current = savedInstructions
      setSavedInstructions(nextAgent.instructions)
      onAgentSaved(nextAgent)

      setSaveStatus('saved')
      if (revertTimerRef.current) clearTimeout(revertTimerRef.current)
      revertTimerRef.current = setTimeout(() => setSaveStatus('idle'), 4000)
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Instructions could not be saved.'))
      setSaveStatus('error')
    } finally {
      setSaving(false)
    }
  }

  function handleChange(value: string): void {
    setInstructions(value)
    setSaveStatus('idle')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      void save(value)
    }, 2000)
  }

  function handleBlur(): void {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    void save(instructions)
  }

  function handleRevert(): void {
    const target = revertTargetRef.current
    setInstructions(target)
    setSaveStatus('idle')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    void save(target)
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="absolute right-5 top-4 flex items-center gap-2">
        {saving ? (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            Saving
          </span>
        ) : saveStatus === 'saved' ? (
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Saved</span>
            <span className="text-border">·</span>
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              onClick={handleRevert}
            >
              Revert
            </button>
          </span>
        ) : saveStatus === 'error' ? (
          <span className="text-xs text-status-attention">{error}</span>
        ) : null}
      </div>

      <textarea
        key={agent.id}
        aria-label={`${agent.name} instructions`}
        className="ordinus-scrollbar h-full w-full flex-1 resize-none bg-transparent p-5 pt-4 font-mono text-xs leading-6 text-foreground shadow-none outline-none placeholder:text-muted-foreground/50"
        placeholder={`Describe what ${agent.name} is responsible for.\n\nInclude:\n- Role and purpose\n- Scope of work\n- What it should avoid\n- How it should verify its work`}
        spellCheck={false}
        value={instructions}
        onChange={(event) => handleChange(event.target.value)}
        onBlur={handleBlur}
      />
    </div>
  )
}

// Trust & access (ADR-027 Phase 6): the one quiet machine corner — which engine
// powers the agent, how much it may touch (sandbox), and extra folders it can
// reach. Identity (name/role/avatar/enabled) lives in the header profile;
// capabilities/connectors live on the CV tab.
function TrustAccessPanel({
  agent,
  onAgentSaved
}: {
  agent: Agent
  onAgentSaved: (agent: Agent) => void
}): React.JSX.Element {
  const initialSettings = getPersistedSettingsDraft(agent)
  const [savedSettings, setSavedSettings] = useState<SettingsDraft>(initialSettings)
  const [draft, setDraft] = useState<SettingsDraft>(getEditableSettingsDraft(initialSettings))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const dirty = isSettingsDirty(draft, savedSettings)
  const canSave = dirty && Boolean(draft.model.trim()) && !saving

  function updateDraft(next: Partial<SettingsDraft>): void {
    setDraft((current) => {
      const merged = { ...current, ...next }
      if (next.providerId) {
        merged.model = getDefaultModelForProvider(next.providerId)
      }
      return merged
    })
  }

  async function handleSave(): Promise<void> {
    if (!canSave) {
      return
    }

    try {
      setSaving(true)
      setError('')
      const nextAgent = await window.ordinus.agents.updateSettings(
        buildAgentSettingsPayload(agent, {
          providerId: draft.providerId,
          model: draft.model.trim(),
          sandbox: draft.sandbox
        })
      )
      const nextSettings = getPersistedSettingsDraft(nextAgent)
      setSavedSettings(nextSettings)
      setDraft(getEditableSettingsDraft(nextSettings))
      onAgentSaved(nextAgent)
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Trust & access could not be saved.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <ScrollArea className="h-full min-h-0">
        <div className={cn('grid gap-5 p-5', dirty && 'pb-24')}>
          <p className="text-xs text-muted-foreground">
            The admin corner — which engine powers {agent.name}, how much they can touch, and any
            extra folders they may reach.
          </p>

          <div className="grid gap-3">
            <div className="grid gap-3 md:grid-cols-2">
              <FormField label="Provider">
                <SelectControl
                  value={draft.providerId}
                  onChange={(value) => updateDraft({ providerId: value as ProviderId })}
                >
                  <option value="codex">Codex</option>
                  <option value="claude">Claude</option>
                  <option value="gemini">Gemini</option>
                </SelectControl>
              </FormField>
              <ModelField
                providerId={draft.providerId}
                model={draft.model}
                onChange={(model) => updateDraft({ model })}
              />
            </div>
            <RuntimeModelSummary providerId={draft.providerId} model={draft.model} />
          </div>

          <SandboxField
            name="agent-settings-sandbox"
            value={draft.sandbox}
            onChange={(sandbox) => updateDraft({ sandbox })}
          />

          <ExtraDirectoriesPanel agentId={agent.id} />
        </div>
      </ScrollArea>

      {dirty ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4">
          <div className="pointer-events-auto flex items-center justify-between gap-3 rounded-lg border bg-accent px-4 py-3 shadow-md">
            {error ? (
              <p className="text-xs text-status-attention">{error}</p>
            ) : (
              <span className="text-xs text-muted-foreground">Unsaved changes</span>
            )}
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                disabled={saving}
                onClick={() => setDraft(getEditableSettingsDraft(savedSettings))}
              >
                Discard
              </button>
              <Button
                type="button"
                size="sm"
                className="h-8 px-3 text-xs"
                disabled={!canSave}
                onClick={() => void handleSave()}
              >
                {saving ? <Loader2 className="animate-spin" /> : null}
                Save settings
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ExtraDirectoriesPanel({ agentId }: { agentId: string }): React.JSX.Element {
  const [entries, setEntries] = useState<AgentExtraDirectoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setLoading(true)
      setError('')
      window.ordinus.agents
        .listExtraDirectories({ agentId })
        .then((list) => {
          if (!cancelled) setEntries(list.entries)
        })
        .catch((loadError) => {
          if (!cancelled) {
            setError(getErrorMessage(loadError, 'Could not load extra directories.'))
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    })
    return () => {
      cancelled = true
    }
  }, [agentId])

  async function handleAdd(): Promise<void> {
    setBusy(true)
    setError('')
    try {
      const result = await window.ordinus.agents.addExtraDirectory({ agentId })
      if (result.ok) {
        setEntries(result.list.entries)
      } else if (result.code !== 'cancelled') {
        setError(result.message)
      }
    } catch (addError) {
      setError(getErrorMessage(addError, 'Could not add directory.'))
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove(path: string): Promise<void> {
    setBusy(true)
    setError('')
    try {
      const list = await window.ordinus.agents.removeExtraDirectory({ agentId, path })
      setEntries(list.entries)
    } catch (removeError) {
      setError(getErrorMessage(removeError, 'Could not remove directory.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold leading-tight">Extra directories</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Folders outside the workspace this agent can read and write. Best for occasional use —
            the workspace stays the primary place for work.
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-md border px-3 py-1 text-xs hover:bg-accent disabled:opacity-50"
          disabled={busy}
          onClick={handleAdd}
        >
          Add folder…
        </button>
      </div>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
        <li>
          <span className="font-medium text-foreground">Agent-specific.</span> Other agents do not
          inherit these. If a follow-up agent needs the same folder, add it to that agent too.
        </li>
        <li>
          <span className="font-medium text-foreground">Read + write.</span> The agent has full
          access to everything you add here. Use sparingly.
        </li>
        <li>
          <span className="font-medium text-foreground">Not workspace artifacts.</span> Files the
          agent creates here will not appear in the Files panel or auto-flow into follow-up plans —
          only the workspace does that. The agent mentions external changes in its response text.
        </li>
      </ul>
      {error ? <p className="text-xs text-status-attention">{error}</p> : null}
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">No extra directories.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {entries.map((entry) => (
            <li key={entry.path} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <span className="block truncate text-sm">{entry.path}</span>
                {!entry.exists ? (
                  <span className="text-xs text-status-attention">missing</span>
                ) : null}
              </div>
              <button
                type="button"
                className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
                disabled={busy}
                onClick={() => handleRemove(entry.path)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function AgentSchedulesPanel({ agent }: { agent: Agent }): React.JSX.Element {
  const [schedules, setSchedules] = useState<AgentSchedule[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [requests, setRequests] = useState<WorkRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [busyId, setBusyId] = useState('')

  const load = useCallback(
    async (quiet = false): Promise<void> => {
      if (!quiet) setLoading(true)
      try {
        const [s, a, w] = await Promise.all([
          window.ordinus.schedules.list({ agentId: agent.id }),
          window.ordinus.agents.list(),
          window.ordinus.workboard.list()
        ])
        setSchedules(s)
        setAgents(a)
        setRequests(w.requests)
      } finally {
        if (!quiet) setLoading(false)
      }
    },
    [agent.id]
  )

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) void load()
    })
    const off = window.ordinus.schedules.onChanged(() => void load(true))
    return () => {
      cancelled = true
      off()
    }
  }, [load])

  async function runScheduleAction(scheduleId: string, action: () => Promise<void>): Promise<void> {
    setBusyId(scheduleId)
    try {
      await action()
      await load(true)
    } finally {
      setBusyId('')
    }
  }

  async function toggle(s: AgentSchedule): Promise<void> {
    await runScheduleAction(s.id, async () => {
      await window.ordinus.schedules.setEnabled({ id: s.id, enabled: !s.enabled })
    })
  }

  async function fire(s: AgentSchedule): Promise<void> {
    await runScheduleAction(s.id, async () => {
      await window.ordinus.schedules.fireNow({ id: s.id })
    })
  }

  async function remove(s: AgentSchedule): Promise<void> {
    if (!window.confirm(`Delete schedule "${s.name}"?`)) return
    await runScheduleAction(s.id, async () => {
      await window.ordinus.schedules.delete({ id: s.id })
    })
  }

  return (
    <div className="space-y-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold leading-tight">Agenda</h2>
          <p className="text-sm text-muted-foreground">
            Standing times {agent.name} works on its own.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)} disabled={!agent.enabled}>
          <Plus className="size-4" /> New
        </Button>
      </div>

      {!agent.enabled ? (
        <p className="rounded-md border border-dashed bg-accent/40 px-3 py-2 text-xs text-muted-foreground">
          Enable {agent.name} to add standing work to their agenda.
        </p>
      ) : null}

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : schedules.length === 0 ? (
        <div className="grid place-items-center gap-2 rounded-lg border border-dashed bg-accent/40 p-8 text-center">
          <CalendarClock className="size-7 text-muted-foreground" />
          <p className="text-sm font-medium">{agent.name}&apos;s agenda is clear</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            Add a standing time for {agent.name} to pick up work on their own.
          </p>
        </div>
      ) : (
        <ul className="grid gap-2">
          {schedules.map((s) => (
            <li
              key={s.id}
              className={cn(
                'flex items-start gap-3 rounded-lg border bg-card p-3',
                !s.enabled && 'opacity-70'
              )}
            >
              <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
                <CalendarClock className="size-4" />
              </div>
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-semibold">{s.name}</span>
                  {s.lastRunStatus === 'failed' ? (
                    <span className="rounded-full bg-status-attention/10 px-1.5 py-px text-[10px] font-medium text-status-attention">
                      Last run failed
                    </span>
                  ) : null}
                  {!s.enabled ? (
                    <span className="text-[10px] text-muted-foreground">
                      {disableReasonLabel(s)}
                    </span>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">{describeSchedule(s)}</p>
                {s.enabled && s.nextRunAt ? (
                  <p className="text-xs text-muted-foreground">
                    Next · {formatNextRun(s.nextRunAt)}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busyId === s.id}
                  onClick={() => void fire(s)}
                >
                  Run now
                </Button>
                <Switch
                  aria-label={s.enabled ? 'Disable' : 'Enable'}
                  checked={s.enabled}
                  disabled={busyId === s.id}
                  onCheckedChange={() => void toggle(s)}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Delete"
                  disabled={busyId === s.id}
                  onClick={() => void remove(s)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <CreateScheduleDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        agents={agents}
        requests={requests}
        defaultAgentId={agent.id}
        onCreated={() => {
          setCreateOpen(false)
          void load(true)
        }}
      />
    </div>
  )
}

const SCHEDULE_WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday'
]

// Human-readable recurrence for the Agenda tab. Falls back to the raw cron for
// patterns it does not recognize — presentation only, never alters scheduling.
function describeSchedule(schedule: AgentSchedule): string {
  if (schedule.runAt) {
    return `Once · ${new Date(schedule.runAt).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    })}`
  }
  if (schedule.cron) {
    return describeCron(schedule.cron) ?? `Cron · ${schedule.cron}`
  }
  return 'No timing set'
}

function describeCron(cron: string): string | null {
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) {
    return null
  }
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts

  const everyMinutes = /^\*\/(\d+)$/.exec(minute)
  if (everyMinutes && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return `Every ${everyMinutes[1]} minutes`
  }
  if (
    /^\d+$/.test(minute) &&
    hour === '*' &&
    dayOfMonth === '*' &&
    month === '*' &&
    dayOfWeek === '*'
  ) {
    return `Hourly at :${pad2(minute)}`
  }

  if (!/^\d+$/.test(minute) || !/^\d+$/.test(hour)) {
    return null
  }
  const time = `${pad2(hour)}:${pad2(minute)}`

  if (dayOfMonth === '*' && month === '*') {
    if (dayOfWeek === '*') return `Every day at ${time}`
    if (dayOfWeek === '1-5') return `Every weekday at ${time}`
    if (dayOfWeek === '0,6' || dayOfWeek === '6,0') return `Weekends at ${time}`
    if (/^\d$/.test(dayOfWeek)) return `Every ${SCHEDULE_WEEKDAYS[Number(dayOfWeek)]} at ${time}`
  }
  if (dayOfWeek === '*' && month === '*' && /^\d+$/.test(dayOfMonth)) {
    return `Monthly on day ${dayOfMonth} at ${time}`
  }
  return null
}

function pad2(value: string): string {
  return value.padStart(2, '0')
}

function formatNextRun(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function DeleteAgentDialog({
  agentId,
  agentName,
  deleting,
  open,
  onDelete,
  onOpenChange
}: {
  agentId: string
  agentName: string
  deleting: boolean
  open: boolean
  onDelete: () => void
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const [scheduleCount, setScheduleCount] = useState(0)
  useEffect(() => {
    if (!open) return
    void window.ordinus.schedules
      .list({ agentId })
      .then((list) => setScheduleCount(list.length))
      .catch(() => setScheduleCount(0))
  }, [open, agentId])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-status-attention" />
            Delete agent
          </DialogTitle>
          <DialogDescription>
            This removes {agentName}, related conversations, local files, and app logs.
            {scheduleCount > 0
              ? ` ${scheduleCount} schedule${scheduleCount === 1 ? '' : 's'} attached to this agent will also be deleted.`
              : ''}{' '}
            This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            disabled={deleting}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={deleting} onClick={onDelete}>
            {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
            Delete permanently
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PresenceDot({
  presence,
  className
}: {
  presence: AgentPresence
  className?: string
}): React.JSX.Element {
  return (
    <span
      className={cn(
        'size-2.5 shrink-0 rounded-full',
        presence === 'available' && 'bg-status-completed',
        presence === 'working' && 'animate-pulse bg-status-running',
        presence === 'needs-setup' && 'bg-status-attention',
        presence === 'off' && 'bg-muted-foreground',
        className
      )}
    />
  )
}

function AgentNameField({
  name,
  enabled,
  nameIssue,
  onNameChange,
  onEnabledChange
}: {
  name: string
  enabled: boolean
  nameIssue: string | null
  onNameChange: (name: string) => void
  onEnabledChange: (enabled: boolean) => void
}): React.JSX.Element {
  const switchId = useId()
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-muted-foreground">Agent name</span>
        <label htmlFor={switchId} className="flex cursor-pointer items-center gap-2">
          <span className="text-xs text-muted-foreground">{enabled ? 'Enabled' : 'Disabled'}</span>
          <Switch id={switchId} checked={enabled} onCheckedChange={onEnabledChange} />
        </label>
      </div>
      <Input maxLength={80} value={name} onChange={(event) => onNameChange(event.target.value)} />
      {nameIssue ? <p className="text-xs text-status-attention">{nameIssue}</p> : null}
    </div>
  )
}

function FormField({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <label className="grid gap-2 text-sm">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

function RuntimeModelSummary({
  providerId,
  model
}: {
  providerId: ProviderId
  model: string
}): React.JSX.Element {
  return (
    <div className="flex min-h-10 items-start gap-2 rounded-md border bg-accent px-3 py-2 text-xs leading-5 text-muted-foreground">
      <Info className="mt-0.5 size-3.5 shrink-0" />
      <p>
        <span className="font-medium text-foreground">
          {getSelectedModelLabel(providerId, model)}
        </span>
        <span> - {getModelDescription(providerId, model)}</span>
      </p>
    </div>
  )
}

function SandboxField({
  name,
  value,
  onChange
}: {
  name: string
  value: AgentSandbox
  onChange: (value: AgentSandbox) => void
}): React.JSX.Element {
  const isFullAccess = value === 'full-access'

  return (
    <div className="grid gap-2">
      <span className="text-xs font-medium text-muted-foreground">Sandbox</span>
      <div className="grid gap-1">
        {sandboxOptions.map((option) => {
          const isSelected = option.value === value
          return (
            <div key={option.value}>
              <label className="flex w-fit cursor-pointer items-center gap-2.5 py-1.5">
                <input
                  type="radio"
                  name={name}
                  className="size-3.5 shrink-0 accent-primary"
                  checked={isSelected}
                  onChange={() => onChange(option.value)}
                />
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      'text-sm font-medium',
                      isSelected ? 'text-foreground' : 'text-muted-foreground'
                    )}
                  >
                    {option.label}
                  </span>
                  {option.badge ? (
                    <span className="rounded-full border px-1.5 py-px text-[10px] font-medium text-muted-foreground">
                      {option.badge}
                    </span>
                  ) : null}
                </span>
              </label>
              {isSelected ? (
                <p
                  className={cn(
                    'ml-6 text-xs leading-5',
                    isFullAccess ? 'text-status-attention' : 'text-muted-foreground'
                  )}
                >
                  {option.description}
                </p>
              ) : null}
            </div>
          )
        })}
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
    <p className="rounded-md border border-status-attention/30 bg-status-attention/10 px-3 py-2 text-xs text-status-attention">
      {message}
    </p>
  )
}

function getPersistedSettingsDraft(agent: Agent): SettingsDraft {
  return {
    providerId: agent.providerId,
    model: agent.model,
    sandbox: agent.sandbox
  }
}

function getEditableSettingsDraft(settings: SettingsDraft): SettingsDraft {
  return {
    ...settings,
    model: getSupportedModelOrDefault(settings.providerId, settings.model)
  }
}

function isSettingsDirty(draft: SettingsDraft, savedSettings: SettingsDraft): boolean {
  return (
    draft.providerId !== savedSettings.providerId ||
    draft.model !== savedSettings.model ||
    draft.sandbox !== savedSettings.sandbox
  )
}

function ModelField({
  providerId,
  model,
  onChange
}: {
  providerId: ProviderId
  model: string
  onChange: (model: string) => void
}): React.JSX.Element {
  const modelOptions = getProviderModelOptions(providerId)
  const selectValue = getSupportedModelOrDefault(providerId, model)

  return (
    <FormField label="Model">
      <SelectControl value={selectValue} onChange={onChange}>
        {modelOptions.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </SelectControl>
    </FormField>
  )
}

function getAgentNameIssue(
  name: string,
  savedName: string,
  agents: Agent[],
  currentAgentId: string
): string | null {
  const trimmedName = name.trim()
  if (!trimmedName) {
    return 'Agent name is required.'
  }

  if (trimmedName.length > 80) {
    return 'Agent name must be 80 characters or fewer.'
  }

  if (normalizeAgentName(trimmedName) === normalizeAgentName(savedName)) {
    return null
  }

  const duplicateAgent = agents.some(
    (agent) =>
      agent.id !== currentAgentId &&
      normalizeAgentName(agent.name) === normalizeAgentName(trimmedName)
  )
  return duplicateAgent ? 'Another agent already uses this name.' : null
}

function normalizeAgentName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

function getSelectedModelLabel(providerId: ProviderId, model: string): string {
  const selectedModel = getSupportedModelOrDefault(providerId, model)
  return (
    getProviderModelOptions(providerId).find((option) => option.id === selectedModel)?.label ??
    model
  )
}

function getModelDescription(providerId: ProviderId, model: string): string {
  const selectedModel = getSupportedModelOrDefault(providerId, model)
  return (
    getProviderModelOptions(providerId).find((option) => option.id === selectedModel)
      ?.description ?? 'Use a model id supported by the selected local CLI.'
  )
}

function getSupportedModelOrDefault(providerId: ProviderId, model: string): string {
  return getProviderModelOptions(providerId).some((option) => option.id === model)
    ? model
    : getDefaultModelForProvider(providerId)
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
