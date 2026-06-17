import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  AgentSandboxSchema,
  AgentTurnOutcomeSchema,
  chatTurnSummaryMaxLength,
  ProviderStatusSchema,
  type AgentDraft,
  type AgentSkillDraft,
  type AgentSandbox,
  type AgentTurnOutcome,
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
import { ensureClaudeSkillsLink } from '../../../agents/filesystem'
import {
  AgentDraftOutputSchema,
  agentDraftOutputJsonSchema,
  buildAgentDraft,
  buildAgentDraftPrompt
} from '../../prompts/agent-draft'
import {
  buildSkillDraft,
  buildSkillDraftPrompt,
  SkillDraftOutputSchema,
  skillDraftOutputJsonSchema
} from '../../prompts/skill-draft'
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
  claudeAgentTurnOutcomeJsonSchema,
  claudeChatAgentTurnOutcomeJsonSchema,
  buildClaudeOutcomeFieldGuidance,
  buildClaudeChatOutcomeFieldGuidance,
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
  EmptyProviderResponseError,
  getCliVersion,
  getStringValue,
  isEmptyProviderResponseMessage,
  isInvalidProviderSessionMessage,
  ProviderSessionInvalidError,
  matchSkillActivation,
  readCliFailureMessage,
  runConversationProcess,
  scheduleLoginCleanup
} from '../shared'
import type {
  ProviderAdapter,
  ProviderLoginProcess,
  RuntimeAgentDraftInput,
  RuntimeOrchestrationPlanInput,
  RuntimeSkillDraftInput,
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
  generateSkillDraft(input) {
    return generateClaudeSkillDraft(input)
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

  // ADR-040: Claude discovers `.claude/skills/` inside the --add-dir'd agent
  // home natively; the link is ensured per turn to cover pre-ADR agents.
  ensureClaudeSkillsLink(input.agentHomePath)

  const materialized = await materializeConnectors(
    input.connectors,
    input.agentHomePath,
    input.additionalMcpServers
  )

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

      // ADR-053: a non-zero exit whose message is an empty-response flake is
      // retryable; surface it as such so the runtime replays the turn once.
      if (isEmptyProviderResponseMessage(message)) {
        throw new EmptyProviderResponseError(message)
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
      outcome: await resolveClaudeConversationOutcome({
        responseText: parsed.responseText,
        structuredOutputPresent: parsed.structuredOutputPresent,
        input,
        context,
        executable,
        materialized,
        providerSessionRef
      }),
      logRef: input.logRef
    }
  } finally {
    materialized.cleanup()
  }
}

// ADR-050 — Claude intermittently ends a turn in plain text WITHOUT calling the
// forced StructuredOutput tool (most often on resume turns with a long answer,
// after using MCP tools through the deferred-tool/ToolSearch path). The text is a
// genuine answer, so failing the whole turn on the missing JSON envelope is wrong.
// `structuredOutputPresent` is decided at the source (readClaudeConversationOutput)
// from whether the result carried a structured_output — NOT by sniffing the prose
// for braces. Defense in depth: (1) a system-prompt nudge pushes Claude to always
// finish with StructuredOutput; when it still skips, (2) chat uses the prose
// directly (ADR-049: the summary IS the whole chat answer, so a recovery round-trip
// would add nothing), and (3) work tries one tool-less recovery turn to re-emit the
// structured fields (artifactRefs / changedFiles / needs_input are load-bearing
// there), falling back to a summary-only outcome only if that also fails.
async function resolveClaudeConversationOutcome(deps: {
  responseText: string
  structuredOutputPresent: boolean
  input: RuntimeConversationTurnInput
  context: ProviderRuntimeContext
  executable: CliExecutable
  materialized: Awaited<ReturnType<typeof materializeConnectors>>
  providerSessionRef: string
}): Promise<AgentTurnOutcome> {
  if (deps.structuredOutputPresent) {
    // The StructuredOutput tool was used — parse it. A validation failure here is a
    // real problem (e.g. an empty {}), surfaced as before.
    return parseAgentTurnOutcome(deps.responseText)
  }

  // Claude skipped StructuredOutput and answered in the text channel.
  if (deps.input.outcomeMode === 'chat') {
    return buildTextSummaryOutcome(deps.responseText)
  }

  const recovered = await runClaudeStructuredOutputRecovery(deps)
  return recovered ?? buildTextSummaryOutcome(deps.responseText)
}

