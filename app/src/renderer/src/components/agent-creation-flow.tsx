import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Library, Loader2, Search } from 'lucide-react'
import type { Agent, AgentDraft, AgentProfile, AgentProfileCatalog } from '@shared/contracts'
import { Dialog, DialogContent } from './ui/dialog'
import { Input } from './ui/input'
import { AGENT_COLORS, AGENT_SYMBOLS, AVATAR_DELIMITER } from './agent-palette'
import { notify } from '../lib/notifications'
import { cn } from '../lib/utils'

type CreationStep = 'capabilities' | 'shape' | 'greet'

const PULSE_MS = 900
const TYPE_SPEED_MS = 22
const REPLY_LINES: [string, string] = [
  "Hi — I think we're going to work well together.",
  'Give me a task whenever you’re ready.'
]

type AgentCreationFlowProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAgentCreated: (agent: Agent) => void
  existingAgentNames: string[]
}

/**
 * Single coherent creation flow that replaces the legacy catalog/describe/
 * review/bond split. Three minimal steps, no admin form.
 *
 *   1. Capabilities — what can it do? (with library drawer + AI assist)
 *   2. Shape        — name + avatar
 *   3. Greet        — pulse + first words, then Create
 *
 * Provider, model, sandbox, role, and instructions are populated from a
 * source draft (library profile, AI assist, or a silent blank scaffold) and
 * are editable from the agent settings screen after creation. The flow does
 * not surface them at creation time.
 */
