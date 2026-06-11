import { z } from 'zod'
import {
  AgentDraftFromIntentInputSchema,
  AgentSchema,
  ConversationParticipantSchema,
  ProviderActionInputSchema,
  ProviderConnectInputSchema,
  ProviderIdSchema,
  WORKBOARD_AGENT_LIMIT,
  WorkspaceRelativePathSchema,
  type OrchestrationPlan,
  type AgentDraft,
  type ProviderActionInput,
  type ProviderConnectInput,
  type ProviderConnectResult,
  type ProviderStatus,
  type WorkboardDraftPlan
} from '@shared/contracts'
import { providerIds, type RuntimeEventListener, type RuntimeProviderCapabilities } from './types'
import { getProviderAdapter, listProviderAdapters } from './adapters/registry'
import { partitionExtraDirectoriesByExistence } from '../workspace/extra-directory-policy'
import { isProviderSessionInvalidError } from './adapters/shared'
import { buildWorkspaceWorkingFolderInstructions } from './prompts/workspace'
import type {
  ProviderRuntimeContext,
  RuntimeAgentDraftInput,
  RuntimeConversationTurnInput,
  RuntimeConversationTurnResult,
  RuntimeOrchestrationPlanInput,
  RuntimeWorkboardPlanInput,
  RuntimeWorkRunInput,
  RuntimeWorkRunResult
} from './adapters/types'

const RuntimeAgentDraftInputSchema = AgentDraftFromIntentInputSchema.extend({
  providerId: ProviderIdSchema,
  model: z.string().trim().min(1).default('default')
})

const RuntimeOrchestrationPlanInputSchema = z.object({
  providerId: ProviderIdSchema,
  model: z.string().trim().min(1).default('default'),
  workspaceRoot: z.string().trim().min(1),
  participants: z.array(ConversationParticipantSchema).min(1).max(8),
  mentionedParticipantIds: z.array(z.string().min(1)).max(8),
  userMessage: z.string().trim().min(1).max(64_000),
  transcript: z
    .array(
      z.object({
        speaker: z.enum(['user', 'agent', 'moderator']),
        agentName: z.string().min(1).optional(),
        content: z.string()
      })
    )
    .optional(),
  priorAgentTurns: z.number().int().nonnegative().optional(),
  maxAgentTurns: z.number().int().positive().optional()
})

const RuntimeWorkboardPlanInputSchema = z.object({
  providerId: ProviderIdSchema,
  model: z.string().trim().min(1).default('default'),
  workspaceRoot: z.string().trim().min(1),
  agents: z.array(AgentSchema).min(1).max(WORKBOARD_AGENT_LIMIT),
  request: z.string().trim().min(1).max(64_000),
  requestedAgentIds: z.array(z.string().min(1)).max(WORKBOARD_AGENT_LIMIT).default([])
})

export type RuntimeService = {
  readonly ready: boolean
  getProviderCapabilities(): readonly RuntimeProviderCapabilities[]
  getProviderStatuses(): Promise<ProviderStatus[]>
  refreshProvider(input: ProviderActionInput): Promise<ProviderStatus>
  connectProvider(input: ProviderConnectInput): Promise<ProviderConnectResult>
  disconnectProvider(input: ProviderActionInput): Promise<ProviderStatus>
  generateAgentDraft(input: RuntimeAgentDraftInput): Promise<AgentDraft>
  generateOrchestrationPlan(input: RuntimeOrchestrationPlanInput): Promise<OrchestrationPlan>
  generateWorkboardPlan(input: RuntimeWorkboardPlanInput): Promise<WorkboardDraftPlan>
  sendConversationTurn(input: RuntimeConversationTurnInput): Promise<RuntimeConversationTurnResult>
  sendWorkRun(input: RuntimeWorkRunInput): Promise<RuntimeWorkRunResult>
  cancelConversationTurn(turnId: string): boolean
  subscribe(listener: RuntimeEventListener): () => void
}

