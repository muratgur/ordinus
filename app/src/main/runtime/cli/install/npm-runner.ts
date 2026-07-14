import { spawn, type ChildProcess } from 'node:child_process'
import { sep } from 'node:path'

export type NpmRunOptions = {
  cwd: string
  env: NodeJS.ProcessEnv
  /** Called once with the resolved invocation, before the child starts. */
  onSpawn?: (info: NpmSpawnInfo) => void
  onStdout?: (chunk: string) => void
  onStderr?: (chunk: string) => void
  signal?: AbortSignal
}

/** The command line actually handed to the OS, for the install log. */
export type NpmSpawnInfo = {
  command: string
  args: string[]
  shell: boolean
}

export type NpmRunResult = {
  code: number | null
  stderrTail: string
}

/** npm could not be started at all (missing binary, blocked exec) — not an npm failure. */
export class NpmSpawnError extends Error {
  constructor(
    message: string,
    readonly info: NpmSpawnInfo
  ) {
    super(message)
    this.name = 'NpmSpawnError'
  }
}

const STDERR_TAIL_BYTES = 4_096

/**
 * Run `npm` for the managed-install service (ADR-028).
 *
 * Resolution order:
 *  1. If `npm` is bundled as an app dependency, invoke its CLI script with
 *     Electron's Node (`process.execPath`). This is the production path —
 *     no user-level npm required.
 *  2. Otherwise fall back to system `npm` / `npm.cmd`. This is the dev path,
 *     where the developer's machine already has npm.
 */
export function runNpm(args: string[], options: NpmRunOptions): Promise<NpmRunResult> {
  return new Promise((resolve, reject) => {
    const { command, baseArgs, shell, asNode } = resolveNpmCommand()
    // Under `shell: true` Node hands the joined command line to cmd.exe as-is,
    // so an argument containing spaces — `--prefix C:\Users\Some User\...` —
    // arrives as two. Node does this quoting itself when there is no shell, so
    // only the win32 `npm.cmd` fallback below needs it.
    const spawnArgs = [...baseArgs, ...args].map((arg) => (shell ? quoteForCmd(arg) : arg))
    const info: NpmSpawnInfo = { command, args: spawnArgs, shell }
    options.onSpawn?.(info)

    // When invoking Electron's binary as Node, ELECTRON_RUN_AS_NODE=1 is
    // required — without it, packaged Electron will try to launch a GUI
    // instead of executing the script under Node semantics.
    const env = asNode ? { ...options.env, ELECTRON_RUN_AS_NODE: '1' } : options.env
    const child: ChildProcess = spawn(command, spawnArgs, {
      cwd: options.cwd,
      env,
      shell,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    })

    let stderrTail = ''

    function onAbort(): void {
      if (!child.killed) child.kill()
    }
    options.signal?.addEventListener('abort', onAbort, { once: true })

    child.stdout?.on('data', (chunk: Buffer) => {
      options.onStdout?.(chunk.toString('utf8'))
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8')
      stderrTail = (stderrTail + text).slice(-STDERR_TAIL_BYTES)
      options.onStderr?.(text)
    })

    child.once('error', (error) => {
      options.signal?.removeEventListener('abort', onAbort)
      // The child never ran, so there is no exit code to classify. Reject with a
      // distinguishable error rather than a bare Node one, so the caller can say
      // "npm could not start" instead of blaming the network.
      reject(new NpmSpawnError(error instanceof Error ? error.message : String(error), info))
    })
    child.once('close', (code) => {
      options.signal?.removeEventListener('abort', onAbort)
      resolve({ code, stderrTail })
    })
  })
}

type ResolvedNpm = {
  command: string
  baseArgs: string[]
  shell: boolean
  /**
   * True when `command` is Electron's binary acting as Node. The caller must
   * set `ELECTRON_RUN_AS_NODE=1` in the spawn env, otherwise Electron will
   * try to launch a GUI instead of executing the script.
   */
  asNode: boolean
}

function resolveNpmCommand(): ResolvedNpm {
  const bundled = resolveBundledNpmCli()
  if (bundled) {
    return { command: process.execPath, baseArgs: [bundled], shell: false, asNode: true }
  }

  if (process.platform === 'win32') {
    return { command: 'npm.cmd', baseArgs: [], shell: true, asNode: false }
  }
  return { command: 'npm', baseArgs: [], shell: false, asNode: false }
}

/** Quote a single argument for cmd.exe. Only used on the `shell: true` path. */
function quoteForCmd(arg: string): string {
  return /[\s&|<>^"]/.test(arg) ? `"${arg.replace(/"/g, '""')}"` : arg
}

function resolveBundledNpmCli(): string | null {
  try {
    // require.resolve is a real CJS API at runtime in the main bundle.
    // Cast through unknown to satisfy TS when the file is type-checked under
    // ESM-aware tsconfigs.
    const resolver = (require as unknown as { resolve: (id: string) => string }).resolve
    const resolved = resolver('npm/bin/npm-cli.js')
    // In packaged Electron, require.resolve returns a path inside `app.asar`,
    // but npm is asarUnpacked (see electron-builder.yml — npm needs real fs
    // access to spawn subprocesses). Rewrite to the unpacked twin.
    return resolved.replace(`${sep}app.asar${sep}`, `${sep}app.asar.unpacked${sep}`)
  } catch {
    return null
  }
}
