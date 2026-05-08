import type { ProviderId } from '@shared/contracts'
import { providerIds } from '../types'
import { claudeProviderAdapter } from './claude/adapter'
import { codexProviderAdapter } from './codex/adapter'
import { geminiProviderAdapter } from './gemini/adapter'
import type { ProviderAdapter } from './types'

export const providerRegistry: Record<ProviderId, ProviderAdapter> = {
  codex: codexProviderAdapter,
  claude: claudeProviderAdapter,
  gemini: geminiProviderAdapter
}

export function listProviderAdapters(): ProviderAdapter[] {
  return providerIds.map((providerId) => providerRegistry[providerId])
}

export function getProviderAdapter(providerId: ProviderId): ProviderAdapter {
  return providerRegistry[providerId]
}
