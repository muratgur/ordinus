import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, extname, join } from 'node:path'
import {
  ProviderStatusSchema,
  type AgentDraft,
  type ProviderConnectResult,
  type ProviderStatus
} from '@shared/contracts'
import { buildRuntimeEnvironment } from '../../cli/environment'
import { findCliExecutable, withCliBaseArgs, type CliExecutable } from '../../cli/executable'
import { firstLine, isRecord, parseJsonFromCliOutput } from '../../cli/output'
import { runCapture } from '../../cli/process'
import { extractTrustedHttpsUrl } from '../../cli/url'
import { getSystemPaths } from '../../../paths'
import {
  AgentDraftOutputSchema,
  buildAgentDraft,
  buildAgentDraftPrompt
} from '../../prompts/agent-draft'
import {
  connectCliProvider,
  createProviderLoginResult,
  createProviderStatusBase,
  getCliVersion,
  scheduleLoginCleanup,
  stopProviderLoginProcess
} from '../shared'
import type { ProviderAdapter, ProviderLoginProcess, RuntimeAgentDraftInput } from '../types'

const geminiAuthEnvKeys = [
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'GOOGLE_GENAI_USE_VERTEXAI',
  'GOOGLE_CLOUD_PROJECT',
  'GOOGLE_CLOUD_LOCATION',
  'GOOGLE_APPLICATION_CREDENTIALS'
] as const

export const geminiProviderAdapter: ProviderAdapter = {
  id: 'gemini',
  label: 'Gemini CLI',
  getStatus(context) {
    return getGeminiStatus(context.loginProcesses.get('gemini') ?? null)
  },
  connectProvider(_input, context) {
    return connectCliProvider({
      loginProcess: context.loginProcesses.get('gemini') ?? null,
      getStatus: getGeminiStatus,
      findExecutable: findGeminiExecutable,
      missingCliError: 'Gemini CLI was not found.',
      setLoginProcess: (process) => context.loginProcesses.set('gemini', process),
      clearLoginProcess: () => context.loginProcesses.delete('gemini'),
      startLogin: startGeminiLogin
    })
  },
  generateAgentDraft(input) {
    return generateGeminiAgentDraft(input)
  }
}

async function generateGeminiAgentDraft(input: RuntimeAgentDraftInput): Promise<AgentDraft> {
  const executable = await findGeminiExecutable()
  if (!executable) {
    throw new Error('Gemini CLI was not found.')
  }

  const status = await getGeminiStatus(null)
  if (!status.connected) {
    throw new Error('Gemini needs login before Ordinus can draft agents with it.')
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'ordinus-gemini-agent-draft-'))

  try {
    const args = [
      '--skip-trust',
      '--approval-mode',
      'plan',
      '--output-format',
      'json',
      '--prompt',
      buildAgentDraftPrompt(input.requestedWork)
    ]

    if (input.model !== 'default') {
      args.splice(0, 0, '--model', input.model)
    }

    const result = await runCapture(executable.command, withCliBaseArgs(executable, args), {
      cwd: tempDir,
      env: getGeminiEnvironment(),
      shell: executable.shell,
      timeoutMs: 90_000
    })

    if (result.code !== 0) {
      throw new Error(
        firstLine(result.stderr || result.stdout) || 'Gemini could not draft the agent.'
      )
    }

    const draftJson = AgentDraftOutputSchema.parse(readGeminiAgentDraftOutput(result.stdout))

    return buildAgentDraft(input, draftJson)
  } finally {
    rmSync(tempDir, { force: true, recursive: true })
  }
}

