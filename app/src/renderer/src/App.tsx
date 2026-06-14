import { useEffect, useState } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import type {
  AppInfo,
  DbStatus,
  OnboardingStatus,
  ProviderId,
  SetupStatus,
  SystemPaths,
  WorkspaceUpdateSystemDefaultInput
} from '@shared/contracts'
import { AppShell } from './app/app-shell'
import { NotificationPolicyBridge } from './app/notification-policy-bridge'
import { OrdinusActionBridge } from './app/ordinus-action-bridge'
import { usePlanOperations, type PlanOperation } from './app/plan-operations'
import { PlanQueue } from './app/plan-queue'
import { appRoutePaths, defaultAppRoute } from './app/routes'
import { AgentsScreen } from './screens/agents-screen'
import { ConversationsScreen } from './screens/conversations-screen'
import { HomeScreen } from './screens/home/home-screen'
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

      // Phase 1 — routing-critical, all fast (SQLite reads + JSON file
      // lookups). Routes/Navigate need these resolved before they paint:
      //   - onboardingStatus: decides OnboardingFlow vs main routes
      // Total cost ≈ a few ms; the gate below releases as soon as these
      // are set into state.
      //
      // We intentionally do NOT call setup.getStatus() in this batch
      // because its main-side handler calls runtime.getProviderStatuses(),
      // which spawns CLI subprocesses (`--version` + `login status` for
      // each of Codex/Claude/Gemini). That call is now cached in the
      // runtime layer with a boot pre-warm, but Phase 2 still streams it
      // in so the first paint doesn't depend on the cache being warm.
      const [appInfo, paths, dbStatus, onboardingStatus] = await Promise.all([
        window.ordinus.app.getInfo(),
        window.ordinus.system.getPaths(),
        window.ordinus.db.getStatus(),
        window.ordinus.onboarding.getStatus()
      ])

      setState((current) => ({
        ...current,
        appInfo,
        paths,
        dbStatus,
        onboardingStatus,
        error: '',
        loading: false
      }))

      // Phase 2 — background. Slow because of the provider-status CLI
      // spawns. Non-fatal: if it errors, Settings sections render with
      // null setupStatus (empty/placeholder copy) until the next refresh.
      try {
        const setupStatus = await window.ordinus.setup.getStatus()
        setState((current) => ({ ...current, setupStatus }))
      } catch (cause) {
        // Silent — Settings → Providers will surface its own error UI
        // once a user-driven refresh fires.
        console.error('[app] setup.getStatus failed:', cause)
      }
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

  // Block the route layer until the initial loadStatus resolves. Without
  // this, `<Route index>` resolves with state.ordinusFlags still null on
  // first paint, fires Navigate to the legacy default, and the user lands
  // on Workboard even when the Ordinus flag is on. The flag-dependent nav
  // entry was also flickering in for the same reason. Once initialized,
  // subsequent refresh-driven loads (state.loading goes true again) don't
  // unmount the routes — only the very first load is gated.
  if (state.appInfo === null && !state.error) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Loading Ordinus…
      </div>
    )
  }

  return (
    <HashRouter>
      <NotificationPolicyBridge
        workboardDraftReview={workboardDraftReview}
        planOperations={planOperations.operations}
        onReviewOperation={routeOperationIntoReview}
      />
      <OrdinusActionBridge
        onWorkboardPlanReady={setWorkboardDraftReview}
        onWorkboardPlanDismissed={(request) =>
          setWorkboardDraftReview((prev) =>
            prev.plan && prev.context?.request === request ? emptyWorkboardDraftReviewState : prev
          )
        }
      />
      <Routes>
        <Route
          element={
            <AppShell
              dbStatus={state.dbStatus}
              setupStatus={state.setupStatus}
              workboardPlanReady={Boolean(workboardDraftReview.plan)}
              planQueue={
                <PlanQueue planOperations={planOperations} onReview={routeOperationIntoReview} />
              }
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
