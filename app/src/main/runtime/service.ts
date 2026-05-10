import { z } from 'zod'
import {
  AgentDraftFromIntentInputSchema,
  AgentSchema,
  ConversationParticipantSchema,
  ProviderActionInputSchema,
  ProviderConnectInputSchema,
  ProviderIdSchema,
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
  agents: z.array(AgentSchema).min(1).max(16),
  request: z.string().trim().min(1).max(64_000)
})

export type RuntimeService = {
  readonly ready: boolean
  getProviderCapabilities(): readonly RuntimeProviderCapabilities[]
  getProviderStatuses(): Promise<ProviderStatus[]>
  refreshProvider(input: ProviderActionInput): Promise<ProviderStatus>
  connectProvider(input: ProviderConnectInput): Promise<ProviderConnectResult>
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
      const adapter = getProviderAdapter(input.providerId)

      if (!adapter.sendConversationTurn) {
        throw new Error(`Direct conversations are not available for ${adapter.label} yet.`)
      }

      return adapter.sendConversationTurn(input, context)
    },
    async sendWorkRun(input) {
      const adapter = getProviderAdapter(input.providerId)

      if (!adapter.sendConversationTurn) {
        throw new Error(`Work execution is not available for ${adapter.label} yet.`)
      }

      return adapter.sendConversationTurn(
        {
          turnId: input.runId,
          conversationId: input.workRequestId,
          providerId: input.providerId,
          model: input.model,
          sandbox: input.sandbox,
          workspaceRoot: input.workspaceRoot,
          agentName: input.agentName,
          agentRole: input.agentRole,
          instructions: input.instructions,
          providerSessionRef: input.providerSessionRef,
          message: buildWorkRunMessage(input),
          logRef: input.logRef,
          eventLogPath: input.eventLogPath,
          lastMessagePath: input.lastMessagePath
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

function buildWorkRunMessage(input: RuntimeWorkRunInput): string {
  return [
    `Work Item: ${input.title}`,
    '',
    'Workspace:',
    input.workspaceRoot,
    '',
    'Work Request artifact root:',
    input.workRequestArtifactRoot,
    '',
    'Suggested agent artifact folder:',
    input.agentArtifactDir,
    '',
    'Artifact rules:',
    '- Save shared or final deliverables in the Work Request artifact root.',
    '- Save role-specific or intermediate files in your suggested agent artifact folder.',
    '- If this Work Item naturally changes existing project files, write them in their normal project locations.',
    '- Report every user-facing artifact in artifactRefs and every created or modified file in changedFiles using workspace-relative paths.',
    '- Do not report a file path unless you actually created or modified that file in the workspace.',
    '',
    'Instruction:',
    input.instruction,
    '',
    'Expected output:',
    input.expectedOutput || 'Provide a concise result summary for this Work Item.',
    '',
    formatRequiredInputs(input.requiredInputs),
    '',
    'Read upstream files from the workspace when you need full detail. Do not assume the summary contains everything.',
    ...formatResumeMessage(input.resumeMessage),
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
