import { useMemo, useState } from 'react'
import {
  Bot,
  FileText,
  FolderOpen,
  KeyRound,
  Pencil,
  Plug,
  Plus,
  Search,
  Settings2,
  Sparkles
} from 'lucide-react'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { cn } from '@renderer/lib/utils'

type AgentStatus = 'ready' | 'needs-attention' | 'offline'
type AgentSection = 'instructions' | 'skills' | 'plugins' | 'files' | 'settings'

type AgentProfile = {
  id: string
  name: string
  role: string
  description: string
  status: AgentStatus
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

const teams = [
  {
    name: 'Product Delivery',
    detail: 'Planner, implementation, and QA',
    members: 3,
    lead: 'Planner'
  },
  {
    name: 'Leadership',
    detail: 'Direction, tradeoffs, and business checks',
    members: 1,
    lead: 'Planner'
  }
]

const sections: Array<{ id: AgentSection; label: string; icon: typeof Bot }> = [
  { id: 'instructions', label: 'Instructions', icon: FileText },
  { id: 'skills', label: 'Skills', icon: Sparkles },
  { id: 'plugins', label: 'Plugins', icon: Plug },
  { id: 'files', label: 'Files', icon: FolderOpen },
  { id: 'settings', label: 'Settings', icon: Settings2 }
]

export function AgentsScreen(): React.JSX.Element {
  const [selectedAgentId, setSelectedAgentId] = useState(agents[0].id)
  const [activeSection, setActiveSection] = useState<AgentSection>('instructions')
  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? agents[0],
    [selectedAgentId]
  )

  return (
    <div className="grid min-h-[calc(100vh-7rem)] gap-4 py-6 xl:grid-cols-[280px_minmax(0,1fr)]">
      <AgentLibrary selectedAgentId={selectedAgent.id} onSelectAgent={setSelectedAgentId} />

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
    </div>
  )
}

function AgentLibrary({
  selectedAgentId,
  onSelectAgent
}: {
  selectedAgentId: string
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
              <CardDescription>
                {agents.length} agents, {teams.length} teams
              </CardDescription>
            </div>
            <Button size="icon" aria-label="Create agent">
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
    return (
      <div className="grid gap-4 p-5">
        <div className="flex flex-col gap-3 rounded-lg border bg-accent px-3 py-2.5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="truncate font-mono text-xs text-muted-foreground">
              agents/{agent.id}/AGENTS.md
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="ghost" size="sm" className="h-8 px-2.5 text-xs">
              Reset
            </Button>
            <Button size="sm" className="h-8 px-2.5 text-xs">
              <Pencil />
              Save
            </Button>
          </div>
        </div>
        <pre className="min-h-[460px] overflow-auto rounded-lg border bg-card p-4 font-mono text-xs leading-5 text-foreground">
          {`# ${agent.name}

Role: ${agent.role}

Work style:
- Inspect workspace context before changing files.
- Keep changes focused and verifiable.
- Surface blockers and missing setup clearly.

Output:
- Write durable artifacts into this agent's output folder.`}
        </pre>
      </div>
    )
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

  if (activeSection === 'plugins') {
    return (
      <div className="grid gap-3 p-5">
        <div className="grid gap-3 md:grid-cols-2">
          {agent.plugins.map((plugin) => (
            <div key={plugin.name} className="grid gap-3 rounded-lg border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-md bg-accent text-primary">
                    <Plug className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{plugin.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{plugin.detail}</p>
                  </div>
                </div>
                <Badge variant={plugin.connected ? 'completed' : 'outline'}>
                  {plugin.connected ? 'Connected' : 'Off'}
                </Badge>
              </div>
              <Button variant="outline" size="sm" className="w-fit">
                <KeyRound />
                Configure
              </Button>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (activeSection === 'files') {
    return (
      <div className="grid gap-4 p-5">
        <div className="grid gap-3 rounded-lg border bg-accent p-4 md:grid-cols-3">
          <PathRow label="Agent" value={`agents/${agent.id}`} />
          <PathRow label="Output" value={`agents/${agent.id}/output`} />
          <PathRow label="Skills" value={`agents/${agent.id}/skills`} />
        </div>
        <div className="grid gap-2">
          {agent.outputs.length > 0 ? (
            agent.outputs.map((output) => (
              <div
                key={output.path}
                className="flex min-w-0 flex-col gap-2 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{output.title}</p>
                  <p className="break-all font-mono text-xs text-muted-foreground">{output.path}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-muted-foreground">{output.updatedAt}</span>
                  <Button size="sm" variant="outline">
                    <FolderOpen />
                    Open
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <EmptyState
              icon={<FolderOpen />}
              title="No outputs yet"
              detail="Agent files will appear here after runs produce artifacts."
            />
          )}
        </div>
      </div>
    )
  }

  if (activeSection === 'settings') {
    return (
      <div className="grid gap-4 p-5">
        <div className="grid gap-3 md:grid-cols-2">
          <SettingRow label="Model" value={agent.model} />
          <SettingRow label="Sandbox" value={agent.sandbox} />
          <SettingRow label="Workspace" value={agent.workspace} />
          <SettingRow label="Team memberships" value={agent.teams.join(', ') || 'None'} />
        </div>
        <div className="grid gap-3 rounded-lg border bg-accent p-4">
          <p className="text-sm font-semibold">Lifecycle</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm">
              Disable agent
            </Button>
            <Button variant="outline" size="sm">
              Reset local state
            </Button>
          </div>
        </div>
      </div>
    )
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

function SettingRow({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="grid gap-1 rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="break-words text-sm font-medium">{value}</p>
    </div>
  )
}

function PathRow({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="grid gap-1 rounded-md border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate font-mono text-xs">{value}</p>
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
