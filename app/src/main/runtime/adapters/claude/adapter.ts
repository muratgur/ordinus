import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  ProviderStatusSchema,
  type AgentDraft,
  type ProviderConnectInput,
  type ProviderConnectResult,
  type ProviderStatus
} from '@shared/contracts'
import { buildRuntimeEnvironment } from '../../cli/environment'
import { findCliExecutable, type CliExecutable } from '../../cli/executable'
import { extractJsonObject, firstLine, isRecord, parseJsonFromCliOutput } from '../../cli/output'
import { runCapture } from '../../cli/process'
import { extractTrustedHttpsUrl } from '../../cli/url'
import { getSystemPaths } from '../../../paths'
import {
  AgentDraftOutputSchema,
  agentDraftOutputJsonSchema,
  buildAgentDraft,
  buildAgentDraftPrompt
} from '../../prompts/agent-draft'
import {
  connectCliProvider,
  createProviderLoginResult,
  createProviderStatusBase,
  getCliVersion,
  scheduleLoginCleanup
} from '../shared'
import type { ProviderAdapter, ProviderLoginProcess, RuntimeAgentDraftInput } from '../types'

export const claudeProviderAdapter: ProviderAdapter = {
  id: 'claude',
  label: 'Claude Code CLI',
  getStatus(context) {
    return getClaudeStatus(context.loginProcesses.get('claude') ?? null)
  },
  connectProvider(input, context) {
    return connectCliProvider({
      loginProcess: context.loginProcesses.get('claude') ?? null,
      getStatus: getClaudeStatus,
      findExecutable: findClaudeExecutable,
      missingCliError: 'Claude Code CLI was not found.',
      setLoginProcess: (process) => context.loginProcesses.set('claude', process),
      clearLoginProcess: () => context.loginProcesses.delete('claude'),
      startLogin: (executable, setProcess) =>
        startClaudeLogin(executable, input.loginMethod, setProcess)
    })
  },
  generateAgentDraft(input) {
    return generateClaudeAgentDraft(input)
  }
}

async function generateClaudeAgentDraft(input: RuntimeAgentDraftInput): Promise<AgentDraft> {
  const executable = await findClaudeExecutable()
  if (!executable) {
    throw new Error('Claude Code CLI was not found.')
  }

  const status = await getClaudeStatus(null)
  if (!status.connected) {
    throw new Error('Claude needs login before Ordinus can draft agents with it.')
  }

  const args = [
    '-p',
    '--output-format',
    'json',
    '--json-schema',
    JSON.stringify(agentDraftOutputJsonSchema),
    '--no-session-persistence',
    '--permission-mode',
    'dontAsk'
  ]

  if (input.model !== 'default') {
    args.splice(1, 0, '--model', input.model)
  }

  const result = await runCapture(executable.command, args, {
    env: getClaudeEnvironment(),
    shell: executable.shell,
    stdin: buildAgentDraftPrompt(input.requestedWork),
    timeoutMs: 90_000
  })

  if (result.code !== 0) {
    throw new Error(
      firstLine(result.stderr || result.stdout) || 'Claude could not draft the agent.'
    )
  }

  const draftJson = AgentDraftOutputSchema.parse(readClaudeAgentDraftOutput(result.stdout))

  return buildAgentDraft(input, draftJson)
}

async function getClaudeStatus(loginProcess: ProviderLoginProcess | null): Promise<ProviderStatus> {
  const executable = await findClaudeExecutable()
  const base = createProviderStatusBase({
    id: 'claude',
    label: 'Claude Code CLI',
    executable,
    loginProcess
  })

  if (!executable) {
    return ProviderStatusSchema.parse({
      ...base,
      lastError: 'Install Claude Code CLI or make it available on PATH.',
      note: 'Not detected.'
    })
  }

  try {
    const env = getClaudeEnvironment()
    const version = await getCliVersion(executable, env)

    const authResult = await runCapture(executable.command, ['auth', 'status'], {
      env,
      shell: executable.shell,
      timeoutMs: 10_000
    })
    const output = `${authResult.stdout}\n${authResult.stderr}`.trim()
    const auth = parseClaudeAuthStatus(output)

    return ProviderStatusSchema.parse({
      ...base,
      version,
      connected: auth.loggedIn,
      accountLabel: auth.loggedIn ? auth.accountLabel : '',
      lastError: '',
      note: auth.loggedIn ? 'Ready.' : 'Needs login.'
    })
  } catch (error) {
    return ProviderStatusSchema.parse({
      ...base,
      installed: false,
      lastError: error instanceof Error ? error.message : 'Claude Code CLI could not be checked.',
      note: 'Not detected.'
    })
  }
}

