import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  Bot,
  FileText,
  FolderOpen,
  Plus,
  Search,
  Settings2,
  Sparkles,
  WandSparkles
} from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
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

type AgentStatus = 'ready' | 'needs-attention' | 'offline'
type AgentSection = 'instructions' | 'skills' | 'settings'
type AgentProvider = 'codex' | 'claude' | 'gemini'
type CreateAgentStep = 'describe' | 'review'
type SettingsDraft = {
  provider: AgentProvider
  model: string
  sandbox: string
  workspace: string
  enabled: boolean
}
type CreateAgentDraft = {
  name: string
  role: string
  description: string
  instructions: string
  provider: AgentProvider
  model: string
  sandbox: string
  workspace: string
}

type AgentProfile = {
  id: string
  name: string
  role: string
  description: string
  status: AgentStatus
  enabled: boolean
  provider: AgentProvider
  model: string
  sandbox: string
  workspace: string
  teams: string[]
  skills: Array<{ name: string; status: 'active' | 'draft' | 'invalid'; detail: string }>
  plugins: Array<{ name: string; connected: boolean; detail: string }>
  outputs: Array<{ title: string; path: string; updatedAt: string }>
  readiness: Array<{ label: string; ok: boolean; detail: string }>
}

const agents: AgentProfile[] = [
  {
    id: 'workspace-agent',
    name: 'Workspace Agent',
    role: 'Full-stack coding assistant',
    description: 'Uses Codex in the selected workspace and keeps implementation work small.',
    status: 'ready',
    enabled: true,
    provider: 'codex',
    model: 'default',
    sandbox: 'workspace-write',
    workspace: '.',
    teams: ['Product Delivery'],
    skills: [
      {
        name: 'repo-orientation',
        status: 'active',
        detail: 'Reads project guide and local conventions.'
      },
      { name: 'verification-plan', status: 'active', detail: 'Summarizes checks before handoff.' },
      { name: 'release-notes', status: 'draft', detail: 'Draft skill awaiting review.' }
    ],
    plugins: [
      { name: 'GitHub', connected: true, detail: 'PRs and review threads' },
      { name: 'Linear', connected: false, detail: 'Issues and product planning' },
      { name: 'Gmail', connected: false, detail: 'Read-only context' }
    ],
    outputs: [
      {
        title: 'Implementation notes',
        path: 'agents/workspace-agent/output/notes.md',
        updatedAt: '12 min ago'
      },
      {
        title: 'Verification summary',
        path: 'agents/workspace-agent/output/checks.md',
        updatedAt: '1 h ago'
      }
    ],
    readiness: [
      { label: 'Provider', ok: true, detail: 'Codex connected' },
      { label: 'Instructions', ok: true, detail: 'AGENTS.md present' },
      { label: 'Skills', ok: true, detail: '2 active skills' },
      { label: 'Plugins', ok: false, detail: 'Linear not connected' }
    ]
  },
  {
    id: 'planner',
    name: 'Planner',
    role: 'Task planner and dispatcher',
    description: 'Breaks requests into scoped work items and routes them to suitable agents.',
    status: 'ready',
    enabled: true,
    provider: 'codex',
    model: 'default',
    sandbox: 'workspace-write',
    workspace: '.',
    teams: ['Product Delivery', 'Leadership'],
    skills: [
      { name: 'task-routing', status: 'active', detail: 'Chooses agents by capability and scope.' },
      { name: 'dependency-map', status: 'active', detail: 'Keeps blocked work visible.' }
    ],
    plugins: [
      { name: 'Linear', connected: true, detail: 'Issue triage and project context' },
      { name: 'GitHub', connected: true, detail: 'PR and CI context' }
    ],
    outputs: [
      {
        title: 'Work package plan',
        path: 'agents/planner/output/work-package.json',
        updatedAt: '28 min ago'
      }
    ],
    readiness: [
      { label: 'Provider', ok: true, detail: 'Codex connected' },
      { label: 'Instructions', ok: true, detail: 'Routing policy set' },
      { label: 'Teams', ok: true, detail: '2 teams available' },
      { label: 'Queue', ok: true, detail: 'No blocked dispatch' }
    ]
  },
  {
    id: 'qa-reviewer',
    name: 'QA Reviewer',
    role: 'Regression and acceptance reviewer',
    description: 'Finds edge cases, missing checks, and acceptance gaps before work is completed.',
    status: 'needs-attention',
    enabled: true,
    provider: 'codex',
    model: 'gpt-5.4',
    sandbox: 'read-only',
    workspace: '.',
    teams: ['Product Delivery'],
    skills: [
      { name: 'acceptance-review', status: 'active', detail: 'Checks user-facing behavior.' },
      { name: 'test-risk-map', status: 'invalid', detail: 'Missing SKILL.md frontmatter.' }
    ],
    plugins: [{ name: 'GitHub', connected: false, detail: 'Needs connection for review context' }],
    outputs: [],
    readiness: [
      { label: 'Provider', ok: true, detail: 'Codex connected' },
      { label: 'Instructions', ok: true, detail: 'Review posture set' },
      { label: 'Skills', ok: false, detail: '1 invalid skill' },
      { label: 'Plugins', ok: false, detail: 'GitHub not connected' }
    ]
  }
]

