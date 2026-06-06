import { spawn, type ChildProcess } from 'node:child_process'
import { sep } from 'node:path'

export type NpmRunOptions = {
  cwd: string
  env: NodeJS.ProcessEnv
  onStdout?: (chunk: string) => void
  onStderr?: (chunk: string) => void
  signal?: AbortSignal
}

export type NpmRunResult = {
  code: number | null
  stderrTail: string
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
    // When invoking Electron's binary as Node, ELECTRON_RUN_AS_NODE=1 is
    // required — without it, packaged Electron will try to launch a GUI
    // instead of executing the script under Node semantics.
    const env = asNode ? { ...options.env, ELECTRON_RUN_AS_NODE: '1' } : options.env
    const child: ChildProcess = spawn(command, [...baseArgs, ...args], {
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
      reject(error)
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
