import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  ProviderStatusSchema,
  type AgentDraft,
  type OrchestrationPlan,
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
import { materializeCodexConnectors } from '../../../integrations/materialize'
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
  RuntimeAgentDraftInput,
  RuntimeConversationTurnInput,
  RuntimeConversationTurnResult,
  RuntimeOrchestrationPlanInput,
  RuntimeWorkboardPlanInput,
  ProviderRuntimeContext
} from '../types'
import type { RuntimeObservation } from '../../../observability/types'

export const codexProviderAdapter: ProviderAdapter = {
  id: 'codex',
  label: 'Codex CLI',
  getStatus(context) {
    return getCodexStatus(context.loginProcesses.get('codex') ?? null)
  },
  connectProvider(_input, context) {
    return connectCliProvider({
      loginProcess: context.loginProcesses.get('codex') ?? null,
      getStatus: getCodexStatus,
      findExecutable: findCodexExecutable,
      missingCliError: 'Codex CLI was not found.',
      setLoginProcess: (process) => context.loginProcesses.set('codex', process),
      clearLoginProcess: () => context.loginProcesses.delete('codex'),
      startLogin: startCodexLogin
    })
  },
  disconnectProvider(_input, context) {
    return disconnectCodexProvider(context)
  },
  generateAgentDraft(input) {
    return generateCodexAgentDraft(input)
  },
  generateOrchestrationPlan(input) {
    return generateCodexOrchestrationPlan(input)
  },
  generateWorkboardPlan(input) {
    return generateCodexWorkboardPlan(input)
  },
  sendConversationTurn(input, context) {
    return sendCodexConversationTurn(input, context)
  }
}

async function disconnectCodexProvider(context: ProviderRuntimeContext): Promise<ProviderStatus> {
  return disconnectCliProvider({
    providerId: 'codex',
    context,
    getAuthPaths: getCodexAuthPaths,
    getStatus: getCodexStatus
  })
}

function getCodexAuthPaths(): string[] {
  return [join(getCodexHome(), 'auth.json')]
}

async function sendCodexConversationTurn(
  input: RuntimeConversationTurnInput,
  context: ProviderRuntimeContext
): Promise<RuntimeConversationTurnResult> {
  const executable = await findCodexExecutable()
  if (!executable) {
    throw new Error('Codex CLI was not found.')
  }

  const connectors = await materializeCodexConnectors(input.connectors)
  const args = buildCodexConversationArgs(input)
  if (connectors.configArgs.length > 0) {
    args.splice(1, 0, ...connectors.configArgs)
  }
  const prompt = input.providerSessionRef
    ? buildCodexResumePrompt(input)
    : buildCodexConversationPrompt(input)
  const result = await runConversationProcess({
    executable,
    args,
    input,
    context,
    env: { ...getCodexEnvironment(), ...connectors.env },
    stdin: prompt,
    streamErrorMessage: 'Codex process streams could not be opened.',
    observeStdoutLine: observeCodexStdoutLine
  })

  if (result.cancelled) {
    throw new Error('Conversation turn was cancelled.')
  }

  if (result.code !== 0) {
    const message = readCliFailureMessage({
      stdout: result.stdout,
      stderr: result.stderr,
      ignoredJsonEventTypes: ['thread.started'],
      defaultMessage: 'Codex exited before returning a Work Item result.'
    })

    if (input.providerSessionRef && isInvalidProviderSessionMessage(message)) {
      throw new ProviderSessionInvalidError(message)
    }

    throw new Error(message)
  }

  const providerSessionRef = extractCodexSessionRef(result.stdout) || input.providerSessionRef || ''

  if (!providerSessionRef) {
    throw new Error('Codex did not provide a session reference for this conversation.')
  }

  return {
    providerSessionRef,
    outcome: parseAgentTurnOutcome(readCodexLastMessage(input.lastMessagePath)),
    logRef: input.logRef
  }
}

function buildCodexExtraWritableRootsArgs(extraDirectories: string[]): string[] {
  if (extraDirectories.length === 0) {
    return []
  }
  return ['-c', `sandbox_workspace_write.writable_roots=${JSON.stringify(extraDirectories)}`]
}