// Floor: never hard-fail a turn that produced a real answer. The prose becomes the
// summary, truncated to the ceiling so an oversized answer degrades instead of
// throwing a Zod "too_big".
function buildTextSummaryOutcome(text: string): AgentTurnOutcome {
  const summary = text.trim().slice(0, chatTurnSummaryMaxLength) || 'Done.'
  return AgentTurnOutcomeSchema.parse({
    outcome: 'final_response',
    summary,
    content: '',
    artifactRefs: [],
    changedFiles: []
  })
}

// ADR-050 — one extra resume turn for WORK runs only, isolated from the original
// turn: its own turnId / event log / last-message path and no observability sink, so
// it cannot resurrect the already-completed observed run or double the timeline. It
// runs without connectors (no --mcp-config) so the model cannot redo MCP work — it
// just re-emits the StructuredOutput. Returns null (caller falls back) unless it
// produces a parseable structured outcome.
async function runClaudeStructuredOutputRecovery(deps: {
  responseText: string
  input: RuntimeConversationTurnInput
  context: ProviderRuntimeContext
  executable: CliExecutable
  materialized: Awaited<ReturnType<typeof materializeConnectors>>
  providerSessionRef: string
}): Promise<AgentTurnOutcome | null> {
  const recoveryLogDir = dirname(deps.input.eventLogPath)
  const recoveryInput: RuntimeConversationTurnInput = {
    ...deps.input,
    providerSessionRef: deps.providerSessionRef,
    turnId: `${deps.input.turnId}-so-recovery`,
    eventLogPath: join(recoveryLogDir, 'recovery-events.jsonl'),
    lastMessagePath: join(recoveryLogDir, 'recovery-last-message.txt'),
    observability: undefined
  }
  const args = buildClaudeConversationArgs(
    recoveryInput,
    deps.materialized.mcpConfigPath,
    deps.materialized.allowedTools,
    { omitMcpConfig: true }
  )

  let result: Awaited<ReturnType<typeof runConversationProcess>>
  try {
    result = await runConversationProcess({
      executable: deps.executable,
      args,
      input: recoveryInput,
      context: deps.context,
      env: getClaudeEnvironment(),
      stdin: buildClaudeStructuredOutputRecoveryPrompt(),
      streamErrorMessage: 'Claude recovery process streams could not be opened.',
      observeStdoutLine: observeClaudeStdoutLine
    })
  } catch {
    return null
  }

  if (result.cancelled || result.code !== 0) {
    return null
  }

  let parsed: { responseText: string; structuredOutputPresent: boolean }
  try {
    parsed = readClaudeConversationOutput(result.stdout)
  } catch {
    return null
  }

  if (!parsed.structuredOutputPresent) {
    return null
  }

  try {
    return parseAgentTurnOutcome(parsed.responseText)
  } catch {
    return null
  }
}

function buildClaudeStructuredOutputRecoveryPrompt(): string {
  return 'You ended your previous turn without calling the StructuredOutput tool. Do not use any other tools now. Call the StructuredOutput tool exactly once to report the result of the work you just did, following the outcome field guidance from the system prompt.'
}

// ADR-050 — the built-in tools Ordinus agents are allowed to SEE (`--tools` governs
// availability/visibility, not permission). Excludes the harness orchestration tools the
// host account exposes; keeps ToolSearch so the deferred-tool path keeps working for large
// MCP connectors. MCP connector functions are unaffected (they arrive via --mcp-config).
const claudeBuiltinToolAllowlist = [
  'Bash',
  'Read',
  'Edit',
  'Write',
  'Glob',
  'Grep',
  'Skill',
  'WebSearch',
  'WebFetch',
  'NotebookEdit',
  'ToolSearch'
] as const

