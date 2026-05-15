import type { JSX } from 'react'
import { useState } from 'react'
import { Check, Copy, FolderOpen } from 'lucide-react'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import type { FileReference } from './file-reference-utils'

export function FileReferenceList({
  files,
  onRevealPath
}: {
  files: FileReference[]
  onRevealPath: (path: string) => void
}): JSX.Element {
  const [copiedPath, setCopiedPath] = useState('')

  async function copyPath(path: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(path)
      setCopiedPath(path)
      window.setTimeout(() => setCopiedPath((current) => (current === path ? '' : current)), 1400)
    } catch {
      setCopiedPath('')
    }
  }

  return (
    <div className="grid min-w-0 gap-2">
      {files.map((file) => (
        <div
          key={normalizeFileReferenceKey(file.path)}
          className="flex min-w-0 items-center justify-between gap-2 overflow-hidden rounded-md border bg-card px-2 py-1.5"
        >
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all font-mono text-xs leading-5 text-foreground [overflow-wrap:anywhere]">
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
            onClick={() => void copyPath(file.path)}
          >
            {copiedPath === file.path ? <Check /> : <Copy />}
            <span className="sr-only">Copy file path</span>
          </Button>
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

function normalizeFileReferenceKey(path: string): string {
  return path.replaceAll('\\', '/')
}
