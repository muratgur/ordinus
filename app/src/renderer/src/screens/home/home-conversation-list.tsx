// ADR-029 §8 — Sticky left-rail conversation list.
//
// Layout matches the workflows-screen sidebar pattern: an <aside> card with
// `rounded-md border bg-card`, a header row holding the collapse toggle +
// title + "+ New" action, a primary CTA strip below, then the scrollable
// list using the shared `ordinus-scrollbar` class.
//
// Provider badge appears ONLY when a conversation's provider differs from the
// current Ordinus default — per ADR §7, "silent by default, anomaly-only."
// Same-default conversations render badge-less so the list stays calm.

import { useEffect, useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import {
  AlertTriangle,
  Archive,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  PanelLeftClose,
  Pencil,
  Pin,
  Plus,
  RotateCcw,
  Trash2
} from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import type { OrdinusConversationSummary } from '@shared/contracts'

export type HomeConversationListProps = {
  conversations: OrdinusConversationSummary[]
  activeId: string | null
  busyConversationIds: readonly string[]
  /** Current Ordinus default provider — controls when the badge shows. */
  defaultProviderId: string | null
  onSelect: (id: string) => void
  onNewConversation: () => void
  onRenameConversation: (conversation: OrdinusConversationSummary) => void
  onTogglePinConversation: (conversation: OrdinusConversationSummary) => void
  onArchiveConversation: (conversation: OrdinusConversationSummary) => void
  onRestoreConversation: (conversation: OrdinusConversationSummary) => void
  onDeleteConversation: (conversation: OrdinusConversationSummary) => void
  /** Toggle the sidebar closed. Mirrors the open toggle in home-screen.tsx. */
  onCollapse: () => void
  busy: boolean
  /**
   * Initial fetch in progress. Suppresses the "no conversations yet" copy
   * so the user doesn't briefly see that message before their real list
   * paints in. Matches the workflows-screen sidebar's "One moment…" state.
   */
  loading: boolean
}

type ConversationContextMenu = {
  conversation: OrdinusConversationSummary
  x: number
  y: number
}

export function HomeConversationList(props: HomeConversationListProps): React.JSX.Element {
  const [archivedOpen, setArchivedOpen] = useState(false)
  const [contextMenu, setContextMenu] = useState<ConversationContextMenu | null>(null)
  const busyConversationIds = new Set(props.busyConversationIds)
  const activeConversations = props.conversations
    .filter((conversation) => !conversation.archivedAt)
    .sort(sortActiveConversation)
  const archivedConversations = props.conversations.filter((conversation) =>
    Boolean(conversation.archivedAt)
  )

  useEffect(() => {
    if (!contextMenu) return
    const close = (): void => setContextMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', close)
    }
  }, [contextMenu])

  const openContextMenu = (
    event: MouseEvent<HTMLDivElement>,
    conversation: OrdinusConversationSummary
  ): void => {
    event.preventDefault()
    setContextMenu({
      conversation,
      x: event.clientX,
      y: event.clientY
    })
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col overflow-hidden rounded-md border bg-card">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <MessageSquare className="size-4 text-primary" />
          <span className="text-sm font-semibold">Conversations</span>
        </div>
        <button
          type="button"
          title="Hide panel"
          aria-label="Hide conversations"
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={props.onCollapse}
        >
          <PanelLeftClose className="size-4" />
        </button>
      </div>

      <div className="border-b p-2">
        <Button
          size="sm"
          className="w-full"
          onClick={props.onNewConversation}
          disabled={props.busy}
        >
          <Plus className="size-4" /> New conversation
        </Button>
      </div>

      <div className="ordinus-scrollbar min-h-0 flex-1 overflow-y-auto">
        {props.loading ? (
          <div className="px-3 py-3 text-sm text-muted-foreground">One moment…</div>
        ) : activeConversations.length === 0 ? (
          <div className="px-3 py-3 text-sm text-muted-foreground">
            No conversations yet. Start one from the input on the right.
          </div>
        ) : (
          activeConversations.map((conversation) => (
            <ConversationListItem
              key={conversation.id}
              conversation={conversation}
              active={conversation.id === props.activeId}
              defaultProviderId={props.defaultProviderId}
              onClick={() => props.onSelect(conversation.id)}
              onContextMenu={(event) => openContextMenu(event, conversation)}
              actions={
                <ConversationHoverActions
                  conversation={conversation}
                  disabled={busyConversationIds.has(conversation.id)}
                  onTogglePin={() => props.onTogglePinConversation(conversation)}
                  onArchive={() => props.onArchiveConversation(conversation)}
                />
              }
            >
              <ConversationTitle conversation={conversation} />
            </ConversationListItem>
          ))
        )}
      </div>

      {archivedConversations.length > 0 ? (
        <div className="border-t">
          <button
            type="button"
            className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            onClick={() => setArchivedOpen((value) => !value)}
          >
            <span className="flex items-center gap-1.5">
              {archivedOpen ? (
                <ChevronDown className="size-3.5" />
              ) : (
                <ChevronRight className="size-3.5" />
              )}
              Archived
            </span>
            <span>{archivedConversations.length}</span>
          </button>
          {archivedOpen ? (
            <div className="max-h-48 overflow-y-auto border-t">
              {archivedConversations.map((conversation) => (
                <ConversationListItem
                  key={conversation.id}
                  conversation={conversation}
                  active={conversation.id === props.activeId}
                  defaultProviderId={props.defaultProviderId}
                  muted
                  onClick={() => props.onSelect(conversation.id)}
                  onContextMenu={(event) => openContextMenu(event, conversation)}
                >
                  <span className="truncate text-sm font-medium">{conversation.title}</span>
                </ConversationListItem>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {contextMenu ? (
        <ConversationMenu
          menu={contextMenu}
          disabled={busyConversationIds.has(contextMenu.conversation.id)}
          onClose={() => setContextMenu(null)}
          onRename={() => props.onRenameConversation(contextMenu.conversation)}
          onTogglePin={() => props.onTogglePinConversation(contextMenu.conversation)}
          onArchive={() => props.onArchiveConversation(contextMenu.conversation)}
          onRestore={() => props.onRestoreConversation(contextMenu.conversation)}
          onDelete={() => props.onDeleteConversation(contextMenu.conversation)}
        />
      ) : null}
    </aside>
  )
}

function sortActiveConversation(
  a: OrdinusConversationSummary,
  b: OrdinusConversationSummary
): number {
  if (a.pinnedAt && !b.pinnedAt) return -1
  if (!a.pinnedAt && b.pinnedAt) return 1
  return b.updatedAt.localeCompare(a.updatedAt)
}

function ConversationListItem({
  conversation,
  active,
  defaultProviderId,
  muted = false,
  actions,
  children,
  onClick,
  onContextMenu
}: {
  conversation: OrdinusConversationSummary
  active: boolean
  defaultProviderId: string | null
  muted?: boolean
  actions?: ReactNode
  children: ReactNode
  onClick: () => void
  onContextMenu: (event: MouseEvent<HTMLDivElement>) => void
}): React.JSX.Element {
  return (
    <div
      onContextMenu={onContextMenu}
      className={cn(
        'group relative border-b transition-colors',
        active ? 'bg-accent' : 'hover:bg-accent/50',
        muted ? 'opacity-75' : ''
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex w-full flex-col gap-1 px-3 py-2 text-left"
      >
        {children}
        <ConversationMetaRow conversation={conversation} defaultProviderId={defaultProviderId} />
      </button>
      {actions}
    </div>
  )
}

function ConversationTitle({
  conversation
}: {
  conversation: OrdinusConversationSummary
}): React.JSX.Element {
  return (
    <div className="flex min-w-0 items-center gap-1">
      {conversation.pinnedAt ? <Pin className="size-3 text-primary" /> : null}
      <span className="truncate text-sm font-medium">{conversation.title}</span>
    </div>
  )
}

function ConversationMetaRow({
  conversation,
  defaultProviderId
}: {
  conversation: OrdinusConversationSummary
  defaultProviderId: string | null
}): React.JSX.Element {
  const isFrozen = Boolean(conversation.frozenReason)
  const isOnDifferentProvider =
    defaultProviderId !== null && conversation.providerId !== defaultProviderId

  return (
    <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
      <span className="truncate">{formatConversationUpdatedAt(conversation.updatedAt)}</span>
      {isFrozen ? (
        <>
          <AlertTriangle className="h-3 w-3 text-amber-500" />
          <span className="text-amber-600 dark:text-amber-400">Frozen</span>
        </>
      ) : isOnDifferentProvider ? (
        <span className="rounded bg-muted px-1.5 py-0.5">{conversation.providerId}</span>
      ) : null}
    </span>
  )
}

function ConversationMenu({
  menu,
  disabled,
  onClose,
  onRename,
  onTogglePin,
  onArchive,
  onRestore,
  onDelete
}: {
  menu: ConversationContextMenu
  disabled: boolean
  onClose: () => void
  onRename: () => void
  onTogglePin: () => void
  onArchive: () => void
  onRestore: () => void
  onDelete: () => void
}): React.JSX.Element {
  const archived = Boolean(menu.conversation.archivedAt)
  return (
    <div
      className="fixed z-50 min-w-48 rounded-md border bg-popover p-1 text-sm text-popover-foreground shadow-md"
      style={{ left: menu.x, top: menu.y }}
      onClick={(event) => event.stopPropagation()}
    >
      {archived ? (
        <>
          <MenuButton
            icon={<RotateCcw className="size-3.5" />}
            label="Restore"
            disabled={disabled}
            onClick={() => {
              onRestore()
              onClose()
            }}
          />
          <MenuButton
            icon={<Trash2 className="size-3.5" />}
            label="Delete permanently"
            disabled={disabled}
            onClick={() => {
              onDelete()
              onClose()
            }}
          />
        </>
      ) : (
        <>
          <MenuButton
            icon={<Pin className="size-3.5" />}
            label={menu.conversation.pinnedAt ? 'Unpin' : 'Pin'}
            disabled={disabled}
            onClick={() => {
              onTogglePin()
              onClose()
            }}
          />
          <MenuButton
            icon={<Pencil className="size-3.5" />}
            label="Rename"
            onClick={() => {
              onRename()
              onClose()
            }}
          />
          <MenuButton
            icon={<Archive className="size-3.5" />}
            label="Archive"
            disabled={disabled}
            onClick={() => {
              onArchive()
              onClose()
            }}
          />
          <div className="-mx-1 my-1 h-px bg-border" />
          <MenuButton
            icon={<Trash2 className="size-3.5" />}
            label="Delete permanently"
            disabled={disabled}
            onClick={() => {
              onDelete()
              onClose()
            }}
          />
        </>
      )}
    </div>
  )
}

function ConversationHoverActions({
  conversation,
  disabled,
  onTogglePin,
  onArchive
}: {
  conversation: OrdinusConversationSummary
  disabled: boolean
  onTogglePin: () => void
  onArchive: () => void
}): React.JSX.Element {
  return (
    <span className="absolute right-2 top-2 hidden rounded-md border bg-card p-0.5 shadow-sm group-hover:flex">
      <IconAction
        title={conversation.pinnedAt ? 'Unpin conversation' : 'Pin conversation'}
        disabled={disabled}
        onClick={onTogglePin}
      >
        <Pin className="size-3.5" />
      </IconAction>
      <IconAction title="Archive conversation" disabled={disabled} onClick={onArchive}>
        <Archive className="size-3.5" />
      </IconAction>
    </span>
  )
}

function IconAction({
  title,
  disabled = false,
  onClick,
  children
}: {
  title: string
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
      onClick={(event) => {
        event.stopPropagation()
        if (disabled) return
        onClick()
      }}
    >
      {children}
    </button>
  )
}

function MenuButton({
  icon,
  label,
  disabled = false,
  onClick
}: {
  icon: ReactNode
  label: string
  disabled?: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled}
      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-40"
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

function formatConversationUpdatedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Updated recently'

  const now = new Date()
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()

  const time = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)

  if (sameDay) return `Today ${time}`
  if (isYesterday) return `Yesterday ${time}`

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}
