import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Check,
  ChevronDown,
  Clock3,
  Columns3,
  GitBranch,
  Loader2,
  Search,
  Play,
  RefreshCcw,
  Send,
  TerminalSquare,
  XCircle
} from 'lucide-react'
import type {
  Agent,
  InteractionAnswer,
  InteractionQuestion,
  ObservedRunDiagnostics,
  ObservedRunEvent,
  ObservedRunSnapshot,
  WorkRunInputRequestStatus,
  WorkboardData,
  WorkboardDraftItem,
  WorkboardDraftPlan,
  WorkboardRun,
  WorkRunInputRequest
} from '@shared/contracts'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import {
  DiagnosticBlock,
  formatLivenessHealth,
  formatObservedPhase,
  mergeDiagnostics
} from '@renderer/components/observability-details'
import {
  FileReferenceList,
  getFileReferences
} from '@renderer/components/file-reference-list'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { SelectControl } from '@renderer/components/select-control'
import { cn } from '@renderer/lib/utils'
import {
  emptyWorkboardDraftReviewState,
  type WorkComposerTarget,
  type WorkboardDraftReviewState
} from './workboard-draft-review'

const columns: Array<{
  id: WorkboardRun['status']
  label: string
  fullLabel: string
  icon: typeof Play
}> = [
  { id: 'queued', label: 'Queue', fullLabel: 'Queued', icon: Clock3 },
  { id: 'running', label: 'Run', fullLabel: 'Running', icon: Play },
  { id: 'waiting_for_user', label: 'Wait', fullLabel: 'Waiting', icon: AlertCircle },
  { id: 'blocked', label: 'Block', fullLabel: 'Blocked', icon: GitBranch },
  { id: 'completed', label: 'Done', fullLabel: 'Completed', icon: CheckCircle2 },
  { id: 'failed', label: 'Fail', fullLabel: 'Failed', icon: XCircle },
  { id: 'cancelled', label: 'Cancel', fullLabel: 'Cancelled', icon: XCircle }
]

const newWorkComposerTarget: WorkComposerTarget = { mode: 'new' }

