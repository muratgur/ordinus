import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { MarkdownContent } from './markdown-content'

// ADR-030 — a turn's summary is always shown; the full produced body
// (resultContent) is surfaced on demand. This is the one expandable used by
// every transcript surface (Home, Conversations, Agent room) so the
// affordance reads identically everywhere.
export function TurnFullResponse({ content }: { content: string }): React.JSX.Element {
  const [open, setOpen] = useState(false)

  return (
    <div className="grid gap-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-fit items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        aria-expanded={open}
      >
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
