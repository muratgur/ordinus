// ADR-044 — provenance badge for a message that originated outside the desktop
// (today: Telegram). Shared by the Ordinus home transcript and agent rooms so a
// future second inbound source is added in one place.

import { Send } from 'lucide-react'

export function MessageSourceBadge({
  source
}: {
  source: string | null
}): React.JSX.Element | null {
  if (source !== 'telegram') {
    return null
  }
  return (
    <span className="flex items-center gap-1 pr-1 text-[10px] text-muted-foreground">
      <Send className="size-2.5" /> via Telegram
    </span>
  )
}
