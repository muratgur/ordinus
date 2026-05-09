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
  ConversationCreateDirectInputSchema,
  ConversationCreateManualInputSchema,
  ConversationGetInputSchema,
  ConversationSendTurnInputSchema,
  ProviderActionInputSchema,
  ProviderConnectInputSchema,
  SetupStatusSchema,
  WorkspaceSaveConfigInputSchema,
  WorkspaceSelectFolderResultSchema,
  WorkspaceUpdateSystemDefaultInputSchema
} from '@shared/contracts'
import { ipcChannels } from '@shared/ipc'
import type { OrdinusDatabase } from '../db/database'
import { getSystemPaths } from '../paths'
import type { RuntimeService } from '../runtime'
import {
  createAgentSkill,
  deleteAgentHome,
  ensureAgentHome,
  listAgentSkills
} from '../agents/filesystem'

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
  ipcMain.handle(ipcChannels.conversationsSendTurn, async (_event, payload) => {
    const input = ConversationSendTurnInputSchema.parse(payload)
    const current = database.getConversation({ conversationId: input.conversationId })
    const participant = current.participants[0]

    if (!participant) {
      throw new Error('Conversation has no participant.')
    }

    const prepared = database.prepareConversationTurn(input)
    const logRef = join('conversations', prepared.conversationId, prepared.agentTurnId)
    const logDir = join(getSystemPaths().logs, logRef)
    mkdirSync(logDir, { recursive: true })

    void runtime
      .sendConversationTurn({
        turnId: prepared.agentTurnId,
        conversationId: prepared.conversationId,
        providerId: prepared.agent.providerId,
        model: prepared.agent.model,
        sandbox: prepared.agent.sandbox,
        workspaceRoot: prepared.agent.workspaceRoot,
        agentName: prepared.agent.name,
        agentRole: prepared.agent.role,
        instructions: prepared.agent.instructions,
        providerSessionRef: prepared.providerSessionRef,
        message: input.message,
        logRef,
        eventLogPath: join(logDir, 'events.jsonl'),
        lastMessagePath: join(logDir, 'last-message.txt')
      })
      .then((result) => {
        saveConversationTurnCompletion(database, prepared.agentTurnId, result)
      })
      .catch((error) => {
        saveConversationTurnFailure(database, prepared.agentTurnId, error, logRef)
      })

    return database.getConversation({ conversationId: prepared.conversationId })
  })
  ipcMain.handle(ipcChannels.conversationsCancelTurn, (_event, payload) => {
    const input = ConversationCancelTurnInputSchema.parse(payload)
    runtime.cancelConversationTurn(input.turnId)
    return database.cancelConversationTurn(input)
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

function saveConversationTurnCompletion(
  database: OrdinusDatabase,
  turnId: string,
  result: { providerSessionRef: string; responseText: string; logRef: string }
): void {
  try {
    database.completeConversationTurn({
      turnId,
      providerSessionRef: result.providerSessionRef,
      responseText: result.responseText,
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
