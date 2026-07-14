import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ProviderId, ProviderInstallEvent } from '@shared/contracts'
import { getSystemPaths } from '../../../paths'
import { probeNodeRuntime } from '../bundled-node'
import { findCliExecutable, type CliExecutable } from '../executable'
import { runCapture } from '../process'
import { classifyNpmError, isTransientCause } from './classify'
import { createInstallLog, type InstallLog } from './install-log'
import { NpmSpawnError, runNpm, type NpmRunResult } from './npm-runner'
import { resolveInstallProxyEnv } from './proxy'

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

  let summary = 'ended without a result'
  let installed = false
  let releasePrefix: (() => void) | null = null
  let log: InstallLog | null = null
  try {
    // Every provider installs into the same npm prefix, and onboarding kicks an install
    // for each selected provider at once. npm does not lock a global prefix against
    // another npm, so two concurrent `npm install -g --prefix <same>` runs can interleave
    // writes into one node_modules tree. Serialize them — and hold the lock across
    // everything that touches the tree, including the fast path below, which stats the
    // prefix's bin dir and would otherwise be reading it mid-write.
    if (isPrefixBusy()) {
      yield { phase: 'waiting', providerId }
    }
    const prefixLock = acquirePrefixLock()
    releasePrefix = prefixLock.release
    await prefixLock.granted
    if (options.signal?.aborted) {
      summary = 'aborted while waiting for the shared npm prefix'
      return
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
    let fastPathNote = 'No usable CLI found in the Ordinus prefix or on PATH.'
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
        // Nothing was installed and no log was opened — there is nothing to explain.
        summary = 'already installed'
        yield { phase: 'verify', providerId, version: verify.version }
        yield { phase: 'done', providerId, binPath: existing.command }
        return
      }
      fastPathNote = `Found ${existing.command} but it failed --version (${verify.reason}); installing our own copy.`
    }

    // 2. Managed install path.
    yield {
      phase: 'download',
      providerId,
      message: `Resolving ${pkg.packageName}…`
    }

    // ADR-047 §4: isolate npm's cache under the Ordinus prefix so a corrupt or
    // version-incompatible shared user cache (e.g. the Node 24/25 ECOMPROMISED
    // bug) can't break our install. We deliberately do NOT override --userconfig:
    // the user's ~/.npmrc may carry the corporate proxy/registry we need.
    const cacheDir = join(paths.cliPrefix, 'cache')
    ensureDirectory(cacheDir)

    // ADR-047 §3b: pass a system proxy through when one isn't already configured.
    const proxyEnv = await resolveInstallProxyEnv()
    const env = { ...process.env, ...proxyEnv }

    // ADR-047 §1: which `node` the install will get — ours or the machine's. Either
    // works; neither is fatal. Probed before the log so the header can record it.
    const nodeRuntime = await probeNodeRuntime(env)

    // ADR-047 §3f: from here on, everything the install does is written to a log
    // file. The classifier only ever sees a 4 KB stderr tail, and npm routinely
    // fails with nothing useful in it — without this, such a failure is
    // undiagnosable for both the user and us.
    log = createInstallLog(providerId, {
      packageName: pkg.packageName,
      cliPrefix: paths.cliPrefix,
      cacheDir,
      proxyEnv,
      bundledNode: nodeRuntime.bundled,
      nodeOnPath: nodeRuntime.onPath
    })
    const installLog = log
    installLog.section('fast path')
    installLog.write(`${fastPathNote}\n`)

    // npm's lifecycle scripts and the installed CLI launchers both need a real `node`.
    // A missing bundled Node is survivable — the machine's own Node answers instead —
    // so only "no Node anywhere" is fatal. Refusing on the bundled copy alone would
    // break installs that would have succeeded.
    if (!nodeRuntime.available) {
      summary = 'aborted: no Node runtime available'
      installLog.section('preflight')
      installLog.write('No Node runtime: none bundled with this install, and none on PATH.\n')
      yield {
        phase: 'error',
        providerId,
        message:
          'Ordinus found no Node runtime to install with — the one it ships with is missing, and there is none on PATH.',
        cause: 'npm-unavailable',
        logPath: installLog.path || undefined
      }
      return
    }

    // We pass `-g` together with `--prefix` so npm uses its global-install
    // layout (`<prefix>/lib/node_modules/<pkg>/` + `<prefix>/bin/<binary>`).
    // Without `-g`, npm treats this as a local install and puts bins under
    // `<prefix>/node_modules/.bin/`, which mismatches our `cliBin` resolution
    // and breaks the runtime CLI lookup.
    const npmArgs = [
      'install',
      '-g',
      pkg.packageName,
      '--prefix',
      paths.cliPrefix,
      '--cache',
      cacheDir,
      '--no-audit',
      '--no-fund',
      '--omit=dev',
      '--loglevel=error',
      // Lifecycle scripts otherwise buffer their output and npm discards it on
      // failure — one of the ways a failed install ends up with empty stderr.
      '--foreground-scripts',
      // ADR-047 §3c: let npm itself retry flaky registry fetches.
      '--fetch-retries=3',
      '--fetch-timeout=60000'
    ]

    const runAttempt = async (attempt: number): Promise<NpmRunResult> => {
      installLog.section(`npm attempt ${attempt}`)
      return runNpm(npmArgs, {
        cwd: paths.cliPrefix,
        env,
        signal: options.signal,
        onSpawn: (info) => installLog.write(`$ ${info.command} ${info.args.join(' ')}\n\n`),
        onStdout: (chunk) => installLog.write(chunk),
        onStderr: (chunk) => installLog.write(chunk)
      })
    }

    // ADR-047 §3c: outer retry for whole-process transient failures (network
    // blips), on top of npm's own per-request retries. Deterministic causes
    // (proxy/tls/permission/toolchain) are not retried — they won't self-heal.
    const MAX_ATTEMPTS = 2
    let installResult: NpmRunResult
    try {
      installResult = await runAttempt(1)

      for (let attempt = 1; installResult.code !== 0 && attempt < MAX_ATTEMPTS; attempt++) {
        const { cause } = classifyNpmError(installResult.stderrTail, installResult.code)
        if (!isTransientCause(cause) || options.signal?.aborted) break
        yield {
          phase: 'download',
          providerId,
          message: `Install attempt ${attempt} failed — retrying…`
        }
        await delay(attempt * 1_500, options.signal)
        if (options.signal?.aborted) break
        installResult = await runAttempt(attempt + 1)
      }
    } catch (error) {
      // npm never started. Not a network problem — don't send the user chasing one.
      if (!(error instanceof NpmSpawnError)) throw error
      summary = `failed: npm could not start (${error.message})`
      installLog.write(`\n${error.message}\n`)
      yield {
        phase: 'error',
        providerId,
        message: `Ordinus could not start npm to run the install (${error.message}).`,
        cause: 'npm-unavailable',
        stderrTail: error.message,
        logPath: installLog.path || undefined
      }
      return
    }

    if (installResult.code !== 0) {
      const { cause, message } = classifyNpmError(installResult.stderrTail, installResult.code)
      summary = `failed: npm exit ${installResult.code ?? 'null'} (${cause})`
      yield {
        phase: 'error',
        providerId,
        message,
        cause,
        stderrTail: installResult.stderrTail || undefined,
        logPath: installLog.path || undefined
      }
      return
    }

    // 3. Resolve the bin from the installed package's own manifest, not from
    //    a hard-coded name. This is how npm itself decides what to symlink.
    installLog.section('resolve bin')
    const binCandidates = readPackageBinCandidates(paths.cliPrefix, pkg.packageName)
    if (binCandidates.length === 0) {
      summary = 'failed: package declares no bin entries'
      installLog.write(`No bin entries in the manifest of ${pkg.packageName}.\n`)
      yield {
        phase: 'error',
        providerId,
        message: `Package ${pkg.packageName} installed but declares no bin entries.`,
        cause: 'unknown',
        logPath: installLog.path || undefined
      }
      return
    }

    const resolvedBin = findInstalledBin(paths.cliBin, binCandidates)
    if (!resolvedBin) {
      summary = 'failed: installed bin not found in the prefix'
      installLog.write(`Candidates ${binCandidates.join(', ')} are not in ${paths.cliBin}.\n`)
      yield {
        phase: 'error',
        providerId,
        message: `Package ${pkg.packageName} installed but its bin (${binCandidates.join(', ')}) is not in ${paths.cliBin}.`,
        cause: 'unknown',
        logPath: installLog.path || undefined
      }
      return
    }
    installLog.write(`Resolved ${resolvedBin.command}\n`)

    yield { phase: 'verify', providerId, version: 'checking…' }

    installLog.section('verify')
    // A spawn failure here rejects rather than exiting non-zero (a .cmd shim the
    // OS refuses to exec, say) — same shape as the fast path, same handling.
    const verify = await verifyExecutable(resolvedBin, options.signal).catch(
      (error): VerifyResult => ({
        ok: false,
        reason: error instanceof Error ? error.message : String(error)
      })
    )
    if (!verify.ok) {
      summary = `failed: installed CLI did not verify (${verify.reason})`
      installLog.write(
        `${resolvedBin.command} --version failed: ${verify.reason}\n${verify.stderrTail ?? ''}\n`
      )
      yield {
        phase: 'error',
        providerId,
        message: `Installed CLI at ${resolvedBin.command} failed --version (${verify.reason}).`,
        cause: 'unknown',
        stderrTail: verify.stderrTail,
        logPath: installLog.path || undefined
      }
      return
    }

    summary = `installed ${verify.version}`
    installed = true

    yield { phase: 'verify', providerId, version: verify.version }
    yield { phase: 'done', providerId, binPath: resolvedBin.command }
  } finally {
    // Runs on success, on failure, and when the consumer abandons the generator
    // (retry aborts the previous install mid-flight).
    releasePrefix?.()
    // A log only exists to explain a failure. Keeping one for an install that worked
    // just leaves a file behind on every successful onboarding. The fast path never
    // opens one at all.
    if (installed) log?.discard()
    else log?.close(summary)
  }
}

