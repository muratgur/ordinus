import { withCliBaseArgs, type CliExecutable } from '../cli/executable'
import { firstLine } from '../cli/output'
import { runCapture } from '../cli/process'
import { ProviderConnectResultSchema, ProviderStatusSchema } from '@shared/contracts'
import type { ProviderConnectResult, ProviderId, ProviderStatus } from '@shared/contracts'
import type { ProviderLoginProcess } from './types'

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