export function AgentCreationFlow({
  open,
  onOpenChange,
  onAgentCreated,
  existingAgentNames
}: AgentCreationFlowProps): React.JSX.Element {
  const [step, setStep] = useState<CreationStep>('capabilities')
  const [intent, setIntent] = useState('')
  const [draft, setDraft] = useState<AgentDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState<string>('')
  const [symbol, setSymbol] = useState<string>('')
  const [aiThinking, setAiThinking] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)

  const reset = useCallback((): void => {
    setStep('capabilities')
    setIntent('')
    setDraft(null)
    setBusy(false)
    setName('')
    setColor('')
    setSymbol('')
    setAiThinking(false)
    setLibraryOpen(false)
  }, [])

  function handleClose(): void {
    onOpenChange(false)
    // State is reset by the open-derived effect below once the dialog
    // settles in the closed position.
  }

  useEffect(() => {
    if (open) return
    // Defer reset by one tick so the closing animation doesn't flash an
    // empty state. Cleanup cancels the pending reset if the dialog re-opens
    // before it fires.
    const handle = setTimeout(reset, 250)
    return () => clearTimeout(handle)
  }, [open, reset])

  function handleIntentChange(nextIntent: string): void {
    setIntent(nextIntent)
    setDraft((currentDraft) => {
      if (!currentDraft || nextIntent === currentDraft.capabilities) {
        return currentDraft
      }
      return null
    })
  }

  async function handleContinueFromCapabilities(): Promise<void> {
    const trimmed = intent.trim()
    if (!trimmed || busy) return

    try {
      setBusy(true)
      // If the user hasn't already shaped a draft via the library, we call AI
      // to enrich their description into a real agent (instructions, role,
      // capabilities). The continue button IS the "bring to life" action —
      // there's no separate "Help me describe" button anymore.
      let nextDraft = draft
      if (!nextDraft) {
        if (trimmed.length >= 12) {
          setAiThinking(true)
          nextDraft = await window.ordinus.agents.draftFromIntent({
            requestedWork: trimmed,
            sandbox: 'workspace-write'
          })
        } else {
          // Below the AI minimum — fall back to a blank scaffold so we still
          // have valid provider/model/sandbox defaults from main.
          nextDraft = await window.ordinus.agents.draftBlank()
        }
      }
      nextDraft = {
        ...nextDraft,
        capabilities: trimmed,
        role:
          nextDraft.role && nextDraft.role.toLowerCase() !== 'custom agent'
            ? nextDraft.role
            : deriveRoleFromCapabilities(trimmed),
        name: uniqueName(nextDraft.name || 'New agent', existingAgentNames)
      }
      setDraft(nextDraft)
      setName(nextDraft.name)
      setStep('shape')
    } catch (error) {
      notify.attention({
        title: 'Could not bring it to life',
        description: error instanceof Error ? error.message : 'Unknown error.'
      })
    } finally {
      setBusy(false)
      setAiThinking(false)
    }
  }

  async function handlePickProfile(profile: AgentProfile): Promise<void> {
    try {
      setBusy(true)
      const result = await window.ordinus.agents.draftFromProfile({
        profileId: profile.id
      })
      setIntent(result.capabilities)
      setDraft({
        ...result,
        name: uniqueName(result.name, existingAgentNames)
      })
      setLibraryOpen(false)
    } catch (error) {
      notify.attention({
        title: 'Could not load profile',
        description: error instanceof Error ? error.message : 'Unknown error.'
      })
    } finally {
      setBusy(false)
    }
  }

  async function handleCreate(): Promise<void> {
    if (!draft || !name.trim() || !color || !symbol || busy) return

    try {
      setBusy(true)
      const agent = await window.ordinus.agents.create({
        ...draft,
        name: name.trim(),
        avatar: `${color}${AVATAR_DELIMITER}${symbol}`,
        enabled: true
      })
      onAgentCreated(agent)
      handleClose()
    } catch (error) {
      notify.attention({
        title: 'Could not create agent',
        description: error instanceof Error ? error.message : 'Unknown error.'
      })
    } finally {
      setBusy(false)
    }
  }

  function handleDialogOpenChange(next: boolean): void {
    if (!next) {
      handleClose()
    } else {
      onOpenChange(true)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent
        className="grid h-[min(640px,calc(100vh-4rem))] grid-rows-1 gap-0 overflow-hidden p-0"
        style={{ width: 'min(576px, calc(100vw - 2rem))', maxWidth: 'none' }}
      >
        <div className="relative grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] bg-background">
          {step !== 'capabilities' ? (
            <button
              type="button"
              onClick={() => setStep(step === 'shape' ? 'capabilities' : 'shape')}
              aria-label="Back"
              className="absolute left-4 top-4 z-10 text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
            </button>
          ) : null}
          <ProgressDots step={step} />

          <div className="flex min-h-0 items-center justify-center overflow-hidden px-10 py-4">
            {step === 'capabilities' ? (
              <CapabilitiesStage
                intent={intent}
                onIntentChange={handleIntentChange}
                aiThinking={aiThinking}
                onOpenLibrary={() => setLibraryOpen(true)}
                hasDraft={Boolean(draft)}
              />
            ) : null}

            {step === 'shape' && draft ? (
              <ShapeStage
                name={name}
                role={draft.role}
                color={color}
                symbol={symbol}
                onNameChange={setName}
                onColorChange={setColor}
                onSymbolChange={setSymbol}
              />
            ) : null}

            {step === 'greet' ? <GreetStage /> : null}
          </div>

          <FlowFooter
            step={step}
            canContinueFromCapabilities={intent.trim().length > 0 && !busy && !aiThinking}
            canFinishShape={name.trim().length > 0 && Boolean(color) && Boolean(symbol)}
            busy={busy}
            onContinueFromCapabilities={() => void handleContinueFromCapabilities()}
            onContinueFromShape={() => setStep('greet')}
            onCreate={() => void handleCreate()}
          />
        </div>

        <LibraryDrawer
          open={libraryOpen}
          onClose={() => setLibraryOpen(false)}
          onPick={(profile) => void handlePickProfile(profile)}
        />
      </DialogContent>
    </Dialog>
  )
}