// -- shared-prefix serialization --------------------------------------------

let prefixQueue: Promise<void> = Promise.resolve()
let prefixHolders = 0

function isPrefixBusy(): boolean {
  return prefixHolders > 0
}

/**
 * FIFO lock over the shared npm prefix.
 *
 * `release` is handed back *synchronously*, before `granted` resolves, so the caller can
 * park it in its `finally` while still queued. A caller abandoned mid-wait would otherwise
 * leave the queue chained to a promise nobody can settle — deadlocking every later install.
 * The caller MUST release in a `finally`.
 */
function acquirePrefixLock(): { granted: Promise<void>; release: () => void } {
  prefixHolders += 1

  let settle: () => void = () => {}
  const held = new Promise<void>((resolve) => {
    settle = resolve
  })

  const ourTurn = prefixQueue
  prefixQueue = prefixQueue.then(() => held)

  return {
    granted: ourTurn,
    release: once(() => {
      prefixHolders -= 1
      settle()
    })
  }
}

/** Guard the lock against a double release, which would corrupt the holder count. */
function once(fn: () => void): () => void {
  let called = false
  return () => {
    if (called) return
    called = true
    fn()
  }
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

/** Abortable delay for the install retry backoff (ADR-047 §3c). */
function delay(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true }
    )
  })
}
