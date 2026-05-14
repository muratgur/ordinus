import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Bot,
  FileText,
  FolderOpen,
  Info,
  Loader2,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  WandSparkles,
  X
} from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { SelectControl } from '@renderer/components/select-control'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@renderer/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { cn } from '@renderer/lib/utils'
import type {
  Agent,
  AgentDraft,
  AgentProfile,
  AgentProfileCatalog,
  AgentSandbox,
  AgentSkill,
  ProviderId
} from '@shared/contracts'
import { getDefaultModelForProvider, getProviderModelOptions } from '@shared/provider-models'

type AgentStatus = 'ready' | 'needs-attention' | 'offline'
type AgentSection = 'instructions' | 'skills' | 'settings'
type CreateAgentStep = 'catalog' | 'describe' | 'review'
type ReviewBackStep = 'catalog' | 'describe'
type SettingsDraft = {
  name: string
  providerId: ProviderId
  model: string
  sandbox: AgentSandbox
  enabled: boolean
}

const sandboxOptions: Array<{
  value: AgentSandbox
  label: string
  description: string
  badge?: string
}> = [
  {
    value: 'read-only',
    label: 'Read only',
    description: 'Inspect context and propose changes without editing files.'
  },
  {
    value: 'workspace-write',
    label: 'Workspace write',
    description: 'Edit files inside this workspace for normal coding tasks.',
    badge: 'Recommended'
  },
  {
    value: 'full-access',
    label: 'Full access',
    description: 'Allow broader local operations for trusted agents and tasks only.'
  }
]

const sections: Array<{ id: AgentSection; label: string; icon: typeof Bot }> = [
  { id: 'instructions', label: 'Instructions', icon: FileText },
  { id: 'skills', label: 'Skills', icon: Sparkles },
  { id: 'settings', label: 'Settings', icon: Settings2 }
]

