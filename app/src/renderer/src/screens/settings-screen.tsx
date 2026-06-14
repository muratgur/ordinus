import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  Code2,
  Diamond,
  Download,
  ExternalLink,
  FolderOpen,
  Library,
  Loader2,
  MonitorCog,
  Plug,
  PlugZap,
  RefreshCcw,
  Smartphone,
  Sparkles,
  Terminal,
  Unplug,
  ShieldCheck
} from 'lucide-react'
import type {
  Agent,
  AppInfo,
  ConnectorPairingEvent,
  ConnectorSummary,
  ConnectorTool,
  DbStatus,
  LibrarySkill,
  LibrarySkillDetail,
  LocalSkillCandidate,
  SkillImportPreview,
  ProviderId,
  ProviderStatus,
  SetupStatus,
  SystemPaths,
  WorkspaceUpdateSystemDefaultInput
} from '@shared/contracts'
import {
  getDefaultModelForProvider,
  getProviderModelOptions,
  isKnownProviderModel
} from '@shared/provider-models'
import { getProviderDisplayName } from '@shared/provider-labels'
import { CopyButton } from '@renderer/components/copy-button'
import { SelectControl } from '@renderer/components/select-control'
import { Badge } from '@renderer/components/ui/badge'
import { StatusBadge } from './settings/_shared'
import { Switch } from '@renderer/components/ui/switch'
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
import { cn } from '@renderer/lib/utils'
import { DiagnosticsSection } from './settings/diagnostics-section'
import { OrdinusSettingsSection } from './settings/ordinus-settings-section'
import { RemoteAccessSection } from './settings/remote-access-section'
import { WorkspaceSection } from './settings/workspace-section'

type SettingsScreenProps = {
  appInfo: AppInfo | null
  paths: SystemPaths | null
  dbStatus: DbStatus | null
  setupStatus: SetupStatus | null
  busyAction: string
  setupError: string
  onConnectProvider: (providerId: ProviderId) => Promise<void>
  onDisconnectProvider: (providerId: ProviderId) => Promise<void>
  onRefreshProvider: (providerId: ProviderId) => Promise<void>
  onUpdateSystemDefault: (input: WorkspaceUpdateSystemDefaultInput) => Promise<void>
}

type SettingsSectionId =
  | 'workspace'
  | 'providers'
  | 'ordinus'
  | 'remote-access'
  | 'connections'
  | 'skill-library'
  | 'diagnostics'

const settingsSections = [
  {
    id: 'workspace',
    label: 'Workspace',
    description: 'The folder agents work in',
    icon: FolderOpen
  },
  {
    id: 'providers',
    label: 'Providers',
    description: 'Codex, Claude, and future CLIs',
    icon: PlugZap
  },
  {
    id: 'ordinus',
    label: 'Ordinus',
    description: 'Provider, model, and instructions for the in-app assistant',
    icon: Sparkles
  },
  {
    id: 'remote-access',
    label: 'Remote access',
    description: 'Reach Ordinus from your phone via Telegram',
    icon: Smartphone
  },
  {
    id: 'connections',
    label: 'Connections',
    description: 'External systems agents can use',
    icon: Plug
  },
  {
    id: 'skill-library',
    label: 'Skill library',
    description: 'Shared skills agents can be assigned',
    icon: Library
  },
  {
    id: 'diagnostics',
    label: 'Diagnostics',
    description: 'App info, paths, and database state',
    icon: MonitorCog
  }
] satisfies Array<{
  id: SettingsSectionId
  label: string
  description: string
  icon: typeof FolderOpen
}>