export function createRuntimeService(): RuntimeService {
  const listeners = new Set<RuntimeEventListener>()
  const context: ProviderRuntimeContext = {
    loginProcesses: new Map(),
    conversationProcesses: new Map()
  }

  // ADR-029 follow-up — Provider statuses are expensive: each adapter's
  // `getStatus()` spawns two CLI subprocesses (`--version` + `login status`),
  // so the three-provider parallel fan-out costs ~300–500ms wall time. Every
  // caller used to pay that price every time, including App.tsx's boot
  // loadStatus, every Settings → Providers open, every plan-generation
  // gate, every schedule fire, and (after M7) the Ordinus surfaces.
  //
  // The values are stable across short windows — CLI installs and login
  // state change infrequently — so we memoize the entire ProviderStatus[]
  // with a short TTL plus in-flight coalescing. Concurrent callers share
  // a single spawn batch; everything within the TTL hits memory.
  //
  // Lifecycle:
  //   - Boot pre-warm fires from main/index.ts (background, no await).
  //     By the time App.tsx's Phase 2 setupGetStatus reaches us, the call
  //     is in-flight (await same promise) or already cached.
  //   - Any user-driven mutation (connect, disconnect, refreshProvider)
  //     invalidates the cache so the next read picks up the new state.
  //   - In-memory only; an app restart re-warms from scratch.
  //
  // Stale-state risk: if the user externally logs the CLI out, we keep
  // reporting `connected: true` for up to 30 s. The next real CLI call
  // (turn / plan) surfaces the auth error then. Acceptable trade-off for
  // the latency win.
  const PROVIDER_STATUS_TTL_MS = 30_000
  let providerStatusCache: { value: ProviderStatus[]; fetchedAt: number } | null = null
  let providerStatusInFlight: Promise<ProviderStatus[]> | null = null

  function invalidateProviderStatusCache(): void {
    providerStatusCache = null
  }

  async function fetchAllProviderStatuses(): Promise<ProviderStatus[]> {
    if (providerStatusInFlight) return providerStatusInFlight
    providerStatusInFlight = Promise.all(
      listProviderAdapters().map((adapter) => adapter.getStatus(context))
    )
      .then((value) => {
        providerStatusCache = { value, fetchedAt: Date.now() }
        return value
      })
      .finally(() => {
        providerStatusInFlight = null
      })
    return providerStatusInFlight
  }

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
      const now = Date.now()
      if (providerStatusCache && now - providerStatusCache.fetchedAt < PROVIDER_STATUS_TTL_MS) {
        return providerStatusCache.value
      }
      return fetchAllProviderStatuses()
    },
    async refreshProvider(input) {
      const parsed = ProviderActionInputSchema.parse(input)
      const adapter = getProviderAdapter(parsed.providerId)

      const result = await (adapter.refreshProvider
        ? adapter.refreshProvider(parsed, context)
        : adapter.getStatus(context))
      // Refresh is the user-driven "give me the truth right now" action.
      // Drop the cache so the next bulk read picks up fresh state for
      // every provider (cheap — they re-spawn in parallel).
      invalidateProviderStatusCache()
      return result
    },
    async connectProvider(input) {
      const parsed = ProviderConnectInputSchema.parse(input)
      const adapter = getProviderAdapter(parsed.providerId)

      if (!adapter.connectProvider) {
        const status = await adapter.getStatus(context)
        return { status, authUrl: '' }
      }

      const result = await adapter.connectProvider(parsed, context)
      invalidateProviderStatusCache()
      return result
    },
    async disconnectProvider(input) {
      const parsed = ProviderActionInputSchema.parse(input)
      const adapter = getProviderAdapter(parsed.providerId)

      if (!adapter.disconnectProvider) {
        throw new Error(`Disconnect is not available for ${adapter.label} yet.`)
      }

      const result = await adapter.disconnectProvider(parsed, context)
      invalidateProviderStatusCache()
      return result
    },
    async generateAgentDraft(input) {
      const parsed = RuntimeAgentDraftInputSchema.parse(input)
      const adapter = getProviderAdapter(parsed.providerId)

      if (!adapter.generateAgentDraft) {
        throw new Error(`Agent draft generation is not available for ${adapter.label} yet.`)
      }

      return adapter.generateAgentDraft(parsed, context)
    },
    async generateOrchestrationPlan(input) {
      const parsed = RuntimeOrchestrationPlanInputSchema.parse(
        input
      ) as RuntimeOrchestrationPlanInput
      const adapter = getProviderAdapter(parsed.providerId)

      if (!adapter.generateOrchestrationPlan) {
        throw new Error(`Orchestrator routing is not available for ${adapter.label} yet.`)
      }

      return adapter.generateOrchestrationPlan(parsed, context)
    },
    async generateWorkboardPlan(input) {
      const parsed = RuntimeWorkboardPlanInputSchema.parse(input) as RuntimeWorkboardPlanInput
      const adapter = getProviderAdapter(parsed.providerId)

      if (!adapter.generateWorkboardPlan) {
        throw new Error(`Workboard planning is not available for ${adapter.label} yet.`)
      }

      return adapter.generateWorkboardPlan(parsed, context)
    },
    async sendConversationTurn(input) {
      WorkspaceRelativePathSchema.parse(input.workingRoot)
      const adapter = getProviderAdapter(input.providerId)

      if (!adapter.sendConversationTurn) {
        throw new Error(`Direct conversations are not available for ${adapter.label} yet.`)
      }

      return sendConversationTurnWithFreshSessionFallback(adapter, input, context)
    },
    async sendWorkRun(input) {
      WorkspaceRelativePathSchema.parse(input.workingRoot)
      const adapter = getProviderAdapter(input.providerId)

      if (!adapter.sendConversationTurn) {
        throw new Error(`Work execution is not available for ${adapter.label} yet.`)
      }

      return sendConversationTurnWithFreshSessionFallback(
        adapter,
        {
          turnId: input.runId,
          conversationId: input.workRequestId,
          providerId: input.providerId,
          model: input.model,
          sandbox: input.sandbox,
          workspaceRoot: input.workspaceRoot,
          workingRoot: input.workingRoot,
          agentHomePath: input.agentHomePath,
          extraDirectories: input.extraDirectories,
          agentName: input.agentName,
          agentRole: input.agentRole,
          instructions: input.instructions,
          connectors: input.connectors,
          providerSessionRef: input.providerSessionRef,
          message: buildWorkRunMessage(input),
          logRef: input.logRef,
          eventLogPath: input.eventLogPath,
          lastMessagePath: input.lastMessagePath,
          observability: input.observability,
          additionalMcpServers: input.additionalMcpServers
        },
        context,
        () => buildWorkRunMessage({ ...input, providerSessionRef: null })
      )
    },
    cancelConversationTurn(turnId) {
      const process = context.conversationProcesses.get(turnId)
      if (!process) {
        return false
      }

      process.cancelled = true
      if (process.cleanupTimer) {
        clearTimeout(process.cleanupTimer)
      }

      if (process.child.pid) {
        process.child.kill()
      }

      return true
    },
    subscribe(listener) {
      listeners.add(listener)

      return () => {
        listeners.delete(listener)
      }
    }
  }
}