// ADR-050 — `--tools` only makes a built-in visible; `--allowedTools` is what lets the
// fully non-interactive CLI (`-p`, no permission prompt path) RUN it. WebSearch/WebFetch
// and general Bash are NOT auto-approved by acceptEdits, so without an explicit
// --allowedTools entry every such call is silently denied. These two groups split the
// built-ins by whether they need permission, so read-only agents keep their no-mutation
// guarantee while write-capable agents can actually use web + shell.
//
// Read/research built-ins: no permission required, safe to pre-approve in every tier
// (including read-only / plan mode).
const claudeReadResearchBuiltins = [
  'Read',
  'Glob',
  'Grep',
  'WebSearch',
  'WebFetch',
  'ToolSearch'
] as const

// Mutating / side-effecting built-ins: pre-approved only when the sandbox grants write
// access — never in read-only.
const claudeMutatingBuiltins = ['Edit', 'Write', 'NotebookEdit', 'Bash', 'Skill'] as const

// The built-in tools Ordinus pre-approves in --allowedTools for a given sandbox tier.
function getClaudePreApprovedBuiltins(sandbox: AgentSandbox): string[] {
  const parsed = AgentSandboxSchema.parse(sandbox)
  if (parsed === 'read-only') {
    return [...claudeReadResearchBuiltins]
  }
  return [...claudeReadResearchBuiltins, ...claudeMutatingBuiltins]
}

