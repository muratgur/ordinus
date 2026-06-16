import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Folder,
  Loader2,
  RefreshCw,
  Sparkles,
  X
} from 'lucide-react'
import type {
  InstallErrorCause,
  OnboardingState,
  OnboardingStatus,
  ProviderId
} from '@shared/contracts'
import { getProviderDisplayName } from '@shared/provider-labels'
import { Button } from '../../components/ui/button'
import { notify } from '../../lib/notifications'
import { cn } from '../../lib/utils'

const INSTALLABLE_PROVIDERS: ProviderId[] = ['claude', 'codex', 'gemini']

const PROVIDER_LINKS: Record<ProviderId, { signup: string; plans: string }> = {
  claude: {
    signup: 'https://www.anthropic.com/',
    plans: 'https://www.anthropic.com/pricing'
  },
  codex: {
    signup: 'https://openai.com/',
    plans: 'https://openai.com/pricing'
  },
  gemini: {
    signup: 'https://ai.google.dev/',
    plans: 'https://ai.google.dev/pricing'
  }
}

// ADR-047 §3a: actionable guidance ("what to do") per classified install-failure
// cause. Complements the diagnostic message ("what happened") produced in
// install/classify.ts — both are keyed by InstallErrorCause and must stay in
// sync; adding a cause to the enum forces an entry here (exhaustive Record).
const INSTALL_CAUSE_GUIDANCE: Record<InstallErrorCause, string> = {
  offline: 'Check your internet connection, then try again.',
  proxy: 'A proxy is blocking the download — check your proxy settings, or ask your IT admin.',
  'tls-cert':
    'A corporate network certificate is blocking the download — ask your IT admin to allow registry.npmjs.org.',
  permission: "Ordinus couldn't write the install files — check folder permissions and try again.",
  registry: 'The package registry returned an error — try again in a moment.',
  toolchain: 'This CLI needs a build toolchain that this machine is missing.',
  unknown: 'Try again. If it keeps failing, check your network or proxy.'
}

type OnboardingFlowProps = {
  initialStatus: OnboardingStatus
  onCompleted: () => void
}

/**
 * Full-window first-run flow (ADR-028). Borrows the agent-creation visual
 * vocabulary: progress dots top, centered max-w-md stage, round next-button
 * bottom, fade-in transitions. Five stages drive the state machine in main:
 * welcome → providers → workspace → install → colleague.
 */
export function OnboardingFlow({
  initialStatus,
  onCompleted
}: OnboardingFlowProps): React.JSX.Element {
  const [status, setStatus] = useState<OnboardingStatus>(initialStatus)
  const state = status.state
  // Once complete() lands, the state machine is at 'done' but App.tsx hasn't
  // yet re-fetched onboardingStatus to unmount us. Keep showing the colleague
  // stage during that brief window so the user doesn't see a blank flash.
  const stage = state.stage === 'done' ? 'colleague' : state.stage

  // Subscribe to install events from main so the InstallStage can paint
  // progress without polling. The envelope carries the latest persisted state,
  // so we just overwrite — no manual merging.
  useEffect(() => {
    const off = window.ordinus.onboarding.onInstallEvent((envelope) => {
      setStatus((current) => ({ ...current, state: envelope.state }))
    })
    return off
  }, [])

  return (
    <main className="grid h-screen grid-rows-[auto_minmax(0,1fr)_auto] bg-background text-foreground">
      <OnboardingProgressDots stage={stage} />

      <section className="flex items-center justify-center overflow-y-auto px-10 py-6">
        {stage === 'welcome' ? <WelcomeStage /> : null}

        {stage === 'providers' ? (
          <ProvidersStage
            initialSelected={state.selectedProviders}
            onSubmit={async (providerIds) => {
              const next = await window.ordinus.onboarding.selectProviders({ providerIds })
              setStatus(next)
            }}
          />
        ) : null}

        {stage === 'workspace' ? (
          <WorkspaceStage
            defaultWorkspace={state.workspace}
            onSubmit={async (workspaceRoot) => {
              const result = await window.ordinus.onboarding.confirmWorkspace({
                workspaceRoot
              })
              setStatus(result.status)
              // Auto-kick installs for every selected provider — the user has
              // already opted in and shouldn't have to press another button.
              for (const providerId of result.status.state.selectedProviders) {
                void window.ordinus.onboarding.installProvider({ providerId }).catch(() => {
                  /* Errors surface via install events; nothing extra to do. */
                })
              }
            }}
          />
        ) : null}

        {stage === 'install' ? <InstallStage state={state} onStateChange={setStatus} /> : null}

        {stage === 'colleague' ? (
          <OnboardingHandoffStage
            onFinish={async () => {
              // ADR-048 phase 4: no forced first-agent creation and no separate
              // full-page intro — that duplicated the in-Home welcome popup. After
              // the provider hire/install, complete with no agent and land directly
              // on Home, where the welcome popup introduces Ordinus.
              const next = await window.ordinus.onboarding.complete({})
              setStatus(next)
              onCompleted()
            }}
          />
        ) : null}
      </section>

      <OnboardingFooter
        stage={stage}
        canAdvance={stage === 'welcome'}
        onAdvance={async () => {
          if (stage === 'welcome') {
            const next = await window.ordinus.onboarding.advanceFromWelcome()
            setStatus(next)
          }
        }}
      />
    </main>
  )
}

