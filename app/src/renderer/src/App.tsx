import { useEffect, useState } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import type {
  AppInfo,
  DbStatus,
  SetupStatus,
  SystemPaths,
  WorkspaceSaveConfigInput,
  WorkspaceSelectFolderResult
} from '@shared/contracts'
import { AppShell } from './app/app-shell'
import { defaultAppRoute, appRoutePaths } from './app/routes'
import { SetupScreen } from './screens/setup-screen'
import { SettingsScreen } from './screens/settings-screen'
import { WorkspaceScreen } from './screens/workspace-screen'

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
    <HashRouter>
      <Routes>
        <Route
          element={
            <AppShell
              dbStatus={state.dbStatus}
              setupStatus={state.setupStatus}
              loading={state.loading}
              onRefreshStatus={() => void loadStatus()}
            />
          }
        >
          <Route index element={<Navigate to={defaultAppRoute} replace />} />
          <Route
            path={appRoutePaths.workspace}
            element={
              <WorkspaceScreen
                appInfo={state.appInfo}
                paths={state.paths}
                dbStatus={state.dbStatus}
                error={state.error}
              />
            }
          />
          <Route
            path={appRoutePaths.settings}
            element={
              <SettingsScreen
                appInfo={state.appInfo}
                paths={state.paths}
                dbStatus={state.dbStatus}
                setupStatus={state.setupStatus}
                busyAction={state.busyAction}
                setupError={state.setupError}
                onSelectFolder={selectWorkspaceFolder}
                onSaveWorkspace={saveWorkspace}
                onConnectCodex={connectCodex}
                onRefreshCodex={refreshCodex}
              />
            }
          />
          <Route path="*" element={<Navigate to={defaultAppRoute} replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}

export default App