export function AgentsScreen(): React.JSX.Element {
  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState<string>('')
  const [activeSection, setActiveSection] = useState<AgentSection>('instructions')
  const [createAgentOpen, setCreateAgentOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? agents[0] ?? null,
    [agents, selectedAgentId]
  )

  useEffect(() => {
    let mounted = true

    async function loadAgents(): Promise<void> {
      try {
        setLoading(true)
        const nextAgents = await window.ordinus.agents.list()
        if (!mounted) return

        setAgents(nextAgents)
        setSelectedAgentId((current) => {
          if (nextAgents.some((agent) => agent.id === current)) {
            return current
          }
          return nextAgents[0]?.id ?? ''
        })
        setError('')
      } catch (loadError) {
        if (!mounted) return
        setError(getErrorMessage(loadError, 'Agents could not be loaded.'))
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    void loadAgents()

    return () => {
      mounted = false
    }
  }, [])

  function handleAgentSaved(nextAgent: Agent): void {
    setAgents((currentAgents) => {
      if (currentAgents.some((agent) => agent.id === nextAgent.id)) {
        return currentAgents.map((agent) => (agent.id === nextAgent.id ? nextAgent : agent))
      }
      return [nextAgent, ...currentAgents]
    })
    setSelectedAgentId(nextAgent.id)
  }

  function handleAgentCreated(nextAgent: Agent): void {
    handleAgentSaved(nextAgent)
    setActiveSection('instructions')
    setCreateAgentOpen(false)
  }

  function handleAgentDeleted(agentId: string): void {
    const nextAgents = agents.filter((agent) => agent.id !== agentId)

    setAgents(nextAgents)
    setSelectedAgentId((current) => {
      if (current !== agentId) {
        return current
      }
      return nextAgents[0]?.id ?? ''
    })
    setActiveSection('settings')
  }

  return (
    <div className="grid min-h-[calc(100vh-7rem)] gap-4 py-6 xl:grid-cols-[280px_minmax(0,1fr)]">
      <AgentLibrary
        agents={agents}
        loading={loading}
        selectedAgentId={selectedAgent?.id ?? ''}
        onCreateAgent={() => setCreateAgentOpen(true)}
        onSelectAgent={setSelectedAgentId}
      />

      <main className="min-w-0">
        <Card className="flex min-h-[760px] flex-col overflow-hidden">
          <div className="border-b bg-accent/50 p-3">
            <div className="flex flex-wrap gap-1 rounded-md border bg-card p-1">
              {sections.map((section) => {
                const Icon = section.icon
                return (
                  <Button
                    key={section.id}
                    type="button"
                    size="sm"
                    variant={activeSection === section.id ? 'secondary' : 'ghost'}
                    className="shrink-0"
                    disabled={!selectedAgent}
                    onClick={() => setActiveSection(section.id)}
                  >
                    <Icon />
                    {section.label}
                  </Button>
                )
              })}
            </div>
          </div>

          <CardContent className="flex-1 p-0">
            {error ? (
              <EmptyState icon={<Bot />} title="Agents unavailable" detail={error} />
            ) : selectedAgent ? (
              <AgentDetail
                agent={selectedAgent}
                agents={agents}
                activeSection={activeSection}
                onAgentSaved={handleAgentSaved}
                onAgentDeleted={handleAgentDeleted}
              />
            ) : (
              <EmptyState
                icon={<Bot />}
                title={loading ? 'Loading agents' : 'No agents yet'}
                detail={
                  loading
                    ? 'Agent records are being loaded from local storage.'
                    : 'Create an agent to define its role, instructions, and runtime settings.'
                }
              />
            )}
          </CardContent>
        </Card>
      </main>

      <CreateAgentDialog
        agents={agents}
        open={createAgentOpen}
        onAgentCreated={handleAgentCreated}
        onOpenChange={setCreateAgentOpen}
      />
    </div>
  )
}

function AgentLibrary({
  agents,
  loading,
  selectedAgentId,
  onCreateAgent,
  onSelectAgent
}: {
  agents: Agent[]
  loading: boolean
  selectedAgentId: string
  onCreateAgent: () => void
  onSelectAgent: (agentId: string) => void
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const filteredAgents = agents.filter((agent) => {
    const value = `${agent.name} ${agent.role}`.toLowerCase()
    return value.includes(query.trim().toLowerCase())
  })

  return (
    <aside className="min-w-0">
      <Card className="sticky top-32 overflow-hidden">
        <CardHeader className="border-b">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2">
                <Bot className="size-4 text-primary" />
                Agents
              </CardTitle>
              <CardDescription>
                {loading ? 'Loading' : `${agents.length} agent${agents.length === 1 ? '' : 's'}`}
              </CardDescription>
            </div>
            <Button size="icon" aria-label="Create agent" onClick={onCreateAgent}>
              <Plus />
            </Button>
          </div>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search agents"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </CardHeader>

        <CardContent className="grid gap-2 p-3">
          {filteredAgents.map((agent) => (
            <button
              key={agent.id}
              type="button"
              className={cn(
                'grid min-w-0 gap-2 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                selectedAgentId === agent.id && 'border-primary/40 bg-primary-soft'
              )}
              onClick={() => onSelectAgent(agent.id)}
            >
              <div className="flex min-w-0 items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{agent.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{agent.role}</p>
                </div>
                <StatusDot status={getAgentStatus(agent)} />
              </div>
            </button>
          ))}

          {!loading && filteredAgents.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-accent p-4 text-sm text-muted-foreground">
              {agents.length === 0 ? 'No agents yet.' : 'No agents match this search.'}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </aside>
  )
}

function AgentDetail({
  agent,
  agents,
  activeSection,
  onAgentSaved,
  onAgentDeleted
}: {
  agent: Agent
  agents: Agent[]
  activeSection: AgentSection
  onAgentSaved: (agent: Agent) => void
  onAgentDeleted: (agentId: string) => void
}): React.JSX.Element {
  if (activeSection === 'instructions') {
    return <InstructionsPanel key={agent.id} agent={agent} onAgentSaved={onAgentSaved} />
  }

  if (activeSection === 'skills') {
    return <SkillsPanel key={agent.id} agent={agent} />
  }

  if (activeSection === 'settings') {
    return (
      <SettingsPanel
        key={agent.id}
        agent={agent}
        agents={agents}
        onAgentSaved={onAgentSaved}
        onAgentDeleted={onAgentDeleted}
      />
    )
  }

  return (
    <div className="p-5">
      <p className="text-sm text-muted-foreground">Select an agent section.</p>
    </div>
  )
}

function CreateAgentDialog({
  agents,
  open,
  onAgentCreated,
  onOpenChange
}: {
  agents: Agent[]
  open: boolean
  onAgentCreated: (agent: Agent) => void
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const [step, setStep] = useState<CreateAgentStep>('catalog')
  const [reviewBackStep, setReviewBackStep] = useState<ReviewBackStep>('catalog')
  const [catalog, setCatalog] = useState<AgentProfileCatalog | null>(null)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogQuery, setCatalogQuery] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState('all')
  const [selectedProfileId, setSelectedProfileId] = useState('')
  const [intent, setIntent] = useState('')
  const [draft, setDraft] = useState<AgentDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const canDraft = intent.trim().length >= 12 && !busy
  const nameIssue = draft ? getAgentNameIssue(draft.name, '', agents, '') : null
  const canCreate =
    Boolean(
      draft?.name.trim() && draft.role.trim() && draft.instructions.trim() && draft.model.trim()
    ) &&
    !nameIssue &&
    !busy
  const selectedProfile =
    catalog?.profiles.find((profile) => profile.id === selectedProfileId) ?? null

  useEffect(() => {
    if (!open) {
      return
    }

    let mounted = true

    async function loadCatalog(): Promise<void> {
      try {
        setCatalogLoading(true)
        setError('')
        const nextCatalog = await window.ordinus.agents.listProfiles()
        if (!mounted) return

        setCatalog(nextCatalog)
        setSelectedProfileId('')
      } catch (loadError) {
        if (mounted) {
          setError(getErrorMessage(loadError, 'Agent profiles could not be loaded.'))
        }
      } finally {
        if (mounted) {
          setCatalogLoading(false)
        }
      }
    }

    void loadCatalog()

    return () => {
      mounted = false
    }
  }, [open])

  function resetDialog(): void {
    setStep('catalog')
    setReviewBackStep('catalog')
    setCatalogQuery('')
    setSelectedCategoryId('all')
    setSelectedProfileId('')
    setIntent('')
    setDraft(null)
    setBusy(false)
    setError('')
  }

  function handleOpenChange(nextOpen: boolean): void {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      resetDialog()
    }
  }

  function updateDraft(next: Partial<AgentDraft>): void {
    setDraft((current) => (current ? { ...current, ...next } : current))
  }

  function setReviewDraft(nextDraft: AgentDraft, backStep: ReviewBackStep): void {
    setDraft({
      ...nextDraft,
      model: getSupportedModelOrDefault(nextDraft.providerId, nextDraft.model),
      enabled: nextDraft.enabled ?? true
    })
    setReviewBackStep(backStep)
    setStep('review')
  }

  async function handleUseProfile(profileId: string): Promise<void> {
    try {
      setBusy(true)
      setError('')
      const nextDraft = await window.ordinus.agents.draftFromProfile({ profileId })
      setReviewDraft(nextDraft, 'catalog')
    } catch (draftError) {
      setError(getErrorMessage(draftError, 'Agent draft could not be created from this profile.'))
    } finally {
      setBusy(false)
    }
  }

  async function handleBlankAgent(): Promise<void> {
    try {
      setBusy(true)
      setError('')
      const nextDraft = await window.ordinus.agents.draftBlank()
      setReviewDraft(nextDraft, 'catalog')
    } catch (draftError) {
      setError(getErrorMessage(draftError, 'Blank agent draft could not be created.'))
    } finally {
      setBusy(false)
    }
  }

  async function handleDraftAgent(): Promise<void> {
    if (!canDraft) {
      return
    }

    try {
      setBusy(true)
      setError('')
      const nextDraft = await window.ordinus.agents.draftFromIntent({
        requestedWork: intent,
        sandbox: 'workspace-write'
      })
      setReviewDraft(nextDraft, 'describe')
    } catch (draftError) {
      setError(getErrorMessage(draftError, 'Agent draft could not be generated.'))
    } finally {
      setBusy(false)
    }
  }

  function handleProviderChange(providerId: ProviderId): void {
    updateDraft({ providerId, model: getDefaultModelForProvider(providerId) })
  }

  async function handleCreateAgent(): Promise<void> {
    if (!draft || !canCreate) {
      return
    }

    try {
      setBusy(true)
      setError('')
      const agent = await window.ordinus.agents.create({
        ...draft,
        name: draft.name.trim(),
        role: draft.role.trim(),
        model: draft.model.trim(),
        enabled: draft.enabled
      })
      onAgentCreated(agent)
      resetDialog()
    } catch (createError) {
      setError(getErrorMessage(createError, 'Agent could not be created.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="grid h-[min(860px,calc(100vh-2rem))] max-w-6xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0">
        <div className="border-b p-5 pr-12">
          <DialogHeader>
            <DialogTitle>Add agent</DialogTitle>
            <DialogDescription>{getCreateAgentDialogDescription(step)}</DialogDescription>
          </DialogHeader>
        </div>

        {step === 'catalog' ? (
          <ProfileCatalogStep
            busy={busy}
            catalog={catalog}
            categoryId={selectedCategoryId}
            error={error}
            loading={catalogLoading}
            query={catalogQuery}
            selectedProfile={selectedProfile}
            selectedProfileId={selectedProfileId}
            onBlankAgent={() => void handleBlankAgent()}
            onCategoryChange={setSelectedCategoryId}
            onCloseProfile={() => setSelectedProfileId('')}
            onDescribeWithAi={() => {
              setError('')
              setStep('describe')
            }}
            onProfileSelect={setSelectedProfileId}
            onQueryChange={setCatalogQuery}
            onUseProfile={(profileId) => void handleUseProfile(profileId)}
          />
        ) : step === 'describe' ? (
          <ScrollArea className="h-full min-h-0">
            <div className="grid gap-3 p-5">
              <label className="grid gap-2">
                <span className="text-sm font-semibold">What should this agent help with?</span>
                <textarea
                  className="ordinus-scrollbar min-h-56 resize-y rounded-lg border bg-card p-4 text-sm leading-6 text-foreground shadow-none outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  placeholder="Example: I need an agent that reviews pull requests, checks missing tests, and flags risky changes before merge."
                  value={intent}
                  onChange={(event) => setIntent(event.target.value)}
                />
              </label>
              {error ? <InlineError message={error} /> : null}
            </div>
          </ScrollArea>
        ) : draft ? (
          <ReviewAgentStep
            draft={draft}
            error={error}
            nameIssue={nameIssue}
            onDraftChange={updateDraft}
            onProviderChange={handleProviderChange}
          />
        ) : null}

        <DialogFooter className="border-t bg-accent/50 p-4">
          {step === 'catalog' ? (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
          ) : step === 'describe' ? (
            <>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setError('')
                  setStep('catalog')
                }}
              >
                <ArrowLeft />
                Back
              </Button>
              <Button type="button" disabled={!canDraft} onClick={() => void handleDraftAgent()}>
                {busy ? <Loader2 className="animate-spin" /> : <WandSparkles />}
                Review draft
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setError('')
                  setStep(reviewBackStep)
                }}
              >
                <ArrowLeft />
                Back
              </Button>
              <Button type="button" disabled={!canCreate} onClick={() => void handleCreateAgent()}>
                {busy ? <Loader2 className="animate-spin" /> : null}
                Create agent
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ProfileCatalogStep({
  busy,
  catalog,
  categoryId,
  error,
  loading,
  query,
  selectedProfile,
  selectedProfileId,
  onBlankAgent,
  onCategoryChange,
  onCloseProfile,
  onDescribeWithAi,
  onProfileSelect,
  onQueryChange,
  onUseProfile
}: {
  busy: boolean
  catalog: AgentProfileCatalog | null
  categoryId: string
  error: string
  loading: boolean
  query: string
  selectedProfile: AgentProfile | null
  selectedProfileId: string
  onBlankAgent: () => void
  onCategoryChange: (categoryId: string) => void
  onCloseProfile: () => void
  onDescribeWithAi: () => void
  onProfileSelect: (profileId: string) => void
  onQueryChange: (query: string) => void
  onUseProfile: (profileId: string) => void
}): React.JSX.Element {
  const profiles = getVisibleProfiles(catalog, categoryId, query)

  return (
    <div className="relative grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
      <div className="grid gap-3 border-b bg-accent/30 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search profiles"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={onDescribeWithAi}>
            <WandSparkles />
            Describe with AI
          </Button>
          <Button type="button" variant="outline" disabled={busy} onClick={onBlankAgent}>
            <Plus />
            Blank agent
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="min-w-0 border-b p-3 lg:border-b-0 lg:border-r">
          <ScrollArea className="max-h-40 lg:h-full lg:max-h-none">
            <div className="flex gap-2 lg:grid">
              <CategoryButton
                active={categoryId === 'all'}
                count={catalog?.profiles.length ?? 0}
                label="All profiles"
                onClick={() => onCategoryChange('all')}
              />
              {catalog?.categories.map((category) => (
                <CategoryButton
                  key={category.id}
                  active={categoryId === category.id}
                  count={category.count}
                  label={category.label}
                  onClick={() => onCategoryChange(category.id)}
                />
              ))}
            </div>
          </ScrollArea>
        </aside>

        <ScrollArea className="h-full min-h-0">
          <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
            {error ? (
              <div className="col-span-full">
                <InlineError message={error} />
              </div>
            ) : null}

            {profiles.map((profile) => (
              <ProfileCard
                key={profile.id}
                catalog={catalog}
                profile={profile}
                selected={selectedProfileId === profile.id}
                onSelect={onProfileSelect}
              />
            ))}

            {loading ? (
              <div className="col-span-full grid min-h-48 place-items-center rounded-lg border border-dashed bg-accent p-6 text-center text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" />
                  Loading profiles
                </span>
              </div>
            ) : null}

            {!loading && profiles.length === 0 ? (
              <EmptyState
                icon={<BookOpen />}
                title={catalog?.profiles.length ? 'No profiles match this search' : 'No profiles'}
                detail={
                  catalog?.profiles.length
                    ? 'Try another search term or category.'
                    : 'Built-in profiles are not available in this build.'
                }
              />
            ) : null}
          </div>
        </ScrollArea>
      </div>

      <ProfileDetailDrawer
        busy={busy}
        error={error}
        open={Boolean(selectedProfile)}
        profile={selectedProfile}
        onClose={onCloseProfile}
        onUseProfile={onUseProfile}
      />
    </div>
  )
}

function ProfileCard({
  catalog,
  profile,
  selected,
  onSelect
}: {
  catalog: AgentProfileCatalog | null
  profile: AgentProfile
  selected: boolean
  onSelect: (profileId: string) => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={cn(
        'grid min-h-[172px] gap-3 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected && 'border-primary/50 bg-primary-soft/50'
      )}
      onClick={() => onSelect(profile.id)}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="line-clamp-2 text-sm font-semibold leading-5">{profile.name}</p>
          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{profile.role}</p>
        </div>
        {profile.recommended ? <Badge variant="secondary">Recommended</Badge> : null}
      </div>
      <p className="line-clamp-3 text-xs leading-5 text-muted-foreground">{profile.summary}</p>
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="outline">{getCategoryLabel(catalog, profile.category)}</Badge>
        {profile.tags.slice(0, 2).map((tag) => (
          <Badge key={tag} variant="outline">
            {tag}
          </Badge>
        ))}
      </div>
    </button>
  )
}

function CategoryButton({
  active,
  count,
  label,
  onClick
}: {
  active: boolean
  count: number
  label: string
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={cn(
        'flex h-10 min-w-36 shrink-0 items-center justify-between gap-3 rounded-md px-3 text-left text-sm transition-colors lg:w-full',
        active
          ? 'bg-primary-soft text-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      )}
      onClick={onClick}
    >
      <span className="truncate">{label}</span>
      <span className="shrink-0 text-xs">{count}</span>
    </button>
  )
}

function ProfileDetailDrawer({
  busy,
  error,
  open,
  profile,
  onClose,
  onUseProfile
}: {
  busy: boolean
  error: string
  open: boolean
  profile: AgentProfile | null
  onClose: () => void
  onUseProfile: (profileId: string) => void
}): React.JSX.Element {
  function handleUseProfile(): void {
    if (!profile) {
      return
    }

    onUseProfile(profile.id)
  }

  return (
    <div
      className={cn(
        'absolute inset-0 z-10 bg-background/45 transition-opacity',
        open ? 'opacity-100' : 'pointer-events-none opacity-0'
      )}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close profile details"
        onClick={onClose}
      />
      <aside
        className={cn(
          'absolute bottom-0 right-0 top-0 grid w-full max-w-xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden border-l bg-card shadow-lg transition-transform duration-200 sm:w-[520px]',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        <div className="grid gap-2 border-b p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-base font-semibold leading-6">{profile?.name ?? 'Profile'}</p>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">{profile?.role ?? ''}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {profile?.recommended ? <Badge variant="secondary">Recommended</Badge> : null}
              <Button type="button" variant="ghost" size="icon" onClick={onClose}>
                <span className="sr-only">Close profile details</span>
                <X />
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {profile?.tags.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>
        </div>

        <ScrollArea className="h-full min-h-0">
          <div className="whitespace-pre-wrap p-4 font-mono text-xs leading-5 text-muted-foreground">
            {profile?.instructions ?? ''}
          </div>
        </ScrollArea>

        <div className="grid gap-3 border-t bg-accent/50 p-4">
          {error ? <InlineError message={error} /> : null}
          <Button
            type="button"
            disabled={busy || !profile}
            onClick={handleUseProfile}
          >
            {busy ? <Loader2 className="animate-spin" /> : <BookOpen />}
            Use profile
          </Button>
        </div>
      </aside>
    </div>
  )
}

function ReviewAgentStep({
  draft,
  error,
  nameIssue,
  onDraftChange,
  onProviderChange
}: {
  draft: AgentDraft
  error: string
  nameIssue: string | null
  onDraftChange: (draft: Partial<AgentDraft>) => void
  onProviderChange: (providerId: ProviderId) => void
}): React.JSX.Element {
  return (
    <ScrollArea className="h-full min-h-0">
      <div className="p-5">
        <div className="grid gap-4">
          <div className="grid gap-2 rounded-lg border bg-accent p-4">
            <p className="text-xs font-medium text-muted-foreground">Requested work</p>
            <p className="text-base font-semibold leading-6">{draft.requestedWork}</p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="Agent name">
              <Input
                value={draft.name}
                onChange={(event) => onDraftChange({ name: event.target.value })}
              />
            </FormField>
            <FormField label="Role">
              <Input
                value={draft.role}
                onChange={(event) => onDraftChange({ role: event.target.value })}
              />
            </FormField>
          </div>
          <p
            className={cn(
              'text-xs leading-5 text-muted-foreground',
              nameIssue && 'text-status-attention'
            )}
          >
            {nameIssue ?? 'Agent names must be distinct so assignment lists stay clear.'}
          </p>

          <label className="grid gap-2">
            <span className="text-xs font-medium text-muted-foreground">Instructions</span>
            <textarea
              className="ordinus-scrollbar min-h-[300px] resize-y rounded-lg border bg-card p-4 font-mono text-xs leading-5 text-foreground shadow-none outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              spellCheck={false}
              value={draft.instructions}
              onChange={(event) => onDraftChange({ instructions: event.target.value })}
            />
          </label>

          <section className="grid gap-4 rounded-lg border bg-card p-4">
            <div className="grid gap-1">
              <p className="text-sm font-semibold">Runtime</p>
              <p className="text-xs leading-5 text-muted-foreground">
                Choose the CLI and model this agent uses when it runs.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <FormField label="Provider CLI">
                <SelectControl
                  value={draft.providerId}
                  onChange={(value) => onProviderChange(value as ProviderId)}
                >
                  <option value="codex">Codex</option>
                  <option value="claude">Claude</option>
                  <option value="gemini">Gemini</option>
                </SelectControl>
              </FormField>
              <ModelField
                providerId={draft.providerId}
                model={draft.model}
                onChange={(model) => onDraftChange({ model })}
              />
            </div>
            <RuntimeModelSummary providerId={draft.providerId} model={draft.model} />
            <SandboxField
              name="create-agent-sandbox"
              value={draft.sandbox}
              onChange={(sandbox) => onDraftChange({ sandbox })}
            />
          </section>

          <section className="grid gap-3 rounded-lg border bg-card p-4">
            <p className="text-sm font-semibold">Lifecycle</p>
            <label className="flex items-center justify-between gap-3 rounded-md border bg-accent px-3 py-2">
              <span className="min-w-0">
                <span className="block text-sm font-medium">Enabled</span>
                <span className="block truncate text-xs text-muted-foreground">
                  Agent can be assigned work after creation
                </span>
              </span>
              <input
                type="checkbox"
                className="size-4 shrink-0 accent-primary"
                checked={draft.enabled}
                onChange={(event) => onDraftChange({ enabled: event.target.checked })}
              />
            </label>
          </section>

          {error ? <InlineError message={error} /> : null}
        </div>
      </div>
    </ScrollArea>
  )
}

function SkillsPanel({ agent }: { agent: Agent }): React.JSX.Element {
  const [skills, setSkills] = useState<AgentSkill[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [skillName, setSkillName] = useState('')
  const [skillDescription, setSkillDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true

    async function loadSkills(): Promise<void> {
      try {
        setLoading(true)
        setError('')
        const nextSkills = await window.ordinus.agents.listSkills({ agentId: agent.id })
        if (mounted) {
          setSkills(nextSkills)
        }
      } catch (loadError) {
        if (mounted) {
          setError(getErrorMessage(loadError, 'Skills could not be loaded.'))
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    void loadSkills()

    return () => {
      mounted = false
    }
  }, [agent.id])

  async function handleCreateSkill(): Promise<void> {
    if (!skillName.trim() || saving) {
      return
    }

    try {
      setSaving(true)
      setError('')
      const skill = await window.ordinus.agents.createSkill({
        agentId: agent.id,
        name: skillName,
        description: skillDescription
      })
      setSkills((current) =>
        [...current, skill].sort((left, right) => left.name.localeCompare(right.name))
      )
      setSkillName('')
      setSkillDescription('')
      setCreateOpen(false)
    } catch (createError) {
      setError(getErrorMessage(createError, 'Skill could not be created.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-3 p-5">
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 px-2.5 text-xs"
          onClick={() => setCreateOpen(true)}
        >
          <Plus />
          Create skill
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-8 px-2.5 text-xs" disabled>
          <FolderOpen />
          Import skill
        </Button>
      </div>

      {error ? <InlineError message={error} /> : null}

      {skills.length > 0 ? (
        <div className="grid gap-2">
          {skills.map((skill) => (
            <div key={skill.id} className="grid gap-2 rounded-lg border bg-card p-4">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{skill.name}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {skill.relativePath}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {new Date(skill.updatedAt).toLocaleDateString()}
                </span>
              </div>
              {skill.description ? (
                <p className="text-sm text-muted-foreground">{skill.description}</p>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Sparkles />}
          title={loading ? 'Loading skills' : 'No skills yet'}
          detail={
            loading
              ? 'Checking this agent skill folder.'
              : 'Create a skill to add reusable instructions for this agent.'
          }
        />
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create skill</DialogTitle>
            <DialogDescription>Add a SKILL.md file to this agent skill folder.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <FormField label="Skill name">
              <Input
                value={skillName}
                onChange={(event) => setSkillName(event.target.value)}
                placeholder="Strategy review"
              />
            </FormField>
            <label className="grid gap-2">
              <span className="text-xs font-medium text-muted-foreground">Description</span>
              <textarea
                className="ordinus-scrollbar min-h-28 resize-y rounded-lg border bg-card p-3 text-sm leading-5 text-foreground shadow-none outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                value={skillDescription}
                onChange={(event) => setSkillDescription(event.target.value)}
                placeholder="When should this skill be used?"
              />
            </label>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={saving}
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!skillName.trim() || saving}
              onClick={() => void handleCreateSkill()}
            >
              {saving ? <Loader2 className="animate-spin" /> : null}
              Create skill
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function InstructionsPanel({
  agent,
  onAgentSaved
}: {
  agent: Agent
  onAgentSaved: (agent: Agent) => void
}): React.JSX.Element {
  const [savedInstructions, setSavedInstructions] = useState(agent.instructions)
  const [instructions, setInstructions] = useState(agent.instructions)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const dirty = instructions !== savedInstructions

  async function handleSave(): Promise<void> {
    if (!dirty) {
      return
    }

    try {
      setSaving(true)
      setError('')
      const nextAgent = await window.ordinus.agents.updateInstructions({
        id: agent.id,
        instructions
      })
      setSavedInstructions(nextAgent.instructions)
      setInstructions(nextAgent.instructions)
      onAgentSaved(nextAgent)
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Instructions could not be saved.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-4 p-5">
      <div className="flex flex-col gap-3 rounded-lg border bg-accent px-3 py-2.5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="truncate font-mono text-xs text-muted-foreground">
            agents/{agent.id}/AGENTS.md
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {dirty ? 'Unsaved changes' : 'Saved'}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2.5 text-xs"
            disabled={!dirty || saving}
            onClick={() => setInstructions(savedInstructions)}
          >
            Discard
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8 px-2.5 text-xs"
            disabled={!dirty || saving}
            onClick={() => void handleSave()}
          >
            {saving ? <Loader2 className="animate-spin" /> : null}
            Save
          </Button>
        </div>
      </div>

      {error ? <InlineError message={error} /> : null}

      <textarea
        aria-label={`${agent.name} instructions`}
        className="ordinus-scrollbar min-h-[480px] resize-y rounded-lg border bg-card p-4 font-mono text-xs leading-5 text-foreground shadow-none outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        placeholder={`Describe what this agent is responsible for.

Include:
- Role
- Scope
- What it should avoid
- How it should verify work`}
        spellCheck={false}
        value={instructions}
        onChange={(event) => setInstructions(event.target.value)}
      />
    </div>
  )
}

function SettingsPanel({
  agent,
  agents,
  onAgentSaved,
  onAgentDeleted
}: {
  agent: Agent
  agents: Agent[]
  onAgentSaved: (agent: Agent) => void
  onAgentDeleted: (agentId: string) => void
}): React.JSX.Element {
  const initialSettings = getPersistedSettingsDraft(agent)
  const [savedSettings, setSavedSettings] = useState<SettingsDraft>(initialSettings)
  const [draft, setDraft] = useState<SettingsDraft>(getEditableSettingsDraft(initialSettings))
  const [saving, setSaving] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const dirty = isSettingsDirty(draft, savedSettings)
  const nameIssue = getAgentNameIssue(draft.name, savedSettings.name, agents, agent.id)
  const canSave = dirty && Boolean(draft.model.trim()) && !nameIssue && !saving

  function updateDraft(next: Partial<SettingsDraft>): void {
    setDraft((current) => {
      const merged = { ...current, ...next }
      if (next.providerId) {
        merged.model = getDefaultModelForProvider(next.providerId)
      }
      return merged
    })
  }

  async function handleSave(): Promise<void> {
    if (!canSave) {
      return
    }

    try {
      setSaving(true)
      setError('')
      const nextAgent = await window.ordinus.agents.updateSettings({
        id: agent.id,
        ...draft,
        name: draft.name.trim(),
        model: draft.model.trim()
      })
      const nextSettings = getPersistedSettingsDraft(nextAgent)
      setSavedSettings(nextSettings)
      setDraft(getEditableSettingsDraft(nextSettings))
      onAgentSaved(nextAgent)
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Settings could not be saved.'))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(): Promise<void> {
    try {
      setDeleting(true)
      setError('')
      await window.ordinus.agents.delete({ id: agent.id })
      setDeleteOpen(false)
      onAgentDeleted(agent.id)
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, 'Agent could not be deleted.'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="grid gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-accent px-3 py-2.5">
        <span className="text-xs text-muted-foreground">
          {dirty ? 'Unsaved changes' : 'Settings saved'}
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2.5 text-xs"
            disabled={!dirty || saving}
            onClick={() => setDraft(getEditableSettingsDraft(savedSettings))}
          >
            Discard
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8 px-2.5 text-xs"
            disabled={!canSave}
            onClick={() => void handleSave()}
          >
            {saving ? <Loader2 className="animate-spin" /> : null}
            Save settings
          </Button>
        </div>
      </div>

      {error ? <InlineError message={error} /> : null}

      <section className="grid gap-3 rounded-lg border bg-card p-4">
        <div className="grid gap-1">
          <p className="text-sm font-semibold">Identity</p>
          <p className="text-xs leading-5 text-muted-foreground">
            Rename how this agent appears across Ordinus.
          </p>
        </div>
        <FormField label="Agent name">
          <Input
            maxLength={80}
            value={draft.name}
            onChange={(event) => updateDraft({ name: event.target.value })}
          />
        </FormField>
        <p
          className={cn(
            'text-xs leading-5 text-muted-foreground',
            nameIssue && 'text-status-attention'
          )}
        >
          {nameIssue ?? 'Existing conversations and local files stay linked.'}
        </p>
      </section>

      <section className="grid gap-4 rounded-lg border bg-card p-4">
        <div className="grid gap-1">
          <p className="text-sm font-semibold">Runtime</p>
          <p className="text-xs leading-5 text-muted-foreground">
            Choose the CLI and model this agent uses when it runs.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <FormField label="Provider CLI">
            <SelectControl
              value={draft.providerId}
              onChange={(value) => updateDraft({ providerId: value as ProviderId })}
            >
              <option value="codex">Codex</option>
              <option value="claude">Claude</option>
              <option value="gemini">Gemini</option>
            </SelectControl>
          </FormField>

          <ModelField
            providerId={draft.providerId}
            model={draft.model}
            onChange={(model) => updateDraft({ model })}
          />
        </div>
        <RuntimeModelSummary providerId={draft.providerId} model={draft.model} />
        <SandboxField
          name="agent-settings-sandbox"
          value={draft.sandbox}
          onChange={(sandbox) => updateDraft({ sandbox })}
        />
      </section>

      <section className="grid gap-3 rounded-lg border bg-card p-4">
        <p className="text-sm font-semibold">Lifecycle</p>
        <div className="grid gap-2">
          <label className="flex items-center justify-between gap-3 rounded-md border bg-accent px-3 py-2">
            <span className="min-w-0">
              <span className="block text-sm font-medium">Enabled</span>
              <span className="block truncate text-xs text-muted-foreground">
                Agent can be assigned work
              </span>
            </span>
            <input
              type="checkbox"
              className="size-4 shrink-0 accent-primary"
              checked={draft.enabled}
              onChange={(event) => updateDraft({ enabled: event.target.checked })}
            />
          </label>
          <div className="flex items-center justify-between gap-3 rounded-md border border-status-attention/30 bg-status-attention/10 px-3 py-2">
            <span className="min-w-0">
              <span className="block text-sm font-medium text-status-attention">
                Delete permanently
              </span>
              <span className="block text-xs text-muted-foreground">
                Remove this agent, its conversations, local files, and app logs.
              </span>
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 shrink-0 px-2.5 text-xs"
              disabled={saving || deleting}
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 />
              Delete
            </Button>
          </div>
        </div>
      </section>

      <DeleteAgentDialog
        agentName={agent.name}
        deleting={deleting}
        open={deleteOpen}
        onDelete={() => void handleDelete()}
        onOpenChange={setDeleteOpen}
      />
    </div>
  )
}

function DeleteAgentDialog({
  agentName,
  deleting,
  open,
  onDelete,
  onOpenChange
}: {
  agentName: string
  deleting: boolean
  open: boolean
  onDelete: () => void
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-status-attention" />
            Delete agent
          </DialogTitle>
          <DialogDescription>
            This removes {agentName}, related conversations, local files, and app logs. This cannot
            be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            disabled={deleting}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={deleting} onClick={onDelete}>
            {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
            Delete permanently
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function getCreateAgentDialogDescription(step: CreateAgentStep): string {
  if (step === 'describe') {
    return 'Describe the role you need. Ordinus will prepare a draft for review before saving.'
  }

  if (step === 'review') {
    return 'Review and adjust the agent before saving it to this workspace.'
  }

  return 'Choose a profile, describe a role with AI, or start from blank. Nothing is saved until review.'
}

function getVisibleProfiles(
  catalog: AgentProfileCatalog | null,
  categoryId: string,
  query: string
): AgentProfile[] {
  const normalizedQuery = query.trim().toLocaleLowerCase()

  return (
    catalog?.profiles.filter((profile) => {
      const categoryMatches = categoryId === 'all' || profile.category === categoryId
      const queryMatches =
        !normalizedQuery || getProfileSearchText(profile).includes(normalizedQuery)

      return categoryMatches && queryMatches
    }) ?? []
  )
}

function getProfileSearchText(profile: AgentProfile): string {
  return `${profile.name} ${profile.role} ${profile.summary} ${profile.tags.join(' ')}`.toLocaleLowerCase()
}

function StatusDot({ status }: { status: AgentStatus }): React.JSX.Element {
  return (
    <span
      className={cn(
        'mt-1 size-2.5 shrink-0 rounded-full',
        status === 'ready' && 'bg-status-completed',
        status === 'needs-attention' && 'bg-status-attention',
        status === 'offline' && 'bg-muted-foreground'
      )}
    />
  )
}

function FormField({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <label className="grid gap-2 text-sm">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

function RuntimeModelSummary({
  providerId,
  model
}: {
  providerId: ProviderId
  model: string
}): React.JSX.Element {
  return (
    <div className="flex min-h-10 items-start gap-2 rounded-md border bg-accent px-3 py-2 text-xs leading-5 text-muted-foreground">
      <Info className="mt-0.5 size-3.5 shrink-0" />
      <p>
        <span className="font-medium text-foreground">
          {getSelectedModelLabel(providerId, model)}
        </span>
        <span> - {getModelDescription(providerId, model)}</span>
      </p>
    </div>
  )
}

function SandboxField({
  name,
  value,
  onChange
}: {
  name: string
  value: AgentSandbox
  onChange: (value: AgentSandbox) => void
}): React.JSX.Element {
  return (
    <div className="grid gap-3 border-t pt-4">
      <div className="grid gap-1">
        <p className="text-sm font-semibold">Sandbox</p>
        <p className="text-xs leading-5 text-muted-foreground">
          Control what this agent is allowed to do locally.
        </p>
      </div>
      <div className="grid gap-2 lg:grid-cols-3">
        {sandboxOptions.map((option) => {
          const selected = option.value === value
          const fullAccess = option.value === 'full-access'

          return (
            <label
              key={option.value}
              className={cn(
                'grid min-h-[112px] cursor-pointer gap-2 rounded-md border bg-card p-3 text-sm transition-colors hover:bg-accent',
                selected && 'border-primary bg-primary-soft/60',
                selected && fullAccess && 'border-status-attention bg-status-attention/10'
              )}
            >
              <span className="flex items-start gap-2">
                <input
                  type="radio"
                  name={name}
                  className="mt-0.5 size-4 shrink-0 accent-primary"
                  checked={selected}
                  onChange={() => onChange(option.value)}
                />
                <span className="grid min-w-0 gap-1">
                  <span className="font-medium text-foreground">{option.label}</span>
                  <span
                    className={cn(
                      'text-xs leading-5 text-muted-foreground',
                      selected && fullAccess && 'text-status-attention'
                    )}
                  >
                    {option.description}
                  </span>
                  {option.badge ? (
                    <span className="w-fit rounded-full border bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {option.badge}
                    </span>
                  ) : null}
                </span>
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}

function EmptyState({
  icon,
  title,
  detail
}: {
  icon: React.ReactNode
  title: string
  detail: string
}): React.JSX.Element {
  return (
    <div className="grid min-h-48 place-items-center rounded-lg border border-dashed bg-accent p-6 text-center">
      <div className="grid max-w-sm gap-2">
        <span className="mx-auto text-muted-foreground [&_svg]:size-7">{icon}</span>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground">{detail}</p>
      </div>
    </div>
  )
}

function InlineError({ message }: { message: string }): React.JSX.Element {
  return (
    <p className="rounded-md border border-status-attention/30 bg-status-attention/10 px-3 py-2 text-xs text-status-attention">
      {message}
    </p>
  )
}

function getAgentStatus(agent: Agent): AgentStatus {
  if (!agent.enabled) {
    return 'offline'
  }
  if (!agent.instructions.trim()) {
    return 'needs-attention'
  }
  return 'ready'
}

function getPersistedSettingsDraft(agent: Agent): SettingsDraft {
  return {
    name: agent.name,
    providerId: agent.providerId,
    model: agent.model,
    sandbox: agent.sandbox,
    enabled: agent.enabled
  }
}

function getEditableSettingsDraft(settings: SettingsDraft): SettingsDraft {
  return {
    ...settings,
    model: getSupportedModelOrDefault(settings.providerId, settings.model)
  }
}

function isSettingsDirty(draft: SettingsDraft, savedSettings: SettingsDraft): boolean {
  return (
    draft.name !== savedSettings.name ||
    draft.providerId !== savedSettings.providerId ||
    draft.model !== savedSettings.model ||
    draft.sandbox !== savedSettings.sandbox ||
    draft.enabled !== savedSettings.enabled
  )
}

function ModelField({
  providerId,
  model,
  onChange
}: {
  providerId: ProviderId
  model: string
  onChange: (model: string) => void
}): React.JSX.Element {
  const modelOptions = getProviderModelOptions(providerId)
  const selectValue = getSupportedModelOrDefault(providerId, model)

  return (
    <FormField label="Model">
      <SelectControl value={selectValue} onChange={onChange}>
        {modelOptions.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </SelectControl>
    </FormField>
  )
}

function getAgentNameIssue(
  name: string,
  savedName: string,
  agents: Agent[],
  currentAgentId: string
): string | null {
  const trimmedName = name.trim()
  if (!trimmedName) {
    return 'Agent name is required.'
  }

  if (trimmedName.length > 80) {
    return 'Agent name must be 80 characters or fewer.'
  }

  if (normalizeAgentName(trimmedName) === normalizeAgentName(savedName)) {
    return null
  }

  const duplicateAgent = agents.some(
    (agent) =>
      agent.id !== currentAgentId &&
      normalizeAgentName(agent.name) === normalizeAgentName(trimmedName)
  )
  return duplicateAgent ? 'Another agent already uses this name.' : null
}

function normalizeAgentName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

function getCategoryLabel(catalog: AgentProfileCatalog | null, categoryId: string): string {
  return catalog?.categories.find((category) => category.id === categoryId)?.label ?? categoryId
}

function getSelectedModelLabel(providerId: ProviderId, model: string): string {
  const selectedModel = getSupportedModelOrDefault(providerId, model)
  return (
    getProviderModelOptions(providerId).find((option) => option.id === selectedModel)?.label ??
    model
  )
}

function getModelDescription(providerId: ProviderId, model: string): string {
  const selectedModel = getSupportedModelOrDefault(providerId, model)
  return (
    getProviderModelOptions(providerId).find((option) => option.id === selectedModel)
      ?.description ?? 'Use a model id supported by the selected local CLI.'
  )
}

function getSupportedModelOrDefault(providerId: ProviderId, model: string): string {
  return getProviderModelOptions(providerId).some((option) => option.id === model)
    ? model
    : getDefaultModelForProvider(providerId)
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
