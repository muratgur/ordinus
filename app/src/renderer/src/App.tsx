import { useEffect, useState, type ReactNode } from 'react'
import { CheckCircle2, Database, Folder, RefreshCcw, ShieldCheck } from 'lucide-react'
import type {
  AppInfo,
  DbStatus,
  SetupStatus,
  SystemPaths,
  WorkspaceSaveConfigInput,
  WorkspaceSelectFolderResult
} from '@shared/contracts'
import { SetupScreen } from './components/setup-screen'
import { Badge } from './components/ui/badge'
import { Button } from './components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card'
import { Separator } from './components/ui/separator'

type ShellState = {
  appInfo: AppInfo | null
  paths: SystemPaths | null
  dbStatus: DbStatus | null
  setupStatus: SetupStatus | null
  error: string
  setupError: string
  busyAction: string
  loading: boolean
  entered: boolean
}

function App(): React.JSX.Element {
  const [state, setState] = useState<ShellState>({
    appInfo: null,
    paths: null,
    dbStatus: null,
    setupStatus: null,
    error: '',
    setupError: '',
    busyAction: '',
    entered: false,
    loading: true
  })

  async function loadStatus(options: { stayOnSetup?: boolean } = {}): Promise<void> {
    setState((current) => ({ ...current, loading: true, error: '' }))

    try {
      if (!window.ordinus) {
        throw new Error('Ordinus preload bridge is not available.')
      }

      const [appInfo, paths, dbStatus] = await Promise.all([
        window.ordinus.app.getInfo(),
        window.ordinus.system.getPaths(),
        window.ordinus.db.getStatus()
      ])
      const setupStatus = await window.ordinus.setup.getStatus()

      setState((current) => ({
        ...current,
        appInfo,
        paths,
        dbStatus,
        setupStatus,
        error: '',
        loading: false,
        entered: options.stayOnSetup ? current.entered : setupStatus.ready
      }))
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : 'Unable to load Ordinus shell status.',
        loading: false
      }))
    }
  }

  useEffect(() => {
    void loadStatus()
  }, [])

  async function runSetupAction(action: string, task: () => Promise<void>): Promise<void> {
    setState((current) => ({ ...current, busyAction: action, setupError: '' }))

    try {
      await task()
    } catch (error) {
      setState((current) => ({
        ...current,
        setupError: error instanceof Error ? error.message : 'Setup action could not be completed.'
      }))
    } finally {
      setState((current) => ({ ...current, busyAction: '' }))
    }
  }

  async function selectWorkspaceFolder(): Promise<WorkspaceSelectFolderResult> {
    let selected: WorkspaceSelectFolderResult = {
      cancelled: true,
      workspaceRoot: '',
      workspaceName: ''
    }

    await runSetupAction('select-folder', async () => {
      selected = await window.ordinus.workspace.selectFolder()
    })

    return selected
  }

  async function saveWorkspace(input: WorkspaceSaveConfigInput): Promise<void> {
    await runSetupAction('save-workspace', async () => {
      await window.ordinus.workspace.saveConfig(input)
      await loadStatus({ stayOnSetup: true })
    })
  }

  async function connectCodex(): Promise<void> {
    await runSetupAction('connect-codex', async () => {
      await window.ordinus.runtime.connectCodex()
      await loadStatus({ stayOnSetup: true })
    })
  }

  async function refreshCodex(): Promise<void> {
    await runSetupAction('refresh-codex', async () => {
      await window.ordinus.runtime.refreshCodex()
      await loadStatus({ stayOnSetup: true })
    })
  }

  if (state.setupStatus && (!state.setupStatus.ready || !state.entered)) {
    return (
      <SetupScreen
        key={state.setupStatus.workspace?.updatedAt ?? 'setup-required'}
        status={state.setupStatus}
        busyAction={state.busyAction}
        error={state.setupError}
        onSelectFolder={selectWorkspaceFolder}
        onSaveWorkspace={saveWorkspace}
        onConnectCodex={connectCodex}
        onRefreshCodex={refreshCodex}
        onEnter={() => setState((current) => ({ ...current, entered: true }))}
      />
    )
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-6 py-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Desktop shell</Badge>
              {state.dbStatus?.initialized ? <Badge variant="success">SQLite ready</Badge> : null}
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-normal">Ordinus</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Minimum Electron foundation for a local-first agent orchestration app.
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={() => void loadStatus()} disabled={state.loading}>
            <RefreshCcw className={state.loading ? 'animate-spin' : ''} />
            Refresh
          </Button>
        </header>

        <Separator />

        {state.error ? (
          <Card className="border-destructive/40 bg-destructive/10">
            <CardHeader>
              <CardTitle>Shell error</CardTitle>
              <CardDescription>{state.error}</CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        <section className="grid gap-4 md:grid-cols-3">
          <StatusCard
            icon={<ShieldCheck />}
            title="App"
            description="Renderer is using the typed preload bridge."
            rows={[
              ['Name', state.appInfo?.name ?? '-'],
              ['Version', state.appInfo?.version ?? '-'],
              ['Platform', state.appInfo ? `${state.appInfo.platform} ${state.appInfo.arch}` : '-'],
              ['Packaged', state.appInfo ? String(state.appInfo.isPackaged) : '-']
            ]}
          />
          <StatusCard
            icon={<Database />}
            title="Persistence"
            description="Only the bootstrap app_meta table exists."
            rows={[
              ['Initialized', state.dbStatus ? String(state.dbStatus.initialized) : '-'],
              ['Schema', state.dbStatus?.schemaVersion?.toString() ?? '-'],
              ['Created', formatDate(state.dbStatus?.createdAt)],
              ['Updated', formatDate(state.dbStatus?.updatedAt)]
            ]}
          />
          <StatusCard
            icon={<Folder />}
            title="System paths"
            description="Electron userData owns local state."
            rows={[
              ['User data', state.paths?.userData ?? '-'],
              ['Database', state.paths?.database ?? '-'],
              ['Runtime', state.paths?.runtime ?? '-'],
              ['Logs', state.paths?.logs ?? '-']
            ]}
          />
        </section>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-emerald-600" />
              Foundation checks
            </CardTitle>
            <CardDescription>
              The app shell, secure IPC bridge, and minimum SQLite bootstrap are wired.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 text-sm text-muted-foreground">
              <p>Renderer has no direct Node, filesystem, process, or database access.</p>
              <p>Feature modules and provider runtimes are intentionally left for later phases.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

function StatusCard({
  icon,
  title,
  description,
  rows
}: {
  icon: ReactNode
  title: string
  description: string
  rows: Array<[string, string]>
}): React.JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="text-primary [&_svg]:size-4">{icon}</span>
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="grid gap-1">
              <dt className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
                {label}
              </dt>
              <dd className="break-all rounded-md bg-muted px-2 py-1.5 font-mono text-xs">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '-'
  return new Date(value).toLocaleString()
}

export default App
