// ADR-048 — first-visit screen coach.
//
// A one-time, dismissible popup Ordinus shows the FIRST time the user opens a
// section (Agents, Workboard, Workflows, Schedules). It says what the section is
// and the first thing to do — context-aware where it matters (e.g. Workboard
// nudges toward starting work when agents exist, or toward creating an agent
// when none do). Mirrors the Home welcome popup's look, single step.
//
// "Seen" state is per-section localStorage (no DB migration) — like the Home
// welcome flag. Dismissing (or following the CTA) marks it seen so it never
// auto-opens again.

import { useEffect } from 'react'
import { X } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { OrdinusAvatar } from '@renderer/screens/home/ordinus-avatar'

export type ScreenIntroPopupProps = {
  open: boolean
  onDismiss: () => void
  title: string
  body: string
  /** Optional primary action (e.g. "Create an agent" / "Go to Agents"). */
  cta?: { label: string; onClick: () => void }
}

export function ScreenIntroPopup({
  open,
  onDismiss,
  title,
  body,
  cta
}: ScreenIntroPopupProps): React.JSX.Element | null {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onDismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onDismiss])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-6 backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onDismiss}
    >
      <div
        className="relative flex w-full max-w-md flex-col overflow-hidden rounded-xl border bg-card shadow-xl motion-safe:animate-in motion-safe:zoom-in-95 motion-safe:duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Dismiss"
          title="Dismiss"
          className="absolute right-3 top-3 z-10 rounded-md p-1.5 text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
          onClick={onDismiss}
        >
          <X className="size-4" />
        </button>

        <div className="flex flex-col items-center gap-2 px-8 pb-2 pt-8 text-center">
          <OrdinusAvatar size="hero" />
          <h2 className="mt-2 text-xl font-semibold tracking-tight">{title}</h2>
          <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">{body}</p>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4">
          <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
            Got it
          </Button>
          {cta ? (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onDismiss()
                cta.onClick()
              }}
            >
              {cta.label}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
