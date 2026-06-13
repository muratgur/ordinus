// ADR-029 §8 / M4 — Home screen.
//
// Two states, one component:
//   - Empty: no active conversation. Centered Spotlight-ish input + chips.
//     The conversation list sidebar stays out of the way (collapsed via the
//     conditional render below).
//   - Active: a conversation is selected. Sidebar visible, transcript + input.
//
// State ownership: this component owns the in-memory message history per
// conversation, keyed by conversation id. IPC returns one turn outcome per
// sendTurn; we never replay the transcript from the backend (see types.ts
// header for the rationale). Switching conversations is fine — the previous
// transcript stays in memory for the page lifetime.

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Brain, HelpCircle } from 'lucide-react'
import type {
  InteractionAnswer,
  OrdinusActionEvent,
  OrdinusConfirmationDecision,
  OrdinusConversationSummary,
  OrdinusConversationTurn,
  OrdinusPendingConfirmation,
  OrdinusPendingInputRequest,
  ProviderId,
  ProviderStatus
} from '@shared/contracts'
import { OrdinusPendingInputRequestSchema } from '@shared/contracts'
import { createOrdinusConversationTitleFromMessage } from '@shared/ordinus-title'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@renderer/components/ui/alert-dialog'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { notify } from '@renderer/lib/notifications'
import { useLiveTurnActivity } from '@renderer/hooks/use-live-turn-activity'
import { useRunInspector } from '@renderer/hooks/use-run-inspector'
import { RunInspectorSheet } from '@renderer/components/run-inspector-sheet'
import { QuestionPanel } from '@renderer/components/question-panel'
import { HomeConfirmationPanel } from './home-confirmation-panel'
import { HomeConversationList } from './home-conversation-list'
import { HomeTranscript } from './home-transcript'
import { HomeTopStrip } from './home-top-strip'
import { HomeInput } from './home-input'
import { HomeEmptyState } from './home-empty-state'
import { HomeFrozenBanner } from './home-frozen-banner'
import { HomeMemoryPanel } from './home-memory-panel'
import { HomeWelcomePanel } from './home-welcome-panel'
import { parseSlashCommand } from './slash-commands'
import {
  readHomeSidebarDocked,
  readHomeWelcomeSeen,
  writeHomeSidebarDocked,
  writeHomeWelcomeSeen
} from './storage'
import type { HomeMessage } from './types'

type MessageMap = Record<string, HomeMessage[]>
type PendingTurnMap = Record<string, string>
type BusyConversationMap = Record<string, boolean>

const THINKING_LABEL = 'Ordinus is thinking...'

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function nowIso(): string {
  return new Date().toISOString()
}

// ADR-029 M4.5 — Convert a persisted turn row into the renderer-side message
// shape. Status indicators don't exist in persistence (they're transient UI),
// so the conversion is one-to-one for the three durable kinds.
function turnToMessage(turn: OrdinusConversationTurn): HomeMessage {
  switch (turn.kind) {
    case 'user':
      return {
        kind: 'user',
        id: turn.id,
        text: turn.content,
        source: turn.source,
        at: turn.createdAt
      }
    case 'assistant':
      return {
        kind: 'assistant',
        id: turn.id,
        text: turn.content,
        resultContent: turn.resultContent,
        artifactRefs: turn.artifactRefs,
        changedFiles: turn.changedFiles,
        turnId: turn.turnId,
        at: turn.createdAt
      }
    case 'error':
      return {
        kind: 'error',
        id: turn.id,
        message: turn.content,
        at: turn.createdAt
      }
    case 'cancelled':
      // ADR-034: permanent muted marker for a user-stopped turn.
      return {
        kind: 'cancelled',
        id: turn.id,
        at: turn.createdAt
      }
  }
}