async function getGeminiStatus(loginProcess: ProviderLoginProcess | null): Promise<ProviderStatus> {
  const executable = await findGeminiExecutable()
  const base = createProviderStatusBase({
    id: 'gemini',
    label: 'Gemini CLI',
    executable,
    loginProcess
  })

  if (!executable) {
    return ProviderStatusSchema.parse({
      ...base,
      lastError: 'Install Gemini CLI or make it available on PATH.',
      note: 'Not detected.'
    })
  }

  try {
    const version = await getCliVersion(executable, getGeminiEnvironment())
    const auth = getGeminiAuthStatus()

    return ProviderStatusSchema.parse({
      ...base,
      version,
      connected: auth.connected,
      accountLabel: auth.accountLabel,
      lastError: '',
      note: auth.connected ? 'Ready.' : 'Needs login.'
    })
  } catch (error) {
    return ProviderStatusSchema.parse({
      ...base,
      installed: false,
      lastError: error instanceof Error ? error.message : 'Gemini CLI could not be checked.',
      note: 'Not detected.'
    })
  }
}

function startGeminiLogin(
  executable: CliExecutable,
  setProcess: (process: ProviderLoginProcess) => void
): Promise<ProviderConnectResult> {
  return new Promise((resolve, reject) => {
    let settled = false
    let consentSent = false
    let output = ''

    try {
      selectGeminiGoogleAuth()
    } catch (error) {
      reject(error)
      return
    }

    const child = spawn(executable.command, withCliBaseArgs(executable, ['--skip-trust']), {
      cwd: getSystemPaths().userData,
      env: getGeminiEnvironment(),
      shell: executable.shell,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    const loginProcess: ProviderLoginProcess = {
      child,
      authUrl: '',
      finished: false,
      cleanupTimer: null
    }

    setProcess(loginProcess)

    const timeout = setTimeout(() => {
      if (settled) return

      const authUrl = extractGeminiAuthUrl(output)
      if (authUrl) {
        finishWithUrl(authUrl)
        return
      }

      settled = true
      stopProviderLoginProcess(loginProcess)
      reject(new Error('Gemini login did not provide an auth URL.'))
    }, 20_000)

    const finish = (value: ProviderConnectResult): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve(value)
    }

    const finishWithUrl = (authUrl: string): void => {
      loginProcess.authUrl = authUrl
      scheduleLoginCleanup(loginProcess)
      finish(
        createProviderLoginResult('gemini', 'Gemini CLI', 'Waiting for browser login.', authUrl)
      )
    }

    const onData = (chunk: Buffer): void => {
      output += chunk.toString()

      if (!consentSent && /Opening authentication page in your browser/i.test(output)) {
        consentSent = true
        child.stdin?.write('y\n')
      }

      const authUrl = extractGeminiAuthUrl(output)
      if (!authUrl || loginProcess.authUrl) return

      finishWithUrl(authUrl)
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
      if (settled) {
        return
      }

      if (code) {
        settled = true
        clearTimeout(timeout)
        reject(new Error(firstLine(output) || `Gemini login exited with code ${code}.`))
        return
      }

      settled = true
      clearTimeout(timeout)
      resolve(
        createProviderLoginResult(
          'gemini',
          'Gemini CLI',
          'Gemini login finished. Check Gemini again.',
          '',
          false
        )
      )
    })
  })
}

function getGeminiEnvironment(): NodeJS.ProcessEnv {
  const providerEnv: NodeJS.ProcessEnv = {
    GEMINI_CLI_HOME: getGeminiHome()
  }

  for (const key of geminiAuthEnvKeys) {
    const value = process.env[key]
    if (value) {
      providerEnv[key] = value
    }
  }

  return buildRuntimeEnvironment(providerEnv)
}

async function findGeminiExecutable(): Promise<CliExecutable | null> {
  const executable = await findCliExecutable('gemini', 'GEMINI_BIN')
  if (!executable) {
    return null
  }

  return normalizeGeminiExecutable(executable)
}

