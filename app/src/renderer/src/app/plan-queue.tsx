import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, CheckCircle2, Inbox, Loader2, X } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import { appRoutePaths } from './routes'
import { useLiveness } from './liveness'
import type { PlanOperation, PlanOperationsController } from './plan-operations'

function statusMeta(status: PlanOperation['status']): {
  label: string
  className: string
} {
  if (status === 'ready') {
    return { label: 'Ready', className: 'text-status-positive' }
  }
  if (status === 'failed') {
    return { label: 'Failed', className: 'text-status-attention' }
  }
  return { label: 'Working on your plan…', className: 'text-muted-foreground' }
}

function StatusIcon({ status }: { status: PlanOperation['status'] }): React.JSX.Element {
  if (status === 'ready') {
    return <CheckCircle2 className="size-4 text-status-positive" />
  }
  if (status === 'failed') {
    return <AlertCircle className="size-4 text-status-attention" />
  }
  return <Loader2 className="size-4 animate-spin text-muted-foreground" />
}

function GeneratingStatus({ createdAt }: { createdAt: number }): React.JSX.Element {
  const { phase, reassurance, elapsedLabel } = useLiveness(createdAt, true)

  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{phase}</p>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {elapsedLabel}
        </span>
      </div>
      {reassurance ? <p className="mt-0.5 text-xs text-muted-foreground">{reassurance}</p> : null}
    </div>
  )
}

export function PlanQueue({
  planOperations,
  onReview
}: {
  planOperations: PlanOperationsController
  onReview: (operation: PlanOperation) => void
}): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const { operations, dismissPlanOp, retryPlanOp, removePersisted } = planOperations

  if (operations.length === 0) {
    return null
  }

  const generatingCount = operations.filter((op) => op.status === 'generating').length
  const readyCount = operations.filter((op) => op.status === 'ready').length
  const failedCount = operations.filter((op) => op.status === 'failed').length

  const summaryParts: string[] = []
  if (readyCount > 0) summaryParts.push(`${readyCount} ready`)
  if (generatingCount > 0) summaryParts.push(`${generatingCount} generating`)
  if (failedCount > 0) summaryParts.push(`${failedCount} failed`)

  function handleReview(operation: PlanOperation): void {
    onReview(operation)
    setOpen(false)
    void navigate(appRoutePaths.workboard)
  }

  function handleDiscard(operation: PlanOperation): void {
    if (operation.persistedId) {
      removePersisted(operation.persistedId)
    } else {
      dismissPlanOp(operation.id)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Plan queue"
        className="flex h-[30px] items-center gap-1.5 rounded-md border border-transparent px-2 text-xs text-muted-foreground transition-colors hover:border-border hover:bg-accent hover:text-foreground"
      >
        {generatingCount > 0 ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Inbox className="size-3.5" />
        )}
        <span className="tabular-nums">{summaryParts.join(' · ') || 'Plans'}</span>
      </button>

      {open
        ? createPortal(
            <div className="fixed inset-0 z-50">
              <button
                type="button"
                className="absolute inset-0 bg-background/60 backdrop-blur-[1px]"
                aria-label="Close plan queue"
                onClick={() => setOpen(false)}
              />
              <aside className="absolute inset-y-0 right-0 flex w-full flex-col border-l bg-background shadow-2xl sm:w-[86vw] sm:max-w-[520px]">
                <div className="flex items-center justify-between border-b px-5 py-4">
                  <div>
                    <p className="text-sm font-semibold">Plans</p>
                    <p className="text-xs text-muted-foreground">
                      Background plan generation. Ready plans wait here until you review or discard
                      them.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Close"
                    className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                <div className="ordinus-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
                  {operations.map((operation) => {
                    const meta = statusMeta(operation.status)
                    return (
                      <div key={operation.id} className="grid gap-2 rounded-lg border bg-card p-3">
                        <div className="flex items-start gap-2">
                          <StatusIcon status={operation.status} />
                          <div className="min-w-0 flex-1">
                            {operation.status === 'generating' ? (
                              <GeneratingStatus createdAt={operation.createdAt} />
                            ) : (
                              <p className={cn('text-xs font-medium', meta.className)}>
                                {meta.label}
                              </p>
                            )}
                            <p className="mt-0.5 line-clamp-2 text-sm text-foreground">
                              {operation.request}
                            </p>
                            {operation.status === 'failed' && operation.error ? (
                              <p className="mt-1 line-clamp-2 text-xs text-status-attention">
                                {operation.error}
                              </p>
                            ) : null}
                          </div>
                        </div>
                        {operation.status !== 'generating' ? (
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => handleDiscard(operation)}
                            >
                              Discard
                            </Button>
                            {operation.status === 'failed' ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => retryPlanOp(operation.id)}
                              >
                                Retry
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => handleReview(operation)}
                              >
                                Review
                              </Button>
                            )}
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </aside>
            </div>,
            document.body
          )
        : null}
    </>
  )
}
