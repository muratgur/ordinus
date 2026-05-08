import { contextBridge, ipcRenderer } from 'electron'
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
