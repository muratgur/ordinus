import { existsSync } from 'node:fs'
import { delimiter, dirname, join } from 'node:path'
import { resolveResourcePath } from '../../paths'

let cachedPath: string | null | undefined

/**
 * Absolute path to the standalone Node runtime Ordinus bundles for running the
 * provider CLIs and npm (ADR-047).
 *
 * The CLIs (claude/codex) are Node scripts whose launchers resolve `node`
 * from PATH, and npm's install-time lifecycle scripts need a real `node` too —
 * Electron-as-node is not findable as `node` on PATH. So we ship our own Node
 * and point at it here.
 *
 * Returns null in dev, where no Node is bundled (the `beforePack` hook only runs
 * at packaging time) and the developer's own system Node is used instead.
 */
export function getBundledNodePath(): string | null {
  if (cachedPath !== undefined) return cachedPath

  const binName = process.platform === 'win32' ? 'node.exe' : 'node'
  const candidate = join(resolveResourcePath('runtime', 'node'), binName)

  cachedPath = existsSync(candidate) ? candidate : null
  return cachedPath
}

/**
 * Prepend the bundled Node's directory to this process's PATH (ADR-047).
 *
 * This is the single chokepoint for the whole fix. It mutates only Ordinus's own
 * in-memory `process.env` — never the OS/user PATH — so it stays within the
 * "scoped to our own process tree" rule. Everything downstream inherits it:
 *  - `buildRuntimeEnvironment()` copies `process.env.PATH` into every provider
 *    CLI spawn (runs, logins, version/auth/logout/install-verify);
 *  - `npm-runner.ts` builds its child env from `process.env`, so the onboarding
 *    install — and npm's own lifecycle scripts — find `node`;
 *  - any libuv-level resolution of a bare `node`/`npm` command resolves here.
 *
 * No-op in dev (no bundled Node) and idempotent (safe to call more than once).
 * Must run before the first CLI spawn — see the provider-status pre-warm in
 * the app bootstrap.
 */
export function ensureBundledNodeOnPath(): void {
  const nodePath = getBundledNodePath()
  if (!nodePath) return

  const dir = dirname(nodePath)
  const current = process.env.PATH ?? ''
  if (current.split(delimiter).includes(dir)) return

  process.env.PATH = current ? `${dir}${delimiter}${current}` : dir
}
