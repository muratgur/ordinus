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
  AgentSkillDetailSchema,
  AgentSkillSchema,
  type Agent,
  type AgentSkill,
  type AgentSkillCreateInput,
  type AgentSkillDeleteInput,
  type AgentSkillDeleteResult,
  type AgentSkillDetail,
  type AgentSkillGetInput,
  type AgentSkillUpdateInput
} from '@shared/contracts'
import { getSystemPaths } from '../paths'
import { slugifyPathSegment } from '../workspace/path-policy'

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
  writeFileSync(skillPath, buildSkillDocument(input.name, input.description ?? '', input.body), {
    encoding: 'utf8',
    flag: 'wx'
  })

  const skill = readSkillSummary(skillsRoot, skillId)
  if (!skill) {
    throw new Error('Skill could not be created.')
  }

  return skill
}

export function getAgentSkill(input: AgentSkillGetInput): AgentSkillDetail {
  const skillsRoot = getAgentSkillsRoot(input.agentId)
  mkdirSync(skillsRoot, { recursive: true })

  return readSkillDetail(skillsRoot, input.skillId)
}

export function updateAgentSkill(input: AgentSkillUpdateInput): AgentSkill {
  const skillsRoot = getAgentSkillsRoot(input.agentId)
  mkdirSync(skillsRoot, { recursive: true })

  const skillRoot = resolveInside(skillsRoot, input.skillId)
  const skillPath = join(skillRoot, skillFileName)
  if (!existsSync(skillPath)) {
    throw new Error('Skill was not found.')
  }

  writeFileSync(skillPath, buildSkillDocument(input.name, input.description ?? '', input.body), {
    encoding: 'utf8'
  })

  const skill = readSkillSummary(skillsRoot, input.skillId)
  if (!skill) {
    throw new Error('Skill could not be saved.')
  }

  return skill
}

export function deleteAgentSkill(input: AgentSkillDeleteInput): AgentSkillDeleteResult {
  const skillsRoot = getAgentSkillsRoot(input.agentId)
  mkdirSync(skillsRoot, { recursive: true })

  const skillRoot = resolveInside(skillsRoot, input.skillId)
  const skillPath = join(skillRoot, skillFileName)
  if (!existsSync(skillPath)) {
    throw new Error('Skill was not found.')
  }

  rmSync(skillRoot, { recursive: true, force: true })

  return { deletedSkillId: input.skillId }
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
  const metadata = parseSkillMetadata(content)
  if (!metadata) {
    return null
  }

  return AgentSkillSchema.parse({
    id: skillId,
    name: metadata.name,
    description: metadata.description,
    relativePath: toRelativeSkillPath(skillsRoot, skillPath),
    updatedAt: stat.mtime.toISOString()
  })
}

function readSkillDetail(skillsRoot: string, skillId: string): AgentSkillDetail {
  const skillRoot = resolveInside(skillsRoot, skillId)
  const skillPath = join(skillRoot, skillFileName)

  if (!existsSync(skillPath)) {
    throw new Error('Skill was not found.')
  }

  const stat = statSync(skillPath)
  const content = readFileSync(skillPath, 'utf8')
  const parsed = parseSkillDocument(content)
  if (!parsed) {
    throw new Error('Skill metadata could not be read.')
  }

  return AgentSkillDetailSchema.parse({
    id: skillId,
    name: parsed.metadata.name,
    description: parsed.metadata.description,
    relativePath: toRelativeSkillPath(skillsRoot, skillPath),
    updatedAt: stat.mtime.toISOString(),
    body: parsed.body
  })
}

function parseSkillMetadata(content: string): { name: string; description: string } | null {
  return parseSkillDocument(content)?.metadata ?? null
}

function parseSkillDocument(
  content: string
): { metadata: { name: string; description: string }; body: string } | null {
  const lines = content.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') {
    return null
  }

  const endIndex = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
  if (endIndex < 0) {
    return null
  }

  const frontmatter = new Map<string, string>()
  lines.slice(1, endIndex).forEach((line) => {
    const match = /^([a-zA-Z][a-zA-Z0-9_-]*):\s*(.*)$/.exec(line)
    if (!match) {
      return
    }
    frontmatter.set(match[1].toLowerCase(), parseFrontmatterValue(match[2]))
  })

  const name = cleanOneLine(frontmatter.get('name') ?? '')
  if (!name) {
    return null
  }

  return {
    metadata: {
      name,
      description: cleanOneLine(frontmatter.get('description') ?? '')
    },
    body: lines
      .slice(endIndex + 1)
      .join('\n')
      .trimStart()
  }
}

function buildSkillDocument(name: string, description: string, body?: string): string {
  const safeName = cleanOneLine(name)
  const safeDescription = cleanOneLine(description)
  const safeBody = body?.trim() || buildDefaultSkillBody(safeName)

  return [
    '---',
    `name: ${formatFrontmatterValue(safeName)}`,
    `description: ${formatFrontmatterValue(
      safeDescription || 'Describe when this skill should be used.'
    )}`,
    '---',
    '',
    safeBody
  ].join('\n')
}

function buildDefaultSkillBody(name: string): string {
  return [
    `# ${name}`,
    '',
    '## When To Use',
    '',
    '- Use this skill when it directly matches the task.',
    '',
    '## Workflow',
    '',
    '1. Read the user request and identify the relevant context.',
    '2. Apply this skill only within its intended scope.',
    '3. Summarize what changed and how the result was verified.',
    '',
    '## Boundaries',
    '',
    '- Do not use this skill when it does not match the task.'
  ].join('\n')
}

function cleanOneLine(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function formatFrontmatterValue(value: string): string {
  return JSON.stringify(cleanOneLine(value))
}

function parseFrontmatterValue(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    try {
      const parsed = JSON.parse(trimmed) as unknown
      return typeof parsed === 'string' ? parsed : String(parsed)
    } catch {
      return trimmed.slice(1, -1)
    }
  }

  return trimmed
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

function slugify(value: string): string {
  return slugifyPathSegment(value.trim())
}