function buildClaudeConversationArgs(
  input: RuntimeConversationTurnInput,
  mcpConfigPath: string | null,
  allowedTools: string[],
  // ADR-050 — the StructuredOutput recovery turn passes omitMcpConfig so the model
  // cannot redo MCP work; it only re-emits the structured outcome.
  options?: { omitMcpConfig?: boolean }
): string[] {
  const args = [
    '-p',
    '--output-format',
    'stream-json',
    '--verbose',
    '--json-schema',
    // ADR-037: the relaxed Claude variant — the strict all-required schema makes
    // Claude's forced StructuredOutput tool bail to an empty {} and exhaust the
    // CLI's retries. See claudeAgentTurnOutcomeJsonSchema for the full rationale.
    // ADR-049: chat drops `content` (whole answer inline in `summary`); Workboard
    // keeps the summary/content split.
    JSON.stringify(
      input.outcomeMode === 'chat'
        ? claudeChatAgentTurnOutcomeJsonSchema
        : claudeAgentTurnOutcomeJsonSchema
    ),
    '--permission-mode',
    getClaudePermissionMode(input.sandbox),
    '--append-system-prompt-file',
    writeClaudeSystemPromptFile(input),
    // ADR-050 — restrict the BUILT-IN tool catalog to what Ordinus agents use.
    // `--tools` governs only built-ins (not MCP connector functions), so this drops
    // the host account's harness orchestration tools (Task, Workflow, Cron*,
    // AskUserQuestion, DesignSync, Monitor, RemoteTrigger, ScheduleWakeup,
    // PushNotification, EnterWorktree) — a safety boundary (an Ordinus agent must not
    // spawn sub-agents, create crons, or bypass the needs_input panel). ToolSearch is
    // kept so the deferred-tool path still works for large connectors; StructuredOutput
    // is added automatically by --json-schema.
    '--tools',
    claudeBuiltinToolAllowlist.join(','),
    // ADR-050 — only use the MCP servers Ordinus passes via --mcp-config; ignore the
    // account-level claude.ai connectors inherited through the shared OAuth login
    // (Ordinus ships its own Google connector, ADR-043).
    '--strict-mcp-config',
    '--add-dir',
    input.agentHomePath
  ]

  for (const dir of input.extraDirectories) {
    args.push('--add-dir', dir)
  }

  if (mcpConfigPath && !options?.omitMcpConfig) {
    args.push('--mcp-config', mcpConfigPath)
  }

  // ADR-050 — pre-approve the sandbox-appropriate built-ins alongside the MCP connector
  // tools so the non-interactive CLI does not auto-deny WebSearch/WebFetch/Bash (acceptEdits
  // only auto-approves file edits + a few fs Bash commands, never web/shell).
  const preApprovedTools = [...getClaudePreApprovedBuiltins(input.sandbox), ...allowedTools]
  if (preApprovedTools.length > 0) {
    args.push('--allowedTools', preApprovedTools.join(','))
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
    // ADR-037: Claude enforces the outcome schema via the native StructuredOutput
    // tool (--json-schema), so it gets field guidance rather than the text-channel
    // "return JSON only" shape dictation Codex/Gemini use — the latter makes Claude
    // answer in text and then call StructuredOutput empty, exhausting CLI retries.
    // ADR-049: chat guidance puts the whole answer in `summary` (no `content`).
    input.outcomeMode === 'chat'
      ? buildClaudeChatOutcomeFieldGuidance()
      : buildClaudeOutcomeFieldGuidance()
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
  // ADR-037: the resumed session already holds the full rules from its first
  // turn; the outcome shape is enforced by --json-schema regardless.
  return [buildResumeReminderInstructions(), '', 'User message:', input.message].join('\n')
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

// ADR-040: one-shot skill draft by the owning agent — same invocation shape as
// the agent draft, different prompt/schema.
async function generateClaudeSkillDraft(input: RuntimeSkillDraftInput): Promise<AgentSkillDraft> {
  const executable = await findClaudeExecutable()
  if (!executable) {
    throw new Error('Claude Code CLI was not found.')
  }

  const status = await getClaudeStatus(null)
  if (!status.connected) {
    throw new Error('Claude needs login before Ordinus can draft skills with it.')
  }

  const args = [
    '-p',
    '--output-format',
    'json',
    '--json-schema',
    JSON.stringify(skillDraftOutputJsonSchema),
    '--no-session-persistence',
    '--permission-mode',
    'dontAsk'
  ]

  addCliModelArg(args, input.model, 1)

  const result = await runCapture(executable.command, withCliBaseArgs(executable, args), {
    env: getClaudeEnvironment(),
    shell: executable.shell,
    stdin: buildSkillDraftPrompt(input),
    timeoutMs: 90_000
  })

  if (result.code !== 0) {
    throw new Error(
      firstLine(result.stderr || result.stdout) || 'Claude could not draft the skill.'
    )
  }

  return buildSkillDraft(SkillDraftOutputSchema.parse(readClaudeAgentDraftOutput(result.stdout)))
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
  return findCliExecutable('claude', 'CLAUDE_BIN', {
    prefixBinDir: getSystemPaths().cliBin
  })
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
        summary: 'Claude returned a result.',
        sessionRef: getStringValue(parsed.session_id) || undefined,
        usage: readClaudeUsage(parsed)
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
      sessionRef: getStringValue(event.session_id) || undefined,
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

    // ADR-040: surface skill activations as their own signal — either the
    // native Skill tool or any read/command touching a SKILL.md.
    const skillName = getClaudeSkillName(name, input, label)
    if (skillName) {
      observations.push(
        claudeObservation({
          kind: 'skill',
          phase: 'running',
          summary: `Applying skill: ${skillName}`,
          payload: { id: getStringValue(item.id), name, skillName }
        })
      )
      continue
    }

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
    Pick<Partial<RuntimeObservation>, 'payload' | 'sessionRef' | 'usage'>
): RuntimeObservation {
  return {
    source: 'provider',
    confidence: 'reported',
    lifecycleStatus: 'running',
    ...event
  }
}

// ADR-037 — Claude reports PER-INVOCATION usage on the result event. Its
// input_tokens EXCLUDES cache reads/writes, so the stored inputTokens is the
// sum (total input presented to the model) to match the Codex convention
// where input_tokens already includes cached input.
function readClaudeUsage(event: Record<string, unknown>): RuntimeObservation['usage'] {
  const usage = isRecord(event.usage) ? event.usage : null
  if (!usage) {
    return undefined
  }

  const freshInput = readClaudeUsageNumber(usage.input_tokens)
  const cacheRead = readClaudeUsageNumber(usage.cache_read_input_tokens)
  const cacheCreation = readClaudeUsageNumber(usage.cache_creation_input_tokens)
  const outputTokens = readClaudeUsageNumber(usage.output_tokens)
  if (freshInput === null && outputTokens === null) {
    return undefined
  }

  return {
    semantics: 'invocation',
    inputTokens: (freshInput ?? 0) + (cacheRead ?? 0) + (cacheCreation ?? 0),
    cachedInputTokens: cacheRead ?? 0,
    outputTokens: outputTokens ?? 0
  }
}

function readClaudeUsageNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null
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

// ADR-040: the native Skill tool carries the skill name in its input; reads
// of a SKILL.md (Read/cat) carry it in the path. Returns null when the tool
// use is not skill-related.
function getClaudeSkillName(
  name: string,
  input: Record<string, unknown>,
  label: string
): string | null {
  if (name.toLowerCase() === 'skill') {
    const fromInput =
      getStringValue(input.command) || getStringValue(input.skill) || getStringValue(input.name)
    if (fromInput) {
      return fromInput.trim().slice(0, 80)
    }
  }

  // Writing/editing a SKILL.md is authoring, not applying — without this,
  // creating a skill in chat reports the skill as "used".
  if (/^(write|edit|notebookedit|multiedit)$/i.test(name)) {
    return null
  }

  // ADR-040: match the untruncated tool input — the label is cut at 180 chars
  // and compound bash commands push the SKILL.md path past it.
  const rawInput = [input.command, input.file_path, input.path]
    .map((value) => getStringValue(value))
    .filter(Boolean)
    .join(' ')
  return matchSkillActivation(rawInput || label)
}

function unwrapClaudeStructuredOutput(value: unknown): unknown {
  if (!isRecord(value)) {
    return value
  }

  const result = value.structured_output ?? value.result ?? value
  return typeof result === 'string' ? parseJsonFromCliOutput(result) : result
}

function readClaudeConversationOutput(value: string): {
  sessionId: string
  responseText: string
  structuredOutputPresent: boolean
} {
  const parsed = readClaudeConversationResult(value)

  if (!isRecord(parsed)) {
    throw new Error('Claude returned an invalid conversation response.')
  }

  const sessionId = getStringValue(parsed.session_id) || getStringValue(parsed.sessionId)
  const isError = parsed.is_error === true

  // ADR-050 — distinguish "the StructuredOutput tool was used" from "Claude answered
  // in the text channel and skipped it". When structured_output is present it is the
  // authoritative outcome (normalized to a JSON string for parseAgentTurnOutcome);
  // when absent, the `result` text is a plain prose answer and must NOT be
  // force-parsed as JSON — doing so threw here before the recovery/fallback path in
  // resolveClaudeConversationOutcome could ever run.
  const structuredOutputPresent = parsed.structured_output != null
  const responseText = structuredOutputPresent
    ? renderClaudeStructuredOutput(parsed.structured_output)
    : getStringValue(parsed.result) ||
      getStringValue(parsed.response) ||
      getStringValue(parsed.message)

  if (isError) {
    const message = firstLine(responseText) || 'Claude conversation turn failed.'
    // ADR-053: classify an empty-response/invalid-stream error as retryable.
    if (isEmptyProviderResponseMessage(message)) {
      throw new EmptyProviderResponseError(message)
    }
    throw new Error(message)
  }

  if (!responseText.trim()) {
    // ADR-053: zero-exit but no usable text — retryable empty-response flake.
    throw new EmptyProviderResponseError('Claude returned an empty conversation response.')
  }

  return {
    sessionId,
    responseText: responseText.trim(),
    structuredOutputPresent
  }
}

// structured_output may arrive as a JSON string or an already-parsed object;
// normalize to a JSON string for parseAgentTurnOutcome.
function renderClaudeStructuredOutput(value: unknown): string {
  const resolved = typeof value === 'string' ? parseJsonFromCliOutput(value) : value
  return typeof resolved === 'string' ? resolved : JSON.stringify(resolved)
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