export function SettingsScreen({
  appInfo,
  paths,
  dbStatus,
  setupStatus,
  busyAction,
  setupError,
  onConnectProvider,
  onDisconnectProvider,
  onRefreshProvider,
  onUpdateSystemDefault
}: SettingsScreenProps): React.JSX.Element {
  const [activeSection, setActiveSection] = useState<SettingsSectionId>('workspace')
  const codex = useMemo(
    () => setupStatus?.providers.find((provider) => provider.id === 'codex'),
    [setupStatus?.providers]
  )

  return (
    <div className="grid gap-4 py-6">
      {setupError ? (
        <Card className="border-status-attention/20 bg-primary-soft">
          <CardHeader>
            <CardTitle>Settings need attention</CardTitle>
            <CardDescription>{setupError}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <aside className="h-fit rounded-lg border bg-card p-2" aria-label="Settings sections">
          <nav className="grid gap-1">
            {settingsSections.map((section) => (
              <div key={section.id} className="contents">
                {/* Diagnostics is an info screen, not a setting — set it apart. */}
                {section.id === 'diagnostics' ? (
                  <div className="my-1 border-t" aria-hidden="true" />
                ) : null}
                <button
                  type="button"
                  onClick={() => setActiveSection(section.id)}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-md px-3 py-3 text-left transition-colors',
                    activeSection === section.id
                      ? 'bg-primary-soft text-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  )}
                >
                  <section.icon className="mt-0.5 size-4 shrink-0" />
                  <span className="grid min-w-0 gap-1">
                    <span className="text-sm font-medium leading-tight">{section.label}</span>
                    <span className="text-xs leading-5">{section.description}</span>
                  </span>
                </button>
              </div>
            ))}
          </nav>
        </aside>

        <section className="min-w-0">
          {activeSection === 'workspace' ? (
            <WorkspaceSection
              workspaceRoot={setupStatus?.workspace?.workspaceRoot ?? ''}
              configured={Boolean(setupStatus?.workspaceConfigured)}
            />
          ) : null}

          {activeSection === 'providers' ? (
            <ProvidersSettingsSection
              setupStatus={setupStatus}
              codex={codex}
              busyAction={busyAction}
              onConnectProvider={onConnectProvider}
              onDisconnectProvider={onDisconnectProvider}
              onRefreshProvider={onRefreshProvider}
              onUpdateSystemDefault={onUpdateSystemDefault}
            />
          ) : null}

          {activeSection === 'ordinus' ? <OrdinusSettingsSection /> : null}

          {activeSection === 'remote-access' ? <RemoteAccessSection /> : null}

          {activeSection === 'connections' ? <ConnectionsSettingsSection /> : null}

          {activeSection === 'skill-library' ? <SkillLibrarySettingsSection /> : null}

          {activeSection === 'diagnostics' ? (
            <DiagnosticsSection
              appInfo={appInfo}
              paths={paths}
              dbStatus={dbStatus}
              workspaceRoot={setupStatus?.workspace?.workspaceRoot ?? ''}
            />
          ) : null}
        </section>
      </div>
    </div>
  )
}

// ADR-040: the shared skill library — builtin skills ship with the app and
// refresh on update; agents get them via assignment from their Skills tab.
// Imported skills join this list when the import flow lands.
function SkillLibrarySettingsSection(): React.JSX.Element {
  const [skills, setSkills] = useState<LibrarySkill[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [viewing, setViewing] = useState<LibrarySkillDetail | null>(null)
  const [viewError, setViewError] = useState('')
  const [importOpen, setImportOpen] = useState(false)

  useEffect(() => {
    let active = true
    window.ordinus.skills
      .listLibrary()
      .then((list) => {
        if (active) {
          setSkills(list)
          setError('')
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : 'Skill library could not be loaded.')
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [])

  async function openSkill(librarySkillId: string): Promise<void> {
    try {
      setViewError('')
      setViewing(await window.ordinus.skills.getLibrarySkill({ librarySkillId }))
    } catch (cause) {
      setViewError(cause instanceof Error ? cause.message : 'Skill could not be opened.')
    }
  }

  return (
    <div className="grid gap-4">
      <section className="grid gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold leading-6">Skill library</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Shared skills any agent can be assigned from its Skills tab. Ordinus skills ship with
              the app and refresh on updates; to change one for a single agent, use Copy &amp;
              customize on that agent.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">
              {skills.length} skill{skills.length === 1 ? '' : 's'}
            </Badge>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-2.5 text-xs"
              onClick={() => setImportOpen(true)}
            >
              <Download />
              Import skill
            </Button>
          </div>
        </div>

        {error || viewError ? (
          <p className="text-sm text-destructive" role="alert">
            {error || viewError}
          </p>
        ) : null}

        {loading ? (
          <div className="grid min-h-[160px] place-items-center text-sm text-muted-foreground">
            Loading skill library…
          </div>
        ) : skills.length === 0 ? (
          <div className="grid min-h-[160px] place-items-center rounded-md border bg-accent text-sm text-muted-foreground">
            The skill library is empty
          </div>
        ) : (
          <ul className="divide-y rounded-md border">
            {skills.map((skill) => (
              <li key={skill.id}>
                <button
                  type="button"
                  className="flex w-full items-start justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-accent"
                  onClick={() => void openSkill(skill.id)}
                >
                  <span className="grid min-w-0 gap-0.5">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <span className="truncate">{skill.name}</span>
                      <Badge variant="outline" className="shrink-0">
                        {skill.origin === 'builtin' ? 'Ordinus' : 'Imported'}
                      </Badge>
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {skill.description}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(skill.updatedAt).toLocaleDateString()}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog open={viewing !== null} onOpenChange={(open) => (open ? null : setViewing(null))}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{viewing?.name ?? 'Library skill'}</DialogTitle>
            <DialogDescription>{viewing?.description}</DialogDescription>
          </DialogHeader>
          <pre className="ordinus-scrollbar max-h-96 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-card p-3 font-mono text-xs leading-5">
            {viewing?.body ?? ''}
          </pre>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setViewing(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImportSkillDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={(skill) =>
          setSkills((current) =>
            [...current.filter((existing) => existing.id !== skill.id), skill].sort((left, right) =>
              left.name.localeCompare(right.name)
            )
          )
        }
      />
    </div>
  )
}

// ADR-040 §5: import wizard — pick a source (skills found on this machine or
// a folder), read the full instructions in the trust preview, then import and
// optionally assign to agents. Security stance: show-and-confirm, executables
// called out, nothing runs at import time.
type ImportStep = 'source' | 'preview' | 'assign'

function ImportSkillDialog({
  open,
  onOpenChange,
  onImported
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported: (skill: LibrarySkill) => void
}): React.JSX.Element {
  const [step, setStep] = useState<ImportStep>('source')
  const [candidates, setCandidates] = useState<LocalSkillCandidate[]>([])
  const [scanning, setScanning] = useState(false)
  const [preview, setPreview] = useState<SkillImportPreview | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [imported, setImported] = useState<LibrarySkill | null>(null)
  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedAgentIds, setSelectedAgentIds] = useState<Set<string>>(new Set())
  const [assigning, setAssigning] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) {
      return undefined
    }
    let active = true

    async function loadSources(): Promise<void> {
      try {
        setStep('source')
        setPreview(null)
        setImported(null)
        setSelectedAgentIds(new Set())
        setError('')
        setScanning(true)
        const [localSkills, agentList] = await Promise.all([
          window.ordinus.skills.scanLocal(),
          window.ordinus.agents.list()
        ])
        if (active) {
          setCandidates(localSkills)
          setAgents(agentList.filter((agent) => !agent.archivedAt))
        }
      } catch (cause) {
        if (active) {
          setError(cause instanceof Error ? cause.message : 'Local skills could not be scanned.')
        }
      } finally {
        if (active) {
          setScanning(false)
        }
      }
    }

    void loadSources()
    return () => {
      active = false
    }
  }, [open])

  async function openPreview(sourcePath: string): Promise<void> {
    try {
      setPreviewing(true)
      setError('')
      setPreview(await window.ordinus.skills.previewImport({ sourcePath }))
      setStep('preview')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The skill could not be read.')
    } finally {
      setPreviewing(false)
    }
  }

  async function pickFolder(): Promise<void> {
    try {
      setError('')
      const result = await window.ordinus.skills.selectImportFolder()
      if (!result.cancelled && result.sourcePath) {
        await openPreview(result.sourcePath)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The folder could not be opened.')
    }
  }

  async function confirmImport(): Promise<void> {
    if (!preview || importing) {
      return
    }
    try {
      setImporting(true)
      setError('')
      const skill = await window.ordinus.skills.import({ sourcePath: preview.sourcePath })
      setImported(skill)
      onImported(skill)
      setStep('assign')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The skill could not be imported.')
    } finally {
      setImporting(false)
    }
  }

  async function assignToAgents(): Promise<void> {
    if (!imported || assigning) {
      return
    }
    try {
      setAssigning(true)
      setError('')
      for (const agentId of selectedAgentIds) {
        await window.ordinus.agents.assignLibrarySkill({
          agentId,
          librarySkillId: imported.id
        })
      }
      onOpenChange(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The skill could not be assigned.')
    } finally {
      setAssigning(false)
    }
  }

  const executableFiles = preview?.files.filter((file) => file.executable) ?? []

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        // Esc/overlay must not abandon an in-flight import or assignment —
        // the loop would keep running invisibly with nowhere to show errors.
        if (!nextOpen && (importing || assigning)) {
          return
        }
        onOpenChange(nextOpen)
      }}
    >
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle>
            {step === 'source'
              ? 'Import skill'
              : step === 'preview'
                ? `Review before importing`
                : 'Skill imported'}
          </DialogTitle>
          <DialogDescription>
            {step === 'source'
              ? 'Bring a skill into the shared library from this machine or a folder.'
              : step === 'preview'
                ? 'These are instructions your agents will follow. Read them before trusting.'
                : `${imported?.name ?? 'The skill'} is in the library. Assign it to agents now or later from each agent's Skills tab.`}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        {step === 'source' ? (
          <div className="ordinus-scrollbar grid min-h-0 flex-1 content-start gap-2 overflow-y-auto">
            {scanning ? (
              <p className="py-3 text-sm text-muted-foreground">Scanning this machine…</p>
            ) : candidates.length > 0 ? (
              candidates.map((candidate) => (
                <button
                  key={candidate.sourcePath}
                  type="button"
                  className="grid gap-0.5 rounded-lg border bg-card p-3 text-left transition-colors hover:border-ring disabled:opacity-60"
                  disabled={previewing}
                  onClick={() => void openPreview(candidate.sourcePath)}
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <span className="truncate">{candidate.name}</span>
                    <Badge variant="outline" className="shrink-0">
                      {candidate.foundIn}
                    </Badge>
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {candidate.description}
                  </span>
                </button>
              ))
            ) : (
              <p className="py-3 text-sm text-muted-foreground">
                No skills found in the usual CLI folders (~/.claude, ~/.codex, ~/.gemini,
                ~/.agents).
              </p>
            )}
          </div>
        ) : null}

        {step === 'preview' && preview ? (
          <div className="ordinus-scrollbar grid min-h-0 flex-1 content-start gap-3 overflow-y-auto">
            <div>
              <p className="text-sm font-semibold">{preview.name}</p>
              <p className="text-xs text-muted-foreground">{preview.description}</p>
            </div>
            {executableFiles.length > 0 ? (
              <p className="rounded-lg border border-status-attention/40 bg-status-attention/10 p-3 text-xs text-status-attention">
                This skill bundles {executableFiles.length} executable file
                {executableFiles.length > 1 ? 's' : ''} (
                {executableFiles.map((file) => file.name).join(', ')}). Agents may run them while
                applying the skill.
              </p>
            ) : null}
            <pre className="ordinus-scrollbar max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-card p-3 font-mono text-xs leading-5">
              {preview.body}
            </pre>
            {preview.files.length > 1 ? (
              <p className="text-xs text-muted-foreground">
                Files: {preview.files.map((file) => file.name).join(' · ')}
              </p>
            ) : null}
          </div>
        ) : null}

        {step === 'assign' ? (
          <div className="ordinus-scrollbar grid min-h-0 flex-1 content-start gap-2 overflow-y-auto">
            {agents.length === 0 ? (
              <p className="py-3 text-sm text-muted-foreground">No agents yet.</p>
            ) : (
              agents.map((agent) => {
                const checked = selectedAgentIds.has(agent.id)
                return (
                  <label
                    key={agent.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border bg-card p-3"
                  >
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={checked}
                      onChange={() =>
                        setSelectedAgentIds((current) => {
                          const next = new Set(current)
                          if (checked) {
                            next.delete(agent.id)
                          } else {
                            next.add(agent.id)
                          }
                          return next
                        })
                      }
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{agent.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {agent.role}
                      </span>
                    </span>
                  </label>
                )
              })
            )}
          </div>
        ) : null}

        <DialogFooter>
          {step === 'source' ? (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={previewing}
                className="mr-auto"
                onClick={() => void pickFolder()}
              >
                <FolderOpen />
                Choose folder…
              </Button>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
            </>
          ) : null}
          {step === 'preview' ? (
            <>
              <Button
                type="button"
                variant="ghost"
                disabled={importing}
                className="mr-auto"
                onClick={() => setStep('source')}
              >
                Back
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={importing}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="button" disabled={importing} onClick={() => void confirmImport()}>
                {importing ? <Loader2 className="animate-spin" /> : <ShieldCheck />}I trust these
                instructions — import
              </Button>
            </>
          ) : null}
          {step === 'assign' ? (
            <>
              <Button
                type="button"
                variant="ghost"
                disabled={assigning}
                onClick={() => onOpenChange(false)}
              >
                Done
              </Button>
              <Button
                type="button"
                disabled={assigning || selectedAgentIds.size === 0}
                onClick={() => void assignToAgents()}
              >
                {assigning ? <Loader2 className="animate-spin" /> : null}
                Assign to {selectedAgentIds.size || 'selected'} agent
                {selectedAgentIds.size === 1 ? '' : 's'}
              </Button>
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ConnectionsSettingsSection(): React.JSX.Element {
  const [connectors, setConnectors] = useState<ConnectorSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  // ADR-042: pairing-login connectors (WhatsApp) connect through a dialog
  // that collects the phone number and displays the device-linking code.
  const [pairingConnector, setPairingConnector] = useState<ConnectorSummary | null>(null)
  // ADR-043: BYO-OAuth connectors (Google) connect through a setup wizard that
  // walks the user through creating their own OAuth client.
  const [googleConnector, setGoogleConnector] = useState<ConnectorSummary | null>(null)
  // ADR-045 B5: every fresh connection opens a consistent intro first (what it
  // does + where the credential lives), then routes to the type-specific flow.
  const [introConnector, setIntroConnector] = useState<ConnectorSummary | null>(null)

  useEffect(() => {
    let active = true
    window.ordinus.connectors
      .list()
      .then((list) => {
        if (active) {
          setConnectors(list)
          setError('')
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : 'Failed to load connectors.')
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [])

  const runAction = useCallback(async (connectorId: string, action: 'connect' | 'disconnect') => {
    try {
      setBusyId(connectorId)
      setError('')
      const next =
        action === 'connect'
          ? await window.ordinus.connectors.connect({ connectorId })
          : await window.ordinus.connectors.disconnect({ connectorId })
      setConnectors(next)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Failed to ${action} connector.`)
    } finally {
      setBusyId('')
    }
  }, [])

  // ADR-043: "Remove setup" — drop the stored BYO OAuth client entirely, so the
  // next Connect restarts the wizard from scratch.
  const runForget = useCallback(async (connectorId: string) => {
    try {
      setBusyId(connectorId)
      setError('')
      const next = await window.ordinus.connectors.forgetClient({ connectorId })
      setConnectors(next)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to remove setup.')
    } finally {
      setBusyId('')
    }
  }, [])

  // Route a fresh connect to its type-specific flow once the intro is accepted.
  const proceedConnect = useCallback(
    (connector: ConnectorSummary) => {
      setIntroConnector(null)
      if (connector.pairingLogin) {
        setPairingConnector(connector)
      } else if (connector.byoOAuthLogin) {
        setGoogleConnector(connector)
      } else {
        void runAction(connector.id, 'connect')
      }
    },
    [runAction]
  )

  return (
    <div className="grid gap-4">
      <section className="grid gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold leading-6">Connections</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              External systems your agents can use — email, calendar, chat, and more. Connect one
              once; Ordinus stores only the credential, never your data. Each agent uses only the
              connections you enable for it.
            </p>
          </div>
          <Badge variant="secondary">
            {connectors.filter((connector) => connector.connected).length} connected
          </Badge>
        </div>

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        {loading ? (
          <div className="grid min-h-[160px] place-items-center text-sm text-muted-foreground">
            Loading connectors…
          </div>
        ) : connectors.length === 0 ? (
          <div className="grid min-h-[160px] place-items-center rounded-md border bg-accent text-sm text-muted-foreground">
            No connectors available
          </div>
        ) : (
          <ul className="divide-y rounded-md border">
            {connectors.map((connector) => {
              // Same button in both the connected and not-connected branches —
              // it depends only on whether a BYO client is stored.
              const removeSetupButton = connector.byoClientConfigured ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busyId === connector.id}
                  onClick={() => void runForget(connector.id)}
                >
                  Remove setup
                </Button>
              ) : null
              return (
                <li
                  key={connector.id}
                  className="flex items-center justify-between gap-4 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{connector.label}</span>
                      {(() => {
                        const s = getConnectorStatus(connector)
                        return <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
                      })()}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {connector.kind === 'local'
                        ? `Runs on this computer · managed by Ordinus${
                            connector.installedVersion ? ` · v${connector.installedVersion}` : ''
                          }`
                        : `${connector.transport} · ${connector.authMethod}`}
                    </p>
                    {connector.interactiveLogin && !connector.connected ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Connect opens a sign-in window — log in to your account there to finish.
                      </p>
                    ) : null}
                    {connector.byoOAuthLogin && !connector.connected ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {connector.byoClientConfigured
                          ? 'Reconnect re-approves access in a Google window (personal apps re-auth periodically).'
                          : 'Connect walks you through creating your own Google app — your data stays under your permissions.'}
                      </p>
                    ) : null}
                    {connector.kind === 'local' && connector.connected ? (
                      <LocalConnectorTools connectorId={connector.id} />
                    ) : null}
                  </div>
                  {connector.connected ? (
                    <div className="flex shrink-0 items-center gap-2">
                      {(connector.pairingLogin || connector.byoOAuthLogin) &&
                      connector.health === 'reconnect-required' ? (
                        <Button
                          size="sm"
                          disabled={busyId === connector.id}
                          onClick={() =>
                            connector.byoOAuthLogin
                              ? setGoogleConnector(connector)
                              : setPairingConnector(connector)
                          }
                        >
                          Reconnect
                        </Button>
                      ) : null}
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busyId === connector.id}
                        onClick={() => void runAction(connector.id, 'disconnect')}
                      >
                        Disconnect
                      </Button>
                      {removeSetupButton}
                    </div>
                  ) : (
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        size="sm"
                        disabled={busyId === connector.id}
                        onClick={() =>
                          // Reconnect (BYO client already stored) skips the
                          // intro — the user has seen it. Fresh connects open it.
                          connector.byoClientConfigured
                            ? setGoogleConnector(connector)
                            : setIntroConnector(connector)
                        }
                      >
                        {busyId === connector.id
                          ? connector.kind === 'local'
                            ? 'Preparing…'
                            : 'Connecting…'
                          : connector.byoClientConfigured
                            ? 'Reconnect'
                            : 'Connect'}
                      </Button>
                      {removeSetupButton}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
      <PairingConnectDialog
        // Remount per connector open so the dialog always starts fresh —
        // no reset effect needed.
        key={pairingConnector?.id ?? 'closed'}
        connector={pairingConnector}
        onOpenChange={(open) => {
          if (!open) {
            setPairingConnector(null)
          }
        }}
        onConnected={(next) => {
          setConnectors(next)
          setPairingConnector(null)
        }}
      />
      <GoogleConnectDialog
        key={googleConnector ? `google-${googleConnector.id}` : 'google-closed'}
        connector={googleConnector}
        onOpenChange={(open) => {
          if (!open) {
            setGoogleConnector(null)
          }
        }}
        onConnected={(next) => {
          setConnectors(next)
          setGoogleConnector(null)
        }}
      />
      <ConnectorConnectIntro
        connector={introConnector}
        onOpenChange={(open) => {
          if (!open) {
            setIntroConnector(null)
          }
        }}
        onProceed={proceedConnect}
      />
    </div>
  )
}

// ADR-045 A4 — connector status mapped to the shared vocabulary.
function getConnectorStatus(connector: ConnectorSummary): {
  tone: 'connected' | 'idle' | 'action' | 'error'
  label: string
} {
  if (!connector.connected) {
    return { tone: 'idle', label: 'Not connected' }
  }
  if (connector.health === 'unhealthy') {
    return { tone: 'error', label: 'Unhealthy' }
  }
  if (connector.health === 'reconnect-required') {
    return { tone: 'action', label: 'Reconnect required' }
  }
  return { tone: 'connected', label: 'Connected' }
}

// ADR-045 B5 — the consistent "front door" before any fresh connection. Says
// what the connection is for and where the credential lives, then hands off to
// the type-specific flow (sign-in window, pairing dialog, or BYO-OAuth wizard).
// Capability detail is deliberately honest: we don't have a per-connector tool
// list at this point, so we promise the user they'll review and choose after
// connecting rather than fabricating a summary.
function ConnectorConnectIntro({
  connector,
  onOpenChange,
  onProceed
}: {
  connector: ConnectorSummary | null
  onOpenChange: (open: boolean) => void
  onProceed: (connector: ConnectorSummary) => void
}): React.JSX.Element {
  const trustLine = connector?.byoOAuthLogin
    ? 'Connect walks you through creating your own app — your data stays under your permissions, with no Ordinus-owned app in the middle.'
    : connector?.kind === 'local'
      ? 'This connector runs on your computer, managed by Ordinus. Your data never leaves this machine.'
      : 'Ordinus stores only the credential on this machine — never your data.'

  return (
    <Dialog open={connector !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect {connector?.label ?? 'connector'}</DialogTitle>
          <DialogDescription>
            Give your agents access to {connector?.label ?? 'this system'}. Only agents you enable
            it for will use it.
          </DialogDescription>
        </DialogHeader>

        {/* Ordinus ⇄ connector — the classic two-systems-connecting cue. */}
        <div className="flex items-center justify-center gap-3 rounded-lg border bg-accent/40 py-4">
          <span className="rounded-md border bg-card px-3 py-1.5 text-sm font-medium">Ordinus</span>
          <Plug className="size-4 text-muted-foreground" />
          <span className="rounded-md border bg-card px-3 py-1.5 text-sm font-medium">
            {connector?.label ?? '—'}
          </span>
        </div>

        <div className="grid gap-2 text-sm leading-6 text-muted-foreground">
          <p>
            After connecting, you&apos;ll see exactly what {connector?.label ?? 'it'} can do and
            choose which actions to allow
            {connector?.kind === 'local' ? ' under the connector' : ''}.
          </p>
          <p className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>{trustLine}</span>
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => connector && onProceed(connector)}>
            Connect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ADR-042: pairing-login Connect flow (WhatsApp-class connectors). The user
// enters their phone number, the login child requests a device-linking code,
// and the code streams back over connectors:pairing-event while the connect
// invoke is still in flight. "Get a new code" simply restarts the run —
// codes expire after about a minute.
function PairingConnectDialog({
  connector,
  onOpenChange,
  onConnected
}: {
  connector: ConnectorSummary | null
  onOpenChange: (open: boolean) => void
  onConnected: (next: ConnectorSummary[]) => void
}): React.JSX.Element {
  const [phone, setPhone] = useState('')
  const [stage, setStage] = useState<'phone' | 'pairing' | 'error'>('phone')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  // "Get a new code" supersedes the in-flight login run (the main process
  // kills the old child); its rejected promise must not clobber the new
  // attempt's UI state, so each attempt gets an id and stale ones are ignored.
  const attemptRef = useRef(0)

  const startPairing = useCallback(async () => {
    if (!connector) {
      return
    }
    const digits = phone.replace(/\D/g, '')
    const thisAttempt = ++attemptRef.current
    setStage('pairing')
    setCode('')
    setError('')
    const unsubscribe = window.ordinus.connectors.onPairingEvent((event: ConnectorPairingEvent) => {
      if (event.connectorId !== connector.id) {
        return
      }
      if (event.event === 'pairing-code' && event.code) {
        setCode(event.code)
      }
    })
    try {
      const next = await window.ordinus.connectors.connect({
        connectorId: connector.id,
        phone: digits
      })
      onConnected(next)
    } catch (cause) {
      if (attemptRef.current === thisAttempt) {
        setError(cause instanceof Error ? cause.message : 'Pairing failed.')
        setStage('error')
      }
    } finally {
      unsubscribe()
    }
  }, [connector, phone, onConnected])

  const phoneDigits = phone.replace(/\D/g, '')

  return (
    <Dialog open={connector !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect {connector?.label}</DialogTitle>
          <DialogDescription>
            {connector?.label} doesn’t officially support third-party clients. Ordinus keeps usage
            conservative, but connecting is at your own discretion.
          </DialogDescription>
        </DialogHeader>
        {stage === 'phone' ? (
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="pairing-phone">
              Phone number
            </label>
            <Input
              id="pairing-phone"
              type="tel"
              autoFocus
              placeholder="+90 5XX XXX XX XX"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              The number of the account you want to link, with country code.
            </p>
          </div>
        ) : null}
        {stage === 'pairing' ? (
          <div className="grid gap-3">
            {code ? (
              <>
                <div className="grid place-items-center rounded-md border bg-accent px-4 py-6 font-mono text-3xl tracking-[0.3em]">
                  {code}
                </div>
                <p className="text-sm text-muted-foreground">
                  On your phone, open {connector?.label} → Settings → Linked Devices → Link a Device
                  → “Link with phone number instead”, then enter this code. It expires in about a
                  minute.
                </p>
              </>
            ) : (
              <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Requesting a linking code…
              </div>
            )}
          </div>
        ) : null}
        {stage === 'error' ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {stage === 'phone' ? (
            <Button
              type="button"
              disabled={phoneDigits.length < 7}
              onClick={() => void startPairing()}
            >
              Get linking code
            </Button>
          ) : null}
          {stage === 'pairing' && code ? (
            <Button type="button" variant="outline" onClick={() => void startPairing()}>
              Get a new code
            </Button>
          ) : null}
          {stage === 'error' ? (
            <Button type="button" onClick={() => void startPairing()}>
              Try again
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ADR-043: BYO-OAuth Connect flow (Google). First-time setup walks the user
// through creating their OWN Google Cloud OAuth client (deep-linked into the
// console), then they paste the downloaded client JSON. Connect hands the
// client to the main process, which runs the loopback/PKCE consent in a Google
// window; on success the connector is connected. Reconnect (client already
// stored) skips straight to the consent — used for the weekly Testing-mode
// re-auth. No Ordinus-owned app, no verification, no CASA: every request runs
// under the user's own app and consent.
const GOOGLE_CONSOLE_STEPS = [
  {
    label: 'Create a Google Cloud project (or pick an existing one)',
    url: 'https://console.cloud.google.com/projectcreate'
  },
  {
    label: 'Enable the Gmail, Calendar & Drive APIs — one click',
    url: 'https://console.cloud.google.com/flows/enableapi?apiid=gmail.googleapis.com,calendar-json.googleapis.com,drive.googleapis.com'
  },
  {
    label:
      'Configure the consent screen: choose External, add your own email under Test users, leave it in Testing',
    url: 'https://console.cloud.google.com/auth/overview'
  },
  {
    label: 'Create an OAuth client → application type “Desktop app” → then Download JSON',
    url: 'https://console.cloud.google.com/auth/clients'
  }
]

function parseGoogleClientJson(text: string): { clientId: string; clientSecret: string } | null {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>
    // Desktop clients download as { "installed": { client_id, client_secret } };
    // accept "web" and a flat object too, in case the user pasted a sub-object.
    const node = (parsed.installed ?? parsed.web ?? parsed) as Record<string, unknown>
    const clientId = node.client_id
    const clientSecret = node.client_secret
    if (
      typeof clientId === 'string' &&
      typeof clientSecret === 'string' &&
      clientId &&
      clientSecret
    ) {
      return { clientId, clientSecret }
    }
  } catch {
    // not JSON
  }
  return null
}

function GoogleConnectDialog({
  connector,
  onOpenChange,
  onConnected
}: {
  connector: ConnectorSummary | null
  onOpenChange: (open: boolean) => void
  onConnected: (next: ConnectorSummary[]) => void
}): React.JSX.Element {
  const reconnect = connector?.byoClientConfigured ?? false
  const [stage, setStage] = useState<'setup' | 'authorizing' | 'error'>('setup')
  const [json, setJson] = useState('')
  const [error, setError] = useState('')

  const parsedClient = useMemo(() => parseGoogleClientJson(json), [json])

  const startConnect = useCallback(
    async (oauthClient?: { clientId: string; clientSecret: string }) => {
      if (!connector) {
        return
      }
      setStage('authorizing')
      setError('')
      try {
        const next = await window.ordinus.connectors.connect({
          connectorId: connector.id,
          oauthClient
        })
        onConnected(next)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not connect Google.')
        setStage('error')
      }
    },
    [connector, onConnected]
  )

  // Closing the dialog mid-consent aborts the in-flight loopback OAuth so it
  // doesn't linger in the main process until the timeout.
  const requestClose = useCallback(() => {
    if (stage === 'authorizing' && connector) {
      void window.ordinus.connectors.cancelConnect({ connectorId: connector.id })
    }
    onOpenChange(false)
  }, [stage, connector, onOpenChange])

  // Reconnect reuses the stored client (no payload); first-time setup needs the
  // pasted client. Shared by the Connect/Reconnect and Try-again buttons.
  const submit = useCallback(() => {
    if (reconnect) return void startConnect()
    if (parsedClient) return void startConnect(parsedClient)
  }, [reconnect, parsedClient, startConnect])

  return (
    <Dialog open={connector !== null} onOpenChange={(open) => !open && requestClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{reconnect ? 'Reconnect Google' : 'Connect Google'}</DialogTitle>
          <DialogDescription>
            Ordinus uses <span className="font-medium">your own</span> Google app, so your data
            stays under your permissions — there’s no Ordinus-owned app in the middle.
          </DialogDescription>
        </DialogHeader>

        {stage === 'setup' && !reconnect ? (
          <div className="grid gap-3">
            <ol className="grid gap-2">
              {GOOGLE_CONSOLE_STEPS.map((step, index) => (
                <li key={step.url} className="flex items-start gap-2 text-sm">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-accent text-xs font-medium">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 leading-6">{step.label}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => void window.ordinus.system.openExternal(step.url)}
                  >
                    Open
                    <ExternalLink className="ml-1 size-3" />
                  </Button>
                </li>
              ))}
            </ol>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium" htmlFor="google-client-json">
                Paste the downloaded client JSON
              </label>
              <textarea
                id="google-client-json"
                autoFocus
                rows={5}
                spellCheck={false}
                placeholder={'{ "installed": { "client_id": "…", "client_secret": "…", … } }'}
                value={json}
                onChange={(event) => setJson(event.target.value)}
                className={cn(
                  'w-full resize-none rounded-md border bg-transparent px-3 py-2 font-mono text-xs leading-5 shadow-sm',
                  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
                )}
              />
              <p className="text-xs text-muted-foreground">
                {json && !parsedClient
                  ? 'That doesn’t look like a Desktop OAuth client JSON yet — paste the whole downloaded file.'
                  : 'We read only the Client ID and secret, encrypt them on this machine, and never send them anywhere but Google.'}
              </p>
            </div>
          </div>
        ) : null}

        {stage === 'setup' && reconnect ? (
          <p className="text-sm leading-6 text-muted-foreground">
            Personal Google apps in test mode re-authorize about once a week — this is Google’s
            rule, not a limit Ordinus adds. Click Reconnect, then choose your account and Allow in
            the Google window (you’ll pass your own app’s “unverified” screen via Advanced →
            Continue).
          </p>
        ) : null}

        {stage === 'authorizing' ? (
          <div className="grid gap-2 py-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              Waiting for Google sign-in…
            </div>
            <p className="leading-6">
              A Google window opened — pick your account and click Allow. For your own app you’ll
              see “Google hasn’t verified this app”; choose{' '}
              <span className="font-medium">Advanced → Go to … (unsafe)</span> to continue. It’s
              your app, so this is expected.
            </p>
          </div>
        ) : null}

        {stage === 'error' ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={requestClose}>
            Cancel
          </Button>
          {stage === 'setup' && !reconnect ? (
            <Button type="button" disabled={!parsedClient} onClick={submit}>
              Connect
            </Button>
          ) : null}
          {stage === 'setup' && reconnect ? (
            <Button type="button" onClick={submit}>
              Reconnect
            </Button>
          ) : null}
          {stage === 'error' ? (
            <Button type="button" onClick={submit}>
              Try again
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ADR-041: per-connector global tool permissions for managed local MCP
// servers. The catalog comes from the server itself (tools/list at Connect
// time); outward-acting tools are born disabled by the manifest defaults and
// the user opts in here. Enforcement happens at the loopback proxy.
function LocalConnectorTools({ connectorId }: { connectorId: string }): React.JSX.Element {
  const [tools, setTools] = useState<ConnectorTool[]>([])
  const [expanded, setExpanded] = useState(false)
  const [busyTool, setBusyTool] = useState('')

  useEffect(() => {
    if (!expanded) return
    let active = true
    window.ordinus.connectors
      .listTools({ connectorId })
      .then((result) => {
        if (active) setTools(result.tools)
      })
      .catch(() => {
        if (active) setTools([])
      })
    return () => {
      active = false
    }
  }, [connectorId, expanded])

  async function toggleTool(name: string, enabled: boolean): Promise<void> {
    const next = enabled
      ? [...tools.filter((t) => t.enabled).map((t) => t.name), name]
      : tools.filter((t) => t.enabled && t.name !== name).map((t) => t.name)
    try {
      setBusyTool(name)
      const result = await window.ordinus.connectors.setEnabledTools({
        connectorId,
        enabledTools: next
      })
      setTools(result.tools)
    } catch {
      // Leave the switches as they were; the next expand re-reads from main.
    } finally {
      setBusyTool('')
    }
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        className="text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? 'Hide tools' : 'Manage tools'}
      </button>
      {expanded ? (
        tools.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">No tools discovered.</p>
        ) : (
          <ul className="mt-2 grid gap-2 rounded-md border bg-accent/40 p-3">
            {tools.map((tool) => (
              <li key={tool.name} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium">{tool.name}</p>
                  <p className="text-xs text-muted-foreground">{tool.description}</p>
                </div>
                <Switch
                  checked={tool.enabled}
                  disabled={busyTool === tool.name}
                  onCheckedChange={(checked) => void toggleTool(tool.name, checked)}
                />
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  )
}

function ProvidersSettingsSection({
  setupStatus,
  codex,
  busyAction,
  onConnectProvider,
  onDisconnectProvider,
  onRefreshProvider,
  onUpdateSystemDefault
}: {
  setupStatus: SetupStatus | null
  codex: ProviderStatus | undefined
  busyAction: string
  onConnectProvider: (providerId: ProviderId) => Promise<void>
  onDisconnectProvider: (providerId: ProviderId) => Promise<void>
  onRefreshProvider: (providerId: ProviderId) => Promise<void>
  onUpdateSystemDefault: (input: WorkspaceUpdateSystemDefaultInput) => Promise<void>
}): React.JSX.Element {
  const otherProviders = setupStatus?.providers.filter((provider) => provider.id !== 'codex') ?? []
  const providers = codex ? [codex, ...otherProviders] : otherProviders
  const defaultProviderId = setupStatus?.workspace?.defaultProviderId ?? 'codex'
  const defaultModel = setupStatus?.workspace?.defaultModel ?? 'default'
  const connectedCount = providers.filter((provider) => provider.connected).length

  // Connections first, then the default: you connect a provider before you can
  // make it the default. The default panel is the result of that flow (ADR-045).
  return (
    <div className="grid gap-4">
      <section className="grid gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold leading-6">Connections</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              The local AI CLIs Ordinus runs agents on. Sign in to one to start working.
            </p>
          </div>
          <StatusBadge tone={connectedCount > 0 ? 'connected' : 'idle'}>
            {connectedCount > 0 ? `${connectedCount} connected` : 'None connected'}
          </StatusBadge>
        </div>

        {providers.map((provider) => (
          <ProviderConnectionRow
            key={provider.id}
            provider={provider}
            defaultProviderId={defaultProviderId}
            busyAction={busyAction}
            onConnect={() => onConnectProvider(provider.id)}
            onDisconnect={() => onDisconnectProvider(provider.id)}
            onRefresh={() => onRefreshProvider(provider.id)}
          />
        ))}
      </section>

      <SystemDefaultSettingsPanel
        key={`${defaultProviderId}:${defaultModel}:${setupStatus?.workspace?.updatedAt ?? 'empty'}`}
        providers={providers}
        workspaceConfigured={Boolean(setupStatus?.workspaceConfigured)}
        anyConnected={connectedCount > 0}
        initialProviderId={defaultProviderId}
        initialModel={defaultModel}
        busyAction={busyAction}
        onSave={onUpdateSystemDefault}
      />
    </div>
  )
}

function ProviderConnectionRow({
  provider,
  defaultProviderId,
  busyAction,
  onConnect,
  onDisconnect,
  onRefresh
}: {
  provider: ProviderStatus
  defaultProviderId: ProviderId
  busyAction: string
  onConnect: () => Promise<void>
  onDisconnect: () => Promise<void>
  onRefresh: () => Promise<void>
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const providerName = getProviderDisplayName(provider.id)
  const isDefault = provider.id === defaultProviderId
  const status = getProviderConnectionStatus(provider)

  async function disconnect(): Promise<void> {
    if (!confirmProviderDisconnect(providerName)) return

    await onDisconnect()
  }

  return (
    <article className="overflow-hidden rounded-lg border bg-card">
      <div className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-md border',
              provider.connected
                ? 'border-status-completed/20 bg-status-completed/10 text-status-completed'
                : provider.installed
                  ? 'border-border bg-accent text-muted-foreground'
                  : 'border-status-attention/20 bg-status-attention/10 text-status-attention'
            )}
          >
            <ProviderGlyph providerId={provider.id} />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold leading-6">{provider.label}</h3>
              {isDefault ? (
                <Badge variant="secondary" className="gap-1">
                  <CheckCircle2 className="size-3" />
                  Default
                </Badge>
              ) : null}
              <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
            </div>
            <p className="mt-1 truncate text-sm leading-6 text-muted-foreground">
              {getProviderSummary(provider)}
            </p>
          </div>
        </div>

        <ProviderConnectionActions
          provider={provider}
          providerName={providerName}
          busyAction={busyAction}
          expanded={expanded}
          onConnect={onConnect}
          onDisconnect={disconnect}
          onRefresh={onRefresh}
          onToggleDetails={() => setExpanded((current) => !current)}
        />
      </div>

      {expanded ? <ProviderConnectionDetails provider={provider} /> : null}
    </article>
  )
}

function ProviderConnectionActions({
  provider,
  providerName,
  busyAction,
  expanded,
  onConnect,
  onDisconnect,
  onRefresh,
  onToggleDetails
}: {
  provider: ProviderStatus
  providerName: string
  busyAction: string
  expanded: boolean
  onConnect: () => Promise<void>
  onDisconnect: () => Promise<void>
  onRefresh: () => Promise<void>
  onToggleDetails: () => void
}): React.JSX.Element {
  const isRefreshing = busyAction === `refresh-${provider.id}`
  const isConnecting = busyAction === `connect-${provider.id}`
  const isDisconnecting = busyAction === `disconnect-${provider.id}`

  return (
    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => void onRefresh()}
        disabled={Boolean(busyAction)}
        title={`Check ${providerName}`}
        aria-label={`Check ${providerName}`}
      >
        {isRefreshing ? <Loader2 className="animate-spin" /> : <RefreshCcw />}
      </Button>

      {provider.connected ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => void onDisconnect()}
          disabled={Boolean(busyAction)}
        >
          {isDisconnecting ? <Loader2 className="animate-spin" /> : <Unplug />}
          Disconnect
        </Button>
      ) : (
        <Button
          type="button"
          onClick={() => void onConnect()}
          disabled={!provider.installed || Boolean(busyAction)}
        >
          {isConnecting ? <Loader2 className="animate-spin" /> : <PlugZap />}
          Connect
        </Button>
      )}

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onToggleDetails}
        title={expanded ? 'Hide details' : 'Show details'}
        aria-expanded={expanded}
        aria-label={expanded ? 'Hide provider details' : 'Show provider details'}
      >
        <ChevronDown className={cn('transition-transform', expanded ? 'rotate-180' : 'rotate-0')} />
      </Button>
    </div>
  )
}

function ProviderConnectionDetails({ provider }: { provider: ProviderStatus }): React.JSX.Element {
  return (
    <dl className="grid gap-3 border-t bg-accent/40 p-4 md:grid-cols-2 xl:grid-cols-4">
      <CompactProviderDetail label="CLI" value={provider.installed ? 'Detected' : 'Not detected'} />
      <CompactProviderDetail label="Version" value={provider.version ?? '-'} />
      <CompactProviderDetail label="Account" value={provider.accountLabel || '-'} />
      <CompactProviderDetail
        label="Status"
        value={provider.connected ? 'Connected' : provider.note || '-'}
      />
      {provider.lastError ? (
        <p className="rounded-md border border-status-failed/20 bg-status-failed/10 px-3 py-2 text-xs leading-5 text-status-failed md:col-span-2 xl:col-span-4">
          {provider.lastError}
        </p>
      ) : null}
      {provider.installed ? (
        <p className="text-xs leading-5 text-muted-foreground md:col-span-2 xl:col-span-4">
          Disconnect removes only the provider credentials managed by Ordinus.
        </p>
      ) : (
        <div className="grid gap-1.5 md:col-span-2 xl:col-span-4">
          <p className="text-xs leading-5 text-muted-foreground">
            Install the CLI, then press Check to detect it:
          </p>
          <div className="group flex items-center justify-between gap-2 rounded-md bg-accent px-3 py-2">
            <code className="select-text break-all font-mono text-xs leading-5">
              {getProviderInstallCommand(provider.id)}
            </code>
            <CopyButton
              text={getProviderInstallCommand(provider.id)}
              label="Copy install command"
              className="opacity-0 transition-opacity group-hover:opacity-100"
            />
          </div>
        </div>
      )}
    </dl>
  )
}

// Official global-install commands. Ordinus installs these for you during
// onboarding; this is the path for adding a provider you skipped — once it's on
// PATH, `findCliExecutable` picks it up and Check detects it (ADR-028 fallback).
function getProviderInstallCommand(providerId: ProviderId): string {
  switch (providerId) {
    case 'codex':
      return 'npm install -g @openai/codex'
    case 'claude':
      return 'npm install -g @anthropic-ai/claude-code'
    case 'gemini':
      return 'npm install -g @google/gemini-cli'
    default:
      return ''
  }
}

function CompactProviderDetail({
  label,
  value
}: {
  label: string
  value: string
}): React.JSX.Element {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 truncate font-mono text-xs leading-5 text-foreground">{value}</dd>
    </div>
  )
}

function ProviderGlyph({ providerId }: { providerId: ProviderId }): React.JSX.Element {
  if (providerId === 'codex') return <Terminal className="size-5" />
  if (providerId === 'claude') return <Bot className="size-5" />
  if (providerId === 'gemini') return <Diamond className="size-5" />
  return <Code2 className="size-5" />
}

function getProviderConnectionStatus(provider: ProviderStatus): {
  label: string
  tone: 'connected' | 'action' | 'idle'
} {
  if (provider.connected) {
    return { label: 'Connected', tone: 'connected' }
  }

  if (provider.installed) {
    return { label: 'Needs login', tone: 'action' }
  }

  return { label: 'Not installed', tone: 'idle' }
}

function getProviderSummary(provider: ProviderStatus): string {
  if (!provider.installed) {
    return 'CLI not found.'
  }

  if (provider.connected) {
    return [provider.accountLabel || 'Connected account', provider.version]
      .filter(Boolean)
      .join(' · ')
  }

  return ['CLI detected', provider.version, provider.note].filter(Boolean).join(' · ')
}

function confirmProviderDisconnect(providerName: string): boolean {
  return window.confirm(
    `Disconnect ${providerName} from Ordinus? This only removes Ordinus-managed provider credentials.`
  )
}

function SystemDefaultSettingsPanel({
  providers,
  workspaceConfigured,
  anyConnected,
  initialProviderId,
  initialModel,
  busyAction,
  onSave
}: {
  providers: ProviderStatus[]
  workspaceConfigured: boolean
  anyConnected: boolean
  initialProviderId: ProviderId
  initialModel: string
  busyAction: string
  onSave: (input: WorkspaceUpdateSystemDefaultInput) => Promise<void>
}): React.JSX.Element {
  const [providerId, setProviderId] = useState<ProviderId>(initialProviderId)
  const [model, setModel] = useState(initialModel)
  const modelOptions = getProviderModelOptions(providerId)
  const selectedProvider = providers.find((provider) => provider.id === providerId)
  const knownModelSelected = isKnownProviderModel(providerId, model)
  const modelSelectValue = knownModelSelected ? model : 'custom'
  const selectedModelDescription =
    modelOptions.find((option) => option.id === model)?.description ??
    'Use a model id supported by the selected local CLI.'
  const isPending = busyAction === 'system-default'
  const isDirty = providerId !== initialProviderId || model !== initialModel
  const canSave = Boolean(
    workspaceConfigured && selectedProvider?.connected && model.trim() && isDirty && !busyAction
  )

  function changeProvider(nextProviderId: string): void {
    const parsedProviderId = nextProviderId as ProviderId
    setProviderId(parsedProviderId)
    setModel(getDefaultModelForProvider(parsedProviderId))
  }

  function changeModel(nextModel: string): void {
    setModel(nextModel === 'custom' ? '' : nextModel)
  }

  async function saveSystemDefault(): Promise<void> {
    await onSave({ providerId, model: model.trim() })
  }

  // No connected provider yet → the default can't point at anything. Guide the
  // user back up to Connections rather than showing an inert dropdown (ADR-045).
  if (!anyConnected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" />
            System default
          </CardTitle>
          <CardDescription>
            The provider and model for agent work and background planning. The Ordinus assistant has
            its own provider in the Ordinus section.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="rounded-md border border-dashed bg-accent/40 px-3 py-4 text-sm leading-6 text-muted-foreground">
            Connect a provider above first — then pick which one runs agent work by default.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" />
              System default
            </CardTitle>
            <CardDescription>
              The provider and model for agent work and background planning. The Ordinus assistant
              has its own provider in the Ordinus section.
            </CardDescription>
          </div>
          <StatusBadge tone={selectedProvider?.connected ? 'connected' : 'action'}>
            {selectedProvider?.connected ? 'Connected' : 'Needs login'}
          </StatusBadge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-2 text-sm">
            <span className="text-xs font-medium text-muted-foreground">Provider</span>
            <SelectControl value={providerId} onChange={changeProvider}>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.label}
                </option>
              ))}
            </SelectControl>
          </label>

          <label className="grid gap-2 text-sm">
            <span className="text-xs font-medium text-muted-foreground">Model</span>
            <SelectControl value={modelSelectValue} onChange={changeModel}>
              {modelOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
              <option value="custom">Custom model</option>
            </SelectControl>
          </label>
        </div>

        {modelSelectValue === 'custom' ? (
          <label className="grid gap-2 text-sm">
            <span className="text-xs font-medium text-muted-foreground">Custom model id</span>
            <Input
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder="Provider-supported model id"
            />
          </label>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            {selectedModelDescription}
          </p>
          <Button type="button" onClick={() => void saveSystemDefault()} disabled={!canSave}>
            {isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
            Save Default
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
