import type {
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
  runtime: {
    getProviders: () => Promise<ProviderStatus[]>
    connectCodex: () => Promise<CodexConnectResult>
    refreshCodex: () => Promise<ProviderStatus>
  }
}

declare global {
  interface Window {
    ordinus: OrdinusApi
  }
}
