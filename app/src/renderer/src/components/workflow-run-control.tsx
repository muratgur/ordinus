import { useMemo, useState } from 'react'
import { ChevronDown, Loader2, Play, Sparkles, Target } from 'lucide-react'
import type { WorkflowRunTarget, WorkRequest } from '@shared/contracts'
import { Button } from '@renderer/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'

/** Split Run button with per-workflow target memory (IDE run-config style, ADR-026). */
export function RunControl({
  requests,
  running,
  disabled,
  lastTargetRequest,
  defaultTarget,
  onRun
}: {
  requests: WorkRequest[]
  running: boolean
  disabled: boolean
  lastTargetRequest: WorkRequest | null
  defaultTarget: WorkflowRunTarget
  onRun: (target: WorkflowRunTarget) => void
}): React.JSX.Element {
  const [pickerOpen, setPickerOpen] = useState(false)
  const targetLabel =
    defaultTarget.kind === 'append' && lastTargetRequest ? lastTargetRequest.title : 'a new request'

  return (
    <div className="flex items-stretch overflow-hidden rounded-md shadow-lg">
      <Button
        className="rounded-none rounded-l-md"
        disabled={running || disabled}
        onClick={() => onRun(defaultTarget)}
      >
        {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
        <span className="max-w-[12rem] truncate">
          {running ? 'Kicking off…' : `Run · ${targetLabel}`}
        </span>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            className="rounded-none rounded-r-md border-l border-primary-foreground/20 px-2"
            disabled={running || disabled}
            aria-label="Choose where to run"
          >
            <ChevronDown className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top">
          <DropdownMenuLabel>Where should this run?</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => onRun({ kind: 'new' })}>
            <Sparkles className="size-4" /> As a new request
          </DropdownMenuItem>
          {lastTargetRequest ? (
            <DropdownMenuItem
              onSelect={() => onRun({ kind: 'append', requestId: lastTargetRequest.id })}
            >
              <Target className="size-4" /> Again on “{lastTargetRequest.title}”
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setPickerOpen(true)}>
            <Target className="size-4" /> Add to an existing request…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ExistingRequestPicker
        open={pickerOpen}
        requests={requests}
        onOpenChange={setPickerOpen}
        onPick={(requestId) => {
          setPickerOpen(false)
          onRun({ kind: 'append', requestId })
        }}
      />
    </div>
  )
}

function ExistingRequestPicker({
  open,
  requests,
  onOpenChange,
  onPick
}: {
  open: boolean
  requests: WorkRequest[]
  onOpenChange: (open: boolean) => void
  onPick: (requestId: string) => void
}): React.JSX.Element {
  const [showArchived, setShowArchived] = useState(false)
  const visible = useMemo(
    () =>
      requests
        .filter((request) => (showArchived ? true : !request.archivedAt))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [requests, showArchived]
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0">
        <DialogHeader className="border-b px-5 py-3">
          <DialogTitle>Add to an existing request</DialogTitle>
          <DialogDescription>The steps join that request as a new group of work.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between px-5 py-2">
          <span className="text-xs text-muted-foreground">
            {visible.length} request{visible.length === 1 ? '' : 's'}
          </span>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(event) => setShowArchived(event.target.checked)}
            />
            Show archived
          </label>
        </div>
        <div className="ordinus-scrollbar max-h-80 overflow-y-auto px-2 pb-3">
          {visible.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">
              No requests to add to yet.
            </p>
          ) : (
            visible.map((request) => (
              <button
                key={request.id}
                type="button"
                onClick={() => onPick(request.id)}
                className="flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left transition-colors hover:bg-accent"
              >
                <span className="flex w-full items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {request.title}
                  </span>
                  {request.archivedAt ? (
                    <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                      Archived
                    </span>
                  ) : null}
                </span>
                <span className="text-xs text-muted-foreground">
                  {request.status} · {new Date(request.createdAt).toLocaleString()}
                </span>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
