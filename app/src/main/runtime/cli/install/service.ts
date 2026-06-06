import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ProviderId, ProviderInstallEvent } from '@shared/contracts'
import { getSystemPaths } from '../../../paths'
import { findCliExecutable, type CliExecutable } from '../executable'
import { runCapture } from '../process'
import { runNpm } from './npm-runner'

/**
 * Managed install of provider CLIs into an Ordinus-scoped npm prefix.
 * See ADR-028 for the design rationale.
 *
 * The prefix layout follows npm's `--prefix` convention:
 *   <cliPrefix>/lib/node_modules/<package>/
 *   <cliPrefix>/bin/<binary>            (mac/linux)
 *   <cliPrefix>/<binary>.cmd            (windows)
 *
 * We never assume the binary name matches a hard-coded value — that would
 * couple us to the upstream package's bin field. Instead, after install we
 * read the package's own `package.json` and resolve the bin from there.
 *
 * If the user already has a working CLI on PATH (or via the *_BIN override
 * env var), we skip the npm install entirely and emit done immediately.
 * The provider adapters keep using whichever path `findCliExecutable`
 * resolves — Ordinus-prefix first, then PATH.
 */

type ProviderPackage = {
  /**
   * npm specifier — bare name installs the latest version. Append `@x.y.z`
   * here if a future CLI release introduces a native module ABI mismatch
   * with our embedded Node and needs pinning.
   */
  packageName: string
  /**
   * The command we expect the provider's CLI to expose on PATH and in our
   * prefix bin dir. Used only as the lookup name for `findCliExecutable` —
   * the actual binary path comes from npm's bin symlink layout.
   */
  command: string
  /** Env var that overrides the CLI binary path entirely. */
  overrideEnvKey: string
}

const PROVIDER_PACKAGES: Record<ProviderId, ProviderPackage> = {
  claude: {
    packageName: '@anthropic-ai/claude-code',
    command: 'claude',
    overrideEnvKey: 'CLAUDE_BIN'
  },
  codex: {
    packageName: '@openai/codex',
    command: 'codex',
    overrideEnvKey: 'CODEX_BIN'
  },
  gemini: {
    packageName: '@google/gemini-cli',
    command: 'gemini',
    overrideEnvKey: 'GEMINI_BIN'
  }
}

export type InstallProviderOptions = {
  signal?: AbortSignal
}

export async function* installProvider(
  providerId: ProviderId,
  options: InstallProviderOptions = {}
): AsyncIterable<ProviderInstallEvent> {
  const pkg = PROVIDER_PACKAGES[providerId]
  const paths = getSystemPaths()
  ensureDirectory(paths.cliPrefix)

  yield {
    phase: 'start',
    providerId,
    packageName: pkg.packageName,
    packageVersion: 'latest'
  }

  // 1. Fast path: user already has the CLI somewhere we can resolve. Skip
  //    npm install entirely. The provider adapters will hit the same
  //    findCliExecutable resolution chain at runtime.
  //
  // On macOS/Linux, findCliExecutable returns the bare command name and
  // delegates PATH resolution to spawn() at runtime — meaning a returned
  // CliExecutable does NOT prove the binary exists. So we must verify, and
  // a spawn-time ENOENT (binary not on PATH) just means "no fast path,
  // fall through to install" — not a hard error.
  const existing = await findCliExecutable(pkg.command, pkg.overrideEnvKey, {
    prefixBinDir: paths.cliBin
  })
  if (existing) {
    // Spawn errors here (ENOENT on macOS when PATH lookup fails late) are
    // expected — they just mean "no fast path", fall through to install.
    const verify = await verifyExecutable(existing, options.signal).catch(
      (error): VerifyResult => ({
        ok: false,
        reason: error instanceof Error ? error.message : String(error)
      })
    )
    if (verify.ok) {
      yield { phase: 'verify', providerId, version: verify.version }
      yield { phase: 'done', providerId, binPath: existing.command }
      return
    }
  }

  // 2. Managed install path.
  yield {
    phase: 'download',
    providerId,
    message: `Resolving ${pkg.packageName}…`
  }

  // We pass `-g` together with `--prefix` so npm uses its global-install
  // layout (`<prefix>/lib/node_modules/<pkg>/` + `<prefix>/bin/<binary>`).
  // Without `-g`, npm treats this as a local install and puts bins under
  // `<prefix>/node_modules/.bin/`, which mismatches our `cliBin` resolution
  // and breaks the runtime CLI lookup.
  const installResult = await runNpm(
    [
      'install',
      '-g',
      pkg.packageName,
      '--prefix',
      paths.cliPrefix,
      '--no-audit',
      '--no-fund',
      '--omit=dev',
      '--loglevel=error'
    ],
    {
      cwd: paths.cliPrefix,
      env: process.env,
      signal: options.signal
    }
  )

  if (installResult.code !== 0) {
    yield {
      phase: 'error',
      providerId,
      message: `npm install exited with code ${installResult.code ?? 'null'}.`,
      stderrTail: installResult.stderrTail || undefined
    }
    return
  }

  // 3. Resolve the bin from the installed package's own manifest, not from
  //    a hard-coded name. This is how npm itself decides what to symlink.
  const binCandidates = readPackageBinCandidates(paths.cliPrefix, pkg.packageName)
  if (binCandidates.length === 0) {
    yield {
      phase: 'error',
      providerId,
      message: `Package ${pkg.packageName} installed but declares no bin entries.`
    }
    return
  }

  const resolvedBin = findInstalledBin(paths.cliBin, binCandidates)
  if (!resolvedBin) {
    yield {
      phase: 'error',
      providerId,
      message: `Package ${pkg.packageName} installed but its bin (${binCandidates.join(', ')}) is not in ${paths.cliBin}.`
    }
    return
  }

  yield { phase: 'verify', providerId, version: 'checking…' }

  const verify = await verifyExecutable(resolvedBin, options.signal)
  if (!verify.ok) {
    yield {
      phase: 'error',
      providerId,
      message: `Installed CLI at ${resolvedBin.command} failed --version (${verify.reason}).`,
      stderrTail: verify.stderrTail
    }
    return
  }

  yield { phase: 'verify', providerId, version: verify.version }
  yield { phase: 'done', providerId, binPath: resolvedBin.command }
}

