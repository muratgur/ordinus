// ADR-044 — Telegram inbound trigger subsystem.
//
// The first adapter of Ordinus's new inbound layer. It owns a single-owner
// Telegram bot: long-polls for messages, enforces the owner lock, handles
// pairing, and dispatches the owner's messages to the Ordinus assistant as a
// turn — replying with the assistant's answer, edited in place.
//
// Phase 2a — interactions render as inline buttons: needs_input questions
// (choice/boolean/text) drive an answer→resume loop, and destructive-tool
// confirmations (which block inside the MCP server) surface via the Ordinus
// event bus as Approve/Cancel buttons. A turn runs DETACHED from the poll loop
// so taps can be delivered while it waits.
//
// Phase 2b — `/agents` switches the active recipient between Ordinus (default)
// and any worker agent. A TurnDriver abstracts "run a turn + walk its
// needs_input loop" so the same interaction code drives Ordinus (awaitable
// session) and worker agents (the conversation engine, wrapped awaitable via
// the injected `agents` service).
//
// Phase 2c — a proposed Work Request plan (workboard_plan_ready) surfaces as a
// summary + Start/Desktop buttons (large plans are desktop-only).
// Phase 2d — messages that arrived while the app was closed are age-gated on
// boot ("you sent this a while ago, still want it?") instead of silently run.
//
// Phase 3 — long-run turns flip to a "I'll ping you when done" notification
// (the answer arrives as a fresh message); `/new` starts a clean Ordinus
// session; Telegram-originated turns carry a `source` marker the desktop shows
// as a "via Telegram" badge; and a menu-bar tray reflects the listening state.

import { randomInt } from 'node:crypto'
import {
  WorkboardDraftPlanSchema,
  type AgentTurnOutcome,
  type InteractionAnswer,
  type InteractionQuestion,
  type OrdinusActionEvent,
  type OrdinusConfirmationDecision,
  type OrdinusPendingConfirmation,
  type TelegramStatus,
  type WorkboardDraftPlan
} from '@shared/contracts'
import type { OrdinusDatabase } from '../db/database'
import type { OrdinusSessionService } from '../ordinus/session'
import { resolvePendingConfirmation } from '../ordinus/confirmation'
import {
  TelegramApi,
  TelegramApiError,
  displayName,
  type InlineKeyboard,
  type TelegramCallbackQuery,
  type TelegramMessage
} from './api'

const TELEGRAM_MAX = 4096
const POLL_TIMEOUT_SECONDS = 30
const RECONNECT_BACKOFF_MS = 5000
// ADR-044 Phase 2d: a message older than this when we process it was sent while
// we weren't listening (app closed). Ask before running it, rather than firing
// a stale intent. Fresh messages are processed within seconds, well under this.
const CATCHUP_THRESHOLD_SECONDS = 600
// ADR-044 Phase 3: if a turn's active processing exceeds this, tell the owner
// we'll ping them when it's done (and deliver the answer as a fresh message, so
// Telegram notifies) — they can put the phone down instead of watching a spinner.
const LONG_RUN_MS = 60_000

// ADR-044 Phase 2b: the worker-agent engine, wrapped into awaitable calls (the
// conversation engine is fire-and-forget at the IPC layer). Lets Telegram route
// to a specific agent's 1:1 room and get its answer — including needs_input.
export type TelegramAgentsService = {
  list(): Array<{ id: string; name: string; role: string }>
  roomConversationId(agentId: string): string
  sendRoomTurn(input: {
    agentId: string
    message: string
  }): Promise<{ conversationId: string; outcome: AgentTurnOutcome | null }>
  answerRoomInputRequest(input: {
    requestId: string
    answers: InteractionAnswer[]
    source?: string
  }): Promise<{ outcome: AgentTurnOutcome | null }>
  listPendingInputRequests(conversationId: string): Array<{
    requestId: string
    title: string
    detail: string
    questions: InteractionQuestion[]
  }>
  cancelInputRequest(conversationId: string, requestId: string): boolean
}

export type TelegramSubsystemDeps = {
  database: OrdinusDatabase
  ordinusSession: OrdinusSessionService
  agents: TelegramAgentsService
  // Token persistence is injected so the subsystem stays unaware of the vault
  // module (keeps it unit-testable with an in-memory fake).
  vault: {
    storeToken(token: string): void
    readToken(): string | null
    deleteToken(): void
  }
  // Push a status snapshot to the renderer. Called on every state transition.
  onStatus(status: TelegramStatus): void
  // Publish an Ordinus action event (same bus the desktop uses). Lets a
  // Telegram-driven cancel close the desktop's open question panel, so the two
  // surfaces never disagree.
  publishOrdinusEvent(event: OrdinusActionEvent): void
  // Subscribe to the Ordinus event bus. Confirmations block inside the MCP
  // server and only surface as `confirmation_requested` events — Telegram must
  // listen for them. Returns an unsubscribe function.
  onOrdinusEvent(listener: (event: OrdinusActionEvent) => void): () => void
  // ADR-044 Phase 2c: start a plan Ordinus proposed (workboard_plan_ready) when
  // the owner taps Start on Telegram — the same path the desktop review uses.
  startProposedPlan(input: { originalRequest: string; plan: WorkboardDraftPlan }): void
}

