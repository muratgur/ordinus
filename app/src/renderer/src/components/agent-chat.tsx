import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Loader2, MessageSquarePlus, Pencil, Trash2 } from 'lucide-react'
import type {
  Agent,
  ConversationDeletePreview,
  ConversationDetail,
  ConversationRoomSummary
} from '@shared/contracts'
import { RailItemAction } from './rail'
import { AgentRoom } from './agent-room'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { cn } from '../lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './ui/dialog'

/**
 * ADR-057: the per-agent multi-chat container. Owns the agent's 1:1 conversation
 * list, the selected room (restored per-agent from localStorage), the draft "New
 * chat" state, and per-conversation unread. `AgentRoom` renders the selected
 * thread (or the draft empty state when none is selected). Group/multi-agent
 * conversations are NOT here — they live in the Conversations surface.
 */
export function AgentChat({
  agent,
  onRoomChanged,
  composerSeed,
  onComposerSeedConsumed
}: {
  agent: Agent
  onRoomChanged: () => void
  composerSeed: string
  onComposerSeedConsumed: () => void
}): React.JSX.Element {
  const [rooms, setRooms] = useState<ConversationRoomSummary[]>([])
  const [loadingList, setLoadingList] = useState(true)
  // null = draft (a new chat with no row yet, or an agent with zero rooms).
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [unread, setUnread] = useState<Set<string>>(new Set())

  const selectedIdRef = useRef<string | null>(null)
  useEffect(() => {
    selectedIdRef.current = selectedId
  }, [selectedId])
  const prevRoomsRef = useRef<Map<string, ConversationRoomSummary>>(new Map())
  const listLoadedRef = useRef(false)

  const lastViewedKey = `agent-chat:last-viewed:${agent.id}`

  // Fold a fresh room list into state, lighting per-conversation unread for any
  // non-selected room whose latest activity is a new agent message (ADR-057,
  // ephemeral — same model as the agents rail).
  const applyRooms = useCallback((next: ConversationRoomSummary[]): void => {
    const prevById = prevRoomsRef.current
    if (listLoadedRef.current) {
      setUnread((current) => {
        const nextUnread = new Set(current)
        for (const room of next) {
          const prev = prevById.get(room.conversationId)
          const isNewAgentMessage =
            room.lastSpeaker === 'agent' &&
            room.lastActivityAt &&
            room.lastActivityAt !== prev?.lastActivityAt
          if (room.conversationId === selectedIdRef.current) {
            nextUnread.delete(room.conversationId)
          } else if (isNewAgentMessage) {
            nextUnread.add(room.conversationId)
          }
        }
        return nextUnread
      })
    }
    listLoadedRef.current = true
    prevRoomsRef.current = new Map(next.map((room) => [room.conversationId, room]))
    setRooms(next)
  }, [])

  const reloadRooms = useCallback(async (): Promise<ConversationRoomSummary[]> => {
    const next = await window.ordinus.conversations.listAgentRooms({ agentId: agent.id })
    applyRooms(next)
    return next
  }, [agent.id, applyRooms])

  // Initial load for this agent: list rooms, then restore the last-viewed thread
  // (falling back to most-recently-active, then to the draft empty state).
  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setLoadingList(true)
      listLoadedRef.current = false
      prevRoomsRef.current = new Map()
      setUnread(new Set())
      window.ordinus.conversations
        .listAgentRooms({ agentId: agent.id })
        .then((next) => {
          if (cancelled) return
          applyRooms(next)
          const lastViewed = window.localStorage.getItem(lastViewedKey)
          const restore =
            lastViewed && next.some((room) => room.conversationId === lastViewed)
              ? lastViewed
              : (next[0]?.conversationId ?? null)
          setSelectedId(restore)
        })
        .catch(() => {
          if (!cancelled) setSelectedId(null)
        })
        .finally(() => {
          if (!cancelled) setLoadingList(false)
        })
    })
    return () => {
      cancelled = true
    }
  }, [agent.id, applyRooms, lastViewedKey])

  // Persist the last-viewed thread (view state — localStorage, not the DB).
  useEffect(() => {
    if (selectedId) {
      window.localStorage.setItem(lastViewedKey, selectedId)
    }
  }, [selectedId, lastViewedKey])

  // External activity (Telegram) — refresh the list so previews/unread stay live.
  useEffect(() => {
    return window.ordinus.conversations.onChanged(() => {
      void reloadRooms()
    })
  }, [reloadRooms])

  // A turn running in a NON-selected thread settles in the background: AgentRoom
  // only polls the selected thread, so without this the row's spinner would never
  // clear. Mirror the agents rail — refresh on observed conversation-run changes
  // so lastTurnStatus settles (and the dot flips spinner → lit/idle).
  useEffect(() => {
    return window.ordinus.observability.onRunChanged((snapshot) => {
      if (snapshot.sourceSurface === 'conversation') {
        void reloadRooms()
      }
    })
  }, [reloadRooms])

  const handleRoomChanged = useCallback((): void => {
    void reloadRooms()
    onRoomChanged()
  }, [reloadRooms, onRoomChanged])

  const handleSelect = useCallback((conversationId: string): void => {
    setSelectedId(conversationId)
    setUnread((current) => {
      if (!current.has(conversationId)) return current
      const next = new Set(current)
      next.delete(conversationId)
      return next
    })
  }, [])

  const handleNewChat = useCallback((): void => {
    setSelectedId(null)
  }, [])

  const handleConversationCreated = useCallback(
    (detail: ConversationDetail): void => {
      void reloadRooms()
      setSelectedId(detail.id)
    },
    [reloadRooms]
  )

  // --- rename / delete -----------------------------------------------------
  const [renameTarget, setRenameTarget] = useState<ConversationRoomSummary | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ConversationRoomSummary | null>(null)

  const handleRenamed = useCallback(
    (conversationId: string, title: string): void => {
      setRooms((current) =>
        current.map((room) => (room.conversationId === conversationId ? { ...room, title } : room))
      )
      void reloadRooms()
      onRoomChanged()
    },
    [reloadRooms, onRoomChanged]
  )

  const handleDeleted = useCallback(
    (conversationId: string): void => {
      setUnread((current) => {
        if (!current.has(conversationId)) return current
        const next = new Set(current)
        next.delete(conversationId)
        return next
      })
      void reloadRooms().then((remaining) => {
        if (selectedIdRef.current === conversationId) {
          setSelectedId(remaining[0]?.conversationId ?? null)
        }
      })
      onRoomChanged()
    },
    [reloadRooms, onRoomChanged]
  )

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border/60">
        <div className="flex items-center justify-between px-3 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Chats
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={handleNewChat}
          >
            <MessageSquarePlus className="size-3.5" />
            New chat
          </Button>
        </div>
        <div className="ordinus-scrollbar min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
          {loadingList ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">One moment…</p>
          ) : rooms.length === 0 ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">
              No chats yet. Start one on the right.
            </p>
          ) : (
            rooms.map((room) => (
              <ChatListRow
                key={room.conversationId}
                room={room}
                selected={room.conversationId === selectedId}
                unread={unread.has(room.conversationId)}
                onSelect={() => handleSelect(room.conversationId)}
                onRename={() => setRenameTarget(room)}
                onDelete={() => setDeleteTarget(room)}
              />
            ))
          )}
        </div>
      </aside>

      <div className="flex min-h-0 flex-1 flex-col">
        <AgentRoom
          key={selectedId ?? '__draft__'}
          agent={agent}
          conversationId={selectedId}
          onConversationCreated={handleConversationCreated}
          onRoomChanged={handleRoomChanged}
          composerSeed={composerSeed}
          onComposerSeedConsumed={onComposerSeedConsumed}
        />
      </div>

      <RenameChatDialog
        target={renameTarget}
        onClose={() => setRenameTarget(null)}
        onRenamed={handleRenamed}
      />
      <DeleteChatDialog
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={handleDeleted}
      />
    </div>
  )
}

