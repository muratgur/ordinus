import { existsSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { runCapture } from './process'

export type CliExecutable = {
  command: string
  baseArgs?: string[]
  shell: boolean
}

export type FindCliExecutableOptions = {
  nodeScriptCandidates?: (executable: CliExecutable) => string[]
}

export async function findCliExecutable(
  commandName: string,
  overrideEnvKey: string,
  options: FindCliExecutableOptions = {}
): Promise<CliExecutable | null> {
  const configured = process.env[overrideEnvKey]?.trim()
  if (configured) {
    return normalizeCliExecutable({ command: configured, shell: false }, options)
  }

  if (process.platform !== 'win32') {
    return normalizeCliExecutable({ command: commandName, shell: false }, options)
  }

  const result = await runCapture('where.exe', [commandName], {
    env: process.env,
    shell: false,
    timeoutMs: 5_000
  })

  if (result.code !== 0) {
    return null
  }

  const candidates = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const executable = candidates.find((candidate) => candidate.toLowerCase().endsWith('.exe'))
  if (executable) {
    return normalizeCliExecutable({ command: executable, shell: false }, options)
  }

  const commandShim = candidates.find((candidate) => candidate.toLowerCase().endsWith('.cmd'))
  if (commandShim) {
    return normalizeCliExecutable({ command: commandShim, shell: true }, options)
  }

  return candidates[0]
    ? normalizeCliExecutable({ command: candidates[0], shell: false }, options)
    : null
}

export function withCliBaseArgs(executable: CliExecutable, args: string[]): string[] {
  return [...(executable.baseArgs ?? []), ...args]
}

function normalizeCliExecutable(
  executable: CliExecutable,
  options: FindCliExecutableOptions
): CliExecutable {
  const extension = extname(executable.command).toLowerCase()

  if (extension === '.js') {
    return createNodeScriptExecutable(executable.command)
  }

  const nodeScript = options
    .nodeScriptCandidates?.(executable)
    .find((candidate) => existsSync(candidate))

  if (nodeScript && (extension === '.cmd' || extension === '')) {
    return createNodeScriptExecutable(nodeScript)
  }

  return executable
}

function createNodeScriptExecutable(scriptPath: string): CliExecutable {
  return {
    command: 'node',
    baseArgs: [scriptPath],
    shell: false
  }
}

export function getCliSiblingNodeModuleScript(
  executable: CliExecutable,
  packagePath: string[],
  scriptPath: string[]
): string {
  return join(dirname(executable.command), 'node_modules', ...packagePath, ...scriptPath)
}
