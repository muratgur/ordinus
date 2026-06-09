import { existsSync, mkdirSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'

// ADR-031: capitalized, human-readable buckets directly under the workspace
// root. The root is the user's own area; everything Ordinus creates lives in one
// of these three buckets. The keys are stable internal module ids; only the
// folder names changed.
export const workspaceModuleFolders = {
  conversations: 'Conversations',
  workboard: 'Projects',
  schedules: 'Schedules',
  // ADR-029: Ordinus assistant turns are scoped to their own folder so they
  // don't collide with agent conversations and so future workspace cleanups
  // can target them as a unit.
  ordinus: 'Ordinus'
} as const

export type WorkspaceModule = keyof typeof workspaceModuleFolders

const defaultModuleNames: Record<WorkspaceModule, string> = {
  conversations: 'Conversation',
  workboard: 'Work request',
  schedules: 'Scheduled job',
  ordinus: 'Ordinus'
}

export type WorkingRootReservation = (workspaceRelativePath: string) => boolean

export type WorkspaceWorkingFolderContext = {
  workspaceRoot: string
  workingRoot: string
}

export type ResolvedWorkspaceRefs = {
  existingRefs: string[]
  missingRefs: string[]
}

export function createConversationWorkingRoot(
  workspaceRoot: string,
  title: string,
  isReserved?: WorkingRootReservation
): string {
  return allocateModuleWorkingRoot(workspaceRoot, 'conversations', title, isReserved)
}

export function createWorkboardWorkingRoot(
  workspaceRoot: string,
  title: string,
  isReserved?: WorkingRootReservation
): string {
  return allocateModuleWorkingRoot(workspaceRoot, 'workboard', title, isReserved)
}

export function createScheduleWorkingRoot(
  workspaceRoot: string,
  title: string,
  isReserved?: WorkingRootReservation
): string {
  return allocateModuleWorkingRoot(workspaceRoot, 'schedules', title, isReserved)
}

// Unlike conversations/workboard/schedules, Ordinus turns share ONE working
// folder for the whole app. Ordinus drives work through MCP tools rather than
// writing files, so per-conversation subfolders only produced empty scratch
// dirs. A single `<workspace>/Ordinus/` cwd keeps the sandbox isolation (any
// stray file write still lands in a folder we own) without the clutter.
export function getOrdinusWorkingRoot(): string {
  return workspaceModuleFolders.ordinus
}

// ADR-031: module working folders use human-readable, title-based names with no
// id suffix. Uniqueness is guaranteed by a Finder-style numeric suffix on
// collision ("Snake game", "Snake game 2", …). The folder name is computed once
// at creation; identity lives in the database `workingRoot`, not the name, so a
// later title edit does not rename or move the folder.
//
// `isReserved` lets the caller exclude names already claimed by other Work
// Requests / conversations in the database — necessary because folders are
// created lazily at run start (they are not yet on disk when this runs). The
// on-disk check additionally avoids colliding with the user's own folders.
export function allocateModuleWorkingRoot(
  workspaceRoot: string,
  module: WorkspaceModule,
  title: string,
  isReserved: WorkingRootReservation = () => false
): string {
  const bucket = workspaceModuleFolders[module]
  const base = humanizePathSegment(title) || defaultModuleNames[module]

  let candidate = `${bucket}/${base}`
  let counter = 2
  while (isWorkingRootTaken(workspaceRoot, candidate, isReserved)) {
    candidate = `${bucket}/${base} ${counter}`
    counter += 1
  }
  return candidate
}

function isWorkingRootTaken(
  workspaceRoot: string,
  candidate: string,
  isReserved: WorkingRootReservation
): boolean {
  if (isReserved(candidate)) {
    return true
  }
  if (!workspaceRoot) {
    return false
  }
  return workspaceRelativePathExists(workspaceRoot, candidate)
}

export function ensureWorkspaceRelativeDirectory(
  workspaceRoot: string,
  relativePath: string
): string {
  const absolutePath = resolveWorkspaceRelativePath(workspaceRoot, relativePath)
  mkdirSync(absolutePath, { recursive: true })
  return absolutePath
}

export function resolveWorkspaceRelativePath(workspaceRoot: string, relativePath: string): string {
  assertWorkspaceRelativePath(relativePath)

  const absolutePath = resolve(workspaceRoot, relativePath)
  const relativeToWorkspace = relative(workspaceRoot, absolutePath)
  if (
    !relativeToWorkspace ||
    relativeToWorkspace.startsWith('..') ||
    isAbsolute(relativeToWorkspace)
  ) {
    throw new Error('File path must stay inside the workspace.')
  }

  return absolutePath
}

export function filterExistingWorkspacePaths(
  workspaceRoot: string,
  relativePaths: string[]
): string[] {
  return relativePaths.filter((path) => workspaceRelativePathExists(workspaceRoot, path))
}

export function resolveReportedWorkspaceFileRefs(
  refs: string[],
  context: WorkspaceWorkingFolderContext
): ResolvedWorkspaceRefs {
  const existingRefs: string[] = []
  const missingRefs: string[] = []

  refs.forEach((ref) => {
    const existingRef = findExistingWorkspaceRef(ref, context)
    if (existingRef) {
      existingRefs.push(existingRef)
      return
    }

    missingRefs.push(ref)
  })

  return {
    existingRefs: Array.from(new Set(existingRefs)),
    missingRefs: Array.from(new Set(missingRefs))
  }
}

// Turkish-specific folds applied BEFORE NFKD. Most accented Latin letters
// decompose to ASCII + a combining mark that we strip, but Turkish dotless
// '\u0131' has no decomposition \u2014 so without this map it survives NFKD and then
// gets dropped entirely by the [^a-z0-9] filter (while dotted '\u0130' folds to
// 'i'), producing the asymmetric character loss we saw in folder names.
const turkishCharFolds: Record<string, string> = {
  ı: 'i',
  İ: 'i',
  ş: 's',
  Ş: 's',
  ğ: 'g',
  Ğ: 'g',
  ç: 'c',
  Ç: 'c',
  ö: 'o',
  Ö: 'o',
  ü: 'u',
  Ü: 'u'
}

export function slugifyPathSegment(value: string): string {
  return value
    .replace(
      /[\u0131\u0130\u015f\u015e\u011f\u011e\u00e7\u00c7\u00f6\u00d6\u00fc\u00dc]/g,
      (char) => turkishCharFolds[char] ?? char
    )
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '')
}

