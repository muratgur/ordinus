import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CodexConnectResultSchema,
  ProviderStatusSchema,
  type CodexConnectResult,
  type ProviderStatus
} from '@shared/contracts'
import { getSystemPaths } from '../paths'
import { providerIds, type RuntimeEventListener, type RuntimeProviderCapabilities } from './types'

type CodexLoginProcess = {
  child: ChildProcess
  authUrl: string
  finished: boolean
  cleanupTimer: NodeJS.Timeout | null
}

export type RuntimeService = {
  readonly ready: boolean
  getProviderCapabilities(): readonly RuntimeProviderCapabilities[]
  getProviderStatuses(): Promise<ProviderStatus[]>
  refreshCodex(): Promise<ProviderStatus>
  connectCodex(): Promise<CodexConnectResult>
  subscribe(listener: RuntimeEventListener): () => void
}

export function createRuntimeService(): RuntimeService {
  const listeners = new Set<RuntimeEventListener>()
  let codexLoginProcess: CodexLoginProcess | null = null

  return {
    ready: true,
    getProviderCapabilities() {
      return providerIds.map((provider) => ({
        provider,
        detection: 'not_implemented',
        auth: 'not_implemented',
        runs: 'not_implemented'
      }))
    },
    async getProviderStatuses() {
      return [
        await getCodexStatus(codexLoginProcess),
        getStaticProviderStatus('claude'),
        getStaticProviderStatus('gemini')
      ]
    },
    async refreshCodex() {
      return getCodexStatus(codexLoginProcess)
    },
    async connectCodex() {
      const status = await getCodexStatus(codexLoginProcess)

      if (status.connected) {
        return CodexConnectResultSchema.parse({ status, authUrl: '', alreadyConnected: true })
      }

      if (codexLoginProcess && !codexLoginProcess.finished) {
        if (codexLoginProcess.authUrl) {
          return CodexConnectResultSchema.parse({
            status,
            authUrl: codexLoginProcess.authUrl,
            alreadyStarted: true
          })
        }

        stopCodexLoginProcess(codexLoginProcess)
        codexLoginProcess = null
      }

      const executable = await findCodexExecutable()
      if (!executable) {
        return CodexConnectResultSchema.parse({
          status: ProviderStatusSchema.parse({
            ...status,
            installed: false,
            connected: false,
            lastError: 'Codex CLI was not found.'
          }),
          authUrl: ''
        })
      }

      const result = await startCodexLogin(executable, (process) => {
        codexLoginProcess = process
      })

      return CodexConnectResultSchema.parse(result)
    },
    subscribe(listener) {
      listeners.add(listener)

      return () => {
        listeners.delete(listener)
      }
    }
  }
}

function getStaticProviderStatus(id: 'claude' | 'gemini'): ProviderStatus {
  return ProviderStatusSchema.parse({
    id,
    label: id === 'claude' ? 'Claude CLI' : 'Gemini CLI',
    installed: false,
    connected: false,
    version: null,
    accountLabel: '',
    authUrl: '',
    loginInProgress: false,
    lastError: '',
    note: 'Coming next.'
  })
}

async function getCodexStatus(loginProcess: CodexLoginProcess | null): Promise<ProviderStatus> {
  const executable = await findCodexExecutable()
  const base = {
    id: 'codex',
    label: 'Codex CLI',
    installed: Boolean(executable),
    connected: false,
    version: null,
    accountLabel: '',
    authUrl: loginProcess?.authUrl ?? '',
    loginInProgress: Boolean(loginProcess && !loginProcess.finished),
    lastError: '',
    note: ''
  } satisfies Omit<ProviderStatus, 'id'> & { id: 'codex' }

  if (!executable) {
    return ProviderStatusSchema.parse({
      ...base,
      lastError: 'Install Codex CLI or make it available on PATH.',
      note: 'Not detected.'
    })
  }

  try {
    const versionResult = await runCapture(executable.command, ['--version'], {
      env: getCodexEnvironment(),
      shell: executable.shell,
      timeoutMs: 5_000
    })
    const version =
      versionResult.code === 0 ? firstLine(versionResult.stdout || versionResult.stderr) : null

    const authResult = await runCapture(executable.command, ['login', 'status'], {
      env: getCodexEnvironment(),
      shell: executable.shell,
      timeoutMs: 10_000
    })
    const output = `${authResult.stdout}\n${authResult.stderr}`.trim()
    const connected = authResult.code === 0 && /logged in/i.test(output)

    return ProviderStatusSchema.parse({
      ...base,
      version,
      connected,
      accountLabel: connected ? firstLine(output) || 'Logged in' : '',
      lastError: connected ? '' : output,
      note: connected ? 'Ready.' : 'Needs login.'
    })
  } catch (error) {
    return ProviderStatusSchema.parse({
      ...base,
      installed: false,
      lastError: error instanceof Error ? error.message : 'Codex CLI could not be checked.',
      note: 'Not detected.'
    })
  }
}

