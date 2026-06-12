import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
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
  ensureClaudeSkillsLink(getAgentHome(agent.id))
}

// ADR-040: Claude Code natively loads `.claude/skills/` inside any --add-dir
// directory, and the agent home is already passed that way. A single symlink
// makes the canonical skills root discoverable without prompt instructions.
export function ensureClaudeSkillsLink(agentHomePath: string): void {
  const skillsRoot = join(agentHomePath, 'skills')
  const claudeDir = join(agentHomePath, '.claude')
  const linkPath = join(claudeDir, 'skills')

  mkdirSync(skillsRoot, { recursive: true })
  mkdirSync(claudeDir, { recursive: true })

  try {
    const existing = lstatSync(linkPath, { throwIfNoEntry: false })
    if (existing?.isSymbolicLink()) {
      if (resolve(claudeDir, readlinkSync(linkPath)) === resolve(skillsRoot)) {
        return
      }
      rmSync(linkPath)
    } else if (existing) {
      // A real directory here would shadow the canonical store; replace it.
      rmSync(linkPath, { recursive: true, force: true })
    }
    // 'junction' keeps Windows working without elevation; POSIX treats it as 'dir'.
    symlinkSync(skillsRoot, linkPath, 'junction')
  } catch {
    // Best-effort: discovery degrades to "no skills" rather than failing the turn.
  }
}

// ADR-040: a skill folder entry is a real directory (the agent's own skill) or
// a symlink (an assigned library skill) — readdir's withFileTypes reports
// symlinks as non-directories, so every skill listing must accept both.
function listSkillEntryNames(skillsRoot: string): string[] {
  if (!existsSync(skillsRoot)) {
    return []
  }
  return readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
    .map((entry) => entry.name)
}

// ADR-040: frontmatter inventory for providers without native external skill
// discovery (Codex). Keyed by home path because runtime adapters do not know
// agent ids; `id` is the skill folder name.
export function listSkillsForPrompt(
  agentHomePath: string
): { id: string; name: string; description: string; skillPath: string }[] {
  const skillsRoot = join(agentHomePath, 'skills')

  return listSkillEntryNames(skillsRoot)
    .flatMap((entryName) => {
      const skillPath = join(skillsRoot, entryName, skillFileName)
      if (!existsSync(skillPath)) {
        return []
      }
      const metadata = parseSkillMetadata(readFileSync(skillPath, 'utf8'))
      return metadata
        ? [{ id: entryName, name: metadata.name, description: metadata.description, skillPath }]
        : []
    })
    .sort((left, right) => left.name.localeCompare(right.name))
}

// ADR-040: skill set snapshot for stale-session detection — skillId → SKILL.md
// mtime (ms, as string). Stored per session as the "announced" set; resumes
// diff against it so an open Codex session learns about added/updated/removed
// skills without resending the full inventory.
export function listSkillFingerprints(agentHomePath: string): Record<string, string> {
  const skillsRoot = join(agentHomePath, 'skills')

  const fingerprints: Record<string, string> = {}
  for (const entryName of listSkillEntryNames(skillsRoot)) {
    const stat = statSync(join(skillsRoot, entryName, skillFileName), { throwIfNoEntry: false })
    if (stat?.isFile()) {
      fingerprints[entryName] = String(stat.mtimeMs)
    }
  }
  return fingerprints
}

export type SkillFingerprintDiff = {
  addedIds: string[]
  updatedIds: string[]
  removedIds: string[]
}

export function diffSkillFingerprints(
  previous: Record<string, string> | null,
  current: Record<string, string>
): SkillFingerprintDiff {
  const before = previous ?? {}
  const addedIds: string[] = []
  const updatedIds: string[] = []
  for (const [id, mtime] of Object.entries(current)) {
    if (!(id in before)) {
      addedIds.push(id)
    } else if (before[id] !== mtime) {
      updatedIds.push(id)
    }
  }
  const removedIds = Object.keys(before).filter((id) => !(id in current))
  return { addedIds, updatedIds, removedIds }
}

export function listAgentSkills(agentId: string): AgentSkill[] {
  const skillsRoot = getAgentSkillsRoot(agentId)
  mkdirSync(skillsRoot, { recursive: true })

  return listSkillEntryNames(skillsRoot)
    .map((entryName) => readSkillSummary(skillsRoot, entryName))
    .filter((skill): skill is AgentSkill => Boolean(skill))
    .sort((left, right) => left.name.localeCompare(right.name))
}

// ADR-040: assign a library skill by symlinking its folder into the agent's
// skills root. The symlink is the assignment record; removing it unassigns
// without touching the library copy.
export function assignLibrarySkillToAgent(agentId: string, librarySkillRoot: string): AgentSkill {
  const skillsRoot = getAgentSkillsRoot(agentId)
  mkdirSync(skillsRoot, { recursive: true })

  const skillId = basename(librarySkillRoot)
  const linkPath = resolveInside(skillsRoot, skillId)
  const existing = lstatSync(linkPath, { throwIfNoEntry: false })
  if (existing) {
    // A dangling assignment (target gone after an app update) is invisible in
    // listings — re-assigning is the recovery path, so replace it.
    const isDanglingLink = existing.isSymbolicLink() && !existsSync(join(linkPath, skillFileName))
    if (!isDanglingLink) {
      throw new Error('This agent already has a skill with that name.')
    }
    // unlink, not rmSync({force}): rmSync stats THROUGH the link, sees the
    // missing target, and silently no-ops — leaving the dangling link behind.
    unlinkSync(linkPath)
  }

  symlinkSync(librarySkillRoot, linkPath, 'junction')

  const skill = readSkillSummary(skillsRoot, skillId)
  if (!skill) {
    rmSync(linkPath, { force: true })
    throw new Error('Library skill could not be assigned.')
  }

  return skill
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
  // ADR-040: an assigned library skill is a symlink — writing through it would
  // edit the shared library copy for every agent. Copy & customize instead.
  if (isLibraryAssignment(skillRoot)) {
    throw new Error('Library skills cannot be edited here. Copy it to this agent first.')
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
  // A dangling assignment (library target removed, e.g. by an app update) must
  // still be removable — existsSync follows the symlink and would report it as
  // missing, locking the entry forever.
  const isDanglingLink =
    !existsSync(skillPath) &&
    (lstatSync(skillRoot, { throwIfNoEntry: false })?.isSymbolicLink() ?? false)
  if (!existsSync(skillPath) && !isDanglingLink) {
    throw new Error('Skill was not found.')
  }

  if (isDanglingLink) {
    // rmSync({force}) stats THROUGH the link and silently no-ops on a missing
    // target; unlink removes the link itself.
    unlinkSync(skillRoot)
    return { deletedSkillId: input.skillId }
  }

  // ADR-040: for a library assignment this removes only the symlink (unassign);
  // rmSync never follows symlinks, so the library copy is safe either way.
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
    updatedAt: stat.mtime.toISOString(),
    source: isLibraryAssignment(skillRoot) ? 'library' : 'own'
  })
}

function isLibraryAssignment(skillRoot: string): boolean {
  return lstatSync(skillRoot, { throwIfNoEntry: false })?.isSymbolicLink() ?? false
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
    source: isLibraryAssignment(skillRoot) ? 'library' : 'own',
    body: parsed.body
  })
}

function parseSkillMetadata(content: string): { name: string; description: string } | null {
  return parseSkillDocument(content)?.metadata ?? null
}

export function parseSkillDocument(
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
