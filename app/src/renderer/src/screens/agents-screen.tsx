import { useCallback, useEffect, useMemo, useRef, useState, useId } from 'react'
import {
  AlertTriangle,
  Bot,
  CalendarClock,
  FileText,
  Info,
  Loader2,
  MoreVertical,
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
import { Switch } from '@renderer/components/ui/switch'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { cn } from '@renderer/lib/utils'
import { notify } from '@renderer/lib/notifications'
import { AgentCreationFlow } from '@renderer/components/agent-creation-flow'
import { AgentReflectionDialog } from '@renderer/components/agent-reflection-dialog'
import type {
  Agent,
  AgentExtraDirectoryEntry,
  AgentSandbox,
  AgentSchedule,
  AgentSkill,
  ConnectorSummary,
  ProviderId,
  WorkRequest
} from '@shared/contracts'
import { CreateScheduleDialog, disableReasonLabel } from './schedules-screen'
import { getDefaultModelForProvider, getProviderModelOptions } from '@shared/provider-models'

type AgentStatus = 'ready' | 'needs-attention' | 'offline'
type AgentSection = 'instructions' | 'skills' | 'schedules' | 'settings'
type SettingsDraft = {
  name: string
  role: string
  capabilities: string
  providerId: ProviderId
  model: string
  sandbox: AgentSandbox
  connectors: string[]
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
  { id: 'schedules', label: 'Schedules', icon: CalendarClock },
  { id: 'settings', label: 'Settings', icon: Settings2 }
]

export function AgentsScreen(): React.JSX.Element {
  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState<string>('')
  const [activeSection, setActiveSection] = useState<AgentSection>('instructions')
  const [createAgentOpen, setCreateAgentOpen] = useState(false)
  const [reflectionOpen, setReflectionOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? agents[0] ?? null,
    [agents, selectedAgentId]
  )

  const reloadAgents = useCallback(async (): Promise<void> => {
    try {
      setLoading(true)
      const nextAgents = await window.ordinus.agents.list()
      setAgents(nextAgents)
      setSelectedAgentId((current) => {
        if (nextAgents.some((agent) => agent.id === current)) {
          return current
        }
        return nextAgents[0]?.id ?? ''
      })
      setError('')
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Agents could not be loaded.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reloadAgents()
  }, [reloadAgents])

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

  async function handleDeleteAgent(): Promise<void> {
    if (!selectedAgent) {
      return
    }

    try {
      setDeleting(true)
      await window.ordinus.agents.delete({ id: selectedAgent.id })
      setDeleteOpen(false)
      handleAgentDeleted(selectedAgent.id)
    } catch (deleteError) {
      notify.error({
        title: 'Agent could not be deleted',
        description: getErrorMessage(deleteError, 'Please try again.')
      })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="grid min-h-[calc(100vh-3rem)] gap-4 py-4 xl:h-[calc(100vh-3rem)] xl:min-h-0 xl:grid-cols-[280px_minmax(0,1fr)] xl:overflow-hidden">
      <AgentLibrary
        agents={agents}
        loading={loading}
        selectedAgentId={selectedAgent?.id ?? ''}
        onCreateAgent={() => setCreateAgentOpen(true)}
        onSelectAgent={setSelectedAgentId}
        onOpenReflection={() => setReflectionOpen(true)}
      />

      <main className="min-w-0 xl:min-h-0">
        <Card className="flex min-h-[760px] flex-col overflow-hidden xl:h-full xl:min-h-0">
          <div className="flex items-stretch justify-between gap-0 border-b">
            <div className="flex items-stretch gap-0">
              {sections.map((section) => {
                const Icon = section.icon
                const isActive = activeSection === section.id
                return (
                  <button
                    key={section.id}
                    type="button"
                    disabled={!selectedAgent}
                    onClick={() => setActiveSection(section.id)}
                    className={cn(
                      'relative flex items-center gap-1.5 px-4 py-3 text-[12.5px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-40',
                      isActive
                        ? 'text-foreground after:absolute after:bottom-0 after:left-4 after:right-4 after:h-[2px] after:rounded-t-sm after:bg-primary after:content-[""]'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Icon className="size-3.5 shrink-0" />
                    {section.label}
                  </button>
                )
              })}
            </div>
            {selectedAgent ? <AgentActionsMenu onDelete={() => setDeleteOpen(true)} /> : null}
          </div>

          <CardContent className="flex min-h-0 flex-1 flex-col p-0">
            {error ? (
              <EmptyState icon={<Bot />} title="Agents unavailable" detail={error} />
            ) : selectedAgent ? (
              <AgentDetail
                agent={selectedAgent}
                agents={agents}
                activeSection={activeSection}
                onAgentSaved={handleAgentSaved}
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

      <AgentCreationFlow
        open={createAgentOpen}
        onOpenChange={setCreateAgentOpen}
        onAgentCreated={handleAgentCreated}
        existingAgentNames={agents.map((agent) => agent.name)}
      />

      <AgentReflectionDialog
        open={reflectionOpen}
        onOpenChange={setReflectionOpen}
        onChanged={() => void reloadAgents()}
      />

      {selectedAgent ? (
        <DeleteAgentDialog
          agentId={selectedAgent.id}
          agentName={selectedAgent.name}
          deleting={deleting}
          open={deleteOpen}
          onDelete={() => void handleDeleteAgent()}
          onOpenChange={setDeleteOpen}
        />
      ) : null}
    </div>
  )
}

function AgentActionsMenu({ onDelete }: { onDelete: () => void }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    function handlePointerDown(event: PointerEvent): void {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative flex items-center pr-2">
      <button
        type="button"
        aria-label="Agent actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        onClick={() => setOpen((value) => !value)}
      >
        <MoreVertical className="size-4" />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-2 top-[calc(100%-4px)] z-20 min-w-44 rounded-md border bg-card p-1 shadow-md"
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs text-status-attention transition-colors hover:bg-accent"
            onClick={() => {
              setOpen(false)
              onDelete()
            }}
          >
            <Trash2 className="size-3.5" />
            Delete this agent
          </button>
        </div>
      ) : null}
    </div>
  )
}

function AgentLibrary({
  agents,
  loading,
  selectedAgentId,
  onCreateAgent,
  onSelectAgent,
  onOpenReflection
}: {
  agents: Agent[]
  loading: boolean
  selectedAgentId: string
  onCreateAgent: () => void
  onSelectAgent: (agentId: string) => void
  onOpenReflection: () => void
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const filteredAgents = agents.filter((agent) => {
    const value = `${agent.name} ${agent.role}`.toLowerCase()
    return value.includes(query.trim().toLowerCase())
  })

  return (
    <aside className="min-w-0 xl:min-h-0">
      <Card className="flex flex-col overflow-hidden xl:h-full xl:min-h-0">
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
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                aria-label="Agent reflection"
                onClick={onOpenReflection}
              >
                Reflect
              </Button>
              <Button size="icon" aria-label="Create agent" onClick={onCreateAgent}>
                <Plus />
              </Button>
            </div>
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

        <CardContent className="ordinus-scrollbar grid gap-2 p-3 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
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
  onAgentSaved
}: {
  agent: Agent
  agents: Agent[]
  activeSection: AgentSection
  onAgentSaved: (agent: Agent) => void
}): React.JSX.Element {
  if (activeSection === 'instructions') {
    return <InstructionsPanel key={agent.id} agent={agent} onAgentSaved={onAgentSaved} />
  }

  if (activeSection === 'skills') {
    return <SkillsPanel key={agent.id} agent={agent} />
  }

  if (activeSection === 'schedules') {
    return <AgentSchedulesPanel key={agent.id} agent={agent} />
  }

  if (activeSection === 'settings') {
    return (
      <SettingsPanel key={agent.id} agent={agent} agents={agents} onAgentSaved={onAgentSaved} />
    )
  }

  return (
    <div className="p-5">
      <p className="text-sm text-muted-foreground">Select an agent section.</p>
    </div>
  )
}

const CAPABILITIES_MAX_LENGTH = 300

function CapabilitiesField({
  value,
  onChange,
  onImprove,
  improving,
  canImprove
}: {
  value: string
  onChange: (value: string) => void
  onImprove: () => void
  improving: boolean
  canImprove: boolean
}): React.JSX.Element {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-muted-foreground">Capabilities</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs"
          disabled={improving || !canImprove}
          onClick={onImprove}
        >
          {improving ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <WandSparkles className="size-3.5" />
          )}
          Improve with AI
        </Button>
      </div>
      <textarea
        className="ordinus-scrollbar min-h-20 resize-y rounded-lg border bg-card p-3 text-sm leading-5 text-foreground shadow-none outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        maxLength={CAPABILITIES_MAX_LENGTH}
        placeholder="What this agent is best at, the capability or connector boundary it owns, and when to route work to another agent."
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <p className="flex items-center justify-between gap-3 text-xs leading-5 text-muted-foreground">
        <span>Used by the planner to assign work to the right specialist.</span>
        <span className="shrink-0 tabular-nums">
          {value.length}/{CAPABILITIES_MAX_LENGTH}
        </span>
      </p>
    </div>
  )
}

type SkillEditorMode = 'create' | 'edit'
type SkillEditorState = {
  mode: SkillEditorMode
  skillId: string
  name: string
  description: string
  body: string
  bodyTouched: boolean
}

function buildDefaultSkillBody(name: string): string {
  const title = name.trim() || 'New skill'

  return [
    `# ${title}`,
    '',
    '## When To Use',
    '',
    '- Use this skill when ...',
    '',
    '## Workflow',
    '',
    '1. ...',
    '2. ...',
    '3. ...',
    '',
    '## Boundaries',
    '',
    '- Do not use this skill when ...'
  ].join('\n')
}

function createSkillEditorState(): SkillEditorState {
  return {
    mode: 'create',
    skillId: '',
    name: '',
    description: '',
    body: buildDefaultSkillBody(''),
    bodyTouched: false
  }
}

function createSkillEditState(skill: AgentSkill): SkillEditorState {
  return {
    mode: 'edit',
    skillId: skill.id,
    name: skill.name,
    description: skill.description,
    body: '',
    bodyTouched: false
  }
}

function upsertSkill(skills: AgentSkill[], skill: AgentSkill): AgentSkill[] {
  return [...skills.filter((currentSkill) => currentSkill.id !== skill.id), skill].sort(
    (left, right) => left.name.localeCompare(right.name)
  )
}

function SkillsPanel({ agent }: { agent: Agent }): React.JSX.Element {
  const [skills, setSkills] = useState<AgentSkill[]>([])
  const [loading, setLoading] = useState(true)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editor, setEditor] = useState<SkillEditorState>(() => createSkillEditorState())
  const [loadingSkill, setLoadingSkill] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [error, setError] = useState('')
  const skillLoadRequestRef = useRef(0)

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

  function openCreateSkill(): void {
    skillLoadRequestRef.current += 1
    setEditor(createSkillEditorState())
    setLoadingSkill(false)
    setDeleteOpen(false)
    setError('')
    setEditorOpen(true)
  }

  async function openEditSkill(skill: AgentSkill): Promise<void> {
    const requestId = skillLoadRequestRef.current + 1
    skillLoadRequestRef.current = requestId
    setEditor(createSkillEditState(skill))
    setDeleteOpen(false)
    setLoadingSkill(true)
    setError('')
    setEditorOpen(true)

    try {
      const detail = await window.ordinus.agents.getSkill({
        agentId: agent.id,
        skillId: skill.id
      })
      if (skillLoadRequestRef.current !== requestId) {
        return
      }
      setEditor({
        mode: 'edit',
        skillId: detail.id,
        name: detail.name,
        description: detail.description,
        body: detail.body,
        bodyTouched: false
      })
    } catch (loadError) {
      if (skillLoadRequestRef.current !== requestId) {
        return
      }
      setError(getErrorMessage(loadError, 'Skill could not be opened.'))
      setEditorOpen(false)
    } finally {
      if (skillLoadRequestRef.current === requestId) {
        setLoadingSkill(false)
      }
    }
  }

  function closeSkillEditor(): void {
    skillLoadRequestRef.current += 1
    setEditorOpen(false)
    setDeleteOpen(false)
    setLoadingSkill(false)
  }

  function handleSkillNameChange(value: string): void {
    setEditor((current) => ({
      ...current,
      name: value,
      body:
        current.mode === 'create' && !current.bodyTouched
          ? buildDefaultSkillBody(value)
          : current.body
    }))
  }

  function handleSkillBodyChange(value: string): void {
    setEditor((current) => ({ ...current, body: value, bodyTouched: true }))
  }

  async function handleSaveSkill(): Promise<void> {
    if (!editor.name.trim() || saving || deleting) {
      return
    }

    try {
      setSaving(true)
      setError('')
      const skill =
        editor.mode === 'create'
          ? await window.ordinus.agents.createSkill({
              agentId: agent.id,
              name: editor.name,
              description: editor.description,
              body: editor.body
            })
          : await window.ordinus.agents.updateSkill({
              agentId: agent.id,
              skillId: editor.skillId,
              name: editor.name,
              description: editor.description,
              body: editor.body
            })
      setSkills((current) => upsertSkill(current, skill))
      setEditor(createSkillEditorState())
      closeSkillEditor()
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Skill could not be saved.'))
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteSkill(): Promise<void> {
    if (editor.mode !== 'edit' || deleting || saving || loadingSkill) {
      return
    }

    try {
      setDeleting(true)
      setError('')
      const result = await window.ordinus.agents.deleteSkill({
        agentId: agent.id,
        skillId: editor.skillId
      })
      setSkills((current) => current.filter((skill) => skill.id !== result.deletedSkillId))
      closeSkillEditor()
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, 'Skill could not be deleted.'))
    } finally {
      setDeleting(false)
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
          onClick={openCreateSkill}
        >
          <Plus />
          Create skill
        </Button>
      </div>

      {error ? <InlineError message={error} /> : null}

      {skills.length > 0 ? (
        <div className="grid gap-2">
          {skills.map((skill) => (
            <button
              key={skill.id}
              type="button"
              className="grid gap-2 rounded-lg border bg-card p-4 text-left transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              onClick={() => void openEditSkill(skill)}
            >
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
            </button>
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

      <Dialog
        open={editorOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeSkillEditor()
            return
          }
          setEditorOpen(true)
        }}
      >
        <SkillEditorDialog
          deleting={deleting}
          editor={editor}
          loadingSkill={loadingSkill}
          saving={saving}
          onBodyChange={handleSkillBodyChange}
          onCancel={closeSkillEditor}
          onDelete={() => setDeleteOpen(true)}
          onDescriptionChange={(description) =>
            setEditor((current) => ({ ...current, description }))
          }
          onNameChange={handleSkillNameChange}
          onSave={() => void handleSaveSkill()}
        />
      </Dialog>
      <DeleteSkillDialog
        deleting={deleting}
        open={deleteOpen}
        skillName={editor.name}
        onDelete={() => void handleDeleteSkill()}
        onOpenChange={setDeleteOpen}
      />
    </div>
  )
}

function SkillEditorDialog({
  deleting,
  editor,
  loadingSkill,
  saving,
  onBodyChange,
  onCancel,
  onDelete,
  onDescriptionChange,
  onNameChange,
  onSave
}: {
  deleting: boolean
  editor: SkillEditorState
  loadingSkill: boolean
  saving: boolean
  onBodyChange: (body: string) => void
  onCancel: () => void
  onDelete: () => void
  onDescriptionChange: (description: string) => void
  onNameChange: (name: string) => void
  onSave: () => void
}): React.JSX.Element {
  const disabled = saving || deleting || loadingSkill

  return (
    <DialogContent className="max-w-3xl">
      <DialogHeader>
        <DialogTitle>{editor.mode === 'create' ? 'Create skill' : 'Edit skill'}</DialogTitle>
        <DialogDescription>
          Save frontmatter and instructions to this agent&apos;s SKILL.md file.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-3">
        <FormField label="Skill name">
          <Input
            value={editor.name}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder="Strategy review"
            disabled={loadingSkill}
          />
        </FormField>
        <label className="grid gap-2">
          <span className="text-xs font-medium text-muted-foreground">Description</span>
          <textarea
            className="ordinus-scrollbar min-h-28 resize-y rounded-lg border bg-card p-3 text-sm leading-5 text-foreground shadow-none outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            value={editor.description}
            onChange={(event) => onDescriptionChange(event.target.value)}
            placeholder="When should this skill be used?"
            disabled={loadingSkill}
          />
        </label>
        <label className="grid gap-2">
          <span className="text-xs font-medium text-muted-foreground">Skill instructions</span>
          <textarea
            className="ordinus-scrollbar min-h-80 resize-y rounded-lg border bg-card p-3 font-mono text-xs leading-5 text-foreground shadow-none outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            value={loadingSkill ? 'Loading skill...' : editor.body}
            onChange={(event) => onBodyChange(event.target.value)}
            placeholder="# Skill name"
            disabled={loadingSkill}
          />
        </label>
      </div>
      <DialogFooter>
        {editor.mode === 'edit' ? (
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className="mr-auto border-status-attention/40 text-status-attention hover:bg-status-attention/10"
            onClick={onDelete}
          >
            <Trash2 />
            Delete skill
          </Button>
        ) : null}
        <Button type="button" variant="ghost" disabled={disabled} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" disabled={!editor.name.trim() || disabled} onClick={onSave}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          {editor.mode === 'create' ? 'Create skill' : 'Save skill'}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

function DeleteSkillDialog({
  deleting,
  open,
  skillName,
  onDelete,
  onOpenChange
}: {
  deleting: boolean
  open: boolean
  skillName: string
  onDelete: () => void
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-status-attention" />
            Delete skill
          </DialogTitle>
          <DialogDescription>
            This removes {skillName || 'this skill'} and its entire skill folder. This cannot be
            undone.
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
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [error, setError] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const revertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Revert target — son kaydedilen, session boyunca tutulur
  const revertTargetRef = useRef<string>(savedInstructions)

  async function save(value: string): Promise<void> {
    if (value === savedInstructions) return

    try {
      setSaving(true)
      setError('')
      const nextAgent = await window.ordinus.agents.updateInstructions({
        id: agent.id,
        instructions: value
      })
      revertTargetRef.current = savedInstructions // kayıt öncesi versiyonu sakla
      setSavedInstructions(nextAgent.instructions)
      onAgentSaved(nextAgent)

      // "Saved · Revert" göster
      setSaveStatus('saved')
      // Revert butonu 4sn sonra solar
      if (revertTimerRef.current) clearTimeout(revertTimerRef.current)
      revertTimerRef.current = setTimeout(() => setSaveStatus('idle'), 4000)
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Instructions could not be saved.'))
      setSaveStatus('error')
    } finally {
      setSaving(false)
    }
  }

  function handleChange(value: string): void {
    setInstructions(value)
    setSaveStatus('idle')
    // Debounce: 2sn sonra otomatik kayıt
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      void save(value)
    }, 2000)
  }

  function handleBlur(): void {
    // Focus kaybolunca bekleyen debounce'u iptal et, hemen kaydet
    if (debounceRef.current) clearTimeout(debounceRef.current)
    void save(instructions)
  }

  function handleRevert(): void {
    const target = revertTargetRef.current
    setInstructions(target)
    setSaveStatus('idle')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    void save(target)
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Durum göstergesi — sağ üst, yalnızca gerektiğinde */}
      <div className="absolute right-5 top-4 flex items-center gap-2">
        {saving ? (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            Saving
          </span>
        ) : saveStatus === 'saved' ? (
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Saved</span>
            <span className="text-border">·</span>
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              onClick={handleRevert}
            >
              Revert
            </button>
          </span>
        ) : saveStatus === 'error' ? (
          <span className="text-xs text-status-attention">{error}</span>
        ) : null}
      </div>

      {/* Editör — sınırsız, panel yüzeyiyle bütünleşik */}
      <textarea
        key={agent.id}
        aria-label={`${agent.name} instructions`}
        className="ordinus-scrollbar h-full w-full flex-1 resize-none bg-transparent p-5 pt-4 font-mono text-xs leading-6 text-foreground shadow-none outline-none placeholder:text-muted-foreground/50"
        placeholder={`Describe what ${agent.name} is responsible for.\n\nInclude:\n- Role and purpose\n- Scope of work\n- What it should avoid\n- How it should verify its work`}
        spellCheck={false}
        value={instructions}
        onChange={(event) => handleChange(event.target.value)}
        onBlur={handleBlur}
      />
    </div>
  )
}

function SettingsPanel({
  agent,
  agents,
  onAgentSaved
}: {
  agent: Agent
  agents: Agent[]
  onAgentSaved: (agent: Agent) => void
}): React.JSX.Element {
  const initialSettings = getPersistedSettingsDraft(agent)
  const [savedSettings, setSavedSettings] = useState<SettingsDraft>(initialSettings)
  const [draft, setDraft] = useState<SettingsDraft>(getEditableSettingsDraft(initialSettings))
  const [saving, setSaving] = useState(false)
  const [improvingCapabilities, setImprovingCapabilities] = useState(false)
  const [error, setError] = useState('')
  const [availableConnectors, setAvailableConnectors] = useState<ConnectorSummary[]>([])
  const dirty = isSettingsDirty(draft, savedSettings)
  const nameIssue = getAgentNameIssue(draft.name, savedSettings.name, agents, agent.id)
  const canSave = dirty && Boolean(draft.model.trim()) && !nameIssue && !saving

  useEffect(() => {
    let active = true
    window.ordinus.connectors
      .list()
      .then((list) => {
        if (active) {
          setAvailableConnectors(list)
        }
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  function toggleConnector(connectorId: string, enabled: boolean): void {
    setDraft((current) => {
      const set = new Set(current.connectors)
      if (enabled) {
        set.add(connectorId)
      } else {
        set.delete(connectorId)
      }
      return { ...current, connectors: [...set] }
    })
  }

  function updateDraft(next: Partial<SettingsDraft>): void {
    setDraft((current) => {
      const merged = { ...current, ...next }
      if (next.providerId) {
        merged.model = getDefaultModelForProvider(next.providerId)
      }
      return merged
    })
  }

  async function handleImproveCapabilities(): Promise<void> {
    if (improvingCapabilities) {
      return
    }

    const source = agent.instructions.trim()
    if (source.length < 12) {
      return
    }

    try {
      setImprovingCapabilities(true)
      setError('')
      const nextDraft = await window.ordinus.agents.draftFromIntent({
        requestedWork: source,
        sandbox: draft.sandbox
      })
      updateDraft({ capabilities: nextDraft.capabilities })
    } catch (improveError) {
      setError(getErrorMessage(improveError, 'Capabilities could not be generated.'))
    } finally {
      setImprovingCapabilities(false)
    }
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
        role: draft.role.trim(),
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

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <ScrollArea className="h-full min-h-0">
        <div className={cn('grid gap-5 p-5', dirty && 'pb-24')}>
          {/* Agent adı + Enabled */}
          <AgentNameField
            name={draft.name}
            enabled={draft.enabled}
            nameIssue={nameIssue}
            onNameChange={(name) => updateDraft({ name })}
            onEnabledChange={(enabled) => updateDraft({ enabled })}
          />

          {/* Role */}
          <FormField label="Role">
            <Input
              maxLength={120}
              placeholder="Brief description of this agent's purpose"
              value={draft.role}
              onChange={(event) => updateDraft({ role: event.target.value })}
            />
          </FormField>

          {/* Capabilities */}
          <CapabilitiesField
            value={draft.capabilities}
            improving={improvingCapabilities}
            canImprove={agent.instructions.trim().length >= 12}
            onChange={(capabilities) => updateDraft({ capabilities })}
            onImprove={() => void handleImproveCapabilities()}
          />

          {/* Runtime */}
          <div className="grid gap-3">
            <div className="grid gap-3 md:grid-cols-2">
              <FormField label="Provider">
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
          </div>

          {/* Sandbox */}
          <SandboxField
            name="agent-settings-sandbox"
            value={draft.sandbox}
            onChange={(sandbox) => updateDraft({ sandbox })}
          />

          {/* Connectors */}
          <div className="space-y-2">
            <div>
              <h3 className="text-sm font-semibold leading-tight">Connectors</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                External systems this agent may use. Authorize connections in Settings → Connections
                — an agent can be enabled here before its connection is set up.
              </p>
            </div>
            {availableConnectors.length === 0 ? (
              <p className="text-xs text-muted-foreground">No connectors available.</p>
            ) : (
              <ul className="divide-y rounded-md border">
                {availableConnectors.map((connector) => (
                  <li
                    key={connector.id}
                    className="flex items-center justify-between gap-4 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <span className="text-sm font-medium">{connector.label}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {connector.connected ? 'Connected' : 'Not connected'}
                      </span>
                    </div>
                    <Switch
                      checked={draft.connectors.includes(connector.id)}
                      onCheckedChange={(checked) => toggleConnector(connector.id, checked)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <ExtraDirectoriesPanel agentId={agent.id} />
        </div>
      </ScrollArea>

      {/* Save bar — yalnızca dirty'de belirir, panelin altına sabit */}
      {dirty ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4">
          <div className="pointer-events-auto flex items-center justify-between gap-3 rounded-lg border bg-accent px-4 py-3 shadow-md">
            {error ? (
              <p className="text-xs text-status-attention">{error}</p>
            ) : (
              <span className="text-xs text-muted-foreground">Unsaved changes</span>
            )}
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                disabled={saving}
                onClick={() => setDraft(getEditableSettingsDraft(savedSettings))}
              >
                Discard
              </button>
              <Button
                type="button"
                size="sm"
                className="h-8 px-3 text-xs"
                disabled={!canSave}
                onClick={() => void handleSave()}
              >
                {saving ? <Loader2 className="animate-spin" /> : null}
                Save settings
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ExtraDirectoriesPanel({ agentId }: { agentId: string }): React.JSX.Element {
  const [entries, setEntries] = useState<AgentExtraDirectoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    window.ordinus.agents
      .listExtraDirectories({ agentId })
      .then((list) => {
        if (!cancelled) setEntries(list.entries)
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(getErrorMessage(loadError, 'Could not load extra directories.'))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [agentId])

  async function handleAdd(): Promise<void> {
    setBusy(true)
    setError('')
    try {
      const result = await window.ordinus.agents.addExtraDirectory({ agentId })
      if (result.ok) {
        setEntries(result.list.entries)
      } else if (result.code !== 'cancelled') {
        setError(result.message)
      }
    } catch (addError) {
      setError(getErrorMessage(addError, 'Could not add directory.'))
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove(path: string): Promise<void> {
    setBusy(true)
    setError('')
    try {
      const list = await window.ordinus.agents.removeExtraDirectory({ agentId, path })
      setEntries(list.entries)
    } catch (removeError) {
      setError(getErrorMessage(removeError, 'Could not remove directory.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold leading-tight">Extra directories</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Folders outside the workspace this agent can read and write. Best for occasional use —
            the workspace stays the primary place for work.
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-md border px-3 py-1 text-xs hover:bg-accent disabled:opacity-50"
          disabled={busy}
          onClick={handleAdd}
        >
          Add folder…
        </button>
      </div>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
        <li>
          <span className="font-medium text-foreground">Agent-specific.</span> Other agents don't
          inherit these. If a follow-up agent needs the same folder, add it to that agent too.
        </li>
        <li>
          <span className="font-medium text-foreground">Read + write.</span> The agent has full
          access to everything you add here. Use sparingly.
        </li>
        <li>
          <span className="font-medium text-foreground">Not workspace artifacts.</span> Files the
          agent creates here won't appear in the Files panel or auto-flow into follow-up plans —
          only the workspace does that. The agent mentions external changes in its response text.
        </li>
      </ul>
      {error ? <p className="text-xs text-status-attention">{error}</p> : null}
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">No extra directories.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {entries.map((entry) => (
            <li key={entry.path} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <span className="block truncate text-sm">{entry.path}</span>
                {!entry.exists ? (
                  <span className="text-xs text-status-attention">missing</span>
                ) : null}
              </div>
              <button
                type="button"
                className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
                disabled={busy}
                onClick={() => handleRemove(entry.path)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function AgentSchedulesPanel({ agent }: { agent: Agent }): React.JSX.Element {
  const [schedules, setSchedules] = useState<AgentSchedule[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [requests, setRequests] = useState<WorkRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [busyId, setBusyId] = useState('')

  const load = useCallback(
    async (quiet = false): Promise<void> => {
      if (!quiet) setLoading(true)
      try {
        const [s, a, w] = await Promise.all([
          window.ordinus.schedules.list({ agentId: agent.id }),
          window.ordinus.agents.list(),
          window.ordinus.workboard.list()
        ])
        setSchedules(s)
        setAgents(a)
        setRequests(w.requests)
      } finally {
        if (!quiet) setLoading(false)
      }
    },
    [agent.id]
  )

  useEffect(() => {
    void load()
    const off = window.ordinus.schedules.onChanged(() => void load(true))
    return off
  }, [load])

  async function toggle(s: AgentSchedule): Promise<void> {
    setBusyId(s.id)
    try {
      await window.ordinus.schedules.setEnabled({ id: s.id, enabled: !s.enabled })
      await load(true)
    } finally {
      setBusyId('')
    }
  }

  async function fire(s: AgentSchedule): Promise<void> {
    setBusyId(s.id)
    try {
      await window.ordinus.schedules.fireNow({ id: s.id })
      await load(true)
    } finally {
      setBusyId('')
    }
  }

  async function remove(s: AgentSchedule): Promise<void> {
    if (!window.confirm(`Delete schedule "${s.name}"?`)) return
    setBusyId(s.id)
    try {
      await window.ordinus.schedules.delete({ id: s.id })
      await load(true)
    } finally {
      setBusyId('')
    }
  }

  return (
    <div className="space-y-3 p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold leading-tight">Schedules</h2>
          <p className="text-sm text-muted-foreground">Run this agent on a recurring schedule.</p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)} disabled={!agent.enabled}>
          <Plus className="size-4" /> New schedule
        </Button>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : schedules.length === 0 ? (
        <div className="rounded-md border bg-accent/50 p-4 text-sm text-muted-foreground">
          No schedules for {agent.name} yet.
        </div>
      ) : (
        <div className="divide-y rounded-md border">
          {schedules.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{s.name}</span>
                  {s.lastRunStatus === 'failed' ? (
                    <span className="text-xs text-amber-600">Last failed</span>
                  ) : null}
                  {!s.enabled ? (
                    <span className="text-xs text-muted-foreground">{disableReasonLabel(s)}</span>
                  ) : null}
                </div>
                <div className="text-xs text-muted-foreground">
                  {s.cron ? `Cron: ${s.cron}` : s.runAt ? `Once: ${s.runAt}` : ''} · Next:{' '}
                  {s.nextRunAt ? new Date(s.nextRunAt).toLocaleString() : '—'}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busyId === s.id}
                  onClick={() => void toggle(s)}
                >
                  {s.enabled ? 'Disable' : 'Enable'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busyId === s.id}
                  onClick={() => void fire(s)}
                >
                  Run now
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={busyId === s.id}
                  onClick={() => void remove(s)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <CreateScheduleDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        agents={agents}
        requests={requests}
        defaultAgentId={agent.id}
        onCreated={() => {
          setCreateOpen(false)
          void load(true)
        }}
      />
    </div>
  )
}

function DeleteAgentDialog({
  agentId,
  agentName,
  deleting,
  open,
  onDelete,
  onOpenChange
}: {
  agentId: string
  agentName: string
  deleting: boolean
  open: boolean
  onDelete: () => void
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const [scheduleCount, setScheduleCount] = useState(0)
  useEffect(() => {
    if (!open) return
    void window.ordinus.schedules
      .list({ agentId })
      .then((list) => setScheduleCount(list.length))
      .catch(() => setScheduleCount(0))
  }, [open, agentId])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-status-attention" />
            Delete agent
          </DialogTitle>
          <DialogDescription>
            This removes {agentName}, related conversations, local files, and app logs.
            {scheduleCount > 0
              ? ` ${scheduleCount} schedule${scheduleCount === 1 ? '' : 's'} attached to this agent will also be deleted.`
              : ''}{' '}
            This cannot be undone.
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

function AgentNameField({
  name,
  enabled,
  nameIssue,
  onNameChange,
  onEnabledChange
}: {
  name: string
  enabled: boolean
  nameIssue: string | null
  onNameChange: (name: string) => void
  onEnabledChange: (enabled: boolean) => void
}): React.JSX.Element {
  const switchId = useId()
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-muted-foreground">Agent name</span>
        <label htmlFor={switchId} className="flex cursor-pointer items-center gap-2">
          <span className="text-xs text-muted-foreground">{enabled ? 'Enabled' : 'Disabled'}</span>
          <Switch id={switchId} checked={enabled} onCheckedChange={onEnabledChange} />
        </label>
      </div>
      <Input maxLength={80} value={name} onChange={(event) => onNameChange(event.target.value)} />
      {nameIssue ? <p className="text-xs text-status-attention">{nameIssue}</p> : null}
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
  const isFullAccess = value === 'full-access'

  return (
    <div className="grid gap-2">
      <span className="text-xs font-medium text-muted-foreground">Sandbox</span>
      {/* Kompakt radio satırları */}
      <div className="grid gap-1">
        {sandboxOptions.map((option) => {
          const isSelected = option.value === value
          return (
            <div key={option.value}>
              <label className="flex w-fit cursor-pointer items-center gap-2.5 py-1.5">
                <input
                  type="radio"
                  name={name}
                  className="size-3.5 shrink-0 accent-primary"
                  checked={isSelected}
                  onChange={() => onChange(option.value)}
                />
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      'text-sm font-medium',
                      isSelected ? 'text-foreground' : 'text-muted-foreground'
                    )}
                  >
                    {option.label}
                  </span>
                  {option.badge ? (
                    <span className="rounded-full border px-1.5 py-px text-[10px] font-medium text-muted-foreground">
                      {option.badge}
                    </span>
                  ) : null}
                </span>
              </label>
              {/* Seçilinin açıklaması doğrudan altında */}
              {isSelected ? (
                <p
                  className={cn(
                    'ml-6 text-xs leading-5',
                    isFullAccess ? 'text-status-attention' : 'text-muted-foreground'
                  )}
                >
                  {option.description}
                </p>
              ) : null}
            </div>
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
    role: agent.role,
    capabilities: agent.capabilities,
    providerId: agent.providerId,
    model: agent.model,
    sandbox: agent.sandbox,
    connectors: agent.connectors,
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
    draft.role !== savedSettings.role ||
    draft.capabilities !== savedSettings.capabilities ||
    draft.providerId !== savedSettings.providerId ||
    draft.model !== savedSettings.model ||
    draft.sandbox !== savedSettings.sandbox ||
    draft.connectors.join(',') !== savedSettings.connectors.join(',') ||
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
