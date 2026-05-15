export type FileReference = {
  path: string
  artifact: boolean
  changed: boolean
}

export function getFileReferences(artifactRefs: string[], changedFiles: string[]): FileReference[] {
  const files = new Map<string, FileReference>()

  for (const path of artifactRefs) {
    upsertFileReference(files, path, 'artifact')
  }

  for (const path of changedFiles) {
    upsertFileReference(files, path, 'changed')
  }

  return Array.from(files.values())
}

function upsertFileReference(
  files: Map<string, FileReference>,
  path: string,
  kind: 'artifact' | 'changed'
): void {
  const key = normalizeFileReferenceKey(path)
  const current = files.get(key) ?? { path, artifact: false, changed: false }

  files.set(key, {
    ...current,
    artifact: current.artifact || kind === 'artifact',
    changed: current.changed || kind === 'changed'
  })
}

function normalizeFileReferenceKey(path: string): string {
  return path.replaceAll('\\', '/')
}
