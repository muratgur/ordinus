import { app } from 'electron'
import { join } from 'node:path'
import type { SystemPaths } from '@shared/contracts'

export function getSystemPaths(): SystemPaths {
  const userData = app.getPath('userData')

  return {
    userData,
    database: join(userData, 'ordinus.db'),
    runtime: join(userData, 'runtime'),
    logs: join(userData, 'logs')
  }
}
