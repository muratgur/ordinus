import { useEffect, useState } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import type {
  AppInfo,
  DbStatus,
  ProviderId,
  SetupStatus,
  SystemPaths,
  WorkspaceSaveConfigInput,
  WorkspaceUpdateSystemDefaultInput,
  WorkspaceSelectFolderResult
} from '@shared/contracts'
import { AppShell } from './app/app-shell'
import { NotificationPolicyBridge } from './app/notification-policy-bridge'
import { usePlanOperations, type PlanOperation } from './app/plan-operations'
import { PlanQueue } from './app/plan-queue'
import { defaultAppRoute, appRoutePaths } from './app/routes'
import { AgentsScreen } from './screens/agents-screen'
import { ConversationsScreen } from './screens/conversations-screen'
import { HomeScreen } from './screens/home-screen'
import { WorkboardScreen } from './screens/workboard-screen'
import {
  emptyWorkboardDraftReviewState,
  type WorkboardDraftReviewState
} from './screens/workboard-draft-review'
import { SchedulesScreen } from './screens/schedules-screen'
import { ConnectionsScreen } from './screens/connections-screen'
import { SetupScreen } from './screens/setup-screen'
import { SettingsScreen } from './screens/settings-screen'

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
  const [workboardDraftReview, setWorkboardDraftReview] = useState<WorkboardDraftReviewState>(
    emptyWorkboardDraftReviewState
  )
  const planOperations = usePlanOperations()

  function routeOperationIntoReview(operation: PlanOperation): void {
    if (!operation.plan) {
      return
    }
    setWorkboardDraftReview({
      plan: operation.plan,
      context: {
        target: operation.target,
        request: operation.request,
        runVersion: operation.runVersion,
        persistedId: operation.persistedId
      },
      selectedItemId: operation.plan.items[0]?.tempId ?? ''
    })
    planOperations.dismissPlanOp(operation.id)
  }

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

  async function connectProvider(providerId: ProviderId): Promise<void> {
    await runSetupAction(`connect-${providerId}`, async () => {
      await window.ordinus.runtime.connectProvider({ providerId })
      await loadStatus({ stayOnSetup: true })
    })
  }

  async function refreshProvider(providerId: ProviderId): Promise<void> {
    await runSetupAction(`refresh-${providerId}`, async () => {
      await window.ordinus.runtime.refreshProvider({ providerId })
      await loadStatus({ stayOnSetup: true })
    })
  }

  async function disconnectProvider(providerId: ProviderId): Promise<void> {
    await runSetupAction(`disconnect-${providerId}`, async () => {
      await window.ordinus.runtime.disconnectProvider({ providerId })
      await loadStatus({ stayOnSetup: true })
    })
  }

  async function updateSystemDefault(input: WorkspaceUpdateSystemDefaultInput): Promise<void> {
    await runSetupAction('system-default', async () => {
      await window.ordinus.workspace.updateSystemDefault(input)
      await loadStatus({ stayOnSetup: true })
    })
  }

  if (state.setupStatus && (!state.setupStatus.ready || !state.entered)) {
    const providerSetupKey = state.setupStatus.providers
      .map((provider) => `${provider.id}:${provider.connected}`)
      .join('|')

    return (
      <SetupScreen
        key={`${state.setupStatus.workspace?.updatedAt ?? 'setup-required'}:${state.setupStatus.ready}:${providerSetupKey}`}
        status={state.setupStatus}
        busyAction={state.busyAction}
        error={state.setupError}
        onSelectFolder={selectWorkspaceFolder}
        onSaveWorkspace={saveWorkspace}
        onConnectProvider={connectProvider}
        onRefreshProvider={refreshProvider}
        onEnter={() => setState((current) => ({ ...current, entered: true }))}
      />
    )
  }

  return (
    <HashRouter>
      <NotificationPolicyBridge
        workboardDraftReview={workboardDraftReview}
        planOperations={planOperations.operations}
        onReviewOperation={routeOperationIntoReview}
      />
      <Routes>
        <Route
          element={
            <AppShell
              dbStatus={state.dbStatus}
              setupStatus={state.setupStatus}
              loading={state.loading}
              workboardPlanReady={Boolean(workboardDraftReview.plan)}
              planQueue={
                <PlanQueue planOperations={planOperations} onReview={routeOperationIntoReview} />
              }
              onRefreshStatus={() => void loadStatus()}
            />
          }
        >
          <Route index element={<Navigate to={defaultAppRoute} replace />} />
          <Route path={appRoutePaths.home} element={<HomeScreen />} />
          <Route path={appRoutePaths.agents} element={<AgentsScreen />} />
          <Route
            path={appRoutePaths.workboard}
            element={
              <WorkboardScreen
                draftReview={workboardDraftReview}
                onDraftReviewChange={setWorkboardDraftReview}
                planOperations={planOperations}
              />
            }
          />
          <Route path={appRoutePaths.conversations} element={<ConversationsScreen />} />
          <Route path={appRoutePaths.schedules} element={<SchedulesScreen />} />
          <Route path={appRoutePaths.connections} element={<ConnectionsScreen />} />
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
                onConnectProvider={connectProvider}
                onDisconnectProvider={disconnectProvider}
                onRefreshProvider={refreshProvider}
                onUpdateSystemDefault={updateSystemDefault}
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
