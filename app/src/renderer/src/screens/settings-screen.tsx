import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  Code2,
  Database,
  Diamond,
  FolderOpen,
  FolderLock,
  Loader2,
  MonitorCog,
  Plug,
  PlugZap,
  RefreshCcw,
  Sparkles,
  Terminal,
  Unplug,
  ShieldCheck
} from 'lucide-react'
import type {
  AppInfo,
  ConnectorSummary,
  DbStatus,
  ProviderId,
  ProviderStatus,
  SetupStatus,
  SystemPaths,
  WorkspaceSaveConfigInput,
  WorkspaceUpdateSystemDefaultInput,
  WorkspaceSelectFolderResult
} from '@shared/contracts'
import {
  getDefaultModelForProvider,
  getProviderModelOptions,
  isKnownProviderModel
} from '@shared/provider-models'
import { getProviderDisplayName } from '@shared/provider-labels'
import { DetailRow } from '@renderer/components/detail-row'
import { ReadinessBadge } from '@renderer/components/readiness-badge'
import { SelectControl } from '@renderer/components/select-control'
import { StatusCard } from '@renderer/components/status-card'
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
import { formatDate } from '@renderer/lib/format'
import { cn } from '@renderer/lib/utils'
import { OrdinusSettingsSection } from './settings/ordinus-settings-section'

type SettingsScreenProps = {
  appInfo: AppInfo | null
  paths: SystemPaths | null
  dbStatus: DbStatus | null
  setupStatus: SetupStatus | null
  busyAction: string
  setupError: string
  onSelectFolder: () => Promise<WorkspaceSelectFolderResult>
  onSaveWorkspace: (input: WorkspaceSaveConfigInput) => Promise<void>
  onConnectProvider: (providerId: ProviderId) => Promise<void>
  onDisconnectProvider: (providerId: ProviderId) => Promise<void>
  onRefreshProvider: (providerId: ProviderId) => Promise<void>
  onUpdateSystemDefault: (input: WorkspaceUpdateSystemDefaultInput) => Promise<void>
}

type SettingsSectionId = 'workspace' | 'providers' | 'ordinus' | 'connections' | 'local-state'

const settingsSections = [
  {
    id: 'workspace',
    label: 'Workspace',
    description: 'Project folder and name',
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
    description: 'Persona, provider, and model for the in-app assistant',
    icon: Sparkles
  },
  {
    id: 'connections',
    label: 'Connections',
    description: 'External systems agents can use',
    icon: Plug
  },
  {
    id: 'local-state',
    label: 'Local state',
    description: 'App diagnostics and paths',
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
  onSelectFolder,
  onSaveWorkspace,
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
              <button
                key={section.id}
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
            ))}
          </nav>
        </aside>

        <section className="min-w-0">
          {activeSection === 'workspace' ? (
            <WorkspaceSettingsSection
              key={setupStatus?.workspace?.updatedAt ?? 'workspace-settings-empty'}
              workspaceConfigured={Boolean(setupStatus?.workspaceConfigured)}
              initialWorkspaceRoot={setupStatus?.workspace?.workspaceRoot ?? ''}
              initialWorkspaceName={setupStatus?.workspace?.workspaceName ?? ''}
              busyAction={busyAction}
              onSelectFolder={onSelectFolder}
              onSaveWorkspace={onSaveWorkspace}
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

          {activeSection === 'connections' ? <ConnectionsSettingsSection /> : null}

          {activeSection === 'local-state' ? (
            <LocalStateSettingsSection appInfo={appInfo} paths={paths} dbStatus={dbStatus} />
          ) : null}
        </section>
      </div>
    </div>
  )
}

