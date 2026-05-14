import { spawn } from 'node:child_process'
import { createWriteStream, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { withCliBaseArgs, type CliExecutable } from '../cli/executable'
import { firstLine, isRecord, parseJsonFromCliOutput } from '../cli/output'
import { runCapture } from '../cli/process'
import { ProviderConnectResultSchema, ProviderStatusSchema } from '@shared/contracts'
import type { ProviderConnectResult, ProviderId, ProviderStatus } from '@shared/contracts'
import { redactDiagnosticsText } from '../../observability/redaction'
import type { RuntimeObservation } from '../../observability/types'
import type {
  ProviderLoginProcess,
  ProviderRuntimeContext,
  RuntimeConversationTurnInput
} from './types'

export type ConnectProviderOptions = {
  loginProcess: ProviderLoginProcess | null
  getStatus: (loginProcess: ProviderLoginProcess | null) => Promise<ProviderStatus>
  findExecutable: () => Promise<CliExecutable | null>
  missingCliError: string
  setLoginProcess: (process: ProviderLoginProcess) => void
  clearLoginProcess: () => void
  startLogin: (
    executable: CliExecutable,
    setProcess: (process: ProviderLoginProcess) => void
  ) => Promise<ProviderConnectResult>
}

export type DisconnectProviderOptions = {
  providerId: ProviderId
  context: ProviderRuntimeContext
  beforeRemoveAuth?: () => Promise<void>
  getAuthPaths: () => string[]
  getStatus: (loginProcess: ProviderLoginProcess | null) => Promise<ProviderStatus>
}

export type ConversationProcessResult = {
  code: number | null
  stdout: string
  stderr: string
  cancelled: boolean
}

export type CliFailureMessageOptions = {
  stdout: string
  stderr: string
  jsonFallbackKeys?: string[]
  ignoredDiagnosticPatterns?: RegExp[]
  ignoredJsonEventTypes?: string[]
  defaultMessage: string
}

export type RunConversationProcessOptions = {
  executable: CliExecutable
  args: string[]
  input: RuntimeConversationTurnInput
  context: ProviderRuntimeContext
  env: NodeJS.ProcessEnv
  stdin: string
  streamErrorMessage: string
  observeStdoutLine?: (line: string) => RuntimeObservation[]
}

export function runConversationProcess({
  executable,
  args,
  input,
  context,
  env,
  stdin,
  streamErrorMessage,
  observeStdoutLine
}: RunConversationProcessOptions): Promise<ConversationProcessResult> {
  return new Promise((resolve, reject) => {
    mkdirSync(dirname(input.eventLogPath), { recursive: true })

    const eventLog = createWriteStream(input.eventLogPath, { flags: 'a' })
    const stderrLog = createWriteStream(join(dirname(input.eventLogPath), 'stderr.txt'), {
      flags: 'a'
    })
    const child = spawn(executable.command, withCliBaseArgs(executable, args), {
      cwd: input.workspaceRoot,
      env,
      shell: executable.shell,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    const process = {
      child,
      cancelled: false,
      cleanupTimer: null as NodeJS.Timeout | null
    }

    context.conversationProcesses.set(input.turnId, process)

    let settled = false
    let stdout = ''
    let stderr = ''
    let stdoutLineBuffer = ''

    process.cleanupTimer = setTimeout(
      () => {
        process.cancelled = true
        child.kill()
      },
      10 * 60 * 1000
    )

    const cleanup = (): void => {
      if (process.cleanupTimer) {
        clearTimeout(process.cleanupTimer)
      }
      context.conversationProcesses.delete(input.turnId)
      eventLog.end()
      stderrLog.end()
    }

    const finish = (value: ConversationProcessResult): void => {
      if (settled) return
      settled = true
      cleanup()
      resolve(value)
    }

    if (!child.stdin || !child.stdout || !child.stderr) {
      settled = true
      cleanup()
      reject(new Error(streamErrorMessage))
      return
    }

    child.stdout.on('data', (chunk: Buffer) => {
      const text = redactDiagnosticsText(chunk.toString())
      stdout += text
      eventLog.write(text)
      input.observability?.stdout(text)
      if (observeStdoutLine) {
        stdoutLineBuffer = observeProviderStdoutLines(
          `${stdoutLineBuffer}${text}`,
          observeStdoutLine,
          input
        )
      }
    })
    child.stderr.on('data', (chunk: Buffer) => {
      const text = redactDiagnosticsText(chunk.toString())
      stderr += text
      stderrLog.write(text)
      input.observability?.stderr(text)
    })
    child.once('error', (error) => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    })
    child.once('close', (code) => {
      if (observeStdoutLine && stdoutLineBuffer.trim()) {
        observeProviderStdoutLines(`${stdoutLineBuffer}\n`, observeStdoutLine, input)
      }
      input.observability?.complete(
        process.cancelled ? 'cancelled' : code === 0 ? 'completed' : 'failed'
      )
      finish({
        code,
        stdout,
        stderr,
        cancelled: process.cancelled
      })
    })

    child.stdin.write(stdin)
    child.stdin.end()
  })
}

export function readCliJsonErrorMessage(value: string, fallbackKeys: string[]): string {
  if (!value.trim()) {
    return ''
  }

  try {
    const parsed = parseJsonFromCliOutput(value)
    if (!isRecord(parsed)) {
      return ''
    }

    const error = isRecord(parsed.error) ? parsed.error : null
    return (
      getStringValue(error?.message) ||
      fallbackKeys.map((key) => getStringValue(parsed[key])).find(Boolean) ||
      ''
    )
  } catch {
    return ''
  }
}

function observeProviderStdoutLines(
  text: string,
  observeStdoutLine: (line: string) => RuntimeObservation[],
  input: RuntimeConversationTurnInput
): string {
  const lines = text.split(/\r?\n/)
  const remainder = lines.pop() ?? ''

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    for (const event of observeStdoutLine(trimmed)) {
      input.observability?.record(event)
    }
  }

  return remainder
}

export function readCliFailureMessage({
  stdout,
  stderr,
  jsonFallbackKeys = [],
  ignoredDiagnosticPatterns = [],
  ignoredJsonEventTypes = [],
  defaultMessage
}: CliFailureMessageOptions): string {
  return (
    readCliJsonErrorMessage(stdout, jsonFallbackKeys) ||
    readCliJsonErrorMessage(stderr, jsonFallbackKeys) ||
    readCliJsonLineErrorMessage(stdout, ignoredJsonEventTypes) ||
    readCliJsonLineErrorMessage(stderr, ignoredJsonEventTypes) ||
    readCliTextFailureMessage(stderr, ignoredDiagnosticPatterns) ||
    readCliTextFailureMessage(stdout, ignoredDiagnosticPatterns) ||
    defaultMessage
  )
}

export function getStringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function addCliModelArg(args: string[], model: string, index = args.length): void {
  if (model === 'default') {
    return
  }

  args.splice(index, 0, '--model', model)
}

function readCliJsonLineErrorMessage(value: string, ignoredEventTypes: string[]): string {
  const ignoredEvents = new Set(ignoredEventTypes)
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  for (const line of [...lines].reverse()) {
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      continue
    }

    if (ignoredEvents.has(getCliEventType(parsed))) {
      continue
    }

    const message = findNestedErrorMessage(parsed)
    if (message) {
      return message
    }
  }

  return ''
}