const sections: Array<{ id: AgentSection; label: string; icon: typeof Bot }> = [
  { id: 'instructions', label: 'Instructions', icon: FileText },
  { id: 'skills', label: 'Skills', icon: Sparkles },
  { id: 'settings', label: 'Settings', icon: Settings2 }
]

export function AgentsScreen(): React.JSX.Element {
  const [agentList, setAgentList] = useState<AgentProfile[]>(agents)
  const [selectedAgentId, setSelectedAgentId] = useState(agents[0].id)
  const [activeSection, setActiveSection] = useState<AgentSection>('instructions')
  const [createAgentOpen, setCreateAgentOpen] = useState(false)
  const selectedAgent = useMemo(
    () => agentList.find((agent) => agent.id === selectedAgentId) ?? agentList[0],
    [agentList, selectedAgentId]
  )

  function handleCreateAgent(draft: CreateAgentDraft): void {
    const nextAgent = createAgentFromDraft(draft, agentList)
    setAgentList((currentAgents) => [nextAgent, ...currentAgents])
    setSelectedAgentId(nextAgent.id)
    setActiveSection('instructions')
    setCreateAgentOpen(false)
  }

  return (
    <div className="grid min-h-[calc(100vh-7rem)] gap-4 py-6 xl:grid-cols-[280px_minmax(0,1fr)]">
      <AgentLibrary
        agents={agentList}
        selectedAgentId={selectedAgent.id}
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
            <AgentDetail agent={selectedAgent} activeSection={activeSection} />
          </CardContent>
        </Card>
      </main>

      <CreateAgentDialog
        open={createAgentOpen}
        onCreateAgent={handleCreateAgent}
        onOpenChange={setCreateAgentOpen}
      />
    </div>
  )
}

