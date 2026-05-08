import { app, BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from 'electron'
import { basename } from 'node:path'
import {
  AgentDraftFromIntentInputSchema,
  AgentSkillCreateInputSchema,
  AgentSkillsListInputSchema,
  AgentUpdateInstructionsInputSchema,
  AgentUpdateSettingsInputSchema,
  AgentCreateInputSchema,
  AppInfoSchema,
  ProviderActionInputSchema,
  ProviderConnectInputSchema,
  SetupStatusSchema,
  WorkspaceSaveConfigInputSchema,
  WorkspaceSelectFolderResultSchema
} from '@shared/contracts'
import { ipcChannels } from '@shared/ipc'
import type { OrdinusDatabase } from '../db/database'
import { getSystemPaths } from '../paths'
import type { RuntimeService } from '../runtime'
import { createAgentSkill, ensureAgentHome, listAgentSkills } from '../agents/filesystem'

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
    const codex = providers.find((provider) => provider.id === 'codex')

    return SetupStatusSchema.parse({
      ready: Boolean(workspace && codex?.connected),
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
  ipcMain.handle(ipcChannels.agentsList, () => {
    const agents = database.listAgents()
    agents.forEach((agent) => ensureAgentHome(agent))
    return agents
  })
  ipcMain.handle(ipcChannels.agentsDraftFromIntent, async (_event, payload) => {
    const input = AgentDraftFromIntentInputSchema.parse(payload)
    const workspaceRoot = input.workspaceRoot ?? database.getWorkspaceConfig()?.workspaceRoot

    if (!workspaceRoot) {
      throw new Error('Choose a workspace before creating an agent.')
    }

    return runtime.generateAgentDraft({ ...input, workspaceRoot })
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
