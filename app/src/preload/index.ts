import { contextBridge, ipcRenderer } from 'electron'
import type {
  Agent,
  AgentCreateInput,
  AgentDeleteInput,
  AgentDeleteResult,
  AgentDraft,
  AgentDraftFromIntentInput,
  AgentSkill,
  AgentSkillCreateInput,
  AgentSkillsListInput,
  AgentUpdateInstructionsInput,
  AgentUpdateSettingsInput,
  AppInfo,
  ConversationCancelTurnInput,
  ConversationCreateDirectInput,
  ConversationDetail,
  ConversationGetInput,
  ConversationListItem,
  ConversationSendTurnInput,
  DbStatus,
  ProviderActionInput,
  ProviderConnectInput,
  ProviderConnectResult,
  ProviderStatus,
  SetupStatus,
  SystemPaths,
  WorkspaceConfig,
  WorkspaceSaveConfigInput,
  WorkspaceUpdateSystemDefaultInput,
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
      ipcRenderer.invoke(ipcChannels.workspaceSaveConfig, input),
    updateSystemDefault: async (
      input: WorkspaceUpdateSystemDefaultInput
    ): Promise<WorkspaceConfig> =>
      ipcRenderer.invoke(ipcChannels.workspaceUpdateSystemDefault, input)
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
    delete: async (input: AgentDeleteInput): Promise<AgentDeleteResult> =>
      ipcRenderer.invoke(ipcChannels.agentsDelete, input),
    listSkills: async (input: AgentSkillsListInput): Promise<AgentSkill[]> =>
      ipcRenderer.invoke(ipcChannels.agentsListSkills, input),
    createSkill: async (input: AgentSkillCreateInput): Promise<AgentSkill> =>
      ipcRenderer.invoke(ipcChannels.agentsCreateSkill, input)
  },
  conversations: {
    list: async (): Promise<ConversationListItem[]> =>
      ipcRenderer.invoke(ipcChannels.conversationsList),
    get: async (input: ConversationGetInput): Promise<ConversationDetail> =>
      ipcRenderer.invoke(ipcChannels.conversationsGet, input),
    createDirect: async (input: ConversationCreateDirectInput): Promise<ConversationDetail> =>
      ipcRenderer.invoke(ipcChannels.conversationsCreateDirect, input),
    sendTurn: async (input: ConversationSendTurnInput): Promise<ConversationDetail> =>
      ipcRenderer.invoke(ipcChannels.conversationsSendTurn, input),
    cancelTurn: async (input: ConversationCancelTurnInput): Promise<ConversationDetail> =>
      ipcRenderer.invoke(ipcChannels.conversationsCancelTurn, input)
  },
  runtime: {
    getProviders: async (): Promise<ProviderStatus[]> =>
      ipcRenderer.invoke(ipcChannels.runtimeGetProviders),
    connectProvider: async (input: ProviderConnectInput): Promise<ProviderConnectResult> =>
      ipcRenderer.invoke(ipcChannels.runtimeConnectProvider, input),
    refreshProvider: async (input: ProviderActionInput): Promise<ProviderStatus> =>
      ipcRenderer.invoke(ipcChannels.runtimeRefreshProvider, input)
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