function readCliTextFailureMessage(value: string, ignoredDiagnosticPatterns: RegExp[]): string {
  return (
    value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(
        (line) => line && !ignoredDiagnosticPatterns.some((pattern) => pattern.test(line))
      ) ?? ''
  )
}

function getCliEventType(value: unknown): string {
  return getStringPath(value, ['type']) || getStringPath(value, ['event'])
}

function getStringPath(value: unknown, path: string[]): string {
  let current = value

  for (const part of path) {
    if (!isRecord(current)) {
      return ''
    }
    current = current[part]
  }

  return typeof current === 'string' ? current : ''
}

function findNestedErrorMessage(value: unknown): string {
  if (!isRecord(value)) {
    return ''
  }

  for (const key of ['message', 'error', 'detail', 'reason']) {
    const direct = value[key]
    if (typeof direct === 'string' && direct.trim()) {
      return direct.trim()
    }
  }

  for (const key of ['payload', 'data', 'event']) {
    const nested = findNestedErrorMessage(value[key])
    if (nested) {
      return nested
    }
  }

  return ''
}

export async function connectCliProvider({
  loginProcess,
  getStatus,
  findExecutable,
  missingCliError,
  setLoginProcess,
  clearLoginProcess,
  startLogin
}: ConnectProviderOptions): Promise<ProviderConnectResult> {
  const status = await getStatus(loginProcess)

  if (status.connected) {
    return ProviderConnectResultSchema.parse({ status, authUrl: '', alreadyConnected: true })
  }

  if (loginProcess && !loginProcess.finished) {
    if (loginProcess.authUrl) {
      return ProviderConnectResultSchema.parse({
        status,
        authUrl: loginProcess.authUrl,
        alreadyStarted: true
      })
    }

    stopProviderLoginProcess(loginProcess)
    clearLoginProcess()
  }

  const executable = await findExecutable()
  if (!executable) {
    return ProviderConnectResultSchema.parse({
      status: ProviderStatusSchema.parse({
        ...status,
        installed: false,
        connected: false,
        lastError: missingCliError
      }),
      authUrl: ''
    })
  }

  return ProviderConnectResultSchema.parse(await startLogin(executable, setLoginProcess))
}

