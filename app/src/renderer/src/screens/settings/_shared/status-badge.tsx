// ADR-045 A4 — the shared Settings status vocabulary.
//
// Five states, fixed colors. The *word* is the caller's (so a section can keep
// a domain term like "Listening"), but the color semantics come from `tone` so
// every Settings surface signals state the same way:
//
//   connected / ready -> success (green)   working, set up
//   idle              -> outline (neutral) not set up
//   action            -> attention (amber) waiting on the user
//   error             -> failed (red)      broken
//   pending           -> muted + spinner   in transition
//
// `connected` vs `ready` carry the same color but exist as distinct tones so
// call sites read correctly: external connections use `connected`, in-app
// readiness (e.g. the workspace) uses `ready`.

import { AlertTriangle, CheckCircle2, CircleDashed, Loader2, XCircle } from 'lucide-react'
import { Badge } from '@renderer/components/ui/badge'

export type SettingsStatusTone = 'connected' | 'ready' | 'idle' | 'action' | 'error' | 'pending'

const TONES: Record<
  SettingsStatusTone,
  {
    variant: React.ComponentProps<typeof Badge>['variant']
    icon: typeof CheckCircle2
    spin?: boolean
  }
> = {
  connected: { variant: 'success', icon: CheckCircle2 },
  ready: { variant: 'success', icon: CheckCircle2 },
  idle: { variant: 'outline', icon: CircleDashed },
  action: { variant: 'attention', icon: AlertTriangle },
  error: { variant: 'failed', icon: XCircle },
  pending: { variant: 'secondary', icon: Loader2, spin: true }
}

export function StatusBadge({
  tone,
  children
}: {
  tone: SettingsStatusTone
  children: React.ReactNode
}): React.JSX.Element {
  const { variant, icon: Icon, spin } = TONES[tone]
  return (
    <Badge variant={variant}>
      <Icon className={spin ? 'mr-1 size-3 animate-spin' : 'mr-1 size-3'} />
      {children}
    </Badge>
  )
}
