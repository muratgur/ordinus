import { contextBridge, ipcRenderer } from 'electron'
import type { AppInfo, DbStatus, SystemPaths } from '@shared/contracts'
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
