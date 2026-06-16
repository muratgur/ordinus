// ADR-051 — Dev data profiles (`real` / `scratch`).
//
// Ordinus is developed and used by the same person via `npm run dev`, so real and
// experimental data would otherwise share one userData root and be mutually
// destructive. This module selects a data profile at launch from the
// `ORDINUS_PROFILE` env var and, for `scratch`, redirects userData to a sibling
// directory BEFORE the database singleton is constructed. Because every durable
// path flows through `getSystemPaths()` → `app.getPath('userData')`, this single
// redirect isolates the entire tree (db, agents, runtime, local-mcp, vault, logs,
// cli) with no per-subsystem change.
//
// IMPORTANT: `applyDataProfile()` must run after `app.setName()` and before
// `new OrdinusDatabase()` in index.ts — the DB constructor reads userData. A reorder
// that constructs the DB earlier would silently break isolation.

import { app } from 'electron'
import { dirname, join } from 'path'

export type DataProfile = 'real' | 'scratch'

let activeProfile: DataProfile = 'real'

/** The userData directory name used for the experimental profile (sibling of `real`). */
export function scratchUserDataDirName(): string {
  return `${app.getName()}-scratch`
}

export function resolveDataProfile(): DataProfile {
  return process.env.ORDINUS_PROFILE?.trim().toLowerCase() === 'scratch' ? 'scratch' : 'real'
}

/**
 * Resolve the active profile and, for `scratch`, redirect userData to a sibling
 * directory. `real` (the default) is left exactly where it is today — no migration.
 * Returns the active profile. Call once, early in main startup.
 */
export function applyDataProfile(): DataProfile {
  const profile = resolveDataProfile()
  if (profile === 'scratch') {
    const realUserData = app.getPath('userData')
    app.setPath('userData', join(dirname(realUserData), scratchUserDataDirName()))
  }
  activeProfile = profile
  return profile
}

export function getActiveProfile(): DataProfile {
  return activeProfile
}
