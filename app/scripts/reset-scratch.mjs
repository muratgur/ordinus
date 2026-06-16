// ADR-051 — wipe the `scratch` data profile only.
//
// Deletes the entire `Ordinus-scratch` userData directory so the next
// `npm run dev:scratch` starts empty. The `real` profile has no script-driven
// wipe by design — it is precious and must be deleted by hand, deliberately.
//
// This is a plain Node script (no Electron context), so it reproduces Electron's
// per-platform default userData location rather than importing app.getPath().

import { existsSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const APP_NAME = 'Ordinus'
const SCRATCH_DIR_NAME = `${APP_NAME}-scratch`

// Mirror of Electron's `app.getPath('userData')` parent, per platform.
const home = homedir()
const appDataRoot =
  process.platform === 'darwin'
    ? join(home, 'Library', 'Application Support')
    : process.platform === 'win32'
      ? (process.env.APPDATA ?? join(home, 'AppData', 'Roaming'))
      : (process.env.XDG_CONFIG_HOME ?? join(home, '.config'))

const scratchUserData = join(appDataRoot, SCRATCH_DIR_NAME)

if (!existsSync(scratchUserData)) {
  console.log(`Nothing to reset — no scratch data at:\n  ${scratchUserData}`)
  process.exit(0)
}

// We cannot reliably tell whether the scratch app is running; deleting a live
// SQLite/WAL directory corrupts it. Warn loudly and let the user confirm by re-running
// only if they have closed the app. (Best-effort: rmSync will surface EBUSY on Windows.)
console.log(`This will permanently delete the SCRATCH data profile:\n  ${scratchUserData}`)
console.log('Make sure the scratch app (npm run dev:scratch) is CLOSED first.\n')

try {
  rmSync(scratchUserData, { recursive: true, force: true })
  console.log('Scratch data profile deleted. The next `npm run dev:scratch` starts empty.')
} catch (error) {
  console.error('Failed to delete scratch data — is the scratch app still running?')
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
