// ADR-057: worker-agent chats derive a conversation title (and, through it, the
// working-folder name) from the first message — the same deterministic rule the
// Ordinus assistant uses (ADR-049 era). Extracted here so both surfaces share one
// implementation. No AI generation: strip code/slash-commands, take the first
// sentence, cap length, fall back to a generic default when the message is empty.

const DEFAULT_CONVERSATION_TITLE = 'New chat'
const MAX_CONVERSATION_TITLE_LENGTH = 56

export function createConversationTitleFromMessage(
  message: string,
  fallback: string = DEFAULT_CONVERSATION_TITLE
): string {
  const cleaned = message
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\/[a-z][a-z0-9-]*(?:\s+|$)/i, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!cleaned) return fallback

  const firstSentence = cleaned.split(/[.!?\n]/)[0]?.trim() || cleaned
  const withoutTrailingPunctuation = firstSentence.replace(/[:;,.\s]+$/g, '').trim()
  const base = withoutTrailingPunctuation || cleaned

  if (base.length <= MAX_CONVERSATION_TITLE_LENGTH) {
    return base
  }

  const hardLimit = base.slice(0, MAX_CONVERSATION_TITLE_LENGTH)
  const wordBoundary = hardLimit.lastIndexOf(' ')
  const truncated = wordBoundary >= 24 ? hardLimit.slice(0, wordBoundary).trim() : hardLimit.trim()

  return `${truncated.replace(/[:;,.\s]+$/g, '')}...`
}
