import { useMemo, useState } from 'react'
import {
  CheckCircle2,
  ChevronDown,
  Circle,
  ExternalLink,
  FolderOpen,
  Loader2,
  PlugZap,
  ShieldCheck
} from 'lucide-react'
import type {
  ProviderStatus,
  ProviderId,
  SetupStatus,
  WorkspaceSaveConfigInput,
  WorkspaceSelectFolderResult
} from '@shared/contracts'
import { getDefaultModelForProvider } from '@shared/provider-models'
import { getProviderDisplayName } from '@shared/provider-labels'
import { DetailRow } from '@renderer/components/detail-row'
import { ReadinessBadge } from '@renderer/components/readiness-badge'
import { SelectControl } from '@renderer/components/select-control'
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
import { Separator } from '@renderer/components/ui/separator'
import { cn } from '@renderer/lib/utils'

type SetupScreenProps = {
  status: SetupStatus
  busyAction: string
  error: string
  onSelectFolder: () => Promise<WorkspaceSelectFolderResult>
  onSaveWorkspace: (input: WorkspaceSaveConfigInput) => Promise<void>
  onConnectProvider: (providerId: ProviderId) => Promise<void>
  onRefreshProvider: (providerId: ProviderId) => Promise<void>
  onEnter: () => void
}

type SetupStepId = 'workspace' | 'provider' | 'review'

export function SetupScreen({
  status,
  busyAction,
  error,
  onSelectFolder,
  onSaveWorkspace,
  onConnectProvider,
  onRefreshProvider,
  onEnter
}: SetupScreenProps): React.JSX.Element {
  const [workspaceRoot, setWorkspaceRoot] = useState(status.workspace?.workspaceRoot ?? '')
  const [workspaceName, setWorkspaceName] = useState(status.workspace?.workspaceName ?? '')
  const [selectedProviderId, setSelectedProviderId] = useState<ProviderId>(() =>
    getInitialProviderId(status)
  )
  const selectedProvider = useMemo(
    () => status.providers.find((provider) => provider.id === selectedProviderId),
    [selectedProviderId, status.providers]
  )
  const selectedProviderName = getProviderDisplayName(selectedProviderId)
  const [openStep, setOpenStep] = useState<SetupStepId | null>(() =>
    getInitialOpenStep(status, selectedProvider)
  )

  async function chooseFolder(): Promise<void> {
    const result = await onSelectFolder()
    if (result.cancelled) return

    setWorkspaceRoot(result.workspaceRoot)
    setWorkspaceName((current) => current || result.workspaceName)
  }

  async function saveWorkspace(): Promise<void> {
    await saveWorkspaceWithProvider(selectedProviderId)
  }

  async function saveWorkspaceWithProvider(providerId: ProviderId): Promise<void> {
    await onSaveWorkspace({
      workspaceRoot,
      workspaceName,
      defaultProviderId: providerId,
      defaultModel: getDefaultModelForProvider(providerId)
    })
  }

  async function connectSelectedProvider(): Promise<void> {
    await onConnectProvider(selectedProviderId)
    if (workspaceRoot.trim() && workspaceName.trim()) {
      await saveWorkspaceWithProvider(selectedProviderId)
    }
  }

  async function refreshSelectedProvider(): Promise<void> {
    await onRefreshProvider(selectedProviderId)
    if (workspaceRoot.trim() && workspaceName.trim()) {
      await saveWorkspaceWithProvider(selectedProviderId)
    }
  }

  function toggleStep(step: SetupStepId): void {
    setOpenStep((current) => (current === step ? null : step))
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 px-6 py-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-2">
            <Badge variant={status.ready ? 'completed' : 'attention'}>
              {status.ready ? 'Workspace ready' : 'Setup needs attention'}
            </Badge>
            <div>
              <h1 className="text-[26px] font-semibold leading-tight tracking-normal">
                Set up Ordinus
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Prepare a local workspace and connect one provider before entering the app.
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
          <Card className="border-status-attention/20 bg-primary-soft">
            <CardHeader>
              <CardTitle>Setup needs attention</CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        <section className="grid gap-3" aria-label="Setup steps">
          <SetupStep
            number="01"
            title="Workspace"
            description="Choose the local project folder Ordinus can coordinate work inside."
            ready={status.workspaceConfigured}
            open={openStep === 'workspace'}
            onToggle={() => toggleStep('workspace')}
          >
            <div className="grid gap-4">
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
            </div>
          </SetupStep>

          <SetupStep
            number="02"
            title="Provider"
            description={`Choose Codex, Claude, or Gemini for app-owned AI work on this machine.`}
            ready={Boolean(selectedProvider?.connected)}
            open={openStep === 'provider'}
            onToggle={() => toggleStep('provider')}
          >
            <ProviderSetupPanel
              providers={status.providers}
              provider={selectedProvider}
              providerId={selectedProviderId}
              providerName={selectedProviderName}
              workspaceReady={Boolean(workspaceRoot.trim() && workspaceName.trim())}
              providerSaved={status.workspace?.defaultProviderId === selectedProviderId}
              busyAction={busyAction}
              onProviderChange={(providerId) => setSelectedProviderId(providerId)}
              onConnect={connectSelectedProvider}
              onRefresh={refreshSelectedProvider}
              onUseProvider={() => saveWorkspaceWithProvider(selectedProviderId)}
            />
          </SetupStep>

          <SetupStep
            number="03"
            title="Review"
            description="Confirm setup is ready, then enter the workspace."
            ready={status.ready}
            open={openStep === 'review'}
            onToggle={() => toggleStep('review')}
          >
            <div className="grid gap-4">
              <div className="grid gap-3 text-sm">
                <div className="flex items-center justify-between gap-3 rounded-md border bg-accent px-3 py-3">
                  <span className="font-medium">Workspace</span>
                  <ReadinessBadge ready={status.workspaceConfigured} readyText="Ready" />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-md border bg-accent px-3 py-3">
                  <span className="font-medium">{selectedProviderName}</span>
                  <ReadinessBadge ready={Boolean(selectedProvider?.connected)} readyText="Ready" />
                </div>
              </div>
              <Button onClick={onEnter} disabled={!status.ready} className="w-fit">
                <ShieldCheck />
                Enter Ordinus
              </Button>
            </div>
          </SetupStep>
        </section>
      </div>
    </main>
  )
}

