import { app, BrowserWindow, dialog, ipcMain, shell, type OpenDialogOptions } from 'electron'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import {
  AgentArchiveInputSchema,
  AgentDeleteInputSchema,
  AgentScheduleCreateInputSchema,
  AgentScheduleDeleteInputSchema,
  AgentScheduleGetInputSchema,
  AgentScheduleListInputSchema,
  AgentScheduleSetEnabledInputSchema,
  AgentScheduleUpdateInputSchema,
  AgentScheduleFireNowInputSchema,
  AgentDraftFromProfileInputSchema,
  AgentDraftFromIntentInputSchema,
  AgentMemoryAddInputSchema,
  AgentMemoryDeactivateInputSchema,
  AgentMemoryListInputSchema,
  AgentMemoryUpdateInputSchema,
  AgentSkillCreateInputSchema,
  AgentSkillDeleteInputSchema,
  AgentSkillGetInputSchema,
  AgentSkillUpdateInputSchema,
  AgentSkillsListInputSchema,
  AgentSetPinnedInputSchema,
  AgentUpdateInstructionsInputSchema,
  AgentUpdateSettingsInputSchema,
  AgentExtraDirectoryAddInputSchema,
  AgentExtraDirectoryRemoveInputSchema,
  AgentExtraDirectoryListInputSchema,
  AgentExtraDirectoryListSchema,
  AgentExtraDirectoryAddResultSchema,
  type AgentExtraDirectoryErrorCode,
  AgentCreateInputSchema,
  AppInfoSchema,
  ConnectorActionInputSchema,
  ConversationCancelTurnInputSchema,
  FileReadInputSchema,
  FileContentSchema,
  WorkboardSaveRunResultResultSchema,
  ConversationAnswerInputRequestInputSchema,
  ConversationCancelInputRequestInputSchema,
  ConversationCreateDirectInputSchema,
  ConversationCreateManualInputSchema,
  ConversationGetOrCreateRoomInputSchema,
  ConversationDeleteInputSchema,
  ConversationDeletePreviewInputSchema,
  ConversationDeletePreviewSchema,
  ConversationDeleteResultSchema,
  ConversationGetInputSchema,
  ConversationRevealPathInputSchema,
  ConversationSendTurnInputSchema,
  ConversationUpdateTitleInputSchema,
  ConversationUpdateRoutingModeInputSchema,
  ObservedConversationRunsInputSchema,
  ObservedRunDiagnosticsInputSchema,
  ObservedRunListEventsInputSchema,
  OrchestrationPlanSchema,
  ProviderActionInputSchema,
  ProviderConnectInputSchema,
  SetupStatusSchema,
  WorkboardAnswerInputRequestInputSchema,
  WorkboardDirectStartInputSchema,
  WorkboardDraftPlanSchema,
  WorkboardGenerateFollowUpPlanInputSchema,
  WorkboardGeneratePlanInputSchema,
  PendingPlanCreateInputSchema,
  PendingPlanSchema,
  OrdinusArchiveConversationInputSchema,
  OrdinusCreateConversationInputSchema,
  OrdinusAnswerInputRequestInputSchema,
  OrdinusCancelInputRequestInputSchema,
  OrdinusDeleteConversationInputSchema,
  OrdinusDeleteMemoryInputSchema,
  OrdinusListTurnsInputSchema,
  OrdinusResolveConfirmationInputSchema,
  OrdinusSendTurnInputSchema,
  OrdinusSetConversationPinnedInputSchema,
  OrdinusUnarchiveConversationInputSchema,
  OrdinusUpdateConversationTitleInputSchema,
  OrdinusUpdateSingletonInputSchema,
  OrdinusWriteMemoryInputSchema,
  WorkboardGenerateRequestPlanInputSchema,
  WorkboardRevealPathInputSchema,
  WorkboardCheckPathsInputSchema,
  WorkboardArchiveRequestInputSchema,
  WorkboardUnarchiveRequestInputSchema,
  WorkboardPathStatusListSchema,
  WorkboardStartFollowUpInputSchema,
  WorkboardStartRequestPlanInputSchema,
  WorkboardStartRequestInputSchema,
  WorkflowDesignCreateInputSchema,
  WorkflowDesignUpdateInputSchema,
  WorkflowDesignDeleteInputSchema,
  WorkflowRunInputSchema,
  WorkRunActionInputSchema,
  WorkspaceSaveConfigInputSchema,
  WorkspaceSelectFolderResultSchema,
  WorkspaceUpdateSystemDefaultInputSchema,
  validateWorkboardDraftPlanDependencies,
  type Agent,
  type AgentTurnOutcome,
  type ConversationDetail,
  type ConversationDeletePreview,
  type ConversationSendTurnInput,
  type ProviderId,
  type WorkboardDraftPlan,
  type WorkboardGenerateRequestPlanInput,
  type WorkboardGenerateFollowUpPlanInput,
  type WorkboardContextReferenceInput,
  type WorkRequest,
  type WorkRun
} from '@shared/contracts'
import { ipcChannels } from '@shared/ipc'
import type {
  OrdinusDatabase,
  PreparedConversationAgentTurn,
  PreparedConversationTurn,
  PreparedWorkRun
} from '../db/database'
import { getSystemPaths } from '../paths'
import type { RuntimeService } from '../runtime'
import type { ObservabilityService } from '../observability/service'
import type { SanitizedInvocationSummary } from '../observability/types'
import { SchedulerService, computeNextRunAt } from '../scheduler/service'
import { OnboardingService } from '../onboarding/service'
import {
  OnboardingSelectProvidersInputSchema,
  OnboardingConfirmWorkspaceInputSchema,
  OnboardingInstallProviderInputSchema,
  OnboardingMarkProviderAuthedInputSchema,
  OnboardingCompleteInputSchema
} from '@shared/contracts'
import type { OrdinusActionEvent, SchedulerEvent } from '@shared/contracts'
import {
  createAgentSkill,
  deleteAgentHome,
  deleteAgentSkill,
  ensureAgentHome,
  getAgentHome,
  getAgentSkill,
  listAgentSkills,
  updateAgentSkill
} from '../agents/filesystem'
import {
  buildAgentDraftFromProfile,
  buildBlankAgentDraft,
  getAgentProfile,
  listAgentProfiles
} from '../agents/profiles'
import { compileWorkflowDesign } from '../workboard/compile-design'
import { composeInstructionsWithMemory } from '../agents/memory-render'
import { createOrdinusSessionService } from '../ordinus/session'
import { listPendingConfirmations, resolvePendingConfirmation } from '../ordinus/confirmation'
import { connectConnector, disconnectConnector, listConnectors } from '../integrations/service'
import {
  ensureWorkspaceRelativeDirectory,
  filterExistingWorkspacePaths,
  resolveReportedWorkspaceFileRefs,
  resolveWorkspaceRelativePath,
  type WorkspaceWorkingFolderContext
} from '../workspace/path-policy'
import {
  validateExtraDirectoryPath,
  pathExistsAsDirectory
} from '../workspace/extra-directory-policy'

const workRequestConcurrencyLimit = 3

let activeScheduler: SchedulerService | null = null

type ReportedWorkspaceFileRefs = WorkspaceWorkingFolderContext & {
  artifactRefs: string[]
  changedFiles: string[]
}

