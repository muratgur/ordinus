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
import { Loader2, AlertCircle, Bookmark, Check, ChevronRight } from 'lucide-react'
import { CopyButton } from '@renderer/components/copy-button'
import { MarkdownContent } from '@renderer/components/markdown-content'
import { FilesTouched } from '@renderer/components/files-touched'
import { InspectGutterButton, LiveStatusRow } from '@renderer/components/run-inspector-sheet'
import { cn } from '@renderer/lib/utils'
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
  // ADR-036: clicking the live status row opens the run inspector sheet for
  // the in-flight turn; hovering a finished assistant message reveals a
  // terminal icon that opens the inspector for that turn (by its runtime
  // turn id — see HomeMessage.turnId).
  onOpenInspector?: () => void
  onInspectMessage?: (turnId: string) => void
}

// The inspect affordance exists only for assistant messages that carry a
// runtime turn id (rows persisted before turn ids were recorded have none).
function getInspectHandler(
  message: HomeMessage,
  onInspectMessage?: (turnId: string) => void
): (() => void) | undefined {
  if (!onInspectMessage || message.kind !== 'assistant' || !message.turnId) return undefined
  const { turnId } = message
  return () => onInspectMessage(turnId)
}

export function HomeTranscript({
  messages,
  rememberedMessageIds,
  rememberingMessageId,
  onRememberMessage,
  onRevealFile,
  onOpenInspector,
  onInspectMessage
}: HomeTranscriptProps): React.JSX.Element {
  // Anchor at the bottom every time messages change. We track our own scroll
  // container ref instead of using the shadcn ScrollArea — radix's
  // scrollIntoView interplay was fighting the parent flex sizing in early
  // tests. The plain `overflow-y-auto` + `ordinus-scrollbar` matches what
  // the rest of the app uses (workflows-screen sidebar, etc.).
  //
  // Smooth scrolling is ONLY for messages appended within the same thread.
  // Opening a (different) conversation jumps straight to the bottom — a
  // smooth scroll there animates through the entire history, which reads as
  // a glitch on long transcripts. Thread identity is tracked by the first
  // message id (stable within a thread, different across threads).
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const threadKeyRef = useRef<string | null>(null)
  useEffect(() => {
    const threadKey = messages[0]?.id ?? null
    const sameThread = threadKeyRef.current === threadKey && threadKey !== null
    threadKeyRef.current = threadKey
    bottomRef.current?.scrollIntoView({ behavior: sameThread ? 'smooth' : 'auto', block: 'end' })
  }, [messages])

  return (
    <div className="ordinus-scrollbar h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-6 py-8">
        {messages.map((message) => (
          // Polish pass: each entry settles in with a short fade-up on mount,
          // so new turns land softly instead of popping.
          <div
            key={message.id}
            className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-300"
          >
            <TranscriptItem
              message={message}
              remembered={rememberedMessageIds?.has(message.id) ?? false}
              remembering={rememberingMessageId === message.id}
              onRemember={
                onRememberMessage && message.kind === 'user'
                  ? () => onRememberMessage(message.id, message.text)
                  : undefined
              }
              onRevealFile={onRevealFile ? (path) => onRevealFile(message.id, path) : undefined}
              onOpenInspector={onOpenInspector}
              onInspect={getInspectHandler(message, onInspectMessage)}
            />
          </div>
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
  onRevealFile,
  onOpenInspector,
  onInspect
}: {
  message: HomeMessage
  remembered: boolean
  remembering: boolean
  onRemember?: () => void
  onRevealFile?: (relativePath: string) => void
  onOpenInspector?: () => void
  onInspect?: () => void
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
          {/* Hover affordances sit to the left of the bubble: copy, then the
              existing Remember bookmark. Both stay invisible until hover. */}
          <CopyButton
            text={message.text}
            label="Copy message"
            className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
          />
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
            <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-left-1 motion-safe:duration-300">
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
        <div className="group relative flex flex-col gap-1">
          {onInspect ? <InspectGutterButton onClick={onInspect} /> : null}
          {/* Copy lives in the same left gutter as inspect, stacked below it
              when both are present. */}
          <CopyButton
            text={message.text}
            label="Copy message"
            className={cn(
              'absolute -left-7 opacity-0 transition-all duration-150 group-hover:opacity-100 motion-safe:scale-90 motion-safe:group-hover:scale-100',
              onInspect ? 'top-7' : 'top-1'
            )}
            iconClassName="size-4"
          />
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
      // ADR-036: the live line doubles as the entry point to the run
      // inspector — it IS the "what is Ordinus doing right now?" question.
      return <LiveStatusRow label={message.label} onClick={onOpenInspector} />
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
        {/* One chevron that rotates, instead of swapping icons — the motion
            carries the state change. */}
        <ChevronRight
          className={cn('size-3.5 transition-transform duration-200', open && 'rotate-90')}
        />
        {open ? 'Hide full result' : 'Show full result'}
      </button>
      {open ? (
        <div className="border-l-2 border-primary/20 pl-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-200">
          <MarkdownContent content={content} />
        </div>
      ) : null}
    </div>
  )
}