function AgentLibrary({
  agents,
  selectedAgentId,
  onCreateAgent,
  onSelectAgent
}: {
  agents: AgentProfile[]
  selectedAgentId: string
  onCreateAgent: () => void
  onSelectAgent: (agentId: string) => void
}): React.JSX.Element {
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
              <CardDescription>{agents.length} agents</CardDescription>
            </div>
            <Button size="icon" aria-label="Create agent" onClick={onCreateAgent}>
              <Plus />
            </Button>
          </div>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search agents" />
          </div>
        </CardHeader>

        <CardContent className="grid gap-2 p-3">
          {agents.map((agent) => (
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
                <StatusDot status={agent.status} />
              </div>
              <div className="flex flex-wrap gap-1">
                {agent.teams.slice(0, 2).map((team) => (
                  <span
                    key={team}
                    className="max-w-full truncate rounded-sm bg-surface-strong px-1.5 py-0.5 text-[11px] text-muted-foreground"
                  >
                    {team}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </CardContent>
      </Card>
    </aside>
  )
}

function AgentDetail({
  agent,
  activeSection
}: {
  agent: AgentProfile
  activeSection: AgentSection
}): React.JSX.Element {
  if (activeSection === 'instructions') {
    return <InstructionsPanel key={agent.id} agent={agent} />
  }

  if (activeSection === 'skills') {
    return (
      <div className="grid gap-3 p-5">
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs">
            <Plus />
            Create skill
          </Button>
          <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs">
            <FolderOpen />
            Import skill
          </Button>
        </div>
        <div className="grid gap-2">
          {agent.skills.map((skill) => (
            <div key={skill.name} className="grid gap-1 rounded-lg border bg-card p-4">
              <div className="flex min-w-0 items-center gap-2">
                <Sparkles className="size-4 shrink-0 text-primary" />
                <p className="truncate text-sm font-semibold">{skill.name}</p>
              </div>
              <p className="text-sm text-muted-foreground">{skill.detail}</p>
            </div>
          ))}
          {agent.skills.length === 0 ? (
            <EmptyState
              icon={<Sparkles />}
              title="No skills yet"
              detail="Create or import a skill for this agent."
            />
          ) : null}
        </div>
      </div>
    )
  }

  if (activeSection === 'settings') {
    return <SettingsPanel key={agent.id} agent={agent} />
  }

  return (
    <div className="p-5">
      <p className="text-sm text-muted-foreground">Select an agent section.</p>
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

function CreateAgentDialog({
  open,
  onCreateAgent,
  onOpenChange
}: {
  open: boolean
  onCreateAgent: (draft: CreateAgentDraft) => void
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const [step, setStep] = useState<CreateAgentStep>('describe')
  const [intent, setIntent] = useState('')
  const [draft, setDraft] = useState<CreateAgentDraft>(() => createDraftFromIntent(''))
  const canDraft = intent.trim().length >= 12
  const canCreate =
    draft.name.trim().length > 0 &&
    draft.role.trim().length > 0 &&
    draft.instructions.trim().length > 0

  function resetDialog(): void {
    setStep('describe')
    setIntent('')
    setDraft(createDraftFromIntent(''))
  }

  function handleOpenChange(nextOpen: boolean): void {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      resetDialog()
    }
  }

  function updateDraft(next: Partial<CreateAgentDraft>): void {
    setDraft((current) => ({ ...current, ...next }))
  }

  function handleDraftAgent(): void {
    if (!canDraft) {
      return
    }
    setDraft(createDraftFromIntent(intent))
    setStep('review')
  }

  function handleProviderChange(provider: AgentProvider): void {
    updateDraft({ provider, model: getModelOptions(provider)[0] })
  }

  function handleCreateAgent(): void {
    if (!canCreate) {
      return
    }
    onCreateAgent(draft)
    resetDialog()
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
          <div className="p-5">
            <label className="grid gap-2">
              <span className="text-sm font-semibold">What should this agent help with?</span>
              <textarea
                className="ordinus-scrollbar min-h-56 resize-y rounded-lg border bg-card p-4 text-sm leading-6 text-foreground shadow-none outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                placeholder="Example: I need an agent that reviews pull requests, checks missing tests, and flags risky changes before merge."
                value={intent}
                onChange={(event) => setIntent(event.target.value)}
              />
            </label>
          </div>
        ) : (
          <ScrollArea key={step} className="h-[min(680px,calc(100vh-15rem))]">
            <div className="p-5">
              <div className="grid gap-4">
                <div className="grid gap-2 rounded-lg border bg-accent p-4">
                  <p className="text-xs font-medium text-muted-foreground">Requested work</p>
                  <p className="text-base font-semibold leading-6">{draft.description}</p>
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
                        value={draft.provider}
                        onChange={(value) => handleProviderChange(value as AgentProvider)}
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
                        {getModelOptions(draft.provider).map((model) => (
                          <option key={model} value={model}>
                            {model}
                          </option>
                        ))}
                      </SelectControl>
                    </FormField>
                    <FormField label="Sandbox">
                      <SelectControl
                        value={draft.sandbox}
                        onChange={(value) => updateDraft({ sandbox: value })}
                      >
                        <option value="read-only">Read only</option>
                        <option value="workspace-write">Workspace write</option>
                        <option value="full-access">Full access</option>
                      </SelectControl>
                    </FormField>
                    <FormField label="Workspace">
                      <Input
                        value={draft.workspace}
                        onChange={(event) => updateDraft({ workspace: event.target.value })}
                      />
                    </FormField>
                  </div>
                </section>
              </div>
            </div>
          </ScrollArea>
        )}

        <DialogFooter className="border-t bg-accent/50 p-4">
          {step === 'describe' ? (
            <>
              <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button type="button" disabled={!canDraft} onClick={handleDraftAgent}>
                <WandSparkles />
                Draft agent
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="ghost" onClick={() => setStep('describe')}>
                <ArrowLeft />
                Back
              </Button>
              <Button type="button" disabled={!canCreate} onClick={handleCreateAgent}>
                Create agent
              </Button>
            </>
          )}
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

function InstructionsPanel({ agent }: { agent: AgentProfile }): React.JSX.Element {
  const [savedInstructions, setSavedInstructions] = useState(() => getDefaultInstructions(agent))
  const [instructions, setInstructions] = useState(savedInstructions)
  const dirty = instructions !== savedInstructions

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
            disabled={!dirty}
            onClick={() => setInstructions(savedInstructions)}
          >
            Discard
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8 px-2.5 text-xs"
            disabled={!dirty}
            onClick={() => setSavedInstructions(instructions)}
          >
            Save
          </Button>
        </div>
      </div>

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

function SettingsPanel({ agent }: { agent: AgentProfile }): React.JSX.Element {
  const initialDraft: SettingsDraft = {
    provider: agent.provider,
    model: agent.model,
    sandbox: agent.sandbox,
    workspace: agent.workspace,
    enabled: agent.enabled
  }
  const [draft, setDraft] = useState<SettingsDraft>(initialDraft)
  const dirty =
    draft.provider !== initialDraft.provider ||
    draft.model !== initialDraft.model ||
    draft.sandbox !== initialDraft.sandbox ||
    draft.workspace !== initialDraft.workspace ||
    draft.enabled !== initialDraft.enabled
  const modelOptions = getModelOptions(draft.provider)

  function updateDraft(next: Partial<SettingsDraft>): void {
    setDraft((current) => {
      const merged = { ...current, ...next }
      if (next.provider && !getModelOptions(next.provider).includes(merged.model)) {
        merged.model = getModelOptions(next.provider)[0]
      }
      return merged
    })
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
            disabled={!dirty}
            onClick={() => setDraft(initialDraft)}
          >
            Discard
          </Button>
          <Button type="button" size="sm" className="h-8 px-2.5 text-xs" disabled={!dirty}>
            Save settings
          </Button>
        </div>
      </div>

      <section className="grid gap-4 rounded-lg border bg-card p-4">
        <p className="text-sm font-semibold">Runtime</p>
        <div className="grid gap-3 md:grid-cols-2">
          <FormField label="Provider CLI">
            <SelectControl
              value={draft.provider}
              onChange={(value) => updateDraft({ provider: value as SettingsDraft['provider'] })}
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
              onChange={(value) => updateDraft({ sandbox: value })}
            >
              <option value="read-only">Read only</option>
              <option value="workspace-write">Workspace write</option>
              <option value="full-access">Full access</option>
            </SelectControl>
          </FormField>

          <FormField label="Workspace">
            <Input
              value={draft.workspace}
              onChange={(event) => updateDraft({ workspace: event.target.value })}
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
          <div className="flex items-center justify-between gap-3 rounded-md border bg-accent px-3 py-2">
            <span className="min-w-0">
              <span className="block text-sm font-medium">Local state</span>
              <span className="block truncate text-xs text-muted-foreground">
                Sessions and generated local data
              </span>
            </span>
            <Button variant="outline" size="sm" className="h-8 shrink-0 px-2.5 text-xs">
              Reset
            </Button>
          </div>
        </div>
      </section>
    </div>
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

function SelectControl({
  value,
  onChange,
  children
}: {
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <select
      className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground shadow-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {children}
    </select>
  )
}

function getModelOptions(provider: AgentProvider): string[] {
  if (provider === 'claude') {
    return ['default', 'claude-sonnet', 'claude-opus']
  }
  if (provider === 'gemini') {
    return ['default', 'gemini-pro', 'gemini-flash']
  }
  return ['default', 'gpt-5.4', 'gpt-5.4-mini']
}

function createDraftFromIntent(intent: string): CreateAgentDraft {
  const normalizedIntent = intent.trim()
  const role = inferAgentRole(normalizedIntent)
  const name = inferAgentName(role)
  const description =
    normalizedIntent || 'Own a focused part of the workspace and keep progress observable.'

  return {
    name,
    role,
    description,
    instructions: buildInstructions({ name, role, description }),
    provider: 'codex',
    model: 'default',
    sandbox: 'workspace-write',
    workspace: '.'
  }
}

function createAgentFromDraft(
  draft: CreateAgentDraft,
  existingAgents: AgentProfile[]
): AgentProfile {
  return {
    id: getUniqueAgentId(draft.name, existingAgents),
    name: draft.name.trim(),
    role: draft.role.trim(),
    description: draft.description.trim(),
    status: 'ready',
    enabled: true,
    provider: draft.provider,
    model: draft.model,
    sandbox: draft.sandbox,
    workspace: draft.workspace,
    teams: [],
    skills: [],
    plugins: [],
    outputs: [],
    readiness: [
      { label: 'Provider', ok: true, detail: `${toTitleCase(draft.provider)} selected` },
      { label: 'Instructions', ok: true, detail: 'Draft reviewed' },
      { label: 'Skills', ok: false, detail: 'No skills selected' }
    ]
  }
}

function getDefaultInstructions(agent: AgentProfile): string {
  return `# ${agent.name}

Role: ${agent.role}

Responsibility:
${agent.description}

Work style:
- Inspect workspace context before changing files.
- Keep changes focused and verifiable.
- Surface blockers and missing setup clearly.

Verification:
- Explain what changed.
- Run the smallest useful checks before handing work back.`
}

function buildInstructions({
  description,
  name,
  role
}: {
  description: string
  name: string
  role: string
}): string {
  return `# ${name}

Role: ${role}

Responsibility:
${description}

Scope:
- Work only inside the selected workspace.
- Keep ownership focused and easy to review.
- Ask for direction when the request changes the agent's responsibility.

Work style:
- Inspect the workspace before making changes.
- Keep changes small and explain tradeoffs.
- Surface blockers, missing setup, and risky assumptions.

Verification:
- Run the smallest useful checks for the work.
- Summarize what changed and what still needs attention.`
}

function inferAgentRole(intent: string): string {
  const lowerIntent = intent.toLowerCase()
  if (
    lowerIntent.includes('review') ||
    lowerIntent.includes('test') ||
    lowerIntent.includes('qa')
  ) {
    return 'Review and quality agent'
  }
  if (
    lowerIntent.includes('plan') ||
    lowerIntent.includes('task') ||
    lowerIntent.includes('dispatch')
  ) {
    return 'Planning and coordination agent'
  }
  if (
    lowerIntent.includes('doc') ||
    lowerIntent.includes('write') ||
    lowerIntent.includes('release note')
  ) {
    return 'Documentation agent'
  }
  if (
    lowerIntent.includes('build') ||
    lowerIntent.includes('code') ||
    lowerIntent.includes('implement')
  ) {
    return 'Implementation agent'
  }
  return 'Focused workspace agent'
}

function inferAgentName(role: string): string {
  return role
    .replace(' and ', ' ')
    .replace(/\bagent\b/i, '')
    .trim()
    .split(' ')
    .map(toTitleCase)
    .join(' ')
    .concat(' Agent')
}

function getUniqueAgentId(name: string, existingAgents: AgentProfile[]): string {
  const baseId = slugify(name) || 'agent'
  const existingIds = new Set(existingAgents.map((agent) => agent.id))
  if (!existingIds.has(baseId)) {
    return baseId
  }

  let suffix = 2
  while (existingIds.has(`${baseId}-${suffix}`)) {
    suffix += 1
  }
  return `${baseId}-${suffix}`
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function toTitleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
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
