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
  DbStatus,
  ProviderActionInput,
  ProviderConnectInput,
  ProviderConnectResult,
  ProviderStatus,
  SetupStatus,
  SystemPaths,
  WorkspaceConfig,
  WorkspaceSaveConfigInput,
  WorkspaceSelectFolderResult
} from '@shared/contracts'

export type OrdinusApi = {
  app: {
    getInfo: () => Promise<AppInfo>
  }
  system: {
    getPaths: () => Promise<SystemPaths>
  }
  db: {
    getStatus: () => Promise<DbStatus>
  }
  setup: {
    getStatus: () => Promise<SetupStatus>
  }
  workspace: {
    selectFolder: () => Promise<WorkspaceSelectFolderResult>
    saveConfig: (input: WorkspaceSaveConfigInput) => Promise<WorkspaceConfig>
  }
  agents: {
    list: () => Promise<Agent[]>
    draftFromIntent: (input: AgentDraftFromIntentInput) => Promise<AgentDraft>
    create: (input: AgentCreateInput) => Promise<Agent>
    updateInstructions: (input: AgentUpdateInstructionsInput) => Promise<Agent>
    updateSettings: (input: AgentUpdateSettingsInput) => Promise<Agent>
    listSkills: (input: AgentSkillsListInput) => Promise<AgentSkill[]>
    createSkill: (input: AgentSkillCreateInput) => Promise<AgentSkill>
  }
  runtime: {
    getProviders: () => Promise<ProviderStatus[]>
    connectProvider: (input: ProviderConnectInput) => Promise<ProviderConnectResult>
    refreshProvider: (input: ProviderActionInput) => Promise<ProviderStatus>
  }
}

declare global {
  interface Window {
    ordinus: OrdinusApi
  }
}
