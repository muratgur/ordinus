import { app, ipcMain } from 'electron'
import { AppInfoSchema } from '@shared/contracts'
import { ipcChannels } from '@shared/ipc'
import type { OrdinusDatabase } from '../db/database'
import { getSystemPaths } from '../paths'

export function registerIpcHandlers(database: OrdinusDatabase): void {
  ipcMain.handle(ipcChannels.appGetInfo, () =>
    AppInfoSchema.parse({
      name: 'Ordinus',
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      isPackaged: app.isPackaged
    })
  )

  ipcMain.handle(ipcChannels.systemGetPaths, () => getSystemPaths())
  ipcMain.handle(ipcChannels.dbGetStatus, () => database.getStatus())
}
