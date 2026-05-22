import type { JSX } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Eye, Loader2, Pencil, Save, X } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { cn } from '@renderer/lib/utils'
import { MarkdownDocument } from './markdown-document'
import { MarkdownEditor } from './markdown-editor'

type LoadStatus = 'loading' | 'ready' | 'error'
type ViewMode = 'read' | 'edit'

const closeAnimationMs = 280

export function MarkdownDocumentViewer({
  path,
  onClose
}: {
  path: string
  onClose: () => void
}): JSX.Element {
  const [visible, setVisible] = useState(false)
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [content, setContent] = useState('')
  const [draft, setDraft] = useState('')
  const [revision, setRevision] = useState('')
  const [mode, setMode] = useState<ViewMode>('read')
  const [saving, setSaving] = useState(false)
  const [conflictRevision, setConflictRevision] = useState<string | null>(null)
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false)
  const closeTimer = useRef<number | null>(null)

  const fileName = path.split(/[\\/]/).pop() || path
  const dirty = status === 'ready' && draft !== content

  const loadFile = useCallback(async (): Promise<void> => {
    try {
      const result = await window.ordinus.files.read({ path })
      setContent(result.content)
      setDraft(result.content)
      setRevision(result.revision)
      setStatus('ready')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'This file could not be opened.')
      setStatus('error')
    }
  }, [path])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const result = await window.ordinus.files.read({ path })
        if (cancelled) return
        setContent(result.content)
        setDraft(result.content)
        setRevision(result.revision)
        setStatus('ready')
      } catch (error) {
        if (cancelled) return
        setErrorMessage(error instanceof Error ? error.message : 'This file could not be opened.')
        setStatus('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [path])

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true))
    return () => {
      cancelAnimationFrame(frame)
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
    }
  }, [])

  const animateClose = useCallback((): void => {
    setVisible(false)
    closeTimer.current = window.setTimeout(onClose, closeAnimationMs)
  }, [onClose])

  function requestClose(): void {
    if (dirty) {
      setCloseConfirmOpen(true)
      return
    }
    animateClose()
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') requestClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  async function persist(expectedRevision: string): Promise<void> {
    setSaving(true)
    setErrorMessage('')
    try {
      const result = await window.ordinus.files.write({ path, content: draft, expectedRevision })
      if (result.status === 'conflict') {
        setConflictRevision(result.revision)
        return
      }
      setContent(draft)
      setRevision(result.revision)
      setConflictRevision(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'This file could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  async function reloadFromDisk(): Promise<void> {
    setConflictRevision(null)
    setStatus('loading')
    await loadFile()
  }

  function retryLoad(): void {
    setStatus('loading')
    void loadFile()
  }

  return (
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        aria-label="Close document viewer"
        onClick={requestClose}
        className={cn(
          'absolute inset-0 bg-background/60 backdrop-blur-[1px] transition-opacity duration-300',
          visible ? 'opacity-100' : 'opacity-0'
        )}
      />
      <section
        className={cn(
          'absolute inset-0 flex flex-col overflow-hidden bg-background shadow-2xl transition-transform duration-300 ease-out',
          visible ? 'translate-y-0' : 'translate-y-full'
        )}
      >
        <header className="flex shrink-0 items-center gap-3 border-b bg-card px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground" title={path}>
              {fileName}
              {dirty ? <span className="ml-2 text-xs text-muted-foreground">• Unsaved</span> : null}
            </p>
          </div>

          {status === 'ready' ? (
            <div className="flex shrink-0 items-center rounded-md border bg-background p-0.5">
              <ModeButton
                active={mode === 'read'}
                icon={<Eye />}
                label="Read"
                onClick={() => setMode('read')}
              />
              <ModeButton
                active={mode === 'edit'}
                icon={<Pencil />}
                label="Edit"
                onClick={() => setMode('edit')}
              />
            </div>
          ) : null}

          {status === 'ready' && mode === 'edit' ? (
            <Button
              size="sm"
              className="shrink-0"
              disabled={!dirty || saving}
              onClick={() => void persist(revision)}
            >
              {saving ? <Loader2 className="animate-spin" /> : <Save />}
              Save
            </Button>
          ) : null}

          <Button variant="ghost" size="icon" className="shrink-0" onClick={requestClose}>
            <X />
            <span className="sr-only">Close</span>
          </Button>
        </header>

        {errorMessage && status === 'ready' ? (
          <p className="shrink-0 border-b bg-destructive/10 px-4 py-2 text-xs text-destructive">
            {errorMessage}
          </p>
        ) : null}

        <div className="min-h-0 flex-1">
          {status === 'loading' ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : null}

          {status === 'error' ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-sm text-muted-foreground">{errorMessage}</p>
              <Button variant="outline" size="sm" onClick={retryLoad}>
                Try again
              </Button>
            </div>
          ) : null}

          {status === 'ready' && mode === 'read' ? (
            <div className="h-full overflow-y-auto bg-muted/30 px-4 py-8 ordinus-scrollbar">
              <MarkdownDocument content={draft} />
            </div>
          ) : null}

          {status === 'ready' && mode === 'edit' ? (
            <MarkdownEditor value={draft} onChange={setDraft} />
          ) : null}
        </div>
      </section>

      <Dialog open={closeConfirmOpen} onOpenChange={setCloseConfirmOpen}>
        <DialogContent hideClose>
          <DialogHeader>
            <DialogTitle>Discard unsaved changes?</DialogTitle>
            <DialogDescription>
              This document has changes that have not been saved. Closing now will lose them.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseConfirmOpen(false)}>
              Keep editing
            </Button>
            <Button
              onClick={() => {
                setCloseConfirmOpen(false)
                animateClose()
              }}
            >
              Discard and close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={conflictRevision !== null}
        onOpenChange={(open) => {
          if (!open) setConflictRevision(null)
        }}
      >
        <DialogContent hideClose>
          <DialogHeader>
            <DialogTitle>This file changed on disk</DialogTitle>
            <DialogDescription>
              {fileName} was modified while you were editing it. Overwrite it with your version, or
              reload the version on disk and lose your changes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => void reloadFromDisk()}>
              Reload from disk
            </Button>
            <Button
              disabled={saving}
              onClick={() => {
                if (conflictRevision) void persist(conflictRevision)
              }}
            >
              {saving ? <Loader2 className="animate-spin" /> : null}
              Overwrite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ModeButton({
  active,
  icon,
  label,
  onClick
}: {
  active: boolean
  icon: JSX.Element
  label: string
  onClick: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors',
        active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      <span className="[&_svg]:size-3.5">{icon}</span>
      {label}
    </button>
  )
}
