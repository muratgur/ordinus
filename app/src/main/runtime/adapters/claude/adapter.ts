import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  AgentSandboxSchema,
  ProviderStatusSchema,
  type AgentDraft,
  type AgentSandbox,
  type OrchestrationPlan,
  type ProviderConnectInput,
  type ProviderConnectResult,
  type ProviderStatus,
  type WorkboardDraftPlan
} from '@shared/contracts'
import { buildRuntimeEnvironment } from '../../cli/environment'
import { findCliExecutable, withCliBaseArgs, type CliExecutable } from '../../cli/executable'
import { extractJsonObject, firstLine, isRecord, parseJsonFromCliOutput } from '../../cli/output'
import { runCapture } from '../../cli/process'
import { extractTrustedHttpsUrl } from '../../cli/url'
import { getSystemPaths } from '../../../paths'
import { materializeConnectors } from '../../../integrations/materialize'
import {
  AgentDraftOutputSchema,
  agentDraftOutputJsonSchema,
  buildAgentDraft,
  buildAgentDraftPrompt
} from '../../prompts/agent-draft'
import {
  buildOrchestrationPrompt,
  orchestrationPlanJsonSchema,
  parseOrchestrationPlan
} from '../../prompts/orchestration'
import {
  buildWorkboardPlanPrompt,
  parseWorkboardDraftPlan,
  workboardDraftPlanJsonSchema
} from '../../prompts/work-plan'
import {
  agentTurnOutcomeJsonSchema,
  buildConversationOutcomeInstructions,
  parseAgentTurnOutcome
} from '../../prompts/conversation-outcome'
import {
  buildAgentPrivateFolderInstructions,
  buildExtraDirectoriesInstructions,
  buildWorkspaceWorkingFolderInstructions
} from '../../prompts/workspace'
import {
  addCliModelArg,
  connectCliProvider,
  createProviderLoginResult,
  createProviderStatusBase,
  disconnectCliProvider,
  getCliVersion,
  getStringValue,
  isInvalidProviderSessionMessage,
  ProviderSessionInvalidError,
  readCliFailureMessage,
  runConversationProcess,
  scheduleLoginCleanup
} from '../shared'
import type {
  ProviderAdapter,
  ProviderLoginProcess,
  RuntimeAgentDraftInput,
  RuntimeOrchestrationPlanInput,
  RuntimeWorkboardPlanInput
} from '../types'
import type {
  ProviderRuntimeContext,
  RuntimeConversationTurnInput,
  RuntimeConversationTurnResult
} from '../types'
import type { RuntimeObservation } from '../../../observability/types'

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
  disconnectProvider(_input, context) {
    return disconnectClaudeProvider(context)
  },
  generateAgentDraft(input) {
    return generateClaudeAgentDraft(input)
  },
  generateOrchestrationPlan(input) {
    return generateClaudeOrchestrationPlan(input)
  },
  generateWorkboardPlan(input) {
    return generateClaudeWorkboardPlan(input)
  },
  sendConversationTurn(input, context) {
    return sendClaudeConversationTurn(input, context)
  }
}

async function disconnectClaudeProvider(context: ProviderRuntimeContext): Promise<ProviderStatus> {
  return disconnectCliProvider({
    providerId: 'claude',
    context,
    beforeRemoveAuth: logoutClaudeProvider,
    getAuthPaths: getClaudeAuthPaths,
    getStatus: getClaudeStatus
  })
}

async function logoutClaudeProvider(): Promise<void> {
  const executable = await findClaudeExecutable()
  if (!executable) {
    return
  }

  const result = await runCapture(
    executable.command,
    withCliBaseArgs(executable, ['auth', 'logout']),
    {
      env: getClaudeEnvironment(),
      shell: executable.shell,
      timeoutMs: 10_000
    }
  )

  if (result.code !== 0) {
    throw new Error(firstLine(result.stderr || result.stdout) || 'Claude logout failed.')
  }
}

