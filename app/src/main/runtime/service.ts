import { z } from 'zod'
import {
  AgentDraftFromIntentInputSchema,
  ProviderActionInputSchema,
  ProviderConnectInputSchema,
  ProviderIdSchema,
  type AgentDraft,
  type ProviderActionInput,
  type ProviderConnectInput,
  type ProviderConnectResult,
  type ProviderStatus
} from '@shared/contracts'
import { providerIds, type RuntimeEventListener, type RuntimeProviderCapabilities } from './types'
import { getProviderAdapter, listProviderAdapters } from './adapters/registry'
import type {
  ProviderRuntimeContext,
  RuntimeAgentDraftInput,
  RuntimeConversationTurnInput,
  RuntimeConversationTurnResult
} from './adapters/types'

const RuntimeAgentDraftInputSchema = AgentDraftFromIntentInputSchema.extend({
  providerId: ProviderIdSchema,
  model: z.string().trim().min(1).default('default')
})

export type RuntimeService = {
  readonly ready: boolean
  getProviderCapabilities(): readonly RuntimeProviderCapabilities[]
  getProviderStatuses(): Promise<ProviderStatus[]>
  refreshProvider(input: ProviderActionInput): Promise<ProviderStatus>
  connectProvider(input: ProviderConnectInput): Promise<ProviderConnectResult>
  generateAgentDraft(input: RuntimeAgentDraftInput): Promise<AgentDraft>
  sendConversationTurn(input: RuntimeConversationTurnInput): Promise<RuntimeConversationTurnResult>
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
    async sendConversationTurn(input) {
      const adapter = getProviderAdapter(input.providerId)

      if (!adapter.sendConversationTurn) {
        throw new Error(`Direct conversations are not available for ${adapter.label} yet.`)
      }

      return adapter.sendConversationTurn(input, context)
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