function buildCodexConversationArgs(input: RuntimeConversationTurnInput): string[] {
  if (input.providerSessionRef) {
    const args = [
      'exec',
      '--sandbox',
      input.sandbox,
      '-C',
      input.workspaceRoot,
      '--add-dir',
      input.agentHomePath,
      ...input.extraDirectories.flatMap((dir) => ['--add-dir', dir]),
      ...buildCodexExtraWritableRootsArgs(input.extraDirectories),
      'resume',
      input.providerSessionRef,
      '-',
      '--json',
      '--skip-git-repo-check',
      '--output-last-message',
      input.lastMessagePath
    ]

    addCliModelArg(args, input.model)

    return args
  }

  const schemaPath = writeCodexConversationOutcomeSchema(input)
  const args = [
    'exec',
    '--json',
    '-',
    '--skip-git-repo-check',
    '--sandbox',
    input.sandbox,
    '-C',
    input.workspaceRoot,
    '--add-dir',
    input.agentHomePath,
    ...input.extraDirectories.flatMap((dir) => ['--add-dir', dir]),
    ...buildCodexExtraWritableRootsArgs(input.extraDirectories),
    '--output-schema',
    schemaPath,
    '--output-last-message',
    input.lastMessagePath
  ]

  addCliModelArg(args, input.model)

  return args
}

function buildCodexConversationPrompt(input: RuntimeConversationTurnInput): string {
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

function buildCodexResumePrompt(input: RuntimeConversationTurnInput): string {
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

function writeCodexConversationOutcomeSchema(input: RuntimeConversationTurnInput): string {
  const schemaPath = join(dirname(input.eventLogPath), 'conversation-outcome.schema.json')
  mkdirSync(dirname(schemaPath), { recursive: true })
  writeFileSync(schemaPath, JSON.stringify(agentTurnOutcomeJsonSchema, null, 2), 'utf8')
  return schemaPath
}

async function generateCodexAgentDraft(input: RuntimeAgentDraftInput): Promise<AgentDraft> {
  const executable = await findCodexExecutable()
  if (!executable) {
    throw new Error('Codex CLI was not found.')
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'ordinus-agent-draft-'))
  const schemaPath = join(tempDir, 'agent-draft.schema.json')
  const outputPath = join(tempDir, 'agent-draft.json')

  try {
    writeFileSync(schemaPath, JSON.stringify(agentDraftOutputJsonSchema, null, 2), 'utf8')

    const args = [
      'exec',
      '--skip-git-repo-check',
      '--ephemeral',
      '--ignore-rules',
      '--sandbox',
      'read-only',
      '-C',
      tempDir,
      '--output-schema',
      schemaPath,
      '--output-last-message',
      outputPath
    ]

    addCliModelArg(args, input.model)

    const result = await runCapture(executable.command, withCliBaseArgs(executable, args), {
      env: getCodexEnvironment(),
      shell: executable.shell,
      stdin: buildAgentDraftPrompt(input.requestedWork),
      timeoutMs: 90_000
    })

    if (result.code !== 0) {
      throw new Error(
        firstLine(result.stderr || result.stdout) || 'Codex could not draft the agent.'
      )
    }

    const draftJson = AgentDraftOutputSchema.parse(readAgentDraftOutput(outputPath))

    return buildAgentDraft(input, draftJson)
  } finally {
    rmSync(tempDir, { force: true, recursive: true })
  }
}

async function generateCodexOrchestrationPlan(
  input: RuntimeOrchestrationPlanInput
): Promise<OrchestrationPlan> {
  const executable = await findCodexExecutable()
  if (!executable) {
    throw new Error('Codex CLI was not found.')
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'ordinus-orchestrator-'))
  const schemaPath = join(tempDir, 'orchestration-plan.schema.json')
  const outputPath = join(tempDir, 'orchestration-plan.json')

  try {
    writeFileSync(schemaPath, JSON.stringify(orchestrationPlanJsonSchema, null, 2), 'utf8')

    const args = [
      'exec',
      '--skip-git-repo-check',
      '--ephemeral',
      '--ignore-rules',
      '--sandbox',
      'read-only',
      '-C',
      input.workspaceRoot,
      '--output-schema',
      schemaPath,
      '--output-last-message',
      outputPath
    ]

    addCliModelArg(args, input.model)

    const result = await runCapture(executable.command, withCliBaseArgs(executable, args), {
      env: getCodexEnvironment(),
      shell: executable.shell,
      stdin: buildOrchestrationPrompt(input),
      timeoutMs: 90_000
    })

    if (result.code !== 0) {
      throw new Error(
        firstLine(result.stderr || result.stdout) || 'Codex could not route this message.'
      )
    }

    return parseOrchestrationPlan(parseJsonFromCliOutput(readFileSync(outputPath, 'utf8')))
  } finally {
    rmSync(tempDir, { force: true, recursive: true })
  }
}