function SetupStep({
  number,
  title,
  description,
  ready,
  open,
  onToggle,
  children
}: {
  number: string
  title: string
  description: string
  ready: boolean
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Card className={cn(open ? 'border-primary/30' : 'border-border')}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-4 p-5 text-left"
        aria-expanded={open}
      >
        <div className="flex min-w-0 gap-4">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full border bg-accent text-xs font-semibold text-muted-foreground">
            {ready ? <CheckCircle2 className="size-4 text-status-completed" /> : number}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold leading-tight tracking-normal">{title}</h2>
              <ReadinessBadge ready={ready} readyText="Ready" />
            </div>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
        </div>
        <ChevronDown
          className={cn(
            'mt-1 size-4 shrink-0 text-muted-foreground transition-transform',
            open ? 'rotate-180' : ''
          )}
        />
      </button>
      {open ? <CardContent className="border-t px-5 py-5">{children}</CardContent> : null}
    </Card>
  )
}

function ProviderSetupPanel({
  providers,
  provider,
  providerId,
  providerName,
  workspaceReady,
  providerSaved,
  busyAction,
  onProviderChange,
  onConnect,
  onRefresh,
  onUseProvider
}: {
  providers: ProviderStatus[]
  provider: ProviderStatus | undefined
  providerId: ProviderId
  providerName: string
  workspaceReady: boolean
  providerSaved: boolean
  busyAction: string
  onProviderChange: (providerId: ProviderId) => void
  onConnect: () => Promise<void>
  onRefresh: () => Promise<void>
  onUseProvider: () => Promise<void>
}): React.JSX.Element {
  const disabled = !provider
  const authUrl = provider?.authUrl ?? ''

  return (
    <div className="grid gap-4">
      <label className="grid gap-2 text-sm">
        <span className="text-xs font-medium text-muted-foreground">Provider</span>
        <SelectControl
          value={providerId}
          onChange={(value) => onProviderChange(value as ProviderId)}
        >
          {providers.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </SelectControl>
      </label>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold leading-tight tracking-normal">
            <PlugZap className="size-4 text-primary" />
            {provider?.label ?? 'Provider'}
          </h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {provider?.note || 'Check provider readiness.'}
          </p>
        </div>
        <ReadinessBadge ready={Boolean(provider?.connected)} readyText="Ready" />
      </div>

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
        <p className="rounded-md border border-status-failed/20 bg-status-failed/10 px-3 py-2 text-xs leading-5 text-status-failed">
          {provider.lastError}
        </p>
      ) : null}

      {authUrl ? (
        <a
          className="inline-flex w-fit items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
          href={authUrl}
          target="_blank"
          rel="noreferrer"
        >
          Open {providerName} login
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
          {busyAction === `refresh-${providerId}` ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Circle />
          )}
          Check {providerName}
        </Button>
        <Button
          type="button"
          onClick={() => void onConnect()}
          disabled={disabled || Boolean(busyAction) || Boolean(provider?.connected)}
        >
          {busyAction === `connect-${providerId}` ? (
            <Loader2 className="animate-spin" />
          ) : (
            <PlugZap />
          )}
          Connect to {providerName}
        </Button>
        {provider?.connected ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => void onUseProvider()}
            disabled={!workspaceReady || Boolean(busyAction) || providerSaved}
          >
            {busyAction === 'save-workspace' ? (
              <Loader2 className="animate-spin" />
            ) : (
              <CheckCircle2 />
            )}
            {providerSaved ? 'Provider Saved' : 'Use Provider'}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function getInitialProviderId(status: SetupStatus): ProviderId {
  if (status.workspace?.defaultProviderId) {
    return status.workspace.defaultProviderId
  }

  return status.providers.find((provider) => provider.connected)?.id ?? 'codex'
}

function getInitialOpenStep(
  status: SetupStatus,
  defaultProvider: ProviderStatus | undefined
): SetupStepId {
  if (!status.workspaceConfigured) return 'workspace'
  if (!defaultProvider?.connected) return 'provider'
  return 'review'
}
