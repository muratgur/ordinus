// ADR-029 §8 — Sticky left-rail conversation list.
//
// Built on the shared Rail design system (ADR-033): a borderless rail with the
// canonical header / CTA / search + filter / list stack. Archived conversations
// move into the ⚙ "Show archived" filter (not a footer disclosure). Pin shows as
// a leading icon, an in-flight turn shows a live "Thinking…" meta, and the
// updated-at timestamp sits in the item's right slot.
//
// Provider badge appears ONLY when a conversation's provider differs from the
// current Ordinus default — per ADR §7, "silent by default, anomaly-only."
// Same-default conversations render badge-less so the list stays calm.

import { useEffect, useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import { AlertTriangle, Archive, Pencil, Pin, RotateCcw, Trash2 } from 'lucide-react'
import {
  Rail,
  RailFilterToggle,
  RailItem,
  RailItemAction,
  RailList
} from '@renderer/components/rail'
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
  /** Collapsed state and toggle for the rail (managed in home-screen.tsx). */
  collapsed: boolean
  onToggleCollapsed: () => void
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
  const [showArchived, setShowArchived] = useState(false)
  const [contextMenu, setContextMenu] = useState<ConversationContextMenu | null>(null)
  const busyConversationIds = new Set(props.busyConversationIds)
  const archivedCount = props.conversations.filter((conversation) =>
    Boolean(conversation.archivedAt)
  ).length

  const visibleConversations = props.conversations
    .filter((conversation) => showArchived || !conversation.archivedAt)
    .sort(sortActiveConversation)

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
    <Rail
      aria-label="Conversations"
      collapsed={props.collapsed}
      onToggleCollapsed={props.onToggleCollapsed}
      cta={{ label: 'New conversation', onClick: props.onNewConversation, disabled: props.busy }}
      searchPlaceholder="Find conversation"
      search={visibleConversations.map((conversation) => ({
        id: conversation.id,
        label: conversation.title,
        onSelect: () => props.onSelect(conversation.id)
      }))}
      filterActive={showArchived}
      filter={
        archivedCount > 0 ? (
          <RailFilterToggle
            icon={Archive}
            label="Show archived"
            checked={showArchived}
            onCheckedChange={setShowArchived}
          />
        ) : undefined
      }
    >
      <RailList
        isEmpty={!props.loading && visibleConversations.length === 0}
        empty="No conversations yet. Start one from the input on the right."
      >
        {props.loading
          ? null
          : visibleConversations.map((conversation) => {
              const archived = Boolean(conversation.archivedAt)
              const busy = busyConversationIds.has(conversation.id)
              return (
                <RailItem
                  key={conversation.id}
                  title={conversation.title}
                  selected={conversation.id === props.activeId}
                  dimmed={archived}
                  running={busy}
                  runningLabel="Thinking…"
                  leadingIcon={
                    conversation.pinnedAt ? <Pin className="size-3 text-primary" /> : undefined
                  }
                  meta={conversationMeta(conversation, props.defaultProviderId)}
                  rightSlot={
                    <span className="truncate">
                      {formatConversationUpdatedAt(conversation.updatedAt)}
                    </span>
                  }
                  onSelect={() => props.onSelect(conversation.id)}
                  onContextMenu={(event) => openContextMenu(event, conversation)}
                  actions={
                    archived ? undefined : (
                      <>
                        <RailItemAction
                          icon={Pin}
                          label={conversation.pinnedAt ? 'Unpin conversation' : 'Pin conversation'}
                          disabled={busy}
                          onClick={() => props.onTogglePinConversation(conversation)}
                        />
                        <RailItemAction
                          icon={Archive}
                          label="Archive conversation"
                          disabled={busy}
                          onClick={() => props.onArchiveConversation(conversation)}
                        />
                      </>
                    )
                  }
                />
              )
            })}
      </RailList>

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
    </Rail>
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

/**
 * Line-2 meta for a conversation: a frozen warning, an anomaly-only provider
 * badge, or the latest-turn preview (Conversations-rail parity — every row
 * gets a second line, so the list reads at a consistent rhythm). The
 * timestamp lives in the item's right slot, not here.
 */
function conversationMeta(
  conversation: OrdinusConversationSummary,
  defaultProviderId: string | null
): ReactNode {
  const isFrozen = Boolean(conversation.frozenReason)
  const isOnDifferentProvider =
    defaultProviderId !== null && conversation.providerId !== defaultProviderId

  if (isFrozen) {
    return (
      <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
        <AlertTriangle className="h-3 w-3 text-amber-500" />
        Frozen
      </span>
    )
  }
  if (isOnDifferentProvider) {
    return (
      <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
        {conversation.providerId}
      </span>
    )
  }
  return conversation.lastPreview || 'No messages yet'
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
      className="fixed z-50 min-w-48 rounded-md border bg-card p-1 text-sm text-foreground shadow-lg"
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
