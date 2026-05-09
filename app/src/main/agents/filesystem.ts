import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { join, relative, resolve } from 'node:path'
import {
  AgentSkillSchema,
  type Agent,
  type AgentSkill,
  type AgentSkillCreateInput
} from '@shared/contracts'
import { getSystemPaths } from '../paths'

const skillFileName = 'SKILL.md'

export function ensureAgentHome(agent: Pick<Agent, 'id'>): void {
  mkdirSync(getAgentSkillsRoot(agent.id), { recursive: true })
}

export function listAgentSkills(agentId: string): AgentSkill[] {
  const skillsRoot = getAgentSkillsRoot(agentId)
  mkdirSync(skillsRoot, { recursive: true })

  return readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readSkillSummary(skillsRoot, entry.name))
    .filter((skill): skill is AgentSkill => Boolean(skill))
    .sort((left, right) => left.name.localeCompare(right.name))
}

export function createAgentSkill(input: AgentSkillCreateInput): AgentSkill {
  const skillsRoot = getAgentSkillsRoot(input.agentId)
  mkdirSync(skillsRoot, { recursive: true })

  const skillId = getAvailableSkillId(skillsRoot, input.name)
  const skillRoot = resolveInside(skillsRoot, skillId)
  const skillPath = join(skillRoot, skillFileName)

  mkdirSync(skillRoot, { recursive: true })
  writeFileSync(skillPath, buildSkillTemplate(input.name.trim(), input.description ?? ''), {
    encoding: 'utf8',
    flag: 'wx'
  })

  const skill = readSkillSummary(skillsRoot, skillId)
  if (!skill) {
    throw new Error('Skill could not be created.')
  }

  return skill
}

export function getAgentHome(agentId: string): string {
  return join(getAgentsRoot(), assertSafeSegment(agentId, 'Agent id'))
}

export function deleteAgentHome(agentId: string): void {
  rmSync(getAgentHome(agentId), { recursive: true, force: true })
}

export function getAgentSkillsRoot(agentId: string): string {
  return join(getAgentHome(agentId), 'skills')
}

function getAgentsRoot(): string {
  return join(getSystemPaths().userData, 'agents')
}

function readSkillSummary(skillsRoot: string, skillId: string): AgentSkill | null {
  const skillRoot = resolveInside(skillsRoot, skillId)
  const skillPath = join(skillRoot, skillFileName)

  if (!existsSync(skillPath)) {
    return null
  }

  const stat = statSync(skillPath)
  const content = readFileSync(skillPath, 'utf8')
  const { name, description } = parseSkillMetadata(content)

  return AgentSkillSchema.parse({
    id: skillId,
    name: name || titleFromId(skillId),
    description,
    relativePath: toRelativeSkillPath(skillsRoot, skillPath),
    updatedAt: stat.mtime.toISOString()
  })
}

function parseSkillMetadata(content: string): { name: string; description: string } {
  const lines = content.split(/\r?\n/)
  const titleLine = lines.find((line) => /^#\s+/.test(line))
  const descriptionLine = lines.find((line) => /^description:\s*/i.test(line))

  return {
    name: titleLine?.replace(/^#\s+/, '').trim() ?? '',
    description: descriptionLine?.replace(/^description:\s*/i, '').trim() ?? ''
  }
}

function buildSkillTemplate(name: string, description: string): string {
  const safeName = cleanOneLine(name)
  const safeDescription = cleanOneLine(description)

  return [
    `# ${safeName}`,
    '',
    `description: ${safeDescription || 'Describe when this skill should be used.'}`,
    '',
    '## When To Use',
    '',
    '- Use this skill when it directly matches the task.',
    '',
    '## Workflow',
    '',
    '1. Read the user request and identify the relevant context.',
    '2. Apply this skill only within its intended scope.',
    '3. Summarize what changed and how the result was verified.'
  ].join('\n')
}

function cleanOneLine(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function getAvailableSkillId(skillsRoot: string, name: string): string {
  const baseId = slugify(name) || 'skill'
  let candidate = baseId
  let suffix = 2

  while (existsSync(resolveInside(skillsRoot, candidate))) {
    candidate = `${baseId}-${suffix}`
    suffix += 1
  }

  return candidate
}

function resolveInside(root: string, segment: string): string {
  const safeSegment = assertSafeSegment(segment, 'Path segment')
  const resolvedRoot = resolve(root)
  const resolvedPath = resolve(resolvedRoot, safeSegment)
  const relativePath = relative(resolvedRoot, resolvedPath)

  if (
    relativePath.startsWith('..') ||
    relativePath === '' ||
    resolve(relativePath) === relativePath
  ) {
    throw new Error('Path must stay inside the agent folder.')
  }

  return resolvedPath
}

function toRelativeSkillPath(skillsRoot: string, filePath: string): string {
  return relative(skillsRoot, filePath)
    .split(/[\\/]+/)
    .join('/')
}

function assertSafeSegment(value: string, label: string): string {
  const segment = value.trim()
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(segment)) {
    throw new Error(`${label} is not a safe folder name.`)
  }
  return segment
}

function titleFromId(value: string): string {
  return value
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