function normalizeGeminiExecutable(executable: CliExecutable): CliExecutable {
  const extension = extname(executable.command).toLowerCase()

  if (extension === '.js') {
    return createNodeScriptExecutable(executable.command)
  }

  const bundlePath = join(
    dirname(executable.command),
    'node_modules',
    '@google',
    'gemini-cli',
    'bundle',
    'gemini.js'
  )

  if ((extension === '.cmd' || extension === '') && existsSync(bundlePath)) {
    return createNodeScriptExecutable(bundlePath)
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

function getGeminiAuthStatus(): { connected: boolean; accountLabel: string } {
  const envAuthLabel = getGeminiEnvAuthLabel()
  if (envAuthLabel) {
    return { connected: true, accountLabel: envAuthLabel }
  }

  const configDir = getGeminiConfigDir()
  const settingsPath = join(configDir, 'settings.json')
  const selectedAuthType = readGeminiSelectedAuthType(settingsPath)
  const hasOAuthCredentials = existsSync(join(configDir, 'oauth_creds.json'))
  const hasGoogleAccount = existsSync(join(configDir, 'google_accounts.json'))
  const accountLabel = readGeminiAccountLabel(configDir)

  if (selectedAuthType === 'oauth-personal' && hasOAuthCredentials) {
    return {
      connected: true,
      accountLabel: accountLabel || 'Google account'
    }
  }

  if (selectedAuthType && (hasOAuthCredentials || hasGoogleAccount)) {
    return {
      connected: true,
      accountLabel: accountLabel || selectedAuthType
    }
  }

  return { connected: false, accountLabel: '' }
}

function getGeminiEnvAuthLabel(): string {
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
    return 'API key'
  }

  if (process.env.GOOGLE_GENAI_USE_VERTEXAI || process.env.GOOGLE_CLOUD_PROJECT) {
    return 'Google Cloud'
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return 'Application credentials'
  }

  return ''
}

function getGeminiConfigDir(): string {
  return join(getGeminiHome(), '.gemini')
}

function getGeminiHome(): string {
  const geminiHome = join(getSystemPaths().runtime, 'gemini')
  mkdirSync(geminiHome, { recursive: true })
  return geminiHome
}

function selectGeminiGoogleAuth(): void {
  const configDir = getGeminiConfigDir()
  mkdirSync(configDir, { recursive: true })

  const settingsPath = join(configDir, 'settings.json')
  const settings = readGeminiSettings(settingsPath)
  const security = isRecord(settings.security) ? settings.security : {}
  const auth = isRecord(security.auth) ? security.auth : {}

  writeFileSync(
    settingsPath,
    `${JSON.stringify(
      {
        ...settings,
        security: {
          ...security,
          auth: {
            ...auth,
            selectedType: 'oauth-personal'
          }
        }
      },
      null,
      2
    )}\n`,
    'utf8'
  )
}

function readGeminiSettings(settingsPath: string): Record<string, unknown> {
  if (!existsSync(settingsPath)) {
    return {}
  }

  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as unknown
    return isRecord(settings) ? settings : {}
  } catch {
    throw new Error('Gemini settings.json could not be read.')
  }
}

function readGeminiSelectedAuthType(settingsPath: string): string {
  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as unknown
    if (!isRecord(settings)) return ''

    const security = settings.security
    if (!isRecord(security)) return ''

    const auth = security.auth
    if (!isRecord(auth)) return ''

    return typeof auth.selectedType === 'string' ? auth.selectedType : ''
  } catch {
    return ''
  }
}

function readGeminiAccountLabel(configDir: string): string {
  try {
    const accounts = JSON.parse(
      readFileSync(join(configDir, 'google_accounts.json'), 'utf8')
    ) as unknown

    return isRecord(accounts) && typeof accounts.active === 'string' ? accounts.active : ''
  } catch {
    return ''
  }
}

function readGeminiAgentDraftOutput(value: string): unknown {
  try {
    const parsed = parseJsonFromCliOutput(value)
    const response = isRecord(parsed) ? parsed.response : parsed

    return typeof response === 'string' ? parseJsonFromCliOutput(response) : response
  } catch {
    throw new Error(`Gemini returned an invalid agent draft: ${firstLine(value) || 'empty output'}`)
  }
}

function extractGeminiAuthUrl(value: string): string {
  return extractTrustedHttpsUrl(value, (url) => {
    const host = url.hostname.toLowerCase()
    return host === 'accounts.google.com' || host === 'codeassist.google.com'
  })
}
