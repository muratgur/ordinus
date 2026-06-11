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
import { Loader2, AlertCircle, Bookmark, Check, ChevronDown, ChevronRight } from 'lucide-react'
import { MarkdownContent } from '@renderer/components/markdown-content'
import { FilesTouched } from '@renderer/components/files-touched'
import type { HomeMessage } from './types'

export type HomeTranscriptProps = {
  messages: HomeMessage[]
  // Remember affordance (agent-room parity): hover bookmark on user messages
  // that saves the message into Ordinus's memory. All optional so read-only
  // usages render without the affordance.
  rememberedMessageIds?: ReadonlySet<string>
  rememberingMessageId?: string
  onRememberMessage?: (messageId: string, text: string) => void
  // ADR-035: reveal a file referenced by an assistant message (messageId is
  // the persisted turn row id the main process validates against).
  onRevealFile?: (messageId: string, relativePath: string) => void
}

export function HomeTranscript({
  messages,
  rememberedMessageIds,
  rememberingMessageId,
  onRememberMessage,
  onRevealFile
}: HomeTranscriptProps): React.JSX.Element {
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
          <TranscriptItem
            key={message.id}
            message={message}
            remembered={rememberedMessageIds?.has(message.id) ?? false}
            remembering={rememberingMessageId === message.id}
            onRemember={
              onRememberMessage && message.kind === 'user'
                ? () => onRememberMessage(message.id, message.text)
                : undefined
            }
            onRevealFile={onRevealFile ? (path) => onRevealFile(message.id, path) : undefined}
          />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

function TranscriptItem({
  message,
  remembered,
  remembering,
  onRemember,
  onRevealFile
}: {
  message: HomeMessage
  remembered: boolean
  remembering: boolean
  onRemember?: () => void
  onRevealFile?: (relativePath: string) => void
}): React.JSX.Element {
  switch (message.kind) {
    case 'user':
      // Diverges from the original flat "> line": the user's own input reads as
      // a right-aligned compact card so it visibly separates from Ordinus's
      // replies (which stay as full-width Markdown blocks). Kept light — a soft
      // tint, not a heavy chat bubble — to respect ADR-029 §8's calm document feel.
      // The hover bookmark mirrors the agent room's "Remember this" affordance,
      // saving into Ordinus's own memory.
      return (
        <div className="group flex items-center justify-end gap-1.5">
          {onRemember && !remembered ? (
            <button
              type="button"
              aria-label="Remember this"
              title="Remember this"
              disabled={remembering}
              onClick={onRemember}
              className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-50"
            >
              {remembering ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Bookmark className="size-3.5" />
              )}
            </button>
          ) : null}
          {remembered ? (
            <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
              <Check className="size-3" /> Added to memory
            </span>
          ) : null}
          <p className="max-w-[85%] select-text whitespace-pre-wrap break-words rounded-2xl bg-primary/10 px-3.5 py-2 text-sm text-foreground/90 [overflow-wrap:anywhere]">
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
          {onRevealFile ? (
            <FilesTouched
              artifactRefs={message.artifactRefs}
              changedFiles={message.changedFiles}
              onReveal={onRevealFile}
            />
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
    case 'cancelled':
      // ADR-034: permanent, deliberately quiet — explains a truncated reply
      // without the alarm of an error block.
      return <div className="text-xs italic text-muted-foreground">You stopped this response.</div>
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
        <div className="border-l-2 border-primary/20 pl-3">
          <MarkdownContent content={content} />
        </div>
      ) : null}
    </div>
  )
}
