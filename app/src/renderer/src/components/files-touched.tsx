// ADR-035 — collapsed "what did they do?" row for transcript surfaces.
// Bare by default; expands into a flat divided list (no card-in-card).
// Shared by the agent room and the Home transcript.

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { FileReferenceList } from './file-reference-list'
import { getFileReferences } from './file-reference-utils'

export function FilesTouched({
  artifactRefs,
  changedFiles,
  onReveal
}: {
  artifactRefs: string[]
  changedFiles: string[]
  onReveal: (path: string) => void
}): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  const files = getFileReferences(artifactRefs, changedFiles)

  if (files.length === 0) {
    return null
  }

  return (
    <div className="ml-0.5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        {files.length} file{files.length === 1 ? '' : 's'} touched
      </button>
      {open ? (
        <div className="mt-1 border-l-2 border-primary/20 pl-3">
          <FileReferenceList files={files} onRevealPath={onReveal} variant="plain" />
        </div>
      ) : null}
    </div>
  )
}
