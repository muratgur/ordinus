import { BrowserWindow } from 'electron'
import { accessSync, constants as fsConstants, statSync } from 'node:fs'
import {
  type OnboardingState,
  type OnboardingStatus,
  type ProviderId,
  type ProviderInstallEvent,
  type WorkspaceConfig,
  WorkspaceSaveConfigInputSchema
} from '@shared/contracts'
import { ipcChannels } from '@shared/ipc'
import { type OrdinusDatabase } from '../db/database'
import { installProvider } from '../runtime/cli/install/service'

/**
 * Onboarding state machine (ADR-028).
 *
 * The renderer is a thin view: every transition is a method here that mutates
 * persisted state and returns the new status. The flow is resumable — closing
 * the window mid-install leaves `installResults[providerId]` at 'installing',
 * and the renderer restarts that provider on relaunch.
 *
 * Install events stream over `ipcChannels.onboardingInstallEvent` so the
 * renderer can paint progress without polling. The envelope also carries the
 * latest persisted state, so the renderer never has to merge events with a
 * separately-fetched status.
 */
export class OnboardingService {
  private readonly inflight = new Map<ProviderId, AbortController>()

  constructor(private readonly database: OrdinusDatabase) {}

  getStatus(): OnboardingStatus {
    return this.database.getOnboardingStatus()
  }

  selectProviders(providerIds: ProviderId[]): OnboardingStatus {
    const state = this.getStatus().state
    const next: OnboardingState = {
      ...state,
      selectedProviders: dedupe(providerIds),
      // Drop any prior install results for providers no longer selected so
      // we don't surface stale "Ready" for something the user deselected.
      installResults: pickKeys(state.installResults, providerIds),
      installPhases: pickKeys(state.installPhases, providerIds),
      installErrors: pickKeys(state.installErrors, providerIds)
    }
    return this.database.saveOnboardingState(advanceStage(next, 'workspace'))
  }

  confirmWorkspace(input: { workspaceRoot: string }): {
    status: OnboardingStatus
    workspace: WorkspaceConfig
  } {
    const state = this.getStatus().state
    assertWorkspaceUsable(input.workspaceRoot)
    const parsed = WorkspaceSaveConfigInputSchema.parse({
      workspaceRoot: input.workspaceRoot,
      defaultProviderId: state.selectedProviders[0],
      defaultModel: 'default'
    })
    const workspace = this.database.saveWorkspaceConfig(parsed)
    const next: OnboardingState = {
      ...state,
      workspace: {
        workspaceRoot: workspace.workspaceRoot
      }
    }
    const status = this.database.saveOnboardingState(advanceStage(next, 'install'))
    return { status, workspace }
  }

  async installProviderAndStream(providerId: ProviderId): Promise<OnboardingStatus> {
    const state0 = this.getStatus().state
    if (!state0.selectedProviders.includes(providerId)) {
      throw new Error(`Provider ${providerId} is not in the selected set.`)
    }

    // Cancel any prior install for the same provider (e.g. retry from the UI).
    this.inflight.get(providerId)?.abort()
    const controller = new AbortController()
    this.inflight.set(providerId, controller)

    // Treat the controller as the inflight token. If a newer install for the
    // same provider replaces it, we must stop writing state — otherwise the
    // aborted generator's straggling 'error' yield would clobber the newer
    // run's 'installing' state.
    const isStillCurrent = (): boolean => this.inflight.get(providerId) === controller

    const clearedErrors = { ...state0.installErrors }
    delete clearedErrors[providerId]
    let working = this.database.saveOnboardingState({
      ...state0,
      installResults: { ...state0.installResults, [providerId]: 'installing' },
      installPhases: { ...state0.installPhases, [providerId]: 'start' },
      installErrors: clearedErrors
    })

    try {
      for await (const event of installProvider(providerId, { signal: controller.signal })) {
        if (!isStillCurrent()) return working
        working = this.applyInstallEvent(working, event)
        broadcast({ event, state: working.state })
      }
    } catch (error) {
      if (!isStillCurrent() || controller.signal.aborted) return working
      const message = error instanceof Error ? error.message : 'Install crashed unexpectedly.'
      const event: ProviderInstallEvent = { phase: 'error', providerId, message }
      working = this.applyInstallEvent(working, event)
      broadcast({ event, state: working.state })
    } finally {
      // Only clear the inflight slot if we still own it — otherwise we'd
      // erase the newer install's controller and break its own cancellation.
      if (this.inflight.get(providerId) === controller) {
        this.inflight.delete(providerId)
      }
    }

    return working
  }