function CapabilitiesStage({
  intent,
  onIntentChange,
  aiThinking,
  onOpenLibrary,
  hasDraft
}: {
  intent: string
  onIntentChange: (nextIntent: string) => void
  aiThinking: boolean
  onOpenLibrary: () => void
  hasDraft: boolean
}): React.JSX.Element {
  return (
    <div className="grid w-full max-w-md gap-5 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500">
      <div className="text-center">
        <p className="text-2xl font-semibold tracking-tight">Bring an agent to life</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Start with a description, or borrow a ready soul.
        </p>
      </div>

      <div className="flex items-center justify-center">
        <button
          type="button"
          onClick={onOpenLibrary}
          className="flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-accent"
        >
          <Library className="size-3.5" />
          Choose a soul
        </button>
      </div>

      <div className="relative">
        <div className={cn('relative rounded-lg', aiThinking && 'ordinus-thinking-field p-px')}>
          <textarea
            value={intent}
            onChange={(event) => onIntentChange(event.target.value)}
            placeholder="A patient blog editor with a warm, precise tone…"
            maxLength={300}
            disabled={aiThinking}
            className={cn(
              'ordinus-scrollbar block min-h-32 w-full resize-none rounded-lg bg-card p-3 text-sm leading-6 text-foreground shadow-none outline-none transition-all placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              aiThinking ? 'border-0' : 'border'
            )}
          />
        </div>
        <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {aiThinking ? 'Bringing it to life…' : hasDraft ? 'Ready.' : 'A sentence is enough.'}
          </span>
          <span>{intent.length}/300</span>
        </div>
      </div>
    </div>
  )
}

function ShapeStage({
  name,
  role,
  color,
  symbol,
  onNameChange,
  onColorChange,
  onSymbolChange
}: {
  name: string
  role: string
  color: string
  symbol: string
  onNameChange: (next: string) => void
  onColorChange: (next: string) => void
  onSymbolChange: (next: string) => void
}): React.JSX.Element {
  const SymbolIcon = AGENT_SYMBOLS.find((entry) => entry.id === symbol)?.Icon ?? null
  const colorClass = AGENT_COLORS.find((entry) => entry.id === color)?.className ?? ''

  return (
    <div className="grid w-full max-w-md gap-5 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500">
      <div className="flex flex-col items-center gap-2">
        <div
          className={cn(
            'flex size-16 items-center justify-center rounded-full text-white transition-colors duration-300',
            colorClass || 'bg-muted'
          )}
        >
          {SymbolIcon ? <SymbolIcon className="size-7" strokeWidth={1.75} /> : null}
        </div>
        <p
          className={cn(
            'text-xl font-semibold tracking-tight transition-colors',
            name.trim().length === 0 && 'text-muted-foreground/50'
          )}
        >
          {name.trim() || 'Your agent'}
        </p>
        {role ? (
          <p className="-mt-1 line-clamp-2 max-w-xs text-center text-xs text-muted-foreground [overflow-wrap:anywhere]">
            {role}
          </p>
        ) : null}
      </div>

      <input
        type="text"
        autoFocus
        value={name}
        onChange={(event) => onNameChange(event.target.value)}
        placeholder="Editor Esra, Code Watcher, Pulse…"
        maxLength={80}
        className="w-full border-0 border-b border-border bg-transparent px-1 py-1.5 text-center text-base outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-foreground"
      />

      <div className="flex justify-center gap-2">
        {AGENT_COLORS.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-label={option.id}
            onClick={() => onColorChange(option.id)}
            className={cn(
              'size-6 rounded-full transition-all duration-200',
              option.className,
              color === option.id
                ? 'scale-110 ring-2 ring-foreground ring-offset-2 ring-offset-background'
                : 'opacity-75 hover:opacity-100'
            )}
          />
        ))}
      </div>

      <div className="grid grid-cols-8 gap-1.5">
        {AGENT_SYMBOLS.map(({ id, Icon }) => (
          <button
            key={id}
            type="button"
            aria-label={id}
            onClick={() => onSymbolChange(id)}
            className={cn(
              'flex aspect-square items-center justify-center rounded-full transition-all duration-200',
              symbol === id
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="size-4" strokeWidth={1.75} />
          </button>
        ))}
      </div>
    </div>
  )
}

