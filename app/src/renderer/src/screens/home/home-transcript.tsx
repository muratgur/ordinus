// ADR-029 §8 — Linear, non-bubble transcript for the Ordinus surface.
//
// Intentionally diverges from the bubble UI used by Agents and Conversations.
// The bubble metaphor implies two equal speakers; Ordinus is doing work —
// tool calls, side-effects, status indicators — that fits a flat document /
// terminal hybrid better. See ADR §8 for the full design rationale.
//
// Layout rules:
//   - User messages render as a single prefixed line. No background, no avatar.
//   - Assistant replies render as a Markdown block. The whole transcript is
//     readable as one continuous document.
//   - Status entries (transient "Ordinus is thinking…") render as a muted line
//     with a pulsing dot. They get replaced when the turn completes.
//   - Errors render inline as a destructive-tone block.
//   - Tool blocks (M5/M6) will go here later as first-class collapsible
//     items; M4 only renders user/assistant/status/error.

import { useEffect, useRef } from 'react'
import { Loader2, AlertCircle } from 'lucide-react'
import { MarkdownContent } from '@renderer/components/markdown-content'
import type { HomeMessage } from './types'

export type HomeTranscriptProps = {
  messages: HomeMessage[]
}

export function HomeTranscript({ messages }: HomeTranscriptProps): React.JSX.Element {
  // Anchor at the bottom every time messages change. We track our own scroll
  // container ref instead of using the shadcn ScrollArea — radix's
  // scrollIntoView interplay was fighting the parent flex sizing in early
  // tests. The plain `overflow-y-auto` + `ordinus-scrollbar` matches what
  // the rest of the app uses (workflows-screen sidebar, etc.).
  const bottomRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  return (
    <div className="ordinus-scrollbar h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-6 py-8">
        {messages.map((message) => (
          <TranscriptItem key={message.id} message={message} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

function TranscriptItem({ message }: { message: HomeMessage }): React.JSX.Element {
  switch (message.kind) {
    case 'user':
      return (
        <div className="flex gap-3 text-sm">
          <span className="select-none pt-0.5 font-mono text-muted-foreground">{'>'}</span>
          <p className="flex-1 whitespace-pre-wrap text-foreground/90">{message.text}</p>
        </div>
      )
    case 'assistant':
      return (
        <div className="flex flex-col gap-1">
          <MarkdownContent content={message.text} />
        </div>
      )
    case 'status':
      return (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>{message.label}</span>
        </div>
      )
    case 'error':
      return (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="whitespace-pre-wrap">{message.message}</p>
        </div>
      )
  }
}