function getCodexHome(): string {
  const codexHome = join(getSystemPaths().runtime, 'codex')
  mkdirSync(codexHome, { recursive: true })
  writeFileSync(join(codexHome, 'config.toml'), '# Generated by Ordinus.\n', 'utf8')
  return codexHome
}

function getCodexEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    CODEX_HOME: getCodexHome()
  }

  for (const key of [
    'PATH',
    'Path',
    'PATHEXT',
    'SystemRoot',
    'WINDIR',
    'HOME',
    'USERPROFILE',
    'APPDATA',
    'LOCALAPPDATA',
    'TMP',
    'TEMP'
  ]) {
    const value = process.env[key]
    if (value) {
      env[key] = value
    }
  }

  return env
}

async function findCodexExecutable(): Promise<{ command: string; shell: boolean } | null> {
  const configured = process.env['CODEX_BIN']?.trim()
  if (configured) {
    return { command: configured, shell: false }
  }

  if (process.platform !== 'win32') {
    return { command: 'codex', shell: false }
  }

  const result = await runCapture('where.exe', ['codex'], {
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

function startCodexLogin(
  executable: { command: string; shell: boolean },
  setProcess: (process: CodexLoginProcess) => void
): Promise<CodexConnectResult> {
  return new Promise((resolve, reject) => {
    let settled = false
    let output = ''
    const child = spawn(executable.command, ['login'], {
      cwd: getSystemPaths().userData,
      env: getCodexEnvironment(),
      shell: executable.shell,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    const loginProcess: CodexLoginProcess = {
      child,
      authUrl: '',
      finished: false,
      cleanupTimer: null
    }

    setProcess(loginProcess)

    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      stopCodexLoginProcess(loginProcess)
      reject(new Error('Codex login did not provide an auth URL.'))
    }, 15_000)

    const finish = (value: CodexConnectResult): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve(value)
    }

    const onData = (chunk: Buffer): void => {
      output += chunk.toString()
      const authUrl = extractAuthUrl(output)
      if (!authUrl || loginProcess.authUrl) return

      loginProcess.authUrl = authUrl
      loginProcess.cleanupTimer = setTimeout(
        () => {
          stopCodexLoginProcess(loginProcess)
        },
        10 * 60 * 1000
      )

      finish(
        CodexConnectResultSchema.parse({
          status: ProviderStatusSchema.parse({
            id: 'codex',
            label: 'Codex CLI',
            installed: true,
            connected: false,
            version: null,
            accountLabel: '',
            authUrl,
            loginInProgress: true,
            lastError: '',
            note: 'Waiting for browser login.'
          }),
          authUrl
        })
      )
    }

    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
    child.once('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      reject(error)
    })
    child.once('close', (code) => {
      loginProcess.finished = true
      if (!settled && code) {
        settled = true
        clearTimeout(timeout)
        reject(new Error(output.trim() || `Codex login exited with code ${code}.`))
      }
    })
  })
}

function stopCodexLoginProcess(process: CodexLoginProcess): void {
  if (process.cleanupTimer) {
    clearTimeout(process.cleanupTimer)
  }

  if (!process.finished && process.child.pid) {
    process.child.kill()
  }
}

function extractAuthUrl(value: string): string {
  return value.match(/https:\/\/auth\.openai\.com\/[^\s]+/)?.[0] ?? ''
}

function firstLine(value: string): string {
  return (
    value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? ''
  )
}

function runCapture(
  command: string,
  args: string[],
  options: { env: NodeJS.ProcessEnv; shell: boolean; timeoutMs: number }
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: options.env,
      shell: options.shell,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    const timeout = setTimeout(() => {
      child.kill()
      resolve({ code: null, stdout, stderr: stderr || 'Command timed out.' })
    }, options.timeoutMs)

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.once('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.once('close', (code) => {
      clearTimeout(timeout)
      resolve({ code, stdout, stderr })
    })
  })
}

export type {
  ProviderId,
  RuntimeEnvironmentPolicy,
  RuntimeEventKind,
  RuntimeEventListener,
  RuntimeOutputStream,
  RuntimeProcessStatus,
  RuntimeProviderCapabilities,
  RuntimeRunEvent,
  RuntimeRunId,
  RuntimeRunRequest,
  RuntimeRunResult,
  RuntimeSecretRef,
  RuntimeTimeoutPolicy,
  RuntimeWorkspaceBoundary
} from './types'
