import { createConversationTitleFromMessage } from './conversation-title'

const DEFAULT_ORDINUS_CONVERSATION_TITLE = 'New request'

export function getDefaultOrdinusConversationTitle(): string {
  return DEFAULT_ORDINUS_CONVERSATION_TITLE
}

export function createOrdinusConversationTitleFromMessage(message: string): string {
  return createConversationTitleFromMessage(message, DEFAULT_ORDINUS_CONVERSATION_TITLE)
}
