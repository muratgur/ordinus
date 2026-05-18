import { app } from 'electron'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { renderAgentProfileInstructions } from '@shared/agent-profile-template'
import {
  AgentProfileCatalogSchema,
  AgentProfileSchema,
  type AgentDraft,
  type AgentProfile,
  type AgentProfileCatalog,
  type ProviderId
} from '@shared/contracts'

type ProfileDraftDefaults = {
  providerId: ProviderId
  model: string
  makeUniqueName: (name: string) => string
}

export function listAgentProfiles(): AgentProfileCatalog {
  const profilesRoot = getProfilesRoot()
  if (!existsSync(profilesRoot)) {
    return AgentProfileCatalogSchema.parse({ categories: [], profiles: [] })
  }

  const profiles = readdirSync(profilesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((categoryEntry) => readCategoryProfiles(profilesRoot, categoryEntry.name))
    .sort((left, right) => {
      const categorySort = left.category.localeCompare(right.category)
      return categorySort || left.name.localeCompare(right.name)
    })

  const counts = new Map<string, number>()
  profiles.forEach((profile) =>
    counts.set(profile.category, (counts.get(profile.category) ?? 0) + 1)
  )

  return AgentProfileCatalogSchema.parse({
    categories: [...counts.entries()]
      .map(([id, count]) => ({ id, label: titleFromId(id), count }))
      .sort((left, right) => left.label.localeCompare(right.label)),
    profiles
  })
}

export function getAgentProfile(profileId: string): AgentProfile {
  const profile = listAgentProfiles().profiles.find((candidate) => candidate.id === profileId)
  if (!profile) {
    throw new Error('Agent profile was not found.')
  }
  return profile
}

export function buildAgentDraftFromProfile(
  profile: AgentProfile,
  defaults: ProfileDraftDefaults
): AgentDraft {
  return {
    requestedWork: `Create an agent from the ${profile.name} profile.`,
    name: defaults.makeUniqueName(profile.name),
    role: profile.role,
    instructions: profile.instructions,
    providerId: defaults.providerId,
    model: defaults.model,
    sandbox: 'workspace-write',
    connectors: profile.suggestedConnectors,
    enabled: true
  }
}

export function buildBlankAgentDraft(defaults: ProfileDraftDefaults): AgentDraft {
  const name = defaults.makeUniqueName('New agent')

  return {
    requestedWork: 'Create a custom agent from a blank draft.',
    name,
    role: 'Custom agent',
    instructions: renderAgentProfileInstructions({
      name,
      sections: {
        archetypalIdentity:
          'Describe what kind of agent this is, what perspective it brings to the work, and how it should understand its role.',
        roleAndSocialFunction:
          'Describe what this agent is responsible for, which problems it helps with, and how it makes work clearer for the user or team.',
        personalityTraits: [
          'Describe the first working trait this agent should consistently show.',
          'Describe how the agent should handle uncertainty, pressure, or ambiguity.',
          'Describe what the agent should pay attention to while doing the work.'
        ],
        communicationTone:
          'Describe how this agent should speak, ask questions, structure answers, and report progress.',
        strengths: [
          'Describe a concrete capability this agent should bring to the workspace.',
          'Describe another strength that helps the agent produce useful outcomes.',
          'Describe how the agent should verify, summarize, or make its work observable.'
        ],
        boundaries:
          'Describe what this agent must not decide, promise, assume, access, or change without user direction.',
        relationshipWithOtherAgents:
          'Describe how this agent should collaborate with other agents, hand off work, or ask for a better-suited role when needed.'
      }
    }),
    providerId: defaults.providerId,
    model: defaults.model,
    sandbox: 'workspace-write',
    connectors: [],
    enabled: true
  }
}

function readCategoryProfiles(profilesRoot: string, category: string): AgentProfile[] {
  const categoryRoot = join(profilesRoot, category)

  return readdirSync(categoryRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => readProfileFile(categoryRoot, category, entry.name))
}

function readProfileFile(categoryRoot: string, category: string, fileName: string): AgentProfile {
  const filePath = join(categoryRoot, fileName)
  const parsed = parseMarkdownProfile(readFileSync(filePath, 'utf8'), filePath)
  const fallbackId = `${category}/${basename(fileName, '.md')}`

  return AgentProfileSchema.parse({
    id: parsed.frontmatter.id ?? fallbackId,
    category: parsed.frontmatter.category ?? category,
    name: parsed.frontmatter.name,
    role: parsed.frontmatter.role,
    summary: parsed.frontmatter.summary,
    tags: parsed.frontmatter.tags ?? [],
    recommended: parsed.frontmatter.recommended ?? false,
    suggestedConnectors: parsed.frontmatter.suggestedConnectors ?? [],
    instructions: parsed.body.trim()
  })
}

function parseMarkdownProfile(
  content: string,
  filePath = 'Profile Markdown'
): {
  frontmatter: Record<string, unknown>
  body: string
} {
  const normalized = content.replace(/^\uFEFF/, '')
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(normalized)
  if (!match) {
    throw new Error(`${filePath} must start with closed frontmatter.`)
  }

  const frontmatterText = match[1]
  const body = normalized.slice(match[0].length)

  return {
    frontmatter: parseFrontmatter(frontmatterText),
    body
  }
}

function parseFrontmatter(value: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  const lines = value.split(/\r?\n/)

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line.trim()) {
      continue
    }

    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
    if (!match) {
      throw new Error(`Unsupported profile frontmatter line: ${line}`)
    }

    const [, key, rawValue] = match
    if (rawValue.trim() === '') {
      const items: string[] = []
      while (index + 1 < lines.length) {
        const nextLine = lines[index + 1]
        const itemMatch = /^\s*-\s+(.+)$/.exec(nextLine)
        if (!itemMatch) {
          break
        }
        items.push(parseScalar(itemMatch[1]) as string)
        index += 1
      }
      result[key] = items
    } else {
      result[key] = parseScalar(rawValue)
    }
  }

  return result
}

function parseScalar(value: string): string | boolean {
  const trimmed = value.trim()
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  return trimmed.replace(/^["']|["']$/g, '')
}

function getProfilesRoot(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'profiles')
  }

  const appPath = join(app.getAppPath(), 'resources', 'profiles')
  if (existsSync(appPath)) {
    return appPath
  }

  return join(process.cwd(), 'resources', 'profiles')
}

function titleFromId(value: string): string {
  return value
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}