function getClaudeAuthPaths(): string[] {
  const configDir = getClaudeConfigDir()

  return [join(configDir, '.claude.json'), join(configDir, 'backups')]
}

async function sendClaudeConversationTurn(
  input: RuntimeConversationTurnInput,
  context: ProviderRuntimeContext
): Promise<RuntimeConversationTurnResult> {
  const executable = await findClaudeExecutable()
  if (!executable) {
    throw new Error('Claude Code CLI was not found.')
  }

  const status = await getClaudeStatus(null)
  if (!status.connected) {
    throw new Error('Claude needs login before this conversation can run.')
  }

  const materialized = await materializeConnectors(input.connectors, input.agentHomePath)

  try {
    const args = buildClaudeConversationArgs(
      input,
      materialized.mcpConfigPath,
      materialized.allowedTools
    )
    const prompt = input.providerSessionRef
      ? buildClaudeResumePrompt(input)
      : buildClaudeConversationPrompt(input)
    const result = await runConversationProcess({
      executable,
      args,
      input,
      context,
      env: getClaudeEnvironment(),
      stdin: prompt,
      streamErrorMessage: 'Claude process streams could not be opened.',
      observeStdoutLine: observeClaudeStdoutLine
    })

    if (result.cancelled) {
      throw new Error('Conversation turn was cancelled.')
    }

    if (result.code !== 0) {
      const message = readCliFailureMessage({
        stdout: result.stdout,
        stderr: result.stderr,
        jsonFallbackKeys: ['result', 'message'],
        defaultMessage: 'Claude conversation turn failed.'
      })

      if (input.providerSessionRef && isInvalidProviderSessionMessage(message)) {
        throw new ProviderSessionInvalidError(message)
      }

      throw new Error(message)
    }

    const parsed = readClaudeConversationOutput(result.stdout)
    const providerSessionRef = parsed.sessionId || input.providerSessionRef || ''

    if (!providerSessionRef) {
      throw new Error('Claude did not provide a session reference for this conversation.')
    }

    writeFileSync(input.lastMessagePath, parsed.responseText, 'utf8')

    return {
      providerSessionRef,
      outcome: parseAgentTurnOutcome(readClaudeLastMessage(input.lastMessagePath)),
      logRef: input.logRef
    }
  } finally {
    materialized.cleanup()
  }
}

function buildClaudeConversationArgs(
  input: RuntimeConversationTurnInput,
  mcpConfigPath: string | null,
  allowedTools: string[]
): string[] {
  const args = [
    '-p',
    '--output-format',
    'stream-json',
    '--verbose',
    '--json-schema',
    JSON.stringify(agentTurnOutcomeJsonSchema),
    '--permission-mode',
    getClaudePermissionMode(input.sandbox),
    '--append-system-prompt-file',
    writeClaudeSystemPromptFile(input),
    '--add-dir',
    input.agentHomePath
  ]

  for (const dir of input.extraDirectories) {
    args.push('--add-dir', dir)
  }

  if (mcpConfigPath) {
    args.push('--mcp-config', mcpConfigPath)
  }

  if (allowedTools.length > 0) {
    args.push('--allowedTools', allowedTools.join(','))
  }

  if (input.providerSessionRef) {
    args.push('--resume', input.providerSessionRef)
  } else {
    args.push('--name', input.agentName)
  }

  addCliModelArg(args, input.model)

  return args
}

function getClaudePermissionMode(sandbox: AgentSandbox): string {
  const parsed = AgentSandboxSchema.parse(sandbox)

  if (parsed === 'read-only') {
    return 'plan'
  }

  if (parsed === 'workspace-write') {
    return 'acceptEdits'
  }

  return 'bypassPermissions'
}

function buildClaudeSystemPrompt(input: RuntimeConversationTurnInput): string {
  return [
    `You are ${input.agentName}.`,
    `Role: ${input.agentRole}`,
    '',
    'Follow these agent instructions for this Ordinus conversation:',
    input.instructions,
    '',
    buildWorkspaceWorkingFolderInstructions(input.workingRoot),
    '',
    buildAgentPrivateFolderInstructions(input.agentHomePath),
    '',
    buildExtraDirectoriesInstructions(input.extraDirectories),
    '',
    buildConversationOutcomeInstructions()
  ].join('\n')
}

