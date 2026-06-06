import { app } from 'electron'
import { join } from 'node:path'
import type { SystemPaths } from '@shared/contracts'

export function getSystemPaths(): SystemPaths {
  const userData = app.getPath('userData')

  const cliPrefix = join(userData, 'cli')

  return {
    userData,
    database: join(userData, 'ordinus.db'),
    runtime: join(userData, 'runtime'),
    logs: join(userData, 'logs'),
    cliPrefix,
    cliBin: join(cliPrefix, process.platform === 'win32' ? '' : 'bin')
  }
}
