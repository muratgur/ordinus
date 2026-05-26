import { realpathSync, statSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { isAbsolute, relative, resolve } from 'node:path'

export type ExtraDirectoryErrorCode =
  | 'empty'
  | 'not_absolute'
  | 'null_bytes'
  | 'path_contains_comma'
  | 'not_found'
  | 'not_directory'
  | 'broken_symlink'
  | 'workspace_descendant'
  | 'workspace_ancestor'
  | 'workspace_not_configured'
  | 'denylisted'

export type ExtraDirectoryValidationResult =
  | { ok: true; resolvedPath: string }
  | { ok: false; code: ExtraDirectoryErrorCode; message: string }

const POSIX_DENYLIST = ['/', '/System', '/etc', '/usr', '/bin', '/sbin', '/var', '/private']

const denylist: string[] = (() => {
  const roots =
    platform() === 'win32'
      ? [
          process.env.SystemRoot || 'C:\\Windows',
          'C:\\',
          'C:\\Program Files',
          'C:\\Program Files (x86)'
        ]
      : POSIX_DENYLIST
  const home = homedir()
  return Array.from(new Set([...(home ? [home] : []), ...roots].map(normalizeForCompare)))
})()

function normalizeForCompare(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '') || path
  return platform() === 'win32' ? trimmed.toLowerCase() : trimmed
}

function pathsEqual(a: string, b: string): boolean {
  return normalizeForCompare(a) === normalizeForCompare(b)
}

function isAncestorOf(ancestor: string, candidate: string): boolean {
  const a = normalizeForCompare(ancestor)
  const c = normalizeForCompare(candidate)
  if (a === c) return false
  const rel = relative(a, c)
  return !!rel && !rel.startsWith('..') && !isAbsolute(rel)
}

export function validateExtraDirectoryPath(
  rawPath: string,
  workspaceRoot: string
): ExtraDirectoryValidationResult {
  if (!rawPath.trim()) {
    return { ok: false, code: 'empty', message: 'Path is empty.' }
  }
  if (rawPath.includes('\0')) {
    return { ok: false, code: 'null_bytes', message: 'Path contains null bytes.' }
  }
  if (!isAbsolute(rawPath)) {
    return { ok: false, code: 'not_absolute', message: 'Path must be absolute.' }
  }
  if (rawPath.includes(',')) {
    return {
      ok: false,
      code: 'path_contains_comma',
      message:
        'Path contains a comma, which conflicts with Gemini’s --include-directories flag format.'
    }
  }

  let resolvedPath: string
  try {
    resolvedPath = realpathSync(resolve(rawPath))
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      return { ok: false, code: 'not_found', message: 'Directory does not exist.' }
    }
    return {
      ok: false,
      code: 'broken_symlink',
      message: 'Could not resolve symlink target.'
    }
  }

  if (!statSync(resolvedPath).isDirectory()) {
    return { ok: false, code: 'not_directory', message: 'Path is not a directory.' }
  }

  const resolvedWorkspace = (() => {
    try {
      return realpathSync(resolve(workspaceRoot))
    } catch {
      return resolve(workspaceRoot)
    }
  })()

  if (
    pathsEqual(resolvedPath, resolvedWorkspace) ||
    isAncestorOf(resolvedWorkspace, resolvedPath)
  ) {
    return {
      ok: false,
      code: 'workspace_descendant',
      message: 'Path is inside the workspace — workspace files are already accessible.'
    }
  }

  if (isAncestorOf(resolvedPath, resolvedWorkspace)) {
    return {
      ok: false,
      code: 'workspace_ancestor',
      message: 'Path contains the workspace — this would break agent isolation.'
    }
  }

  if (denylist.some((entry) => pathsEqual(entry, resolvedPath))) {
    return {
      ok: false,
      code: 'denylisted',
      message:
        'Path is a system or home root. Pick a subdirectory instead of granting access to the entire root.'
    }
  }

  return { ok: true, resolvedPath }
}

export function pathExistsAsDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

export function partitionExtraDirectoriesByExistence(paths: string[]): {
  available: string[]
  missing: string[]
} {
  const available: string[] = []
  const missing: string[] = []
  for (const path of paths) {
    if (pathExistsAsDirectory(path)) {
      available.push(path)
    } else {
      missing.push(path)
    }
  }
  return { available, missing }
}
