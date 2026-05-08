import { useMemo, useState } from 'react'
import { CheckCircle2, FolderOpen, Loader2, ShieldCheck } from 'lucide-react'
import type {
  SetupStatus,
  WorkspaceSaveConfigInput,
  WorkspaceSelectFolderResult
} from '@shared/contracts'
import { ProviderCard } from '@renderer/components/provider-card'
import { ReadinessBadge } from '@renderer/components/readiness-badge'
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
            <Badge variant={status.ready ? 'completed' : 'attention'}>
              {status.ready ? 'Workspace ready' : 'Setup needs attention'}
            </Badge>
            <div>
              <h1 className="text-[26px] font-semibold leading-tight tracking-normal">
                Set up workspace
              </h1>
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
          <Card className="border-status-attention/20 bg-primary-soft">
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