function ConnectionsSettingsSection(): React.JSX.Element {
  const [connectors, setConnectors] = useState<ConnectorSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')

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

  return (
    <div className="grid gap-4">
      <section className="grid gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold leading-6">External connectors</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Connect an external system once — Ordinus registers an OAuth client automatically and
              stores only the credential, never the data. Agents that have it enabled use this
              connection at run time.
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
            {connectors.map((connector) => (
              <li key={connector.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{connector.label}</span>
                    <Badge variant={connector.connected ? 'default' : 'secondary'}>
                      {connector.connected ? 'Connected' : 'Not connected'}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {connector.transport} · {connector.authMethod}
                  </p>
                </div>
                {connector.connected ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busyId === connector.id}
                    onClick={() => void runAction(connector.id, 'disconnect')}
                  >
                    Disconnect
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    disabled={busyId === connector.id}
                    onClick={() => void runAction(connector.id, 'connect')}
                  >
                    {busyId === connector.id ? 'Connecting…' : 'Connect'}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function WorkspaceSettingsSection({
  workspaceConfigured,
  initialWorkspaceRoot,
  initialWorkspaceName,
  busyAction,
  onSelectFolder,
  onSaveWorkspace
}: {
  workspaceConfigured: boolean
  initialWorkspaceRoot: string
  initialWorkspaceName: string
  busyAction: string
  onSelectFolder: () => Promise<WorkspaceSelectFolderResult>
  onSaveWorkspace: (input: WorkspaceSaveConfigInput) => Promise<void>
}): React.JSX.Element {
  const [workspaceRoot, setWorkspaceRoot] = useState(initialWorkspaceRoot)
  const [workspaceName, setWorkspaceName] = useState(initialWorkspaceName)

  async function chooseFolder(): Promise<void> {
    const result = await onSelectFolder()
    if (result.cancelled) return

    setWorkspaceRoot(result.workspaceRoot)
    setWorkspaceName((current) => current || result.workspaceName)
  }

  async function saveWorkspace(): Promise<void> {
    await onSaveWorkspace({ workspaceRoot, workspaceName })
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FolderOpen className="size-4 text-primary" />
                Project workspace
              </CardTitle>
              <CardDescription>
                Agents can work inside this folder and nowhere above it.
              </CardDescription>
            </div>
            <ReadinessBadge ready={workspaceConfigured} readyText="Ready" />
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex gap-3 rounded-md border bg-accent px-3 py-3">
            <FolderLock className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="grid gap-1 text-sm">
              <p className="font-medium leading-tight">Workspace boundary</p>
              <p className="leading-6 text-muted-foreground">
                Agents work inside this folder. Choose the project folder where agent changes,
                generated files, and shared context should live.
              </p>
              <p className="leading-6 text-muted-foreground">
                Ordinus keeps work scoped to this workspace so unrelated folders stay out of the
                flow.
              </p>
            </div>
          </div>

          <label className="grid gap-2 text-sm font-medium">
            Project name
            <Input
              value={workspaceName}
              onChange={(event) => setWorkspaceName(event.target.value)}
              placeholder="Ordinus workspace"
            />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Folder path
            <Input
              value={workspaceRoot}
              onChange={(event) => setWorkspaceRoot(event.target.value)}
              placeholder="Choose a local project folder"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void chooseFolder()}
              disabled={Boolean(busyAction)}
            >
              {busyAction === 'select-folder' ? (
                <Loader2 className="animate-spin" />
              ) : (
                <FolderOpen />
              )}
              Choose Folder
            </Button>
            <Button
              type="button"
              onClick={() => void saveWorkspace()}
              disabled={!workspaceRoot.trim() || !workspaceName.trim() || Boolean(busyAction)}
            >
              {busyAction === 'save-workspace' ? (
                <Loader2 className="animate-spin" />
              ) : (
                <CheckCircle2 />
              )}
              Save Workspace
            </Button>
          </div>
        </CardContent>
      </Card>
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

  return (
    <div className="grid gap-4">
      <SystemDefaultSettingsPanel
        key={`${defaultProviderId}:${defaultModel}:${setupStatus?.workspace?.updatedAt ?? 'empty'}`}
        providers={providers}
        workspaceConfigured={Boolean(setupStatus?.workspaceConfigured)}
        initialProviderId={defaultProviderId}
        initialModel={defaultModel}
        busyAction={busyAction}
        onSave={onUpdateSystemDefault}
      />

      <section className="grid gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold leading-6">Provider connections</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Connect local CLIs for Ordinus-managed agent work.
            </p>
          </div>
          <Badge variant="secondary">
            {providers.filter((provider) => provider.connected).length} ready
          </Badge>
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
              <Badge variant={status.variant} className="gap-1">
                <ConnectionStatusGlyph provider={provider} />
                {status.label}
              </Badge>
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
      <p className="text-xs leading-5 text-muted-foreground md:col-span-2 xl:col-span-4">
        Disconnect removes only the provider credentials managed by Ordinus.
      </p>
    </dl>
  )
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

function ConnectionStatusGlyph({ provider }: { provider: ProviderStatus }): React.JSX.Element {
  if (provider.connected) return <CheckCircle2 className="size-3" />
  if (provider.installed) return <PlugZap className="size-3" />
  return <Terminal className="size-3" />
}

function getProviderConnectionStatus(provider: ProviderStatus): {
  label: string
  variant: 'completed' | 'attention' | 'outline'
} {
  if (provider.connected) {
    return { label: 'Ready', variant: 'completed' }
  }

  if (provider.installed) {
    return { label: 'Needs login', variant: 'attention' }
  }

  return { label: 'CLI missing', variant: 'outline' }
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
  initialProviderId,
  initialModel,
  busyAction,
  onSave
}: {
  providers: ProviderStatus[]
  workspaceConfigured: boolean
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
              Ordinus uses this provider and model for app-owned AI work.
            </CardDescription>
          </div>
          <Badge variant="secondary">{selectedProvider?.connected ? 'Ready' : 'Needs login'}</Badge>
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

function LocalStateSettingsSection({
  appInfo,
  paths,
  dbStatus
}: {
  appInfo: AppInfo | null
  paths: SystemPaths | null
  dbStatus: DbStatus | null
}): React.JSX.Element {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <StatusCard
          icon={<MonitorCog />}
          title="App"
          description="Desktop application metadata."
          rows={[
            ['Name', appInfo?.name ?? '-'],
            ['Version', appInfo?.version ?? '-'],
            ['Platform', appInfo ? `${appInfo.platform} ${appInfo.arch}` : '-'],
            ['Packaged', appInfo ? String(appInfo.isPackaged) : '-']
          ]}
        />
        <StatusCard
          icon={<Database />}
          title="Persistence"
          description="Local database bootstrap state."
          rows={[
            ['Initialized', dbStatus ? String(dbStatus.initialized) : '-'],
            ['Schema', dbStatus?.schemaVersion?.toString() ?? '-'],
            ['Created', formatDate(dbStatus?.createdAt)],
            ['Updated', formatDate(dbStatus?.updatedAt)]
          ]}
        />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" />
              Local paths
            </CardTitle>
            <CardDescription>App-owned paths used by main process services.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 text-sm">
              <DetailRow label="User data" value={paths?.userData ?? '-'} />
              <DetailRow label="Database" value={paths?.database ?? '-'} />
              <DetailRow label="Runtime" value={paths?.runtime ?? '-'} />
              <DetailRow label="Logs" value={paths?.logs ?? '-'} />
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