// --- Welcome ----------------------------------------------------------------

function WelcomeStage(): React.JSX.Element {
  return (
    <div className="grid w-full max-w-md gap-6 text-center motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500">
      <div className="flex items-center justify-center">
        <span className="block size-2.5 animate-pulse rounded-full bg-foreground/60" />
      </div>
      <div>
        <p className="text-2xl font-semibold tracking-tight">Build a space for your work.</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Bring in AI colleagues who can help. Ordinus sets them up for you.
        </p>
      </div>
    </div>
  )
}

// --- Providers --------------------------------------------------------------

function ProvidersStage({
  initialSelected,
  onSubmit
}: {
  initialSelected: ProviderId[]
  onSubmit: (providerIds: ProviderId[]) => Promise<void>
}): React.JSX.Element {
  const [selected, setSelected] = useState<ProviderId[]>(initialSelected)
  const [busy, setBusy] = useState(false)

  function toggle(providerId: ProviderId): void {
    setSelected((current) =>
      current.includes(providerId)
        ? current.filter((id) => id !== providerId)
        : [...current, providerId]
    )
  }

  async function handleContinue(): Promise<void> {
    if (selected.length === 0 || busy) return
    try {
      setBusy(true)
      await onSubmit(selected)
    } catch (error) {
      notify.attention({
        title: 'Could not save your choice',
        description: error instanceof Error ? error.message : 'Unknown error.'
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid w-full max-w-md gap-5 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500">
      <div className="text-center">
        <p className="text-2xl font-semibold tracking-tight">Who should help you?</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick one or more. You can add more later.
        </p>
      </div>

      <div className="grid gap-2">
        {INSTALLABLE_PROVIDERS.map((providerId) => (
          <ProviderCard
            key={providerId}
            providerId={providerId}
            selected={selected.includes(providerId)}
            onToggle={() => toggle(providerId)}
          />
        ))}
      </div>

      <div className="flex justify-center gap-3 text-xs text-muted-foreground">
        {INSTALLABLE_PROVIDERS.map((providerId) => (
          <SubscriptionLink key={providerId} providerId={providerId} />
        ))}
      </div>

      <div className="flex justify-center">
        <Button
          onClick={() => void handleContinue()}
          disabled={selected.length === 0 || busy}
          variant="outline"
          className="rounded-full"
        >
          {busy ? <Loader2 className="animate-spin" /> : null}
          Continue
        </Button>
      </div>
    </div>
  )
}

function ProviderCard({
  providerId,
  selected,
  onToggle
}: {
  providerId: ProviderId
  selected: boolean
  onToggle: () => void
}): React.JSX.Element {
  const name = getProviderDisplayName(providerId)
  const monogram = name.charAt(0)
  const colorClass = providerColorClass(providerId)

  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'flex items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors',
        selected
          ? 'border-foreground bg-accent'
          : 'border-border hover:border-foreground/30 hover:bg-accent'
      )}
      aria-pressed={selected}
    >
      <div
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white',
          colorClass
        )}
      >
        {monogram}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{name}</p>
        <p className="text-xs text-muted-foreground">{providerPitch(providerId)}</p>
      </div>
      <div
        className={cn(
          'flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors',
          selected ? 'border-foreground bg-foreground text-background' : 'border-border'
        )}
      >
        {selected ? <Check className="size-3" strokeWidth={3} /> : null}
      </div>
    </button>
  )
}