async function generateCodexWorkboardPlan(
  input: RuntimeWorkboardPlanInput
): Promise<WorkboardDraftPlan> {
  const executable = await findCodexExecutable()
  if (!executable) {
    throw new Error('Codex CLI was not found.')
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'ordinus-workboard-'))
  const schemaPath = join(tempDir, 'workboard-plan.schema.json')
  const outputPath = join(tempDir, 'workboard-plan.json')

  try {
    writeFileSync(schemaPath, JSON.stringify(workboardDraftPlanJsonSchema, null, 2), 'utf8')

    const args = [
      'exec',
      '--skip-git-repo-check',
      '--ephemeral',
      '--ignore-rules',
      '--sandbox',
      'read-only',
      '-C',
      input.workspaceRoot,
      '--output-schema',
      schemaPath,
      '--output-last-message',
      outputPath
    ]

    addCliModelArg(args, input.model)

    const result = await runCapture(executable.command, withCliBaseArgs(executable, args), {
      env: getCodexEnvironment(),
      shell: executable.shell,
      stdin: buildWorkboardPlanPrompt(input),
      timeoutMs: 90_000
    })

    if (result.code !== 0) {
      throw new Error(
        firstLine(result.stderr || result.stdout) || 'Codex could not prepare this Work Request.'
      )
    }

    return parseWorkboardDraftPlan(parseJsonFromCliOutput(readFileSync(outputPath, 'utf8')))
  } finally {
    rmSync(tempDir, { force: true, recursive: true })
  }
}

