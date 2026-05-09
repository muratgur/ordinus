import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  FileText,
  FolderOpen,
  Loader2,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  WandSparkles
} from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
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
import type { Agent, AgentDraft, AgentSandbox, AgentSkill, ProviderId } from '@shared/contracts'
import { getProviderModelOptions } from '@shared/provider-models'

type AgentStatus = 'ready' | 'needs-attention' | 'offline'
type AgentSection = 'instructions' | 'skills' | 'settings'
type CreateAgentStep = 'describe' | 'review'
type SettingsDraft = {
  providerId: ProviderId
  model: string
  sandbox: AgentSandbox
  workspaceRoot: string
  enabled: boolean
}

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
  activeSection,
  onAgentSaved,
  onAgentDeleted
}: {
  agent: Agent
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
  open,
  onAgentCreated,
  onOpenChange
}: {
  open: boolean
  onAgentCreated: (agent: Agent) => void
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const [step, setStep] = useState<CreateAgentStep>('describe')
  const [intent, setIntent] = useState('')
  const [draft, setDraft] = useState<AgentDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const canDraft = intent.trim().length >= 12 && !busy
  const canCreate =
    Boolean(draft?.name.trim() && draft.role.trim() && draft.instructions.trim()) && !busy

  function resetDialog(): void {
    setStep('describe')
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
      setDraft(nextDraft)
      setStep('review')
    } catch (draftError) {
      setError(getErrorMessage(draftError, 'Agent draft could not be generated.'))
    } finally {
      setBusy(false)
    }
  }

  function handleProviderChange(providerId: ProviderId): void {
    updateDraft({ providerId, model: getModelOptions(providerId)[0] })
  }

  async function handleCreateAgent(): Promise<void> {
    if (!draft || !canCreate) {
      return
    }

    try {
      setBusy(true)
      setError('')
      const agent = await window.ordinus.agents.create(draft)
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
      <DialogContent className="max-w-4xl gap-0 p-0">
        <div className="border-b p-5 pr-12">
          <DialogHeader>
            <DialogTitle>Create agent</DialogTitle>
            <DialogDescription>
              Start with the work this agent should own, then review the generated draft.
            </DialogDescription>
          </DialogHeader>
          <StepProgress step={step} />
        </div>

        {step === 'describe' ? (
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
        ) : draft ? (
          <ScrollArea key={step} className="h-[min(680px,calc(100vh-15rem))]">
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
                      onChange={(event) => updateDraft({ name: event.target.value })}
                    />
                  </FormField>
                  <FormField label="Role">
                    <Input
                      value={draft.role}
                      onChange={(event) => updateDraft({ role: event.target.value })}
                    />
                  </FormField>
                </div>

                <label className="grid gap-2">
                  <span className="text-xs font-medium text-muted-foreground">Instructions</span>
                  <textarea
                    className="ordinus-scrollbar min-h-[300px] resize-y rounded-lg border bg-card p-4 font-mono text-xs leading-5 text-foreground shadow-none outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    spellCheck={false}
                    value={draft.instructions}
                    onChange={(event) => updateDraft({ instructions: event.target.value })}
                  />
                </label>

                <section className="grid gap-3 rounded-lg border bg-card p-4">
                  <p className="text-sm font-semibold">Runtime</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <FormField label="Provider CLI">
                      <SelectControl
                        value={draft.providerId}
                        onChange={(value) => handleProviderChange(value as ProviderId)}
                      >
                        <option value="codex">Codex</option>
                        <option value="claude">Claude</option>
                        <option value="gemini">Gemini</option>
                      </SelectControl>
                    </FormField>
                    <FormField label="Model">
                      <SelectControl
                        value={draft.model}
                        onChange={(value) => updateDraft({ model: value })}
                      >
                        {getModelOptions(draft.providerId).map((model) => (
                          <option key={model} value={model}>
                            {model}
                          </option>
                        ))}
                      </SelectControl>
                    </FormField>
                    <FormField label="Sandbox">
                      <SelectControl
                        value={draft.sandbox}
                        onChange={(value) => updateDraft({ sandbox: value as AgentSandbox })}
                      >
                        <option value="read-only">Read only</option>
                        <option value="workspace-write">Workspace write</option>
                        <option value="full-access">Full access</option>
                      </SelectControl>
                    </FormField>
                    <FormField label="Workspace">
                      <Input
                        value={draft.workspaceRoot}
                        onChange={(event) => updateDraft({ workspaceRoot: event.target.value })}
                      />
                    </FormField>
                  </div>
                </section>
                {error ? <InlineError message={error} /> : null}
              </div>
            </div>
          </ScrollArea>
        ) : null}

        <DialogFooter className="border-t bg-accent/50 p-4">
          {step === 'describe' ? (
            <>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => handleOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="button" disabled={!canDraft} onClick={() => void handleDraftAgent()}>
                {busy ? <Loader2 className="animate-spin" /> : <WandSparkles />}
                Draft agent
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => setStep('describe')}
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
  onAgentSaved,
  onAgentDeleted
}: {
  agent: Agent
  onAgentSaved: (agent: Agent) => void
  onAgentDeleted: (agentId: string) => void
}): React.JSX.Element {
  const initialSettings = getSettingsDraft(agent)
  const [savedSettings, setSavedSettings] = useState<SettingsDraft>(initialSettings)
  const [draft, setDraft] = useState<SettingsDraft>(initialSettings)
  const [saving, setSaving] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const dirty = isSettingsDirty(draft, savedSettings)
  const modelOptions = getModelOptions(draft.providerId)

  function updateDraft(next: Partial<SettingsDraft>): void {
    setDraft((current) => {
      const merged = { ...current, ...next }
      if (next.providerId && !getModelOptions(next.providerId).includes(merged.model)) {
        merged.model = getModelOptions(next.providerId)[0]
      }
      return merged
    })
  }

  async function handleSave(): Promise<void> {
    if (!dirty) {
      return
    }

    try {
      setSaving(true)
      setError('')
      const nextAgent = await window.ordinus.agents.updateSettings({
        id: agent.id,
        ...draft
      })
      const nextSettings = getSettingsDraft(nextAgent)
      setSavedSettings(nextSettings)
      setDraft(nextSettings)
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
            onClick={() => setDraft(savedSettings)}
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
            Save settings
          </Button>
        </div>
      </div>

      {error ? <InlineError message={error} /> : null}

      <section className="grid gap-4 rounded-lg border bg-card p-4">
        <p className="text-sm font-semibold">Runtime</p>
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

          <FormField label="Model">
            <SelectControl value={draft.model} onChange={(value) => updateDraft({ model: value })}>
              {modelOptions.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </SelectControl>
          </FormField>

          <FormField label="Sandbox">
            <SelectControl
              value={draft.sandbox}
              onChange={(value) => updateDraft({ sandbox: value as AgentSandbox })}
            >
              <option value="read-only">Read only</option>
              <option value="workspace-write">Workspace write</option>
              <option value="full-access">Full access</option>
            </SelectControl>
          </FormField>

          <FormField label="Workspace">
            <Input
              value={draft.workspaceRoot}
              onChange={(event) => updateDraft({ workspaceRoot: event.target.value })}
            />
          </FormField>
        </div>
        {draft.sandbox === 'full-access' ? (
          <p className="rounded-md border border-status-attention/30 bg-status-attention/10 px-3 py-2 text-xs text-status-attention">
            Full access should be reserved for agents that need broad local operations.
          </p>
        ) : null}
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

function StepProgress({ step }: { step: CreateAgentStep }): React.JSX.Element {
  return (
    <div className="mt-4 flex max-w-sm items-center gap-3">
      <StepProgressItem
        active={step === 'describe'}
        complete={step === 'review'}
        label="Describe"
        number={1}
      />
      <span className="h-px flex-1 bg-border" />
      <StepProgressItem active={step === 'review'} label="Review" number={2} />
    </div>
  )
}

function StepProgressItem({
  active,
  complete,
  label,
  number
}: {
  active: boolean
  complete?: boolean
  label: string
  number: number
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex items-center gap-2 text-xs font-medium',
        active && 'text-foreground',
        complete && 'text-status-completed',
        !active && !complete && 'text-muted-foreground'
      )}
    >
      <span
        className={cn(
          'grid size-6 place-items-center rounded-full border text-xs',
          active && 'border-primary bg-primary text-primary-foreground',
          complete && 'border-status-completed bg-status-completed text-primary-foreground',
          !active && !complete && 'bg-card'
        )}
      >
        {number}
      </span>
      <span>{label}</span>
    </div>
  )
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

function getSettingsDraft(agent: Agent): SettingsDraft {
  return {
    providerId: agent.providerId,
    model: agent.model,
    sandbox: agent.sandbox,
    workspaceRoot: agent.workspaceRoot,
    enabled: agent.enabled
  }
}

function isSettingsDirty(draft: SettingsDraft, savedSettings: SettingsDraft): boolean {
  return (
    draft.providerId !== savedSettings.providerId ||
    draft.model !== savedSettings.model ||
    draft.sandbox !== savedSettings.sandbox ||
    draft.workspaceRoot !== savedSettings.workspaceRoot ||
    draft.enabled !== savedSettings.enabled
  )
}

function getModelOptions(providerId: ProviderId): string[] {
  return getProviderModelOptions(providerId).map((option) => option.id)
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