export function WorkboardScreen({
  draftReview,
  onDraftReviewChange
}: {
  draftReview: WorkboardDraftReviewState
  onDraftReviewChange: Dispatch<SetStateAction<WorkboardDraftReviewState>>
}): React.JSX.Element {
  const [agents, setAgents] = useState<Agent[]>([])
  const [data, setData] = useState<WorkboardData>({
    requests: [],
    runs: [],
    dependencies: [],
    inputRequests: []
  })
  const [observedRuns, setObservedRuns] = useState<ObservedRunSnapshot[]>([])
  const [request, setRequest] = useState('')
  const [composerTarget, setComposerTarget] = useState<WorkComposerTarget>(newWorkComposerTarget)
  const [reviewBeforeStart, setReviewBeforeStart] = useState(true)
  const [selectedRunId, setSelectedRunId] = useState('')
  const [requestFilter, setRequestFilter] = useState('all')
  const [workSearch, setWorkSearch] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  async function loadWorkboard(options: { quiet?: boolean } = {}): Promise<void> {
    if (!options.quiet) setBusy('load')
    try {
      const [nextData, nextAgents] = await Promise.all([
        window.ordinus.workboard.list(),
        window.ordinus.agents.list()
      ])
      const nextObservedRuns = await window.ordinus.observability.listWorkboard()
      setData(nextData)
      setAgents(nextAgents)
      setObservedRuns(nextObservedRuns)
      setError('')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Workboard could not be loaded.')
    } finally {
      if (!options.quiet) setBusy('')
    }
  }

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadWorkboard(), 0)
    const timer = window.setInterval(() => void loadWorkboard({ quiet: true }), 2500)
    return () => {
      window.clearTimeout(initialLoad)
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    return window.ordinus.observability.onRunChanged((snapshot) => {
      if (snapshot.sourceSurface !== 'workboard') return
      setObservedRuns((current) => {
        const withoutSnapshot = current.filter((item) => item.id !== snapshot.id)
        return [snapshot, ...withoutSnapshot]
      })
    })
  }, [])

  const enabledAgents = agents.filter((agent) => agent.enabled)
  const selectedRun = data.runs.find((run) => run.id === selectedRunId) ?? null
  const observedRunByWorkRunId = useMemo(
    () => new Map(observedRuns.map((run) => [run.sourceItemId, run])),
    [observedRuns]
  )
  const baseFilteredRuns = data.runs.filter((run) => {
    if (requestFilter === 'all') return true
    if (requestFilter === 'active') {
      return !isTerminalRunStatus(run.status)
    }
    return run.requestId === requestFilter
  })
  const filteredRuns = baseFilteredRuns.filter((run) => matchesWorkSearch(run, workSearch))
  const requestStats = useMemo(() => buildRequestStats(data), [data])
  const allRunCount = data.runs.length
  const activeRunCount = data.runs.filter((run) => !isTerminalRunStatus(run.status)).length

  const draftPlan = draftReview.plan
  const draftContext = draftReview.context
  const selectedDraftId = draftReview.selectedItemId
  const selectedDraftItem = draftPlan?.items.find((item) => item.tempId === selectedDraftId) ?? null
  const canSubmit = request.trim().length >= 12 && enabledAgents.length > 0 && !busy
  const composerIsContinuation = composerTarget.mode !== 'new'
  const selectedRequest = data.requests.find((item) => item.id === requestFilter) ?? null

  async function handleSubmit(): Promise<void> {
    if (!canSubmit) return
    setBusy('submit')
    setError('')
    const submittedRequest = request.trim()

    try {
      const plan = await generateDraftPlan(composerTarget, submittedRequest)
      if (reviewBeforeStart) {
        openDraftPlan(plan, composerTarget, submittedRequest)
        return
      }

      if (plan.items.length > 8) {
        openDraftPlan(plan, composerTarget, submittedRequest)
        setError(getLargePlanReviewMessage(composerTarget))
        return
      }

      await startDraftPlan(plan, composerTarget, submittedRequest)
    } catch (submitError) {
      setError(getStartErrorMessage(submitError, composerTarget))
    } finally {
      setBusy('')
    }
  }

  async function handleStartDraft(): Promise<void> {
    if (!draftPlan || !draftContext) return
    setBusy('start-draft')
    setError('')

    try {
      await startDraftPlan(draftPlan, draftContext.target, draftContext.request)
    } catch (startError) {
      setError(getStartErrorMessage(startError, draftContext.target))
    } finally {
      setBusy('')
    }
  }

  async function handleRegenerateDraft(): Promise<void> {
    if (!draftContext) return
    setBusy('regenerate')
    setError('')
    try {
      const plan = await generateDraftPlan(draftContext.target, draftContext.request)
      openDraftPlan(plan, draftContext.target, draftContext.request)
    } catch (regenerateError) {
      setError(
        regenerateError instanceof Error
          ? regenerateError.message
          : 'Plan could not be regenerated.'
      )
    } finally {
      setBusy('')
    }
  }

  function setDraftPlan(plan: WorkboardDraftPlan | null): void {
    onDraftReviewChange((current) => ({
      ...current,
      plan,
      selectedItemId: plan?.items.some((item) => item.tempId === current.selectedItemId)
        ? current.selectedItemId
        : (plan?.items[0]?.tempId ?? '')
    }))
  }

  function setSelectedDraftId(selectedItemId: string): void {
    onDraftReviewChange((current) => ({ ...current, selectedItemId }))
  }

  function updateDraftItem(tempId: string, patch: Partial<WorkboardDraftItem>): void {
    onDraftReviewChange((current) => {
      if (!current.plan) return current

      return {
        ...current,
        plan: {
          ...current.plan,
          items: current.plan.items.map((item) =>
            item.tempId === tempId ? { ...item, ...patch } : item
          )
        }
      }
    })
  }

  function openDraftPlan(
    plan: WorkboardDraftPlan,
    target: WorkComposerTarget,
    originalRequest: string
  ): void {
    onDraftReviewChange({
      plan,
      context: { target, request: originalRequest },
      selectedItemId: plan.items[0]?.tempId ?? ''
    })
  }

  async function startDraftPlan(
    plan: WorkboardDraftPlan,
    target: WorkComposerTarget,
    originalRequest: string
  ): Promise<void> {
    const nextData = await startPlan(target, originalRequest, plan)
    const startedRequest = findStartedRequest(nextData, target, originalRequest, plan)

    setData(nextData)
    setRequestFilter(startedRequest?.id ?? 'all')
    setSelectedRunId('')
    onDraftReviewChange(emptyWorkboardDraftReviewState)
    setRequest('')
    setComposerTarget(newWorkComposerTarget)
  }

  function handleContinueRun(run: WorkboardRun): void {
    setComposerTarget({
      mode: 'item',
      requestId: run.requestId,
      requestTitle: run.requestTitle,
      anchorRunId: run.id,
      anchorRunTitle: run.title
    })
    setRequest('')
    setSelectedRunId('')
  }

  function handleContinueRequest(requestId: string): void {
    const workRequest = data.requests.find((item) => item.id === requestId)
    if (!workRequest) return

    setComposerTarget({
      mode: 'request',
      requestId: workRequest.id,
      requestTitle: workRequest.title
    })
    setRequest('')
    setSelectedRunId('')
  }

  async function handleCancelRun(runId: string): Promise<void> {
    setBusy(`cancel-${runId}`)
    setError('')
    try {
      const nextData = await window.ordinus.workboard.cancelRun({ runId })
      setData(nextData)
    } catch (cancelError) {
      setError(
        cancelError instanceof Error ? cancelError.message : 'Work Item could not be cancelled.'
      )
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-0 flex-col gap-3 overflow-hidden py-4">
      <section className="shrink-0 rounded-lg border bg-card shadow-sm">
        {composerTarget.mode !== 'new' ? (
          <div className="flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="attention">
                  {composerTarget.mode === 'item' ? 'Item follow-up' : 'Continuing work'}
                </Badge>
                <p className="truncate text-sm font-medium text-foreground">
                  {composerTarget.mode === 'item'
                    ? composerTarget.anchorRunTitle
                    : composerTarget.requestTitle}
                </p>
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {composerTarget.mode === 'item'
                  ? `Adds work to ${composerTarget.requestTitle}`
                  : 'Adds Work Items to this Work Request'}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => setComposerTarget(newWorkComposerTarget)}
            >
              New request
            </Button>
          </div>
        ) : null}
        <textarea
          aria-label={composerIsContinuation ? 'Continuation Work Request' : 'Work Request'}
          className={cn(
            'max-h-40 min-h-24 w-full resize-none bg-transparent px-4 py-3 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-0',
            composerIsContinuation ? '' : 'rounded-t-lg'
          )}
          placeholder={
            composerIsContinuation
              ? 'Add continuation work for this Work Request...'
              : 'Give agents a Work Request...'
          }
          value={request}
          onChange={(event) => setRequest(event.target.value)}
        />
        <div className="flex flex-col gap-2 border-t px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
          <label
            className={cn(
              'inline-flex h-8 w-fit cursor-pointer items-center gap-2 rounded-md border px-3 text-xs font-medium transition-colors',
              reviewBeforeStart
                ? 'border-primary/30 bg-primary-soft text-foreground'
                : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={reviewBeforeStart}
              onChange={(event) => setReviewBeforeStart(event.target.checked)}
            />
            <span
              className={cn(
                'grid size-4 place-items-center rounded border transition-colors',
                reviewBeforeStart
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card'
              )}
              aria-hidden="true"
            >
              {reviewBeforeStart ? <Check className="size-3" /> : null}
            </span>
            Review before start
          </label>
          <Button size="sm" onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {busy === 'submit' ? (
              <Loader2 className="animate-spin" />
            ) : reviewBeforeStart ? (
              <Send />
            ) : (
              <Play />
            )}
            {getSubmitButtonLabel(composerTarget, reviewBeforeStart)}
          </Button>
        </div>
        {enabledAgents.length === 0 ? (
          <p className="border-t px-4 py-2 text-xs text-destructive">
            Create and enable at least one agent before creating Work Requests.
          </p>
        ) : null}
      </section>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <WorkFilterBar
        filter={requestFilter}
        allCount={allRunCount}
        activeCount={activeRunCount}
        requestStats={requestStats}
        selectedRequest={selectedRequest}
        workSearch={workSearch}
        onFilterChange={setRequestFilter}
        onContinueRequest={handleContinueRequest}
        onWorkSearchChange={setWorkSearch}
      />

      <WorkColumns
        runs={filteredRuns}
        inputRequests={data.inputRequests}
        observedRuns={observedRunByWorkRunId}
        onSelectRun={setSelectedRunId}
      />

      <PlanReviewDialog
        open={Boolean(draftPlan)}
        request={draftContext?.request ?? request}
        target={draftContext?.target ?? newWorkComposerTarget}
        plan={draftPlan}
        agents={enabledAgents}
        selectedItem={selectedDraftItem}
        selectedItemId={selectedDraftId}
        busy={busy}
        onSelectItem={setSelectedDraftId}
        onUpdatePlan={setDraftPlan}
        onUpdateItem={updateDraftItem}
        onStart={() => void handleStartDraft()}
        onRegenerate={() => void handleRegenerateDraft()}
        onDiscard={() => {
          onDraftReviewChange(emptyWorkboardDraftReviewState)
        }}
      />

      <RunDetailDrawer
        run={selectedRun}
        dependencies={data.dependencies}
        runs={data.runs}
        observedRun={selectedRun ? (observedRunByWorkRunId.get(selectedRun.id) ?? null) : null}
        inputRequest={getVisibleWorkRunInputRequest(data.inputRequests, selectedRun?.id)}
        busy={busy}
        onClose={() => setSelectedRunId('')}
        onCancel={(runId) => void handleCancelRun(runId)}
        onContinue={handleContinueRun}
        onAnswered={(nextData) => setData(nextData)}
        onError={setError}
      />
    </div>
  )
}

type RequestFilterStat = {
  id: string
  title: string
  totalCount: number
  activeCount: number
  createdAt: string
}

type RunDetailTab = 'overview' | 'activity' | 'output' | 'files' | 'runtime'

const runDetailTabs: Array<{ id: RunDetailTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'activity', label: 'Activity' },
  { id: 'output', label: 'Output' },
  { id: 'files', label: 'Files' },
  { id: 'runtime', label: 'Runtime' }
]