function applyExtraDirectoriesPolicy(
  input: RuntimeConversationTurnInput
): RuntimeConversationTurnInput {
  if (input.extraDirectories.length === 0) {
    return input
  }
  const { available, missing } = partitionExtraDirectoriesByExistence(input.extraDirectories)
  if (missing.length > 0) {
    input.observability?.record({
      kind: 'status',
      source: 'runtime',
      confidence: 'reported',
      phase: 'starting',
      summary: `Skipped missing extra directories: ${missing.join(', ')}`,
      payload: { missing }
    })
  }
  return { ...input, extraDirectories: available }
}

async function sendConversationTurnWithFreshSessionFallback(
  adapter: ReturnType<typeof getProviderAdapter>,
  input: RuntimeConversationTurnInput,
  context: ProviderRuntimeContext,
  // ADR-037: resumed work-run messages omit content the session already holds
  // (working-folder rules, same-session upstream results). A fresh-session
  // retry has no such history, so the caller can rebuild the message for a
  // session-less run before the retry goes out.
  rebuildMessageForFreshSession?: () => string
): Promise<RuntimeConversationTurnResult> {
  if (!adapter.sendConversationTurn) {
    throw new Error(`Direct conversations are not available for ${adapter.label} yet.`)
  }

  const filtered = applyExtraDirectoriesPolicy(input)
  try {
    return await adapter.sendConversationTurn(filtered, context)
  } catch (error) {
    if (!filtered.providerSessionRef || !isProviderSessionInvalidError(error)) {
      throw error
    }

    filtered.observability?.record({
      kind: 'status',
      source: 'runtime',
      confidence: 'reported',
      phase: 'starting',
      summary: 'Started a new provider session after the stored session was unavailable.',
      payload: {
        reason: 'invalid_provider_session'
      }
    })

    const retried = await adapter.sendConversationTurn(
      {
        ...filtered,
        providerSessionRef: null,
        message: rebuildMessageForFreshSession?.() ?? filtered.message
      },
      context
    )
    return { ...retried, sessionReset: true }
  }
}

