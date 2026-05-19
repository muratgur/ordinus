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
  ConnectorActionInput,
  ConnectorSummary,
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
  PendingPlan,
  PendingPlanCreateInput,
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
      ipcRenderer.invoke(ipcChannels.agentsDeleteSkill, input)
  },
  conversations: {
    list: async (): Promise<ConversationListItem[]> =>
      ipcRenderer.invoke(ipcChannels.conversationsList),
    get: async (input: ConversationGetInput): Promise<ConversationDetail> =>
      ipcRenderer.invoke(ipcChannels.conversationsGet, input),
    createDirect: async (input: ConversationCreateDirectInput): Promise<ConversationDetail> =>
      ipcRenderer.invoke(ipcChannels.conversationsCreateDirect, input),
    createManual: async (input: ConversationCreateManualInput): Promise<ConversationDetail> =>
      ipcRenderer.invoke(ipcChannels.conversationsCreateManual, input),
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
      ipcRenderer.invoke(ipcChannels.workboardRevealPath, input)
  },
  observability: {
    listWorkboard: async (): Promise<ObservedRunSnapshot[]> =>
      ipcRenderer.invoke(ipcChannels.observabilityListWorkboard),
    listConversation: async (
      input: ObservedConversationRunsInput
    ): Promise<ObservedRunSnapshot[]> =>
      ipcRenderer.invoke(ipcChannels.observabilityListConversation, input),
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
