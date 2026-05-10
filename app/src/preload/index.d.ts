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
  ConversationAnswerInputRequestInput,
  ConversationCancelInputRequestInput,
  ConversationCreateDirectInput,
  ConversationCreateManualInput,
  ConversationDetail,
  ConversationGetInput,
  ConversationListItem,
  ConversationSendTurnInput,
  ConversationUpdateRoutingModeInput,
  DbStatus,
  ProviderActionInput,
  ProviderConnectInput,
  ProviderConnectResult,
  ProviderStatus,
  SetupStatus,
  SystemPaths,
  WorkboardAnswerInputRequestInput,
  WorkboardData,
  WorkboardDirectStartInput,
  WorkboardDraftPlan,
  WorkboardGeneratePlanInput,
  WorkboardRevealPathInput,
  WorkboardStartRequestInput,
  WorkRunActionInput,
  WorkspaceConfig,
  WorkspaceSaveConfigInput,
  WorkspaceUpdateSystemDefaultInput,
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
    updateSystemDefault: (input: WorkspaceUpdateSystemDefaultInput) => Promise<WorkspaceConfig>
  }
  agents: {
    list: () => Promise<Agent[]>
    draftFromIntent: (input: AgentDraftFromIntentInput) => Promise<AgentDraft>
    create: (input: AgentCreateInput) => Promise<Agent>
    updateInstructions: (input: AgentUpdateInstructionsInput) => Promise<Agent>
    updateSettings: (input: AgentUpdateSettingsInput) => Promise<Agent>
    delete: (input: AgentDeleteInput) => Promise<AgentDeleteResult>
    listSkills: (input: AgentSkillsListInput) => Promise<AgentSkill[]>
    createSkill: (input: AgentSkillCreateInput) => Promise<AgentSkill>
  }
  conversations: {
    list: () => Promise<ConversationListItem[]>
    get: (input: ConversationGetInput) => Promise<ConversationDetail>
    createDirect: (input: ConversationCreateDirectInput) => Promise<ConversationDetail>
    createManual: (input: ConversationCreateManualInput) => Promise<ConversationDetail>
    updateRoutingMode: (input: ConversationUpdateRoutingModeInput) => Promise<ConversationDetail>
    sendTurn: (input: ConversationSendTurnInput) => Promise<ConversationDetail>
    cancelTurn: (input: ConversationCancelTurnInput) => Promise<ConversationDetail>
    answerInputRequest: (input: ConversationAnswerInputRequestInput) => Promise<ConversationDetail>
    cancelInputRequest: (input: ConversationCancelInputRequestInput) => Promise<ConversationDetail>
  }
  workboard: {
    list: () => Promise<WorkboardData>
    generatePlan: (input: WorkboardGeneratePlanInput) => Promise<WorkboardDraftPlan>
    startRequest: (input: WorkboardStartRequestInput) => Promise<WorkboardData>
    directStart: (input: WorkboardDirectStartInput) => Promise<WorkboardData>
    cancelRun: (input: WorkRunActionInput) => Promise<WorkboardData>
    answerInputRequest: (input: WorkboardAnswerInputRequestInput) => Promise<WorkboardData>
    revealPath: (input: WorkboardRevealPathInput) => Promise<void>
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