function WorkFilterBar({
  filter,
  allCount,
  activeCount,
  requestStats,
  selectedRequest,
  workSearch,
  onFilterChange,
  onContinueRequest,
  onWorkSearchChange
}: {
  filter: string
  allCount: number
  activeCount: number
  requestStats: RequestFilterStat[]
  selectedRequest: WorkboardData['requests'][number] | null
  workSearch: string
  onFilterChange: (filter: string) => void
  onContinueRequest: (requestId: string) => void
  onWorkSearchChange: (search: string) => void
}): React.JSX.Element {
  const [requestPickerOpen, setRequestPickerOpen] = useState(false)
  const [requestSearch, setRequestSearch] = useState('')
  const visibleRequests = useMemo(
    () => getVisibleRequestFilters(requestStats, filter),
    [filter, requestStats]
  )
  const hiddenRequests = requestStats.filter(
    (request) => !visibleRequests.some((visible) => visible.id === request.id)
  )
  const searchedHiddenRequests = hiddenRequests.filter((request) =>
    request.title.toLowerCase().includes(requestSearch.trim().toLowerCase())
  )

  function selectFilter(nextFilter: string): void {
    onFilterChange(nextFilter)
    setRequestPickerOpen(false)
    setRequestSearch('')
  }

  return (
    <section className="relative flex shrink-0 flex-col gap-2 rounded-lg border bg-card px-3 py-2 xl:flex-row xl:items-center xl:justify-between">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border bg-background p-0.5">
          <FilterChip
            active={filter === 'all'}
            label="All"
            count={allCount}
            onClick={() => selectFilter('all')}
          />
          <FilterChip
            active={filter === 'active'}
            label="Active"
            count={activeCount}
            onClick={() => selectFilter('active')}
          />
        </div>

        {visibleRequests.length > 0 ? (
          <span className="hidden h-5 w-px bg-border sm:block" />
        ) : null}

        {visibleRequests.map((request) => (
          <FilterChip
            key={request.id}
            active={filter === request.id}
            label={request.title}
            count={request.totalCount}
            onClick={() => selectFilter(request.id)}
            className="max-w-56"
          />
        ))}

        {hiddenRequests.length > 0 ? (
          <div
            className="relative"
            onBlur={(event) => {
              const nextTarget = event.relatedTarget
              if (!nextTarget || !event.currentTarget.contains(nextTarget as Node)) {
                setRequestPickerOpen(false)
              }
            }}
          >
            <button
              type="button"
              className={cn(
                'inline-flex h-8 items-center gap-1 rounded-md border px-3 text-xs font-medium transition-colors',
                requestPickerOpen
                  ? 'border-primary/30 bg-primary-soft text-foreground'
                  : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
              onClick={() => setRequestPickerOpen((open) => !open)}
            >
              +{hiddenRequests.length} more
              <ChevronDown className="size-3.5" />
            </button>

            {requestPickerOpen ? (
              <div className="absolute right-0 top-10 z-30 w-80 max-w-[calc(100vw-3rem)] rounded-lg border bg-card p-2 shadow-lg">
                <label className="flex h-9 items-center gap-2 rounded-md border bg-background px-2 text-muted-foreground">
                  <Search className="size-4" />
                  <input
                    className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                    placeholder="Find Work Request"
                    value={requestSearch}
                    onChange={(event) => setRequestSearch(event.target.value)}
                  />
                </label>
                <div className="mt-2 max-h-72 overflow-y-auto ordinus-scrollbar">
                  {searchedHiddenRequests.length === 0 ? (
                    <p className="px-2 py-3 text-sm text-muted-foreground">
                      No Work Requests found.
                    </p>
                  ) : (
                    searchedHiddenRequests.map((request) => (
                      <button
                        key={request.id}
                        type="button"
                        className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-accent"
                        onClick={() => selectFilter(request.id)}
                      >
                        <span className="min-w-0 truncate">{request.title}</span>
                        <Badge variant="secondary" className="shrink-0">
                          {request.totalCount}
                        </Badge>
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-col gap-2 sm:flex-row xl:ml-auto">
        {selectedRequest ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => onContinueRequest(selectedRequest.id)}
          >
            <GitBranch />
            Continue this work
          </Button>
        ) : null}
        <label className="flex h-8 w-full min-w-0 items-center gap-2 rounded-md border bg-background px-2 text-muted-foreground sm:w-44 xl:w-40">
          <Search className="size-4 shrink-0" />
          <input
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            placeholder="Search..."
            value={workSearch}
            onChange={(event) => onWorkSearchChange(event.target.value)}
          />
        </label>
      </div>
    </section>
  )
}

function FilterChip({
  active,
  label,
  count,
  onClick,
  className
}: {
  active: boolean
  label: string
  count: number
  onClick: () => void
  className?: string
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-8 min-w-0 items-center gap-2 rounded-md px-3 text-xs font-medium transition-colors',
        active
          ? 'bg-primary-soft text-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        className
      )}
      onClick={onClick}
    >
      <span className="min-w-0 truncate">{label}</span>
      <span
        className={cn(
          'shrink-0 tabular-nums',
          active ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        {count}
      </span>
    </button>
  )
}

function WorkColumns({
  runs,
  inputRequests,
  observedRuns,
  onSelectRun
}: {
  runs: WorkboardRun[]
  inputRequests: WorkRunInputRequest[]
  observedRuns: Map<string, ObservedRunSnapshot>
  onSelectRun: (runId: string) => void
}): React.JSX.Element {
  return (
    <div className="min-h-0 flex-1 overflow-hidden rounded-lg border bg-card">
      <div className="h-full overflow-x-auto ordinus-scrollbar">
        <div className="flex h-full min-h-[360px] w-max gap-3 p-3">
          {columns.map((column) => {
            const columnRuns = runs.filter((run) => run.status === column.id)
            const Icon = column.icon

            return (
              <section
                key={column.id}
                className="flex h-full min-h-0 w-64 shrink-0 flex-col rounded-md bg-accent/50"
              >
                <header className="flex items-center justify-between border-b px-3 py-2">
                  <div
                    className="flex items-center gap-2 text-sm font-semibold"
                    title={column.fullLabel}
                  >
                    <Icon className="size-4" />
                    {column.label}
                  </div>
                  <Badge variant="secondary">{columnRuns.length}</Badge>
                </header>
                <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2 ordinus-scrollbar">
                  {columnRuns.length === 0 ? (
                    <div className="rounded-md border border-dashed bg-background/60 p-3 text-xs text-muted-foreground">
                      No Work Items
                    </div>
                  ) : (
                    columnRuns.map((run) => {
                      const inputBadge = getWorkRunInputBadge(
                        getVisibleWorkRunInputRequest(inputRequests, run.id)
                      )
                      const observedRun = observedRuns.get(run.id)

                      return (
                        <button
                          key={run.id}
                          type="button"
                          className="rounded-md border bg-background p-3 text-left shadow-sm transition-colors hover:border-primary/40"
                          onClick={() => onSelectRun(run.id)}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="text-sm font-semibold leading-5">{run.title}</h3>
                            <div className="flex shrink-0 flex-col items-end gap-1">
                              {run.parentRunId ? <Badge variant="outline">Follow-up</Badge> : null}
                              {inputBadge ? (
                                <Badge variant={inputBadge.variant}>{inputBadge.label}</Badge>
                              ) : null}
                            </div>
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">{run.agentName}</p>
                          <RunCardActivity run={run} observedRun={observedRun} />
                          <p className="mt-2 truncate text-[11px] text-muted-foreground">
                            {run.requestTitle}
                          </p>
                        </button>
                      )
                    })
                  )}
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function RunCardActivity({
  run,
  observedRun
}: {
  run: WorkboardRun
  observedRun?: ObservedRunSnapshot
}): React.JSX.Element {
  if (observedRun && run.status === 'running') {
    return (
      <div className="mt-2 grid gap-1 rounded-md border border-status-running/25 bg-status-running/10 px-2 py-1.5">
        <div className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-status-running">
          <Loader2 className="size-3 shrink-0 animate-spin" />
          <span className="truncate">{formatObservedPhase(observedRun.currentPhase)}</span>
          <span className="shrink-0 text-muted-foreground">
            {formatLivenessHealth(observedRun.livenessHealth)}
          </span>
        </div>
        <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
          {observedRun.latestActivity || 'Provider is running.'}
        </p>
      </div>
    )
  }

  return (
    <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
      {run.error || run.resultSummary || run.expectedOutput || run.instruction}
    </p>
  )
}

function PlanReviewDialog({
  open,
  request,
  target,
  plan,
  agents,
  selectedItem,
  selectedItemId,
  busy,
  onSelectItem,
  onUpdatePlan,
  onUpdateItem,
  onStart,
  onRegenerate,
  onDiscard
}: {
  open: boolean
  request: string
  target: WorkComposerTarget
  plan: WorkboardDraftPlan | null
  agents: Agent[]
  selectedItem: WorkboardDraftItem | null
  selectedItemId: string
  busy: string
  onSelectItem: (tempId: string) => void
  onUpdatePlan: (plan: WorkboardDraftPlan | null) => void
  onUpdateItem: (tempId: string, patch: Partial<WorkboardDraftItem>) => void
  onStart: () => void
  onRegenerate: () => void
  onDiscard: () => void
}): React.JSX.Element {
  const levels = useMemo(() => (plan ? buildDraftLevels(plan.items) : []), [plan])
  const stageById = useMemo(() => buildDraftStageMap(levels), [levels])
  const isContinuation = target.mode !== 'new'
  const targetRequestTitle = target.mode !== 'new' ? target.requestTitle : ''
  const itemCount = plan?.items.length ?? 0
  const parallelStageCount = levels.filter((level) => level.length > 1).length

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (!nextOpen ? onDiscard() : undefined)}>
      <DialogContent className="grid h-[calc(100vh-1rem)] max-h-[calc(100vh-1rem)] max-w-7xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 p-0 sm:h-[min(860px,calc(100vh-2rem))] sm:max-h-[calc(100vh-2rem)]">
        <DialogHeader className="border-b px-5 py-4 pr-12 sm:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <DialogTitle>
                {isContinuation ? 'Review Continuation' : 'Review Work Request'}
              </DialogTitle>
              <DialogDescription className="mt-1">
                {isContinuation
                  ? `Add these Work Items to ${targetRequestTitle}.`
                  : 'Review assignments and dependencies before agents start.'}
              </DialogDescription>
            </div>
            {plan ? (
              <div className="flex flex-wrap gap-2 text-left">
                <Badge variant="secondary">{itemCount} Work Items</Badge>
                <Badge variant="outline">{levels.length} Stages</Badge>
                {parallelStageCount > 0 ? (
                  <Badge variant="outline">{parallelStageCount} Parallel stages</Badge>
                ) : null}
              </div>
            ) : null}
          </div>
        </DialogHeader>
        {plan ? (
          <div className="grid min-h-0 grid-cols-1 overflow-y-auto ordinus-scrollbar lg:grid-cols-[minmax(0,1fr)_380px] lg:overflow-hidden">
            <div className="flex min-w-0 flex-col gap-4 p-5 ordinus-scrollbar sm:p-6 lg:min-h-0 lg:overflow-y-auto">
              <div className="grid gap-3 md:grid-cols-[1fr_2fr]">
                <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                  Title
                  <input
                    className="h-10 rounded-md border bg-background px-3 text-sm text-foreground"
                    value={plan.title}
                    onChange={(event) => onUpdatePlan({ ...plan, title: event.target.value })}
                  />
                </label>
                <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                  Summary
                  <input
                    className="h-10 rounded-md border bg-background px-3 text-sm text-foreground"
                    value={plan.summary}
                    onChange={(event) => onUpdatePlan({ ...plan, summary: event.target.value })}
                  />
                </label>
              </div>

              <DraftStageTimeline
                levels={levels}
                stageById={stageById}
                agents={agents}
                selectedItemId={selectedItemId}
                onSelectItem={onSelectItem}
              />

              <div className="rounded-lg border bg-background p-4">
                <h3 className="text-sm font-semibold">
                  {isContinuation ? 'Continuation request' : 'Original request'}
                </h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                  {request}
                </p>
              </div>
            </div>

            <div className="border-t bg-card p-4 ordinus-scrollbar lg:min-h-0 lg:overflow-y-auto lg:border-l lg:border-t-0">
              {selectedItem ? (
                <DraftItemEditor
                  item={selectedItem}
                  items={plan.items}
                  agents={agents}
                  stageById={stageById}
                  onChange={(patch) => onUpdateItem(selectedItem.tempId, patch)}
                />
              ) : (
                <p className="text-sm text-muted-foreground">Select a Work Item.</p>
              )}
            </div>
          </div>
        ) : null}
        <DialogFooter className="border-t bg-background px-5 py-4 sm:px-6">
          <Button variant="outline" onClick={onDiscard}>
            Discard
          </Button>
          <Button variant="outline" onClick={onRegenerate} disabled={busy === 'regenerate'}>
            {busy === 'regenerate' ? <Loader2 className="animate-spin" /> : <RefreshCcw />}
            Regenerate
          </Button>
          <Button onClick={onStart} disabled={busy === 'start-draft'}>
            {busy === 'start-draft' ? <Loader2 className="animate-spin" /> : <Play />}
            {isContinuation ? 'Add continuation' : 'Start work'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DraftStageTimeline({
  levels,
  stageById,
  agents,
  selectedItemId,
  onSelectItem
}: {
  levels: WorkboardDraftItem[][]
  stageById: Map<string, number>
  agents: Agent[]
  selectedItemId: string
  onSelectItem: (tempId: string) => void
}): React.JSX.Element {
  return (
    <section className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Columns3 className="size-4 shrink-0 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Execution stages</h3>
        </div>
        <p className="text-xs text-muted-foreground">Items in the same stage can start together.</p>
      </div>
      <div className="grid gap-3">
        {levels.map((level, index) => (
          <section key={index} className="rounded-lg border bg-background">
            <header className="flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h4 className="text-sm font-semibold">Stage {index + 1}</h4>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {index === 0
                    ? 'Starts as soon as work begins.'
                    : `Starts after required earlier Work Items complete.`}
                </p>
              </div>
              <Badge variant={level.length > 1 ? 'running' : 'secondary'}>
                {level.length > 1 ? `${level.length} parallel` : '1 item'}
              </Badge>
            </header>
            <div className="grid gap-2 p-3">
              {level.map((item) => (
                <DraftStageItemButton
                  key={item.tempId}
                  item={item}
                  stageById={stageById}
                  agents={agents}
                  selected={item.tempId === selectedItemId}
                  onSelect={() => onSelectItem(item.tempId)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  )
}

function DraftStageItemButton({
  item,
  stageById,
  agents,
  selected,
  onSelect
}: {
  item: WorkboardDraftItem
  stageById: Map<string, number>
  agents: Agent[]
  selected: boolean
  onSelect: () => void
}): React.JSX.Element {
  const dependencyCount = item.dependsOnTempIds.length

  return (
    <button
      type="button"
      className={cn(
        'group rounded-md border bg-card px-3 py-2.5 text-left transition-colors',
        selected ? 'border-primary ring-2 ring-primary/20' : 'hover:border-primary/40'
      )}
      onClick={onSelect}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-5">{item.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {agentName(agents, item.assignedAgentId)}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5 sm:justify-end">
          {dependencyCount > 0 ? (
            <Badge variant="outline">Waits for {dependencyCount}</Badge>
          ) : (
            <Badge variant="secondary">Ready first</Badge>
          )}
          <Badge variant="outline">Stage {stageById.get(item.tempId) ?? 1}</Badge>
        </div>
      </div>
      <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
        {item.expectedOutput || item.instruction}
      </p>
    </button>
  )
}

function DraftItemEditor({
  item,
  items,
  agents,
  stageById,
  onChange
}: {
  item: WorkboardDraftItem
  items: WorkboardDraftItem[]
  agents: Agent[]
  stageById: Map<string, number>
  onChange: (patch: Partial<WorkboardDraftItem>) => void
}): React.JSX.Element {
  return (
    <div className="grid gap-4">
      <div>
        <p className="text-xs font-medium text-muted-foreground">
          Stage {stageById.get(item.tempId) ?? 1}
        </p>
        <h3 className="mt-1 text-sm font-semibold">Work Item details</h3>
      </div>
      <DraftDependencyMap item={item} items={items} stageById={stageById} />
      <label className="grid gap-1 text-xs font-medium text-muted-foreground">
        Title
        <input
          className="h-10 rounded-md border bg-background px-3 text-sm text-foreground"
          value={item.title}
          onChange={(event) => onChange({ title: event.target.value })}
        />
      </label>
      <label className="grid gap-1 text-xs font-medium text-muted-foreground">
        Agent
        <SelectControl
          value={item.assignedAgentId}
          onChange={(assignedAgentId) => onChange({ assignedAgentId })}
        >
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </SelectControl>
      </label>
      <label className="grid gap-1 text-xs font-medium text-muted-foreground">
        Instruction
        <textarea
          className="min-h-28 rounded-md border bg-background px-3 py-2 text-sm leading-6 text-foreground"
          value={item.instruction}
          onChange={(event) => onChange({ instruction: event.target.value })}
        />
      </label>
      <label className="grid gap-1 text-xs font-medium text-muted-foreground">
        Expected output
        <textarea
          className="min-h-20 rounded-md border bg-background px-3 py-2 text-sm leading-6 text-foreground"
          value={item.expectedOutput}
          onChange={(event) => onChange({ expectedOutput: event.target.value })}
        />
      </label>
      <label className="grid gap-1 text-xs font-medium text-muted-foreground">
        Priority
        <input
          type="number"
          className="h-10 rounded-md border bg-background px-3 text-sm text-foreground"
          value={item.priority}
          onChange={(event) => onChange({ priority: Number(event.target.value) })}
        />
      </label>
      <div className="grid gap-2">
        <p className="text-xs font-medium text-muted-foreground">Waits for</p>
        {items
          .filter((candidate) => candidate.tempId !== item.tempId)
          .map((candidate) => {
            const checked = item.dependsOnTempIds.includes(candidate.tempId)
            const createsCycle =
              !checked && draftItemDependsOn(items, candidate.tempId, item.tempId)

            return (
              <label
                key={candidate.tempId}
                className={cn(
                  'flex items-start gap-2 rounded-md border bg-background px-2 py-2 text-sm',
                  createsCycle && 'opacity-60'
                )}
                title={createsCycle ? 'This would create a dependency cycle.' : undefined}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 size-4"
                  checked={checked}
                  disabled={createsCycle}
                  onChange={(event) => {
                    const next = event.target.checked
                      ? [...item.dependsOnTempIds, candidate.tempId]
                      : item.dependsOnTempIds.filter((id) => id !== candidate.tempId)
                    onChange({ dependsOnTempIds: next })
                  }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{candidate.title}</span>
                  <span className="text-xs text-muted-foreground">
                    Stage {stageById.get(candidate.tempId) ?? 1}
                    {createsCycle ? ' - would create a cycle' : ''}
                  </span>
                </span>
              </label>
            )
          })}
      </div>
    </div>
  )
}

function DraftDependencyMap({
  item,
  items,
  stageById
}: {
  item: WorkboardDraftItem
  items: WorkboardDraftItem[]
  stageById: Map<string, number>
}): React.JSX.Element {
  const waitsFor = item.dependsOnTempIds
    .map((id) => items.find((candidate) => candidate.tempId === id))
    .filter((candidate): candidate is WorkboardDraftItem => Boolean(candidate))
    .sort(
      (first, second) => (stageById.get(first.tempId) ?? 0) - (stageById.get(second.tempId) ?? 0)
    )
  const blocks = items
    .filter((candidate) => candidate.dependsOnTempIds.includes(item.tempId))
    .sort(
      (first, second) => (stageById.get(first.tempId) ?? 0) - (stageById.get(second.tempId) ?? 0)
    )

  return (
    <section className="rounded-lg border bg-background p-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <GitBranch className="size-4 text-muted-foreground" />
        Dependency map
      </div>
      <div className="mt-3 grid gap-2">
        <DraftDependencyMapGroup
          label="Waits for"
          empty="Starts without dependencies."
          items={waitsFor}
          stageById={stageById}
        />
        <div className="flex justify-center text-xs text-muted-foreground">then</div>
        <div className="rounded-md border border-primary/30 bg-primary-soft/40 px-3 py-2">
          <p className="truncate text-sm font-semibold">{item.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Stage {stageById.get(item.tempId) ?? 1}
          </p>
        </div>
        <div className="flex justify-center text-xs text-muted-foreground">unlocks</div>
        <DraftDependencyMapGroup
          label="Blocks"
          empty="Does not unlock another Work Item yet."
          items={blocks}
          stageById={stageById}
        />
      </div>
    </section>
  )
}

function DraftDependencyMapGroup({
  label,
  empty,
  items,
  stageById
}: {
  label: string
  empty: string
  items: WorkboardDraftItem[]
  stageById: Map<string, number>
}): React.JSX.Element {
  return (
    <div className="rounded-md border bg-card p-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-2 grid gap-1.5">
        {items.length > 0 ? (
          items.map((item) => (
            <div key={item.tempId} className="rounded-sm bg-accent/60 px-2 py-1.5">
              <p className="truncate text-xs font-medium">{item.title}</p>
              <p className="text-[11px] text-muted-foreground">
                Stage {stageById.get(item.tempId) ?? 1}
              </p>
            </div>
          ))
        ) : (
          <p className="text-xs text-muted-foreground">{empty}</p>
        )}
      </div>
    </div>
  )
}

function RunDetailDrawer({
  run,
  dependencies,
  runs,
  observedRun,
  inputRequest,
  busy,
  onClose,
  onCancel,
  onContinue,
  onAnswered,
  onError
}: {
  run: WorkboardRun | null
  dependencies: WorkboardData['dependencies']
  runs: WorkboardRun[]
  observedRun: ObservedRunSnapshot | null
  inputRequest?: WorkRunInputRequest
  busy: string
  onClose: () => void
  onCancel: (runId: string) => void
  onContinue: (run: WorkboardRun) => void
  onAnswered: (data: WorkboardData) => void
  onError: (message: string) => void
}): React.JSX.Element | null {
  const [answerState, setAnswerState] = useState<{
    key: string
    answers: Record<string, InteractionAnswer>
  }>({ key: '', answers: {} })
  const [tabState, setTabState] = useState<{ runId: string; tab: RunDetailTab } | null>(null)
  const answerKey = `${run?.id ?? ''}:${inputRequest?.id ?? ''}`
  const answers = answerState.key === answerKey ? answerState.answers : {}

  if (!run) return null
  const activeRun = run
  const activeTab = tabState?.runId === activeRun.id ? tabState.tab : defaultRunDetailTab(run)

  const waitsFor = dependencies
    .filter((dependency) => dependency.runId === activeRun.id)
    .map((dependency) => runs.find((candidate) => candidate.id === dependency.dependsOnRunId))
    .filter((item): item is WorkboardRun => Boolean(item))

  async function submitAnswers(): Promise<void> {
    if (!inputRequest) return
    const questionIds = new Set(inputRequest.questions.map((question) => question.id))
    try {
      const nextData = await window.ordinus.workboard.answerInputRequest({
        requestId: inputRequest.id,
        answers: Object.values(answers).filter((answer) => questionIds.has(answer.questionId))
      })
      onAnswered(nextData)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Input request could not be answered.')
    }
  }

  async function revealPath(relativePath: string): Promise<void> {
    try {
      await window.ordinus.workboard.revealPath({
        runId: activeRun.id,
        relativePath
      })
    } catch (error) {
      onError(error instanceof Error ? error.message : 'File could not be shown.')
    }
  }

  function updateAnswer(answer: InteractionAnswer): void {
    setAnswerState((current) => ({
      key: answerKey,
      answers: {
        ...(current.key === answerKey ? current.answers : {}),
        [answer.questionId]: answer
      }
    }))
  }

  return (
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        className="absolute inset-0 bg-background/60 backdrop-blur-[1px]"
        aria-label="Close Work Item details"
        onClick={onClose}
      />
      <aside className="absolute inset-y-0 right-0 z-10 flex w-full flex-col border-l bg-background shadow-2xl sm:w-[86vw] sm:max-w-[680px] xl:w-[72vw] xl:max-w-[760px]">
        <RunDetailHeader
          run={run}
          waitsFor={waitsFor}
          observedRun={observedRun}
          inputRequest={inputRequest}
          onClose={onClose}
        />

        <RunDetailTabBar
          activeTab={activeTab}
          onChange={(tab) => setTabState({ runId: activeRun.id, tab })}
        />

        <div className="min-h-0 flex-1 overflow-y-auto p-5 ordinus-scrollbar">
          <RunDetailTabContent
            activeTab={activeTab}
            run={run}
            waitsFor={waitsFor}
            observedRun={observedRun}
            inputRequest={inputRequest}
            answers={answers}
            onAnswerChange={updateAnswer}
            onSubmitAnswers={() => void submitAnswers()}
            onRevealPath={(path) => void revealPath(path)}
          />
        </div>

        <footer className="flex flex-col gap-2 border-t p-4 sm:flex-row">
          <Button variant="outline" className="w-full" onClick={() => onContinue(run)}>
            <GitBranch />
            Continue from this item
          </Button>
          {!isTerminalRunStatus(run.status) ? (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => onCancel(run.id)}
              disabled={busy === `cancel-${run.id}`}
            >
              Cancel Work Item
            </Button>
          ) : null}
        </footer>
      </aside>
    </div>
  )
}

function RunDetailHeader({
  run,
  waitsFor,
  observedRun,
  inputRequest,
  onClose
}: {
  run: WorkboardRun
  waitsFor: WorkboardRun[]
  observedRun: ObservedRunSnapshot | null
  inputRequest?: WorkRunInputRequest
  onClose: () => void
}): React.JSX.Element {
  return (
    <header className="border-b p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{run.requestTitle}</p>
          <h3 className="mt-1 text-xl font-semibold leading-7">{run.title}</h3>
        </div>
        <Button variant="ghost" size="icon" className="shrink-0" onClick={onClose}>
          <XCircle />
          <span className="sr-only">Close</span>
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge variant={statusBadgeVariant(run.status)}>{formatRunStatus(run.status)}</Badge>
        {run.parentRunId ? <Badge variant="outline">Follow-up</Badge> : null}
        <Badge variant="outline">{run.agentName}</Badge>
        <Badge variant="outline">{run.providerId}</Badge>
      </div>

      <p className="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground">
        {getRunStateSummary(run, waitsFor, inputRequest, observedRun)}
      </p>
    </header>
  )
}

function RunDetailTabBar({
  activeTab,
  onChange
}: {
  activeTab: RunDetailTab
  onChange: (tab: RunDetailTab) => void
}): React.JSX.Element {
  return (
    <div className="border-b px-5 py-2">
      <div className="inline-flex rounded-md border bg-card p-0.5">
        {runDetailTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={cn(
              'h-8 rounded-md px-3 text-xs font-medium transition-colors',
              activeTab === tab.id
                ? 'bg-primary-soft text-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function RunDetailTabContent({
  activeTab,
  run,
  waitsFor,
  observedRun,
  inputRequest,
  answers,
  onAnswerChange,
  onSubmitAnswers,
  onRevealPath
}: {
  activeTab: RunDetailTab
  run: WorkboardRun
  waitsFor: WorkboardRun[]
  observedRun: ObservedRunSnapshot | null
  inputRequest?: WorkRunInputRequest
  answers: Record<string, InteractionAnswer>
  onAnswerChange: (answer: InteractionAnswer) => void
  onSubmitAnswers: () => void
  onRevealPath: (path: string) => void
}): React.JSX.Element {
  if (activeTab === 'overview') {
    return <RunOverviewTab run={run} waitsFor={waitsFor} />
  }

  if (activeTab === 'activity') {
    return <RunActivityTab observedRun={observedRun} />
  }

  if (activeTab === 'output') {
    return (
      <RunOutputTab
        run={run}
        inputRequest={inputRequest}
        answers={answers}
        onAnswerChange={onAnswerChange}
        onSubmitAnswers={onSubmitAnswers}
      />
    )
  }

  if (activeTab === 'files') {
    return <RunFilesTab run={run} onRevealPath={onRevealPath} />
  }

  return <RunRuntimeTab run={run} observedRun={observedRun} />
}

function RunOverviewTab({
  run,
  waitsFor
}: {
  run: WorkboardRun
  waitsFor: WorkboardRun[]
}): React.JSX.Element {
  return (
    <div className="grid gap-3">
      <DetailBlock label="Instruction">{run.instruction}</DetailBlock>
      <DetailBlock label="Expected output">{run.expectedOutput || 'Not specified'}</DetailBlock>
      <DetailBlock label="Inputs">
        {waitsFor.length > 0 ? waitsFor.map((item) => item.title).join(', ') : 'None'}
      </DetailBlock>
    </div>
  )
}

function RunOutputTab({
  run,
  inputRequest,
  answers,
  onAnswerChange,
  onSubmitAnswers
}: {
  run: WorkboardRun
  inputRequest?: WorkRunInputRequest
  answers: Record<string, InteractionAnswer>
  onAnswerChange: (answer: InteractionAnswer) => void
  onSubmitAnswers: () => void
}): React.JSX.Element {
  return (
    <div className="grid gap-3">
      {inputRequest?.status === 'pending' ? (
        <WorkInputRequestPanel
          inputRequest={inputRequest}
          answers={answers}
          onAnswerChange={onAnswerChange}
          onSubmit={onSubmitAnswers}
        />
      ) : null}
      {inputRequest?.status === 'queued_for_resume' ? <QueuedResumePanel /> : null}
      {run.resultSummary ? (
        <DetailBlock label="Output">{run.resultSummary}</DetailBlock>
      ) : (
        <EmptyDetailState>No output yet.</EmptyDetailState>
      )}
      {run.error ? <DetailBlock label="Error">{run.error}</DetailBlock> : null}
    </div>
  )
}

function QueuedResumePanel(): React.JSX.Element {
  return (
    <div className="rounded-lg border border-status-running/30 bg-status-running/10 p-4">
      <h4 className="text-sm font-semibold">Answer received</h4>
      <p className="mt-1 text-sm text-muted-foreground">
        This Work Item will continue when the agent is available.
      </p>
    </div>
  )
}

function WorkInputRequestPanel({
  inputRequest,
  answers,
  onAnswerChange,
  onSubmit
}: {
  inputRequest: WorkRunInputRequest
  answers: Record<string, InteractionAnswer>
  onAnswerChange: (answer: InteractionAnswer) => void
  onSubmit: () => void
}): React.JSX.Element {
  return (
    <div className="rounded-lg border border-primary/30 bg-primary-soft/40 p-4">
      <h4 className="text-sm font-semibold">{inputRequest.title}</h4>
      {inputRequest.detail ? (
        <p className="mt-1 text-sm text-muted-foreground">{inputRequest.detail}</p>
      ) : null}
      <div className="mt-3 grid gap-3">
        {inputRequest.questions.map((question) => (
          <QuestionAnswer
            key={question.id}
            question={question}
            answer={answers[question.id]}
            onChange={onAnswerChange}
          />
        ))}
        <Button onClick={onSubmit}>Continue Work Item</Button>
      </div>
    </div>
  )
}

function RunFilesTab({
  run,
  onRevealPath
}: {
  run: WorkboardRun
  onRevealPath: (path: string) => void
}): React.JSX.Element {
  const files = getFileReferences(run.artifactRefs, run.changedFiles)

  if (files.length === 0) {
    return <EmptyDetailState>No files reported.</EmptyDetailState>
  }

  return (
    <div className="grid gap-3">
      <DetailBlock label="Files">
        <FileReferenceList files={files} onRevealPath={onRevealPath} />
      </DetailBlock>
    </div>
  )
}

function RunActivityTab({
  observedRun
}: {
  observedRun: ObservedRunSnapshot | null
}): React.JSX.Element {
  const [events, setEvents] = useState<ObservedRunEvent[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    if (!observedRun) {
      return
    }
    const observedRunId = observedRun.id

    async function loadEvents(): Promise<void> {
      try {
        const nextEvents = await window.ordinus.observability.listEvents({
          observedRunId
        })
        if (!mounted) return
        setEvents(nextEvents)
        setError('')
      } catch (loadError) {
        if (!mounted) return
        setError(loadError instanceof Error ? loadError.message : 'Activity could not be loaded.')
      }
    }

    void loadEvents()
    const timer = window.setInterval(() => void loadEvents(), 2000)
    return () => {
      mounted = false
      window.clearInterval(timer)
    }
  }, [observedRun?.id, observedRun?.updatedAt])

  if (!observedRun) {
    return <EmptyDetailState>No activity has been recorded for this Work Item yet.</EmptyDetailState>
  }

  return (
    <div className="grid gap-3">
      <div className="rounded-lg border bg-card p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase text-muted-foreground">Current activity</p>
            <p className="mt-1 truncate text-sm font-medium">
              {observedRun.latestActivity || 'No activity yet.'}
            </p>
          </div>
          <Badge variant={observedRun.livenessHealth === 'stalled' ? 'attention' : 'outline'}>
            {formatLivenessHealth(observedRun.livenessHealth)}
          </Badge>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {formatObservedPhase(observedRun.currentPhase)} · {formatElapsedMs(observedRun.elapsedMs)}
        </p>
      </div>
      {error ? <DetailBlock label="Activity error">{error}</DetailBlock> : null}
      {events.length > 0 ? (
        <div className="grid gap-2">
          {events.map((event) => (
            <div key={event.id} className="flex min-w-0 gap-3 rounded-lg border bg-card p-3">
              <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary/70" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{event.summary}</p>
                  <Badge variant="secondary">{event.kind}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(event.timestamp).toLocaleTimeString()} · {event.source} ·{' '}
                  {event.confidence}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyDetailState>No timeline events yet.</EmptyDetailState>
      )}
    </div>
  )
}

function RunRuntimeTab({
  run,
  observedRun
}: {
  run: WorkboardRun
  observedRun: ObservedRunSnapshot | null
}): React.JSX.Element {
  return (
    <div className="grid gap-3">
      <DetailBlock label="Agent">
        {run.agentName}
        {run.agentRole ? ` - ${run.agentRole}` : ''}
      </DetailBlock>
      <DetailBlock label="Provider">
        {run.providerId} / {run.model}
      </DetailBlock>
      <DetailBlock label="Sandbox">{run.sandbox}</DetailBlock>
      <DetailBlock label="Session">{run.providerSessionRef || 'Not started'}</DetailBlock>
      <DetailBlock label="Created">{formatOptionalDate(run.createdAt)}</DetailBlock>
      <DetailBlock label="Started">{formatOptionalDate(run.startedAt)}</DetailBlock>
      <DetailBlock label="Completed">{formatOptionalDate(run.completedAt)}</DetailBlock>
      <RunDiagnosticsPanel observedRun={observedRun} />
    </div>
  )
}

function RunDiagnosticsPanel({
  observedRun
}: {
  observedRun: ObservedRunSnapshot | null
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [diagnostics, setDiagnostics] = useState<ObservedRunDiagnostics | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !observedRun) {
      return
    }

    let mounted = true
    const observedRunId = observedRun.id

    async function loadDiagnostics(): Promise<void> {
      try {
        const nextDiagnostics = await window.ordinus.observability.getDiagnostics({
          observedRunId,
          stdoutOffset: diagnostics?.stdout.nextOffset,
          stderrOffset: diagnostics?.stderr.nextOffset
        })
        if (!mounted) return
        setDiagnostics((current) => mergeDiagnostics(current, nextDiagnostics))
        setError('')
      } catch (loadError) {
        if (!mounted) return
        setError(
          loadError instanceof Error ? loadError.message : 'Diagnostics could not be loaded.'
        )
      }
    }

    void loadDiagnostics()
    const timer = window.setInterval(() => void loadDiagnostics(), 2000)
    return () => {
      mounted = false
      window.clearInterval(timer)
    }
  }, [open, observedRun?.id, diagnostics?.stdout.nextOffset, diagnostics?.stderr.nextOffset])

  if (!observedRun) {
    return <EmptyDetailState>Diagnostics are available after this Work Item starts.</EmptyDetailState>
  }

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase text-muted-foreground">Diagnostics</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Inspect sanitized provider invocation and recent output.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen((value) => !value)}>
          <TerminalSquare />
          {open ? 'Hide' : 'Inspect'}
        </Button>
      </div>

      {open ? (
        <div className="mt-3 grid gap-3">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {diagnostics ? (
            <>
              <DiagnosticBlock label="Invocation">
                {[
                  `Provider: ${diagnostics.invocation.provider || observedRun.providerId}`,
                  `Executable: ${diagnostics.invocation.executable || observedRun.providerId}`,
                  `Args: ${diagnostics.invocation.args.join(' ') || 'Not available'}`,
                  `Cwd: ${diagnostics.invocation.cwd || 'Not available'}`,
                  `Started: ${diagnostics.invocation.startedAt || 'Not available'}`
                ].join('\n')}
              </DiagnosticBlock>
              <DiagnosticBlock label="stdout">
                {diagnostics.stdout.text || 'No stdout output yet.'}
              </DiagnosticBlock>
              <DiagnosticBlock label="stderr">
                {diagnostics.stderr.text || 'No stderr output yet.'}
              </DiagnosticBlock>
            </>
          ) : (
            <EmptyDetailState>Loading diagnostics...</EmptyDetailState>
          )}
        </div>
      ) : null}
    </div>
  )
}

function isTerminalRunStatus(status: WorkboardRun['status']): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}

function generateDraftPlan(
  target: WorkComposerTarget,
  request: string
): Promise<WorkboardDraftPlan> {
  if (target.mode !== 'new') {
    return window.ordinus.workboard.generateFollowUpPlan({
      requestId: target.requestId,
      anchorRunId: target.mode === 'item' ? target.anchorRunId : undefined,
      request
    })
  }

  return window.ordinus.workboard.generatePlan({ request })
}

function startPlan(
  target: WorkComposerTarget,
  originalRequest: string,
  plan: WorkboardDraftPlan
): Promise<WorkboardData> {
  if (target.mode !== 'new') {
    return window.ordinus.workboard.startFollowUp({
      requestId: target.requestId,
      anchorRunId: target.mode === 'item' ? target.anchorRunId : undefined,
      plan
    })
  }

  return window.ordinus.workboard.startRequest({
    originalRequest,
    plan
  })
}

function findStartedRequest(
  data: WorkboardData,
  target: WorkComposerTarget,
  originalRequest: string,
  plan: WorkboardDraftPlan
): WorkboardData['requests'][number] | undefined {
  if (target.mode !== 'new') {
    return data.requests.find((item) => item.id === target.requestId)
  }

  return data.requests.find(
    (item) => item.originalRequest === originalRequest && item.title === plan.title
  )
}

function getLargePlanReviewMessage(target: WorkComposerTarget): string {
  return target.mode !== 'new'
    ? 'Review this continuation before starting because it has many Work Items.'
    : 'Review this Work Request before starting because it has many Work Items.'
}

function getStartErrorMessage(error: unknown, target: WorkComposerTarget): string {
  if (error instanceof Error) {
    return error.message
  }

  return target.mode !== 'new'
    ? 'Continuation work could not start.'
    : 'Work Request could not start.'
}

function getSubmitButtonLabel(target: WorkComposerTarget, reviewBeforeStart: boolean): string {
  if (target.mode !== 'new') {
    return reviewBeforeStart ? 'Review continuation' : 'Add continuation'
  }

  return reviewBeforeStart ? 'Review plan' : 'Start work'
}

function defaultRunDetailTab(run: WorkboardRun): RunDetailTab {
  if (run.status === 'running') {
    return 'activity'
  }

  if (run.status === 'completed' || run.status === 'failed' || run.status === 'waiting_for_user') {
    return 'output'
  }

  return 'overview'
}

function formatRunStatus(status: WorkboardRun['status']): string {
  return status.replaceAll('_', ' ')
}

function statusBadgeVariant(
  status: WorkboardRun['status']
): 'planned' | 'running' | 'attention' | 'blocked' | 'completed' | 'failed' | 'secondary' {
  if (status === 'queued') return 'planned'
  if (status === 'running') return 'running'
  if (status === 'waiting_for_user') return 'attention'
  if (status === 'blocked') return 'blocked'
  if (status === 'completed') return 'completed'
  if (status === 'failed') return 'failed'
  return 'secondary'
}

function getRunStateSummary(
  run: WorkboardRun,
  waitsFor: WorkboardRun[],
  inputRequest: WorkRunInputRequest | undefined,
  observedRun?: ObservedRunSnapshot | null
): string {
  if (inputRequest?.status === 'queued_for_resume') {
    return 'Answer received. This Work Item will continue when the agent is available.'
  }

  if (run.status === 'waiting_for_user') {
    return inputRequest?.title || 'Waiting for user input.'
  }

  if (run.status === 'blocked') {
    return waitsFor.length > 0
      ? `Waiting for ${waitsFor.map((item) => item.title).join(', ')}.`
      : 'Waiting for dependencies.'
  }

  if (run.status === 'running') {
    return observedRun?.latestActivity || `Running with ${run.agentName}.`
  }

  if (run.status === 'queued') {
    return `Queued for ${run.agentName}.`
  }

  if (run.status === 'completed') {
    return run.resultSummary ? truncateText(run.resultSummary, 180) : 'Completed.'
  }

  if (run.status === 'failed') {
    return run.error ? truncateText(run.error, 180) : 'Failed.'
  }

  return 'Cancelled.'
}

function getVisibleWorkRunInputRequest(
  inputRequests: WorkRunInputRequest[],
  runId: string | undefined
): WorkRunInputRequest | undefined {
  if (!runId) {
    return undefined
  }

  return (
    inputRequests.find((item) => item.runId === runId && item.status === 'pending') ??
    inputRequests.find((item) => item.runId === runId && item.status === 'queued_for_resume')
  )
}

function getWorkRunInputBadge(
  inputRequest: WorkRunInputRequest | undefined
): { label: string; variant: 'attention' | 'outline' } | null {
  if (!inputRequest) {
    return null
  }

  const badgeByStatus: Partial<
    Record<WorkRunInputRequestStatus, { label: string; variant: 'attention' | 'outline' }>
  > = {
    pending: { label: 'Input', variant: 'attention' },
    queued_for_resume: { label: 'Resume queued', variant: 'outline' }
  }

  return badgeByStatus[inputRequest.status] ?? null
}

function truncateText(value: string, maxLength: number): string {
  const normalizedValue = value.replace(/\s+/g, ' ').trim()
  return normalizedValue.length > maxLength
    ? `${normalizedValue.slice(0, Math.max(0, maxLength - 1))}...`
    : normalizedValue
}

function formatOptionalDate(value: string | null): string {
  if (!value) {
    return 'Not available'
  }

  return new Date(value).toLocaleString()
}

function formatElapsedMs(value: number): string {
  const totalSeconds = Math.max(0, Math.floor(value / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes === 0) {
    return `${seconds}s`
  }
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`
}

function matchesWorkSearch(run: WorkboardRun, search: string): boolean {
  const normalizedSearch = search.trim().toLowerCase()

  if (!normalizedSearch) {
    return true
  }

  return [
    run.title,
    run.agentName,
    run.agentRole,
    run.instruction,
    run.expectedOutput,
    run.resultSummary,
    run.error,
    run.requestTitle,
    ...run.artifactRefs,
    ...run.changedFiles
  ]
    .filter(Boolean)
    .some((value) => value.toLowerCase().includes(normalizedSearch))
}

function buildRequestStats(data: WorkboardData): RequestFilterStat[] {
  return data.requests.map((request) => {
    const requestRuns = data.runs.filter((run) => run.requestId === request.id)
    return {
      id: request.id,
      title: request.title,
      totalCount: requestRuns.length,
      activeCount: requestRuns.filter((run) => !isTerminalRunStatus(run.status)).length,
      createdAt: request.createdAt
    }
  })
}

function getVisibleRequestFilters(
  requestStats: RequestFilterStat[],
  activeFilter: string
): RequestFilterStat[] {
  const visible: RequestFilterStat[] = []
  const selectedRequest = requestStats.find((request) => request.id === activeFilter)

  if (selectedRequest) {
    visible.push(selectedRequest)
  }

  const sortedRequests = [...requestStats].sort((first, second) => {
    if (second.activeCount !== first.activeCount) {
      return second.activeCount - first.activeCount
    }

    return Date.parse(second.createdAt) - Date.parse(first.createdAt)
  })

  for (const request of sortedRequests) {
    if (visible.length >= 2) break
    if (!visible.some((visibleRequest) => visibleRequest.id === request.id)) {
      visible.push(request)
    }
  }

  return visible
}

function DetailBlock({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
      <div className="mt-1 whitespace-pre-wrap text-sm leading-6">{children}</div>
    </div>
  )
}

function EmptyDetailState({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="rounded-lg border border-dashed bg-card p-4 text-sm text-muted-foreground">
      {children}
    </div>
  )
}

function QuestionAnswer({
  question,
  answer,
  onChange
}: {
  question: InteractionQuestion
  answer: InteractionAnswer | undefined
  onChange: (answer: InteractionAnswer) => void
}): React.JSX.Element {
  if (question.kind === 'boolean') {
    return (
      <label className="grid gap-1 text-sm">
        {question.label}
        <SelectControl
          value={answer?.type === 'boolean' && answer.value ? 'true' : 'false'}
          onChange={(value) =>
            onChange({ questionId: question.id, type: 'boolean', value: value === 'true' })
          }
        >
          <option value="true">{question.trueLabel}</option>
          <option value="false">{question.falseLabel}</option>
        </SelectControl>
      </label>
    )
  }

  if (question.kind === 'choice') {
    return (
      <label className="grid gap-1 text-sm">
        {question.label}
        <SelectControl
          value={answer?.type === 'option' ? answer.optionId : '__custom'}
          onChange={(value) => {
            if (value === '__custom') {
              onChange({ questionId: question.id, type: 'custom', text: '' })
              return
            }
            onChange({ questionId: question.id, type: 'option', optionId: value })
          }}
        >
          {question.options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
          {question.allowCustom !== false ? <option value="__custom">Custom</option> : null}
        </SelectControl>
        {answer?.type === 'custom' || !answer ? (
          <input
            className="h-10 rounded-md border bg-background px-3 text-sm"
            placeholder="Custom answer"
            value={answer?.type === 'custom' ? answer.text : ''}
            onChange={(event) =>
              onChange({ questionId: question.id, type: 'custom', text: event.target.value })
            }
          />
        ) : null}
      </label>
    )
  }

  return (
    <label className="grid gap-1 text-sm">
      {question.label}
      <input
        className="h-10 rounded-md border bg-background px-3 text-sm"
        placeholder={question.placeholder}
        value={answer?.type === 'text' ? answer.text : ''}
        onChange={(event) =>
          onChange({ questionId: question.id, type: 'text', text: event.target.value })
        }
      />
    </label>
  )
}

function buildDraftLevels(items: WorkboardDraftItem[]): WorkboardDraftItem[][] {
  const levels = new Map<string, number>()

  function levelFor(item: WorkboardDraftItem, seen = new Set<string>()): number {
    if (levels.has(item.tempId)) return levels.get(item.tempId) ?? 0
    if (seen.has(item.tempId)) return 0
    seen.add(item.tempId)

    const dependencyLevels = item.dependsOnTempIds
      .map((id) => items.find((candidate) => candidate.tempId === id))
      .filter((dependency): dependency is WorkboardDraftItem => Boolean(dependency))
      .map((dependency) => levelFor(dependency, seen) + 1)
    const level = dependencyLevels.length > 0 ? Math.max(...dependencyLevels) : 0
    levels.set(item.tempId, level)
    return level
  }

  items.forEach((item) => levelFor(item))

  return Array.from(levels.values())
    .filter((value, index, all) => all.indexOf(value) === index)
    .sort((a, b) => a - b)
    .map((level) => items.filter((item) => levels.get(item.tempId) === level))
}

function buildDraftStageMap(levels: WorkboardDraftItem[][]): Map<string, number> {
  return new Map(
    levels.flatMap((level, levelIndex) =>
      level.map((item) => [item.tempId, levelIndex + 1] as const)
    )
  )
}

function draftItemDependsOn(
  items: WorkboardDraftItem[],
  itemId: string,
  dependencyId: string,
  visited = new Set<string>()
): boolean {
  if (visited.has(itemId)) return false
  visited.add(itemId)

  const item = items.find((candidate) => candidate.tempId === itemId)
  if (!item) return false
  if (item.dependsOnTempIds.includes(dependencyId)) return true

  return item.dependsOnTempIds.some((nextDependencyId) =>
    draftItemDependsOn(items, nextDependencyId, dependencyId, visited)
  )
}

function agentName(agents: Agent[], agentId: string): string {
  return agents.find((agent) => agent.id === agentId)?.name ?? 'Agent'
}
