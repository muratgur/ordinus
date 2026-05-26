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
  userMessage: z.string().trim().min(1).max(64_000)
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
      return Promise.all(listProviderAdapters().map((adapter) => adapter.getStatus(context)))
    },
    async refreshProvider(input) {
      const parsed = ProviderActionInputSchema.parse(input)
      const adapter = getProviderAdapter(parsed.providerId)

      return adapter.refreshProvider
        ? adapter.refreshProvider(parsed, context)
        : adapter.getStatus(context)
    },
    async connectProvider(input) {
      const parsed = ProviderConnectInputSchema.parse(input)
      const adapter = getProviderAdapter(parsed.providerId)

      if (!adapter.connectProvider) {
        const status = await adapter.getStatus(context)
        return { status, authUrl: '' }
      }

      return adapter.connectProvider(parsed, context)
    },
    async disconnectProvider(input) {
      const parsed = ProviderActionInputSchema.parse(input)
      const adapter = getProviderAdapter(parsed.providerId)

      if (!adapter.disconnectProvider) {
        throw new Error(`Disconnect is not available for ${adapter.label} yet.`)
      }

      return adapter.disconnectProvider(parsed, context)
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
          observability: input.observability
        },
        context
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
  context: ProviderRuntimeContext
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

    return adapter.sendConversationTurn(
      {
        ...filtered,
        providerSessionRef: null
      },
      context
    )
  }
}

function buildWorkRunMessage(input: RuntimeWorkRunInput): string {
  return [
    `Work Item: ${input.title}`,
    '',
    buildWorkspaceWorkingFolderInstructions(input.workingRoot),
    '',
    'Instruction:',
    input.instruction,
    '',
    'Expected output:',
    input.expectedOutput || 'Provide a concise result summary for this Work Item.',
    '',
    formatRequiredInputs(input.requiredInputs),
    '',
    'Same-agent prior Work Items in this Work Request may already be in this provider session. Treat session memory as orientation only; artifacts and workspace files are authoritative.',
    '',
    'Read upstream files from the workspace when you need full detail. Do not assume the summary contains everything.',
    ...formatResumeMessage(input.resumeMessage),
    '',
    'When you complete the Work Item, make the final content easy to review in the Workboard drawer.',
    'Format final content as concise GitHub-flavored Markdown. Use short sections such as Summary, Completed, Output, Files, and Follow-up when they fit the work.',
    'Keep file paths in artifactRefs and changedFiles as required by the outcome schema; mention only the most important paths in the content itself.',
    '',
    'Complete only this Work Item. If you need the user to decide something before continuing, return a structured input request.'
  ].join('\n')
}

function formatRequiredInputs(inputs: RuntimeWorkRunInput['requiredInputs']): string {
  if (inputs.length === 0) {
    return 'Upstream work available: none'
  }

  return [
    'Upstream work available:',
    ...inputs.map((item, index) =>
      [
        `${index + 1}. ${item.title}`,
        `Work Run: ${item.runId}`,
        `Agent: ${item.agentName} (${item.agentRole})`,
        `Summary: ${item.resultSummary}`,
        formatFileList('Artifacts', item.artifactRefs),
        formatFileList('Changed files', item.changedFiles)
      ].join('\n')
    )
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