  markProviderAuthed(providerId: ProviderId, authed: boolean): OnboardingStatus {
    const state = this.getStatus().state
    if (!state.selectedProviders.includes(providerId)) {
      throw new Error(`Provider ${providerId} is not in the selected set.`)
    }
    const installed =
      state.installResults[providerId] === 'installed' ||
      state.installResults[providerId] === 'authed'
    if (authed && !installed) {
      throw new Error(`Provider ${providerId} must be installed before being marked authed.`)
    }
    const next: OnboardingState = {
      ...state,
      installResults: {
        ...state.installResults,
        [providerId]: authed ? 'authed' : 'installed'
      }
    }
    const anyAuthed = hasAnyAuthedSelectedProvider(next)
    return this.database.saveOnboardingState(
      anyAuthed && next.stage === 'install' ? advanceStage(next, 'colleague') : next
    )
  }

  complete(agentId: string): OnboardingStatus {
    const state = this.getStatus().state
    if (!hasAnyAuthedSelectedProvider(state)) {
      throw new Error('At least one provider must be authenticated before completing onboarding.')
    }
    const finalState = advanceStage({ ...state, firstAgentId: agentId }, 'done')
    return this.database.markOnboardingComplete(finalState)
  }

  resetProviders(): OnboardingStatus {
    // Used by the "pick another colleague" exit on the install/failure screen.
    // Keeps the workspace, drops install/auth state, returns to provider picker.
    const state = this.getStatus().state
    for (const controller of this.inflight.values()) controller.abort()
    this.inflight.clear()
    const next: OnboardingState = {
      ...state,
      selectedProviders: [],
      installResults: {},
      installPhases: {},
      installErrors: {}
    }
    return this.database.saveOnboardingState(advanceStage(next, 'providers'))
  }

  advanceFromWelcome(): OnboardingStatus {
    const state = this.getStatus().state
    return this.database.saveOnboardingState(advanceStage(state, 'providers'))
  }

  private applyInstallEvent(
    status: OnboardingStatus,
    event: ProviderInstallEvent
  ): OnboardingStatus {
    const state = status.state
    const installResults = { ...state.installResults }
    const installErrors = { ...state.installErrors }
    const installPhases = { ...state.installPhases }

    installPhases[event.providerId] = event.phase

    switch (event.phase) {
      case 'start':
      case 'download':
      case 'verify':
        installResults[event.providerId] = 'installing'
        delete installErrors[event.providerId]
        break
      case 'done':
        installResults[event.providerId] = 'installed'
        delete installErrors[event.providerId]
        break
      case 'error':
        installResults[event.providerId] = 'failed'
        installErrors[event.providerId] = event.message
        break
    }

    return this.database.saveOnboardingState({
      ...state,
      installResults,
      installErrors,
      installPhases
    })
  }
}

/**
 * Authenticated-provider check that only considers providers the user is
 * currently committed to. `installResults` can carry stale entries from prior
 * sessions/resets if any code path forgets to filter; reading via
 * `selectedProviders` makes the check robust to that without depending on
 * the cleanup happening upstream.
 */
function hasAnyAuthedSelectedProvider(state: OnboardingState): boolean {
  return state.selectedProviders.some((id) => state.installResults[id] === 'authed')
}

function advanceStage(state: OnboardingState, next: OnboardingState['stage']): OnboardingState {
  if (state.stage === next) return state
  return {
    ...state,
    stage: next,
    stageHistory: [...state.stageHistory, { stage: next, at: new Date().toISOString() }]
  }
}

function dedupe<T>(values: T[]): T[] {
  return Array.from(new Set(values))
}

function pickKeys<V>(
  source: Partial<Record<ProviderId, V>>,
  keep: ProviderId[]
): Partial<Record<ProviderId, V>> {
  const keepSet = new Set(keep)
  const out: Partial<Record<ProviderId, V>> = {}
  for (const [key, value] of Object.entries(source) as [ProviderId, V][]) {
    if (keepSet.has(key)) out[key] = value
  }
  return out
}

function broadcast(envelope: { event: ProviderInstallEvent; state: OnboardingState }): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(ipcChannels.onboardingInstallEvent, envelope)
  }
}

/**
 * The workspace root is load-bearing (ADR-028): CLIs cwd into it and
 * path-policy enforces a security boundary around it. We must fail fast at
 * confirmWorkspace time with a user-readable message rather than waiting
 * for the first CLI spawn to ENOENT or EACCES.
 */
function assertWorkspaceUsable(workspaceRoot: string): void {
  const trimmed = workspaceRoot.trim()
  if (!trimmed) {
    throw new Error('Choose a workspace folder before continuing.')
  }
  let stat
  try {
    stat = statSync(trimmed)
  } catch {
    throw new Error(`Workspace folder does not exist: ${trimmed}`)
  }
  if (!stat.isDirectory()) {
    throw new Error(`Workspace path is not a folder: ${trimmed}`)
  }
  try {
    accessSync(trimmed, fsConstants.R_OK | fsConstants.W_OK)
  } catch {
    throw new Error(`Workspace folder is not writable: ${trimmed}`)
  }
}