/**
 * A single, deliberately understated chat row (ADR-057). Quieter than the agents
 * rail: one line, no preview/status text, a muted selection (no accent bar). The
 * leading dot carries state — it spins while a turn runs and "lights" (a filled
 * accent dot) when the agent has replied and the thread is unread; otherwise a
 * faint hollow dot. Rename/delete reveal on hover only.
 */
function ChatListRow({
  room,
  selected,
  unread,
  onSelect,
  onRename,
  onDelete
}: {
  room: ConversationRoomSummary
  selected: boolean
  unread: boolean
  onSelect: () => void
  onRename: () => void
  onDelete: () => void
}): React.JSX.Element {
  const running = room.lastTurnStatus === 'running'
  return (
    <div
      className={cn(
        'group relative rounded-md transition-colors',
        selected ? 'bg-muted' : 'hover:bg-muted/50'
      )}
    >
      <button
        type="button"
        className="flex w-full min-w-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
        onClick={onSelect}
      >
        <ChatStatusDot running={running} unread={unread} />
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-[13px] leading-tight',
            unread ? 'font-medium text-foreground' : 'text-foreground/75'
          )}
        >
          {room.title || 'Untitled chat'}
        </span>
      </button>
      <div
        className={cn(
          'absolute inset-y-0 right-0 hidden items-center gap-0.5 rounded-r-md pl-6 pr-1.5 group-hover:flex group-focus-within:flex',
          selected
            ? 'bg-gradient-to-l from-muted via-muted to-transparent'
            : 'bg-gradient-to-l from-background via-background to-transparent'
        )}
      >
        <RailItemAction icon={Pencil} label="Rename chat" onClick={onRename} />
        <RailItemAction icon={Trash2} label="Delete chat" onClick={onDelete} />
      </div>
    </div>
  )
}

