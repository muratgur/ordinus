import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  AgentSandboxSchema,
  ProviderStatusSchema,
  type AgentDraft,
  type AgentSkillDraft,
  type AgentSandbox,
  type OrchestrationPlan,
  type ProviderConnectResult,
  type ProviderStatus,
  type WorkboardDraftPlan
} from '@shared/contracts'
import { buildRuntimeEnvironment } from '../../cli/environment'
import {
  findCliExecutable,
  getCliSiblingNodeModuleScript,
  withCliBaseArgs,
  type CliExecutable
} from '../../cli/executable'
import { firstLine, isRecord, parseJsonFromCliOutput } from '../../cli/output'
import { runCapture } from '../../cli/process'
import { extractTrustedHttpsUrl } from '../../cli/url'
import { getSystemPaths } from '../../../paths'
import type { ProviderUsageReport } from '../../../observability/types'
import { materializeGeminiConnectors } from '../../../integrations/materialize'
import { listSkillsForPrompt } from '../../../agents/filesystem'
import {
  AgentDraftOutputSchema,
  buildAgentDraft,
  buildAgentDraftPrompt
} from '../../prompts/agent-draft'
import {
  buildSkillDraft,
  buildSkillDraftPrompt,
  SkillDraftOutputSchema
} from '../../prompts/skill-draft'
import { buildOrchestrationPrompt, parseOrchestrationPlan } from '../../prompts/orchestration'
import { buildWorkboardPlanPrompt, parseWorkboardDraftPlan } from '../../prompts/work-plan'
import {
  buildConversationOutcomeInstructions,
  buildResumeReminderInstructions,
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
  scheduleLoginCleanup,
  stopProviderLoginProcess
} from '../shared'
import type {
  ProviderAdapter,
  ProviderLoginProcess,
  ProviderRuntimeContext,
  RuntimeAgentDraftInput,
  RuntimeSkillDraftInput,
  RuntimeConversationTurnInput,
  RuntimeConversationTurnResult,
  RuntimeOrchestrationPlanInput,
  RuntimeWorkboardPlanInput
} from '../types'

const geminiAuthEnvKeys = [
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'GOOGLE_GENAI_USE_VERTEXAI',
  'GOOGLE_CLOUD_PROJECT',
  'GOOGLE_CLOUD_LOCATION',
  'GOOGLE_APPLICATION_CREDENTIALS'
] as const

const ignoredGeminiDiagnosticPatterns = [/^Warning: 256-color support not detected\./]

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
  disconnectProvider(_input, context) {
    return disconnectGeminiProvider(context)
  },
  generateAgentDraft(input) {
    return generateGeminiAgentDraft(input)
  },
  generateSkillDraft(input) {
    return generateGeminiSkillDraft(input)
  },
  generateOrchestrationPlan(input) {
    return generateGeminiOrchestrationPlan(input)
  },
  generateWorkboardPlan(input) {
    return generateGeminiWorkboardPlan(input)
  },
  sendConversationTurn(input, context) {
    return sendGeminiConversationTurn(input, context)
  }
}

async function disconnectGeminiProvider(context: ProviderRuntimeContext): Promise<ProviderStatus> {
  return disconnectCliProvider({
    providerId: 'gemini',
    context,
    getAuthPaths: getGeminiAuthPaths,
    getStatus: getGeminiStatus
  })
}

function getGeminiAuthPaths(): string[] {
  const configDir = getGeminiConfigDir()

  return [join(configDir, 'oauth_creds.json'), join(configDir, 'google_accounts.json')]
}

