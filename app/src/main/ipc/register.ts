import { app, BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from 'electron'
import { mkdirSync, readdirSync, rmSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import {
  AgentDeleteInputSchema,
  AgentDraftFromIntentInputSchema,
  AgentSkillCreateInputSchema,
  AgentSkillsListInputSchema,
  AgentUpdateInstructionsInputSchema,
  AgentUpdateSettingsInputSchema,
  AgentCreateInputSchema,
  AppInfoSchema,
  ConversationCancelTurnInputSchema,
  ConversationAnswerInputRequestInputSchema,
  ConversationCancelInputRequestInputSchema,
  ConversationCreateDirectInputSchema,
  ConversationCreateManualInputSchema,
  ConversationGetInputSchema,
  ConversationSendTurnInputSchema,
  ConversationUpdateRoutingModeInputSchema,
  OrchestrationPlanSchema,
  ProviderActionInputSchema,
  ProviderConnectInputSchema,
  SetupStatusSchema,
  WorkboardAnswerInputRequestInputSchema,
  WorkboardDirectStartInputSchema,
  WorkboardDraftPlanSchema,
  WorkboardGeneratePlanInputSchema,
  WorkboardStartRequestInputSchema,
  WorkRunActionInputSchema,
  WorkspaceSaveConfigInputSchema,
  WorkspaceSelectFolderResultSchema,
  WorkspaceUpdateSystemDefaultInputSchema,
  validateWorkboardDraftPlanDependencies,
  type Agent,
  type ConversationDetail,
  type ConversationSendTurnInput,
  type ProviderId,
  type WorkboardDraftPlan,
  type WorkRun
} from '@shared/contracts'
import { ipcChannels } from '@shared/ipc'
import type { OrdinusDatabase, PreparedConversationTurn, PreparedWorkRun } from '../db/database'
import { getSystemPaths } from '../paths'
import type { RuntimeService } from '../runtime'
import {
  createAgentSkill,
  deleteAgentHome,
  ensureAgentHome,
  listAgentSkills
} from '../agents/filesystem'

const workRequestConcurrencyLimit = 3

export function registerIpcHandlers(database: OrdinusDatabase, runtime: RuntimeService): void {
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
  ipcMain.handle(ipcChannels.agentsDraftFromIntent, async (_event, payload) => {
    const input = AgentDraftFromIntentInputSchema.parse(payload)
    const workspace = database.getWorkspaceConfig()
    const workspaceRoot = input.workspaceRoot ?? workspace?.workspaceRoot

    if (!workspaceRoot) {
      throw new Error('Choose a workspace before creating an agent.')
    }

    return runtime.generateAgentDraft({
      ...input,
      providerId: workspace?.defaultProviderId ?? 'codex',
      model: workspace?.defaultModel ?? 'default',
      workspaceRoot
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
  ipcMain.handle(ipcChannels.agentsDelete, (_event, payload) => {
    const input = AgentDeleteInputSchema.parse(payload)
    const result = database.deleteAgent(input)
    deleteAgentHome(result.deletedAgentId)
    deleteLogRefs(result.deletedLogRefs)
    return result
  })
  ipcMain.handle(ipcChannels.agentsListSkills, (_event, payload) => {
    const input = AgentSkillsListInputSchema.parse(payload)
    requireAgent(database, input.agentId)
    return listAgentSkills(input.agentId)
  })
  ipcMain.handle(ipcChannels.agentsCreateSkill, (_event, payload) => {
    const input = AgentSkillCreateInputSchema.parse(payload)
    requireAgent(database, input.agentId)
    return createAgentSkill(input)
  })
  ipcMain.handle(ipcChannels.conversationsList, () => database.listConversations())
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
    startPreparedConversationTurns(database, runtime, prepared)

    return database.getConversation({ conversationId: prepared.conversationId })
  })
  ipcMain.handle(ipcChannels.conversationsCancelTurn, (_event, payload) => {
    const input = ConversationCancelTurnInputSchema.parse(payload)
    runtime.cancelConversationTurn(input.turnId)
    return database.cancelConversationTurn(input)
  })
  ipcMain.handle(ipcChannels.conversationsAnswerInputRequest, async (_event, payload) => {
    const input = ConversationAnswerInputRequestInputSchema.parse(payload)
    const prepared = database.answerConversationInputRequest(input)
    startPreparedConversationTurns(database, runtime, prepared)

    return database.getConversation({ conversationId: prepared.conversationId })
  })
  ipcMain.handle(ipcChannels.conversationsCancelInputRequest, (_event, payload) => {
    const input = ConversationCancelInputRequestInputSchema.parse(payload)
    return database.cancelConversationInputRequest(input)
  })
  ipcMain.handle(ipcChannels.workboardList, () => database.getWorkboardData())
  ipcMain.handle(ipcChannels.workboardGeneratePlan, async (_event, payload) => {
    const input = WorkboardGeneratePlanInputSchema.parse(payload)
    return generateWorkboardPlan(database, runtime, input.request)
  })
  ipcMain.handle(ipcChannels.workboardStartRequest, (_event, payload) => {
    const input = WorkboardStartRequestInputSchema.parse(payload)
    const request = database.createWorkRequest(input)
    startWorkRequestRuns(database, runtime, request.id)
    return database.getWorkboardData()
  })
  ipcMain.handle(ipcChannels.workboardDirectStart, async (_event, payload) => {
    const input = WorkboardDirectStartInputSchema.parse(payload)
    const plan = await generateWorkboardPlan(database, runtime, input.request)
    if (plan.items.length > 8) {
      throw new Error('Review this Work Request before starting because it has many Work Items.')
    }
    const request = database.createWorkRequest({
      originalRequest: input.request,
      plan
    })
    startWorkRequestRuns(database, runtime, request.id)
    return database.getWorkboardData()
  })
  ipcMain.handle(ipcChannels.workboardCancelRun, (_event, payload) => {
    const input = WorkRunActionInputSchema.parse(payload)
    runtime.cancelConversationTurn(input.runId)
    const run = database.cancelWorkRun(input)
    const requestId = getOptionalWorkRequestId(run)
    if (requestId) {
      startWorkRequestRuns(database, runtime, requestId)
    }
    return database.getWorkboardData()
  })
  ipcMain.handle(ipcChannels.workboardAnswerInputRequest, (_event, payload) => {
    const input = WorkboardAnswerInputRequestInputSchema.parse(payload)
    const prepared = database.answerWorkRunInputRequest(input)
    startPreparedWorkRun(database, runtime, prepared)
    return database.getWorkboardData()
  })
  ipcMain.handle(ipcChannels.runtimeGetProviders, () => runtime.getProviderStatuses())
  ipcMain.handle(ipcChannels.runtimeConnectProvider, (_event, payload) => {
    const input = ProviderConnectInputSchema.parse(payload)
    return runtime.connectProvider(input)
  })
  ipcMain.handle(ipcChannels.runtimeRefreshProvider, (_event, payload) => {
    const input = ProviderActionInputSchema.parse(payload)
    return runtime.refreshProvider(input)
  })
}

function requireAgent(database: OrdinusDatabase, agentId: string): void {
  if (!database.hasAgent(agentId)) {
    throw new Error('Agent was not found.')
  }
}

async function generateWorkboardPlan(
  database: OrdinusDatabase,
  runtime: RuntimeService,
  request: string
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
      request
    })
  )

  validateWorkboardPlanAgents(plan.items, agents)
  validateWorkboardDraftPlanDependencies(plan.items)

  return plan
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
  requestId: string
): void {
  const availableSlots =
    workRequestConcurrencyLimit - database.countRunningWorkRunsForRequest(requestId)
  if (availableSlots <= 0) {
    return
  }

  database
    .listRunnableWorkRunsForRequest(requestId, availableSlots)
    .map((run) => database.startWorkRun({ runId: run.id }))
    .forEach((run) => {
      const agent = database.getAgent(run.assignedAgentId)
      const requiredInputs = database.getRequiredInputSummaries(run.id)

      startPreparedWorkRun(
        database,
        runtime,
        {
          run,
          agent,
          message: '',
          providerSessionRef: run.providerSessionRef
        },
        requiredInputs
      )
    })
}

function startPreparedWorkRun(
  database: OrdinusDatabase,
  runtime: RuntimeService,
  prepared: PreparedWorkRun,
  requiredInputs = database.getRequiredInputSummaries(prepared.run.id)
): void {
  const requestId = getWorkRequestId(prepared.run)
  const logRef = join('work-requests', requestId, prepared.run.id)
  const logDir = join(getSystemPaths().logs, logRef)
  mkdirSync(logDir, { recursive: true })

  void runtime
    .sendWorkRun({
      runId: prepared.run.id,
      workRequestId: requestId,
      providerId: prepared.run.providerId,
      model: prepared.run.model,
      sandbox: prepared.run.sandbox,
      workspaceRoot: prepared.run.workspaceRoot,
      agentName: prepared.agent.name,
      agentRole: prepared.agent.role,
      instructions: prepared.agent.instructions,
      providerSessionRef: prepared.providerSessionRef,
      title: prepared.run.title,
      instruction: prepared.run.instruction,
      expectedOutput: prepared.run.expectedOutput,
      requiredInputs,
      resumeMessage: prepared.message || undefined,
      logRef,
      eventLogPath: join(logDir, 'events.jsonl'),
      lastMessagePath: join(logDir, 'last-message.txt')
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
          return
        }

        database.completeWorkRun({
          runId: prepared.run.id,
          resultSummary: result.outcome.content,
          providerSessionRef: result.providerSessionRef,
          artifactRef: result.logRef
        })
      } catch (error) {
        saveWorkRunFailure(database, prepared.run.id, error)
      } finally {
        startWorkRequestRuns(database, runtime, requestId)
      }
    })
    .catch((error) => {
      saveWorkRunFailure(database, prepared.run.id, error)
      startWorkRequestRuns(database, runtime, requestId)
    })
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
  prepared: PreparedConversationTurn
): void {
  prepared.agentTurns.forEach((agentTurn) => {
    const logRef = join('conversations', prepared.conversationId, agentTurn.agentTurnId)
    const logDir = join(getSystemPaths().logs, logRef)
    mkdirSync(logDir, { recursive: true })

    void runtime
      .sendConversationTurn({
        turnId: agentTurn.agentTurnId,
        conversationId: prepared.conversationId,
        providerId: agentTurn.agent.providerId,
        model: agentTurn.agent.model,
        sandbox: agentTurn.agent.sandbox,
        workspaceRoot: agentTurn.agent.workspaceRoot,
        agentName: agentTurn.agent.name,
        agentRole: agentTurn.agent.role,
        instructions: agentTurn.agent.instructions,
        providerSessionRef: agentTurn.providerSessionRef,
        message: agentTurn.message,
        logRef,
        eventLogPath: join(logDir, 'events.jsonl'),
        lastMessagePath: join(logDir, 'last-message.txt')
      })
      .then((result) => {
        saveConversationTurnCompletion(database, agentTurn.agentTurnId, result)
      })
      .catch((error) => {
        saveConversationTurnFailure(database, agentTurn.agentTurnId, error, logRef)
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
  turnId: string,
  result: Awaited<ReturnType<RuntimeService['sendConversationTurn']>>
): void {
  try {
    database.completeConversationTurn({
      turnId,
      providerSessionRef: result.providerSessionRef,
      outcome: result.outcome,
      logRef: result.logRef
    })
  } catch (error) {
    console.warn('Conversation turn completion could not be saved.', error)
  }
}

function saveConversationTurnFailure(
  database: OrdinusDatabase,
  turnId: string,
  error: unknown,
  logRef: string
): void {
  try {
    database.failConversationTurn({
      turnId,
      error: error instanceof Error ? error.message : 'Conversation turn failed.',
      logRef
    })
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
