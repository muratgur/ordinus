import { useEffect, useState } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import type {
  AppInfo,
  DbStatus,
  OnboardingStatus,
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
import { WorkboardScreen } from './screens/workboard-screen'
import { WorkflowsScreen } from './screens/workflows-screen'
import {
  emptyWorkboardDraftReviewState,
  type WorkboardDraftReviewState
} from './screens/workboard-draft-review'
import { SchedulesScreen } from './screens/schedules-screen'
import { SettingsScreen } from './screens/settings-screen'
import { OnboardingFlow } from './screens/onboarding/onboarding-flow'

type ShellState = {
  appInfo: AppInfo | null
  paths: SystemPaths | null
  dbStatus: DbStatus | null
  setupStatus: SetupStatus | null
  onboardingStatus: OnboardingStatus | null
  error: string
  setupError: string
  busyAction: string
  loading: boolean
}

function App(): React.JSX.Element {
  const [state, setState] = useState<ShellState>({
    appInfo: null,
    paths: null,
    dbStatus: null,
    setupStatus: null,
    onboardingStatus: null,
    error: '',
    setupError: '',
    busyAction: '',
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

  async function loadStatus(): Promise<void> {
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
      const [setupStatus, onboardingStatus] = await Promise.all([
        window.ordinus.setup.getStatus(),
        window.ordinus.onboarding.getStatus()
      ])

      setState((current) => ({
        ...current,
        appInfo,
        paths,
        dbStatus,
        setupStatus,
        onboardingStatus,
        error: '',
        loading: false
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
      await loadStatus()
    })
  }

  async function connectProvider(providerId: ProviderId): Promise<void> {
    await runSetupAction(`connect-${providerId}`, async () => {
      await window.ordinus.runtime.connectProvider({ providerId })
      await loadStatus()
    })
  }

  async function refreshProvider(providerId: ProviderId): Promise<void> {
    await runSetupAction(`refresh-${providerId}`, async () => {
      await window.ordinus.runtime.refreshProvider({ providerId })
      await loadStatus()
    })
  }

  async function disconnectProvider(providerId: ProviderId): Promise<void> {
    await runSetupAction(`disconnect-${providerId}`, async () => {
      await window.ordinus.runtime.disconnectProvider({ providerId })
      await loadStatus()
    })
  }

  async function updateSystemDefault(input: WorkspaceUpdateSystemDefaultInput): Promise<void> {
    await runSetupAction('system-default', async () => {
      await window.ordinus.workspace.updateSystemDefault(input)
      await loadStatus()
    })
  }

  if (state.onboardingStatus && !state.onboardingStatus.onboardedAt) {
    return (
      <OnboardingFlow
        initialStatus={state.onboardingStatus}
        onCompleted={() => void loadStatus()}
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
          <Route path={appRoutePaths.workflows} element={<WorkflowsScreen />} />
          <Route path={appRoutePaths.conversations} element={<ConversationsScreen />} />
          <Route path={appRoutePaths.schedules} element={<SchedulesScreen />} />
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
