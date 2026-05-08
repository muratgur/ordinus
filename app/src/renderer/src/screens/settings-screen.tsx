import { useMemo, useState } from 'react'
import {
  CheckCircle2,
  Database,
  FolderOpen,
  FolderLock,
  Loader2,
  MonitorCog,
  PlugZap,
  ShieldCheck
} from 'lucide-react'
import type {
  AppInfo,
  DbStatus,
  ProviderId,
  SetupStatus,
  SystemPaths,
  WorkspaceSaveConfigInput,
  WorkspaceSelectFolderResult
} from '@shared/contracts'
import { DetailRow } from '@renderer/components/detail-row'
import { ProviderCard } from '@renderer/components/provider-card'
import { ReadinessBadge } from '@renderer/components/readiness-badge'
import { StatusCard } from '@renderer/components/status-card'
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
  onRefreshProvider: (providerId: ProviderId) => Promise<void>
}

type SettingsSectionId = 'workspace' | 'providers' | 'local-state'

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
  onRefreshProvider
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
              onRefreshProvider={onRefreshProvider}
            />
          ) : null}

          {activeSection === 'local-state' ? (
            <LocalStateSettingsSection appInfo={appInfo} paths={paths} dbStatus={dbStatus} />
          ) : null}
        </section>
      </div>
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
  onRefreshProvider
}: {
  setupStatus: SetupStatus | null
  codex: SetupStatus['providers'][number] | undefined
  busyAction: string
  onConnectProvider: (providerId: ProviderId) => Promise<void>
  onRefreshProvider: (providerId: ProviderId) => Promise<void>
}): React.JSX.Element {
  const otherProviders = setupStatus?.providers.filter((provider) => provider.id !== 'codex') ?? []
  const providers = codex ? [codex, ...otherProviders] : otherProviders

  return (
    <div className="grid gap-4">
      <section className="grid gap-4">
        {providers.map((provider) => (
          <ProviderCard
            key={provider.id}
            provider={provider}
            busyAction={busyAction}
            onConnect={() => onConnectProvider(provider.id)}
            onRefresh={() => onRefreshProvider(provider.id)}
          />
        ))}
      </section>
    </div>
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
