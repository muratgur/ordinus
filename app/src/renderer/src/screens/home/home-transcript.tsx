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

import { useEffect, useRef, useState } from 'react'
import { Loader2, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react'
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
      // Diverges from the original flat "> line": the user's own input reads as
      // a right-aligned compact card so it visibly separates from Ordinus's
      // replies (which stay as full-width Markdown blocks). Kept light — a soft
      // tint, not a heavy chat bubble — to respect ADR-029 §8's calm document feel.
      return (
        <div className="flex justify-end">
          <p className="max-w-[85%] select-text whitespace-pre-wrap break-words rounded-2xl bg-[#ff7a18]/10 px-3.5 py-2 text-sm text-foreground/90 [overflow-wrap:anywhere]">
            {message.text}
          </p>
        </div>
      )
    case 'assistant':
      return (
        <div className="flex flex-col gap-1">
          <MarkdownContent content={message.text} />
          {message.resultContent.trim() ? (
            <AssistantFullResponse content={message.resultContent} />
          ) : null}
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

// ADR-030 parity (mirrors conversations-screen TurnFullResponse): the summary is
// always shown above; the agent's full produced body is collapsed by default so
// the transcript stays calm, and expands on demand.
function AssistantFullResponse({ content }: { content: string }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-1 flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-fit items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        aria-expanded={open}
      >
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        {open ? 'Hide full result' : 'Show full result'}
      </button>
      {open ? (
        <div className="border-l-2 border-[#ff7a18]/20 pl-3">
          <MarkdownContent content={content} />
        </div>
      ) : null}
    </div>
  )
}