async function getCodexStatus(loginProcess: ProviderLoginProcess | null): Promise<ProviderStatus> {
  const executable = await findCodexExecutable()
  const base = createProviderStatusBase({
    id: 'codex',
    label: 'Codex CLI',
    executable,
    loginProcess
  })

  if (!executable) {
    return ProviderStatusSchema.parse({
      ...base,
      lastError: 'Install Codex CLI or make it available on PATH.',
      note: 'Not detected.'
    })
  }

  try {
    const env = getCodexEnvironment()
    const version = await getCliVersion(executable, env)

    const authResult = await runCapture(
      executable.command,
      withCliBaseArgs(executable, ['login', 'status']),
      {
        env,
        shell: executable.shell,
        timeoutMs: 10_000
      }
    )
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
  writeFileSync(join(codexHome, 'config.toml'), buildCodexConfigToml(), 'utf8')
  return codexHome
}

function buildCodexConfigToml(): string {
  const lines = ['# Generated by Ordinus.']

  if (process.platform === 'win32') {
    lines.push('', '[windows]', 'sandbox = "elevated"')
  }

  return `${lines.join('\n')}\n`
}

function getCodexEnvironment(): NodeJS.ProcessEnv {
  return buildRuntimeEnvironment({
    CODEX_HOME: getCodexHome()
  })
}

function findCodexExecutable(): Promise<CliExecutable | null> {
  return findCliExecutable('codex', 'CODEX_BIN')
}

function startCodexLogin(
  executable: CliExecutable,
  setProcess: (process: ProviderLoginProcess) => void
): Promise<ProviderConnectResult> {
  return new Promise((resolve, reject) => {
    let settled = false
    let output = ''
    const child = spawn(executable.command, withCliBaseArgs(executable, ['login']), {
      cwd: getSystemPaths().userData,
      env: getCodexEnvironment(),
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
      settled = true
      stopProviderLoginProcess(loginProcess)
      reject(new Error('Codex login did not provide an auth URL.'))
    }, 15_000)

    const finish = (value: ProviderConnectResult): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve(value)
    }

    const onData = (chunk: Buffer): void => {
      output += chunk.toString()
      const authUrl = extractCodexAuthUrl(output)
      if (!authUrl || loginProcess.authUrl) return

      loginProcess.authUrl = authUrl
      scheduleLoginCleanup(loginProcess)
      finish(createProviderLoginResult('codex', 'Codex CLI', 'Waiting for browser login.', authUrl))
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

function extractCodexAuthUrl(value: string): string {
  return extractTrustedHttpsUrl(value, (url) => url.hostname === 'auth.openai.com')
}

function readAgentDraftOutput(outputPath: string): unknown {
  if (!existsSync(outputPath)) {
    throw new Error('Codex did not write an agent draft.')
  }

  try {
    return JSON.parse(extractJsonObject(readFileSync(outputPath, 'utf8')))
  } catch {
    throw new Error('Codex returned an invalid agent draft.')
  }
}

function readCodexLastMessage(outputPath: string): string {
  if (!existsSync(outputPath)) {
    throw new Error('Codex did not write a conversation response.')
  }

  return readFileSync(outputPath, 'utf8').trim()
}

function extractCodexSessionRef(value: string): string {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  for (const line of lines) {
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      continue
    }

    if (getEventType(parsed) !== 'thread.started') {
      continue
    }

    const directCandidate =
      getStringPath(parsed, ['thread_id']) ||
      getStringPath(parsed, ['threadId']) ||
      getStringPath(parsed, ['session_id']) ||
      getStringPath(parsed, ['sessionId']) ||
      getStringPath(parsed, ['payload', 'thread_id']) ||
      getStringPath(parsed, ['payload', 'threadId']) ||
      getStringPath(parsed, ['payload', 'session_id']) ||
      getStringPath(parsed, ['payload', 'sessionId']) ||
      getStringPath(parsed, ['payload', 'id'])

    if (directCandidate) {
      return directCandidate
    }

    const nestedCandidate = findSessionLikeString(parsed)
    if (nestedCandidate) {
      return nestedCandidate
    }
  }

  return ''
}

function observeCodexStdoutLine(line: string): RuntimeObservation[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    return []
  }

  const type = getEventType(parsed)
  if (type === 'thread.started') {
    return [
      codexObservation({ kind: 'status', phase: 'starting', summary: 'Codex session started.' })
    ]
  }

  if (type === 'turn.started') {
    return [codexObservation({ kind: 'phase', phase: 'running', summary: 'Codex is working.' })]
  }

  if (type === 'turn.completed') {
    return [codexObservation({ kind: 'phase', phase: 'running', summary: 'Preparing response.' })]
  }

  const item = isRecord(parsed) && isRecord(parsed.item) ? parsed.item : null
  if (!item) {
    return []
  }

  const itemType = getStringPath(item, ['type'])
  const label = getCodexActivityItemLabel(item)
  if (type === 'item.started') {
    if (isCommandLikeItem(itemType, item)) {
      return [
        codexObservation({
          kind: 'command',
          phase: 'running',
          summary: label ? `Running command: ${label}` : 'Running command.',
          payload: { label }
        })
      ]
    }

    if (isToolLikeItem(itemType, item)) {
      return [
        codexObservation({
          kind: 'tool',
          phase: getToolPhase(label),
          summary: label ? `Using tool: ${label}` : 'Using tool.',
          payload: { label }
        })
      ]
    }
  }

  if (type === 'item.completed') {
    if (itemType === 'agent_message') {
      return [
        codexObservation({
          kind: 'message',
          phase: 'running',
          summary: 'Preparing response.'
        })
      ]
    }

    if (isCommandLikeItem(itemType, item)) {
      return [
        codexObservation({
          kind: 'command',
          phase: 'running',
          summary: label ? `Command completed: ${label}` : 'Command completed.',
          payload: { label }
        })
      ]
    }

    if (isToolLikeItem(itemType, item)) {
      return [
        codexObservation({
          kind: 'tool',
          phase: getToolPhase(label),
          summary: label ? `Tool completed: ${label}` : 'Tool completed.',
          payload: { label }
        })
      ]
    }
  }

  return []
}

function codexObservation(
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

function isCommandLikeItem(itemType: string, item: Record<string, unknown>): boolean {
  return (
    itemType.includes('command') || itemType.includes('shell') || typeof item.command === 'string'
  )
}

function isToolLikeItem(itemType: string, item: Record<string, unknown>): boolean {
  return (
    itemType.includes('tool') || typeof item.name === 'string' || typeof item.tool_name === 'string'
  )
}

function getCodexActivityItemLabel(item: Record<string, unknown>): string {
  return (
    getStringPath(item, ['command']) ||
    getStringPath(item, ['name']) ||
    getStringPath(item, ['tool_name']) ||
    getStringPath(item, ['title']) ||
    getStringPath(item, ['call', 'function', 'name']) ||
    getStringPath(item, ['function', 'name']) ||
    getStringPath(item, ['type'])
  )
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180)
}

function getToolPhase(label: string): RuntimeObservation['phase'] {
  const normalized = label.toLowerCase()
  if (
    normalized.includes('read') ||
    normalized.includes('search') ||
    normalized.includes('list') ||
    normalized.includes('grep')
  ) {
    return 'reading'
  }
  if (
    normalized.includes('write') ||
    normalized.includes('edit') ||
    normalized.includes('patch') ||
    normalized.includes('apply')
  ) {
    return 'editing'
  }

  return 'running'
}

function getEventType(value: unknown): string {
  return getStringPath(value, ['type']) || getStringPath(value, ['event']) || ''
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

function findSessionLikeString(value: unknown): string {
  if (!isRecord(value)) {
    return ''
  }

  for (const [key, nested] of Object.entries(value)) {
    if (typeof nested === 'string' && /(?:session|thread).*id|id.*(?:session|thread)/i.test(key)) {
      return nested
    }

    const childValue = findSessionLikeString(nested)
    if (childValue) {
      return childValue
    }
  }

  return ''
}
