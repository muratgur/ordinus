import { app } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export const databaseSchemaVersion = 3

export function getMigrationsFolder(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'db', 'migrations')
  }

  const appPath = join(app.getAppPath(), 'resources', 'db', 'migrations')
  if (existsSync(appPath)) {
    return appPath
  }

  return join(process.cwd(), 'resources', 'db', 'migrations')
}
