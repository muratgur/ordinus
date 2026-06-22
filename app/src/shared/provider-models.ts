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
      id: 'gpt-5.5',
      label: 'GPT-5.5',
      description: 'Flagship OpenAI model for complex coding and agent work.'
    },
    {
      id: 'gpt-5.4',
      label: 'GPT-5.4',
      description: 'Balanced OpenAI model for everyday coding and professional work.'
    },
    {
      id: 'gpt-5.4-mini',
      label: 'GPT-5.4 mini',
      description: 'Lower-latency OpenAI model for routine agent tasks.'
    }
  ],
  claude: [
    {
      id: 'default',
      label: 'Default',
      description: 'Use the model selected by the Claude CLI.'
    },
    {
      id: 'sonnet',
      label: 'Sonnet',
      description: 'Claude Code alias for the latest Sonnet model available to the account.'
    },
    {
      id: 'opus',
      label: 'Opus',
      description: 'Claude Code alias for the latest Opus model available to the account.'
    },
    {
      id: 'haiku',
      label: 'Haiku',
      description: 'Claude Code alias for the fastest Claude model available to the account.'
    },
    {
      id: 'opusplan',
      label: 'Opus plan',
      description: 'Claude Code planning mode that uses Opus for planning and Sonnet for execution.'
    },
    {
      id: 'claude-opus-4-7',
      label: 'Claude Opus 4.7',
      description: 'Pinned Claude API model id for complex reasoning and agentic coding.'
    },
    {
      id: 'claude-sonnet-4-6',
      label: 'Claude Sonnet 4.6',
      description: 'Pinned Claude API model id for speed and intelligence.'
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
