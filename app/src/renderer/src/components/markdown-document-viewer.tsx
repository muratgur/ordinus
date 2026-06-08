import type { JSX } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Loader2, Save, X } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import { MarkdownDocument } from './markdown-document'

// ADR-030: the viewer is read-only and renders from two sources — an on-disk
// `.md` file, or a work run's database-backed result content. The result source
// can be materialized into a workspace file via "Save as".
export type MarkdownDocumentSource =
  | { kind: 'file'; path: string }
  | { kind: 'result'; runId: string; title: string; content: string }

type LoadStatus = 'loading' | 'ready' | 'error'
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

const closeAnimationMs = 280

export function MarkdownDocumentViewer({
  source,
  onClose
}: {
  source: MarkdownDocumentSource
  onClose: () => void
}): JSX.Element {
  const [visible, setVisible] = useState(false)
  const [status, setStatus] = useState<LoadStatus>(source.kind === 'result' ? 'ready' : 'loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [content, setContent] = useState(source.kind === 'result' ? source.content : '')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [savedPath, setSavedPath] = useState('')
  const closeTimer = useRef<number | null>(null)

  const title =
    source.kind === 'file' ? source.path.split(/[\\/]/).pop() || source.path : source.title

  useEffect(() => {
    if (source.kind !== 'file') {
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const result = await window.ordinus.files.read({ path: source.path })
        if (cancelled) return
        setContent(result.content)
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
  }, [source])

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

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') animateClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [animateClose])

  async function saveAs(): Promise<void> {
    if (source.kind !== 'result') return
    setSaveStatus('saving')
    setErrorMessage('')
    try {
      const result = await window.ordinus.workboard.saveRunResult({ runId: source.runId })
      setSavedPath(result.path)
      setSaveStatus('saved')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'This result could not be saved.')
      setSaveStatus('error')
    }
  }

  return (
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        aria-label="Close document viewer"
        onClick={animateClose}
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
            <p className="truncate text-sm font-semibold text-foreground" title={title}>
              {title}
            </p>
            {saveStatus === 'saved' && savedPath ? (
              <p className="truncate text-xs text-muted-foreground" title={savedPath}>
                Saved to {savedPath}
              </p>
            ) : null}
          </div>

          {source.kind === 'result' ? (
            <Button
              size="sm"
              variant={saveStatus === 'saved' ? 'outline' : 'default'}
              className="shrink-0"
              disabled={saveStatus === 'saving' || saveStatus === 'saved'}
              onClick={() => void saveAs()}
            >
              {saveStatus === 'saving' ? (
                <Loader2 className="animate-spin" />
              ) : saveStatus === 'saved' ? (
                <Check />
              ) : (
                <Save />
              )}
              {saveStatus === 'saved' ? 'Saved' : 'Save as file'}
            </Button>
          ) : null}

          <Button variant="ghost" size="icon" className="shrink-0" onClick={animateClose}>
            <X />
            <span className="sr-only">Close</span>
          </Button>
        </header>

        {saveStatus === 'error' ? (
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
            </div>
          ) : null}

          {status === 'ready' ? (
            <div className="h-full overflow-y-auto bg-muted/30 px-4 py-8 ordinus-scrollbar">
              <MarkdownDocument content={content} />
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}