// -- bin resolution from installed package.json -----------------------------

function readPackageBinCandidates(cliPrefix: string, packageName: string): string[] {
  // npm normally writes to `<prefix>/lib/node_modules/...`, but some macOS
  // configurations skip the `lib/` segment. Try both.
  const manifest =
    [
      join(cliPrefix, 'lib', 'node_modules', packageName, 'package.json'),
      join(cliPrefix, 'node_modules', packageName, 'package.json')
    ].find((path) => existsSync(path)) ?? null
  return manifest ? parseBinNames(manifest, packageName) : []
}

function parseBinNames(manifestPath: string, packageName: string): string[] {
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      bin?: string | Record<string, string>
      name?: string
    }
    if (!manifest.bin) return []
    if (typeof manifest.bin === 'string') {
      // npm derives the bin name from the package's unscoped name.
      const unscoped = (manifest.name ?? packageName).split('/').pop() ?? packageName
      return [unscoped]
    }
    return Object.keys(manifest.bin)
  } catch {
    return []
  }
}

function findInstalledBin(cliBinDir: string, candidates: string[]): CliExecutable | null {
  const isWin = process.platform === 'win32'
  for (const name of candidates) {
    const variants = isWin
      ? [
          { command: join(cliBinDir, `${name}.cmd`), shell: true },
          { command: join(cliBinDir, `${name}.exe`), shell: false }
        ]
      : [{ command: join(cliBinDir, name), shell: false }]
    const hit = variants.find((variant) => existsSync(variant.command))
    if (hit) return hit
  }
  return null
}

// -- verification -----------------------------------------------------------

type VerifyResult =
  | { ok: true; version: string }
  | { ok: false; reason: string; stderrTail?: string }

async function verifyExecutable(
  executable: CliExecutable,
  signal: AbortSignal | undefined
): Promise<VerifyResult> {
  if (signal?.aborted) {
    return { ok: false, reason: 'aborted' }
  }
  const result = await runCapture(
    executable.command,
    [...(executable.baseArgs ?? []), '--version'],
    {
      env: process.env,
      shell: executable.shell,
      timeoutMs: 15_000
    }
  )
  if (result.code !== 0) {
    return {
      ok: false,
      reason: `exit ${result.code ?? 'null'}`,
      stderrTail: (result.stderr || '').slice(-2048) || undefined
    }
  }
  const version = result.stdout.trim().split('\n')[0] || 'unknown'
  return { ok: true, version }
}

function ensureDirectory(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true })
  }
}