export function registerIpcHandlers(
  database: OrdinusDatabase,
  runtime: RuntimeService,
  observability: ObservabilityService
): SchedulerService {
  const broadcastSchedulerEvent = (event: SchedulerEvent): void => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(ipcChannels.schedulesChanged, event)
    }
  }
  const scheduler = new SchedulerService(
    database,
    (requestId) => startWorkRequestRuns(database, runtime, observability, requestId),
    broadcastSchedulerEvent
  )
  activeScheduler = scheduler
  ipcMain.handle(ipcChannels.appGetInfo, () =>
    AppInfoSchema.parse({
      name: 'Ordinus',
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      isPackaged: app.isPackaged
    })
  )

  ipcMain.handle(ipcChannels.systemGetPaths, () => getSystemPaths())
  ipcMain.handle(ipcChannels.dbGetStatus, () => database.getStatus())

  // ADR-029 M3: Ordinus conversation surface. Renderer (M4) will consume these.
  // Today they're callable from the dev console as a debug entrypoint:
  //   await window.ordinus.ordinus.createConversation({})
  //   await window.ordinus.ordinus.sendTurn({ conversationId, message })
  //
  // ADR-029 M5: action events flow main → renderer via webContents broadcast.
  // Mirrors the `schedulesChanged` pattern above so there's only one event
  // delivery mechanism in the app.
  const ordinusEvents = {
    publish(event: OrdinusActionEvent): void {
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send(ipcChannels.ordinusActionEvent, event)
      }
    }
  }
  const ordinusSession = createOrdinusSessionService({
    database,
    observability,
    runtime,
    events: ordinusEvents
  })
  ipcMain.handle(ipcChannels.ordinusListConversations, () => ordinusSession.listConversations())
  ipcMain.handle(ipcChannels.ordinusCreateConversation, (_event, payload: unknown) => {
    const parsed = OrdinusCreateConversationInputSchema.parse(payload ?? {})
    return ordinusSession.createConversation(parsed)
  })
  ipcMain.handle(ipcChannels.ordinusSendTurn, async (_event, payload: unknown) => {
    const parsed = OrdinusSendTurnInputSchema.parse(payload)
    return ordinusSession.sendTurn(parsed)
  })
  ipcMain.handle(ipcChannels.ordinusListTurns, (_event, payload: unknown) => {
    const parsed = OrdinusListTurnsInputSchema.parse(payload)
    return database.listOrdinusTurns(parsed.conversationId)
  })

  // ADR-029 M6 — destructive-tool confirmation gate.
  ipcMain.handle(ipcChannels.ordinusListPendingConfirmations, () => listPendingConfirmations())
  ipcMain.handle(ipcChannels.ordinusResolveConfirmation, (_event, payload: unknown) => {
    const parsed = OrdinusResolveConfirmationInputSchema.parse(payload)
    const resolved = resolvePendingConfirmation(parsed.pendingId, parsed.decision)
    if (!resolved) {
      // Pending id was unknown or already resolved. We treat the call as a
      // benign no-op rather than throwing — protects the renderer if it
      // double-clicks Approve or if the MCP layer already timed out.
      return { resolved: false as const }
    }
    // The MCP layer also publishes a `confirmation_resolved` event once it
    // wakes from the Promise; this duplicate emit from the IPC layer ensures
    // the renderer reacts even if the MCP server is in the middle of running
    // the approved tool (which can take a while).
    ordinusEvents.publish({
      kind: 'confirmation_resolved',
      pendingId: parsed.pendingId,
      decision: parsed.decision
    })
    return { resolved: true as const }
  })

  // ADR-029 — needs_input question panel.
  ipcMain.handle(ipcChannels.ordinusListPendingInputRequests, () =>
    database.listPendingOrdinusInputRequests()
  )
  ipcMain.handle(ipcChannels.ordinusAnswerInputRequest, async (_event, payload: unknown) => {
    const parsed = OrdinusAnswerInputRequestInputSchema.parse(payload)
    return ordinusSession.answerInputRequest(parsed)
  })
  ipcMain.handle(ipcChannels.ordinusCancelInputRequest, (_event, payload: unknown) => {
    const parsed = OrdinusCancelInputRequestInputSchema.parse(payload)
    const cancelled = database.cancelOrdinusInputRequest(parsed)
    if (!cancelled) {
      return { cancelled: false as const }
    }
    ordinusEvents.publish({ kind: 'input_request_resolved', requestId: parsed.requestId })
    return { cancelled: true as const }
  })

  // ADR-029 M7 — Ordinus persona + provider/model editing.
  ipcMain.handle(ipcChannels.ordinusGetSingleton, () => database.getOrdinusSingleton())
  ipcMain.handle(ipcChannels.ordinusUpdateSingleton, (_event, payload: unknown) => {
    const parsed = OrdinusUpdateSingletonInputSchema.parse(payload)
    database.updateOrdinusSingleton(parsed)
    return database.getOrdinusSingleton()
  })
  ipcMain.handle(ipcChannels.ordinusArchiveConversation, (_event, payload: unknown) => {
    const parsed = OrdinusArchiveConversationInputSchema.parse(payload)
    if (ordinusSession.isTurnRunning(parsed.conversationId)) {
      throw new Error('Wait for Ordinus to finish before archiving this conversation.')
    }
    database.archiveOrdinusConversation(parsed.conversationId)
    return { archived: true as const }
  })
  ipcMain.handle(ipcChannels.ordinusUnarchiveConversation, (_event, payload: unknown) => {
    const parsed = OrdinusUnarchiveConversationInputSchema.parse(payload)
    database.unarchiveOrdinusConversation(parsed.conversationId)
    return { restored: true as const }
  })
  ipcMain.handle(ipcChannels.ordinusDeleteConversation, (_event, payload: unknown) => {
    const parsed = OrdinusDeleteConversationInputSchema.parse(payload)
    if (ordinusSession.isTurnRunning(parsed.conversationId)) {
      throw new Error('Wait for Ordinus to finish before deleting this conversation.')
    }
    database.deleteOrdinusConversation(parsed.conversationId)
    return { deleted: true as const }
  })
  ipcMain.handle(ipcChannels.ordinusUpdateConversationTitle, (_event, payload: unknown) => {
    const parsed = OrdinusUpdateConversationTitleInputSchema.parse(payload)
    database.updateOrdinusConversationTitle({
      id: parsed.conversationId,
      title: parsed.title
    })
    return { updated: true as const }
  })
  ipcMain.handle(ipcChannels.ordinusSetConversationPinned, (_event, payload: unknown) => {
    const parsed = OrdinusSetConversationPinnedInputSchema.parse(payload)
    database.setOrdinusConversationPinned({
      id: parsed.conversationId,
      pinned: parsed.pinned
    })
    return { pinned: parsed.pinned }
  })
  // ADR-029 M8 — Ordinus memory CRUD for the renderer-side panel. Identical
  // semantics to the memory_write / memory_search MCP tools the LLM uses;
  // this is just the human-facing entry point so users can audit and curate
  // what Ordinus remembers about them.
  ipcMain.handle(ipcChannels.ordinusListMemory, () => database.listOrdinusMemory())
  ipcMain.handle(ipcChannels.ordinusWriteMemory, (_event, payload: unknown) => {
    const parsed = OrdinusWriteMemoryInputSchema.parse(payload)
    return database.writeOrdinusMemory(parsed)
  })
  ipcMain.handle(ipcChannels.ordinusDeleteMemory, (_event, payload: unknown) => {
    const parsed = OrdinusDeleteMemoryInputSchema.parse(payload)
    return database.deleteOrdinusMemory(parsed.id)
  })
  ipcMain.handle(ipcChannels.setupGetStatus, async () => {
    const workspace = database.getWorkspaceConfig()
    const providers = await runtime.getProviderStatuses()
    const defaultProvider = providers.find(
      (provider) => provider.id === (workspace?.defaultProviderId ?? 'codex')
    )

    return SetupStatusSchema.parse({
      ready: Boolean(workspace && defaultProvider?.connected),
      workspaceConfigured: Boolean(workspace),
      workspace,
      providers
    })
  })
  ipcMain.handle(ipcChannels.workspaceSelectFolder, async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const options: OpenDialogOptions = {
      title: 'Choose Ordinus workspace folder',
      properties: ['openDirectory', 'createDirectory']
    }
    const result = owner
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options)

    if (result.canceled || !result.filePaths[0]) {
      return WorkspaceSelectFolderResultSchema.parse({
        cancelled: true,
        workspaceRoot: '',
        workspaceName: ''
      })
    }

    const workspaceRoot = result.filePaths[0]

    return WorkspaceSelectFolderResultSchema.parse({
      cancelled: false,
      workspaceRoot,
      workspaceName: basename(workspaceRoot)
    })
  })
  ipcMain.handle(ipcChannels.workspaceSaveConfig, (_event, payload) => {
    const input = WorkspaceSaveConfigInputSchema.parse(payload)
    return database.saveWorkspaceConfig(input)
  })
  ipcMain.handle(ipcChannels.workspaceUpdateSystemDefault, async (_event, payload) => {
    const input = WorkspaceUpdateSystemDefaultInputSchema.parse(payload)
    const providers = await runtime.getProviderStatuses()
    const provider = providers.find((status) => status.id === input.providerId)

    if (!provider?.connected) {
      throw new Error('Connect this provider before making it the default.')
    }

    return database.updateSystemDefault(input)
  })
  ipcMain.handle(ipcChannels.agentsList, () => {
    const agents = database.listAgents()
    agents.forEach((agent) => ensureAgentHome(agent))
    return agents
  })
  ipcMain.handle(ipcChannels.agentsListProfiles, () => listAgentProfiles())
  ipcMain.handle(ipcChannels.agentsDraftFromIntent, async (_event, payload) => {
    const input = AgentDraftFromIntentInputSchema.parse(payload)
    const workspace = database.getWorkspaceConfig()

    if (!workspace) {
      throw new Error('Choose a workspace before creating an agent.')
    }

    const draft = await runtime.generateAgentDraft({
      ...input,
      providerId: workspace.defaultProviderId,
      model: workspace.defaultModel
    })
    return {
      ...draft,
      name: database.getAvailableAgentName(draft.name),
      enabled: draft.enabled ?? true
    }
  })
  ipcMain.handle(ipcChannels.agentsDraftFromProfile, (_event, payload) => {
    const input = AgentDraftFromProfileInputSchema.parse(payload)
    const workspace = database.getWorkspaceConfig()

    if (!workspace) {
      throw new Error('Choose a workspace before creating an agent.')
    }

    return buildAgentDraftFromProfile(getAgentProfile(input.profileId), {
      providerId: workspace.defaultProviderId,
      model: workspace.defaultModel,
      makeUniqueName: (name) => database.getAvailableAgentName(name)
    })
  })
  ipcMain.handle(ipcChannels.agentsDraftBlank, () => {
    const workspace = database.getWorkspaceConfig()

    if (!workspace) {
      throw new Error('Choose a workspace before creating an agent.')
    }

    return buildBlankAgentDraft({
      providerId: workspace.defaultProviderId,
      model: workspace.defaultModel,
      makeUniqueName: (name) => database.getAvailableAgentName(name)
    })
  })
  ipcMain.handle(ipcChannels.agentsCreate, (_event, payload) => {
    const input = AgentCreateInputSchema.parse(payload)
    const agent = database.createAgent(input)
    ensureAgentHome(agent)
    return agent
  })
  ipcMain.handle(ipcChannels.agentsUpdateInstructions, (_event, payload) => {
    const input = AgentUpdateInstructionsInputSchema.parse(payload)
    return database.updateAgentInstructions(input)
  })
  ipcMain.handle(ipcChannels.agentsUpdateSettings, (_event, payload) => {
    const input = AgentUpdateSettingsInputSchema.parse(payload)
    return database.updateAgentSettings(input)
  })
  ipcMain.handle(ipcChannels.agentsSetPinned, (_event, payload) => {
    const input = AgentSetPinnedInputSchema.parse(payload)
    return database.setAgentPinned(input)
  })
  ipcMain.handle(ipcChannels.agentsDelete, (_event, payload) => {
    const input = AgentDeleteInputSchema.parse(payload)
    const result = database.deleteAgent(input)
    deleteAgentHome(result.deletedAgentId)
    deleteLogRefs(result.deletedLogRefs)
    return result
  })
  const buildExtraDirectoryList = (agentId: string, paths: string[]): unknown =>
    AgentExtraDirectoryListSchema.parse({
      agentId,
      entries: paths.map((path) => ({ path, exists: pathExistsAsDirectory(path) }))
    })

  const extraDirectoryFailure = (code: AgentExtraDirectoryErrorCode, message: string): unknown =>
    AgentExtraDirectoryAddResultSchema.parse({ ok: false, code, message })

  ipcMain.handle(ipcChannels.agentsAddExtraDirectory, async (event, payload) => {
    const input = AgentExtraDirectoryAddInputSchema.parse(payload)
    requireAgent(database, input.agentId)

    const workspace = database.getWorkspaceConfig()
    if (!workspace) {
      return extraDirectoryFailure('workspace_not_configured', 'Workspace is not configured.')
    }

    const owner = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const options: OpenDialogOptions = {
      title: 'Choose an extra directory for this agent',
      properties: ['openDirectory']
    }
    const result = owner
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options)

    if (result.canceled || !result.filePaths[0]) {
      return extraDirectoryFailure('cancelled', 'Selection was cancelled.')
    }

    const validation = validateExtraDirectoryPath(result.filePaths[0], workspace.workspaceRoot)
    if (!validation.ok) {
      return extraDirectoryFailure(validation.code, validation.message)
    }

    const agent = database.getAgent(input.agentId)
    if (agent.extraDirectories.includes(validation.resolvedPath)) {
      return extraDirectoryFailure('duplicate', 'This directory is already in the list.')
    }

    const updated = database.addAgentExtraDirectory(input.agentId, validation.resolvedPath)
    return AgentExtraDirectoryAddResultSchema.parse({
      ok: true,
      list: buildExtraDirectoryList(input.agentId, updated.extraDirectories)
    })
  })
  ipcMain.handle(ipcChannels.agentsRemoveExtraDirectory, (_event, payload) => {
    const input = AgentExtraDirectoryRemoveInputSchema.parse(payload)
    requireAgent(database, input.agentId)
    const updated = database.removeAgentExtraDirectory(input.agentId, input.path)
    return buildExtraDirectoryList(input.agentId, updated.extraDirectories)
  })
  ipcMain.handle(ipcChannels.agentsListExtraDirectories, (_event, payload) => {
    const input = AgentExtraDirectoryListInputSchema.parse(payload)
    requireAgent(database, input.agentId)
    const agent = database.getAgent(input.agentId)
    return buildExtraDirectoryList(input.agentId, agent.extraDirectories)
  })
  ipcMain.handle(ipcChannels.agentsListSkills, (_event, payload) => {
    const input = AgentSkillsListInputSchema.parse(payload)
    requireAgent(database, input.agentId)
    return listAgentSkills(input.agentId)
  })
  ipcMain.handle(ipcChannels.agentsGetSkill, (_event, payload) => {
    const input = AgentSkillGetInputSchema.parse(payload)
    requireAgent(database, input.agentId)
    return getAgentSkill(input)
  })
  ipcMain.handle(ipcChannels.agentsCreateSkill, (_event, payload) => {
    const input = AgentSkillCreateInputSchema.parse(payload)
    requireAgent(database, input.agentId)
    return createAgentSkill(input)
  })
  ipcMain.handle(ipcChannels.agentsUpdateSkill, (_event, payload) => {
    const input = AgentSkillUpdateInputSchema.parse(payload)
    requireAgent(database, input.agentId)
    return updateAgentSkill(input)
  })
  ipcMain.handle(ipcChannels.agentsDeleteSkill, (_event, payload) => {
    const input = AgentSkillDeleteInputSchema.parse(payload)
    requireAgent(database, input.agentId)
    if (database.hasRunningWorkForAgent(input.agentId)) {
      throw new Error("Stop this agent's running work before deleting skills.")
    }
    return deleteAgentSkill(input)
  })
  ipcMain.handle(ipcChannels.agentsListMemory, (_event, payload) => {
    const input = AgentMemoryListInputSchema.parse(payload)
    requireAgent(database, input.agentId)
    return database.listAgentMemoryRules(input)
  })
  ipcMain.handle(ipcChannels.agentsAddMemory, (_event, payload) => {
    const input = AgentMemoryAddInputSchema.parse(payload)
    requireAgent(database, input.agentId)
    return database.addAgentMemoryRule(input)
  })
  ipcMain.handle(ipcChannels.agentsUpdateMemory, (_event, payload) => {
    const input = AgentMemoryUpdateInputSchema.parse(payload)
    requireAgent(database, input.agentId)
    return database.updateAgentMemoryRule(input)
  })
  ipcMain.handle(ipcChannels.agentsDeactivateMemory, (_event, payload) => {
    const input = AgentMemoryDeactivateInputSchema.parse(payload)
    requireAgent(database, input.agentId)
    return database.deactivateAgentMemoryRule(input)
  })
  ipcMain.handle(ipcChannels.agentsArchive, (_event, payload) => {
    const input = AgentArchiveInputSchema.parse(payload)
    return database.archiveAgent(input.id)
  })
  ipcMain.handle(ipcChannels.agentsUnarchive, (_event, payload) => {
    const input = AgentArchiveInputSchema.parse(payload)
    return database.unarchiveAgent(input.id)
  })
  ipcMain.handle(ipcChannels.agentsListReflection, () => database.getAgentReflectionSummary())
  ipcMain.handle(ipcChannels.conversationsList, () => database.listConversations())
  ipcMain.handle(ipcChannels.conversationsListAgentRoomSummaries, () =>
    database.listAgentRoomSummaries()
  )
  ipcMain.handle(ipcChannels.conversationsGet, (_event, payload) => {
    const input = ConversationGetInputSchema.parse(payload)
    return database.getConversation(input)
  })
  ipcMain.handle(ipcChannels.conversationsCreateDirect, (_event, payload) => {
    const input = ConversationCreateDirectInputSchema.parse(payload)
    return database.createDirectConversation(input)
  })
  ipcMain.handle(ipcChannels.conversationsCreateManual, (_event, payload) => {
    const input = ConversationCreateManualInputSchema.parse(payload)
    return database.createManualConversation(input)
  })
  ipcMain.handle(ipcChannels.conversationsGetOrCreateRoom, (_event, payload) => {
    const input = ConversationGetOrCreateRoomInputSchema.parse(payload)
    return database.getOrCreateAgentRoom(input)
  })
  ipcMain.handle(ipcChannels.conversationsUpdateTitle, (_event, payload) => {
    const input = ConversationUpdateTitleInputSchema.parse(payload)
    return database.updateConversationTitle(input)
  })
  ipcMain.handle(ipcChannels.conversationsUpdateRoutingMode, (_event, payload) => {
    const input = ConversationUpdateRoutingModeInputSchema.parse(payload)
    return database.updateConversationRoutingMode(input)
  })
  ipcMain.handle(ipcChannels.conversationsSendTurn, async (_event, payload) => {
    const input = ConversationSendTurnInputSchema.parse(payload)
    const current = database.getConversation({ conversationId: input.conversationId })
    const participant = current.participants[0]

    if (!participant) {
      throw new Error('Conversation has no participant.')
    }

    if (current.turns.some((turn) => turn.status === 'running')) {
      throw new Error('Wait for the current turn to finish before sending another message.')
    }

    const prepared = await prepareConversationTurn(database, runtime, current, input)
    startPreparedConversationTurns(database, runtime, observability, prepared)

    return database.getConversation({ conversationId: prepared.conversationId })
  })
  ipcMain.handle(ipcChannels.conversationsCancelTurn, (_event, payload) => {
    const input = ConversationCancelTurnInputSchema.parse(payload)
    runtime.cancelConversationTurn(input.turnId)
    const detail = database.cancelConversationTurn(input)
    observability.markConversationCancelled(input.turnId)
    return detail
  })
  ipcMain.handle(ipcChannels.conversationsRevealPath, (_event, payload) => {
    const input = ConversationRevealPathInputSchema.parse(payload)
    const turn = database.getConversationTurn(input.turnId)
    const allowedPaths = new Set([...turn.artifactRefs, ...turn.changedFiles])
    if (!allowedPaths.has(input.relativePath)) {
      throw new Error('This file is not registered on the selected conversation turn.')
    }

    revealWorkspacePath(database, input.relativePath)
  })
  ipcMain.handle(ipcChannels.conversationsOpenFolder, async (_event, payload) => {
    const input = ConversationGetInputSchema.parse(payload)
    await openConversationFolder(database, input.conversationId)
  })
  ipcMain.handle(ipcChannels.conversationsDeletePreview, (_event, payload) => {
    const input = ConversationDeletePreviewInputSchema.parse(payload)
    return getConversationDeletePreview(database, input.conversationId)
  })
  ipcMain.handle(ipcChannels.conversationsDelete, async (_event, payload) => {
    const input = ConversationDeleteInputSchema.parse(payload)
    const preview = getConversationDeletePreview(database, input.conversationId)
    const result = database.deleteConversation(input)
    deleteLogRefs(result.deletedLogRefs)

    let fileWarning: string | undefined
    let trashedWorkspaceFolder = false
    const workspaceFolderMissing = !preview.folderExists

    if (input.deleteWorkspaceFiles) {
      if (preview.folderExists) {
        try {
          await shell.trashItem(preview.absolutePath)
          trashedWorkspaceFolder = true
        } catch (error) {
          fileWarning = getMainErrorMessage(
            error,
            'Conversation history was deleted, but the folder could not be moved to Trash.'
          )
        }
      } else {
        fileWarning = 'Conversation history was deleted, but no conversation folder was found.'
      }
    }

    return ConversationDeleteResultSchema.parse({
      deletedConversationId: result.deletedConversationId,
      deletedTurnCount: result.deletedTurnCount,
      trashedWorkspaceFolder,
      workspaceFolderMissing,
      fileWarning
    })
  })
  ipcMain.handle(ipcChannels.conversationsAnswerInputRequest, async (_event, payload) => {
    const input = ConversationAnswerInputRequestInputSchema.parse(payload)
    const prepared = database.answerConversationInputRequest(input)
    startPreparedConversationTurns(database, runtime, observability, prepared)

    return database.getConversation({ conversationId: prepared.conversationId })
  })
  ipcMain.handle(ipcChannels.conversationsCancelInputRequest, (_event, payload) => {
    const input = ConversationCancelInputRequestInputSchema.parse(payload)
    const detail = database.cancelConversationInputRequest(input)
    const request = detail.inputRequests.find((item) => item.id === input.requestId)
    if (request) {
      observability.markConversationCancelled(request.turnId)
    }
    return detail
  })
  ipcMain.handle(ipcChannels.workboardList, () => database.getWorkboardData())
  ipcMain.handle(ipcChannels.workboardGenerateRequestPlan, async (_event, payload) => {
    const input = WorkboardGenerateRequestPlanInputSchema.parse(payload)
    return generateWorkboardPlan(database, runtime, buildRequestPlanningInput(database, input))
  })
  ipcMain.handle(ipcChannels.workboardStartRequestPlan, (_event, payload) => {
    const input = WorkboardStartRequestPlanInputSchema.parse(payload)
    const request = database.createWorkRequestPlan(input)
    startWorkRequestRuns(database, runtime, observability, request.id)
    return database.getWorkboardData()
  })
  ipcMain.handle(ipcChannels.workboardGeneratePlan, async (_event, payload) => {
    const input = WorkboardGeneratePlanInputSchema.parse(payload)
    return generateWorkboardPlan(database, runtime, { request: input.request })
  })
  ipcMain.handle(ipcChannels.workboardStartRequest, (_event, payload) => {
    const input = WorkboardStartRequestInputSchema.parse(payload)
    const request = database.createWorkRequest(input)
    startWorkRequestRuns(database, runtime, observability, request.id)
    return database.getWorkboardData()
  })
  ipcMain.handle(ipcChannels.workboardDirectStart, async (_event, payload) => {
    const input = WorkboardDirectStartInputSchema.parse(payload)
    const plan = await generateWorkboardPlan(database, runtime, { request: input.request })
    if (plan.items.length > 8) {
      throw new Error('Review this Work Request before starting because it has many Work Items.')
    }
    const request = database.createWorkRequest({
      originalRequest: input.request,
      plan
    })
    startWorkRequestRuns(database, runtime, observability, request.id)
    return database.getWorkboardData()
  })
  ipcMain.handle(ipcChannels.workboardGenerateFollowUpPlan, async (_event, payload) => {
    const input = WorkboardGenerateFollowUpPlanInputSchema.parse(payload)
    return generateWorkboardPlan(database, runtime, {
      request: buildFollowUpPlanningRequest(database, input)
    })
  })
  ipcMain.handle(ipcChannels.workboardStartFollowUp, (_event, payload) => {
    const input = WorkboardStartFollowUpInputSchema.parse(payload)
    const request = database.createWorkRequestFollowUp(input)
    startWorkRequestRuns(database, runtime, observability, request.id)
    return database.getWorkboardData()
  })
  ipcMain.handle(ipcChannels.workflowDesignList, () => database.listWorkflowDesigns())
  ipcMain.handle(ipcChannels.workflowDesignGet, (_event, payload) => {
    const id = WorkflowDesignDeleteInputSchema.shape.id.parse(payload)
    return database.getWorkflowDesign(id)
  })
  ipcMain.handle(ipcChannels.workflowDesignCreate, (_event, payload) => {
    const input = WorkflowDesignCreateInputSchema.parse(payload)
    return database.createWorkflowDesign(input)
  })
  ipcMain.handle(ipcChannels.workflowDesignUpdate, (_event, payload) => {
    const input = WorkflowDesignUpdateInputSchema.parse(payload)
    return database.updateWorkflowDesign(input)
  })
  ipcMain.handle(ipcChannels.workflowDesignDelete, (_event, payload) => {
    const input = WorkflowDesignDeleteInputSchema.parse(payload)
    database.deleteWorkflowDesign(input.id)
  })
  ipcMain.handle(ipcChannels.workflowRun, (_event, payload) => {
    const input = WorkflowRunInputSchema.parse(payload)
    const design = database.getWorkflowDesign(input.designId)
    if (!design) {
      throw new Error('Workflow design not found.')
    }

    const { plan, originalRequest } = compileWorkflowDesign(design)

    // New-WR target links the request back to the design for run history.
    // Append target reuses the follow-up path as a self-contained sub-DAG and
    // does NOT claim the existing request's design link (ADR-025).
    const request =
      input.target.kind === 'new'
        ? database.createWorkRequest({
            originalRequest,
            plan,
            workflowDesignId: design.id
          })
        : database.createWorkRequestFollowUp({
            requestId: input.target.requestId,
            plan
          })

    startWorkRequestRuns(database, runtime, observability, request.id)
    return database.getWorkboardData()
  })
  ipcMain.handle(ipcChannels.workboardListPendingPlans, () => database.listPendingPlans())
  ipcMain.handle(ipcChannels.workboardCreatePendingPlan, (_event, payload) => {
    const input = PendingPlanCreateInputSchema.parse(payload)
    return database.createPendingPlan(input)
  })
  ipcMain.handle(ipcChannels.workboardDeletePendingPlan, (_event, payload) => {
    const id = PendingPlanSchema.shape.id.parse(payload)
    database.deletePendingPlan(id)
  })
  ipcMain.handle(ipcChannels.workboardCancelRun, (_event, payload) => {
    const input = WorkRunActionInputSchema.parse(payload)
    runtime.cancelConversationTurn(input.runId)
    const run = database.cancelWorkRun(input)
    observability.markWorkboardCancelled(run.id)
    const requestId = getOptionalWorkRequestId(run)
    if (requestId) {
      startWorkRequestRuns(database, runtime, observability, requestId)
    }
    return database.getWorkboardData()
  })
  ipcMain.handle(ipcChannels.workboardAnswerInputRequest, (_event, payload) => {
    const input = WorkboardAnswerInputRequestInputSchema.parse(payload)
    const prepared = database.answerWorkRunInputRequest(input)
    if (prepared.run.status === 'running') {
      startPreparedWorkRun(database, runtime, observability, prepared)
    } else {
      const requestId = getOptionalWorkRequestId(prepared.run)
      if (requestId) {
        startWorkRequestRuns(database, runtime, observability, requestId)
      }
    }
    return database.getWorkboardData()
  })
  ipcMain.handle(ipcChannels.workboardRevealPath, (_event, payload) => {
    const input = WorkboardRevealPathInputSchema.parse(payload)
    const run = database.getWorkRun(input.runId)
    const allowedPaths = new Set([...run.artifactRefs, ...run.changedFiles])
    if (!allowedPaths.has(input.relativePath)) {
      throw new Error('This file is not registered on the selected Work Item.')
    }

    revealWorkspacePath(database, input.relativePath)
  })
  ipcMain.handle(ipcChannels.workboardCheckPaths, (_event, payload) => {
    const input = WorkboardCheckPathsInputSchema.parse(payload)
    const workspace = database.getWorkspaceConfig()
    if (!workspace) {
      throw new Error('Choose a workspace before inspecting files.')
    }

    const runs = database.getWorkboardData().runs.filter((run) => run.requestId === input.requestId)
    const paths = Array.from(
      new Set(runs.flatMap((run) => [...run.artifactRefs, ...run.changedFiles]))
    )
    const existing = new Set(filterExistingWorkspacePaths(workspace.workspaceRoot, paths))

    return WorkboardPathStatusListSchema.parse(
      paths.map((path) => ({ path, exists: existing.has(path) }))
    )
  })
  ipcMain.handle(ipcChannels.workboardArchiveRequest, (_event, payload) => {
    const input = WorkboardArchiveRequestInputSchema.parse(payload)
    database.archiveWorkRequest(input.requestId)
    return database.getWorkboardData()
  })
  ipcMain.handle(ipcChannels.workboardUnarchiveRequest, (_event, payload) => {
    const input = WorkboardUnarchiveRequestInputSchema.parse(payload)
    database.unarchiveWorkRequest(input.requestId)
    return database.getWorkboardData()
  })
  ipcMain.handle(ipcChannels.observabilityListWorkboard, () => observability.listWorkboardRuns())
  ipcMain.handle(ipcChannels.observabilityListConversation, (_event, payload) => {
    const input = ObservedConversationRunsInputSchema.parse(payload)
    return observability.listConversationRuns(input.conversationId)
  })
  ipcMain.handle(ipcChannels.observabilityListEvents, (_event, payload) => {
    const input = ObservedRunListEventsInputSchema.parse(payload)
    return observability.listEvents(input.observedRunId)
  })
  ipcMain.handle(ipcChannels.observabilityGetDiagnostics, (_event, payload) => {
    const input = ObservedRunDiagnosticsInputSchema.parse(payload)
    return observability.getDiagnostics(input)
  })
  ipcMain.handle(ipcChannels.runtimeGetProviders, () => runtime.getProviderStatuses())
  ipcMain.handle(ipcChannels.runtimeConnectProvider, (_event, payload) => {
    const input = ProviderConnectInputSchema.parse(payload)
    return runtime.connectProvider(input)
  })
  ipcMain.handle(ipcChannels.runtimeDisconnectProvider, (_event, payload) => {
    const input = ProviderActionInputSchema.parse(payload)
    return runtime.disconnectProvider(input)
  })
  ipcMain.handle(ipcChannels.runtimeRefreshProvider, (_event, payload) => {
    const input = ProviderActionInputSchema.parse(payload)
    return runtime.refreshProvider(input)
  })
  ipcMain.handle(ipcChannels.connectorsList, () => listConnectors())
  ipcMain.handle(ipcChannels.connectorsConnect, (_event, payload) => {
    const input = ConnectorActionInputSchema.parse(payload)
    return connectConnector(input.connectorId)
  })
  ipcMain.handle(ipcChannels.connectorsDisconnect, (_event, payload) => {
    const input = ConnectorActionInputSchema.parse(payload)
    return disconnectConnector(input.connectorId)
  })
  ipcMain.handle(ipcChannels.filesRead, (_event, payload) => {
    const input = FileReadInputSchema.parse(payload)
    const absolutePath = requireWorkspaceMarkdownFile(database, input.path)
    const stats = statSync(absolutePath)
    if (stats.size > maxMarkdownFileBytes) {
      throw new Error('This file is too large to open in the document viewer.')
    }

    return FileContentSchema.parse({
      path: input.path,
      content: readFileSync(absolutePath, 'utf8'),
      revision: String(stats.mtimeMs)
    })
  })
  ipcMain.handle(ipcChannels.workboardSaveRunResult, (_event, payload) => {
    const input = WorkRunActionInputSchema.parse(payload)
    const run = database.getWorkRun(input.runId)
    const content = run.resultContent.trim()
    if (!content) {
      throw new Error('This Work Item has no full result to save.')
    }

    const context = getWorkRunWorkspaceContext(database, run)
    const relativePath = buildSavedResultRelativePath(context.workingRoot, run.id)
    const absolutePath = resolveWorkspaceRelativePath(context.workspaceRoot, relativePath)
    mkdirSync(dirname(absolutePath), { recursive: true })
    writeFileSync(absolutePath, createSavedResultDocument(run, content), 'utf8')
    database.attachWorkRunArtifactRef(run.id, relativePath)

    return WorkboardSaveRunResultResultSchema.parse({ path: relativePath })
  })

  ipcMain.handle(ipcChannels.schedulesList, (_event, payload) => {
    const input = AgentScheduleListInputSchema.parse(payload ?? {})
    return database.listAgentSchedules(input)
  })
  ipcMain.handle(ipcChannels.schedulesGet, (_event, payload) => {
    const input = AgentScheduleGetInputSchema.parse(payload)
    return database.getAgentSchedule(input)
  })
  ipcMain.handle(ipcChannels.schedulesCreate, (_event, payload) => {
    const input = AgentScheduleCreateInputSchema.parse(payload)
    const nextRunAt = computeNextRunAt({
      cron: input.cron,
      runAt: input.runAt,
      timezone: input.timezone
    })
    const schedule = database.createAgentSchedule({ ...input, nextRunAt })
    scheduler.refresh(schedule.id)
    return schedule
  })
  ipcMain.handle(ipcChannels.schedulesUpdate, (_event, payload) => {
    const input = AgentScheduleUpdateInputSchema.parse(payload)
    const current = database.getAgentSchedule({ id: input.id })
    const cron = input.cron !== undefined ? input.cron : current.cron
    const runAt = input.runAt !== undefined ? input.runAt : current.runAt
    const timezone = input.timezone ?? current.timezone
    const nextRunAt = computeNextRunAt({ cron, runAt, timezone })
    const schedule = database.updateAgentSchedule({ ...input, nextRunAt })
    scheduler.refresh(schedule.id)
    return schedule
  })
  ipcMain.handle(ipcChannels.schedulesDelete, (_event, payload) => {
    const input = AgentScheduleDeleteInputSchema.parse(payload)
    const result = database.deleteAgentSchedule(input)
    scheduler.refresh(input.id)
    return result
  })
  ipcMain.handle(ipcChannels.schedulesSetEnabled, (_event, payload) => {
    const input = AgentScheduleSetEnabledInputSchema.parse(payload)
    const schedule = database.setAgentScheduleEnabled(input)
    if (schedule.enabled) {
      const nextRunAt = computeNextRunAt({
        cron: schedule.cron,
        runAt: schedule.runAt,
        timezone: schedule.timezone
      })
      database.updateAgentSchedule({ id: schedule.id, nextRunAt })
    }
    scheduler.refresh(schedule.id)
    return database.getAgentSchedule({ id: schedule.id })
  })
  ipcMain.handle(ipcChannels.schedulesFireNow, (_event, payload) => {
    const input = AgentScheduleFireNowInputSchema.parse(payload)
    return scheduler.fireNow(input.id)
  })

  const onboarding = new OnboardingService(database)

  ipcMain.handle(ipcChannels.onboardingGetStatus, () => onboarding.getStatus())
  ipcMain.handle(ipcChannels.onboardingAdvanceFromWelcome, () => onboarding.advanceFromWelcome())
  ipcMain.handle(ipcChannels.onboardingSelectProviders, (_event, payload) => {
    const input = OnboardingSelectProvidersInputSchema.parse(payload)
    return onboarding.selectProviders(input.providerIds)
  })
  ipcMain.handle(ipcChannels.onboardingConfirmWorkspace, (_event, payload) => {
    const input = OnboardingConfirmWorkspaceInputSchema.parse(payload)
    return onboarding.confirmWorkspace(input)
  })
  ipcMain.handle(ipcChannels.onboardingInstallProvider, async (_event, payload) => {
    const input = OnboardingInstallProviderInputSchema.parse(payload)
    return onboarding.installProviderAndStream(input.providerId)
  })
  ipcMain.handle(ipcChannels.onboardingMarkProviderAuthed, (_event, payload) => {
    const input = OnboardingMarkProviderAuthedInputSchema.parse(payload)
    return onboarding.markProviderAuthed(input.providerId, input.authed)
  })
  ipcMain.handle(ipcChannels.onboardingResetProviders, () => onboarding.resetProviders())
  ipcMain.handle(ipcChannels.onboardingComplete, (_event, payload) => {
    const input = OnboardingCompleteInputSchema.parse(payload)
    return onboarding.complete(input.agentId)
  })

  return scheduler
}

