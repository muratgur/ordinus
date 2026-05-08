import { useMemo, useState } from 'react'
import { CheckCircle2, Database, FolderOpen, Loader2, MonitorCog, ShieldCheck } from 'lucide-react'
import type {
  AppInfo,
  DbStatus,
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

type SettingsScreenProps = {
  appInfo: AppInfo | null
  paths: SystemPaths | null
  dbStatus: DbStatus | null
  setupStatus: SetupStatus | null
  busyAction: string
  setupError: string
  onSelectFolder: () => Promise<WorkspaceSelectFolderResult>
  onSaveWorkspace: (input: WorkspaceSaveConfigInput) => Promise<void>
  onConnectCodex: () => Promise<void>
  onRefreshCodex: () => Promise<void>
}

export function SettingsScreen({
  appInfo,
  paths,
  dbStatus,
  setupStatus,
  busyAction,
  setupError,
  onSelectFolder,
  onSaveWorkspace,
  onConnectCodex,
  onRefreshCodex
}: SettingsScreenProps): React.JSX.Element {
  const codex = useMemo(
    () => setupStatus?.providers.find((provider) => provider.id === 'codex'),
    [setupStatus?.providers]
  )

  return (
    <div className="grid gap-6">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold leading-tight tracking-normal">Settings</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Manage workspace, providers, and local app state.
          </p>
        </div>
      </section>

      {setupError ? (
        <Card className="border-status-attention/20 bg-primary-soft">
          <CardHeader>
            <CardTitle>Settings need attention</CardTitle>
            <CardDescription>{setupError}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <WorkspaceSettingsCard
          key={setupStatus?.workspace?.updatedAt ?? 'workspace-settings-empty'}
          workspaceConfigured={Boolean(setupStatus?.workspaceConfigured)}
          initialWorkspaceRoot={setupStatus?.workspace?.workspaceRoot ?? ''}
          initialWorkspaceName={setupStatus?.workspace?.workspaceName ?? ''}
          busyAction={busyAction}
          onSelectFolder={onSelectFolder}
          onSaveWorkspace={onSaveWorkspace}
        />

        <ProviderCard
          provider={codex}
          busyAction={busyAction}
          onConnect={onConnectCodex}
          onRefresh={onRefreshCodex}
        />
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {setupStatus?.providers
          .filter((provider) => provider.id !== 'codex')
          .map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              busyAction={busyAction}
              onConnect={onConnectCodex}
              onRefresh={onRefreshCodex}
            />
          ))}
      </section>

      <section className="grid gap-4">
        <div>
          <h3 className="text-base font-semibold leading-tight tracking-normal">Local app state</h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Read-only diagnostics for the local desktop shell.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
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
      </section>
    </div>
  )
}

function WorkspaceSettingsCard({
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
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="size-4 text-primary" />
              Workspace
            </CardTitle>
            <CardDescription>
              Agents can work inside this folder and nowhere above it.
            </CardDescription>
          </div>
          <ReadinessBadge ready={workspaceConfigured} readyText="Ready" />
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
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
            {busyAction === 'select-folder' ? <Loader2 className="animate-spin" /> : <FolderOpen />}
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
  )
}