function ChatStatusDot({
  running,
  unread
}: {
  running: boolean
  unread: boolean
}): React.JSX.Element {
  if (running) {
    return <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" />
  }
  return (
    <span
      className={cn(
        'size-2 shrink-0 rounded-full',
        unread ? 'bg-primary' : 'border border-muted-foreground/40'
      )}
    />
  )
}

function RenameChatDialog({
  target,
  onClose,
  onRenamed
}: {
  target: ConversationRoomSummary | null
  onClose: () => void
  onRenamed: (conversationId: string, title: string) => void
}): React.JSX.Element {
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!target) return
    queueMicrotask(() => {
      setTitle(target.title)
      setError('')
    })
  }, [target])

  const trimmed = title.trim()
  const canSave = Boolean(target) && Boolean(trimmed) && trimmed !== target?.title && !saving

  async function handleSave(): Promise<void> {
    if (!target || !canSave) return
    try {
      setSaving(true)
      setError('')
      await window.ordinus.conversations.updateTitle({
        conversationId: target.conversationId,
        title: trimmed
      })
      onRenamed(target.conversationId, trimmed)
      onClose()
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : 'Could not rename this chat.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={Boolean(target)} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Rename chat</DialogTitle>
          <DialogDescription>
            Only the chat name changes. The workspace folder stays linked.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Input
            maxLength={120}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && canSave) void handleSave()
            }}
          />
          {error ? <p className="text-xs text-status-attention">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" disabled={saving} onClick={onClose}>
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

function DeleteChatDialog({
  target,
  onClose,
  onDeleted
}: {
  target: ConversationRoomSummary | null
  onClose: () => void
  onDeleted: (conversationId: string) => void
}): React.JSX.Element {
  const [preview, setPreview] = useState<ConversationDeletePreview | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [deleteFiles, setDeleteFiles] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setPreview(null)
      setDeleteFiles(false)
      setError('')
      if (!target) return
      setLoadingPreview(true)
      window.ordinus.conversations
        .deletePreview({ conversationId: target.conversationId })
        .then((next) => {
          if (!cancelled) setPreview(next)
        })
        .catch((previewError) => {
          if (!cancelled) {
            setError(
              previewError instanceof Error ? previewError.message : 'Could not inspect this chat.'
            )
          }
        })
        .finally(() => {
          if (!cancelled) setLoadingPreview(false)
        })
    })
    return () => {
      cancelled = true
    }
  }, [target])

  async function handleDelete(): Promise<void> {
    if (!target || deleting) return
    try {
      setDeleting(true)
      setError('')
      await window.ordinus.conversations.delete({
        conversationId: target.conversationId,
        deleteWorkspaceFiles: deleteFiles
      })
      onDeleted(target.conversationId)
      onClose()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not delete this chat.')
    } finally {
      setDeleting(false)
    }
  }

  const fileCount = preview?.fileCount ?? 0

  return (
    <Dialog open={Boolean(target)} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-status-attention" />
            Delete chat
          </DialogTitle>
          <DialogDescription>
            This removes the chat history from Ordinus. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {loadingPreview ? (
            <div className="flex items-center gap-2 rounded-lg border bg-accent px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Checking the chat folder
            </div>
          ) : null}
          {preview ? (
            <label className="flex items-start gap-2 rounded-lg border bg-accent p-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={deleteFiles}
                disabled={!preview.folderExists || fileCount === 0}
                onChange={(event) => setDeleteFiles(event.target.checked)}
              />
              <span>
                Also delete the workspace folder
                {preview.folderExists ? (
                  <span className="text-muted-foreground">
                    {' '}
                    (<span className="font-mono">{preview.workingRoot}</span>, {fileCount}{' '}
                    {fileCount === 1 ? 'file' : 'files'})
                  </span>
                ) : (
                  <span className="text-muted-foreground"> (no folder on disk)</span>
                )}
              </span>
            </label>
          ) : null}
          {error ? <p className="text-xs text-status-attention">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" disabled={deleting} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={deleting || loadingPreview}
            onClick={() => void handleDelete()}
          >
            {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
