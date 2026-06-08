const DEFAULT_ORDINUS_CONVERSATION_TITLE = 'New request'
const MAX_ORDINUS_CONVERSATION_TITLE_LENGTH = 56

export function getDefaultOrdinusConversationTitle(): string {
  return DEFAULT_ORDINUS_CONVERSATION_TITLE
}

export function createOrdinusConversationTitleFromMessage(message: string): string {
  const cleaned = message
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\/[a-z][a-z0-9-]*(?:\s+|$)/i, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!cleaned) return DEFAULT_ORDINUS_CONVERSATION_TITLE

  const firstSentence = cleaned.split(/[.!?\n]/)[0]?.trim() || cleaned
  const withoutTrailingPunctuation = firstSentence.replace(/[:;,.\s]+$/g, '').trim()
  const base = withoutTrailingPunctuation || cleaned

  if (base.length <= MAX_ORDINUS_CONVERSATION_TITLE_LENGTH) {
    return base
  }

  const hardLimit = base.slice(0, MAX_ORDINUS_CONVERSATION_TITLE_LENGTH)
  const wordBoundary = hardLimit.lastIndexOf(' ')
  const truncated = wordBoundary >= 24 ? hardLimit.slice(0, wordBoundary).trim() : hardLimit.trim()

  return `${truncated.replace(/[:;,.\s]+$/g, '')}...`
}