function GreetStage(): React.JSX.Element {
  const [phase, setPhase] = useState<'pulse' | 'reply'>('pulse')

  useEffect(() => {
    const timer = setTimeout(() => setPhase('reply'), PULSE_MS)
    return () => clearTimeout(timer)
  }, [])

  const fullReply = REPLY_LINES.join('\n')
  const typed = useTypewriter(phase === 'reply' ? fullReply : '', TYPE_SPEED_MS)
  const firstLineLength = REPLY_LINES[0].length
  const renderedFirst = typed.length <= firstLineLength ? typed : REPLY_LINES[0]
  const renderedSecond = typed.length > firstLineLength ? typed.slice(firstLineLength + 1) : ''
  const fullyTyped = typed.length === fullReply.length && phase === 'reply'

  if (phase === 'pulse') {
    return (
      <div className="flex items-center justify-center">
        <span className="block size-2.5 animate-pulse rounded-full bg-foreground/60" />
      </div>
    )
  }

  return (
    <div className="max-w-xl text-center">
      <p className="text-2xl font-semibold leading-snug tracking-tight">
        {renderedFirst}
        {!fullyTyped && renderedSecond.length === 0 ? <Caret /> : null}
      </p>
      {renderedSecond || fullyTyped ? (
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          {renderedSecond}
          {!fullyTyped ? <Caret /> : null}
        </p>
      ) : null}
    </div>
  )
}

function Caret(): React.JSX.Element {
  return (
    <span className="ml-0.5 inline-block h-[1em] w-[2px] -translate-y-[2px] animate-pulse bg-foreground/70 align-middle" />
  )
}

function FlowFooter({
  step,
  canContinueFromCapabilities,
  canFinishShape,
  busy,
  onContinueFromCapabilities,
  onContinueFromShape,
  onCreate
}: {
  step: CreationStep
  canContinueFromCapabilities: boolean
  canFinishShape: boolean
  busy: boolean
  onContinueFromCapabilities: () => void
  onContinueFromShape: () => void
  onCreate: () => void
}): React.JSX.Element {
  const enabled =
    step === 'capabilities'
      ? canContinueFromCapabilities
      : step === 'shape'
        ? canFinishShape
        : !busy
  const handleClick =
    step === 'capabilities'
      ? onContinueFromCapabilities
      : step === 'shape'
        ? onContinueFromShape
        : onCreate
  const ariaLabel =
    step === 'greet' ? 'Create' : step === 'capabilities' ? 'Bring to life' : 'Continue'

  return (
    <div className="flex items-center justify-center px-10 py-5">
      <button
        type="button"
        aria-label={ariaLabel}
        disabled={!enabled}
        onClick={handleClick}
        className={cn(
          'flex size-14 items-center justify-center rounded-full border-2 bg-transparent transition-all duration-200',
          enabled
            ? 'border-foreground text-foreground hover:scale-[1.04] hover:bg-foreground/5 active:scale-95'
            : 'pointer-events-none border-muted-foreground/30 text-muted-foreground/40'
        )}
      >
        {busy ? <Loader2 className="size-5 animate-spin" /> : <ArrowRight className="size-5" />}
      </button>
    </div>
  )
}

function ProgressDots({ step }: { step: CreationStep }): React.JSX.Element {
  const index = step === 'capabilities' ? 1 : step === 'shape' ? 2 : 3
  return (
    <div className="flex items-center justify-center gap-1.5 pt-4">
      {[1, 2, 3].map((dot) => (
        <span
          key={dot}
          className={cn(
            'block size-1.5 rounded-full transition-colors',
            dot <= index ? 'bg-foreground' : 'bg-muted'
          )}
        />
      ))}
    </div>
  )
}

