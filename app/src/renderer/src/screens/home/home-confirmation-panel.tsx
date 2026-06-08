// ADR-029 §9 / M6 — Destructive-tool confirmation panel.
//
// Floats above the docked input (Claude Code / Codex permission-prompt
// pattern). Receives pending confirmations from the parent (HomeScreen
// owns the subscription) and renders one at a time, oldest-first. The
// user clicks Approve or Cancel; the parent dispatches the IPC.
//
// ADR §9 explicit choices we honor here:
//   - Always shows affected record summary, not just raw args
//   - Optional "Why?" disclosure for the LLM's reason
//   - Reversibility label so the user knows what they're committing to
//   - All-or-nothing on batched targets (we render the whole list, one
//     pair of buttons — no per-row checkboxes)
//   - No timeout — the panel stays pending if the user navigates away
//     (rehydrated on Home re-mount via listPendingConfirmations)
//
// Visual stays inside the section card; the parent positions it just above
// the HomeInput so the user's focus path is "see panel → look at input →
// either approve or cancel and continue typing."

import { useState } from 'react'
import { AlertTriangle, RotateCcw, Trash2, X, Check } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import type { OrdinusConfirmationDecision, OrdinusPendingConfirmation } from '@shared/contracts'

export type HomeConfirmationPanelProps = {
  pending: OrdinusPendingConfirmation | null
  busy: boolean
  onResolve: (pendingId: string, decision: OrdinusConfirmationDecision) => void
}

export function HomeConfirmationPanel({
  pending,
  busy,
  onResolve
}: HomeConfirmationPanelProps): React.JSX.Element | null {
  const [whyOpen, setWhyOpen] = useState(false)
  if (!pending) return null

  const reversibility = pending.reversibility
  const Icon =
    reversibility === 'irreversible'
      ? AlertTriangle
      : reversibility === 'soft-delete'
        ? Trash2
        : RotateCcw
  const iconTone =
    reversibility === 'irreversible'
      ? 'text-destructive'
      : reversibility === 'soft-delete'
        ? 'text-amber-500'
        : 'text-muted-foreground'
  const reversibilityCopy =
    reversibility === 'irreversible'
      ? 'This cannot be undone.'
      : reversibility === 'soft-delete'
        ? 'Reversible — you can restore it later.'
        : 'Reversible — can be redone normally.'

  return (
    <div
      className={cn(
        'border-t bg-amber-500/5 px-4 py-3',
        reversibility === 'irreversible' && 'bg-destructive/5'
      )}
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
        <div className="flex items-start gap-3">
          <Icon className={cn('mt-0.5 size-4 shrink-0', iconTone)} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-semibold">{pending.toolLabel}</span>
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Needs your approval
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{reversibilityCopy}</p>
          </div>
        </div>

        {pending.affectedRecords.length > 0 ? (
          <ul className="flex flex-col gap-1 rounded-md border bg-background/60 px-3 py-2 text-sm">
            {pending.affectedRecords.map((record) => (
              <li key={record.id} className="flex items-baseline gap-2">
                <span className="truncate font-medium">{record.label}</span>
                {record.status ? (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {record.status}
                  </span>
                ) : null}
                <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
                  {record.id}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {pending.why ? (
          <div className="text-xs">
            <button
              type="button"
              onClick={() => setWhyOpen((v) => !v)}
              className="text-muted-foreground underline-offset-2 hover:underline"
            >
              {whyOpen ? 'Hide why' : 'Why?'}
            </button>
            {whyOpen ? (
              <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{pending.why}</p>
            ) : null}
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onResolve(pending.pendingId, 'cancelled')}
            disabled={busy}
          >
            <X className="size-3.5" /> Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            // The shadcn button set in this app does not ship a
            // 'destructive' variant — we use the default and tint via
            // className for the irreversible case so the action button
            // visually matches the panel's destructive framing.
            className={cn(
              reversibility === 'irreversible' &&
                'bg-destructive text-destructive-foreground hover:bg-destructive/90'
            )}
            onClick={() => onResolve(pending.pendingId, 'approved')}
            disabled={busy}
          >
            <Check className="size-3.5" />{' '}
            {reversibility === 'irreversible' ? 'Yes, delete' : 'Approve'}
          </Button>
        </div>
      </div>
    </div>
  )
}