function getClaudeConfigDir(): string {
  const claudeConfigDir = join(getSystemPaths().runtime, 'claude')
  mkdirSync(claudeConfigDir, { recursive: true })
  return claudeConfigDir
}

function getClaudeEnvironment(): NodeJS.ProcessEnv {
  return buildRuntimeEnvironment({
    CLAUDE_CONFIG_DIR: getClaudeConfigDir()
  })
}

function findClaudeExecutable(): Promise<CliExecutable | null> {
  return findCliExecutable('claude', 'CLAUDE_BIN')
}

function startClaudeLogin(
  executable: CliExecutable,
  loginMethod: ProviderConnectInput['loginMethod'],
  setProcess: (process: ProviderLoginProcess) => void
): Promise<ProviderConnectResult> {
  return new Promise((resolve, reject) => {
    let settled = false
    let output = ''
    const args = ['auth', 'login', ...getClaudeLoginArgs(loginMethod)]
    const child = spawn(executable.command, args, {
      cwd: getSystemPaths().userData,
      env: getClaudeEnvironment(),
      shell: executable.shell,
      stdio: ['ignore', 'pipe', 'pipe']
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

      const authUrl = extractClaudeAuthUrl(output)
      if (authUrl) {
        finishWithUrl(authUrl)
        return
      }

      settled = true
      clearTimeout(timeout)
      resolve(
        createProviderLoginResult(
          'claude',
          'Claude Code CLI',
          'Claude login started. Complete it, then check Claude again.',
          ''
        )
      )
    }, 15_000)

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
        createProviderLoginResult(
          'claude',
          'Claude Code CLI',
          'Waiting for browser login.',
          authUrl
        )
      )
    }

    const onData = (chunk: Buffer): void => {
      output += chunk.toString()
      const authUrl = extractClaudeAuthUrl(output)
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
        reject(new Error(output.trim() || `Claude login exited with code ${code}.`))
        return
      }

      settled = true
      clearTimeout(timeout)
      resolve(
        createProviderLoginResult(
          'claude',
          'Claude Code CLI',
          'Claude login finished. Check Claude again.',
          '',
          false
        )
      )
    })
  })
}

function getClaudeLoginArgs(loginMethod: ProviderConnectInput['loginMethod']): string[] {
  if (loginMethod === 'console') {
    return ['--console']
  }

  if (loginMethod === 'sso') {
    return ['--sso']
  }

  return ['--claudeai']
}

function parseClaudeAuthStatus(value: string): { loggedIn: boolean; accountLabel: string } {
  try {
    const parsed = JSON.parse(extractJsonObject(value)) as {
      loggedIn?: unknown
      authMethod?: unknown
      email?: unknown
      subscriptionType?: unknown
    }
    const loggedIn = parsed.loggedIn === true
    const subscription =
      typeof parsed.subscriptionType === 'string' && parsed.subscriptionType.trim()
        ? `Claude ${parsed.subscriptionType}`
        : ''
    const authMethod =
      typeof parsed.authMethod === 'string' && parsed.authMethod.trim()
        ? parsed.authMethod
        : 'Claude account'

    return {
      loggedIn,
      accountLabel: loggedIn ? subscription || authMethod : ''
    }
  } catch {
    const loggedIn = /logged\s*in|login method|email:/i.test(value)
    return {
      loggedIn,
      accountLabel: loggedIn ? firstLine(value) || 'Claude account' : ''
    }
  }
}

function extractClaudeAuthUrl(value: string): string {
  return extractTrustedHttpsUrl(value, (url) => {
    const host = url.hostname.toLowerCase()
    return (
      host === 'claude.ai' ||
      host.endsWith('.claude.ai') ||
      host === 'anthropic.com' ||
      host.endsWith('.anthropic.com')
    )
  })
}

function readClaudeAgentDraftOutput(value: string): unknown {
  try {
    return unwrapClaudeStructuredOutput(parseJsonFromCliOutput(value))
  } catch {
    throw new Error(`Claude returned an invalid agent draft: ${firstLine(value) || 'empty output'}`)
  }
}

function unwrapClaudeStructuredOutput(value: unknown): unknown {
  if (!isRecord(value)) {
    return value
  }

  const result = value.structured_output ?? value.result ?? value
  return typeof result === 'string' ? parseJsonFromCliOutput(result) : result
}