export type TelegramSubsystem = {
  getStatus(): TelegramStatus
  connect(token: string): Promise<TelegramStatus>
  disconnect(): Promise<void>
  /** Boot: resume listening if a token is already stored. */
  start(): Promise<void>
  /** Shutdown: stop the poll loop. */
  stop(): Promise<void>
}

export function createTelegramSubsystem(deps: TelegramSubsystemDeps): TelegramSubsystem {
  const { database, ordinusSession, vault, agents } = deps

  let api: TelegramApi | null = null
  let running = false
  let loopDone: Promise<void> | null = null
  let pollAbort: AbortController | null = null
  // In-memory: regenerated on each connect that needs pairing, never persisted.
  let pairingCode: string | null = null
  let lastError: string | null = null

  // A turn (and its interaction loop) runs DETACHED from the poll loop: if the
  // poll loop awaited a button tap, it could never fetch the callback_query
  // that carries it (deadlock). So at most one turn is in flight, tracked here;
  // the poll loop keeps reading updates and routes taps to `pendingInteraction`.
  let activeTurn = false
  // Whether the in-flight turn is an Ordinus turn (vs a worker agent). Only
  // Ordinus turns can produce confirmation/plan events, so worker turns must not
  // surface a concurrently-fired Ordinus confirmation/plan to the phone.
  let activeTurnIsOrdinus = false
  // The one outstanding question awaiting an answer, if any. `resolve` is fired
  // by a matching callback_query (button), the owner's next text message (for
  // text/custom answers), or a cross-surface resolve (desktop) which cancels
  // the wait. `requestId` ties it to its OrdinusInputRequest so a desktop
  // answer can preempt it.
  let pendingInteraction: {
    token: string
    requestId: string
    question: InteractionQuestion
    resolve: (answer: InteractionAnswer | null) => void
  } | null = null

  // Telegram messages currently showing destructive-tool confirmation buttons,
  // keyed by the Ordinus pendingId, so the confirmation_resolved event can edit
  // them when the decision lands (here or on desktop).
  const pendingConfirmations = new Map<string, { chatId: number; messageId: number }>()

  // Proposed plans (workboard_plan_ready) awaiting a Start/Desktop tap, keyed by
  // a short token embedded in the buttons' callback_data.
  const pendingPlans = new Map<string, { originalRequest: string; plan: WorkboardDraftPlan }>()

  // Catch-up prompts ("you sent this a while ago, still want it?") awaiting a
  // tap, keyed by a short token. Holds the original message so Yes can run it.
  const pendingCatchups = new Map<string, { chatId: number; text: string }>()

  // Confirmations and input-request lifecycle block/surface only via the event
  // bus — subscribe for the subsystem's whole lifetime.
  deps.onOrdinusEvent(handleOrdinusEvent)

  function buildStatus(): TelegramStatus {
    const state = database.getTelegramState()
    if (lastError) {
      return {
        status: 'error',
        botUsername: state?.botUsername ?? null,
        pairingCode: null,
        ownerName: state?.ownerName ?? null,
        error: lastError
      }
    }
    if (!state || !vault.readToken()) {
      return {
        status: 'disconnected',
        botUsername: null,
        pairingCode: null,
        ownerName: null,
        error: null
      }
    }
    if (!state.ownerUserId) {
      return {
        status: 'awaiting-pairing',
        botUsername: state.botUsername,
        pairingCode,
        ownerName: null,
        error: null
      }
    }
    return {
      status: 'connected',
      botUsername: state.botUsername,
      pairingCode: null,
      ownerName: state.ownerName,
      error: null
    }
  }

  function emit(): void {
    deps.onStatus(buildStatus())
  }

  function setError(message: string): void {
    lastError = message
    emit()
  }

  // --- Listening lifecycle -------------------------------------------------

  async function beginListening(token: string, catchUp: boolean): Promise<void> {
    api = new TelegramApi(token)
    running = true
    pollAbort = new AbortController()
    // On a fresh connect (interactive pairing), drain the backlog so old
    // messages never replay. On a paired boot resume, keep the backlog: the
    // poll loop processes it and handleMessage age-gates anything stale
    // ("you sent this a while ago, still want it?") — ADR-044 Phase 2d catch-up.
    if (!catchUp) await drainPending()
    loopDone = pollLoop()
  }

  async function drainPending(): Promise<void> {
    if (!api) return
    let offset = database.getTelegramState()?.lastUpdateOffset ?? 0
    for (;;) {
      const updates = await api.getUpdates(offset, 0, pollAbort?.signal)
      if (updates.length === 0) break
      offset = updates[updates.length - 1].update_id + 1
    }
    database.updateTelegramState({ lastUpdateOffset: offset })
  }

  async function pollLoop(): Promise<void> {
    while (running && api) {
      let updates
      try {
        const offset = database.getTelegramState()?.lastUpdateOffset ?? 0
        updates = await api.getUpdates(offset, POLL_TIMEOUT_SECONDS, pollAbort?.signal)
      } catch (err) {
        if (!running) break // aborted by stop()/disconnect()
        if (err instanceof TelegramApiError && err.errorCode === 401) {
          setError('Telegram token reddedildi. Yeniden bağlanın.')
          running = false
          break
        }
        // Transient (offline, 5xx). Back off and retry.
        await sleep(RECONNECT_BACKOFF_MS)
        continue
      }
      for (const update of updates) {
        database.updateTelegramState({ lastUpdateOffset: update.update_id + 1 })
        try {
          if (update.callback_query) {
            await handleCallback(update.callback_query)
          } else {
            const msg = update.message
            if (!msg || typeof msg.text !== 'string' || !msg.from || msg.from.is_bot) continue
            // handleMessage returns quickly: it either replies (pairing) or
            // kicks off a DETACHED turn. It never blocks the loop on user input.
            await handleMessage(msg)
          }
        } catch (err) {
          // A single bad update must never kill the listener.
          console.error('[telegram] update handling failed:', err)
        }
      }
    }
  }

  // --- Message routing -----------------------------------------------------

  async function handleMessage(msg: TelegramMessage): Promise<void> {
    if (!api || !msg.from) return
    const state = database.getTelegramState()
    if (!state) return
    const text = (msg.text ?? '').trim()

    // Not yet paired → the only thing we accept is the pairing code.
    if (!state.ownerUserId) {
      const match = /^\/pair\s+(\d{6})$/.exec(text)
      if (!match) {
        await api.sendMessage(
          msg.chat.id,
          'Eşleştirmek için: /pair <kod> (Ordinus’ta görünen 6 haneli kod).'
        )
        return
      }
      if (match[1] !== pairingCode) {
        await api.sendMessage(msg.chat.id, 'Kod hatalı. Ordinus’taki güncel kodu kullanın.')
        return
      }
      // Seal this user as the single owner.
      database.updateTelegramState({
        ownerUserId: String(msg.from.id),
        ownerName: displayName(msg.from),
        ownerChatId: String(msg.chat.id),
        pairedAt: new Date().toISOString()
      })
      pairingCode = null
      await api.sendMessage(
        msg.chat.id,
        `✅ Eşleştirildi. Merhaba ${displayName(msg.from)} — artık Ordinus’a buradan ulaşabilirsin.`
      )
      emit()
      return
    }

    // Paired → the owner lock. Anyone who is not the owner is ignored silently.
    if (String(msg.from.id) !== state.ownerUserId) return

    // Slash commands pre-empt a pending question: cancel it first so the
    // detached turn unwinds and activeTurn clears (otherwise the bot wedges).
    if (text === '/agents' || text === '/agent') {
      clearPendingInteraction()
      await sendAgentPicker(msg.chat.id)
      return
    }
    if (text === '/new') {
      clearPendingInteraction()
      // Fresh slate: a new Ordinus phone session, back to the default recipient.
      try {
        const created = ordinusSession.createConversation({ title: 'Telegram' })
        database.updateTelegramState({ ordinusConversationId: created.id, activeAgentId: null })
        await api.sendMessage(
          msg.chat.id,
          '🆕 Temiz bir sayfa — yeni bir Ordinus sohbeti başlattım.'
        )
      } catch (err) {
        await api.sendMessage(msg.chat.id, `⚠️ ${err instanceof Error ? err.message : String(err)}`)
      }
      return
    }

    // A question is awaiting a typed answer (a text question, or a custom
    // answer to a choice). The owner's message IS that answer.
    if (pendingInteraction) {
      const answer = textAnswerFor(pendingInteraction.question, text)
      if (!answer) {
        await api.sendMessage(msg.chat.id, 'Lütfen yukarıdaki butonlardan birini seç.')
        return
      }
      const resolve = pendingInteraction.resolve
      pendingInteraction = null
      resolve(answer)
      return
    }

    // Catch-up: a message sent while we weren't listening (app closed). Don't
    // fire a stale intent — ask first. Fresh messages clear this easily.
    if (Math.floor(Date.now() / 1000) - msg.date > CATCHUP_THRESHOLD_SECONDS) {
      await sendCatchupPrompt(msg.chat.id, text)
      return
    }

    startTurn(msg.chat.id, text)
  }

  // Build a driver for the active recipient and run a turn, detached so the poll
  // loop stays free to deliver button taps. One turn at a time.
  function startTurn(chatId: number, text: string): void {
    if (!api) return
    if (activeTurn) {
      void api.sendMessage(chatId, '⏳ Önceki işi bitireyim, sonra yazarım.')
      return
    }
    const activeAgentId = database.getTelegramState()?.activeAgentId ?? null
    let driver: TurnDriver
    try {
      driver = activeAgentId ? workerDriver(activeAgentId) : ordinusDriver()
    } catch (err) {
      void api.sendMessage(chatId, `⚠️ ${err instanceof Error ? err.message : String(err)}`)
      return
    }
    activeTurn = true
    activeTurnIsOrdinus = activeAgentId === null
    void runTurn(chatId, text, driver).finally(() => {
      activeTurn = false
    })
  }

  // Resolve any outstanding question as cancelled so its detached turn unwinds
  // (and activeTurn clears). Used before a command pre-empts a pending question.
  function clearPendingInteraction(): void {
    if (!pendingInteraction) return
    const resolve = pendingInteraction.resolve
    pendingInteraction = null
    resolve(null)
  }

  async function sendCatchupPrompt(chatId: number, text: string): Promise<void> {
    if (!api) return
    const token = `k${randomInt(0, 1_000_000)}`
    pendingCatchups.set(token, { chatId, text })
    const preview = text.length > 80 ? `${text.slice(0, 80)}…` : text
    await api.sendMessage(
      chatId,
      `⏳ Bunu bir süre önce yazmışsın:\n“${preview}”\nHâlâ ister misin?`,
      {
        inline_keyboard: [
          [
            { text: '✅ Evet, çalıştır', callback_data: `k:${token}:y` },
            { text: '✕ Boşver', callback_data: `k:${token}:n` }
          ]
        ]
      }
    )
  }

  // Edit the message a callback button was attached to (best-effort; no-op if
  // the callback carried no message reference or the client is gone).
  function editCallbackMessage(
    cb: TelegramCallbackQuery,
    body: string
  ): Promise<unknown> | undefined {
    return cb.message
      ? api?.editMessageText(cb.message.chat.id, cb.message.message_id, body)
      : undefined
  }

  async function handleCatchupCallback(cb: TelegramCallbackQuery, data: string): Promise<void> {
    if (!api) return
    await api.answerCallbackQuery(cb.id)
    const { id: token, action } = parseCallbackData(data)
    const entry = pendingCatchups.get(token)
    pendingCatchups.delete(token)
    if (action !== 'y' || !entry) {
      await editCallbackMessage(cb, '✕ Atlandı.')
      return
    }
    await editCallbackMessage(cb, '▶︎ Çalıştırılıyor…')
    startTurn(entry.chatId, entry.text)
  }

  // A TurnDriver abstracts "run a turn and walk its needs_input loop" so the
  // exact same Telegram interaction code drives both Ordinus (awaitable session)
  // and worker agents (the fire-and-forget conversation engine, wrapped awaitable
  // via the `agents` service). `null` outcome = the turn failed.
  type PendingQuestion = {
    requestId: string
    title: string
    detail: string
    questions: InteractionQuestion[]
  }
  type TurnDriver = {
    send(message: string): Promise<AgentTurnOutcome | null>
    pendingQuestion(): PendingQuestion | null
    answer(requestId: string, answers: InteractionAnswer[]): Promise<AgentTurnOutcome | null>
    cancel(requestId: string): boolean
    publishResolved(requestId: string): void
  }

  function ordinusDriver(): TurnDriver {
    const conversationId = ensureOrdinusConversation()
    return {
      send: (message) =>
        ordinusSession
          .sendTurn({ conversationId, message, source: 'telegram' })
          .then((result) => result.outcome),
      pendingQuestion: () => {
        const request = database
          .listPendingOrdinusInputRequests()
          .find((entry) => entry.conversationId === conversationId)
        return request
          ? {
              requestId: request.requestId,
              title: request.title,
              detail: request.detail,
              questions: request.questions
            }
          : null
      },
      answer: (requestId, answers) =>
        ordinusSession
          .answerInputRequest({ requestId, answers, source: 'telegram' })
          .then((result) => result.outcome),
      cancel: (requestId) => Boolean(database.cancelOrdinusInputRequest({ requestId })),
      publishResolved: (requestId) =>
        deps.publishOrdinusEvent({ kind: 'input_request_resolved', requestId })
    }
  }

  function workerDriver(agentId: string): TurnDriver {
    const conversationId = agents.roomConversationId(agentId)
    return {
      send: (message) => agents.sendRoomTurn({ agentId, message }).then((result) => result.outcome),
      pendingQuestion: () => agents.listPendingInputRequests(conversationId)[0] ?? null,
      answer: (requestId, answers) =>
        agents
          .answerRoomInputRequest({ requestId, answers, source: 'telegram' })
          .then((result) => result.outcome),
      cancel: (requestId) => agents.cancelInputRequest(conversationId, requestId),
      // Worker question panels on the desktop refetch on their own; no event needed.
      publishResolved: () => undefined
    }
  }

  async function runTurn(chatId: number, text: string, driver: TurnDriver): Promise<void> {
    // Capture the client: a disconnect mid-turn nulls the closure `api`, but the
    // detached turn keeps using this reference and best-effort edits never throw.
    const client = api
    if (!client) return
    const safeEdit = async (messageId: number, body: string): Promise<void> => {
      try {
        await client.editMessageText(chatId, messageId, truncate(body))
      } catch {
        // best-effort: the user disconnected, or Telegram rejected the edit.
      }
    }

    const placeholder = await client.sendMessage(chatId, '🔄 Çalışıyorum…')
    let longRun = false
    // Arm a one-shot timer around each ACTIVE-processing phase only (not while
    // we wait for the owner to answer a question — that's waiting on them). If
    // processing runs long, tell them we'll ping when done.
    const working = async <T>(fn: () => Promise<T>): Promise<T> => {
      const timer = setTimeout(() => {
        longRun = true
        void safeEdit(placeholder.message_id, '⏳ Uzun sürüyor — bittiğinde haber vereceğim.')
      }, LONG_RUN_MS)
      try {
        return await fn()
      } finally {
        clearTimeout(timer)
      }
    }
    // Deliver the final answer: in place for a quick turn, or as a fresh message
    // (a notification ping) when the turn ran long and the owner may have left.
    const deliverFinal = async (reply: string): Promise<void> => {
      if (longRun) {
        await safeEdit(placeholder.message_id, '✓ Tamamlandı.')
        try {
          await client.sendMessage(chatId, truncate(reply))
        } catch {
          // best-effort ping
        }
      } else {
        await safeEdit(placeholder.message_id, reply)
      }
    }
    try {
      let outcome = await working(() => driver.send(text))

      // Drive the needs_input → answer → resume loop entirely over Telegram.
      while (outcome && outcome.outcome === 'needs_input') {
        const pending = driver.pendingQuestion()
        // Resolved on another surface (e.g. desktop) between turns — stop here.
        if (!pending) {
          await safeEdit(placeholder.message_id, '↪︎ Masaüstünden devam edildi.')
          return
        }
        // Show the request's context (title + detail — where the actual
        // proposal/substance lives) before the questions; the per-question
        // labels alone often read as a bare "is this ok?".
        const preamble = [pending.title, pending.detail].map((s) => s.trim()).filter(Boolean)
        if (preamble.length > 0) {
          await safeEdit(placeholder.message_id, `❓ ${preamble.join('\n\n')}`)
        }
        const answers = await askQuestions(chatId, pending.requestId, pending.questions)
        if (!answers) {
          // If it was still pending, the owner tapped Vazgeç — cancel + (for
          // Ordinus) publish so the desktop panel closes. If already resolved,
          // another surface answered first; just acknowledge.
          if (driver.cancel(pending.requestId)) {
            driver.publishResolved(pending.requestId)
            await safeEdit(placeholder.message_id, '✕ İptal edildi.')
          } else {
            await safeEdit(placeholder.message_id, '↪︎ Masaüstünden devam edildi.')
          }
          return
        }
        outcome = await working(() => driver.answer(pending.requestId, answers))
      }

      // content-first on the phone (see ADR-044 — no "show full result" here).
      const reply = !outcome
        ? '⚠️ Bir hata oldu, yanıt alınamadı.'
        : outcome.outcome === 'final_response'
          ? outcome.content || outcome.summary || '(boş yanıt)'
          : '(yanıt yok)'
      await deliverFinal(reply)
    } catch (err) {
      await safeEdit(
        placeholder.message_id,
        `⚠️ ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  // --- Agent picker (ADR-044 Phase 2b) -------------------------------------

  async function sendAgentPicker(chatId: number): Promise<void> {
    if (!api) return
    const activeAgentId = database.getTelegramState()?.activeAgentId ?? null
    const tick = (selected: boolean): string => (selected ? ' ✓' : '')
    const rows: InlineKeyboard['inline_keyboard'] = [
      [{ text: `🅞 Ordinus${tick(activeAgentId === null)}`, callback_data: 'a:ordinus' }]
    ]
    for (const agent of agents.list()) {
      rows.push([
        { text: `${agent.name}${tick(activeAgentId === agent.id)}`, callback_data: `a:${agent.id}` }
      ])
    }
    await api.sendMessage(chatId, 'Kiminle konuşmak istersin?', { inline_keyboard: rows })
  }

  async function handleAgentPickCallback(cb: TelegramCallbackQuery, data: string): Promise<void> {
    if (!api) return
    await api.answerCallbackQuery(cb.id)
    const target = data.slice(2) // 'ordinus' or an agentId
    let label: string
    if (target === 'ordinus') {
      database.updateTelegramState({ activeAgentId: null })
      label = 'Ordinus'
    } else {
      database.updateTelegramState({ activeAgentId: target })
      label = agents.list().find((agent) => agent.id === target)?.name ?? 'Agent'
    }
    if (cb.message) {
      await api.editMessageText(
        cb.message.chat.id,
        cb.message.message_id,
        `🟢 Şu an ${label} ile konuşuyorsun.`
      )
    }
  }

  // --- Inline-button interactions (ADR-044 Phase 2) ------------------------

  async function askQuestions(
    chatId: number,
    requestId: string,
    questions: InteractionQuestion[]
  ): Promise<InteractionAnswer[] | null> {
    const answers: InteractionAnswer[] = []
    for (const question of questions) {
      const answer = await askOne(chatId, requestId, question)
      if (!answer) return null // Vazgeç, or preempted by a desktop answer
      answers.push(answer)
    }
    return answers
  }

  // Sends one question with its buttons and resolves when the owner taps a
  // button (or, for text/custom answers, sends a message). `null` = cancelled.
  function askOne(
    chatId: number,
    requestId: string,
    question: InteractionQuestion
  ): Promise<InteractionAnswer | null> {
    return new Promise((resolve) => {
      const token = `q${randomInt(0, 1_000_000)}`
      pendingInteraction = { token, requestId, question, resolve }
      const { text, keyboard } = renderQuestion(question, token)
      void api?.sendMessage(chatId, text, keyboard)
    })
  }

  async function handleCallback(cb: TelegramCallbackQuery): Promise<void> {
    if (!api) return
    const ownerUserId = database.getTelegramState()?.ownerUserId
    // Owner lock applies to taps too. Always ack so the spinner clears.
    if (!ownerUserId || String(cb.from.id) !== ownerUserId) {
      await api.answerCallbackQuery(cb.id)
      return
    }
    const data = cb.data ?? ''

    // Confirmation buttons carry `c:<pendingId>:<a|c>`.
    if (data.startsWith('c:')) {
      await handleConfirmationCallback(cb, data)
      return
    }

    // Agent picker buttons carry `a:<agentId|ordinus>`.
    if (data.startsWith('a:')) {
      await handleAgentPickCallback(cb, data)
      return
    }

    // Plan buttons carry `p:<token>:<s|d>`.
    if (data.startsWith('p:')) {
      await handlePlanCallback(cb, data)
      return
    }

    // Catch-up prompt buttons carry `k:<token>:<y|n>`.
    if (data.startsWith('k:')) {
      await handleCatchupCallback(cb, data)
      return
    }

    // Otherwise it's a question button `<token>:<value>`.
    if (!pendingInteraction) {
      await api.answerCallbackQuery(cb.id)
      return
    }
    const sep = data.indexOf(':')
    const token = sep === -1 ? data : data.slice(0, sep)
    const value = sep === -1 ? '' : data.slice(sep + 1)
    if (token !== pendingInteraction.token) {
      // A stale button from an earlier question. Ack and ignore.
      await api.answerCallbackQuery(cb.id)
      return
    }

    const question = pendingInteraction.question
    const resolve = pendingInteraction.resolve
    pendingInteraction = null
    await api.answerCallbackQuery(cb.id)

    const { answer, label } = decodeButton(question, value)
    // Edit the question message to show what was chosen and drop the buttons.
    if (cb.message) {
      await api.editMessageText(
        cb.message.chat.id,
        cb.message.message_id,
        `${question.label}\n→ ${label}`
      )
    }
    resolve(answer)
  }

  async function handleConfirmationCallback(
    cb: TelegramCallbackQuery,
    data: string
  ): Promise<void> {
    if (!api) return
    await api.answerCallbackQuery(cb.id)
    // `c:<pendingId>:<a|c>`
    const { id: pendingId, action } = parseCallbackData(data)
    const decision: OrdinusConfirmationDecision = action === 'a' ? 'approved' : 'cancelled'
    const resolved = resolvePendingConfirmation(pendingId, decision)
    if (resolved) {
      // Unblocks the turn inside the MCP server. Publish so the desktop panel
      // closes too; our own confirmation_resolved listener edits the message.
      deps.publishOrdinusEvent({ kind: 'confirmation_resolved', pendingId, decision })
    } else {
      // Already resolved on another surface — just clear the buttons.
      const entry = pendingConfirmations.get(pendingId)
      pendingConfirmations.delete(pendingId)
      if (entry) await api.editMessageText(entry.chatId, entry.messageId, '↪︎ Zaten yanıtlandı.')
    }
  }

  // --- Ordinus event bus (ADR-044 Phase 2) ---------------------------------
  // Confirmations block inside the MCP server and never come back through
  // sendTurn — they only surface here. Input-request resolutions let us cancel
  // a Telegram question the owner answered on desktop instead.

  function handleOrdinusEvent(event: OrdinusActionEvent): void {
    if (event.kind === 'confirmation_requested') {
      void onConfirmationRequested(event.pending)
    } else if (event.kind === 'confirmation_resolved') {
      void onConfirmationResolved(event.pendingId)
    } else if (event.kind === 'input_request_resolved') {
      onInputRequestResolved(event.requestId)
    } else if (event.kind === 'workboard_plan_ready') {
      void onPlanReady(event.request, event.plan)
    }
  }

  // ADR-044 Phase 2c: Ordinus proposed a Work Request plan during a Telegram
  // turn. Surface a summary + Start/Desktop buttons. A large plan (the desktop's
  // forced-review threshold) is desktop-only — never blind-started from a phone.
  async function onPlanReady(originalRequest: string, rawPlan: unknown): Promise<void> {
    // Only during an Ordinus-routed Telegram turn — a worker turn's activeTurn
    // must not catch a plan from a concurrent desktop Ordinus turn.
    if (!activeTurn || !activeTurnIsOrdinus || !api) return
    const chatId = ownerChatId()
    if (chatId === null) return
    const parsed = WorkboardDraftPlanSchema.safeParse(rawPlan)
    if (!parsed.success) {
      // Shouldn't happen (the planner returns a validated plan), but never fail
      // silently — surface a desktop fallback and log for diagnosis.
      console.error('[telegram] plan parse failed:', parsed.error.message)
      await api.sendMessage(
        chatId,
        '📋 Bir plan hazırlandı — masaüstünden inceleyip başlatabilirsin.'
      )
      return
    }
    const plan = parsed.data
    const token = `pl${randomInt(0, 1_000_000)}`
    const tooLarge = plan.items.length > 8
    if (!tooLarge) pendingPlans.set(token, { originalRequest, plan })
    const { text, keyboard } = renderPlan(plan, token, tooLarge)
    await api.sendMessage(chatId, text, keyboard)
  }

  async function handlePlanCallback(cb: TelegramCallbackQuery, data: string): Promise<void> {
    if (!api) return
    await api.answerCallbackQuery(cb.id)
    // `p:<token>:<s|d>`
    const { id: token, action } = parseCallbackData(data)
    const entry = pendingPlans.get(token)
    if (action !== 's') {
      await editCallbackMessage(cb, '💻 Masaüstünde inceleyebilirsin.')
      return
    }
    if (!entry) {
      await editCallbackMessage(cb, 'Bu plan artık geçerli değil.')
      return
    }
    pendingPlans.delete(token)
    try {
      deps.startProposedPlan(entry)
      await editCallbackMessage(cb, `✅ Başlatıldı: ${entry.plan.title}`)
    } catch (err) {
      await editCallbackMessage(cb, `⚠️ ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async function onConfirmationRequested(pending: OrdinusPendingConfirmation): Promise<void> {
    // Only surface during an Ordinus-routed Telegram turn — a worker turn can't
    // produce Ordinus confirmations, so one arriving then belongs to a
    // concurrent desktop turn. (The payload carries no conversationId, so a
    // concurrent desktop *Ordinus* turn can still mis-attribute — accepted.)
    if (!activeTurn || !activeTurnIsOrdinus || !api) return
    const chatId = ownerChatId()
    if (chatId === null) return
    const { text, keyboard } = renderConfirmation(pending)
    const msg = await api.sendMessage(chatId, text, keyboard)
    pendingConfirmations.set(pending.pendingId, { chatId, messageId: msg.message_id })
  }

  async function onConfirmationResolved(pendingId: string): Promise<void> {
    const entry = pendingConfirmations.get(pendingId)
    if (!entry) return
    pendingConfirmations.delete(pendingId)
    await api?.editMessageText(entry.chatId, entry.messageId, '✓ Yanıtlandı.')
  }

  function onInputRequestResolved(requestId: string): void {
    // A question the owner is being asked on Telegram was just resolved
    // elsewhere (desktop). Stop waiting; runTurn sees the request is no longer
    // pending and reports "continued on desktop".
    if (pendingInteraction?.requestId === requestId) {
      const resolve = pendingInteraction.resolve
      pendingInteraction = null
      resolve(null)
    }
  }

  function ownerChatId(): number | null {
    const raw = database.getTelegramState()?.ownerChatId
    if (!raw) return null
    const id = Number(raw)
    return Number.isFinite(id) ? id : null
  }

  // --- Public API ----------------------------------------------------------

  // The dedicated single phone-session Ordinus conversation (ADR-044). Find
  // the persisted one if it still exists, else create and persist a fresh one.
  function ensureOrdinusConversation(): string {
    const state = database.getTelegramState()
    const existingId = state?.ordinusConversationId ?? null
    if (existingId && ordinusSession.listConversations().some((c) => c.id === existingId)) {
      return existingId
    }
    const created = ordinusSession.createConversation({ title: 'Telegram' })
    database.updateTelegramState({ ordinusConversationId: created.id })
    return created.id
  }

  // --- Public API ----------------------------------------------------------

  async function stopListening(): Promise<void> {
    running = false
    pollAbort?.abort()
    if (loopDone) {
      await loopDone.catch(() => undefined)
    }
    loopDone = null
    pollAbort = null
    api = null
    // Free any detached turn that was waiting on a button tap so it unwinds and
    // clears activeTurn (otherwise a reconnect would think a turn is in flight).
    if (pendingInteraction) {
      const resolve = pendingInteraction.resolve
      pendingInteraction = null
      resolve(null)
    }
    pendingConfirmations.clear()
    pendingPlans.clear()
    pendingCatchups.clear()
  }

  return {
    getStatus() {
      return buildStatus()
    },

    async connect(token) {
      // Validate the token before storing anything — a bad token must not
      // leave a half-connected state behind.
      lastError = null
      const probe = new TelegramApi(token)
      let me
      try {
        me = await probe.getMe()
      } catch (err) {
        if (err instanceof TelegramApiError && err.errorCode === 401) {
          setError('Token geçersiz. BotFather’dan aldığın token’ı kontrol et.')
        } else {
          setError(err instanceof Error ? err.message : String(err))
        }
        return buildStatus()
      }

      await stopListening()
      vault.storeToken(token)
      const prior = database.getTelegramState()
      database.updateTelegramState({ botUsername: me.username ?? null })

      // Reconnect with an already-sealed owner → straight to listening.
      // Fresh connect (or owner never sealed) → generate a pairing code.
      if (!prior?.ownerUserId) {
        pairingCode = String(randomInt(100000, 1000000))
      }
      // Interactive connect: drain the backlog (no catch-up).
      await beginListening(token, false)
      emit()
      return buildStatus()
    },

    async disconnect() {
      await stopListening()
      vault.deleteToken()
      database.clearTelegramState()
      pairingCode = null
      lastError = null
      emit()
    },

    async start() {
      const token = vault.readToken()
      if (!token) return
      lastError = null
      // If a token exists but the owner was never sealed, we still need a
      // fresh pairing code to display.
      const paired = Boolean(database.getTelegramState()?.ownerUserId)
      if (!paired) {
        pairingCode = String(randomInt(100000, 1000000))
      }
      // Boot resume: if already paired, catch up on messages that arrived while
      // the app was closed (age-gated). If never paired, drain (pairing is
      // interactive — old messages are irrelevant).
      await beginListening(token, paired)
      emit()
    },

    async stop() {
      await stopListening()
    }
  }
}

function truncate(text: string): string {
  if (text.length <= TELEGRAM_MAX) return text
  return text.slice(0, TELEGRAM_MAX - 1) + '…'
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const CANCEL_VALUE = 'x'

// Decode a `<prefix>:<id>:<action>` callback_data string. The 2-char prefix
// (e.g. `c:`/`p:`/`k:`) is dropped; the id may itself contain no further ':'
// constraint beyond the trailing action, so we split on the LAST ':'.
function parseCallbackData(data: string): { id: string; action: string } {
  const lastSep = data.lastIndexOf(':')
  return { id: data.slice(2, lastSep), action: data.slice(lastSep + 1) }
}

// Render a proposed plan as a text summary + Start/Desktop buttons. A large
// plan is desktop-only. callback_data is `p:<token>:<s|d>`.
function renderPlan(
  plan: WorkboardDraftPlan,
  token: string,
  tooLarge: boolean
): { text: string; keyboard: InlineKeyboard } {
  const lines = [`📋 ${plan.title}`]
  if (plan.summary) lines.push(plan.summary)
  lines.push(`\n${plan.items.length} adım:`)
  plan.items.slice(0, 8).forEach((item, index) => lines.push(`${index + 1}. ${item.title}`))
  if (plan.items.length > 8) lines.push('…')
  if (tooLarge) {
    lines.push('\nBu plan büyük — başlatmadan önce masaüstünden incele.')
    return {
      text: lines.join('\n'),
      keyboard: {
        inline_keyboard: [[{ text: '💻 Masaüstünde incele', callback_data: `p:${token}:d` }]]
      }
    }
  }
  return {
    text: lines.join('\n'),
    keyboard: {
      inline_keyboard: [
        [
          { text: '✅ Başlat', callback_data: `p:${token}:s` },
          { text: '💻 Masaüstü', callback_data: `p:${token}:d` }
        ]
      ]
    }
  }
}

// Render a destructive-tool confirmation as Telegram text + Approve/Cancel
// buttons. callback_data is `c:<pendingId>:<a|c>` (well under the 64-byte cap).
function renderConfirmation(pending: OrdinusPendingConfirmation): {
  text: string
  keyboard: InlineKeyboard
} {
  const lines = [`⚠️ ${pending.toolLabel} — onayın gerekiyor`]
  lines.push(
    pending.reversibility === 'irreversible'
      ? 'Bu işlem geri alınamaz.'
      : pending.reversibility === 'soft-delete'
        ? 'Geri alınabilir — sonra geri yükleyebilirsin.'
        : 'Geri alınabilir.'
  )
  if (pending.affectedRecords.length > 0) {
    lines.push('')
    for (const record of pending.affectedRecords) {
      lines.push(`• ${record.label}${record.status ? ` (${record.status})` : ''}`)
    }
  }
  if (pending.why) lines.push(`\n${pending.why}`)
  const approveLabel = pending.reversibility === 'irreversible' ? '✅ Evet, sil' : '✅ Onayla'
  return {
    text: lines.join('\n'),
    keyboard: {
      inline_keyboard: [
        [
          { text: approveLabel, callback_data: `c:${pending.pendingId}:a` },
          { text: '❌ İptal', callback_data: `c:${pending.pendingId}:c` }
        ]
      ]
    }
  }
}

// Render an Ordinus question as Telegram text + an inline keyboard. Buttons
// carry `${token}:${value}` callback data (kept short — Bot API caps it at 64
// bytes): a choice option's index, 'y'/'n' for boolean, or 'x' for cancel.
function renderQuestion(
  question: InteractionQuestion,
  token: string
): { text: string; keyboard: InlineKeyboard } {
  const lines = [`❓ ${question.label}`]
  if (question.detail) lines.push(question.detail)
  const rows: InlineKeyboard['inline_keyboard'] = []

  if (question.kind === 'choice') {
    question.options.forEach((option, index) => {
      const star = option.id === question.recommendedOptionId ? ' ⭐' : ''
      rows.push([{ text: `${option.label}${star}`, callback_data: `${token}:${index}` }])
    })
    if (question.allowCustom) lines.push('\nveya cevabını yazabilirsin.')
  } else if (question.kind === 'boolean') {
    rows.push([
      { text: 'Evet', callback_data: `${token}:y` },
      { text: 'Hayır', callback_data: `${token}:n` }
    ])
  } else {
    // text question — the answer is the owner's next message.
    if (question.placeholder) lines.push(`\n(${question.placeholder})`)
  }

  rows.push([{ text: '✕ Vazgeç', callback_data: `${token}:${CANCEL_VALUE}` }])
  return { text: lines.join('\n'), keyboard: { inline_keyboard: rows } }
}

// Turn a tapped button's value back into an InteractionAnswer (null = cancel).
function decodeButton(
  question: InteractionQuestion,
  value: string
): { answer: InteractionAnswer | null; label: string } {
  if (value === CANCEL_VALUE) return { answer: null, label: 'İptal' }
  if (question.kind === 'choice') {
    const option = question.options[Number(value)]
    if (!option) return { answer: null, label: 'İptal' }
    return {
      answer: { questionId: question.id, type: 'option', optionId: option.id },
      label: option.label
    }
  }
  if (question.kind === 'boolean') {
    const bool = value === 'y'
    return {
      answer: { questionId: question.id, type: 'boolean', value: bool },
      label: bool ? 'Evet' : 'Hayır'
    }
  }
  // text question never produces a non-cancel button.
  return { answer: null, label: 'İptal' }
}

// When the owner types instead of tapping: a text question takes the message
// verbatim; a choice that allows custom answers takes it as a custom answer;
// otherwise we have nothing to do with free text.
function textAnswerFor(question: InteractionQuestion, text: string): InteractionAnswer | null {
  if (!text) return null
  if (question.kind === 'text') return { questionId: question.id, type: 'text', text }
  if (question.kind === 'choice' && question.allowCustom) {
    return { questionId: question.id, type: 'custom', text }
  }
  return null
}
