// ADR-040 §5: skill import. Two sources — a scan of the local CLI skill
// folders (Claude/Codex/Gemini homes plus the shared ~/.agents) and a
// user-picked folder. Imports are copies into the library's `imported` root;
// nothing is ever modified at the source. Every import goes through a
// show-and-confirm preview (the SKILL.md body is agent instructions — the
// user must read and trust it), with bundled executable files called out.

import {
  accessSync,
  constants,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync
} from 'node:fs'
import { homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import {
  LocalSkillCandidateSchema,
  SkillImportPreviewSchema,
  type LibrarySkill,
  type LocalSkillCandidate,
  type SkillImportPreview
} from '@shared/contracts'
import { slugifyPathSegment } from '../workspace/path-policy'
import { parseSkillDocument } from '../agents/filesystem'
import { getLibraryRoot, listLibrarySkills } from './library'

const skillFileName = 'SKILL.md'
// Caps keep a hostile or accidental pick (e.g. a home directory) from being
// copied into the library wholesale.
const maxSkillFiles = 64
const maxSkillBytes = 5_000_000

const localScanRoots = [
  { path: join(homedir(), '.claude', 'skills'), label: 'Claude (~/.claude/skills)' },
  { path: join(homedir(), '.codex', 'skills'), label: 'Codex (~/.codex/skills)' },
  { path: join(homedir(), '.gemini', 'skills'), label: 'Gemini (~/.gemini/skills)' },
  { path: join(homedir(), '.agents', 'skills'), label: 'Shared (~/.agents/skills)' }
]

export function scanLocalSkills(): LocalSkillCandidate[] {
  const candidates: LocalSkillCandidate[] = []
  for (const root of localScanRoots) {
    if (!existsSync(root.path)) {
      continue
    }
    for (const entry of readdirSync(root.path, { withFileTypes: true })) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) {
        continue
      }
      const sourcePath = join(root.path, entry.name)
      const metadata = readSkillMetadata(sourcePath)
      if (!metadata) {
        continue
      }
      candidates.push(
        LocalSkillCandidateSchema.parse({
          sourcePath,
          name: metadata.name,
          description: metadata.description,
          foundIn: root.label
        })
      )
    }
  }
  return candidates.sort((left, right) => left.name.localeCompare(right.name))
}

/** Show-and-confirm payload: the full body the user must read before
 * trusting, plus the bundled file list with executables flagged. */
export function previewImportSkill(sourcePath: string): SkillImportPreview {
  const skillRoot = assertImportableSkillRoot(sourcePath)
  const parsed = parseSkillDocument(readFileSync(join(skillRoot, skillFileName), 'utf8'))
  if (!parsed) {
    throw new Error('This folder does not contain a readable SKILL.md.')
  }

  const files = listSkillFiles(skillRoot).map((file) => ({
    name: file.relativeName,
    executable: file.executable
  }))

  return SkillImportPreviewSchema.parse({
    sourcePath: skillRoot,
    name: parsed.metadata.name,
    description: parsed.metadata.description,
    body: parsed.body,
    files
  })
}

export function importLibrarySkill(sourcePath: string): LibrarySkill {
  const skillRoot = assertImportableSkillRoot(sourcePath)
  const files = listSkillFiles(skillRoot)
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0)
  if (files.length > maxSkillFiles || totalBytes > maxSkillBytes) {
    throw new Error('This folder is too large to import as a skill.')
  }

  const importedRoot = join(getLibraryRoot(), 'imported')
  mkdirSync(importedRoot, { recursive: true })

  const skillId = getAvailableImportId(basename(skillRoot))
  const targetRoot = join(importedRoot, skillId)
  // dereference: a source assembled from symlinks lands as real files, so the
  // library copy cannot silently change when the linked source does.
  cpSync(skillRoot, targetRoot, { recursive: true, dereference: true })

  const imported = listLibrarySkills().find((skill) => skill.id === skillId)
  if (!imported) {
    rmSync(targetRoot, { recursive: true, force: true })
    throw new Error('The skill could not be imported.')
  }
  return imported
}

function assertImportableSkillRoot(sourcePath: string): string {
  const skillRoot = resolve(sourcePath)
  const stat = statSync(skillRoot, { throwIfNoEntry: false })
  if (!stat?.isDirectory()) {
    throw new Error('Pick a folder that contains a SKILL.md file.')
  }
  if (!existsSync(join(skillRoot, skillFileName))) {
    throw new Error('This folder does not contain a SKILL.md file.')
  }
  if (resolve(skillRoot).startsWith(resolve(getLibraryRoot()))) {
    throw new Error('This skill is already in the library.')
  }
  return skillRoot
}

function readSkillMetadata(skillRoot: string): { name: string; description: string } | null {
  const skillPath = join(skillRoot, skillFileName)
  if (!existsSync(skillPath)) {
    return null
  }
  try {
    return parseSkillDocument(readFileSync(skillPath, 'utf8'))?.metadata ?? null
  } catch {
    return null
  }
}

function listSkillFiles(
  skillRoot: string
): { relativeName: string; size: number; executable: boolean }[] {
  const files: { relativeName: string; size: number; executable: boolean }[] = []

  function walk(dir: string, prefix: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name)
      const relativeName = prefix ? `${prefix}/${entry.name}` : entry.name
      // Symlinks inside a skill folder are refused outright: a directory link
      // would bypass the size caps and the show-and-confirm file listing (the
      // import copy dereferences), silently pulling in arbitrary trees.
      if (entry.isSymbolicLink()) {
        throw new Error(
          `This folder contains a symlink (${relativeName}) and cannot be imported. Replace symlinks with real files first.`
        )
      }
      if (entry.isDirectory()) {
        walk(fullPath, relativeName)
        continue
      }
      const stat = statSync(fullPath, { throwIfNoEntry: false })
      if (!stat?.isFile()) {
        continue
      }
      files.push({
        relativeName,
        size: stat.size,
        executable: isExecutable(fullPath, relativeName)
      })
      if (files.length > maxSkillFiles) {
        throw new Error('This folder has too many files to import as a skill.')
      }
    }
  }

  walk(skillRoot, '')
  return files
}

const executableExtensions = /\.(sh|bash|zsh|py|rb|js|mjs|cjs|ts|pl|ps1|bat|cmd|exe)$/i

function isExecutable(fullPath: string, relativeName: string): boolean {
  if (executableExtensions.test(relativeName)) {
    return true
  }
  try {
    accessSync(fullPath, constants.X_OK)
    return true
  } catch {
    return false
  }
}

function getAvailableImportId(folderName: string): string {
  const baseId = slugifyPathSegment(folderName) || 'imported-skill'
  const taken = new Set(listLibrarySkills().map((skill) => skill.id))
  let candidate = baseId
  let suffix = 2
  while (taken.has(candidate)) {
    candidate = `${baseId}-${suffix}`
    suffix += 1
  }
  return candidate
}