function SubscriptionLink({ providerId }: { providerId: ProviderId }): React.JSX.Element {
  return (
    <a
      href={PROVIDER_LINKS[providerId].signup}
      target="_blank"
      rel="noreferrer"
      className="underline-offset-4 hover:underline"
    >
      {getProviderDisplayName(providerId)} ↗
    </a>
  )
}

// --- Workspace --------------------------------------------------------------

function WorkspaceStage({
  defaultWorkspace,
  onSubmit
}: {
  defaultWorkspace: OnboardingState['workspace']
  onSubmit: (workspaceRoot: string) => Promise<void>
}): React.JSX.Element {
  const [workspaceRoot, setWorkspaceRoot] = useState(defaultWorkspace?.workspaceRoot ?? '')
  const [proposedRoot, setProposedRoot] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    // Propose the active profile's own userData directory as the fresh space.
    // ADR-051: must use `paths.userData` verbatim — the previous code stripped the
    // basename and re-appended a hardcoded "Ordinus", which under the `scratch`
    // profile resolved to the *real* profile's directory and would have written
    // scratch's workspace into real data. `paths.userData` is already profile-correct
    // (`…/Ordinus` for real, `…/Ordinus-scratch` for scratch).
    if (workspaceRoot) return
    void window.ordinus.system.getPaths().then((paths) => {
      setProposedRoot(paths.userData)
    })
  }, [workspaceRoot])

  async function pickFolder(): Promise<void> {
    const result = await window.ordinus.workspace.selectFolder()
    if (result.cancelled) return
    setWorkspaceRoot(result.workspaceRoot)
  }

  function useProposed(): void {
    if (!proposedRoot) return
    setWorkspaceRoot(proposedRoot)
  }

  async function handleContinue(): Promise<void> {
    if (!workspaceRoot.trim() || busy) return
    try {
      setBusy(true)
      await onSubmit(workspaceRoot.trim())
    } catch (error) {
      notify.attention({
        title: 'Could not set up your space',
        description: error instanceof Error ? error.message : 'Unknown error.'
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid w-full max-w-md gap-5 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500">
      <div className="text-center">
        <p className="text-2xl font-semibold tracking-tight">Where should we set up?</p>
        <p className="mt-1 text-sm text-muted-foreground">
          This folder is your colleagues&apos; workspace. Choose carefully — it&apos;s hard to
          change later.
        </p>
      </div>

      <div className="grid gap-2">
        <button
          type="button"
          onClick={useProposed}
          disabled={!proposedRoot}
          className={cn(
            'flex items-start gap-3 rounded-lg border bg-card p-3 text-left transition-colors',
            workspaceRoot === proposedRoot
              ? 'border-foreground bg-accent'
              : 'border-border hover:border-foreground/30 hover:bg-accent',
            !proposedRoot && 'pointer-events-none opacity-60'
          )}
        >
          <Sparkles className="mt-0.5 size-4 text-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Use a fresh space</p>
            <p className="truncate text-xs text-muted-foreground">{proposedRoot ?? 'Loading…'}</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => void pickFolder()}
          className={cn(
            'flex items-start gap-3 rounded-lg border bg-card p-3 text-left transition-colors',
            workspaceRoot && workspaceRoot !== proposedRoot
              ? 'border-foreground bg-accent'
              : 'border-border hover:border-foreground/30 hover:bg-accent'
          )}
        >
          <Folder className="mt-0.5 size-4 text-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">I have a folder in mind</p>
            <p className="truncate text-xs text-muted-foreground">
              {workspaceRoot && workspaceRoot !== proposedRoot ? workspaceRoot : 'Choose a folder…'}
            </p>
          </div>
        </button>
      </div>

      <div className="flex justify-center">
        <Button
          onClick={() => void handleContinue()}
          disabled={!workspaceRoot.trim() || busy}
          variant="outline"
          className="rounded-full"
        >
          {busy ? <Loader2 className="animate-spin" /> : null}
          Continue
        </Button>
      </div>
    </div>
  )
}

// --- Install ----------------------------------------------------------------

const AUTH_POLL_INTERVAL_MS = 3_000
const AUTH_POLL_TIMEOUT_MS = 5 * 60_000

function InstallStage({
  state,
  onStateChange
}: {
  state: OnboardingState
  onStateChange: (next: OnboardingStatus) => void
}): React.JSX.Element {
  // Track which providers we've already kicked into the connect flow, so the
  // effect below doesn't re-trigger auth every time install events fire.
  const authKicked = useRef<Set<ProviderId>>(new Set())
  const authPollStartedAt = useRef<Map<ProviderId, number>>(new Map())
  // Per-provider auth-poll timeout flag — surfaces a hint in the row when
  // the 5-min window elapses without the runtime reporting connected.
  const [authTimedOut, setAuthTimedOut] = useState<Set<ProviderId>>(new Set())

  const markAuthed = useCallback(
    async (providerId: ProviderId): Promise<void> => {
      try {
        const next = await window.ordinus.onboarding.markProviderAuthed({
          providerId,
          authed: true
        })
        onStateChange(next)
      } catch (error) {
        notify.attention({
          title: 'Could not confirm sign-in',
          description: error instanceof Error ? error.message : 'Unknown error.'
        })
      }
    },
    [onStateChange]
  )

  // Auto-trigger connect + poll runtime until the provider reports connected,
  // then mark authed without user intervention. Manual "I'm signed in"
  // button stays as a fallback (and as a re-poll trigger).
  useEffect(() => {
    const timers: ReturnType<typeof setInterval>[] = []
    for (const providerId of state.selectedProviders) {
      const status = state.installResults[providerId]
      if (status !== 'installed') continue
      if (authKicked.current.has(providerId)) continue

      authKicked.current.add(providerId)
      authPollStartedAt.current.set(providerId, Date.now())

      void window.ordinus.runtime
        .connectProvider({ providerId, loginMethod: 'default' })
        .catch(() => {
          /* Browser couldn't open — failure card will surface a retry. */
        })

      const interval = setInterval(() => {
        const startedAt = authPollStartedAt.current.get(providerId) ?? Date.now()
        if (Date.now() - startedAt > AUTH_POLL_TIMEOUT_MS) {
          clearInterval(interval)
          setAuthTimedOut((current) => {
            if (current.has(providerId)) return current
            const next = new Set(current)
            next.add(providerId)
            return next
          })
          return
        }
        void window.ordinus.runtime
          .refreshProvider({ providerId })
          .then((result) => {
            if (result.connected) {
              clearInterval(interval)
              void markAuthed(providerId)
            }
          })
          .catch(() => {
            /* Transient — keep polling until timeout. */
          })
      }, AUTH_POLL_INTERVAL_MS)
      timers.push(interval)
    }
    return () => {
      for (const timer of timers) clearInterval(timer)
    }
  }, [state.installResults, state.selectedProviders, markAuthed])

  function clearAuthTimeout(providerId: ProviderId): void {
    setAuthTimedOut((current) => {
      if (!current.has(providerId)) return current
      const next = new Set(current)
      next.delete(providerId)
      return next
    })
  }

  async function retryInstall(providerId: ProviderId): Promise<void> {
    authKicked.current.delete(providerId)
    authPollStartedAt.current.delete(providerId)
    clearAuthTimeout(providerId)
    try {
      await window.ordinus.onboarding.installProvider({ providerId })
    } catch (error) {
      notify.attention({
        title: 'Could not retry',
        description: error instanceof Error ? error.message : 'Unknown error.'
      })
    }
  }

  async function confirmAuthed(providerId: ProviderId): Promise<void> {
    clearAuthTimeout(providerId)
    try {
      const result = await window.ordinus.runtime.refreshProvider({ providerId })
      if (!result.connected) {
        notify.attention({
          title: 'Still not signed in',
          description: 'Finish the browser sign-in, then try again.'
        })
        return
      }
      await markAuthed(providerId)
    } catch (error) {
      notify.attention({
        title: 'Could not confirm sign-in',
        description: error instanceof Error ? error.message : 'Unknown error.'
      })
    }
  }

  async function pickAnother(): Promise<void> {
    try {
      const next = await window.ordinus.onboarding.resetProviders()
      onStateChange(next)
    } catch (error) {
      notify.attention({
        title: 'Could not reset',
        description: error instanceof Error ? error.message : 'Unknown error.'
      })
    }
  }

  const allFailed = state.selectedProviders.every(
    (providerId) => state.installResults[providerId] === 'failed'
  )

  return (
    <div className="grid w-full max-w-md gap-5 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500">
      <div className="text-center">
        <p className="text-2xl font-semibold tracking-tight">Setting up your team.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          We&apos;re getting each colleague ready. A short browser sign-in will follow.
        </p>
      </div>

      <ul className="grid gap-2">
        {state.selectedProviders.map((providerId) => (
          <InstallRow
            key={providerId}
            providerId={providerId}
            status={state.installResults[providerId] ?? 'pending'}
            phase={state.installPhases[providerId] ?? 'idle'}
            error={state.installErrors[providerId]}
            errorCause={state.installErrorCauses[providerId]}
            authTimedOut={authTimedOut.has(providerId)}
            onRetry={() => void retryInstall(providerId)}
            onConfirmAuth={() => void confirmAuthed(providerId)}
          />
        ))}
      </ul>

      {allFailed ? (
        <div className="flex justify-center">
          <Button onClick={() => void pickAnother()} variant="ghost" size="sm">
            Pick a different colleague
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function InstallRow({
  providerId,
  status,
  phase,
  error,
  errorCause,
  authTimedOut,
  onRetry,
  onConfirmAuth
}: {
  providerId: ProviderId
  status: OnboardingState['installResults'][ProviderId]
  phase: OnboardingState['installPhases'][ProviderId]
  error: string | undefined
  errorCause: InstallErrorCause | undefined
  authTimedOut: boolean
  onRetry: () => void
  onConfirmAuth: () => void
}): React.JSX.Element {
  const name = getProviderDisplayName(providerId)
  const showProgress = status === 'installing'

  return (
    <li className="overflow-hidden rounded-lg border bg-card text-sm motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-300">
      <div className="flex items-center gap-3 p-3">
        <StatusIndicator status={status} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{statusLabel(name, status)}</p>
          {status === 'installed' && !authTimedOut ? (
            <p className="text-xs text-muted-foreground">
              Finish signing in — we&apos;ll detect it automatically.
            </p>
          ) : null}
          {status === 'installed' && authTimedOut ? (
            <p className="text-xs text-status-attention">
              Still waiting — click below when you&apos;ve signed in.
            </p>
          ) : null}
          {status === 'installing' ? (
            <p className="text-xs text-muted-foreground">{phaseHint(phase)}</p>
          ) : null}
        </div>
        {status === 'installed' ? (
          <Button size="sm" variant="ghost" onClick={onConfirmAuth}>
            I&apos;m signed in
          </Button>
        ) : null}
        {status === 'failed' ? (
          <Button size="sm" variant="outline" onClick={onRetry}>
            <RefreshCw className="size-3.5" />
            Try again
          </Button>
        ) : null}
      </div>
      {showProgress ? <InstallProgressBar phase={phase} /> : null}
      {status === 'failed' ? (
        <ProviderFailureCard
          providerId={providerId}
          error={error}
          errorCause={errorCause}
          onRetry={onRetry}
        />
      ) : null}
    </li>
  )
}

function InstallProgressBar({
  phase
}: {
  phase: OnboardingState['installPhases'][ProviderId]
}): React.JSX.Element {
  const percent = phaseToPercent(phase)
  const indeterminate = phase === 'start' || phase === 'download'
  return (
    <div className="h-1 w-full overflow-hidden bg-muted">
      {indeterminate ? (
        <div className="ordinus-install-shimmer h-full w-1/3 bg-foreground/60" />
      ) : (
        <div
          className="h-full bg-foreground/70 transition-[width] duration-500"
          style={{ width: `${percent}%` }}
        />
      )}
    </div>
  )
}

function ProviderFailureCard({
  providerId,
  error,
  errorCause,
  onRetry
}: {
  providerId: ProviderId
  error: string | undefined
  errorCause: InstallErrorCause | undefined
  onRetry: () => void
}): React.JSX.Element {
  const links = PROVIDER_LINKS[providerId]
  const guidance = INSTALL_CAUSE_GUIDANCE[errorCause ?? 'unknown']
  return (
    <div className="border-t bg-muted/30 px-3 py-2 text-xs">
      {error ? (
        <p className="line-clamp-2 text-foreground/80 [overflow-wrap:anywhere]">{error}</p>
      ) : null}
      <p className="mt-0.5 text-muted-foreground">{guidance}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <a
          href={links.signup}
          target="_blank"
          rel="noreferrer"
          className="underline-offset-4 hover:underline"
        >
          No account? Sign up ↗
        </a>
        <a
          href={links.plans}
          target="_blank"
          rel="noreferrer"
          className="underline-offset-4 hover:underline"
        >
          Wrong plan? See plans ↗
        </a>
        <button type="button" onClick={onRetry} className="underline-offset-4 hover:underline">
          Network issue? Try again
        </button>
      </div>
    </div>
  )
}

function StatusIndicator({
  status
}: {
  status: OnboardingState['installResults'][ProviderId]
}): React.JSX.Element {
  switch (status) {
    case 'installing':
      return <Loader2 className="size-4 shrink-0 animate-spin text-foreground" />
    case 'installed':
    case 'authed':
      return <CheckCircle2 className="size-4 shrink-0 text-status-completed" />
    case 'failed':
      return <X className="size-4 shrink-0 text-status-failed" />
    case 'pending':
    default:
      return <span className="block size-2 shrink-0 rounded-full bg-muted-foreground/40" />
  }
}

function statusLabel(name: string, status: OnboardingState['installResults'][ProviderId]): string {
  switch (status) {
    case 'installing':
      return `Hiring ${name}…`
    case 'installed':
      return `${name} — sign in`
    case 'authed':
      return `${name} is ready`
    case 'failed':
      return `${name} couldn't join`
    case 'pending':
    default:
      return `Waiting for ${name}`
  }
}

function phaseHint(phase: OnboardingState['installPhases'][ProviderId]): string {
  switch (phase) {
    case 'start':
      return 'Reaching out…'
    case 'download':
      return 'Bringing in tools…'
    case 'verify':
      return 'Checking everything works…'
    case 'done':
      return 'All set.'
    case 'error':
      return 'Something went wrong.'
    case 'idle':
    default:
      return 'Getting ready…'
  }
}

function phaseToPercent(phase: OnboardingState['installPhases'][ProviderId]): number {
  switch (phase) {
    case 'start':
      return 10
    case 'download':
      return 50
    case 'verify':
      return 85
    case 'done':
      return 100
    default:
      return 5
  }
}

// --- Onboarding handoff (ADR-048 phase 4) ----------------------------------

// After the provider hire/install there is no separate full-page intro and no
// forced first-agent creation — both duplicated the in-Home welcome popup. This
// stage just completes onboarding and hands off to Home, where the welcome popup
// introduces Ordinus. A brief spinner covers the one-shot completion call.
function OnboardingHandoffStage({
  onFinish
}: {
  onFinish: () => Promise<void>
}): React.JSX.Element {
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    void onFinish().catch((error) => {
      notify.attention({
        title: 'Could not finish setup',
        description: error instanceof Error ? error.message : 'Unknown error.'
      })
    })
  }, [onFinish])

  return (
    <div className="flex flex-col items-center gap-3 text-muted-foreground motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500">
      <Loader2 className="size-5 animate-spin" />
      <span className="text-sm">Taking you in…</span>
    </div>
  )
}

// --- Footer (round next-button) --------------------------------------------

function OnboardingFooter({
  stage,
  canAdvance,
  onAdvance
}: {
  stage: OnboardingState['stage']
  canAdvance: boolean
  onAdvance: () => Promise<void> | void
}): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const visible = stage === 'welcome'

  async function handleClick(): Promise<void> {
    if (!canAdvance || busy) return
    try {
      setBusy(true)
      await onAdvance()
    } finally {
      setBusy(false)
    }
  }

  if (!visible) {
    return <div className="h-20" aria-hidden />
  }

  return (
    <div className="flex items-center justify-center px-10 py-5">
      <button
        type="button"
        aria-label="Continue"
        disabled={!canAdvance || busy}
        onClick={() => void handleClick()}
        className={cn(
          'flex size-14 items-center justify-center rounded-full border-2 bg-transparent transition-all duration-200',
          canAdvance
            ? 'border-foreground text-foreground hover:scale-[1.04] hover:bg-foreground/5 active:scale-95'
            : 'pointer-events-none border-muted-foreground/30 text-muted-foreground/40'
        )}
      >
        {busy ? <Loader2 className="size-5 animate-spin" /> : <ArrowRight className="size-5" />}
      </button>
    </div>
  )
}

// --- Progress dots ---------------------------------------------------------

function OnboardingProgressDots({ stage }: { stage: OnboardingState['stage'] }): React.JSX.Element {
  const order: OnboardingState['stage'][] = [
    'welcome',
    'providers',
    'workspace',
    'install',
    'colleague'
  ]
  const index = Math.max(0, order.indexOf(stage)) + 1
  return (
    <div className="flex items-center justify-center gap-1.5 pt-6">
      {order.map((_, dotIndex) => (
        <span
          key={dotIndex}
          className={cn(
            'block size-1.5 rounded-full transition-colors',
            dotIndex < index ? 'bg-foreground' : 'bg-muted'
          )}
        />
      ))}
    </div>
  )
}

// --- helpers ---------------------------------------------------------------

function providerPitch(providerId: ProviderId): string {
  switch (providerId) {
    case 'claude':
      return 'Anthropic — strong reasoning and code.'
    case 'codex':
      return 'OpenAI — quick coding partner.'
    case 'gemini':
      return 'Google — long context and search.'
  }
}

function providerColorClass(providerId: ProviderId): string {
  switch (providerId) {
    case 'claude':
      return 'bg-amber-500'
    case 'codex':
      return 'bg-emerald-500'
    case 'gemini':
      return 'bg-sky-500'
  }
}

export default OnboardingFlow