export function HomeScreen(): React.JSX.Element {
  const [conversations, setConversations] = useState<OrdinusConversationSummary[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messagesByConversation, setMessagesByConversation] = useState<MessageMap>({})
  // One Ordinus conversation can be waiting on a provider turn while the rest
  // of Home remains usable. Keep turn-busy state keyed by conversation id; the
  // active input derives its disabled state from the active conversation only.
  const [pendingTurnLabelsByConversation, setPendingTurnLabelsByConversation] =
    useState<PendingTurnMap>({})
  const [freshStartBusyByConversation, setFreshStartBusyByConversation] =
    useState<BusyConversationMap>({})
  // ADR-034 — between pressing Stop and the run actually closing the composer
  // shows "Stopping…" and the Stop button disables. Cleared when the turn
  // settles (the cancelled provider process closes and sendTurn resolves).
  const [stoppingByConversation, setStoppingByConversation] = useState<BusyConversationMap>({})
  // Remember affordance (agent-room parity): hover bookmark on user messages
  // writes the message into Ordinus's own memory store. Page-lifetime state —
  // re-saving after a restart is harmless (writeMemory upserts by name).
  const [rememberedMessageIds, setRememberedMessageIds] = useState<Set<string>>(new Set())
  const [rememberingMessageId, setRememberingMessageId] = useState('')
  const [defaultProviderId, setDefaultProviderId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [renameTarget, setRenameTarget] = useState<OrdinusConversationSummary | null>(null)
  const [renameTitle, setRenameTitle] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<OrdinusConversationSummary | null>(null)
  const [dialogBusy, setDialogBusy] = useState(false)
  // ADR-029 M5 UI polish — sidebar docked/collapsed, mirroring the
  // workflows-screen pattern. Default docked; user can collapse to give the
  // transcript the full width. Persisted to localStorage via the shared
  // helper so the choice survives navigation and app restarts.
  const [sidebarDocked, setSidebarDocked] = useState<boolean>(readHomeSidebarDocked)
  useEffect(() => {
    writeHomeSidebarDocked(sidebarDocked)
  }, [sidebarDocked])
  // ADR-029 M8 — memory panel open/close state. Lives on Home (not Settings)
  // so the user can reference it mid-conversation without losing the
  // transcript context.
  const [memoryOpen, setMemoryOpen] = useState(false)

  // ADR-029 §10 — first-run welcome panel. Auto-opens once (the first time a
  // freshly-onboarded user reaches Home), tracked in localStorage. Manual
  // re-open from the header `?` does not clear the seen flag.
  const [welcomeOpen, setWelcomeOpen] = useState<boolean>(() => !readHomeWelcomeSeen())
  const handleDismissWelcome = useCallback(() => {
    setWelcomeOpen(false)
    writeHomeWelcomeSeen(true)
  }, [])

  // ADR-029 M6 — pending destructive-tool confirmations. The store on the
  // main side may already hold entries by the time HomeScreen mounts (user
  // navigated away with a panel open), so we fetch once and then subscribe
  // for live updates.
  const [pendingConfirmations, setPendingConfirmations] = useState<OrdinusPendingConfirmation[]>([])
  const [confirmationBusy, setConfirmationBusy] = useState(false)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const initial = await window.ordinus.ordinus.listPendingConfirmations()
        if (!cancelled) setPendingConfirmations(initial)
      } catch {
        // Non-fatal — empty initial list is the right default.
      }
    })()
    const off = window.ordinus.ordinus.onActionEvent((event: OrdinusActionEvent) => {
      if (event.kind === 'confirmation_requested') {
        setPendingConfirmations((prev) =>
          prev.some((p) => p.pendingId === event.pending.pendingId)
            ? prev
            : [...prev, event.pending]
        )
      } else if (event.kind === 'confirmation_resolved') {
        setPendingConfirmations((prev) => prev.filter((p) => p.pendingId !== event.pendingId))
      }
    })
    return () => {
      cancelled = true
      off()
    }
  }, [])

  // ADR-029 — pending needs_input requests. Same rehydrate-on-mount +
  // subscribe pattern as confirmations, but persisted in the DB so a request
  // outlives an app restart. Scoped per conversation (each carries its
  // conversationId); the panel only paints for the active conversation.
  const [inputRequests, setInputRequests] = useState<OrdinusPendingInputRequest[]>([])
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const initial = await window.ordinus.ordinus.listPendingInputRequests()
        if (!cancelled) setInputRequests(initial)
      } catch {
        // Non-fatal — empty initial list is the right default.
      }
    })()
    const off = window.ordinus.ordinus.onActionEvent((event: OrdinusActionEvent) => {
      if (event.kind === 'input_request_requested') {
        const parsed = OrdinusPendingInputRequestSchema.safeParse(event.request)
        if (!parsed.success) return
        const request = parsed.data
        setInputRequests((prev) =>
          prev.some((r) => r.requestId === request.requestId) ? prev : [...prev, request]
        )
      } else if (event.kind === 'input_request_resolved') {
        setInputRequests((prev) => prev.filter((r) => r.requestId !== event.requestId))
      }
    })
    return () => {
      cancelled = true
      off()
    }
  }, [])

  const handleResolveConfirmation = useCallback(
    async (pendingId: string, decision: OrdinusConfirmationDecision) => {
      setConfirmationBusy(true)
      try {
        await window.ordinus.ordinus.resolveConfirmation({ pendingId, decision })
        // Optimistic removal — the resolved event will also fire (idempotent).
        setPendingConfirmations((prev) => prev.filter((p) => p.pendingId !== pendingId))
        if (decision === 'cancelled') {
          notify.info({ title: 'Action cancelled' })
        }
      } catch (err) {
        notify.error({
          title: 'Could not resolve confirmation',
          description: err instanceof Error ? err.message : String(err)
        })
      } finally {
        setConfirmationBusy(false)
      }
    },
    []
  )

  // Load list + flag on mount. We don't fetch the singleton config explicitly
  // because the only thing we need from it right now is the default provider,
  // which we derive from the most-recent conversation if one exists. When the
  // Settings panel for Ordinus lands (M7) we'll fetch that directly.
  // ADR-029 §7 / M7 — provider statuses for the frozen-banner check. Each
  // conversation carries its own provider; if that provider is currently
  // not connected, we render the banner instead of the input.
  const [providerStatuses, setProviderStatuses] = useState<ProviderStatus[]>([])

  // Fast path: flag, singleton, conversation list are all tiny SQLite reads.
  // The screen can render the moment these resolve, typically the same frame
  // it mounts. We KEEP runtime.getProviders out of this critical path — it
  // shells out to each CLI for a `--version` check (200–500ms) and is only
  // needed for the frozen-banner derivation, which only matters when the
  // user opens a conversation whose provider has gone away. See the second
  // effect below for the deferred provider load.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [list, singleton] = await Promise.all([
          window.ordinus.ordinus.listConversations(),
          window.ordinus.ordinus.getSingleton()
        ])
        if (cancelled) return
        setConversations(list)
        if (singleton) {
          setDefaultProviderId(singleton.providerId)
        } else if (list.length > 0) {
          setDefaultProviderId(list[0].providerId)
        }
        const firstActive = list.find((conversation) => !conversation.archivedAt)
        if (firstActive) {
          setActiveId(firstActive.id)
        }
      } catch (err) {
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Slow path: provider statuses stream in afterwards. Until they arrive the
  // frozen-banner check resolves to "no banner" (which is the right default
  // — better to optimistically allow the input than to flash a banner the
  // moment a conversation opens).
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const providers = await window.ordinus.runtime.getProviders()
        if (!cancelled) setProviderStatuses(providers)
      } catch {
        // Best-effort. providerStatuses stays empty.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const activeConversation = activeId
    ? (conversations.find((c) => c.id === activeId) ?? null)
    : null
  const activeArchived = Boolean(activeConversation?.archivedAt)
  const activePendingLabel = activeId ? pendingTurnLabelsByConversation[activeId] : undefined
  const activeTurnBusy = Boolean(activePendingLabel)
  const activeStopping = activeId ? Boolean(stoppingByConversation[activeId]) : false
  // ADR-034 — the live activity line. Subscribes to observability run pushes
  // for the active conversation and composes the single mutating status label
  // (event phrase + elapsed timer + quiet/stalled softening). Falls back to
  // the opening "thinking" label before the first snapshot arrives.
  const { label: liveActivityLabel } = useLiveTurnActivity(activeId, activeTurnBusy, activeStopping)

  // ADR-036 — run inspector bottom sheet (shared turn-scoped state machine).
  const inspector = useRunInspector(activeId)
  // The "thinking" row is derived from busy state (reconciled from the backend),
  // so the indicator survives navigating away and back while a turn is still in
  // flight. ADR-034: the label itself is the live activity line; the row is
  // synthesized here (the send path no longer appends its own status message).
  const activeMessages = useMemo(() => {
    const base = activeId ? (messagesByConversation[activeId] ?? []) : []
    if (!activeTurnBusy || base.some((m) => m.kind === 'status')) return base
    return [
      ...base,
      {
        kind: 'status' as const,
        id: `status-live-${activeId}`,
        label: liveActivityLabel ?? THINKING_LABEL,
        at: ''
      }
    ]
  }, [activeId, messagesByConversation, activeTurnBusy, liveActivityLabel])
  const activeStartFreshBusy = activeId ? Boolean(freshStartBusyByConversation[activeId]) : false
  const busyConversationIds = useMemo(
    () => Object.keys(pendingTurnLabelsByConversation),
    [pendingTurnLabelsByConversation]
  )

  // ADR-029 §7 / M7 — derive "is the active conversation frozen?". A
  // conversation is frozen if its row is explicitly marked (DB column) OR if
  // its provider isn't currently connected. We treat the implicit "provider
  // not connected" case identically to the explicit flag so the user sees
  // the banner without us having to mutate the row eagerly.
  const activeProviderStatus = activeConversation
    ? (providerStatuses.find((p) => p.id === activeConversation.providerId) ?? null)
    : null
  const activeFrozenReason: string | null = activeConversation
    ? (activeConversation.frozenReason ??
      (activeProviderStatus && !activeProviderStatus.connected
        ? `This conversation was started with ${activeConversation.providerId}, which is not currently connected.`
        : null))
    : null

  // ADR-029 §8 / P0 — the welcoming hero shows whenever there is no active
  // conversation OR the active conversation has loaded and has zero messages
  // (including a just-created "New conversation"). Without this, clicking New
  // drops the user into a blank transcript and the welcoming surface is never
  // seen again after the first conversation exists.
  //
  // We gate on "loaded" (the messages map has an entry for this id) rather than
  // "empty array" so an existing conversation with history doesn't flash the
  // hero for a frame before its transcript rehydrates. Frozen conversations
  // always use the active branch so the banner can render.
  const activeLoaded = activeId
    ? Object.prototype.hasOwnProperty.call(messagesByConversation, activeId)
    : false
  const showWelcoming =
    !activeConversation || (activeLoaded && activeMessages.length === 0 && !activeFrozenReason)

  const handleStartFresh = useCallback(async () => {
    if (!activeConversation) return
    const conversationId = activeConversation.id
    setFreshStartBusyByConversation((prev) => ({ ...prev, [conversationId]: true }))
    try {
      // Archive the frozen conversation so it drops out of the active list,
      // then create a brand-new conversation on the current singleton
      // provider. No transcript carry-over (ADR §7 calls for opt-in
      // summarize-and-fork; that lands in a follow-up).
      await window.ordinus.ordinus.archiveConversation({
        conversationId: activeConversation.id
      })
      const list = await window.ordinus.ordinus.listConversations()
      setConversations(list)
      setActiveId(null)
      notify.success({ title: 'Started a new conversation' })
    } catch (err) {
      notify.error({
        title: 'Could not start fresh',
        description: err instanceof Error ? err.message : String(err)
      })
    } finally {
      setFreshStartBusyByConversation((prev) => {
        const next = { ...prev }
        delete next[conversationId]
        return next
      })
    }
  }, [activeConversation])

  // ADR-029 M4.5 — Rehydrate the active conversation's transcript from the DB
  // when it becomes active and we haven't loaded it yet in this page life.
  // We key on "no entry in the map" rather than "empty array" so an explicitly
  // empty (just-created) conversation doesn't trigger a redundant fetch loop.
  useEffect(() => {
    if (!activeId) return
    if (Object.prototype.hasOwnProperty.call(messagesByConversation, activeId)) return
    let cancelled = false
    void (async () => {
      try {
        const turns = await window.ordinus.ordinus.listTurns({ conversationId: activeId })
        if (cancelled) return
        setMessagesByConversation((prev) => {
          // Concurrent setters (e.g. a fast user send) may have already
          // populated this slot — don't clobber.
          if (Object.prototype.hasOwnProperty.call(prev, activeId)) return prev
          return { ...prev, [activeId]: turns.map(turnToMessage) }
        })
      } catch (err) {
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : String(err))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeId, messagesByConversation])

  const handleNewConversation = useCallback(() => {
    setActiveId(null)
  }, [])

  const appendMessage = useCallback((conversationId: string, message: HomeMessage) => {
    setMessagesByConversation((prev) => {
      const existing = prev[conversationId] ?? []
      return { ...prev, [conversationId]: [...existing, message] }
    })
  }, [])

  const touchConversation = useCallback((conversationId: string, preview?: string) => {
    const updatedAt = nowIso()
    setConversations((prev) => {
      const next = prev.map((conversation) => {
        if (conversation.id !== conversationId) return conversation
        return {
          ...conversation,
          updatedAt,
          // Optimistic rail meta — the authoritative value lands with the
          // next listConversations reload after the turn settles.
          lastPreview: preview ?? conversation.lastPreview
        }
      })
      return next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    })
  }, [])

  const reloadConversation = useCallback(async (conversationId: string) => {
    const [list, turns] = await Promise.all([
      window.ordinus.ordinus.listConversations(),
      window.ordinus.ordinus.listTurns({ conversationId })
    ])
    setConversations(list)
    setMessagesByConversation((prev) => ({
      ...prev,
      [conversationId]: turns.map(turnToMessage)
    }))
  }, [])

  const reloadConversations = useCallback(async () => {
    const list = await window.ordinus.ordinus.listConversations()
    setConversations(list)
    return list
  }, [])

  const replaceStatus = useCallback((conversationId: string, replacement: HomeMessage | null) => {
    setMessagesByConversation((prev) => {
      const existing = prev[conversationId] ?? []
      const filtered = existing.filter((m) => m.kind !== 'status')
      return {
        ...prev,
        [conversationId]: replacement ? [...filtered, replacement] : filtered
      }
    })
  }, [])

  // Turn lifecycle reconciliation. The backend (runningConversationIds) is the
  // source of truth for "a turn is in flight"; the renderer's busy state is
  // ephemeral and is lost when HomeScreen unmounts on navigation. On (re)mount
  // we seed the busy labels from the backend, and we subscribe to the
  // turn_started / turn_settled events so a turn that finishes while the user is
  // on another screen still clears the indicator and pulls in the reply when
  // they return. Mirrors how Workboard/Conversations stay live (server-derived
  // status + event subscription), adapted to Ordinus's event-driven model.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const running = await window.ordinus.ordinus.listRunningConversations()
        if (cancelled || running.length === 0) return
        setPendingTurnLabelsByConversation((prev) => {
          const next = { ...prev }
          for (const id of running) next[id] = THINKING_LABEL
          return next
        })
      } catch {
        // Non-fatal — without this the indicator simply won't rehydrate.
      }
    })()
    const off = window.ordinus.ordinus.onActionEvent((event: OrdinusActionEvent) => {
      if (event.kind === 'turn_started') {
        // A local send already set this label (in handleSend, before sendTurn);
        // a turn started elsewhere (Telegram) has not. We use that to tell them
        // apart without a new event field.
        let externallyStarted = false
        setPendingTurnLabelsByConversation((prev) => {
          externallyStarted = !prev[event.conversationId]
          return prev[event.conversationId]
            ? prev
            : { ...prev, [event.conversationId]: THINKING_LABEL }
        })
        // Only pull in the persisted user message for turns we did NOT initiate.
        // A local send already rendered its optimistic bubble; reloading here
        // would swap it for a different-id persisted row and flicker every send.
        if (externallyStarted) {
          void reloadConversation(event.conversationId).catch(() => {})
        }
      } else if (event.kind === 'turn_settled') {
        setPendingTurnLabelsByConversation((prev) => {
          if (!prev[event.conversationId]) return prev
          const next = { ...prev }
          delete next[event.conversationId]
          return next
        })
        setStoppingByConversation((prev) => {
          if (!prev[event.conversationId]) return prev
          const next = { ...prev }
          delete next[event.conversationId]
          return next
        })
        // Pull the freshly-persisted assistant turn (idempotent with the local
        // send's own finally-reload; a needs_input outcome paints via its own
        // event instead).
        void reloadConversation(event.conversationId).catch(() => {})
      }
    })
    return () => {
      cancelled = true
      off()
    }
  }, [reloadConversation])

  const handleSend = useCallback(
    async (text: string) => {
      // From the empty state path the user has no conversation yet — open one
      // first, then dispatch the turn against it. From the active state we
      // already have a conversation id.
      let conversationId = activeId
      if (conversationId && pendingTurnLabelsByConversation[conversationId]) {
        return
      }
      const slash = parseSlashCommand(text)
      const displayText = text
      const sentText = slash ? slash.command.expandPrompt(slash.args) : text
      if (!conversationId) {
        try {
          const created = await window.ordinus.ordinus.createConversation({
            title: createOrdinusConversationTitleFromMessage(displayText)
          })
          conversationId = created.id
          setConversations((prev) => [created, ...prev.filter((c) => c.id !== created.id)])
          setMessagesByConversation((prev) => ({ ...prev, [created.id]: [] }))
          setActiveId(created.id)
          if (!defaultProviderId) setDefaultProviderId(created.providerId)
        } catch (err) {
          setLoadError(err instanceof Error ? err.message : String(err))
          return
        }
      }
      if (!conversationId) return
      if (pendingTurnLabelsByConversation[conversationId]) return

      // ADR-029 §5 / M5 — slash command expansion. If the text is `/cmd <args>`
      // and `cmd` is registered, send the EXPANDED prompt to Ordinus (with
      // explicit directives) while keeping the user's literal `/cmd <args>`
      // in the transcript. Unknown commands fall through as plain messages.
      appendMessage(conversationId, {
        kind: 'user',
        id: newId('u'),
        text: displayText,
        source: null,
        at: nowIso()
      })
      touchConversation(conversationId, displayText)
      // ADR-034: no local status append — the live activity row is synthesized
      // from busy state so it can mutate with observability pushes.
      setPendingTurnLabelsByConversation((prev) => ({
        ...prev,
        [conversationId]: THINKING_LABEL
      }))

      try {
        await window.ordinus.ordinus.sendTurn({
          conversationId,
          message: sentText,
          displayMessage: slash ? displayText : undefined
        })
      } catch (err) {
        replaceStatus(conversationId, null)
        appendMessage(conversationId, {
          kind: 'error',
          id: newId('e'),
          message: err instanceof Error ? err.message : String(err),
          at: nowIso()
        })
      } finally {
        setPendingTurnLabelsByConversation((prev) => {
          const next = { ...prev }
          delete next[conversationId]
          return next
        })
        setStoppingByConversation((prev) => {
          const next = { ...prev }
          delete next[conversationId]
          return next
        })
        try {
          await reloadConversation(conversationId)
        } catch {
          // Non-fatal; the optimistic activity update above keeps the sidebar usable.
        }
      }
    },
    [
      activeId,
      appendMessage,
      defaultProviderId,
      pendingTurnLabelsByConversation,
      reloadConversation,
      replaceStatus,
      touchConversation
    ]
  )

  const handleAnswerInputRequest = useCallback(
    async (requestId: string, answers: InteractionAnswer[]) => {
      const request = inputRequests.find((r) => r.requestId === requestId)
      if (!request) return
      const conversationId = request.conversationId
      // Optimistically close the panel; the resolved event also fires.
      setInputRequests((prev) => prev.filter((r) => r.requestId !== requestId))
      setPendingTurnLabelsByConversation((prev) => ({
        ...prev,
        [conversationId]: THINKING_LABEL
      }))
      try {
        await window.ordinus.ordinus.answerInputRequest({ requestId, answers })
      } catch (err) {
        replaceStatus(conversationId, null)
        appendMessage(conversationId, {
          kind: 'error',
          id: newId('e'),
          message: err instanceof Error ? err.message : String(err),
          at: nowIso()
        })
      } finally {
        setPendingTurnLabelsByConversation((prev) => {
          const next = { ...prev }
          delete next[conversationId]
          return next
        })
        try {
          await reloadConversation(conversationId)
        } catch {
          // Non-fatal; the transcript will catch up on next load.
        }
      }
    },
    [appendMessage, inputRequests, reloadConversation, replaceStatus]
  )

  // Remember (agent-room parity): save a user message into Ordinus memory as
  // a note. The name doubles as the dedupe key in the memory store.
  const handleRememberMessage = useCallback(
    async (messageId: string, text: string) => {
      const body = text.trim()
      if (!body || rememberingMessageId || rememberedMessageIds.has(messageId)) return
      setRememberingMessageId(messageId)
      try {
        await window.ordinus.ordinus.writeMemory({
          type: 'note',
          name: createOrdinusConversationTitleFromMessage(body),
          body: body.slice(0, 2000)
        })
        setRememberedMessageIds((prev) => new Set(prev).add(messageId))
      } catch (err) {
        notify.error({
          title: 'Could not save that to memory',
          description: err instanceof Error ? err.message : String(err)
        })
      } finally {
        setRememberingMessageId('')
      }
    },
    [rememberedMessageIds, rememberingMessageId]
  )

  // ADR-035 — reveal a transcript file in Finder. The main process validates
  // the path against the turn row's recorded references.
  const handleRevealFile = useCallback(
    async (messageId: string, relativePath: string) => {
      if (!activeId) return
      try {
        await window.ordinus.ordinus.revealPath({
          conversationId: activeId,
          turnRowId: messageId,
          relativePath
        })
      } catch (err) {
        notify.error({
          title: 'Could not show that file',
          description: err instanceof Error ? err.message : String(err)
        })
      }
    },
    [activeId]
  )

  // ADR-034 — Stop button. Marks the conversation as stopping (composer shows
  // "Stopping…") and asks main to kill the provider process. The interrupted
  // sendTurn resolves through its normal finally path, which clears busy and
  // reloads the transcript (now containing the 'cancelled' marker row).
  const handleStopTurn = useCallback(async () => {
    if (!activeId) return
    const conversationId = activeId
    setStoppingByConversation((prev) => ({ ...prev, [conversationId]: true }))
    try {
      await window.ordinus.ordinus.cancelTurn({ conversationId })
    } catch (err) {
      setStoppingByConversation((prev) => {
        const next = { ...prev }
        delete next[conversationId]
        return next
      })
      notify.error({
        title: 'Could not stop the response',
        description: err instanceof Error ? err.message : String(err)
      })
    }
  }, [activeId])

  const handleCancelInputRequest = useCallback(async (requestId: string) => {
    setInputRequests((prev) => prev.filter((r) => r.requestId !== requestId))
    try {
      await window.ordinus.ordinus.cancelInputRequest({ requestId })
    } catch {
      // Non-fatal — the panel is already gone; a stale request stays
      // 'pending' in the DB and simply won't reappear this session.
    }
  }, [])

  const openRenameDialog = useCallback((conversation: OrdinusConversationSummary) => {
    setRenameTarget(conversation)
    setRenameTitle(conversation.title)
  }, [])

  const handleSubmitRename = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!renameTarget) return
      const title = renameTitle.trim()
      if (!title) return
      setDialogBusy(true)
      try {
        await window.ordinus.ordinus.updateConversationTitle({
          conversationId: renameTarget.id,
          title
        })
        setConversations((prev) =>
          prev.map((conversation) =>
            conversation.id === renameTarget.id
              ? { ...conversation, title, updatedAt: nowIso() }
              : conversation
          )
        )
        setRenameTarget(null)
      } catch (err) {
        notify.error({
          title: 'Could not rename conversation',
          description: err instanceof Error ? err.message : String(err)
        })
      } finally {
        setDialogBusy(false)
      }
    },
    [renameTarget, renameTitle]
  )

  const handleArchiveConversation = useCallback(
    async (conversation: OrdinusConversationSummary) => {
      if (pendingTurnLabelsByConversation[conversation.id]) {
        notify.error({
          title: 'Conversation is running',
          description: 'Wait for Ordinus to finish before archiving this conversation.'
        })
        return
      }
      try {
        await window.ordinus.ordinus.archiveConversation({ conversationId: conversation.id })
        await reloadConversations()
        if (activeId === conversation.id) {
          setActiveId(null)
        }
      } catch (err) {
        notify.error({
          title: 'Could not archive conversation',
          description: err instanceof Error ? err.message : String(err)
        })
      }
    },
    [activeId, pendingTurnLabelsByConversation, reloadConversations]
  )

  const handleTogglePinConversation = useCallback(
    async (conversation: OrdinusConversationSummary) => {
      if (pendingTurnLabelsByConversation[conversation.id]) {
        notify.error({
          title: 'Conversation is running',
          description: 'Wait for Ordinus to finish before changing this pin.'
        })
        return
      }
      const pinned = !conversation.pinnedAt
      const pinnedAt = pinned ? nowIso() : null
      setConversations((prev) =>
        prev.map((entry) => (entry.id === conversation.id ? { ...entry, pinnedAt } : entry))
      )
      try {
        await window.ordinus.ordinus.setConversationPinned({
          conversationId: conversation.id,
          pinned
        })
        await reloadConversations()
      } catch (err) {
        notify.error({
          title: 'Could not update pin',
          description: err instanceof Error ? err.message : String(err)
        })
        void reloadConversations()
      }
    },
    [pendingTurnLabelsByConversation, reloadConversations]
  )

  const handleRestoreConversation = useCallback(
    async (conversation: OrdinusConversationSummary) => {
      try {
        await window.ordinus.ordinus.unarchiveConversation({ conversationId: conversation.id })
        await reloadConversations()
        setActiveId(conversation.id)
      } catch (err) {
        notify.error({
          title: 'Could not restore conversation',
          description: err instanceof Error ? err.message : String(err)
        })
      }
    },
    [reloadConversations]
  )

  const handleConfirmDeleteConversation = useCallback(async () => {
    if (!deleteTarget) return
    if (pendingTurnLabelsByConversation[deleteTarget.id]) {
      notify.error({
        title: 'Conversation is running',
        description: 'Wait for Ordinus to finish before deleting this conversation.'
      })
      setDeleteTarget(null)
      return
    }
    setDialogBusy(true)
    try {
      await window.ordinus.ordinus.deleteConversation({ conversationId: deleteTarget.id })
      setConversations((prev) => prev.filter((conversation) => conversation.id !== deleteTarget.id))
      setMessagesByConversation((prev) => {
        const next = { ...prev }
        delete next[deleteTarget.id]
        return next
      })
      if (activeId === deleteTarget.id) {
        setActiveId(null)
      }
      setDeleteTarget(null)
    } catch (err) {
      notify.error({
        title: 'Could not delete conversation',
        description: err instanceof Error ? err.message : String(err)
      })
    } finally {
      setDialogBusy(false)
    }
  }, [activeId, deleteTarget, pendingTurnLabelsByConversation])

  // Note: no full-screen loading takeover. App.tsx blocks the whole route
  // tree on its first loadStatus, and inside the screen we let individual
  // surfaces (conversation list, empty state) render their own lightweight
  // loading text — matches the workflows/agents screens, which never paint
  // a screen-takeover loader of their own.

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-destructive">
        Could not load Ordinus: {loadError}
      </div>
    )
  }

  // Layout mirrors workflows-screen.tsx for visual consistency across the
  // app: outer flex row at viewport height minus nav, sidebar wrapper with
  // an animated width collapse, and a right-hand <section> card that holds
  // either the active transcript or the empty-state hero. The wrapper +
  // animation are kept even with zero conversations so the user can still
  // toggle the (empty) sidebar.
  return (
    <div className="flex h-[calc(100vh-3rem)] py-3">
      <div className="mr-3 flex min-h-0 shrink-0">
        <HomeConversationList
          conversations={conversations}
          activeId={activeId}
          busyConversationIds={busyConversationIds}
          defaultProviderId={defaultProviderId}
          onSelect={setActiveId}
          onNewConversation={handleNewConversation}
          onRenameConversation={openRenameDialog}
          onTogglePinConversation={handleTogglePinConversation}
          onArchiveConversation={handleArchiveConversation}
          onRestoreConversation={handleRestoreConversation}
          onDeleteConversation={setDeleteTarget}
          collapsed={!sidebarDocked}
          onToggleCollapsed={() => setSidebarDocked((value) => !value)}
          busy={false}
          loading={loading}
        />
      </div>

      <section className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md border bg-card">
        {/* ADR-029 §6 / M8 — Memory panel toggle. Lives in the section's
            top-right so it's always reachable without competing with the
            sidebar toggle on the left. */}
        <div className="absolute right-3 top-3 z-20 flex items-center gap-1.5">
          {/* ADR-029 §10 — unobtrusive re-open for the first-run welcome tour.
              Reachable in both empty and active states; does not reset the
              "seen" flag. */}
          <button
            type="button"
            title="Show welcome tour"
            aria-label="Show welcome tour"
            className="rounded-md border bg-card p-1.5 text-muted-foreground shadow-sm transition-opacity duration-200 hover:text-foreground"
            onClick={() => setWelcomeOpen(true)}
          >
            <HelpCircle className="size-4" />
          </button>
          <button
            type="button"
            title="Open Ordinus memory"
            aria-label="Open Ordinus memory"
            className="rounded-md border bg-card p-1.5 text-muted-foreground shadow-sm transition-opacity duration-200 hover:text-foreground"
            onClick={() => setMemoryOpen(true)}
          >
            <Brain className="size-4" />
          </button>
        </div>

        {!showWelcoming && activeConversation ? (
          <>
            {/* ADR-029 §8 / P4 — Ordinus's presence persists here, shrunk into a
                thin top strip whose mark animates while a turn is running. */}
            <HomeTopStrip
              title={activeConversation.title}
              busy={activeTurnBusy}
              onRename={() => openRenameDialog(activeConversation)}
            />
            {/* `min-h-0 overflow-hidden` lets the ScrollArea inside the
                transcript take over its own scroll without pushing the
                docked input out of the viewport. */}
            <div className="min-h-0 flex-1 overflow-hidden">
              <HomeTranscript
                messages={activeMessages}
                rememberedMessageIds={rememberedMessageIds}
                rememberingMessageId={rememberingMessageId}
                onRememberMessage={(messageId, text) => void handleRememberMessage(messageId, text)}
                onRevealFile={(messageId, path) => void handleRevealFile(messageId, path)}
                onOpenInspector={inspector.openLive}
                onInspectMessage={(turnId) => void inspector.openTurn(turnId)}
              />
            </div>
            {/* ADR-029 §7 — frozen conversations replace the input with a
                banner explaining why and offering a single forward action.
                The confirmation panel + input stack is suppressed because
                no new turns can be sent against this provider session. */}
            {activeArchived ? (
              <div className="border-t bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                This conversation is archived. Restore it from the Archived section to continue.
              </div>
            ) : activeFrozenReason ? (
              <HomeFrozenBanner
                providerId={activeConversation.providerId as ProviderId}
                reason={activeFrozenReason}
                onStartFresh={() => void handleStartFresh()}
                busy={activeStartFreshBusy}
              />
            ) : (
              <>
                {/* ADR-029 §9 — confirmation panel sits just above the input,
                    inside the same section card. One pending at a time (oldest
                    first); the user can defer by clicking elsewhere — it stays
                    pending without a timeout. */}
                <HomeConfirmationPanel
                  pending={pendingConfirmations[0] ?? null}
                  busy={confirmationBusy}
                  onResolve={handleResolveConfirmation}
                />
                {/* ADR-029 — needs_input questions surface here as a panel
                    (NOT inline in the transcript). Scoped to the active
                    conversation; rehydrated from the DB after a restart. */}
                <QuestionPanel
                  request={(() => {
                    const pending =
                      inputRequests.find((request) => request.conversationId === activeId) ?? null
                    return pending
                      ? {
                          requestId: pending.requestId,
                          title: pending.title,
                          detail: pending.detail,
                          questions: pending.questions
                        }
                      : null
                  })()}
                  busy={activeTurnBusy}
                  accentLabel="Ordinus needs a moment"
                  onAnswer={handleAnswerInputRequest}
                  onCancel={handleCancelInputRequest}
                />
                <HomeInput
                  onSend={handleSend}
                  busy={activeTurnBusy}
                  onStop={() => void handleStopTurn()}
                  stopping={activeStopping}
                />
              </>
            )}
          </>
        ) : (
          <HomeEmptyState onSend={handleSend} busy={activeTurnBusy} />
        )}

        {/* ADR-029 §10 — first-run welcome tour. Overlays the section card so
            it sits OVER the empty state (which stays mounted behind it and is
            revealed on dismiss). Mounted only while open so each open starts a
            fresh tour from step 1. */}
        {welcomeOpen ? <HomeWelcomePanel onDismiss={handleDismissWelcome} /> : null}
      </section>

      {/* ADR-036 — shared run inspector bottom sheet, here observing the
          active conversation's latest Ordinus turn. */}
      {inspector.open ? (
        <RunInspectorSheet
          observedRun={inspector.run}
          meta={{
            agentName: inspector.run?.assignedAgentName || 'Ordinus',
            agentRole: inspector.run?.assignedAgentRole ?? '',
            providerId: inspector.run?.providerId ?? activeConversation?.providerId ?? '',
            model: inspector.run?.model ?? '',
            sandbox: null,
            sessionRef: null,
            createdAt: inspector.run?.queuedAt ?? null,
            startedAt: inspector.run?.startedAt ?? null
          }}
          busy={inspector.live && activeTurnBusy}
          heading="Behind the scenes"
          subheading={
            activeConversation
              ? `How Ordinus ${inspector.live ? 'is working' : 'worked'} on “${activeConversation.title}”.`
              : 'How Ordinus approached this turn.'
          }
          openingLabel={THINKING_LABEL}
          onClose={inspector.close}
        />
      ) : null}

      {/* ADR-029 §6 / M8 — Memory panel. Rendered at the screen root (not
          inside the section) so the Dialog overlay covers the full Home
          surface, not just the right column. */}
      <Dialog open={Boolean(renameTarget)} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rename conversation</DialogTitle>
            <DialogDescription>Give this request a short name for the sidebar.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSubmitRename}>
            <Input
              value={renameTitle}
              onChange={(event) => setRenameTitle(event.target.value)}
              autoFocus
              maxLength={120}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRenameTarget(null)}
                disabled={dialogBusy}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={dialogBusy || !renameTitle.trim()}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete conversation permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the conversation and its visible message history from Ordinus.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={dialogBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={dialogBusy}
              onClick={(event) => {
                event.preventDefault()
                void handleConfirmDeleteConversation()
              }}
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <HomeMemoryPanel open={memoryOpen} onOpenChange={setMemoryOpen} />
    </div>
  )
}