function buildWorkRunMessage(input: RuntimeWorkRunInput): string {
  return [
    `Work Item: ${input.title}`,
    '',
    // ADR-037: a resumed session already received the working-folder rules on
    // its first run (and the ADR-013 fresh-session fallback re-adds them via
    // the adapter's new-session prompt builder), so they are only spelled out
    // for fresh sessions.
    ...(input.providerSessionRef
      ? []
      : [buildWorkspaceWorkingFolderInstructions(input.workingRoot), '']),
    'Instruction:',
    input.instruction,
    '',
    'Expected output:',
    input.expectedOutput || 'Provide a concise result summary for this Work Item.',
    '',
    formatRequiredInputs(input.requiredInputs, input.providerSessionRef),
    '',
    'Same-agent prior Work Items in this Work Request may already be in this provider session. Treat session memory as orientation only; artifacts and workspace files are authoritative.',
    '',
    'Upstream textual results are provided inline above (summary and, when present, full result). Read upstream workspace files only for genuine file deliverables (code, HTML, PDFs, spreadsheets, images) that you need in full.',
    '',
    // Only advertise the lazy-fetch tool when the worker MCP endpoint was
    // actually attached — otherwise the agent burns a turn on a missing tool.
    ...(input.additionalMcpServers?.length
      ? [
          'A digest.md file in the working folder records completed work in this Work Request (run ids and summaries). To fetch the full output of a prior run that is not inlined above, call the get_work_run_result tool with its run id.',
          ''
        ]
      : []),
    ...formatResumeMessage(input.resumeMessage),
    '',
    'When you complete the Work Item, make the final content easy to review in the Workboard drawer.',
    'Format final content as concise GitHub-flavored Markdown. Use short sections such as Summary, Completed, Output, Files, and Follow-up when they fit the work.',
    'Keep file paths in artifactRefs and changedFiles as required by the outcome schema; mention only the most important paths in the content itself.',
    '',
    'Complete only this Work Item. If you need the user to decide something before continuing, return a structured input request.'
  ].join('\n')
}

// ADR-030: direct-predecessor result content is inlined into the handoff so the
// dependent agent does not read it from a workspace file. Realistic outputs are
// small and chains are mostly linear, so this stays cheap. As a safety valve,
// once the combined inlined content for one run exceeds this budget the overflow
// degrades to summary-only.
const requiredInputsContentBudget = 100_000

function formatRequiredInputs(
  inputs: RuntimeWorkRunInput['requiredInputs'],
  resumedSessionRef: string | null
): string {
  if (inputs.length === 0) {
    return 'Upstream work available: none'
  }

  let remainingContentBudget = requiredInputsContentBudget

  return [
    'Upstream work available:',
    ...inputs.map((item, index) => {
      const lines = [
        `${index + 1}. ${item.title}`,
        `Work Run: ${item.runId}`,
        `Agent: ${item.agentName} (${item.agentRole})`,
        `Summary: ${item.resultSummary}`
      ]

      // ADR-037: when the producing run lives in the very session this run
      // resumes, its full content is already in session history — re-inlining
      // it would be pure duplication.
      const producedInThisSession =
        Boolean(resumedSessionRef) && item.providerSessionRef === resumedSessionRef

      const content = item.resultContent.trim()
      if (content && producedInThisSession) {
        lines.push(
          'Full result: produced earlier in this session by you; see your own prior output above in this conversation.'
        )
      } else if (content) {
        if (content.length <= remainingContentBudget) {
          remainingContentBudget -= content.length
          lines.push('Full result:', content)
        } else {
          lines.push('Full result: omitted here because it is large; rely on the summary above.')
        }
      }

      lines.push(
        formatFileList('Artifacts', item.artifactRefs),
        formatFileList('Changed files', item.changedFiles)
      )
      return lines.join('\n')
    })
  ].join('\n\n')
}

function formatFileList(label: string, paths: string[]): string {
  return paths.length > 0
    ? [label + ':', ...paths.map((path) => `- ${path}`)].join('\n')
    : `${label}: none`
}

function formatResumeMessage(message: string | undefined): string[] {
  if (!message) {
    return []
  }

  return [
    '',
    'User input received for this Work Item:',
    message,
    '',
    'Continue this Work Item using the answers above while following the artifact rules in this prompt.'
  ]
}
