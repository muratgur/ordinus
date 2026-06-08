// ADR-029 §6 / M8 — User-facing memory panel.
//
// Lists every ordinus_memory entry, lets the user add, edit (via upsert),
// and delete. Same underlying table the memory_search / memory_write MCP
// tools read and write — this is just the human's editorial surface so they
// can audit and curate what Ordinus remembers about them. ADR §6 explicitly
// rules out silent auto-learning; the panel here makes that observability
// concrete.
//
// Mounted as a Dialog from the Home section header — out of the user's way
// during normal conversation, one click to inspect.

import { useEffect, useState } from 'react'
import { Brain, Plus, Trash2, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { notify } from '@renderer/lib/notifications'
import type { OrdinusMemoryEntry } from '@shared/contracts'

export type HomeMemoryPanelProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function HomeMemoryPanel(props: HomeMemoryPanelProps): React.JSX.Element {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="size-4 text-primary" /> Ordinus memory
          </DialogTitle>
          <DialogDescription>
            Things Ordinus remembers about you across conversations. Add notes here, or ask Ordinus
            to remember something — they end up in the same place.
          </DialogDescription>
        </DialogHeader>
        {/* Re-mount the body whenever the panel opens so we always show fresh
            entries. Cheap (a small list), avoids polling while closed. */}
        {props.open ? <MemoryPanelBody /> : null}
      </DialogContent>
    </Dialog>
  )
}

function MemoryPanelBody(): React.JSX.Element {
  const [entries, setEntries] = useState<OrdinusMemoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  // Inline-add draft state. Empty until the user clicks "+ New", then a
  // tiny form appears at the top of the list.
  const [draftType, setDraftType] = useState('preference')
  const [draftName, setDraftName] = useState('')
  const [draftBody, setDraftBody] = useState('')

  const [refreshTick, setRefreshTick] = useState(0)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const list = await window.ordinus.ordinus.listMemory()
        if (!cancelled) {
          // Newest updates first (the DB returns by updatedAt asc, so flip).
          setEntries([...list].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)))
        }
      } catch (err) {
        if (!cancelled) {
          notify.error({
            title: 'Could not load memory',
            description: err instanceof Error ? err.message : String(err)
          })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refreshTick])

  function refresh(): void {
    setRefreshTick((v) => v + 1)
  }

  async function handleAdd(): Promise<void> {
    const type = draftType.trim() || 'preference'
    const name = draftName.trim()
    const body = draftBody.trim()
    if (!name || !body) return
    setBusyId('draft')
    try {
      await window.ordinus.ordinus.writeMemory({ type, name, body })
      setDraftName('')
      setDraftBody('')
      setAdding(false)
      refresh()
      notify.success({ title: 'Memory saved' })
    } catch (err) {
      notify.error({
        title: 'Could not save memory',
        description: err instanceof Error ? err.message : String(err)
      })
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(id: string): Promise<void> {
    setBusyId(id)
    try {
      await window.ordinus.ordinus.deleteMemory({ id })
      setEntries((prev) => prev.filter((entry) => entry.id !== id))
      notify.success({ title: 'Memory deleted' })
    } catch (err) {
      notify.error({
        title: 'Could not delete',
        description: err instanceof Error ? err.message : String(err)
      })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {entries.length === 0
            ? 'No memories yet.'
            : `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`}
        </span>
        {adding ? null : (
          <Button type="button" size="sm" variant="secondary" onClick={() => setAdding(true)}>
            <Plus className="size-3.5" /> New
          </Button>
        )}
      </div>

      {adding ? (
        <div className="grid gap-2 rounded-md border bg-card/50 p-3">
          <div className="grid grid-cols-[120px_1fr] gap-2">
            <Input
              value={draftType}
              onChange={(event) => setDraftType(event.target.value)}
              placeholder="preference"
              maxLength={40}
              disabled={busyId !== null}
            />
            <Input
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              placeholder="favorite-editor, project:redesign, …"
              maxLength={120}
              disabled={busyId !== null}
            />
          </div>
          <textarea
            value={draftBody}
            onChange={(event) => setDraftBody(event.target.value)}
            placeholder="One or two sentences. Keep it terse — every entry rides in Ordinus's prompt."
            rows={3}
            maxLength={2000}
            disabled={busyId !== null}
            className="rounded-md border bg-background px-3 py-2 text-sm leading-6 placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setAdding(false)
                setDraftName('')
                setDraftBody('')
              }}
              disabled={busyId !== null}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void handleAdd()}
              disabled={busyId !== null || !draftName.trim() || !draftBody.trim()}
            >
              Save
            </Button>
          </div>
        </div>
      ) : null}

      <div className="ordinus-scrollbar max-h-[420px] overflow-y-auto rounded-md border">
        {loading ? (
          <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Loading…
          </div>
        ) : entries.length === 0 ? (
          <div className="px-3 py-4 text-sm text-muted-foreground">
            Nothing here yet. Tell Ordinus to &ldquo;remember that …&rdquo; during a conversation,
            or click New above.
          </div>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-start gap-3 border-b px-3 py-3 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {entry.type}
                  </span>
                  <span className="truncate text-sm font-medium">{entry.name}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/90">{entry.body}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                onClick={() => void handleDelete(entry.id)}
                disabled={busyId !== null}
                title="Delete"
                aria-label="Delete memory entry"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