function requireAgent(database: OrdinusDatabase, agentId: string): void {
  if (!database.hasAgent(agentId)) {
    throw new Error('Agent was not found.')
  }
}

const maxMarkdownFileBytes = 5_000_000

function requireWorkspaceMarkdownFile(database: OrdinusDatabase, relativePath: string): string {
  const workspace = database.getWorkspaceConfig()
  if (!workspace) {
    throw new Error('Choose a workspace before opening files.')
  }
  if (!relativePath.toLowerCase().endsWith('.md')) {
    throw new Error('Only Markdown (.md) files can be opened in the document viewer.')
  }

  const absolutePath = resolveWorkspaceRelativePath(workspace.workspaceRoot, relativePath)
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    throw new Error('This file does not exist in the workspace.')
  }

  return absolutePath
}

function revealWorkspacePath(database: OrdinusDatabase, relativePath: string): void {
  const workspace = database.getWorkspaceConfig()
  if (!workspace) {
    throw new Error('Choose a workspace before opening files.')
  }

  const absolutePath = resolveWorkspaceRelativePath(workspace.workspaceRoot, relativePath)
  if (!existsSync(absolutePath)) {
    throw new Error('This file does not exist in the workspace.')
  }

  shell.showItemInFolder(absolutePath)
}

async function openConversationFolder(
  database: OrdinusDatabase,
  conversationId: string
): Promise<void> {
  const { absolutePath } = getConversationFolderLocation(
    database,
    conversationId,
    'Choose a workspace before opening conversation folders.'
  )
  if (!existsSync(absolutePath)) {
    throw new Error('Conversation folder was not found in the workspace.')
  }

  const openError = await shell.openPath(absolutePath)
  if (openError) {
    throw new Error(`Conversation folder could not be opened. ${openError}`)
  }
}