export async function disconnectCliProvider({
  providerId,
  context,
  beforeRemoveAuth,
  getAuthPaths,
  getStatus
}: DisconnectProviderOptions): Promise<ProviderStatus> {
  const loginProcess = context.loginProcesses.get(providerId)
  if (loginProcess) {
    stopProviderLoginProcess(loginProcess)
    context.loginProcesses.delete(providerId)
  }

  await beforeRemoveAuth?.()

  for (const authPath of getAuthPaths()) {
    rmSync(authPath, { force: true, recursive: true })
  }

  return getStatus(null)
}

export function createProviderStatusBase<TProviderId extends ProviderId>({
  id,
  label,
  executable,
  loginProcess
}: {
  id: TProviderId
  label: string
  executable: CliExecutable | null
  loginProcess: ProviderLoginProcess | null
}): Omit<ProviderStatus, 'id'> & { id: TProviderId } {
  const loginInProgress = Boolean(loginProcess && !loginProcess.finished)

  return {
    id,
    label,
    installed: Boolean(executable),
    connected: false,
    version: null,
    accountLabel: '',
    authUrl: loginInProgress ? (loginProcess?.authUrl ?? '') : '',
    loginInProgress,
    lastError: '',
    note: ''
  }
}

export async function getCliVersion(
  executable: CliExecutable,
  env: NodeJS.ProcessEnv
): Promise<string | null> {
  const versionResult = await runCapture(
    executable.command,
    withCliBaseArgs(executable, ['--version']),
    {
      env,
      shell: executable.shell,
      timeoutMs: 5_000
    }
  )

  return versionResult.code === 0
    ? firstLine(`${versionResult.stdout}\n${versionResult.stderr}`) || null
    : null
}

export function stopProviderLoginProcess(process: ProviderLoginProcess): void {
  if (process.cleanupTimer) {
    clearTimeout(process.cleanupTimer)
  }

  if (!process.finished && process.child.pid) {
    process.child.kill()
  }
}

export function scheduleLoginCleanup(process: ProviderLoginProcess): void {
  process.cleanupTimer = setTimeout(
    () => {
      stopProviderLoginProcess(process)
    },
    10 * 60 * 1000
  )
}

export function createProviderLoginResult(
  id: ProviderId,
  label: string,
  note: string,
  authUrl: string,
  loginInProgress = true
): ProviderConnectResult {
  return ProviderConnectResultSchema.parse({
    status: ProviderStatusSchema.parse({
      id,
      label,
      installed: true,
      connected: false,
      version: null,
      accountLabel: '',
      authUrl,
      loginInProgress,
      lastError: '',
      note
    }),
    authUrl
  })
}
