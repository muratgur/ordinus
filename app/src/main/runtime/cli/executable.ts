import { runCapture } from './process'

export type CliExecutable = {
  command: string
  baseArgs?: string[]
  shell: boolean
}

export async function findCliExecutable(
  commandName: string,
  overrideEnvKey: string
): Promise<CliExecutable | null> {
  const configured = process.env[overrideEnvKey]?.trim()
  if (configured) {
    return { command: configured, shell: false }
  }

  if (process.platform !== 'win32') {
    return { command: commandName, shell: false }
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
    return { command: executable, shell: false }
  }

  const commandShim = candidates.find((candidate) => candidate.toLowerCase().endsWith('.cmd'))
  if (commandShim) {
    return { command: commandShim, shell: true }
  }

  return candidates[0] ? { command: candidates[0], shell: false } : null
}

export function withCliBaseArgs(executable: CliExecutable, args: string[]): string[] {
  return [...(executable.baseArgs ?? []), ...args]
}
