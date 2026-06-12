import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type {
  Agent,
  AgentCreateInput,
  AgentDeleteInput,
  AgentDeleteResult,
  AgentDraft,
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
  ConnectorActionInput,
  ConnectorSummary,
  AgentProfileCatalog,
  AgentSkill,
  AgentSkillCreateInput,
  AgentSkillDeleteInput,
  AgentSkillAssignInput,
  AgentSkillDeleteResult,
  AgentSkillDraft,
  AgentSkillDraftFromIntentInput,
  LibrarySkill,
  LibrarySkillDetail,
  LibrarySkillGetInput,
  LocalSkillCandidate,
  SkillImportFolderResult,
  SkillImportPreview,
  SkillImportSourceInput,
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
  PendingPlan,
  PendingPlanCreateInput,
  WorkboardData,
  WorkboardDirectStartInput,
  WorkboardDraftPlan,
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
  // ADR-029: Ordinus surface. The kill-switch flag was retired after M8;
  // Home is unconditionally enabled now.
  ordinus: {
    listConversations: async (): Promise<OrdinusConversationSummary[]> =>
      ipcRenderer.invoke(ipcChannels.ordinusListConversations),
    createConversation: async (
      input?: OrdinusCreateConversationInput
    ): Promise<OrdinusConversationSummary> =>
      ipcRenderer.invoke(ipcChannels.ordinusCreateConversation, input ?? {}),
    sendTurn: async (input: OrdinusSendTurnInput): Promise<OrdinusTurnOutcome> =>
      ipcRenderer.invoke(ipcChannels.ordinusSendTurn, input),
    listTurns: async (input: OrdinusListTurnsInput): Promise<OrdinusConversationTurn[]> =>
      ipcRenderer.invoke(ipcChannels.ordinusListTurns, input),
    listRunningConversations: async (): Promise<string[]> =>
      ipcRenderer.invoke(ipcChannels.ordinusListRunningConversations),
    // ADR-034: Stop button — cancel this conversation's in-flight turn.
    cancelTurn: async (input: OrdinusCancelTurnInput): Promise<{ cancelled: boolean }> =>
      ipcRenderer.invoke(ipcChannels.ordinusCancelTurn, input),
    // ADR-035: reveal a file referenced by a transcript turn.
    revealPath: async (input: OrdinusRevealPathInput): Promise<void> =>
      ipcRenderer.invoke(ipcChannels.ordinusRevealPath, input),
    // ADR-029 M5: subscribe to Ordinus action events (workboard plan ready,
    // schedule/workflow created, confirmation requested/resolved). Returns
    // an unsubscribe function.
    onActionEvent: (callback: (event: OrdinusActionEvent) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, payload: OrdinusActionEvent): void =>
        callback(payload)
      ipcRenderer.on(ipcChannels.ordinusActionEvent, listener)
      return () => ipcRenderer.removeListener(ipcChannels.ordinusActionEvent, listener)
    },
    // ADR-029 M6: confirmation gate IPC.
    listPendingConfirmations: async (): Promise<OrdinusPendingConfirmation[]> =>
      ipcRenderer.invoke(ipcChannels.ordinusListPendingConfirmations),
    resolveConfirmation: async (
      input: OrdinusResolveConfirmationInput
    ): Promise<{ resolved: boolean }> =>
      ipcRenderer.invoke(ipcChannels.ordinusResolveConfirmation, input),
    // ADR-029: needs_input question panel.
    listPendingInputRequests: async (): Promise<OrdinusPendingInputRequest[]> =>
      ipcRenderer.invoke(ipcChannels.ordinusListPendingInputRequests),
    answerInputRequest: async (
      input: OrdinusAnswerInputRequestInput
    ): Promise<OrdinusTurnOutcome> =>
      ipcRenderer.invoke(ipcChannels.ordinusAnswerInputRequest, input),
    cancelInputRequest: async (
      input: OrdinusCancelInputRequestInput
    ): Promise<{ cancelled: boolean }> =>
      ipcRenderer.invoke(ipcChannels.ordinusCancelInputRequest, input),
    // ADR-029 M7: persona + provider/model editing.
    getSingleton: async (): Promise<OrdinusSingleton | null> =>
      ipcRenderer.invoke(ipcChannels.ordinusGetSingleton),
    updateSingleton: async (input: OrdinusUpdateSingletonInput): Promise<OrdinusSingleton> =>
      ipcRenderer.invoke(ipcChannels.ordinusUpdateSingleton, input),
    archiveConversation: async (
      input: OrdinusArchiveConversationInput
    ): Promise<{ archived: boolean }> =>
      ipcRenderer.invoke(ipcChannels.ordinusArchiveConversation, input),
    unarchiveConversation: async (
      input: OrdinusUnarchiveConversationInput
    ): Promise<{ restored: boolean }> =>
      ipcRenderer.invoke(ipcChannels.ordinusUnarchiveConversation, input),
    deleteConversation: async (
      input: OrdinusDeleteConversationInput
    ): Promise<{ deleted: boolean }> =>
      ipcRenderer.invoke(ipcChannels.ordinusDeleteConversation, input),
    updateConversationTitle: async (
      input: OrdinusUpdateConversationTitleInput
    ): Promise<{ updated: boolean }> =>
      ipcRenderer.invoke(ipcChannels.ordinusUpdateConversationTitle, input),
    setConversationPinned: async (
      input: OrdinusSetConversationPinnedInput
    ): Promise<{ pinned: boolean }> =>
      ipcRenderer.invoke(ipcChannels.ordinusSetConversationPinned, input),
    // ADR-029 M8: memory panel CRUD.
    listMemory: async (): Promise<OrdinusMemoryEntry[]> =>
      ipcRenderer.invoke(ipcChannels.ordinusListMemory),
    writeMemory: async (input: OrdinusWriteMemoryInput): Promise<OrdinusMemoryEntry> =>
      ipcRenderer.invoke(ipcChannels.ordinusWriteMemory, input),
    deleteMemory: async (input: OrdinusDeleteMemoryInput): Promise<{ deletedId: string | null }> =>
      ipcRenderer.invoke(ipcChannels.ordinusDeleteMemory, input)
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
    listProfiles: async (): Promise<AgentProfileCatalog> =>
      ipcRenderer.invoke(ipcChannels.agentsListProfiles),
    draftFromIntent: async (input: AgentDraftFromIntentInput): Promise<AgentDraft> =>
      ipcRenderer.invoke(ipcChannels.agentsDraftFromIntent, input),
    draftFromProfile: async (input: AgentDraftFromProfileInput): Promise<AgentDraft> =>
      ipcRenderer.invoke(ipcChannels.agentsDraftFromProfile, input),
    draftBlank: async (): Promise<AgentDraft> => ipcRenderer.invoke(ipcChannels.agentsDraftBlank),
    create: async (input: AgentCreateInput): Promise<Agent> =>
      ipcRenderer.invoke(ipcChannels.agentsCreate, input),
    updateInstructions: async (input: AgentUpdateInstructionsInput): Promise<Agent> =>
      ipcRenderer.invoke(ipcChannels.agentsUpdateInstructions, input),
    updateSettings: async (input: AgentUpdateSettingsInput): Promise<Agent> =>
      ipcRenderer.invoke(ipcChannels.agentsUpdateSettings, input),
    setPinned: async (input: AgentSetPinnedInput): Promise<Agent> =>
      ipcRenderer.invoke(ipcChannels.agentsSetPinned, input),
    delete: async (input: AgentDeleteInput): Promise<AgentDeleteResult> =>
      ipcRenderer.invoke(ipcChannels.agentsDelete, input),
    listSkills: async (input: AgentSkillsListInput): Promise<AgentSkill[]> =>
      ipcRenderer.invoke(ipcChannels.agentsListSkills, input),
    getSkill: async (input: AgentSkillGetInput): Promise<AgentSkillDetail> =>
      ipcRenderer.invoke(ipcChannels.agentsGetSkill, input),
    createSkill: async (input: AgentSkillCreateInput): Promise<AgentSkill> =>
      ipcRenderer.invoke(ipcChannels.agentsCreateSkill, input),
    updateSkill: async (input: AgentSkillUpdateInput): Promise<AgentSkill> =>
      ipcRenderer.invoke(ipcChannels.agentsUpdateSkill, input),
    deleteSkill: async (input: AgentSkillDeleteInput): Promise<AgentSkillDeleteResult> =>
      ipcRenderer.invoke(ipcChannels.agentsDeleteSkill, input),
    assignLibrarySkill: async (input: AgentSkillAssignInput): Promise<AgentSkill> =>
      ipcRenderer.invoke(ipcChannels.agentsAssignLibrarySkill, input),
    draftSkill: async (input: AgentSkillDraftFromIntentInput): Promise<AgentSkillDraft> =>
      ipcRenderer.invoke(ipcChannels.agentsDraftSkill, input),
    listMemory: async (input: AgentMemoryListInput): Promise<AgentMemoryRule[]> =>
      ipcRenderer.invoke(ipcChannels.agentsListMemory, input),
    addMemory: async (input: AgentMemoryAddInput): Promise<AgentMemoryRule> =>
      ipcRenderer.invoke(ipcChannels.agentsAddMemory, input),
    updateMemory: async (input: AgentMemoryUpdateInput): Promise<AgentMemoryRule> =>
      ipcRenderer.invoke(ipcChannels.agentsUpdateMemory, input),
    deactivateMemory: async (
      input: AgentMemoryDeactivateInput
    ): Promise<AgentMemoryDeactivateResult> =>
      ipcRenderer.invoke(ipcChannels.agentsDeactivateMemory, input),
    archive: async (input: AgentArchiveInput): Promise<Agent> =>
      ipcRenderer.invoke(ipcChannels.agentsArchive, input),
    unarchive: async (input: AgentArchiveInput): Promise<Agent> =>
      ipcRenderer.invoke(ipcChannels.agentsUnarchive, input),
    listReflection: async (): Promise<AgentReflectionSummary> =>
      ipcRenderer.invoke(ipcChannels.agentsListReflection),
    addExtraDirectory: async (
      input: AgentExtraDirectoryAddInput
    ): Promise<AgentExtraDirectoryAddResult> =>
      ipcRenderer.invoke(ipcChannels.agentsAddExtraDirectory, input),
    removeExtraDirectory: async (
      input: AgentExtraDirectoryRemoveInput
    ): Promise<AgentExtraDirectoryList> =>
      ipcRenderer.invoke(ipcChannels.agentsRemoveExtraDirectory, input),
    listExtraDirectories: async (
      input: AgentExtraDirectoryListInput
    ): Promise<AgentExtraDirectoryList> =>
      ipcRenderer.invoke(ipcChannels.agentsListExtraDirectories, input)
  },
  skills: {
    listLibrary: async (): Promise<LibrarySkill[]> =>
      ipcRenderer.invoke(ipcChannels.skillsListLibrary),
    getLibrarySkill: async (input: LibrarySkillGetInput): Promise<LibrarySkillDetail> =>
      ipcRenderer.invoke(ipcChannels.skillsGetLibrarySkill, input),
    scanLocal: async (): Promise<LocalSkillCandidate[]> =>
      ipcRenderer.invoke(ipcChannels.skillsScanLocal),
    selectImportFolder: async (): Promise<SkillImportFolderResult> =>
      ipcRenderer.invoke(ipcChannels.skillsSelectImportFolder),
    previewImport: async (input: SkillImportSourceInput): Promise<SkillImportPreview> =>
      ipcRenderer.invoke(ipcChannels.skillsPreviewImport, input),
    import: async (input: SkillImportSourceInput): Promise<LibrarySkill> =>
      ipcRenderer.invoke(ipcChannels.skillsImport, input)
  },
  conversations: {
    list: async (): Promise<ConversationListItem[]> =>
      ipcRenderer.invoke(ipcChannels.conversationsList),
    listAgentRoomSummaries: async (): Promise<AgentRoomSummary[]> =>
      ipcRenderer.invoke(ipcChannels.conversationsListAgentRoomSummaries),
    get: async (input: ConversationGetInput): Promise<ConversationDetail> =>
      ipcRenderer.invoke(ipcChannels.conversationsGet, input),
    createDirect: async (input: ConversationCreateDirectInput): Promise<ConversationDetail> =>
      ipcRenderer.invoke(ipcChannels.conversationsCreateDirect, input),
    createManual: async (input: ConversationCreateManualInput): Promise<ConversationDetail> =>
      ipcRenderer.invoke(ipcChannels.conversationsCreateManual, input),
    getOrCreateRoom: async (input: ConversationGetOrCreateRoomInput): Promise<ConversationDetail> =>
      ipcRenderer.invoke(ipcChannels.conversationsGetOrCreateRoom, input),
    updateTitle: async (input: ConversationUpdateTitleInput): Promise<ConversationDetail> =>
      ipcRenderer.invoke(ipcChannels.conversationsUpdateTitle, input),
    updateRoutingMode: async (
      input: ConversationUpdateRoutingModeInput
    ): Promise<ConversationDetail> =>
      ipcRenderer.invoke(ipcChannels.conversationsUpdateRoutingMode, input),
    sendTurn: async (input: ConversationSendTurnInput): Promise<ConversationDetail> =>
      ipcRenderer.invoke(ipcChannels.conversationsSendTurn, input),
    cancelTurn: async (input: ConversationCancelTurnInput): Promise<ConversationDetail> =>
      ipcRenderer.invoke(ipcChannels.conversationsCancelTurn, input),
    revealPath: async (input: ConversationRevealPathInput): Promise<void> =>
      ipcRenderer.invoke(ipcChannels.conversationsRevealPath, input),
    openFolder: async (input: ConversationGetInput): Promise<void> =>
      ipcRenderer.invoke(ipcChannels.conversationsOpenFolder, input),
    deletePreview: async (
      input: ConversationDeletePreviewInput
    ): Promise<ConversationDeletePreview> =>
      ipcRenderer.invoke(ipcChannels.conversationsDeletePreview, input),
    delete: async (input: ConversationDeleteInput): Promise<ConversationDeleteResult> =>
      ipcRenderer.invoke(ipcChannels.conversationsDelete, input),
    answerInputRequest: async (
      input: ConversationAnswerInputRequestInput
    ): Promise<ConversationDetail> =>
      ipcRenderer.invoke(ipcChannels.conversationsAnswerInputRequest, input),
    cancelInputRequest: async (
      input: ConversationCancelInputRequestInput
    ): Promise<ConversationDetail> =>
      ipcRenderer.invoke(ipcChannels.conversationsCancelInputRequest, input)
  },
  workboard: {
    list: async (): Promise<WorkboardData> => ipcRenderer.invoke(ipcChannels.workboardList),
    generateRequestPlan: async (
      input: WorkboardGenerateRequestPlanInput
    ): Promise<WorkboardDraftPlan> =>
      ipcRenderer.invoke(ipcChannels.workboardGenerateRequestPlan, input),
    startRequestPlan: async (input: WorkboardStartRequestPlanInput): Promise<WorkboardData> =>
      ipcRenderer.invoke(ipcChannels.workboardStartRequestPlan, input),
    listWorkspaceFolders: async (
      input: WorkboardListWorkspaceFoldersInput
    ): Promise<WorkboardListWorkspaceFoldersResult> =>
      ipcRenderer.invoke(ipcChannels.workboardListWorkspaceFolders, input),
    generatePlan: async (input: WorkboardGeneratePlanInput): Promise<WorkboardDraftPlan> =>
      ipcRenderer.invoke(ipcChannels.workboardGeneratePlan, input),
    startRequest: async (input: WorkboardStartRequestInput): Promise<WorkboardData> =>
      ipcRenderer.invoke(ipcChannels.workboardStartRequest, input),
    directStart: async (input: WorkboardDirectStartInput): Promise<WorkboardData> =>
      ipcRenderer.invoke(ipcChannels.workboardDirectStart, input),
    generateFollowUpPlan: async (
      input: WorkboardGenerateFollowUpPlanInput
    ): Promise<WorkboardDraftPlan> =>
      ipcRenderer.invoke(ipcChannels.workboardGenerateFollowUpPlan, input),
    startFollowUp: async (input: WorkboardStartFollowUpInput): Promise<WorkboardData> =>
      ipcRenderer.invoke(ipcChannels.workboardStartFollowUp, input),
    listPendingPlans: async (): Promise<PendingPlan[]> =>
      ipcRenderer.invoke(ipcChannels.workboardListPendingPlans),
    createPendingPlan: async (input: PendingPlanCreateInput): Promise<PendingPlan> =>
      ipcRenderer.invoke(ipcChannels.workboardCreatePendingPlan, input),
    deletePendingPlan: async (id: string): Promise<void> =>
      ipcRenderer.invoke(ipcChannels.workboardDeletePendingPlan, id),
    cancelRun: async (input: WorkRunActionInput): Promise<WorkboardData> =>
      ipcRenderer.invoke(ipcChannels.workboardCancelRun, input),
    answerInputRequest: async (input: WorkboardAnswerInputRequestInput): Promise<WorkboardData> =>
      ipcRenderer.invoke(ipcChannels.workboardAnswerInputRequest, input),
    revealPath: async (input: WorkboardRevealPathInput): Promise<void> =>
      ipcRenderer.invoke(ipcChannels.workboardRevealPath, input),
    saveRunResult: async (input: WorkRunActionInput): Promise<WorkboardSaveRunResultResult> =>
      ipcRenderer.invoke(ipcChannels.workboardSaveRunResult, input),
    checkPaths: async (input: WorkboardCheckPathsInput): Promise<WorkboardPathStatus[]> =>
      ipcRenderer.invoke(ipcChannels.workboardCheckPaths, input),
    archiveRequest: async (input: WorkboardArchiveRequestInput): Promise<WorkboardData> =>
      ipcRenderer.invoke(ipcChannels.workboardArchiveRequest, input),
    unarchiveRequest: async (input: WorkboardUnarchiveRequestInput): Promise<WorkboardData> =>
      ipcRenderer.invoke(ipcChannels.workboardUnarchiveRequest, input)
  },
  workflows: {
    list: async (): Promise<WorkflowDesign[]> => ipcRenderer.invoke(ipcChannels.workflowDesignList),
    get: async (id: string): Promise<WorkflowDesign | null> =>
      ipcRenderer.invoke(ipcChannels.workflowDesignGet, id),
    create: async (input: WorkflowDesignCreateInput): Promise<WorkflowDesign> =>
      ipcRenderer.invoke(ipcChannels.workflowDesignCreate, input),
    update: async (input: WorkflowDesignUpdateInput): Promise<WorkflowDesign> =>
      ipcRenderer.invoke(ipcChannels.workflowDesignUpdate, input),
    delete: async (input: WorkflowDesignDeleteInput): Promise<void> =>
      ipcRenderer.invoke(ipcChannels.workflowDesignDelete, input),
    run: async (input: WorkflowRunInput): Promise<WorkboardData> =>
      ipcRenderer.invoke(ipcChannels.workflowRun, input)
  },
  observability: {
    listWorkboard: async (): Promise<ObservedRunSnapshot[]> =>
      ipcRenderer.invoke(ipcChannels.observabilityListWorkboard),
    listConversation: async (
      input: ObservedConversationRunsInput
    ): Promise<ObservedRunSnapshot[]> =>
      ipcRenderer.invoke(ipcChannels.observabilityListConversation, input),
    getTurnRun: async (input: ObservedTurnRunInput): Promise<ObservedRunSnapshot | null> =>
      ipcRenderer.invoke(ipcChannels.observabilityGetTurnRun, input),
    listEvents: async (input: ObservedRunListEventsInput): Promise<ObservedRunEvent[]> =>
      ipcRenderer.invoke(ipcChannels.observabilityListEvents, input),
    getDiagnostics: async (input: ObservedRunDiagnosticsInput): Promise<ObservedRunDiagnostics> =>
      ipcRenderer.invoke(ipcChannels.observabilityGetDiagnostics, input),
    onRunChanged: (callback: (snapshot: ObservedRunSnapshot) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, snapshot: ObservedRunSnapshot): void => {
        callback(snapshot)
      }
      ipcRenderer.on(ipcChannels.observabilityRunChanged, listener)
      return () => ipcRenderer.removeListener(ipcChannels.observabilityRunChanged, listener)
    }
  },
  runtime: {
    getProviders: async (): Promise<ProviderStatus[]> =>
      ipcRenderer.invoke(ipcChannels.runtimeGetProviders),
    connectProvider: async (input: ProviderConnectInput): Promise<ProviderConnectResult> =>
      ipcRenderer.invoke(ipcChannels.runtimeConnectProvider, input),
    disconnectProvider: async (input: ProviderActionInput): Promise<ProviderStatus> =>
      ipcRenderer.invoke(ipcChannels.runtimeDisconnectProvider, input),
    refreshProvider: async (input: ProviderActionInput): Promise<ProviderStatus> =>
      ipcRenderer.invoke(ipcChannels.runtimeRefreshProvider, input)
  },
  connectors: {
    list: async (): Promise<ConnectorSummary[]> => ipcRenderer.invoke(ipcChannels.connectorsList),
    connect: async (input: ConnectorActionInput): Promise<ConnectorSummary[]> =>
      ipcRenderer.invoke(ipcChannels.connectorsConnect, input),
    disconnect: async (input: ConnectorActionInput): Promise<ConnectorSummary[]> =>
      ipcRenderer.invoke(ipcChannels.connectorsDisconnect, input)
  },
  files: {
    read: async (input: FileReadInput): Promise<FileContent> =>
      ipcRenderer.invoke(ipcChannels.filesRead, input)
  },
  schedules: {
    list: async (input?: AgentScheduleListInput): Promise<AgentSchedule[]> =>
      ipcRenderer.invoke(ipcChannels.schedulesList, input ?? {}),
    get: async (input: AgentScheduleGetInput): Promise<AgentSchedule> =>
      ipcRenderer.invoke(ipcChannels.schedulesGet, input),
    create: async (input: AgentScheduleCreateInput): Promise<AgentSchedule> =>
      ipcRenderer.invoke(ipcChannels.schedulesCreate, input),
    update: async (input: AgentScheduleUpdateInput): Promise<AgentSchedule> =>
      ipcRenderer.invoke(ipcChannels.schedulesUpdate, input),
    delete: async (input: AgentScheduleDeleteInput): Promise<{ deletedScheduleId: string }> =>
      ipcRenderer.invoke(ipcChannels.schedulesDelete, input),
    setEnabled: async (input: AgentScheduleSetEnabledInput): Promise<AgentSchedule> =>
      ipcRenderer.invoke(ipcChannels.schedulesSetEnabled, input),
    fireNow: async (
      input: AgentScheduleFireNowInput
    ): Promise<{ runId: string; requestId: string }> =>
      ipcRenderer.invoke(ipcChannels.schedulesFireNow, input),
    onChanged: (callback: (event?: SchedulerEvent) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, payload?: SchedulerEvent): void =>
        callback(payload)
      ipcRenderer.on(ipcChannels.schedulesChanged, listener)
      return () => ipcRenderer.removeListener(ipcChannels.schedulesChanged, listener)
    }
  },
  onboarding: {
    getStatus: async (): Promise<OnboardingStatus> =>
      ipcRenderer.invoke(ipcChannels.onboardingGetStatus),
    advanceFromWelcome: async (): Promise<OnboardingStatus> =>
      ipcRenderer.invoke(ipcChannels.onboardingAdvanceFromWelcome),
    selectProviders: async (input: { providerIds: ProviderId[] }): Promise<OnboardingStatus> =>
      ipcRenderer.invoke(ipcChannels.onboardingSelectProviders, input),
    confirmWorkspace: async (input: {
      workspaceRoot: string
      workspaceName: string
    }): Promise<{ status: OnboardingStatus; workspace: WorkspaceConfig }> =>
      ipcRenderer.invoke(ipcChannels.onboardingConfirmWorkspace, input),
    installProvider: async (input: { providerId: ProviderId }): Promise<OnboardingStatus> =>
      ipcRenderer.invoke(ipcChannels.onboardingInstallProvider, input),
    markProviderAuthed: async (input: {
      providerId: ProviderId
      authed: boolean
    }): Promise<OnboardingStatus> =>
      ipcRenderer.invoke(ipcChannels.onboardingMarkProviderAuthed, input),
    resetProviders: async (): Promise<OnboardingStatus> =>
      ipcRenderer.invoke(ipcChannels.onboardingResetProviders),
    complete: async (input: { agentId: string }): Promise<OnboardingStatus> =>
      ipcRenderer.invoke(ipcChannels.onboardingComplete, input),
    onInstallEvent: (
      callback: (envelope: OnboardingInstallEventEnvelope) => void
    ): (() => void) => {
      const listener = (_event: IpcRendererEvent, payload: OnboardingInstallEventEnvelope): void =>
        callback(payload)
      ipcRenderer.on(ipcChannels.onboardingInstallEvent, listener)
      return () => ipcRenderer.removeListener(ipcChannels.onboardingInstallEvent, listener)
    }
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
