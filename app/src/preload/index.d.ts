import type {
  Agent,
  AgentCreateInput,
  AgentDeleteInput,
  AgentDeleteResult,
  AgentDraft,
  ConnectorActionInput,
  ConnectorSummary,
  AgentDraftFromProfileInput,
  AgentDraftFromIntentInput,
  AgentArchiveInput,
  AgentExtraDirectoryAddInput,
  AgentExtraDirectoryAddResult,
  AgentExtraDirectoryRemoveInput,
  AgentExtraDirectoryListInput,
  AgentExtraDirectoryList,
  AgentSchedule,
  AgentScheduleCreateInput,
  AgentScheduleDeleteInput,
  AgentScheduleFireNowInput,
  AgentScheduleGetInput,
  AgentScheduleListInput,
  AgentScheduleSetEnabledInput,
  AgentScheduleUpdateInput,
  AgentRoomSummary,
  SchedulerEvent,
  AgentMemoryAddInput,
  AgentMemoryDeactivateInput,
  AgentMemoryDeactivateResult,
  AgentMemoryListInput,
  AgentMemoryRule,
  AgentMemoryUpdateInput,
  AgentReflectionSummary,
  AgentProfileCatalog,
  AgentSkill,
  AgentSkillCreateInput,
  AgentSkillDeleteInput,
  AgentSkillDeleteResult,
  AgentSkillDetail,
  AgentSkillGetInput,
  AgentSkillsListInput,
  AgentSkillUpdateInput,
  AgentSetPinnedInput,
  AgentUpdateInstructionsInput,
  AgentUpdateSettingsInput,
  AppInfo,
  ConversationCancelTurnInput,
  ConversationAnswerInputRequestInput,
  ConversationCancelInputRequestInput,
  ConversationCreateDirectInput,
  ConversationCreateManualInput,
  ConversationGetOrCreateRoomInput,
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
  OrdinusActionEvent,
  OrdinusArchiveConversationInput,
  OrdinusConversationSummary,
  OrdinusAnswerInputRequestInput,
  OrdinusCancelInputRequestInput,
  OrdinusCancelTurnInput,
  OrdinusRevealPathInput,
  OrdinusConversationTurn,
  OrdinusCreateConversationInput,
  OrdinusDeleteConversationInput,
  OrdinusDeleteMemoryInput,
  OrdinusListTurnsInput,
  OrdinusMemoryEntry,
  OrdinusPendingConfirmation,
  OrdinusPendingInputRequest,
  OrdinusResolveConfirmationInput,
  OrdinusSendTurnInput,
  OrdinusSetConversationPinnedInput,
  OrdinusSingleton,
  OrdinusTurnOutcome,
  OrdinusUnarchiveConversationInput,
  OrdinusUpdateConversationTitleInput,
  OrdinusUpdateSingletonInput,
  OrdinusWriteMemoryInput,
  FileContent,
  FileReadInput,
  ObservedConversationRunsInput,
  ObservedRunDiagnostics,
  ObservedRunDiagnosticsInput,
  ObservedRunEvent,
  ObservedTurnRunInput,
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
  PendingPlan,
  PendingPlanCreateInput,
  WorkboardGenerateFollowUpPlanInput,
  WorkboardGeneratePlanInput,
  WorkboardGenerateRequestPlanInput,
  WorkboardRevealPathInput,
  WorkboardCheckPathsInput,
  WorkboardArchiveRequestInput,
  WorkboardUnarchiveRequestInput,
  WorkboardPathStatus,
  WorkboardSaveRunResultResult,
  WorkboardStartFollowUpInput,
  WorkboardStartRequestPlanInput,
  WorkboardListWorkspaceFoldersInput,
  WorkboardListWorkspaceFoldersResult,
  WorkboardStartRequestInput,
  WorkflowDesign,
  WorkflowDesignCreateInput,
  WorkflowDesignUpdateInput,
  WorkflowDesignDeleteInput,
  WorkflowRunInput,
  WorkRunActionInput,
  WorkspaceConfig,
  WorkspaceSaveConfigInput,
  WorkspaceUpdateSystemDefaultInput,
  WorkspaceSelectFolderResult,
  OnboardingStatus,
  OnboardingInstallEventEnvelope,
  ProviderId
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
  ordinus: {
    listConversations: () => Promise<OrdinusConversationSummary[]>
    createConversation: (
      input?: OrdinusCreateConversationInput
    ) => Promise<OrdinusConversationSummary>
    sendTurn: (input: OrdinusSendTurnInput) => Promise<OrdinusTurnOutcome>
    listTurns: (input: OrdinusListTurnsInput) => Promise<OrdinusConversationTurn[]>
    listRunningConversations: () => Promise<string[]>
    cancelTurn: (input: OrdinusCancelTurnInput) => Promise<{ cancelled: boolean }>
    revealPath: (input: OrdinusRevealPathInput) => Promise<void>
    onActionEvent: (callback: (event: OrdinusActionEvent) => void) => () => void
    listPendingConfirmations: () => Promise<OrdinusPendingConfirmation[]>
    resolveConfirmation: (input: OrdinusResolveConfirmationInput) => Promise<{ resolved: boolean }>
    listPendingInputRequests: () => Promise<OrdinusPendingInputRequest[]>
    answerInputRequest: (input: OrdinusAnswerInputRequestInput) => Promise<OrdinusTurnOutcome>
    cancelInputRequest: (input: OrdinusCancelInputRequestInput) => Promise<{ cancelled: boolean }>
    getSingleton: () => Promise<OrdinusSingleton | null>
    updateSingleton: (input: OrdinusUpdateSingletonInput) => Promise<OrdinusSingleton>
    archiveConversation: (input: OrdinusArchiveConversationInput) => Promise<{ archived: boolean }>
    unarchiveConversation: (
      input: OrdinusUnarchiveConversationInput
    ) => Promise<{ restored: boolean }>
    deleteConversation: (input: OrdinusDeleteConversationInput) => Promise<{ deleted: boolean }>
    updateConversationTitle: (
      input: OrdinusUpdateConversationTitleInput
    ) => Promise<{ updated: boolean }>
    setConversationPinned: (
      input: OrdinusSetConversationPinnedInput
    ) => Promise<{ pinned: boolean }>
    listMemory: () => Promise<OrdinusMemoryEntry[]>
    writeMemory: (input: OrdinusWriteMemoryInput) => Promise<OrdinusMemoryEntry>
    deleteMemory: (input: OrdinusDeleteMemoryInput) => Promise<{ deletedId: string | null }>
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
    setPinned: (input: AgentSetPinnedInput) => Promise<Agent>
    delete: (input: AgentDeleteInput) => Promise<AgentDeleteResult>
    listSkills: (input: AgentSkillsListInput) => Promise<AgentSkill[]>
    getSkill: (input: AgentSkillGetInput) => Promise<AgentSkillDetail>
    createSkill: (input: AgentSkillCreateInput) => Promise<AgentSkill>
    updateSkill: (input: AgentSkillUpdateInput) => Promise<AgentSkill>
    deleteSkill: (input: AgentSkillDeleteInput) => Promise<AgentSkillDeleteResult>
    listMemory: (input: AgentMemoryListInput) => Promise<AgentMemoryRule[]>
    addMemory: (input: AgentMemoryAddInput) => Promise<AgentMemoryRule>
    updateMemory: (input: AgentMemoryUpdateInput) => Promise<AgentMemoryRule>
    deactivateMemory: (input: AgentMemoryDeactivateInput) => Promise<AgentMemoryDeactivateResult>
    archive: (input: AgentArchiveInput) => Promise<Agent>
    unarchive: (input: AgentArchiveInput) => Promise<Agent>
    listReflection: () => Promise<AgentReflectionSummary>
    addExtraDirectory: (input: AgentExtraDirectoryAddInput) => Promise<AgentExtraDirectoryAddResult>
    removeExtraDirectory: (
      input: AgentExtraDirectoryRemoveInput
    ) => Promise<AgentExtraDirectoryList>
    listExtraDirectories: (input: AgentExtraDirectoryListInput) => Promise<AgentExtraDirectoryList>
  }
  conversations: {
    list: () => Promise<ConversationListItem[]>
    listAgentRoomSummaries: () => Promise<AgentRoomSummary[]>
    get: (input: ConversationGetInput) => Promise<ConversationDetail>
    createDirect: (input: ConversationCreateDirectInput) => Promise<ConversationDetail>
    createManual: (input: ConversationCreateManualInput) => Promise<ConversationDetail>
    getOrCreateRoom: (input: ConversationGetOrCreateRoomInput) => Promise<ConversationDetail>
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
    listWorkspaceFolders: (
      input: WorkboardListWorkspaceFoldersInput
    ) => Promise<WorkboardListWorkspaceFoldersResult>
    generatePlan: (input: WorkboardGeneratePlanInput) => Promise<WorkboardDraftPlan>
    startRequest: (input: WorkboardStartRequestInput) => Promise<WorkboardData>
    directStart: (input: WorkboardDirectStartInput) => Promise<WorkboardData>
    generateFollowUpPlan: (input: WorkboardGenerateFollowUpPlanInput) => Promise<WorkboardDraftPlan>
    startFollowUp: (input: WorkboardStartFollowUpInput) => Promise<WorkboardData>
    listPendingPlans: () => Promise<PendingPlan[]>
    createPendingPlan: (input: PendingPlanCreateInput) => Promise<PendingPlan>
    deletePendingPlan: (id: string) => Promise<void>
    cancelRun: (input: WorkRunActionInput) => Promise<WorkboardData>
    answerInputRequest: (input: WorkboardAnswerInputRequestInput) => Promise<WorkboardData>
    revealPath: (input: WorkboardRevealPathInput) => Promise<void>
    saveRunResult: (input: WorkRunActionInput) => Promise<WorkboardSaveRunResultResult>
    checkPaths: (input: WorkboardCheckPathsInput) => Promise<WorkboardPathStatus[]>
    archiveRequest: (input: WorkboardArchiveRequestInput) => Promise<WorkboardData>
    unarchiveRequest: (input: WorkboardUnarchiveRequestInput) => Promise<WorkboardData>
  }
  workflows: {
    list: () => Promise<WorkflowDesign[]>
    get: (id: string) => Promise<WorkflowDesign | null>
    create: (input: WorkflowDesignCreateInput) => Promise<WorkflowDesign>
    update: (input: WorkflowDesignUpdateInput) => Promise<WorkflowDesign>
    delete: (input: WorkflowDesignDeleteInput) => Promise<void>
    run: (input: WorkflowRunInput) => Promise<WorkboardData>
  }
  observability: {
    listWorkboard: () => Promise<ObservedRunSnapshot[]>
    listConversation: (input: ObservedConversationRunsInput) => Promise<ObservedRunSnapshot[]>
    getTurnRun: (input: ObservedTurnRunInput) => Promise<ObservedRunSnapshot | null>
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
  connectors: {
    list: () => Promise<ConnectorSummary[]>
    connect: (input: ConnectorActionInput) => Promise<ConnectorSummary[]>
    disconnect: (input: ConnectorActionInput) => Promise<ConnectorSummary[]>
  }
  files: {
    read: (input: FileReadInput) => Promise<FileContent>
  }
  schedules: {
    list: (input?: AgentScheduleListInput) => Promise<AgentSchedule[]>
    get: (input: AgentScheduleGetInput) => Promise<AgentSchedule>
    create: (input: AgentScheduleCreateInput) => Promise<AgentSchedule>
    update: (input: AgentScheduleUpdateInput) => Promise<AgentSchedule>
    delete: (input: AgentScheduleDeleteInput) => Promise<{ deletedScheduleId: string }>
    setEnabled: (input: AgentScheduleSetEnabledInput) => Promise<AgentSchedule>
    fireNow: (input: AgentScheduleFireNowInput) => Promise<{ runId: string; requestId: string }>
    onChanged: (callback: (event?: SchedulerEvent) => void) => () => void
  }
  onboarding: {
    getStatus: () => Promise<OnboardingStatus>
    advanceFromWelcome: () => Promise<OnboardingStatus>
    selectProviders: (input: { providerIds: ProviderId[] }) => Promise<OnboardingStatus>
    confirmWorkspace: (input: {
      workspaceRoot: string
      workspaceName: string
    }) => Promise<{ status: OnboardingStatus; workspace: WorkspaceConfig }>
    installProvider: (input: { providerId: ProviderId }) => Promise<OnboardingStatus>
    markProviderAuthed: (input: {
      providerId: ProviderId
      authed: boolean
    }) => Promise<OnboardingStatus>
    resetProviders: () => Promise<OnboardingStatus>
    complete: (input: { agentId: string }) => Promise<OnboardingStatus>
    onInstallEvent: (callback: (envelope: OnboardingInstallEventEnvelope) => void) => () => void
  }
}

declare global {
  interface Window {
    ordinus: OrdinusApi
  }
}