function writeClaudeSystemPromptFile(input: RuntimeConversationTurnInput): string {
  const systemPromptPath = join(dirname(input.eventLogPath), 'system-prompt.txt')
  mkdirSync(dirname(systemPromptPath), { recursive: true })
  writeFileSync(systemPromptPath, buildClaudeSystemPrompt(input), 'utf8')
  return systemPromptPath
}

function buildClaudeConversationPrompt(input: RuntimeConversationTurnInput): string {
  return ['User message:', input.message].join('\n')
}

function buildClaudeResumePrompt(input: RuntimeConversationTurnInput): string {
  return [
    buildWorkspaceWorkingFolderInstructions(input.workingRoot),
    '',
    buildAgentPrivateFolderInstructions(input.agentHomePath),
    '',
    buildExtraDirectoriesInstructions(input.extraDirectories),
    '',
    buildConversationOutcomeInstructions(),
    '',
    'User message:',
    input.message
  ].join('\n')
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

  addCliModelArg(args, input.model, 1)

  const result = await runCapture(executable.command, withCliBaseArgs(executable, args), {
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

async function generateClaudeOrchestrationPlan(
  input: RuntimeOrchestrationPlanInput
): Promise<OrchestrationPlan> {
  const executable = await findClaudeExecutable()
  if (!executable) {
    throw new Error('Claude Code CLI was not found.')
  }

  const status = await getClaudeStatus(null)
  if (!status.connected) {
    throw new Error('Claude needs login before Ordinus can route messages with it.')
  }

  const args = [
    '-p',
    '--output-format',
    'json',
    '--json-schema',
    JSON.stringify(orchestrationPlanJsonSchema),
    '--no-session-persistence',
    '--permission-mode',
    'dontAsk'
  ]

  addCliModelArg(args, input.model, 1)

  const result = await runCapture(executable.command, withCliBaseArgs(executable, args), {
    cwd: input.workspaceRoot,
    env: getClaudeEnvironment(),
    shell: executable.shell,
    stdin: buildOrchestrationPrompt(input),
    timeoutMs: 90_000
  })

  if (result.code !== 0) {
    throw new Error(
      firstLine(result.stderr || result.stdout) || 'Claude could not route this message.'
    )
  }

  return parseOrchestrationPlan(readClaudeAgentDraftOutput(result.stdout))
}

async function generateClaudeWorkboardPlan(
  input: RuntimeWorkboardPlanInput
): Promise<WorkboardDraftPlan> {
  const executable = await findClaudeExecutable()
  if (!executable) {
    throw new Error('Claude Code CLI was not found.')
  }

  const status = await getClaudeStatus(null)
  if (!status.connected) {
    throw new Error('Claude needs login before Ordinus can prepare Work Requests with it.')
  }

  const args = [
    '-p',
    '--output-format',
    'json',
    '--json-schema',
    JSON.stringify(workboardDraftPlanJsonSchema),
    '--no-session-persistence',
    '--permission-mode',
    'dontAsk'
  ]

  addCliModelArg(args, input.model, 1)

  const result = await runCapture(executable.command, withCliBaseArgs(executable, args), {
    cwd: input.workspaceRoot,
    env: getClaudeEnvironment(),
    shell: executable.shell,
    stdin: buildWorkboardPlanPrompt(input),
    timeoutMs: 90_000
  })

  if (result.code !== 0) {
    throw new Error(
      firstLine(result.stderr || result.stdout) || 'Claude could not prepare this Work Request.'
    )
  }

  return parseWorkboardDraftPlan(readClaudeAgentDraftOutput(result.stdout))
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

    const authResult = await runCapture(
      executable.command,
      withCliBaseArgs(executable, ['auth', 'status']),
      {
        env,
        shell: executable.shell,
        timeoutMs: 10_000
      }
    )
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
  const configDir = getClaudeConfigDir()
  const appDataDir = join(configDir, 'AppData', 'Roaming')
  const localAppDataDir = join(configDir, 'AppData', 'Local')
  mkdirSync(appDataDir, { recursive: true })
  mkdirSync(localAppDataDir, { recursive: true })

  // HOME and USERPROFILE are inherited from the parent so the spawned CLI can
  // reach the OS credential store: macOS Keychain via $HOME/Library, Windows
  // DPAPI via %USERPROFILE%. On Linux, libsecret/gnome-keyring is keyed by
  // the DBus session bus rather than $HOME, and the runtime env allowlist
  // (cli/environment.ts) does not currently propagate DBus/XDG variables, so
  // the Claude CLI would still fall back to its non-keyring auth path on
  // Linux — macOS and Windows are fully covered, Linux is not.
  //
  // CLAUDE_CONFIG_DIR namespaces Claude's own keychain entry (the CLI hashes
  // the config dir path into the entry name), so Ordinus's session stays
  // isolated from a globally installed claude CLI without redirecting HOME.
  //
  // APPDATA / LOCALAPPDATA stay pointed inside the runtime sandbox as a
  // defensive measure on Windows: we do not enumerate which cache files the
  // CLI writes there, but if it follows Windows conventions for any of them,
  // sandboxing keeps them out of the user's normal profile.
  return buildRuntimeEnvironment({
    CLAUDE_CONFIG_DIR: configDir,
    APPDATA: appDataDir,
    LOCALAPPDATA: localAppDataDir
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
    const child = spawn(executable.command, withCliBaseArgs(executable, args), {
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
      host === 'claude.com' ||
      host.endsWith('.claude.com') ||
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

function observeClaudeStdoutLine(line: string): RuntimeObservation[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    return []
  }

  if (!isRecord(parsed)) {
    return []
  }

  const type = getStringValue(parsed.type)
  if (type === 'system') {
    return observeClaudeSystemEvent(parsed)
  }

  if (type === 'assistant') {
    return observeClaudeAssistantEvent(parsed)
  }

  if (type === 'user') {
    return observeClaudeUserEvent(parsed)
  }

  if (type === 'result') {
    return [
      claudeObservation({
        kind: 'message',
        phase: 'running',
        summary: 'Claude returned a result.'
      })
    ]
  }

  return []
}

function observeClaudeSystemEvent(event: Record<string, unknown>): RuntimeObservation[] {
  const subtype = getStringValue(event.subtype)
  if (subtype !== 'init') {
    return []
  }

  return [
    claudeObservation({
      kind: 'status',
      phase: 'starting',
      summary: 'Claude session started.',
      payload: {
        sessionId: getStringValue(event.session_id),
        model: getStringValue(event.model)
      }
    })
  ]
}

function observeClaudeAssistantEvent(event: Record<string, unknown>): RuntimeObservation[] {
  const message = isRecord(event.message) ? event.message : null
  const content = Array.isArray(message?.content) ? message.content : []
  const observations: RuntimeObservation[] = []
  let hasText = false

  for (const item of content) {
    if (!isRecord(item)) {
      continue
    }

    const itemType = getStringValue(item.type)
    if (itemType === 'text' && getStringValue(item.text).trim()) {
      hasText = true
      continue
    }

    if (itemType !== 'tool_use') {
      continue
    }

    const name = getStringValue(item.name)
    const input = isRecord(item.input) ? item.input : {}
    const label = getClaudeToolLabel(name, input)
    const phase = getClaudeToolPhase(name, label)
    const isCommand = isClaudeCommandTool(name)

    observations.push(
      claudeObservation({
        kind: isCommand ? 'command' : 'tool',
        phase,
        summary: label
          ? `${isCommand ? 'Running command' : 'Using tool'}: ${label}`
          : isCommand
            ? 'Running command.'
            : 'Using tool.',
        payload: {
          id: getStringValue(item.id),
          name,
          label
        }
      })
    )
  }

  if (hasText && observations.length === 0) {
    observations.push(
      claudeObservation({
        kind: 'message',
        phase: 'running',
        summary: 'Claude is preparing a response.'
      })
    )
  }

  return observations
}

function observeClaudeUserEvent(event: Record<string, unknown>): RuntimeObservation[] {
  const message = isRecord(event.message) ? event.message : null
  const content = Array.isArray(message?.content) ? message.content : []
  const observations: RuntimeObservation[] = []

  for (const item of content) {
    if (!isRecord(item) || getStringValue(item.type) !== 'tool_result') {
      continue
    }

    observations.push(
      claudeObservation({
        kind: 'tool',
        phase: 'running',
        summary: 'Tool completed.',
        payload: {
          toolUseId: getStringValue(item.tool_use_id),
          isError: item.is_error === true
        }
      })
    )
  }

  return observations
}

function claudeObservation(
  event: Pick<RuntimeObservation, 'kind' | 'phase' | 'summary'> &
    Pick<Partial<RuntimeObservation>, 'payload'>
): RuntimeObservation {
  return {
    source: 'provider',
    confidence: 'reported',
    lifecycleStatus: 'running',
    ...event
  }
}

function getClaudeToolLabel(name: string, input: Record<string, unknown>): string {
  const detail =
    getStringValue(input.command) ||
    getStringValue(input.file_path) ||
    getStringValue(input.path) ||
    getStringValue(input.pattern) ||
    getStringValue(input.url) ||
    getStringValue(input.description)

  return [name, detail].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().slice(0, 180)
}

function getClaudeToolPhase(name: string, label: string): RuntimeObservation['phase'] {
  const normalized = `${name} ${label}`.toLowerCase()
  if (
    normalized.includes('read') ||
    normalized.includes('grep') ||
    normalized.includes('glob') ||
    normalized.includes('ls') ||
    normalized.includes('search') ||
    normalized.includes('fetch')
  ) {
    return 'reading'
  }

  if (
    normalized.includes('write') ||
    normalized.includes('edit') ||
    normalized.includes('patch') ||
    normalized.includes('update')
  ) {
    return 'editing'
  }

  return 'running'
}

function isClaudeCommandTool(name: string): boolean {
  return name.toLowerCase() === 'bash'
}

function unwrapClaudeStructuredOutput(value: unknown): unknown {
  if (!isRecord(value)) {
    return value
  }

  const result = value.structured_output ?? value.result ?? value
  return typeof result === 'string' ? parseJsonFromCliOutput(result) : result
}

function readClaudeConversationOutput(value: string): { sessionId: string; responseText: string } {
  const parsed = readClaudeConversationResult(value)

  if (!isRecord(parsed)) {
    throw new Error('Claude returned an invalid conversation response.')
  }

  const sessionId = getStringValue(parsed.session_id) || getStringValue(parsed.sessionId)
  const structured = unwrapClaudeStructuredOutput(parsed)
  const responseText =
    typeof structured === 'string'
      ? structured
      : getStringValue(parsed.response) ||
        getStringValue(parsed.message) ||
        JSON.stringify(structured)
  const isError = parsed.is_error === true

  if (isError) {
    throw new Error(firstLine(responseText) || 'Claude conversation turn failed.')
  }

  if (!responseText.trim()) {
    throw new Error('Claude returned an empty conversation response.')
  }

  return {
    sessionId,
    responseText: responseText.trim()
  }
}

function readClaudeConversationResult(value: string): unknown {
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

    if (isRecord(parsed) && getStringValue(parsed.type) === 'result') {
      return parsed
    }
  }

  return parseJsonFromCliOutput(value)
}

function readClaudeLastMessage(outputPath: string): string {
  if (!existsSync(outputPath)) {
    throw new Error('Claude did not write a conversation response.')
  }

  return readFileSync(outputPath, 'utf8').trim()
}
