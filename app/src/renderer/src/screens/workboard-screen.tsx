import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Check,
  ChevronDown,
  Clock3,
  Columns3,
  FolderOpen,
  GitBranch,
  Loader2,
  Search,
  Play,
  RefreshCcw,
  Send,
  XCircle
} from 'lucide-react'
import type {
  Agent,
  InteractionAnswer,
  InteractionQuestion,
  WorkboardData,
  WorkboardDraftItem,
  WorkboardDraftPlan,
  WorkboardRun,
  WorkRunInputRequest
} from '@shared/contracts'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
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

export function WorkboardScreen(): React.JSX.Element {
  const [agents, setAgents] = useState<Agent[]>([])
  const [data, setData] = useState<WorkboardData>({
    requests: [],
    runs: [],
    dependencies: [],
    inputRequests: []
  })
  const [request, setRequest] = useState('')
  const [reviewBeforeStart, setReviewBeforeStart] = useState(true)
  const [draftPlan, setDraftPlan] = useState<WorkboardDraftPlan | null>(null)
  const [selectedDraftId, setSelectedDraftId] = useState('')
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
      setData(nextData)
      setAgents(nextAgents)
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

  const enabledAgents = agents.filter((agent) => agent.enabled)
  const selectedRun = data.runs.find((run) => run.id === selectedRunId) ?? null
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

  const selectedDraftItem = draftPlan?.items.find((item) => item.tempId === selectedDraftId) ?? null
  const canSubmit = request.trim().length >= 12 && enabledAgents.length > 0 && !busy

  async function handleSubmit(): Promise<void> {
    if (!canSubmit) return
    setBusy('submit')
    setError('')

    try {
      const plan = await window.ordinus.workboard.generatePlan({ request })
      if (reviewBeforeStart) {
        openDraftPlan(plan)
        return
      }

      if (plan.items.length > 8) {
        openDraftPlan(plan)
        setError('Review this Work Request before starting because it has many Work Items.')
        return
      }

      await startDraftPlan(plan)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Work Request could not start.')
    } finally {
      setBusy('')
    }
  }

  async function handleStartDraft(): Promise<void> {
    if (!draftPlan) return
    setBusy('start-draft')
    setError('')

    try {
      await startDraftPlan(draftPlan)
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : 'Work Request could not start.')
    } finally {
      setBusy('')
    }
  }

  async function handleRegenerateDraft(): Promise<void> {
    setBusy('regenerate')
    setError('')
    try {
      const plan = await window.ordinus.workboard.generatePlan({ request })
      openDraftPlan(plan)
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

  function updateDraftItem(tempId: string, patch: Partial<WorkboardDraftItem>): void {
    setDraftPlan((current) => {
      if (!current) return current

      return {
        ...current,
        items: current.items.map((item) => (item.tempId === tempId ? { ...item, ...patch } : item))
      }
    })
  }

  function openDraftPlan(plan: WorkboardDraftPlan): void {
    setDraftPlan(plan)
    setSelectedDraftId(plan.items[0]?.tempId ?? '')
  }

  async function startDraftPlan(plan: WorkboardDraftPlan): Promise<void> {
    const nextData = await window.ordinus.workboard.startRequest({
      originalRequest: request,
      plan
    })
    const startedRequest = nextData.requests.find(
      (item) => item.originalRequest === request && item.title === plan.title
    )

    setData(nextData)
    setRequestFilter(startedRequest?.id ?? 'all')
    setSelectedRunId('')
    setDraftPlan(null)
    setSelectedDraftId('')
    setRequest('')
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
        <textarea
          aria-label="Work Request"
          className="max-h-40 min-h-24 w-full resize-none rounded-t-lg bg-transparent px-4 py-3 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-0"
          placeholder="Give agents a Work Request..."
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
            {reviewBeforeStart ? 'Review plan' : 'Start work'}
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
        workSearch={workSearch}
        onFilterChange={setRequestFilter}
        onWorkSearchChange={setWorkSearch}
      />

      <WorkColumns
        runs={filteredRuns}
        inputRequests={data.inputRequests}
        onSelectRun={setSelectedRunId}
      />

      <PlanReviewDialog
        open={Boolean(draftPlan)}
        request={request}
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
          setDraftPlan(null)
          setSelectedDraftId('')
        }}
      />

      <RunDetailDrawer
        run={selectedRun}
        dependencies={data.dependencies}
        runs={data.runs}
        inputRequest={data.inputRequests.find(
          (item) => item.runId === selectedRun?.id && item.status === 'pending'
        )}
        busy={busy}
        onClose={() => setSelectedRunId('')}
        onCancel={(runId) => void handleCancelRun(runId)}
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

type RunDetailTab = 'overview' | 'output' | 'files' | 'runtime'

const runDetailTabs: Array<{ id: RunDetailTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'output', label: 'Output' },
  { id: 'files', label: 'Files' },
  { id: 'runtime', label: 'Runtime' }
]

