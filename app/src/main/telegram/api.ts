// ADR-044 — Telegram Bot API client.
//
// A thin typed wrapper over the four HTTPS methods the inbound subsystem needs.
// No dependencies: Node's built-in fetch is all the Bot API requires (the
// Phase 0 PoC validated this). This is NOT an MCP server and NOT a connector —
// just the transport the trigger-source subsystem speaks.

export type TelegramUser = {
  id: number
  is_bot: boolean
  first_name: string
  last_name?: string
  username?: string
}

export type TelegramChat = {
  id: number
  type: string
}

export type TelegramMessage = {
  message_id: number
  from?: TelegramUser
  chat: TelegramChat
  text?: string
  // Unix time (seconds) the message was sent. Used for catch-up age-gating.
  date: number
}

// ADR-044 Phase 2 — inline keyboards turn Ordinus's choice/boolean/confirmation
// panels into tappable buttons. `callback_data` is our own opaque token (≤64
// bytes, Bot API limit) that we parse back on the callback_query.
export type InlineButton = { text: string; callback_data: string }
export type InlineKeyboard = { inline_keyboard: InlineButton[][] }

export type TelegramCallbackQuery = {
  id: string
  from: TelegramUser
  message?: TelegramMessage
  data?: string
}

export type TelegramUpdate = {
  update_id: number
  message?: TelegramMessage
  callback_query?: TelegramCallbackQuery
}

export class TelegramApiError extends Error {
  // Telegram's numeric error_code (e.g. 401 for a bad token). Lets callers
  // distinguish "token rejected" (terminal) from transient network errors.
  readonly errorCode: number | null
  constructor(method: string, description: string, errorCode: number | null) {
    super(`Telegram ${method} failed: ${description}`)
    this.name = 'TelegramApiError'
    this.errorCode = errorCode
  }
}

export function displayName(user: TelegramUser): string {
  return [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || 'Unknown'
}

export class TelegramApi {
  private readonly base: string
  constructor(token: string) {
    this.base = `https://api.telegram.org/bot${token}`
  }

  private async call<T>(method: string, body: unknown, signal?: AbortSignal): Promise<T> {
    const res = await fetch(`${this.base}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {}),
      signal
    })
    const json = (await res.json()) as {
      ok: boolean
      result?: T
      description?: string
      error_code?: number
    }
    if (!json.ok) {
      throw new TelegramApiError(
        method,
        json.description ?? 'unknown error',
        json.error_code ?? null
      )
    }
    return json.result as T
  }

  // Validates the token and returns the bot's identity. Throws
  // TelegramApiError with errorCode 401 on a bad token.
  getMe(): Promise<TelegramUser> {
    return this.call<TelegramUser>('getMe', {})
  }

  // Long-poll. Blocks up to `timeout` seconds until an update arrives. `offset`
  // acks everything <= offset-1 so updates are never reprocessed. The signal
  // lets us abort a blocking poll promptly on disconnect/shutdown.
  getUpdates(offset: number, timeout: number, signal?: AbortSignal): Promise<TelegramUpdate[]> {
    return this.call<TelegramUpdate[]>('getUpdates', { offset, timeout }, signal)
  }

  sendMessage(
    chatId: number,
    text: string,
    replyMarkup?: InlineKeyboard
  ): Promise<TelegramMessage> {
    return this.call<TelegramMessage>('sendMessage', {
      chat_id: chatId,
      text,
      reply_markup: replyMarkup
    })
  }

  editMessageText(
    chatId: number,
    messageId: number,
    text: string,
    replyMarkup?: InlineKeyboard
  ): Promise<unknown> {
    return this.call('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      // Passing reply_markup omitted (undefined) leaves existing buttons; pass
      // an empty keyboard to clear them after a choice is made.
      reply_markup: replyMarkup ?? { inline_keyboard: [] }
    })
  }

  // Acks a button tap so Telegram stops the button's loading spinner. Optional
  // text shows a brief toast on the user's screen.
  answerCallbackQuery(callbackQueryId: string, text?: string): Promise<unknown> {
    return this.call('answerCallbackQuery', { callback_query_id: callbackQueryId, text })
  }
}