async function sendGeminiConversationTurn(
  input: RuntimeConversationTurnInput,
  context: ProviderRuntimeContext
): Promise<RuntimeConversationTurnResult> {
  const executable = await findGeminiExecutable()
  if (!executable) {
    throw new Error('Gemini CLI was not found.')
  }

  const status = await getGeminiStatus(null)
  if (!status.connected) {
    throw new Error('Gemini needs login before this conversation can run.')
  }

  // ADR-040: hand the canonical skills folder to the turn-private home so
  // Gemini discovers it natively as user-tier skills.
  const agentSkills = listSkillsForPrompt(input.agentHomePath)
  const connectors = await materializeGeminiConnectors(
    input.connectors,
    getGeminiConfigDir(),
    join(input.agentHomePath, '.ordinus-gemini', input.turnId),
    input.additionalMcpServers,
    agentSkills.length > 0 ? join(input.agentHomePath, 'skills') : null
  )

  try {
    const args = buildGeminiConversationArgs(input)
    const prompt = input.providerSessionRef
      ? buildGeminiResumePrompt(input)
      : buildGeminiConversationPrompt(input)
    const result = await runConversationProcess({
      executable,
      args,
      input,
      context,
      env: connectors.home
        ? { ...getGeminiEnvironment(), GEMINI_CLI_HOME: connectors.home }
        : getGeminiEnvironment(),
      stdin: prompt,
      streamErrorMessage: 'Gemini process streams could not be opened.'
    })

    if (result.cancelled) {
      throw new Error('Conversation turn was cancelled.')
    }

    if (result.code !== 0) {
      const message = readCliFailureMessage({
        stdout: result.stdout,
        stderr: result.stderr,
        jsonFallbackKeys: ['result', 'response', 'message'],
        ignoredDiagnosticPatterns: ignoredGeminiDiagnosticPatterns,
        defaultMessage: 'Gemini conversation turn failed.'
      })

      if (input.providerSessionRef && isInvalidProviderSessionMessage(message)) {
        throw new ProviderSessionInvalidError(message)
      }

      throw new Error(message)
    }

    const parsed = readGeminiConversationOutput(result.stdout)
    const providerSessionRef = parsed.sessionId || input.providerSessionRef || ''

    if (!providerSessionRef) {
      throw new Error('Gemini did not provide a session reference for this conversation.')
    }

    // ADR-037: Gemini reports per-invocation usage in the final JSON stats
    // block (no streaming usage events), so it is recorded post-parse.
    if (parsed.usage) {
      input.observability?.record({
        kind: 'status',
        source: 'provider',
        confidence: 'reported',
        phase: 'running',
        summary: 'Gemini reported token usage.',
        sessionRef: providerSessionRef,
        usage: parsed.usage
      })
    }

    writeFileSync(input.lastMessagePath, parsed.responseText, 'utf8')

    return {
      providerSessionRef,
      outcome: parseAgentTurnOutcome(readGeminiLastMessage(input.lastMessagePath)),
      logRef: input.logRef
    }
  } finally {
    connectors.cleanup()
  }
}

function buildGeminiConversationArgs(input: RuntimeConversationTurnInput): string[] {
  const args = [
    '--skip-trust',
    '--approval-mode',
    getGeminiApprovalMode(input.sandbox),
    '--output-format',
    'json',
    '--include-directories',
    [input.agentHomePath, ...input.extraDirectories].join(',')
  ]

  if (input.providerSessionRef) {
    args.push('--resume', input.providerSessionRef)
  }

  addCliModelArg(args, input.model, 0)

  return args
}

function getGeminiApprovalMode(sandbox: AgentSandbox): string {
  const parsed = AgentSandboxSchema.parse(sandbox)

  if (parsed === 'read-only') {
    return 'plan'
  }

  if (parsed === 'workspace-write') {
    return 'auto_edit'
  }

  return 'yolo'
}

function buildGeminiConversationPrompt(input: RuntimeConversationTurnInput): string {
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
    buildConversationOutcomeInstructions(),
    '',
    'User message:',
    input.message
  ].join('\n')
}

