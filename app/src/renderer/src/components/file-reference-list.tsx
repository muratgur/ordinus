import type { JSX } from 'react'
import { FolderOpen } from 'lucide-react'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'

export type FileReference = {
  path: string
  artifact: boolean
  changed: boolean
}

export function FileReferenceList({
  files,
  onRevealPath
}: {
  files: FileReference[]
  onRevealPath: (path: string) => void
}): JSX.Element {
  return (
    <div className="grid gap-2">
      {files.map((file) => (
        <div
          key={normalizeFileReferenceKey(file.path)}
          className="flex items-center justify-between gap-2 rounded-md border bg-card px-2 py-1.5"
        >
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all font-mono text-xs leading-5 text-foreground">
              {file.path}
            </code>
            <div className="flex shrink-0 flex-wrap gap-1">
              {file.artifact ? (
                <Badge variant="outline" className="px-2 py-0.5 text-[11px]">
                  Artifact
                </Badge>
              ) : null}
              {file.changed ? (
                <Badge variant="secondary" className="px-2 py-0.5 text-[11px]">
                  Changed
                </Badge>
              ) : null}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            onClick={() => onRevealPath(file.path)}
          >
            <FolderOpen />
            <span className="sr-only">Show in Finder</span>
          </Button>
        </div>
      ))}
    </div>
  )
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