function getConversationFolderLocation(
  database: OrdinusDatabase,
  conversationId: string,
  missingWorkspaceMessage: string
): {
  conversation: ConversationDetail
  absolutePath: string
} {
  const workspace = database.getWorkspaceConfig()
  if (!workspace) {
    throw new Error(missingWorkspaceMessage)
  }

  const conversation = database.getConversation({ conversationId })

  return {
    conversation,
    absolutePath: resolveWorkspaceRelativePath(workspace.workspaceRoot, conversation.workingRoot)
  }
}

function getConversationDeletePreview(
  database: OrdinusDatabase,
  conversationId: string
): ConversationDeletePreview {
  const { conversation, absolutePath } = getConversationFolderLocation(
    database,
    conversationId,
    'Choose a workspace before deleting conversations.'
  )
  const folderExists = existsSync(absolutePath)
  const counts = folderExists
    ? countConversationFolderEntries(absolutePath)
    : { fileCount: 0, directoryCount: 0 }

  return ConversationDeletePreviewSchema.parse({
    conversationId: conversation.id,
    title: conversation.title,
    workingRoot: conversation.workingRoot,
    absolutePath,
    folderExists,
    ...counts
  })
}

function countConversationFolderEntries(folderPath: string): {
  fileCount: number
  directoryCount: number
} {
  let fileCount = 0
  let directoryCount = 0
  const pendingDirectories = [folderPath]

  while (pendingDirectories.length > 0) {
    const currentDirectory = pendingDirectories.pop()
    if (!currentDirectory) {
      continue
    }

    for (const entry of readdirSync(currentDirectory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) {
        fileCount += 1
        continue
      }

      if (entry.isDirectory()) {
        directoryCount += 1
        pendingDirectories.push(join(currentDirectory, entry.name))
        continue
      }

      fileCount += 1
    }
  }

  return { fileCount, directoryCount }
}

function getMainErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? `${fallback} ${error.message}` : fallback
}

async function generateWorkboardPlan(
  database: OrdinusDatabase,
  runtime: RuntimeService,
  input: { request: string; requestedAgentIds?: string[] }
): Promise<WorkboardDraftPlan> {
  const workspace = database.getWorkspaceConfig()
  if (!workspace) {
    throw new Error('Choose a workspace before creating a Work Request.')
  }

  const providers = await runtime.getProviderStatuses()
  const provider = providers.find((status) => status.id === workspace.defaultProviderId)
  if (!provider?.connected) {
    throw new Error('Connect the default provider before creating a Work Request.')
  }

  const agents = database.listAgents().filter((agent) => agent.enabled)
  if (agents.length === 0) {
    throw new Error('Create and enable at least one agent before creating a Work Request.')
  }

  const plan = WorkboardDraftPlanSchema.parse(
    await runtime.generateWorkboardPlan({
      providerId: workspace.defaultProviderId,
      model: workspace.defaultModel,
      workspaceRoot: workspace.workspaceRoot,
      agents,
      request: input.request,
      requestedAgentIds: input.requestedAgentIds ?? []
    })
  )

  validateWorkboardPlanAgents(plan.items, agents)
  validateWorkboardDraftPlanDependencies(plan.items)

  return plan
}

