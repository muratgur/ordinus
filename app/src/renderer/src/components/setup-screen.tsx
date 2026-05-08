import { useMemo, useState } from 'react'
import {
  CheckCircle2,
  CircleDashed,
  ExternalLink,
  FolderOpen,
  Loader2,
  PlugZap,
  RefreshCcw,
  ShieldCheck
} from 'lucide-react'
import type {
  ProviderStatus,
  SetupStatus,
  WorkspaceSaveConfigInput,
  WorkspaceSelectFolderResult
} from '@shared/contracts'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Separator } from './ui/separator'

type SetupScreenProps = {
  status: SetupStatus
  busyAction: string
  error: string
  onSelectFolder: () => Promise<WorkspaceSelectFolderResult>
  onSaveWorkspace: (input: WorkspaceSaveConfigInput) => Promise<void>
  onConnectCodex: () => Promise<void>
  onRefreshCodex: () => Promise<void>
  onEnter: () => void
}

export function SetupScreen({
  status,
  busyAction,
  error,
  onSelectFolder,
  onSaveWorkspace,
  onConnectCodex,
  onRefreshCodex,
  onEnter
}: SetupScreenProps): React.JSX.Element {
  const [workspaceRoot, setWorkspaceRoot] = useState(status.workspace?.workspaceRoot ?? '')
  const [workspaceName, setWorkspaceName] = useState(status.workspace?.workspaceName ?? '')
  const codex = useMemo(
    () => status.providers.find((provider) => provider.id === 'codex'),
    [status.providers]
  )

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
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-6 py-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-2">
            <Badge variant={status.ready ? 'success' : 'secondary'}>
              {status.ready ? 'Ready to start' : 'Setup required'}
            </Badge>
            <div>
              <h1 className="text-3xl font-semibold tracking-normal">Set Up Workspace</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Choose a workspace and connect Codex before starting.
              </p>
            </div>
          </div>
          <Button onClick={onEnter} disabled={!status.ready}>
            <ShieldCheck />
            Enter Ordinus
          </Button>
        </header>

        <Separator />

        {error ? (
          <Card className="border-destructive/40 bg-destructive/10">
            <CardHeader>
              <CardTitle>Setup needs attention</CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
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
                <ReadinessBadge ready={status.workspaceConfigured} readyText="Ready" />
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

          <ProviderCard
            provider={codex}
            busyAction={busyAction}
            onConnect={onConnectCodex}
            onRefresh={onRefreshCodex}
          />
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {status.providers
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
      </div>
    </main>
  )
}

function ProviderCard({
  provider,
  busyAction,
  onConnect,
  onRefresh
}: {
  provider: ProviderStatus | undefined
  busyAction: string
  onConnect: () => Promise<void>
  onRefresh: () => Promise<void>
}): React.JSX.Element {
  const disabled = provider?.id !== 'codex'
  const authUrl = provider?.authUrl ?? ''

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <PlugZap className="size-4 text-primary" />
              {provider?.label ?? 'Provider'}
            </CardTitle>
            <CardDescription>{provider?.note || 'Check provider readiness.'}</CardDescription>
          </div>
          <ReadinessBadge ready={Boolean(provider?.connected)} readyText="Ready" />
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <dl className="grid gap-3 text-sm">
          <DetailRow label="CLI" value={provider?.installed ? 'Detected' : 'Not detected'} />
          <DetailRow label="Version" value={provider?.version ?? '-'} />
          <DetailRow label="Account" value={provider?.accountLabel || '-'} />
          <DetailRow
            label="Status"
            value={provider?.connected ? 'Connected' : provider?.note || '-'}
          />
        </dl>

        {provider?.lastError ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs leading-5 text-destructive">
            {provider.lastError}
          </p>
        ) : null}

        {authUrl ? (
          <a
            className="inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
            href={authUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open Codex login
            <ExternalLink className="size-4" />
          </a>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => void onRefresh()}
            variant="outline"
            disabled={disabled || Boolean(busyAction)}
          >
            {busyAction === 'refresh-codex' ? <Loader2 className="animate-spin" /> : <RefreshCcw />}
            Check Codex
          </Button>
          <Button
            type="button"
            onClick={() => void onConnect()}
            disabled={disabled || Boolean(busyAction) || Boolean(provider?.connected)}
          >
            {busyAction === 'connect-codex' ? <Loader2 className="animate-spin" /> : <PlugZap />}
            Connect to Codex
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function ReadinessBadge({
  ready,
  readyText
}: {
  ready: boolean
  readyText: string
}): React.JSX.Element {
  return ready ? (
    <Badge variant="success">
      <CheckCircle2 className="mr-1 size-3" />
      {readyText}
    </Badge>
  ) : (
    <Badge variant="outline">
      <CircleDashed className="mr-1 size-3" />
      Not configured
    </Badge>
  )
}

function DetailRow({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="grid gap-1">
      <dt className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
        {label}
      </dt>
      <dd className="break-all rounded-md bg-muted px-2 py-1.5 font-mono text-xs">{value}</dd>
    </div>
  )
}
