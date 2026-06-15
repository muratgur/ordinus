// ADR-048 — first-visit screen coach: per-section, per-variant "seen" state.
//
// Each section (agents, workboard, workflows, schedules, conversations) shows up
// to TWO one-time intros: a "no agent yet" version and, separately, a "now you
// have agents" version — the real "here's what you can do" once a teammate
// exists. Each variant tracks its own one-time flag in localStorage (no DB
// migration), like the Home welcome flag.
//
// Pass a null id while the section's data is still loading so we never show the
// wrong variant during the agents-not-loaded-yet window. `open` is derived from
// localStorage on each render (a cheap read), so it reacts to the id changing
// (e.g. the variant flipping from "none" to "has" right after the user creates
// their first agent) without an effect.

import { useCallback, useState } from 'react'

function storageKey(id: string): string {
  return `ordinus.screen-intro.${id}.seen`
}

export function readScreenIntroSeen(id: string): boolean {
  try {
    return window.localStorage.getItem(storageKey(id)) === 'true'
  } catch {
    // On storage failure, treat as seen so we never trap the user behind an
    // overlay that can't record its own dismissal.
    return true
  }
}

function writeSeen(id: string): void {
  try {
    window.localStorage.setItem(storageKey(id), 'true')
  } catch {
    /* localStorage unavailable */
  }
}

export function useScreenIntro(id: string | null): { open: boolean; dismiss: () => void } {
  // Tracks ids dismissed this session so the popup closes instantly on dismiss
  // (before the localStorage write is re-read on the next render).
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set())
  const open = id !== null && !readScreenIntroSeen(id) && !dismissed.has(id)
  const dismiss = useCallback(() => {
    if (id === null) return
    writeSeen(id)
    setDismissed((prev) => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [id])
  return { open, dismiss }
}
