import type { JSX } from 'react'
import { useState } from 'react'
import { Check, Copy, FolderOpen } from 'lucide-react'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import type { FileReference, RequestFileProvenance } from './file-reference-utils'
import { formatRelativeTime } from './file-reference-utils'

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

export function RequestFileList({
  files,
  missingPaths,
  onRevealPath,
  onSelectRun
}: {
  files: RequestFileProvenance[]
  missingPaths: Set<string>
  onRevealPath: (path: string) => void
  onSelectRun: (runId: string) => void
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
      {files.map((file) => {
        const missing = missingPaths.has(normalizeFileReferenceKey(file.path))
        const touchedLabel = formatRelativeTime(file.lastTouchedAt)

        return (
          <div
            key={normalizeFileReferenceKey(file.path)}
            className={cn(
              'flex min-w-0 flex-col gap-1.5 rounded-md border bg-card px-2 py-1.5',
              missing && 'opacity-60'
            )}
          >
            <div className="flex min-w-0 items-center justify-between gap-2">
              <code className="min-w-0 flex-1 break-all font-mono text-xs leading-5 text-foreground [overflow-wrap:anywhere]">
                {file.path}
              </code>
              {missing ? (
                <Badge variant="outline" className="shrink-0 px-2 py-0.5 text-[11px]">
                  Missing
                </Badge>
              ) : null}
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
                disabled={missing}
                onClick={() => onRevealPath(file.path)}
              >
                <FolderOpen />
                <span className="sr-only">Show in file manager</span>
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {file.attributions.map((attribution) => (
                <button
                  key={attribution.agentName}
                  type="button"
                  className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  onClick={() => onSelectRun(attribution.latestRunId)}
                >
                  {attribution.kind === 'produced' ? 'Produced' : 'Changed'}:{' '}
                  {attribution.agentName}
                  {attribution.runCount > 1 ? (
                    <span className="tabular-nums text-muted-foreground/70">
                      · {attribution.runCount}
                    </span>
                  ) : null}
                </button>
              ))}
              {touchedLabel ? (
                <span className="ml-auto shrink-0 text-[11px] text-muted-foreground/70">
                  {touchedLabel}
                </span>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function normalizeFileReferenceKey(path: string): string {
  return path.replaceAll('\\', '/')
}
