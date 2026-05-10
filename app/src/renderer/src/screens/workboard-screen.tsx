import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Columns3,
  FolderOpen,
  GitBranch,
  Loader2,
  PauseCircle,
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

const columns: Array<{ id: WorkboardRun['status']; label: string; icon: typeof Play }> = [
  { id: 'queued', label: 'Queued', icon: PauseCircle },
  { id: 'running', label: 'Running', icon: Loader2 },
  { id: 'waiting_for_user', label: 'Waiting', icon: AlertCircle },
  { id: 'blocked', label: 'Blocked', icon: GitBranch },
  { id: 'completed', label: 'Completed', icon: CheckCircle2 },
  { id: 'failed', label: 'Failed', icon: XCircle },
  { id: 'cancelled', label: 'Cancelled', icon: XCircle }
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
  const filteredRuns = data.runs.filter((run) => {
    if (requestFilter === 'all') return true
    if (requestFilter === 'active') {
      return !isTerminalRunStatus(run.status)
    }
    return run.requestId === requestFilter
  })

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
    <div className="flex min-h-0 flex-1 flex-col gap-4 py-6">
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-xl font-semibold leading-tight tracking-normal">Workboard</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Turn a request into agent-owned Work Items, review the plan, and follow live progress.
          </p>
        </div>

        <div className="rounded-lg border bg-card p-3">
          <div className="flex flex-col gap-3 lg:flex-row">
            <textarea
              className="min-h-20 flex-1 resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-6 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="What should the agents work on?"
              value={request}
              onChange={(event) => setRequest(event.target.value)}
            />
            <div className="flex min-w-52 flex-col justify-between gap-3">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  className="size-4 rounded border-border"
                  checked={reviewBeforeStart}
                  onChange={(event) => setReviewBeforeStart(event.target.checked)}
                />
                Review before start
              </label>
              <Button onClick={() => void handleSubmit()} disabled={!canSubmit}>
                {busy === 'submit' ? <Loader2 className="animate-spin" /> : <Send />}
                Create Work Request
              </Button>
            </div>
          </div>
          {enabledAgents.length === 0 ? (
            <p className="mt-2 text-xs text-destructive">
              Create and enable at least one agent before creating Work Requests.
            </p>
          ) : null}
        </div>
      </section>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <section className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <SelectControl value={requestFilter} onChange={setRequestFilter}>
            <option value="all">All work</option>
            <option value="active">Active work</option>
            {data.requests.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </SelectControl>
        </div>
        <Button variant="outline" size="sm" onClick={() => void loadWorkboard()} disabled={!!busy}>
          <RefreshCcw className={busy === 'load' ? 'animate-spin' : ''} />
          Refresh
        </Button>
      </section>

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
    <div className="min-h-0 flex-1 overflow-x-auto rounded-lg border bg-card">
      <div className="flex min-h-[520px] w-max gap-3 p-3">
        {columns.map((column) => {
          const columnRuns = runs.filter((run) => run.status === column.id)
          const Icon = column.icon

          return (
            <section
              key={column.id}
              className="flex w-72 shrink-0 flex-col rounded-md bg-accent/50"
            >
              <header className="flex items-center justify-between border-b px-3 py-2">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Icon className={cn('size-4', column.id === 'running' ? 'animate-spin' : '')} />
                  {column.label}
                </div>
                <Badge variant="secondary">{columnRuns.length}</Badge>
              </header>
              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
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
  const [answers, setAnswers] = useState<Record<string, InteractionAnswer>>({})

  if (!run) return null
  const activeRun = run

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

  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l bg-background shadow-xl">
      <header className="flex items-start justify-between gap-3 border-b p-4">
        <div>
          <p className="text-xs text-muted-foreground">{run.requestTitle}</p>
          <h3 className="mt-1 text-lg font-semibold leading-6">{run.title}</h3>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <XCircle />
          <span className="sr-only">Close</span>
        </Button>
      </header>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid gap-4">
          <DetailBlock label="Status">{run.status.replaceAll('_', ' ')}</DetailBlock>
          <DetailBlock label="Assigned agent">{run.agentName}</DetailBlock>
          <DetailBlock label="Instruction">{run.instruction}</DetailBlock>
          <DetailBlock label="Expected output">{run.expectedOutput || 'Not specified'}</DetailBlock>
          <DetailBlock label="Inputs">
            {waitsFor.length > 0 ? waitsFor.map((item) => item.title).join(', ') : 'None'}
          </DetailBlock>
          {run.resultSummary ? <DetailBlock label="Output">{run.resultSummary}</DetailBlock> : null}
          {run.artifactRefs.length > 0 ? (
            <DetailBlock label="Artifacts">
              <PathList paths={run.artifactRefs} onReveal={(path) => void revealPath(path)} />
            </DetailBlock>
          ) : null}
          {run.changedFiles.length > 0 ? (
            <DetailBlock label="Changed files">
              <PathList paths={run.changedFiles} onReveal={(path) => void revealPath(path)} />
            </DetailBlock>
          ) : null}
          {run.error ? <DetailBlock label="Error">{run.error}</DetailBlock> : null}

          {inputRequest ? (
            <div className="rounded-lg border border-primary/30 bg-primary-soft/40 p-3">
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
                    onChange={(answer) =>
                      setAnswers((current) => ({ ...current, [question.id]: answer }))
                    }
                  />
                ))}
                <Button onClick={() => void submitAnswers()}>Continue Work Item</Button>
              </div>
            </div>
          ) : null}
        </div>
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
  )
}

function isTerminalRunStatus(status: WorkboardRun['status']): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}

function DetailBlock({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div>
      <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
      <div className="mt-1 whitespace-pre-wrap text-sm leading-6">{children}</div>
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
