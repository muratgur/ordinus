import type { JSX } from 'react'
import { useState } from 'react'
import {
  Check,
  Copy,
  File,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType,
  FolderOpen
} from 'lucide-react'
import type { WorkboardRun } from '@shared/contracts'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import type { FileReference, RequestFileProvenance } from './file-reference-utils'
import { formatRelativeTime } from './file-reference-utils'

export function FileReferenceList({
  files,
  onRevealPath,
  onOpenFile
}: {
  files: FileReference[]
  onRevealPath: (path: string) => void
  onOpenFile?: (path: string) => void
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
          {onOpenFile && isMarkdownPath(file.path) ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              onClick={() => onOpenFile(file.path)}
            >
              <FileText />
              <span className="sr-only">Open document</span>
            </Button>
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
  runs,
  onRevealPath,
  onSelectRun,
  onOpenFile
}: {
  files: RequestFileProvenance[]
  missingPaths: Set<string>
  runs: WorkboardRun[]
  onRevealPath: (path: string) => void
  onSelectRun: (runId: string) => void
  onOpenFile?: (path: string) => void
}): JSX.Element {
  return (
    <ul className="grid min-w-0 gap-0.5">
      {files.map((file) => (
        <RequestFileRow
          key={normalizeFileReferenceKey(file.path)}
          file={file}
          missing={missingPaths.has(normalizeFileReferenceKey(file.path))}
          runs={runs}
          onRevealPath={onRevealPath}
          onSelectRun={onSelectRun}
          onOpenFile={onOpenFile}
        />
      ))}
    </ul>
  )
}

function RequestFileRow({
  file,
  missing,
  runs,
  onRevealPath,
  onSelectRun,
  onOpenFile
}: {
  file: RequestFileProvenance
  missing: boolean
  runs: WorkboardRun[]
  onRevealPath: (path: string) => void
  onSelectRun: (runId: string) => void
  onOpenFile?: (path: string) => void
}): JSX.Element {
  const [copied, setCopied] = useState(false)
  const isMarkdown = isMarkdownPath(file.path)
  const name = getFileDisplayName(file.path, file.inWorkFolder)
  const attribution = file.attributions[0]
  const sourceRun = attribution
    ? runs.find((candidate) => candidate.id === attribution.latestRunId)
    : undefined
  const verb = attribution?.kind === 'produced' ? 'Created' : 'Updated'
  const timeLabel = formatRelativeTime(file.lastTouchedAt)

  async function copyPath(): Promise<void> {
    try {
      await navigator.clipboard.writeText(file.path)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      setCopied(false)
    }
  }

  function openFile(): void {
    if (missing) return
    if (isMarkdown && onOpenFile) onOpenFile(file.path)
    else onRevealPath(file.path)
  }

  return (
    <li
      className={cn(
        'group flex min-w-0 items-start gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-accent/50',
        missing && 'opacity-50'
      )}
    >
      {renderFileIcon(file.path)}
      <div className="min-w-0 flex-1">
        <button
          type="button"
          className="block max-w-full truncate text-left text-sm font-medium text-foreground underline-offset-2 hover:text-primary hover:underline"
          title={file.path}
          onClick={openFile}
        >
          {name}
        </button>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          {sourceRun ? (
            <button
              type="button"
              className="min-w-0 max-w-full truncate transition-colors hover:text-foreground"
              onClick={() => onSelectRun(attribution.latestRunId)}
            >
              {sourceRun.title}
            </button>
          ) : null}
          {missing ? (
            <span>Missing</span>
          ) : timeLabel ? (
            <span className="shrink-0">
              {verb} {timeLabel}
            </span>
          ) : null}
        </div>
      </div>
      <span className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
        {isMarkdown && onOpenFile && !missing ? (
          <button
            type="button"
            className="rounded-md p-1 text-muted-foreground hover:text-foreground"
            onClick={() => onOpenFile(file.path)}
            aria-label="Open document"
          >
            <FileText className="size-3.5" />
          </button>
        ) : null}
        <button
          type="button"
          className="rounded-md p-1 text-muted-foreground hover:text-foreground"
          onClick={() => void copyPath()}
          aria-label="Copy file path"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </button>
        <button
          type="button"
          className="rounded-md p-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
          disabled={missing}
          onClick={() => onRevealPath(file.path)}
          aria-label="Show in file manager"
        >
          <FolderOpen className="size-3.5" />
        </button>
      </span>
    </li>
  )
}

function getFileDisplayName(path: string, inWorkFolder: boolean): string {
  const normalized = normalizeFileReferenceKey(path).replace(/\/+$/, '')
  const lastSlash = normalized.lastIndexOf('/')
  const base = normalized.slice(lastSlash + 1) || normalized
  if (inWorkFolder || lastSlash < 0) return base

  const parentStart = normalized.lastIndexOf('/', lastSlash - 1)
  const parent = normalized.slice(parentStart + 1, lastSlash)
  return parent ? `${parent}/${base}` : base
}

function renderFileIcon(path: string): JSX.Element {
  const className = 'mt-0.5 size-4 shrink-0 text-muted-foreground'
  const ext = path.toLowerCase().split('.').pop() ?? ''
  if (ext === 'pdf') return <FileType className={className} />
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'avif'].includes(ext)) {
    return <FileImage className={className} />
  }
  if (['csv', 'tsv', 'xlsx', 'xls'].includes(ext)) {
    return <FileSpreadsheet className={className} />
  }
  if (
    ['ts', 'tsx', 'js', 'jsx', 'py', 'json', 'sh', 'css', 'html', 'rb', 'go', 'rs'].includes(ext)
  ) {
    return <FileCode className={className} />
  }
  if (['md', 'txt', 'mdx'].includes(ext)) return <FileText className={className} />
  return <File className={className} />
}

function normalizeFileReferenceKey(path: string): string {
  return path.replaceAll('\\', '/')
}

function isMarkdownPath(path: string): boolean {
  return path.toLowerCase().endsWith('.md')
}
