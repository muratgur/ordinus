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
      id: 'gpt-5.6-sol',
      label: 'GPT-5.6 Sol',
      description: 'Flagship GPT-5.6 tier for the hardest coding and agent work.'
    },
    {
      id: 'gpt-5.6-terra',
      label: 'GPT-5.6 Terra',
      description: 'Balanced GPT-5.6 tier for everyday coding and professional work.'
    },
    {
      id: 'gpt-5.6-luna',
      label: 'GPT-5.6 Luna',
      description: 'Faster, lower-cost GPT-5.6 tier for routine agent tasks.'
    },
    {
      id: 'gpt-5.5',
      label: 'GPT-5.5',
      description: 'Previous-generation flagship; broadly available on all Codex accounts.'
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
      id: 'claude-fable-5',
      label: 'Claude Fable 5',
      description:
        'Pinned id for the most capable Claude model. Requires Claude Code 2.1.215 or newer.'
    },
    {
      id: 'claude-opus-4-8',
      label: 'Claude Opus 4.8',
      description: 'Pinned Claude API model id for complex reasoning and agentic coding.'
    },
    {
      id: 'claude-sonnet-5',
      label: 'Claude Sonnet 5',
      description: 'Pinned Claude API model id for speed and intelligence.'
    }
  ]
} satisfies Record<ProviderId, ProviderModelOption[]>

export function getProviderModelOptions(providerId: ProviderId): ProviderModelOption[] {
  return providerModelOptions[providerId]
}

/**
 * Factory default per provider. Deliberately NOT the 'default' option: users
 * typically start working without visiting settings, and 'default' delegates
 * the choice to whatever the CLI happens to have configured. 'default' remains
 * selectable for users who manage models in the CLI itself.
 *
 * Claude uses the 'sonnet' alias so the pick tracks new releases without code
 * changes; Codex has no aliases, so the pinned id below must be refreshed when
 * OpenAI moves its recommended default.
 */
const providerDefaultModel: Record<ProviderId, string> = {
  codex: 'gpt-5.5',
  claude: 'sonnet'
}

export function getDefaultModelForProvider(providerId: ProviderId): string {
  return providerDefaultModel[providerId]
}

export function isKnownProviderModel(providerId: ProviderId, model: string): boolean {
  return getProviderModelOptions(providerId).some((option) => option.id === model)
}
