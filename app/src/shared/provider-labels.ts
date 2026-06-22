import type { ProviderId } from './contracts'

export const providerDisplayNames = {
  codex: 'Codex',
  claude: 'Claude'
} satisfies Record<ProviderId, string>

export function getProviderDisplayName(providerId: ProviderId): string {
  return providerDisplayNames[providerId]
}
