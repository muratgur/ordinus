import { existsSync, mkdirSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'

export const workspaceModuleFolders = {
  conversations: 'conversations',
  workboard: 'workboard',
  schedules: 'schedules',
  // ADR-029: Ordinus assistant turns are scoped to their own folder so they
  // don't collide with agent conversations and so future workspace cleanups
  // can target them as a unit.
  ordinus: 'ordinus'
} as const

export type WorkspaceModule = keyof typeof workspaceModuleFolders

export type WorkspaceWorkingFolderContext = {
  workspaceRoot: string
  workingRoot: string
}

export type ResolvedWorkspaceRefs = {
  existingRefs: string[]
  missingRefs: string[]
}

export function createConversationWorkingRoot(title: string, conversationId: string): string {
  return createModuleWorkingRoot('conversations', title || 'conversation', conversationId)
}

export function createWorkboardWorkingRoot(title: string, requestId: string): string {
  return createModuleWorkingRoot('workboard', title || 'work-request', requestId)
}

export function createScheduleWorkingRoot(title: string, scheduledJobId: string): string {
  return createModuleWorkingRoot('schedules', title || 'scheduled-job', scheduledJobId)
}

export function createOrdinusWorkingRoot(title: string, conversationId: string): string {
  return createModuleWorkingRoot('ordinus', title || 'conversation', conversationId)
}

export function createModuleWorkingRoot(
  module: WorkspaceModule,
  title: string,
  stableId: string
): string {
  const slug = slugifyPathSegment(title) || module
  return `${workspaceModuleFolders[module]}/${slug}-${shortStableId(stableId)}`
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

export function slugifyPathSegment(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '')
}

export function shortStableId(value: string): string {
  return (
    value
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(-6)
      .toLowerCase() || '000000'
  )
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
