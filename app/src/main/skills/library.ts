// ADR-040: shared skill library. Builtin skills ship with the app and are
// synced to userData on every launch (one source of truth, refreshed by app
// updates); imported skills land beside them via the import flow. Assignment
// to an agent is a symlink in the agent's skills folder — see
// agents/filesystem.ts.

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  LibrarySkillDetailSchema,
  LibrarySkillSchema,
  type LibrarySkill,
  type LibrarySkillDetail
} from '@shared/contracts'
import { getSystemPaths } from '../paths'
import { parseSkillDocument } from '../agents/filesystem'
import { builtinSkills } from './builtin-content'

const skillFileName = 'SKILL.md'

export function getLibraryRoot(): string {
  return join(getSystemPaths().userData, 'skills-library')
}

function getOriginRoot(origin: 'builtin' | 'imported'): string {
  return join(getLibraryRoot(), origin)
}

/** Called once on app launch: materialize the app-shipped skills to disk so
 * external CLI processes can read them (bundled app code is not readable by
 * child processes). Overwrites unconditionally — builtin skills are not
 * user-editable, so the shipped content is always authoritative. */
export function syncBuiltinLibrarySkills(): void {
  const root = getOriginRoot('builtin')
  for (const skill of builtinSkills) {
    const skillRoot = join(root, skill.id)
    mkdirSync(skillRoot, { recursive: true })
    for (const file of skill.files) {
      const filePath = join(skillRoot, file.name)
      // Write only on real change: SKILL.md mtimes feed the announced-skills
      // fingerprints, and an unconditional rewrite would make every open Codex
      // session re-announce all builtins as "updated" after each app launch.
      if (existsSync(filePath) && readFileSync(filePath, 'utf8') === file.content) {
        continue
      }
      writeFileSync(filePath, file.content, 'utf8')
    }
  }
}

export function listLibrarySkills(): LibrarySkill[] {
  const origins: Array<'builtin' | 'imported'> = ['builtin', 'imported']
  const skills: LibrarySkill[] = []
  for (const origin of origins) {
    const originRoot = getOriginRoot(origin)
    if (!existsSync(originRoot)) {
      continue
    }
    for (const entry of readdirSync(originRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue
      }
      const summary = readLibrarySkillSummary(origin, entry.name)
      if (summary) {
        skills.push(summary)
      }
    }
  }
  return skills.sort((left, right) => left.name.localeCompare(right.name))
}

export function getLibrarySkill(librarySkillId: string): LibrarySkillDetail {
  const located = locateLibrarySkill(librarySkillId)
  if (!located) {
    throw new Error('Library skill was not found.')
  }

  const content = readFileSync(located.skillPath, 'utf8')
  const parsed = parseSkillDocument(content)
  if (!parsed) {
    throw new Error('Library skill metadata could not be read.')
  }

  return LibrarySkillDetailSchema.parse({
    id: librarySkillId,
    name: parsed.metadata.name,
    description: parsed.metadata.description,
    origin: located.origin,
    updatedAt: statSync(located.skillPath).mtime.toISOString(),
    body: parsed.body
  })
}

/** Absolute folder of a library skill — the symlink target for assignment. */
export function getLibrarySkillRoot(librarySkillId: string): string {
  const located = locateLibrarySkill(librarySkillId)
  if (!located) {
    throw new Error('Library skill was not found.')
  }
  return located.skillRoot
}

export function getBuiltinSkillIds(): string[] {
  return builtinSkills.map((skill) => skill.id)
}

function locateLibrarySkill(
  librarySkillId: string
): { origin: 'builtin' | 'imported'; skillRoot: string; skillPath: string } | null {
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(librarySkillId)) {
    throw new Error('Library skill id is not a safe folder name.')
  }
  for (const origin of ['builtin', 'imported'] as const) {
    const skillRoot = join(getOriginRoot(origin), librarySkillId)
    const skillPath = join(skillRoot, skillFileName)
    if (existsSync(skillPath)) {
      return { origin, skillRoot, skillPath }
    }
  }
  return null
}

function readLibrarySkillSummary(
  origin: 'builtin' | 'imported',
  librarySkillId: string
): LibrarySkill | null {
  const skillPath = join(getOriginRoot(origin), librarySkillId, skillFileName)
  if (!existsSync(skillPath)) {
    return null
  }
  const metadata = parseSkillDocument(readFileSync(skillPath, 'utf8'))?.metadata
  if (!metadata) {
    return null
  }
  return LibrarySkillSchema.parse({
    id: librarySkillId,
    name: metadata.name,
    description: metadata.description,
    origin,
    updatedAt: statSync(skillPath).mtime.toISOString()
  })
}