function buildGeminiResumePrompt(input: RuntimeConversationTurnInput): string {
  // ADR-037: the resumed session already holds the full rules from its first
  // turn; the outcome shape is enforced by the JSON output contract regardless.
  return [buildResumeReminderInstructions(), '', 'User message:', input.message].join('\n')
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

    addCliModelArg(args, input.model, 0)

    const result = await runCapture(executable.command, withCliBaseArgs(executable, args), {
      cwd: tempDir,
      env: getGeminiEnvironment(),
      shell: executable.shell,
      timeoutMs: 90_000
    })

    if (result.code !== 0) {
      throw new Error(
        readCliFailureMessage({
          stdout: result.stdout,
          stderr: result.stderr,
          ignoredDiagnosticPatterns: ignoredGeminiDiagnosticPatterns,
          defaultMessage: 'Gemini could not draft the agent.'
        })
      )
    }

    const draftJson = AgentDraftOutputSchema.parse(readGeminiAgentDraftOutput(result.stdout))

    return buildAgentDraft(input, draftJson)
  } finally {
    rmSync(tempDir, { force: true, recursive: true })
  }
}

// ADR-040: one-shot skill draft by the owning agent — same invocation shape as
// the agent draft, different prompt/schema.
async function generateGeminiSkillDraft(input: RuntimeSkillDraftInput): Promise<AgentSkillDraft> {
  const executable = await findGeminiExecutable()
  if (!executable) {
    throw new Error('Gemini CLI was not found.')
  }

  const status = await getGeminiStatus(null)
  if (!status.connected) {
    throw new Error('Gemini needs login before Ordinus can draft skills with it.')
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'ordinus-gemini-skill-draft-'))

  try {
    const args = [
      '--skip-trust',
      '--approval-mode',
      'plan',
      '--output-format',
      'json',
      '--prompt',
      buildSkillDraftPrompt(input)
    ]

    addCliModelArg(args, input.model, 0)

    const result = await runCapture(executable.command, withCliBaseArgs(executable, args), {
      cwd: tempDir,
      env: getGeminiEnvironment(),
      shell: executable.shell,
      timeoutMs: 90_000
    })

    if (result.code !== 0) {
      throw new Error(
        readCliFailureMessage({
          stdout: result.stdout,
          stderr: result.stderr,
          ignoredDiagnosticPatterns: ignoredGeminiDiagnosticPatterns,
          defaultMessage: 'Gemini could not draft the skill.'
        })
      )
    }

    return buildSkillDraft(SkillDraftOutputSchema.parse(readGeminiAgentDraftOutput(result.stdout)))
  } finally {
    rmSync(tempDir, { force: true, recursive: true })
  }
}

async function generateGeminiOrchestrationPlan(
  input: RuntimeOrchestrationPlanInput
): Promise<OrchestrationPlan> {
  const executable = await findGeminiExecutable()
  if (!executable) {
    throw new Error('Gemini CLI was not found.')
  }

  const status = await getGeminiStatus(null)
  if (!status.connected) {
    throw new Error('Gemini needs login before Ordinus can route messages with it.')
  }

  const args = [
    '--skip-trust',
    '--approval-mode',
    'plan',
    '--output-format',
    'json',
    '--prompt',
    buildOrchestrationPrompt(input)
  ]

  addCliModelArg(args, input.model, 0)

  const result = await runCapture(executable.command, withCliBaseArgs(executable, args), {
    cwd: input.workspaceRoot,
    env: getGeminiEnvironment(),
    shell: executable.shell,
    timeoutMs: 90_000
  })

  if (result.code !== 0) {
    throw new Error(
      readCliFailureMessage({
        stdout: result.stdout,
        stderr: result.stderr,
        ignoredDiagnosticPatterns: ignoredGeminiDiagnosticPatterns,
        defaultMessage: 'Gemini could not route this message.'
      })
    )
  }

  return parseOrchestrationPlan(readGeminiAgentDraftOutput(result.stdout))
}