function buildFollowUpPlanningRequest(
  database: OrdinusDatabase,
  input: WorkboardGenerateFollowUpPlanInput
): string {
  const request = database.getWorkRequest(input.requestId)
  const anchorRun = input.anchorRunId ? database.getWorkRun(input.anchorRunId) : null
  if (anchorRun && getOptionalWorkRequestId(anchorRun) !== request.id) {
    throw new Error('Follow-up work must stay inside the selected Work Request.')
  }
  const requestRuns = database
    .listWorkRuns()
    .filter((run) => getOptionalWorkRequestId(run) === request.id)

  return [
    'Plan continuation Work Items for an existing Ordinus Work Request.',
    'Do not restart the original request. Add only the smallest useful next Work Items.',
    'Use the existing work manifest for orientation only; do not assume every prior Work Item is relevant.',
    'When the requested continuation needs details from referenced artifacts or changed files, write the new Work Item instruction so the assigned agent inspects those paths before acting.',
    'When the requested continuation depends on prior text-only output that has no file reference, include the relevant available excerpt in the new Work Item instruction instead of telling the agent to fetch unavailable output.',
    '',
    'Existing Work Request:',
    `Title: ${request.title}`,
    `Summary: ${formatPromptSnippet(request.summary || 'No summary recorded.', 800)}`,
    'Original request:',
    formatPromptSnippet(request.originalRequest, 1_200),
    '',
    formatExistingWorkForPrompt(requestRuns, anchorRun),
    '',
    anchorRun
      ? [
          'Continue from this Work Item:',
          `Title: ${anchorRun.title}`,
          `Agent: ${anchorRun.assignedAgentName} (${anchorRun.assignedAgentRole || 'Agent'})`,
          `Status: ${anchorRun.status}`,
          'Instruction:',
          formatPromptSnippet(anchorRun.instruction, 1_200),
          'Latest output:',
          formatPromptSnippet(
            anchorRun.resultSummary || anchorRun.error || 'No output recorded.',
            1_200
          ),
          formatFileRefsForPrompt('Artifacts', anchorRun.artifactRefs),
          formatFileRefsForPrompt('Changed files', anchorRun.changedFiles),
          '',
          'Prefer the same agent when the new work is a direct continuation of this Work Item. Use another agent only when the continuation clearly belongs to another role.'
        ].join('\n')
      : 'No specific Work Item is selected; continue the Work Request as a whole.',
    '',
    'User continuation request:',
    input.request
  ].join('\n')
}

function buildRequestPlanningInput(
  database: OrdinusDatabase,
  input: WorkboardGenerateRequestPlanInput
): Pick<WorkboardGenerateRequestPlanInput, 'request' | 'requestedAgentIds'> {
  return {
    request: buildRequestPlanningRequest(database, input),
    requestedAgentIds: input.requestedAgentIds
  }
}

function buildRequestPlanningRequest(
  database: OrdinusDatabase,
  input: WorkboardGenerateRequestPlanInput
): string {
  const destinationRequest = input.destinationRequestId
    ? database.getWorkRequest(input.destinationRequestId)
    : null
  const context = buildContextReferencesForPrompt(database, input.contextReferences)

  if (!destinationRequest && context.length === 0) {
    return input.request
  }

  return [
    destinationRequest
      ? 'Plan new Work Items inside an existing Ordinus Work Request.'
      : 'Plan a new Ordinus Work Request using the selected context.',
    destinationRequest
      ? 'Do not restart the existing Work Request. Add only the smallest useful next Work Items.'
      : 'Create the smallest useful Work Request plan for the user request.',
    'Use selected context for orientation. When a selected Work Item has artifacts or changed files, write instructions that inspect those paths before acting.',
    '',
    destinationRequest
      ? formatDestinationWorkRequestForPrompt(database, destinationRequest)
      : 'Destination: create a new Work Request.',
    '',
    context.length > 0 ? ['Selected context references:', ...context].join('\n\n') : '',
    '',
    'User request:',
    input.request
  ]
    .filter(Boolean)
    .join('\n')
}

function formatDestinationWorkRequestForPrompt(
  database: OrdinusDatabase,
  destinationRequest: WorkRequest
): string {
  const requestRuns = database
    .listWorkRuns()
    .filter((run) => getOptionalWorkRequestId(run) === destinationRequest.id)

  return [
    'Destination Work Request:',
    `Title: ${destinationRequest.title}`,
    `Summary: ${formatPromptSnippet(destinationRequest.summary || 'No summary recorded.', 800)}`,
    'Original request:',
    formatPromptSnippet(destinationRequest.originalRequest, 1_200),
    '',
    formatExistingWorkForPrompt(requestRuns, null)
  ].join('\n')
}

function buildContextReferencesForPrompt(
  database: OrdinusDatabase,
  references: WorkboardContextReferenceInput[]
): string[] {
  const workspace = database.getWorkspaceConfig()
  const seen = new Set<string>()
  const items: string[] = []

  references.forEach((reference) => {
    if (reference.kind === 'work_item') {
      const run = database.getWorkRun(reference.runId)
      const key = `work_item:${run.id}`
      if (!markContextReferenceSeen(seen, key)) return

      items.push(
        [
          `Work Item: ${run.title}`,
          `Work Run: ${run.id}`,
          `Work Request: ${getOptionalWorkRequestId(run) || 'Unknown'}`,
          `Agent: ${run.assignedAgentName} (${run.assignedAgentRole || 'Agent'})`,
          `Status: ${run.status}`,
          'Instruction:',
          formatPromptSnippet(run.instruction, 1_200),
          'Latest output:',
          formatPromptSnippet(run.resultSummary || run.error || 'No output recorded.', 1_200),
          formatFileRefsForPrompt('Artifacts', run.artifactRefs),
          formatFileRefsForPrompt('Changed files', run.changedFiles)
        ].join('\n')
      )
      return
    }

    if (reference.kind === 'work_request') {
      const request = database.getWorkRequest(reference.requestId)
      const key = `work_request:${request.id}`
      if (!markContextReferenceSeen(seen, key)) return

      items.push(
        [
          `Work Request: ${request.title}`,
          `Request ID: ${request.id}`,
          `Status: ${request.status}`,
          `Summary: ${formatPromptSnippet(request.summary || 'No summary recorded.', 800)}`,
          `Original request: ${formatPromptSnippet(request.originalRequest, 1_200)}`
        ].join('\n')
      )
      return
    }

    if (!workspace) {
      throw new Error('Choose a workspace before adding workspace files as context.')
    }
    const absolutePath = resolveWorkspaceRelativePath(workspace.workspaceRoot, reference.path)
    if (!existsSync(absolutePath)) {
      throw new Error('Selected workspace path does not exist.')
    }
    const key = `workspace_path:${reference.path}`
    if (!markContextReferenceSeen(seen, key)) return
    items.push(`Workspace path: ${reference.path}`)
  })

  return items
}

function markContextReferenceSeen(seen: Set<string>, key: string): boolean {
  if (seen.has(key)) return false
  seen.add(key)
  return true
}

function formatExistingWorkForPrompt(runs: WorkRun[], anchorRun: WorkRun | null): string {
  if (runs.length === 0) {
    return 'Existing Work Items: none'
  }

  const visibleRuns = runs.slice(0, 24)
  const omittedCount = runs.length - visibleRuns.length

  return [
    'Existing Work Items in this Work Request:',
    ...visibleRuns.map((run, index) =>
      [
        `${index + 1}. ${run.title}${anchorRun?.id === run.id ? ' (selected continuation point)' : ''}`,
        `Work Run: ${run.id}`,
        `Status: ${run.status}`,
        `Agent: ${run.assignedAgentName} (${run.assignedAgentRole || 'Agent'})`,
        `Output snippet: ${formatPromptSnippet(
          run.resultSummary || run.error || 'No output recorded.',
          500
        )}`,
        formatFileRefsForPrompt('Artifacts', run.artifactRefs),
        formatFileRefsForPrompt('Changed files', run.changedFiles)
      ].join('\n')
    ),
    omittedCount > 0
      ? `Additional Work Items omitted from this planning manifest: ${omittedCount}`
      : ''
  ]
    .filter(Boolean)
    .join('\n\n')
}