// ADR-031: produce a human-readable folder name from a title. Unlike
// slugifyPathSegment (which lowercases and dash-joins for agent-home folders),
// this preserves the user's words, spacing, and case, removing only characters
// that are unsafe or awkward in a filesystem path segment.
export function humanizePathSegment(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .replace(/\.+$/, '')
    .trim()
    .slice(0, 60)
    .trim()
}

function findExistingWorkspaceRef(
  relativePath: string,
  context: WorkspaceWorkingFolderContext
): string {
  const candidates = Array.from(new Set([relativePath, `${context.workingRoot}/${relativePath}`]))

  return (
    candidates.find((candidate) => {
      try {
        return existsSync(resolveWorkspaceRelativePath(context.workspaceRoot, candidate))
      } catch {
        return false
      }
    }) ?? ''
  )
}

function workspaceRelativePathExists(workspaceRoot: string, relativePath: string): boolean {
  try {
    return existsSync(resolveWorkspaceRelativePath(workspaceRoot, relativePath))
  } catch {
    return false
  }
}

function assertWorkspaceRelativePath(relativePath: string): void {
  if (!relativePath.trim()) {
    throw new Error('File path is required.')
  }
  if (relativePath.includes('\0')) {
    throw new Error('File path cannot contain null bytes.')
  }
  if (/^(?:[a-zA-Z]:|[\\/])/.test(relativePath)) {
    throw new Error('File path must be workspace-relative.')
  }
  if (relativePath.split(/[\\/]+/).some((segment) => segment === '..')) {
    throw new Error('File path cannot contain parent directory segments.')
  }
}