async function generateGeminiWorkboardPlan(
  input: RuntimeWorkboardPlanInput
): Promise<WorkboardDraftPlan> {
  const executable = await findGeminiExecutable()
  if (!executable) {
    throw new Error('Gemini CLI was not found.')
  }

  const status = await getGeminiStatus(null)
  if (!status.connected) {
    throw new Error('Gemini needs login before Ordinus can prepare Work Requests with it.')
  }

  const args = [
    '--skip-trust',
    '--approval-mode',
    'plan',
    '--output-format',
    'json',
    '--prompt',
    buildWorkboardPlanPrompt(input)
  ]

  addCliModelArg(args, input.model, 0)

  const result = await runCapture(executable.command, withCliBaseArgs(executable, args), {
    cwd: input.workspaceRoot,
    env: getGeminiEnvironment(),
    shell: executable.shell,
    timeoutMs: 90_000
  })

  if (result.code !== 0) {
    throw new Error(
      readCliFailureMessage({
        stdout: result.stdout,
        stderr: result.stderr,
        ignoredDiagnosticPatterns: ignoredGeminiDiagnosticPatterns,
        defaultMessage: 'Gemini could not prepare this Work Request.'
      })
    )
  }

  return parseWorkboardDraftPlan(readGeminiAgentDraftOutput(result.stdout))
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
  return findCliExecutable('gemini', 'GEMINI_BIN', {
    prefixBinDir: getSystemPaths().cliBin,
    nodeScriptCandidates: (executable) => [
      getCliSiblingNodeModuleScript(executable, ['@google', 'gemini-cli'], ['bundle', 'gemini.js'])
    ]
  })
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

// ADR-037 — Gemini reports PER-INVOCATION usage under stats.models.<model>.
// tokens. Values are summed across models (the CLI may route through a
// utility model plus the main model in one invocation). `prompt` includes
// cached tokens; output = candidates + thoughts + tool.
function readGeminiUsage(parsed: Record<string, unknown>): ProviderUsageReport | undefined {
  const stats = isRecord(parsed.stats) ? parsed.stats : null
  const models = stats && isRecord(stats.models) ? stats.models : null
  if (!models) {
    return undefined
  }

  let inputTokens = 0
  let cachedInputTokens = 0
  let outputTokens = 0
  let totalTokens = 0
  let found = false

  for (const model of Object.values(models)) {
    const tokens = isRecord(model) && isRecord(model.tokens) ? model.tokens : null
    if (!tokens) {
      continue
    }
    found = true
    inputTokens += readGeminiTokenCount(tokens.prompt ?? tokens.input)
    cachedInputTokens += readGeminiTokenCount(tokens.cached)
    outputTokens +=
      readGeminiTokenCount(tokens.candidates) +
      readGeminiTokenCount(tokens.thoughts) +
      readGeminiTokenCount(tokens.tool)
    totalTokens += readGeminiTokenCount(tokens.total)
  }

  if (!found) {
    return undefined
  }

  return {
    semantics: 'invocation',
    inputTokens,
    cachedInputTokens,
    outputTokens,
    totalTokens: totalTokens > 0 ? totalTokens : undefined
  }
}

function readGeminiTokenCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0
}

function readGeminiConversationOutput(value: string): {
  sessionId: string
  responseText: string
  usage?: ProviderUsageReport
} {
  const parsed = parseJsonFromCliOutput(value)

  if (!isRecord(parsed)) {
    throw new Error('Gemini returned an invalid conversation response.')
  }

  const error = isRecord(parsed.error) ? parsed.error : null
  if (error) {
    const message = getStringValue(error.message) || 'Gemini conversation turn failed.'
    throw new Error(message)
  }

  const sessionId = getStringValue(parsed.session_id) || getStringValue(parsed.sessionId)
  const responseValue = parsed.response ?? parsed.result ?? parsed.message
  const responseText =
    typeof responseValue === 'string'
      ? responseValue
      : responseValue
        ? JSON.stringify(responseValue)
        : ''

  if (!responseText.trim()) {
    throw new Error('Gemini returned an empty conversation response.')
  }

  return {
    sessionId,
    responseText: responseText.trim(),
    usage: readGeminiUsage(parsed)
  }
}

function readGeminiLastMessage(outputPath: string): string {
  if (!existsSync(outputPath)) {
    throw new Error('Gemini did not write a conversation response.')
  }

  return readFileSync(outputPath, 'utf8').trim()
}
