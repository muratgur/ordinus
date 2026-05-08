import type { ProviderId } from './contracts'

export type ProviderModelOption = {
  id: string
  label: string
  description: string
}

export const providerModelOptions = {
  codex: [
    {
      id: 'default',
      label: 'Default',
      description: 'Use the model selected by the Codex CLI.'
    },
    {
      id: 'gpt-5.4',
      label: 'GPT-5.4',
      description: 'Balanced reasoning for everyday agent work.'
    },
    {
      id: 'gpt-5.4-mini',
      label: 'GPT-5.4 Mini',
      description: 'Faster and lighter for routine drafting.'
    }
  ],
  claude: [
    {
      id: 'default',
      label: 'Default',
      description: 'Use the model selected by the Claude CLI.'
    },
    {
      id: 'claude-sonnet',
      label: 'Claude Sonnet',
      description: 'Balanced Claude model for most system AI work.'
    },
    {
      id: 'claude-opus',
      label: 'Claude Opus',
      description: 'Deeper reasoning when the local CLI supports it.'
    },
    {
      id: 'claude-haiku',
      label: 'Claude Haiku',
      description: 'Lower-latency option when the local CLI supports it.'
    }
  ],
  gemini: [
    {
      id: 'default',
      label: 'Default',
      description: 'Use the model selected by the Gemini CLI.'
    },
    {
      id: 'gemini-3.1-pro-preview',
      label: 'Gemini 3.1 Pro Preview',
      description: 'Latest preview model when the local CLI supports it.'
    },
    {
      id: 'gemini-3-flash-preview',
      label: 'Gemini 3 Flash Preview',
      description: 'Fast Gemini 3 preview model when the local CLI supports it.'
    },
    {
      id: 'gemini-2.5-pro',
      label: 'Gemini 2.5 Pro',
      description: 'Deeper reasoning model when the local CLI supports it.'
    },
    {
      id: 'gemini-2.5-flash',
      label: 'Gemini 2.5 Flash',
      description: 'Lower-latency Gemini model when the local CLI supports it.'
    }
  ]
} satisfies Record<ProviderId, ProviderModelOption[]>

export function getProviderModelOptions(providerId: ProviderId): ProviderModelOption[] {
  return providerModelOptions[providerId]
}

export function getDefaultModelForProvider(providerId: ProviderId): string {
  return getProviderModelOptions(providerId)[0].id
}

export function isKnownProviderModel(providerId: ProviderId, model: string): boolean {
  return getProviderModelOptions(providerId).some((option) => option.id === model)
}