function WorkFilterBar({
  filter,
  allCount,
  activeCount,
  requestStats,
  workSearch,
  onFilterChange,
  onWorkSearchChange
}: {
  filter: string
  allCount: number
  activeCount: number
  requestStats: RequestFilterStat[]
  workSearch: string
  onFilterChange: (filter: string) => void
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

      <div className="flex min-w-0 xl:ml-auto">
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
  onSelectRun
}: {
  runs: WorkboardRun[]
  inputRequests: WorkRunInputRequest[]
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
                    columnRuns.map((run) => (
                      <button
                        key={run.id}
                        type="button"
                        className="rounded-md border bg-background p-3 text-left shadow-sm transition-colors hover:border-primary/40"
                        onClick={() => onSelectRun(run.id)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-sm font-semibold leading-5">{run.title}</h3>
                          {inputRequests.some(
                            (request) => request.runId === run.id && request.status === 'pending'
                          ) ? (
                            <Badge className="shrink-0" variant="attention">
                              Input
                            </Badge>
                          ) : null}
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">{run.agentName}</p>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                          {run.error || run.resultSummary || run.expectedOutput || run.instruction}
                        </p>
                        <p className="mt-2 truncate text-[11px] text-muted-foreground">
                          {run.requestTitle}
                        </p>
                      </button>
                    ))
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

function PlanReviewDialog({
  open,
  request,
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

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (!nextOpen ? onDiscard() : undefined)}>
      <DialogContent className="max-w-6xl p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>Review Work Request</DialogTitle>
          <DialogDescription>
            Review assignments and dependencies before agents start.
          </DialogDescription>
        </DialogHeader>
        {plan ? (
          <div className="grid min-h-[620px] grid-cols-1 overflow-hidden lg:grid-cols-[1fr_360px]">
            <div className="flex min-w-0 flex-col gap-4 overflow-auto p-6">
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

              <div className="rounded-lg border bg-background p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <Columns3 className="size-4" />
                  Dependency flow
                </div>
                <div className="flex min-w-max flex-col gap-4">
                  {levels.map((level, index) => (
                    <div key={index} className="flex items-stretch gap-3">
                      {level.map((item) => (
                        <button
                          key={item.tempId}
                          type="button"
                          className={cn(
                            'w-64 rounded-md border bg-card p-3 text-left transition-colors',
                            item.tempId === selectedItemId
                              ? 'border-primary ring-2 ring-primary/20'
                              : 'hover:border-primary/40'
                          )}
                          onClick={() => onSelectItem(item.tempId)}
                        >
                          <p className="text-sm font-semibold leading-5">{item.title}</p>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {agentName(agents, item.assignedAgentId)}
                          </p>
                          {item.dependsOnTempIds.length > 0 ? (
                            <p className="mt-2 text-[11px] text-muted-foreground">
                              Waits for {item.dependsOnTempIds.length}
                            </p>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border bg-background p-4">
                <h3 className="text-sm font-semibold">Original request</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                  {request}
                </p>
              </div>
            </div>

            <div className="border-l bg-card p-4">
              {selectedItem ? (
                <DraftItemEditor
                  item={selectedItem}
                  items={plan.items}
                  agents={agents}
                  onChange={(patch) => onUpdateItem(selectedItem.tempId, patch)}
                />
              ) : (
                <p className="text-sm text-muted-foreground">Select a Work Item.</p>
              )}
            </div>
          </div>
        ) : null}
        <DialogFooter className="border-t px-6 py-4">
          <Button variant="outline" onClick={onDiscard}>
            Discard
          </Button>
          <Button variant="outline" onClick={onRegenerate} disabled={busy === 'regenerate'}>
            {busy === 'regenerate' ? <Loader2 className="animate-spin" /> : <RefreshCcw />}
            Regenerate
          </Button>
          <Button onClick={onStart} disabled={busy === 'start-draft'}>
            {busy === 'start-draft' ? <Loader2 className="animate-spin" /> : <Play />}
            Start work
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DraftItemEditor({
  item,
  items,
  agents,
  onChange
}: {
  item: WorkboardDraftItem
  items: WorkboardDraftItem[]
  agents: Agent[]
  onChange: (patch: Partial<WorkboardDraftItem>) => void
}): React.JSX.Element {
  return (
    <div className="grid gap-3">
      <h3 className="text-sm font-semibold">Work Item details</h3>
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
          .map((candidate) => (
            <label key={candidate.tempId} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={item.dependsOnTempIds.includes(candidate.tempId)}
                onChange={(event) => {
                  const next = event.target.checked
                    ? [...item.dependsOnTempIds, candidate.tempId]
                    : item.dependsOnTempIds.filter((id) => id !== candidate.tempId)
                  onChange({ dependsOnTempIds: next })
                }}
              />
              {candidate.title}
            </label>
          ))}
      </div>
    </div>
  )
}

function RunDetailDrawer({
  run,
  dependencies,
  runs,
  inputRequest,
  busy,
  onClose,
  onCancel,
  onAnswered,
  onError
}: {
  run: WorkboardRun | null
  dependencies: WorkboardData['dependencies']
  runs: WorkboardRun[]
  inputRequest?: WorkRunInputRequest
  busy: string
  onClose: () => void
  onCancel: (runId: string) => void
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
            inputRequest={inputRequest}
            answers={answers}
            onAnswerChange={updateAnswer}
            onSubmitAnswers={() => void submitAnswers()}
            onRevealPath={(path) => void revealPath(path)}
          />
        </div>

        {!isTerminalRunStatus(run.status) ? (
          <footer className="border-t p-4">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => onCancel(run.id)}
              disabled={busy === `cancel-${run.id}`}
            >
              Cancel Work Item
            </Button>
          </footer>
        ) : null}
      </aside>
    </div>
  )
}

function RunDetailHeader({
  run,
  waitsFor,
  inputRequest,
  onClose
}: {
  run: WorkboardRun
  waitsFor: WorkboardRun[]
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
        <Badge variant="outline">{run.agentName}</Badge>
        <Badge variant="outline">{run.providerId}</Badge>
      </div>

      <p className="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground">
        {getRunStateSummary(run, waitsFor, inputRequest)}
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
  inputRequest,
  answers,
  onAnswerChange,
  onSubmitAnswers,
  onRevealPath
}: {
  activeTab: RunDetailTab
  run: WorkboardRun
  waitsFor: WorkboardRun[]
  inputRequest?: WorkRunInputRequest
  answers: Record<string, InteractionAnswer>
  onAnswerChange: (answer: InteractionAnswer) => void
  onSubmitAnswers: () => void
  onRevealPath: (path: string) => void
}): React.JSX.Element {
  if (activeTab === 'overview') {
    return <RunOverviewTab run={run} waitsFor={waitsFor} />
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

  return <RunRuntimeTab run={run} />
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
      {inputRequest ? (
        <WorkInputRequestPanel
          inputRequest={inputRequest}
          answers={answers}
          onAnswerChange={onAnswerChange}
          onSubmit={onSubmitAnswers}
        />
      ) : null}
      {run.resultSummary ? (
        <DetailBlock label="Output">{run.resultSummary}</DetailBlock>
      ) : (
        <EmptyDetailState>No output yet.</EmptyDetailState>
      )}
      {run.error ? <DetailBlock label="Error">{run.error}</DetailBlock> : null}
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
  const hasFiles = run.artifactRefs.length > 0 || run.changedFiles.length > 0

  if (!hasFiles) {
    return <EmptyDetailState>No files reported.</EmptyDetailState>
  }

  return (
    <div className="grid gap-3">
      {run.artifactRefs.length > 0 ? (
        <DetailBlock label="Artifacts">
          <PathList paths={run.artifactRefs} onReveal={onRevealPath} />
        </DetailBlock>
      ) : null}
      {run.changedFiles.length > 0 ? (
        <DetailBlock label="Changed files">
          <PathList paths={run.changedFiles} onReveal={onRevealPath} />
        </DetailBlock>
      ) : null}
    </div>
  )
}

function RunRuntimeTab({ run }: { run: WorkboardRun }): React.JSX.Element {
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
    </div>
  )
}

function isTerminalRunStatus(status: WorkboardRun['status']): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}

function defaultRunDetailTab(run: WorkboardRun): RunDetailTab {
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
  inputRequest: WorkRunInputRequest | undefined
): string {
  if (run.status === 'waiting_for_user') {
    return inputRequest?.title || 'Waiting for user input.'
  }

  if (run.status === 'blocked') {
    return waitsFor.length > 0
      ? `Waiting for ${waitsFor.map((item) => item.title).join(', ')}.`
      : 'Waiting for dependencies.'
  }

  if (run.status === 'running') {
    return `Running with ${run.agentName}.`
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

function PathList({
  paths,
  onReveal
}: {
  paths: string[]
  onReveal: (path: string) => void
}): React.JSX.Element {
  return (
    <div className="grid gap-2">
      {paths.map((path) => (
        <div
          key={path}
          className="flex items-center justify-between gap-2 rounded-md border bg-card px-2 py-1.5"
        >
          <code className="min-w-0 flex-1 break-all font-mono text-xs leading-5 text-foreground">
            {path}
          </code>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            onClick={() => onReveal(path)}
          >
            <FolderOpen />
            <span className="sr-only">Show in Finder</span>
          </Button>
        </div>
      ))}
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

function agentName(agents: Agent[], agentId: string): string {
  return agents.find((agent) => agent.id === agentId)?.name ?? 'Agent'
}
