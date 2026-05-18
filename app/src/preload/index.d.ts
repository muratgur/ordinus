import type {
  Agent,
  AgentCreateInput,
  AgentDeleteInput,
  AgentDeleteResult,
  AgentDraft,
  AgentDraftFromProfileInput,
  AgentDraftFromIntentInput,
  AgentProfileCatalog,
  AgentSkill,
  AgentSkillCreateInput,
  AgentSkillDeleteInput,
  AgentSkillDeleteResult,
  AgentSkillDetail,
  AgentSkillGetInput,
  AgentSkillsListInput,
  AgentSkillUpdateInput,
  AgentUpdateInstructionsInput,
  AgentUpdateSettingsInput,
  AppInfo,
  ConversationCancelTurnInput,
  ConversationAnswerInputRequestInput,
  ConversationCancelInputRequestInput,
  ConversationCreateDirectInput,
  ConversationCreateManualInput,
  ConversationDeleteInput,
  ConversationDeletePreview,
  ConversationDeletePreviewInput,
  ConversationDeleteResult,
  ConversationDetail,
  ConversationGetInput,
  ConversationListItem,
  ConversationRevealPathInput,
  ConversationSendTurnInput,
  ConversationUpdateTitleInput,
  ConversationUpdateRoutingModeInput,
  DbStatus,
  ObservedConversationRunsInput,
  ObservedRunDiagnostics,
  ObservedRunDiagnosticsInput,
  ObservedRunEvent,
  ObservedRunListEventsInput,
  ObservedRunSnapshot,
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
  WorkboardGenerateFollowUpPlanInput,
  WorkboardGeneratePlanInput,
  WorkboardGenerateRequestPlanInput,
  WorkboardRevealPathInput,
  WorkboardStartFollowUpInput,
  WorkboardStartRequestPlanInput,
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
    listProfiles: () => Promise<AgentProfileCatalog>
    draftFromIntent: (input: AgentDraftFromIntentInput) => Promise<AgentDraft>
    draftFromProfile: (input: AgentDraftFromProfileInput) => Promise<AgentDraft>
    draftBlank: () => Promise<AgentDraft>
    create: (input: AgentCreateInput) => Promise<Agent>
    updateInstructions: (input: AgentUpdateInstructionsInput) => Promise<Agent>
    updateSettings: (input: AgentUpdateSettingsInput) => Promise<Agent>
    delete: (input: AgentDeleteInput) => Promise<AgentDeleteResult>
    listSkills: (input: AgentSkillsListInput) => Promise<AgentSkill[]>
    getSkill: (input: AgentSkillGetInput) => Promise<AgentSkillDetail>
    createSkill: (input: AgentSkillCreateInput) => Promise<AgentSkill>
    updateSkill: (input: AgentSkillUpdateInput) => Promise<AgentSkill>
    deleteSkill: (input: AgentSkillDeleteInput) => Promise<AgentSkillDeleteResult>
  }
  conversations: {
    list: () => Promise<ConversationListItem[]>
    get: (input: ConversationGetInput) => Promise<ConversationDetail>
    createDirect: (input: ConversationCreateDirectInput) => Promise<ConversationDetail>
    createManual: (input: ConversationCreateManualInput) => Promise<ConversationDetail>
    updateTitle: (input: ConversationUpdateTitleInput) => Promise<ConversationDetail>
    updateRoutingMode: (input: ConversationUpdateRoutingModeInput) => Promise<ConversationDetail>
    sendTurn: (input: ConversationSendTurnInput) => Promise<ConversationDetail>
    cancelTurn: (input: ConversationCancelTurnInput) => Promise<ConversationDetail>
    revealPath: (input: ConversationRevealPathInput) => Promise<void>
    openFolder: (input: ConversationGetInput) => Promise<void>
    deletePreview: (input: ConversationDeletePreviewInput) => Promise<ConversationDeletePreview>
    delete: (input: ConversationDeleteInput) => Promise<ConversationDeleteResult>
    answerInputRequest: (input: ConversationAnswerInputRequestInput) => Promise<ConversationDetail>
    cancelInputRequest: (input: ConversationCancelInputRequestInput) => Promise<ConversationDetail>
  }
  workboard: {
    list: () => Promise<WorkboardData>
    generateRequestPlan: (input: WorkboardGenerateRequestPlanInput) => Promise<WorkboardDraftPlan>
    startRequestPlan: (input: WorkboardStartRequestPlanInput) => Promise<WorkboardData>
    generatePlan: (input: WorkboardGeneratePlanInput) => Promise<WorkboardDraftPlan>
    startRequest: (input: WorkboardStartRequestInput) => Promise<WorkboardData>
    directStart: (input: WorkboardDirectStartInput) => Promise<WorkboardData>
    generateFollowUpPlan: (input: WorkboardGenerateFollowUpPlanInput) => Promise<WorkboardDraftPlan>
    startFollowUp: (input: WorkboardStartFollowUpInput) => Promise<WorkboardData>
    cancelRun: (input: WorkRunActionInput) => Promise<WorkboardData>
    answerInputRequest: (input: WorkboardAnswerInputRequestInput) => Promise<WorkboardData>
    revealPath: (input: WorkboardRevealPathInput) => Promise<void>
  }
  observability: {
    listWorkboard: () => Promise<ObservedRunSnapshot[]>
    listConversation: (input: ObservedConversationRunsInput) => Promise<ObservedRunSnapshot[]>
    listEvents: (input: ObservedRunListEventsInput) => Promise<ObservedRunEvent[]>
    getDiagnostics: (input: ObservedRunDiagnosticsInput) => Promise<ObservedRunDiagnostics>
    onRunChanged: (callback: (snapshot: ObservedRunSnapshot) => void) => () => void
  }
  runtime: {
    getProviders: () => Promise<ProviderStatus[]>
    connectProvider: (input: ProviderConnectInput) => Promise<ProviderConnectResult>
    disconnectProvider: (input: ProviderActionInput) => Promise<ProviderStatus>
    refreshProvider: (input: ProviderActionInput) => Promise<ProviderStatus>
  }
}

declare global {
  interface Window {
    ordinus: OrdinusApi
  }
}