function LibraryDrawer({
  open,
  onClose,
  onPick
}: {
  open: boolean
  onClose: () => void
  onPick: (profile: AgentProfile) => void
}): React.JSX.Element | null {
  const [catalog, setCatalog] = useState<AgentProfileCatalog | null>(null)
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [categoryId, setCategoryId] = useState<string>('')

  useEffect(() => {
    if (!open) return
    let mounted = true
    queueMicrotask(() => {
      if (!mounted) return
      setLoading(true)
      window.ordinus.agents
        .listProfiles()
        .then((next) => {
          if (mounted) setCatalog(next)
        })
        .catch((error) => {
          notify.attention({
            title: 'Could not load library',
            description: error instanceof Error ? error.message : 'Unknown error.'
          })
        })
        .finally(() => {
          if (mounted) setLoading(false)
        })
    })
    return () => {
      mounted = false
    }
  }, [open])

  const filtered = useMemo(() => {
    if (!catalog) return []
    const normalizedQuery = query.trim().toLowerCase()
    return catalog.profiles.filter((profile) => {
      if (categoryId && profile.category !== categoryId) return false
      if (!normalizedQuery) return true
      const haystack =
        `${profile.name} ${profile.role} ${profile.capabilities} ${profile.tags.join(' ')}`.toLowerCase()
      return haystack.includes(normalizedQuery)
    })
  }, [catalog, categoryId, query])

  if (!open) return null

  return (
    <div className="absolute inset-0 z-30 min-w-0 overflow-hidden bg-background motion-safe:animate-in motion-safe:slide-in-from-right motion-safe:duration-300">
      <div className="grid h-full min-w-0 grid-rows-[auto_auto_minmax(0,1fr)]">
        <div className="flex min-w-0 items-center gap-3 border-b px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Back"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
          </button>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Pick a soul</p>
            <p className="truncate text-xs text-muted-foreground">
              A ready-made set of capabilities.
            </p>
          </div>
        </div>

        <div className="min-w-0 overflow-hidden border-b px-5 py-3">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name, role, capability, or tag…"
              className="min-w-0 max-w-full pl-9"
            />
          </div>
          {catalog && catalog.categories.length > 0 ? (
            <div className="ordinus-scrollbar mt-3 flex gap-1.5 overflow-x-auto">
              <CategoryChip
                label="All"
                active={categoryId === ''}
                onClick={() => setCategoryId('')}
              />
              {catalog.categories.map((category) => (
                <CategoryChip
                  key={category.id}
                  label={category.label}
                  active={categoryId === category.id}
                  onClick={() => setCategoryId(category.id)}
                />
              ))}
            </div>
          ) : null}
        </div>

        <div className="ordinus-scrollbar h-full min-h-0 min-w-0 overflow-y-auto overflow-x-hidden">
          <ul className="flex min-w-0 flex-col gap-2 px-5 py-4">
            {loading ? (
              <li className="text-sm text-muted-foreground">Loading…</li>
            ) : filtered.length === 0 ? (
              <li className="text-sm text-muted-foreground">No matches.</li>
            ) : (
              filtered.map((profile) => (
                <li key={profile.id} className="w-full min-w-0">
                  <button
                    type="button"
                    onClick={() => onPick(profile)}
                    className="block w-full min-w-0 overflow-hidden rounded-lg border bg-card p-3 text-left transition-colors hover:border-foreground/30 hover:bg-accent"
                  >
                    <p className="truncate text-sm font-semibold">{profile.name}</p>
                    <p className="mt-1 truncate text-xs font-medium text-foreground/80">
                      {profile.role}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      {profile.capabilities}
                    </p>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </div>
  )
}

function CategoryChip({
  label,
  active,
  onClick
}: {
  label: string
  active: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'shrink-0 rounded-full border px-3 py-1 text-xs transition-colors',
        active
          ? 'border-foreground bg-foreground text-background'
          : 'text-muted-foreground hover:border-foreground/30 hover:text-foreground'
      )}
    >
      {label}
    </button>
  )
}

function useTypewriter(text: string, msPerChar: number): string {
  const [output, setOutput] = useState('')
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setOutput('')
      if (!text) return
      let index = 0
      timerRef.current = setInterval(() => {
        index += 1
        setOutput(text.slice(0, index))
        if (index >= text.length && timerRef.current) {
          clearInterval(timerRef.current)
          timerRef.current = null
        }
      }, msPerChar)
    })
    return () => {
      cancelled = true
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [text, msPerChar])

  return output
}

function deriveRoleFromCapabilities(text: string): string {
  // Take the first short phrase as a fallback role string. Stops at the
  // first sentence boundary or comma, capped at 60 chars. Falls back to
  // "Helper" so step 2's "your X" line still reads naturally.
  const firstSegment = text.split(/[.,!?]/)[0]?.trim() ?? ''
  if (!firstSegment) return 'Helper'
  if (firstSegment.length <= 60) return firstSegment
  return `${firstSegment.slice(0, 57).trimEnd()}…`
}

function uniqueName(seed: string, existing: string[]): string {
  const base = seed.trim() || 'New agent'
  if (!existing.includes(base)) return base
  let suffix = 2
  while (existing.includes(`${base} ${suffix}`)) suffix += 1
  return `${base} ${suffix}`
}
