import { app } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { SystemPaths } from '@shared/contracts'

/**
 * Resolve a path to an app-shipped resource, packaged or in dev.
 *
 * Single source of truth for the packaged-vs-dev resource lookup used across
 * the main process (migrations, profiles, knowledge, local-MCP sub-packages,
 * the bundled Node runtime). Packaged builds read from `process.resourcesPath`
 * (electron-builder's `extraResources` root); dev reads from the repo's
 * `resources/`, falling back to the cwd-relative copy when launched from a
 * different working directory.
 */
export function resolveResourcePath(...segments: string[]): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, ...segments)
  }
  const appPath = join(app.getAppPath(), 'resources', ...segments)
  if (existsSync(appPath)) {
    return appPath
  }
  return join(process.cwd(), 'resources', ...segments)
}

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