function formatPromptSnippet(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) {
    return normalized || 'No output recorded.'
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 32)).trimEnd()}... [truncated for planning]`
}

function formatFileRefsForPrompt(label: string, refs: string[]): string {
  if (refs.length === 0) {
    return `${label}: none`
  }

  const visibleRefs = refs.slice(0, 12)
  const omittedCount = refs.length - visibleRefs.length

  return [
    label + ':',
    ...visibleRefs.map((ref) => `- ${ref}`),
    omittedCount > 0 ? `- ... ${omittedCount} more` : ''
  ]
    .filter(Boolean)
    .join('\n')
}

function validateWorkboardPlanAgents(
  items: Array<{ assignedAgentId: string }>,
  agents: Agent[]
): void {
  const agentIds = new Set(agents.map((agent) => agent.id))
  if (items.some((item) => !agentIds.has(item.assignedAgentId))) {
    throw new Error('The generated plan assigned work to an unavailable agent.')
  }
}

function startWorkRequestRuns(
  database: OrdinusDatabase,
  runtime: RuntimeService,
  observability: ObservabilityService,
  requestId: string
): void {
  const availableSlots =
    workRequestConcurrencyLimit - database.countRunningWorkRunsForRequest(requestId)
  if (availableSlots <= 0) {
    return
  }

  for (const run of database.listRunnableWorkRunsForRequest(requestId, availableSlots)) {
    const queuedResume = database.getQueuedWorkRunResume(run.id)
    const startedRun = database.startWorkRun(
      { runId: run.id },
      queuedResume ? { resumedFromInputRequestId: queuedResume.inputRequestId } : {}
    )
    if (queuedResume) {
      database.resolveQueuedWorkRunResume(queuedResume.inputRequestId)
    }

    startPreparedWorkRun(
      database,
      runtime,
      observability,
      {
        run: startedRun,
        agent: database.getAgent(startedRun.assignedAgentId),
        message: queuedResume?.message ?? '',
        providerSessionRef: database.prepareWorkRunProviderSession(startedRun.id)
      },
      database.getRequiredInputSummaries(startedRun.id)
    )
  }
}

function startPreparedWorkRun(
  database: OrdinusDatabase,
  runtime: RuntimeService,
  observability: ObservabilityService,
  prepared: PreparedWorkRun,
  requiredInputs = database.getRequiredInputSummaries(prepared.run.id)
): void {
  const requestId = getWorkRequestId(prepared.run)
  const workspaceContext = getWorkRunWorkspaceContext(database, prepared.run)
  const providerSessionRef =
    database.prepareWorkRunProviderSession(prepared.run.id) ?? prepared.providerSessionRef
  const logRef = join('work-requests', requestId, prepared.run.id)
  const logDir = join(getSystemPaths().logs, logRef)
  const startedAt = new Date().toISOString()
  const observationSink = observability.startWorkboardRun({
    run: prepared.run,
    agent: prepared.agent,
    logRef,
    invocation: buildProviderInvocationSummary({
      providerId: prepared.run.providerId,
      sandbox: prepared.run.sandbox,
      workspaceRoot: workspaceContext.workspaceRoot,
      startedAt
    })
  })
  mkdirSync(logDir, { recursive: true })
  ensureWorkspaceRelativeDirectory(workspaceContext.workspaceRoot, workspaceContext.workingRoot)

  database.recordAgentUsage(prepared.agent.id)

  void runtime
    .sendWorkRun({
      runId: prepared.run.id,
      workRequestId: requestId,
      providerId: prepared.run.providerId,
      model: prepared.run.model,
      sandbox: prepared.run.sandbox,
      workspaceRoot: workspaceContext.workspaceRoot,
      workingRoot: workspaceContext.workingRoot,
      agentHomePath: getAgentHome(prepared.agent.id),
      extraDirectories: prepared.agent.extraDirectories,
      agentName: prepared.agent.name,
      agentRole: prepared.agent.role,
      instructions: composeInstructionsWithMemory(
        database,
        prepared.agent.id,
        prepared.agent.instructions
      ),
      connectors: prepared.agent.connectors,
      providerSessionRef,
      title: prepared.run.title,
      instruction: prepared.run.instruction,
      expectedOutput: prepared.run.expectedOutput,
      requiredInputs,
      resumeMessage: prepared.message || undefined,
      logRef,
      eventLogPath: join(logDir, 'events.jsonl'),
      lastMessagePath: join(logDir, 'last-message.txt'),
      observability: observationSink
    })
    .then((result) => {
      try {
        if (isTerminalWorkRunStatus(database.getWorkRun(prepared.run.id).status)) {
          return
        }

        if (result.outcome.outcome === 'needs_input') {
          database.waitForWorkRunInput({
            runId: prepared.run.id,
            providerSessionRef: result.providerSessionRef,
            outcome: result.outcome
          })
          observability.markWorkboardWaitingForUser(prepared.run.id, result.outcome.title)
          return
        }

        const fileRefs = resolveReportedFileRefs({
          workspaceRoot: workspaceContext.workspaceRoot,
          workingRoot: workspaceContext.workingRoot,
          artifactRefs: result.outcome.artifactRefs,
          changedFiles: result.outcome.changedFiles
        })
        assertReportedFileRefsExist(fileRefs.missingRefs)
        // ADR-030: textual output is database-backed; the summary and the full
        // body are persisted directly with no spill-to-file.
        database.completeWorkRun({
          runId: prepared.run.id,
          resultSummary: result.outcome.summary,
          resultContent: result.outcome.content,
          providerSessionRef: result.providerSessionRef,
          artifactRefs: fileRefs.artifactRefs,
          changedFiles: fileRefs.changedFiles
        })
        observability.markWorkboardCompleted(prepared.run.id, result.outcome.summary)
        activeScheduler?.notifyRunTerminal(prepared.run.id, true)
      } catch (error) {
        saveWorkRunFailure(database, prepared.run.id, error)
        observability.markWorkboardFailed(prepared.run.id, getWorkRunErrorMessage(error))
        activeScheduler?.notifyRunTerminal(prepared.run.id, false)
      } finally {
        startWorkRequestRuns(database, runtime, observability, requestId)
      }
    })
    .catch((error) => {
      saveWorkRunFailure(database, prepared.run.id, error)
      observability.markWorkboardFailed(prepared.run.id, getWorkRunErrorMessage(error))
      activeScheduler?.notifyRunTerminal(prepared.run.id, false)
      startWorkRequestRuns(database, runtime, observability, requestId)
    })
}

function buildProviderInvocationSummary(input: {
  providerId: string
  sandbox: string
  workspaceRoot: string
  startedAt: string
}): SanitizedInvocationSummary {
  if (input.providerId === 'claude') {
    return {
      provider: input.providerId,
      executable: input.providerId,
      args: [
        '-p',
        '--output-format',
        'stream-json',
        '--verbose',
        '--json-schema',
        '<schema>',
        '--permission-mode',
        getClaudePermissionModeSummary(input.sandbox),
        '--append-system-prompt-file',
        '<run-log>/system-prompt.txt',
        '--add-dir',
        '<agent-home>',
        '--name',
        '<agent>'
      ],
      cwd: input.workspaceRoot,
      startedAt: input.startedAt
    }
  }

  return {
    provider: input.providerId,
    executable: input.providerId,
    args: [
      'exec',
      '--json',
      '-',
      '--skip-git-repo-check',
      '--sandbox',
      input.sandbox,
      '-C',
      '<workspace>',
      '--output-last-message',
      '<run-log>/last-message.txt',
      input.providerId === 'gemini' ? '--include-directories' : '--add-dir',
      '<agent-home>'
    ],
    cwd: input.workspaceRoot,
    startedAt: input.startedAt
  }
}

function getClaudePermissionModeSummary(sandbox: string): string {
  if (sandbox === 'read-only') {
    return 'plan'
  }

  if (sandbox === 'workspace-write') {
    return 'acceptEdits'
  }

  return 'bypassPermissions'
}

function getWorkRunErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Work Item failed.'
}

function assertReportedFileRefsExist(missingRefs: string[]): void {
  if (missingRefs.length === 0) {
    return
  }

  throw new Error(
    `Provider reported file paths that were not created in the workspace: ${missingRefs.join(', ')}`
  )
}

function getWorkRequestId(run: WorkRun): string {
  if (run.source?.type !== 'work_request') {
    throw new Error('Work Item is not part of a Work Request.')
  }

  return run.source.id
}

function getOptionalWorkRequestId(run: WorkRun): string {
  return run.source?.type === 'work_request' ? run.source.id : ''
}

function getWorkRunWorkspaceContext(
  database: OrdinusDatabase,
  run: WorkRun
): WorkspaceWorkingFolderContext {
  const requestId = getWorkRequestId(run)
  const request = database.getWorkRequest(requestId)
  const workspace = database.getWorkspaceConfig()
  if (!workspace) {
    throw new Error('Choose a workspace before running Work Items.')
  }

  return {
    workspaceRoot: workspace.workspaceRoot,
    workingRoot: request.workingRoot || run.workingRoot
  }
}

function getConversationWorkspaceContext(
  database: OrdinusDatabase,
  conversationId: string
): WorkspaceWorkingFolderContext {
  const conversation = database.getConversation({ conversationId })
  const workspace = database.getWorkspaceConfig()
  if (!workspace) {
    throw new Error('Choose a workspace before running conversations.')
  }

  return {
    workspaceRoot: workspace.workspaceRoot,
    workingRoot: conversation.workingRoot
  }
}

function resolveReportedFileRefs(input: ReportedWorkspaceFileRefs): {
  artifactRefs: string[]
  changedFiles: string[]
  missingRefs: string[]
} {
  const artifactRefs = resolveReportedWorkspaceFileRefs(input.artifactRefs, input)
  const changedFiles = resolveReportedWorkspaceFileRefs(input.changedFiles, input)

  return {
    artifactRefs: artifactRefs.existingRefs,
    changedFiles: changedFiles.existingRefs,
    missingRefs: Array.from(new Set([...artifactRefs.missingRefs, ...changedFiles.missingRefs]))
  }
}

// ADR-030: filename for a result document materialized via "Save as".
function buildSavedResultRelativePath(workingRoot: string, runId: string): string {
  const suffix =
    runId
      .replace(/[^a-zA-Z0-9-]/g, '')
      .slice(-12)
      .toLowerCase() || 'result'
  const folder = workingRoot.replace(/\/+$/, '')
  const fileName = `result-${suffix}.md`
  return folder ? `${folder}/${fileName}` : fileName
}

function createSavedResultDocument(run: WorkRun, content: string): string {
  const title = run.title.trim() || 'Work Item Result'
  return [
    '---',
    `title: ${title}`,
    'summary: Result saved from Ordinus.',
    `created_by: ${run.assignedAgentName.trim() || 'Ordinus'}`,
    `created_at: ${new Date().toISOString().slice(0, 10)}`,
    'tags:',
    '  - ordinus',
    '  - workboard',
    '---',
    '',
    content.trim(),
    ''
  ].join('\n')
}

function saveWorkRunFailure(database: OrdinusDatabase, runId: string, error: unknown): void {
  try {
    const current = database.getWorkRun(runId)
    if (isTerminalWorkRunStatus(current.status)) {
      return
    }

    database.failWorkRun({
      runId,
      error: error instanceof Error ? error.message : 'Work Item failed.'
    })
  } catch (failError) {
    try {
      if (isTerminalWorkRunStatus(database.getWorkRun(runId).status)) {
        return
      }
    } catch {
      // The run may have been deleted while the background provider process was resolving.
    }
    console.warn('Work Item failure could not be saved.', failError)
  }
}

function isTerminalWorkRunStatus(status: WorkRun['status']): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}

async function prepareConversationTurn(
  database: OrdinusDatabase,
  runtime: RuntimeService,
  current: ConversationDetail,
  input: ConversationSendTurnInput
): Promise<PreparedConversationTurn> {
  if (current.routingMode !== 'orchestrated') {
    return database.prepareConversationTurn(input)
  }

  const plan = OrchestrationPlanSchema.parse(
    await runtime.generateOrchestrationPlan({
      ...(await getOrchestratorRuntimeConfig(database, runtime)),
      participants: current.participants,
      mentionedParticipantIds: input.targetParticipantIds ?? [],
      userMessage: input.message
    })
  )

  return database.prepareOrchestratedConversationTurn(input, plan.assignments)
}

function startPreparedConversationTurns(
  database: OrdinusDatabase,
  runtime: RuntimeService,
  observability: ObservabilityService,
  prepared: PreparedConversationTurn
): void {
  const workspace = database.getWorkspaceConfig()
  if (!workspace) {
    throw new Error('Choose a workspace before running conversations.')
  }
  const conversation = database.getConversation({ conversationId: prepared.conversationId })
  ensureWorkspaceRelativeDirectory(workspace.workspaceRoot, conversation.workingRoot)

  prepared.agentTurns.forEach((agentTurn) => {
    const logRef = join('conversations', prepared.conversationId, agentTurn.agentTurnId)
    const logDir = join(getSystemPaths().logs, logRef)
    const turn = database.getConversationTurn(agentTurn.agentTurnId)
    const startedAt = new Date().toISOString()
    const observationSink = observability.startConversationTurn({
      turn,
      conversationId: prepared.conversationId,
      conversationTitle: conversation.title,
      agent: agentTurn.agent,
      logRef,
      invocation: buildProviderInvocationSummary({
        providerId: agentTurn.agent.providerId,
        sandbox: agentTurn.agent.sandbox,
        workspaceRoot: workspace.workspaceRoot,
        startedAt
      })
    })
    mkdirSync(logDir, { recursive: true })

    database.recordAgentUsage(agentTurn.agent.id)

    void runtime
      .sendConversationTurn({
        turnId: agentTurn.agentTurnId,
        conversationId: prepared.conversationId,
        providerId: agentTurn.agent.providerId,
        model: agentTurn.agent.model,
        sandbox: agentTurn.agent.sandbox,
        workspaceRoot: workspace.workspaceRoot,
        workingRoot: conversation.workingRoot,
        agentHomePath: getAgentHome(agentTurn.agent.id),
        extraDirectories: agentTurn.agent.extraDirectories,
        agentName: agentTurn.agent.name,
        agentRole: agentTurn.agent.role,
        instructions: composeInstructionsWithMemory(
          database,
          agentTurn.agent.id,
          agentTurn.agent.instructions
        ),
        connectors: agentTurn.agent.connectors,
        providerSessionRef: agentTurn.providerSessionRef,
        message: agentTurn.message,
        logRef,
        eventLogPath: join(logDir, 'events.jsonl'),
        lastMessagePath: join(logDir, 'last-message.txt'),
        observability: observationSink
      })
      .then((result) => {
        saveConversationTurnCompletion(database, observability, agentTurn, result)
      })
      .catch((error) => {
        saveConversationTurnFailure(database, observability, agentTurn.agentTurnId, error, logRef)
      })
  })
}

async function getOrchestratorRuntimeConfig(
  database: OrdinusDatabase,
  runtime: RuntimeService
): Promise<{ providerId: ProviderId; model: string; workspaceRoot: string }> {
  const workspace = database.getWorkspaceConfig()
  if (!workspace) {
    throw new Error('Choose a workspace before using Orchestrator.')
  }

  const providers = await runtime.getProviderStatuses()
  const provider = providers.find((status) => status.id === workspace.defaultProviderId)

  if (!provider?.connected) {
    throw new Error('Connect the default provider before using Orchestrator.')
  }

  return {
    providerId: workspace.defaultProviderId,
    model: workspace.defaultModel,
    workspaceRoot: workspace.workspaceRoot
  }
}

function saveConversationTurnCompletion(
  database: OrdinusDatabase,
  observability: ObservabilityService,
  agentTurn: PreparedConversationAgentTurn,
  result: Awaited<ReturnType<RuntimeService['sendConversationTurn']>>
): void {
  try {
    const turnId = agentTurn.agentTurnId
    const outcome = resolveConversationTurnOutcome(database, turnId, result.outcome)
    database.completeConversationTurn({
      turnId,
      providerId: agentTurn.agent.providerId,
      model: agentTurn.agent.model,
      providerSessionRef: result.providerSessionRef,
      outcome,
      logRef: result.logRef,
      sessionReset: result.sessionReset
    })
    if (outcome.outcome === 'needs_input') {
      observability.markConversationWaitingForUser(turnId, outcome.title)
    } else {
      observability.markConversationCompleted(turnId, outcome.summary)
    }
  } catch (error) {
    saveConversationTurnFailure(
      database,
      observability,
      agentTurn.agentTurnId,
      error,
      result.logRef
    )
  }
}

function resolveConversationTurnOutcome(
  database: OrdinusDatabase,
  turnId: string,
  outcome: AgentTurnOutcome
): AgentTurnOutcome {
  if (outcome.outcome !== 'final_response') {
    return outcome
  }

  const turn = database.getConversationTurn(turnId)
  const fileRefs = resolveReportedFileRefs({
    ...getConversationWorkspaceContext(database, turn.conversationId),
    artifactRefs: outcome.artifactRefs,
    changedFiles: outcome.changedFiles
  })
  assertReportedFileRefsExist(fileRefs.missingRefs)

  return {
    ...outcome,
    artifactRefs: fileRefs.artifactRefs,
    changedFiles: fileRefs.changedFiles
  }
}

function saveConversationTurnFailure(
  database: OrdinusDatabase,
  observability: ObservabilityService,
  turnId: string,
  error: unknown,
  logRef: string
): void {
  try {
    const message = error instanceof Error ? error.message : 'Conversation turn failed.'
    database.failConversationTurn({
      turnId,
      error: message,
      logRef
    })
    observability.markConversationFailed(turnId, message)
  } catch (failError) {
    console.warn('Conversation turn failure could not be saved.', failError)
  }
}

function deleteLogRefs(logRefs: string[]): void {
  const logsRoot = resolve(getSystemPaths().logs)

  logRefs.forEach((logRef) => {
    const logPath = resolveInsideRoot(logsRoot, logRef, 'Log path')

    rmSync(logPath, { recursive: true, force: true })
    pruneEmptyDirectories(logsRoot, dirname(logPath))
  })
}

function pruneEmptyDirectories(root: string, startPath: string): void {
  let currentPath = startPath

  while (currentPath !== root) {
    if (!isInsideRoot(root, currentPath)) {
      return
    }

    try {
      if (readdirSync(currentPath).length > 0) {
        return
      }
      rmSync(currentPath, { recursive: false, force: true })
      currentPath = dirname(currentPath)
    } catch {
      return
    }
  }
}

function resolveInsideRoot(root: string, pathSegment: string, label: string): string {
  const resolvedPath = resolve(root, pathSegment)

  if (!isInsideRoot(root, resolvedPath)) {
    throw new Error(`${label} must stay inside the Ordinus logs folder.`)
  }

  return resolvedPath
}

function isInsideRoot(root: string, pathToCheck: string): boolean {
  const relativePath = relative(root, pathToCheck)

  return (
    relativePath !== '' && !relativePath.startsWith('..') && resolve(relativePath) !== relativePath
  )
}
