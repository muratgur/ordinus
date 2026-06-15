// ADR-048 §6 — Ordinus handoff chips.
//
// A distinct, recognizable affordance for Ordinus's own "go here next" action:
// a chip the user clicks to be taken to a surface (with an optional pre-filled
// input). Deliberately set apart from the transcript stream — it reads as
// Ordinus reaching out a hand, not as another message — but stays compact so it
// never dominates the conversation. Ordinus never auto-navigates or sends; the
// chip only acts when the user clicks it.

import type React from 'react'
import { ArrowUpRight } from 'lucide-react'
import type { OrdinusHandoff } from '@shared/contracts'

export type HomeHandoffChipsProps = {
  handoffs: ReadonlyArray<OrdinusHandoff>
  onFollow: (handoff: OrdinusHandoff) => void
}

export function HomeHandoffChips({
  handoffs,
  onFollow
}: HomeHandoffChipsProps): React.JSX.Element | null {
  if (handoffs.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2 px-1 pb-1" aria-label="Suggested next steps from Ordinus">
      {handoffs.map((handoff, index) => (
        <button
          key={`${handoff.target}:${handoff.agentId ?? ''}:${handoff.label}:${index}`}
          type="button"
          onClick={() => onFollow(handoff)}
          title={handoff.reason || undefined}
          className="group inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <ArrowUpRight className="size-3.5 opacity-70 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          {handoff.label}
        </button>
      ))}
    </div>
  )
}
