import { contextBridge, ipcRenderer } from 'electron'
import type {
  Agent,
  AgentCreateInput,
  AgentDraft,
  AgentDraftFromIntentInput,
  AgentSkill,
  AgentSkillCreateInput,
  AgentSkillsListInput,
  AgentUpdateInstructionsInput,
  AgentUpdateSettingsInput,
  AppInfo,
  CodexConnectResult,
  DbStatus,
  ProviderStatus,
  SetupStatus,
  SystemPaths,
  WorkspaceConfig,
  WorkspaceSaveConfigInput,
  WorkspaceSelectFolderResult
} from '@shared/contracts'
import { ipcChannels } from '@shared/ipc'

const ordinus = {
  app: {
    getInfo: async (): Promise<AppInfo> => ipcRenderer.invoke(ipcChannels.appGetInfo)
  },
  system: {
    getPaths: async (): Promise<SystemPaths> => ipcRenderer.invoke(ipcChannels.systemGetPaths)
  },
  db: {
    getStatus: async (): Promise<DbStatus> => ipcRenderer.invoke(ipcChannels.dbGetStatus)
  },
  setup: {
    getStatus: async (): Promise<SetupStatus> => ipcRenderer.invoke(ipcChannels.setupGetStatus)
  },
  workspace: {
    selectFolder: async (): Promise<WorkspaceSelectFolderResult> =>
      ipcRenderer.invoke(ipcChannels.workspaceSelectFolder),
    saveConfig: async (input: WorkspaceSaveConfigInput): Promise<WorkspaceConfig> =>
      ipcRenderer.invoke(ipcChannels.workspaceSaveConfig, input)
  },
  agents: {
    list: async (): Promise<Agent[]> => ipcRenderer.invoke(ipcChannels.agentsList),
    draftFromIntent: async (input: AgentDraftFromIntentInput): Promise<AgentDraft> =>
      ipcRenderer.invoke(ipcChannels.agentsDraftFromIntent, input),
    create: async (input: AgentCreateInput): Promise<Agent> =>
      ipcRenderer.invoke(ipcChannels.agentsCreate, input),
    updateInstructions: async (input: AgentUpdateInstructionsInput): Promise<Agent> =>
      ipcRenderer.invoke(ipcChannels.agentsUpdateInstructions, input),
    updateSettings: async (input: AgentUpdateSettingsInput): Promise<Agent> =>
      ipcRenderer.invoke(ipcChannels.agentsUpdateSettings, input),
    listSkills: async (input: AgentSkillsListInput): Promise<AgentSkill[]> =>
      ipcRenderer.invoke(ipcChannels.agentsListSkills, input),
    createSkill: async (input: AgentSkillCreateInput): Promise<AgentSkill> =>
      ipcRenderer.invoke(ipcChannels.agentsCreateSkill, input)
  },
  runtime: {
    getProviders: async (): Promise<ProviderStatus[]> =>
      ipcRenderer.invoke(ipcChannels.runtimeGetProviders),
    connectCodex: async (): Promise<CodexConnectResult> =>
      ipcRenderer.invoke(ipcChannels.runtimeConnectCodex),
    refreshCodex: async (): Promise<ProviderStatus> =>
      ipcRenderer.invoke(ipcChannels.runtimeRefreshCodex)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('ordinus', ordinus)
  } catch (error) {
    console.error(error)
  }
} else {
  throw new Error('Ordinus requires context isolation.')
}
