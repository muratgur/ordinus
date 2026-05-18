import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction
} from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Check,
  ChevronDown,
  ChevronLeft,
  Clock3,
  Columns3,
  CornerDownRight,
  Copy,
  FileText,
  GitBranch,
  Loader2,
  Plus,
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
  WorkboardContextReferenceInput,
  WorkboardData,
  WorkboardDraftItem,
  WorkboardDraftPlan,
  WorkboardRun,
  WorkRunInputRequest
} from '@shared/contracts'
import { appRoutePaths } from '@renderer/app/routes'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import {
  DiagnosticBlock,
  formatLivenessHealth,
  formatObservedPhase,
  mergeDiagnostics
} from '@renderer/components/observability-details'
import { FileReferenceList } from '@renderer/components/file-reference-list'
import { getFileReferences } from '@renderer/components/file-reference-utils'
import { MarkdownContent } from '@renderer/components/markdown-content'
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

const newWorkComposerTarget: WorkComposerTarget = {
  contextReferences: [],
  contextLabels: [],
  requestedAgentIds: []
}

type ComposerContextReference = {
  key: string
  input: WorkboardContextReferenceInput
  label: string
  detail: string
}

type WorkComposerState = {
  open: boolean
  request: string
  destinationRequestId: string
  contextReferences: ComposerContextReference[]
  requestedAgentIds: string[]
  workspacePath: string
}

const emptyComposerState: WorkComposerState = {
  open: false,
  request: '',
  destinationRequestId: '',
  contextReferences: [],
  requestedAgentIds: [],
  workspacePath: ''
}

const draftPriorityOptions = [
  { label: 'Low', value: -1 },
  { label: 'Normal', value: 0 },
  { label: 'High', value: 1 }
] as const

const draftFieldClassName = 'grid min-w-0 gap-1 text-xs font-medium text-muted-foreground'
const draftInputClassName =
  'h-10 min-w-0 rounded-md border bg-background px-3 text-sm font-normal text-foreground'
const draftTextareaClassName =
  'ordinus-scrollbar min-w-0 resize-none rounded-md border bg-background px-3 py-2 text-sm font-normal leading-6 text-foreground'

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
    contextReferences: [],
    inputRequests: []
  })
  const [observedRuns, setObservedRuns] = useState<ObservedRunSnapshot[]>([])
  const [composer, setComposer] = useState<WorkComposerState>(emptyComposerState)
  const [reviewBeforeStart, setReviewBeforeStart] = useState(true)
  const [selectedRunId, setSelectedRunId] = useState('')
  const [runDetailBackStack, setRunDetailBackStack] = useState<string[]>([])
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
  const selectedRequest = data.requests.find((item) => item.id === requestFilter) ?? null

  async function handleSubmitComposer(nextComposer = composer): Promise<void> {
    if (nextComposer.request.trim().length < 12 || enabledAgents.length === 0 || busy) return
    setBusy('submit')
    setError('')
    const submittedRequest = nextComposer.request.trim()
    const target = buildComposerTarget(nextComposer, data)

    try {
      const plan = await generateDraftPlan(target, submittedRequest)
      if (reviewBeforeStart) {
        openDraftPlan(plan, target, submittedRequest)
        setComposer(emptyComposerState)
        return
      }

      if (plan.items.length > 8) {
        openDraftPlan(plan, target, submittedRequest)
        setComposer(emptyComposerState)
        setError(getLargePlanReviewMessage(target))
        return
      }

      await startDraftPlan(plan, target, submittedRequest)
    } catch (submitError) {
      setError(getStartErrorMessage(submitError, target))
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
    closeRunDetail()
    onDraftReviewChange(emptyWorkboardDraftReviewState)
    setComposer(emptyComposerState)
  }

  function handleContinueRun(run: WorkboardRun): void {
    setComposer({
      ...emptyComposerState,
      open: true,
      destinationRequestId: run.requestId,
      contextReferences: [createWorkItemContextReference(run)]
    })
    closeRunDetail()
  }

  function handleContinueRequest(requestId: string): void {
    const workRequest = data.requests.find((item) => item.id === requestId)
    if (!workRequest) return

    setComposer({
      ...emptyComposerState,
      open: true,
      destinationRequestId: workRequest.id
    })
    closeRunDetail()
  }

  function handleNewRequest(): void {
    setComposer({ ...emptyComposerState, open: true })
    closeRunDetail()
  }

  function openRunDetail(runId: string): void {
    setRunDetailBackStack([])
    setSelectedRunId(runId)
  }

  function openLinkedRunDetail(runId: string): void {
    if (!selectedRunId || selectedRunId === runId) return

    setRunDetailBackStack((current) => [...current, selectedRunId])
    setSelectedRunId(runId)
  }

  function goBackRunDetail(): void {
    const previousRunId = runDetailBackStack.at(-1)
    if (!previousRunId) return

    setRunDetailBackStack((current) => current.slice(0, -1))
    setSelectedRunId(previousRunId)
  }

  function closeRunDetail(): void {
    setRunDetailBackStack([])
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
      <section className="flex shrink-0 flex-col gap-3 rounded-lg border bg-card px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Columns3 className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Workboard</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Create requests from New, then inspect running and completed Work Items here.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          className="shrink-0"
          onClick={handleNewRequest}
          disabled={enabledAgents.length === 0}
        >
          <Plus />
          New
        </Button>
        {enabledAgents.length === 0 ? (
          <p className="text-xs text-destructive sm:ml-auto">
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
        onSelectRun={openRunDetail}
      />

      <RequestComposerDialog
        open={composer.open}
        composer={composer}
        data={data}
        agents={enabledAgents}
        reviewBeforeStart={reviewBeforeStart}
        busy={busy}
        onComposerChange={setComposer}
        onReviewBeforeStartChange={setReviewBeforeStart}
        onSubmit={(nextComposer) => void handleSubmitComposer(nextComposer)}
        onClose={() => setComposer(emptyComposerState)}
      />

      <PlanReviewDialog
        open={Boolean(draftPlan)}
        request={draftContext?.request ?? composer.request}
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
        canGoBack={runDetailBackStack.length > 0}
        onBack={goBackRunDetail}
        onClose={closeRunDetail}
        onCancel={(runId) => void handleCancelRun(runId)}
        onContinue={handleContinueRun}
        onSelectRun={openLinkedRunDetail}
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

const targetDropdownTriggerClass =
  'flex h-10 w-full items-center justify-between gap-2 rounded-md border bg-background px-3 text-left text-sm transition-colors'

const targetDropdownPanelClass =
  'absolute top-11 z-40 w-full max-w-[calc(100vw-3rem)] rounded-lg border bg-card p-2 shadow-lg sm:min-w-[28rem]'

type ReferenceView = 'suggested' | 'selected' | 'all' | 'manual'

const referenceViews: Array<{ id: ReferenceView; label: string }> = [
  { id: 'suggested', label: 'Suggested' },
  { id: 'selected', label: 'Selected' },
  { id: 'all', label: 'All files' },
  { id: 'manual', label: 'Manual path' }
]

function RequestComposerDialog({
  open,
  composer,
  data,
  agents,
  reviewBeforeStart,
  busy,
  onComposerChange,
  onReviewBeforeStartChange,
  onSubmit,
  onClose
}: {
  open: boolean
  composer: WorkComposerState
  data: WorkboardData
  agents: Agent[]
  reviewBeforeStart: boolean
  busy: string
  onComposerChange: (composer: WorkComposerState) => void
  onReviewBeforeStartChange: (reviewBeforeStart: boolean) => void
  onSubmit: (composer: WorkComposerState) => void
  onClose: () => void
}): React.JSX.Element {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [mentionPicker, setMentionPicker] = useState<MentionPickerState | null>(null)
  const [activeMentionIndex, setActiveMentionIndex] = useState(0)
  const mentionOptions = useMemo(
    () => getAgentMentionOptions(agents, mentionPicker?.query ?? ''),
    [agents, mentionPicker?.query]
  )
  const canSubmit = composer.request.trim().length >= 12 && agents.length > 0 && !busy
  const showMentionPicker = Boolean(mentionPicker && mentionOptions.length > 0)

  function update(patch: Partial<WorkComposerState>): void {
    onComposerChange({ ...composer, ...patch, open: true })
  }

  function selectMention(
    option: AgentMentionOption,
    range = getTextareaSelectionRange(textareaRef.current, composer.request.length)
  ): void {
    const insertion = insertMention(composer.request, option.label, range.start, range.end)
    update({
      request: insertion.value,
      requestedAgentIds: composer.requestedAgentIds.includes(option.agentId)
        ? composer.requestedAgentIds
        : [...composer.requestedAgentIds, option.agentId]
    })
    setMentionPicker(null)
    setActiveMentionIndex(0)

    window.requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(insertion.caret, insertion.caret)
    })
  }

  function updateMentionPicker(nextValue: string, caret: number): void {
    setMentionPicker(getActiveMentionPicker(nextValue, caret))
    setActiveMentionIndex(0)
  }

  function handleTextareaChange(event: React.ChangeEvent<HTMLTextAreaElement>): void {
    update({ request: event.target.value })
    updateMentionPicker(event.target.value, event.target.selectionStart)
  }

  function handleTextareaKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (showMentionPicker && mentionPicker) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActiveMentionIndex((index) => (index + 1) % mentionOptions.length)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveMentionIndex((index) => (index - 1 + mentionOptions.length) % mentionOptions.length)
        return
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault()
        selectMention(mentionOptions[activeMentionIndex], mentionPicker)
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setMentionPicker(null)
        return
      }
    }

    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && canSubmit) {
      onSubmit(composer)
    }
  }

  function handleDestinationChange(destinationRequestId: string): void {
    update({
      destinationRequestId,
      contextReferences: composer.contextReferences.filter(
        (reference) =>
          reference.input.kind !== 'work_item' ||
          isWorkItemContextInRequest(reference, destinationRequestId, data)
      )
    })
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (!nextOpen ? onClose() : undefined)}>
      <DialogContent className="grid h-[calc(100vh-1rem)] max-h-[calc(100vh-1rem)] max-w-6xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 p-0 sm:h-[min(820px,calc(100vh-2rem))] sm:max-h-[calc(100vh-2rem)]">
        <DialogHeader className="border-b px-5 py-3 pr-12 sm:px-6">
          <DialogTitle>New request</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto p-4 ordinus-scrollbar sm:p-5">
          <div className="grid gap-3">
            <div className="overflow-visible rounded-lg border bg-card">
              <div className="grid gap-2 border-b bg-background/40 p-3 sm:grid-cols-2">
                <WorkRequestSelect
                  data={data}
                  destinationRequestId={composer.destinationRequestId}
                  onDestinationChange={handleDestinationChange}
                />
                <ContinueFromSelect composer={composer} data={data} onComposerChange={update} />
              </div>

              <div className="relative overflow-visible">
                {showMentionPicker ? (
                  <AgentMentionPicker
                    activeIndex={activeMentionIndex}
                    options={mentionOptions}
                    onActiveIndexChange={setActiveMentionIndex}
                    onSelect={(option) => {
                      if (mentionPicker) selectMention(option, mentionPicker)
                    }}
                  />
                ) : null}
                <textarea
                  ref={textareaRef}
                  className="ordinus-scrollbar min-h-48 w-full resize-none bg-transparent px-4 py-3 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground"
                  placeholder="Describe what should happen. Use @agent as an assignment hint."
                  value={composer.request}
                  onChange={handleTextareaChange}
                  onKeyDown={handleTextareaKeyDown}
                  onClick={(event) =>
                    updateMentionPicker(
                      event.currentTarget.value,
                      event.currentTarget.selectionStart
                    )
                  }
                  onKeyUp={(event) => {
                    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                      updateMentionPicker(
                        event.currentTarget.value,
                        event.currentTarget.selectionStart
                      )
                    }
                  }}
                />
              </div>
            </div>

            <FileContextPanel composer={composer} data={data} onComposerChange={update} />
          </div>
        </div>

        <DialogFooter className="flex-col gap-3 border-t bg-background px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
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
              onChange={(event) => onReviewBeforeStartChange(event.target.checked)}
            />
            <span
              className={cn(
                'grid size-4 place-items-center rounded border transition-colors',
                reviewBeforeStart ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card'
              )}
              aria-hidden="true"
            >
              {reviewBeforeStart ? <Check className="size-3" /> : null}
            </span>
            Review before start
          </label>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => onSubmit(composer)} disabled={!canSubmit}>
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function WorkRequestSelect({
  data,
  destinationRequestId,
  onDestinationChange
}: {
  data: WorkboardData
  destinationRequestId: string
  onDestinationChange: (destinationRequestId: string) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const selectedRequest = destinationRequestId
    ? data.requests.find((request) => request.id === destinationRequestId)
    : null
  const runCountByRequestId = getRunCountByRequestId(data.runs)
  const filteredRequests = data.requests.filter((request) => {
    const runCount = runCountByRequestId.get(request.id) ?? 0
    return matchesTargetSearch(search, request.title, request.status, `${runCount} items`)
  })

  function selectRequest(requestId: string): void {
    onDestinationChange(requestId)
    setOpen(false)
    setSearch('')
  }

  return (
    <div
      className="relative"
      onBlur={(event) => {
        const nextTarget = event.relatedTarget
        if (!nextTarget || !event.currentTarget.contains(nextTarget as Node)) {
          setOpen(false)
        }
      }}
    >
      <button
        type="button"
        className={cn(
          targetDropdownTriggerClass,
          open ? 'border-primary/40 text-foreground' : 'text-foreground hover:bg-accent'
        )}
        onClick={() => setOpen((nextOpen) => !nextOpen)}
      >
        <span className="min-w-0 truncate">{selectedRequest?.title ?? 'New Work Request'}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </button>

      {open ? (
        <div className={cn(targetDropdownPanelClass, 'left-0')}>
          <TargetDropdownSearch
            placeholder="Search Work Requests..."
            value={search}
            onChange={setSearch}
            onEscape={() => setOpen(false)}
          />
          <div className="mt-2 max-h-72 overflow-y-auto ordinus-scrollbar">
            <ComposerOptionButton
              selected={!destinationRequestId}
              label="New Work Request"
              detail="Start a fresh request"
              icon={!destinationRequestId ? <Check className="size-4" /> : <Plus className="size-4" />}
              onClick={() => selectRequest('')}
            />
            {filteredRequests.length === 0 ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">No Work Requests found.</p>
            ) : (
              filteredRequests.map((request) => {
                const runCount = runCountByRequestId.get(request.id) ?? 0
                const selected = request.id === destinationRequestId
                return (
                  <ComposerOptionButton
                    key={request.id}
                    selected={selected}
                    label={request.title}
                    detail={`${request.status} - ${runCount} item${runCount === 1 ? '' : 's'}`}
                    icon={selected ? <Check className="size-4" /> : <Columns3 className="size-4" />}
                    onClick={() => selectRequest(request.id)}
                  />
                )
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ContinueFromSelect({
  composer,
  data,
  onComposerChange
}: {
  composer: WorkComposerState
  data: WorkboardData
  onComposerChange: (patch: Partial<WorkComposerState>) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const availableRuns = composer.destinationRequestId
    ? data.runs.filter((run) => run.requestId === composer.destinationRequestId)
    : []
  const filteredRuns = availableRuns.filter((run) =>
    matchesTargetSearch(
      search,
      run.title,
      run.agentName,
      run.requestTitle,
      formatRunStatus(run.status)
    )
  )
  const selectedWorkItemReferences = composer.contextReferences.filter(
    (reference) => reference.input.kind === 'work_item'
  )
  const selectedKeys = new Set(selectedWorkItemReferences.map((reference) => reference.key))
  const disabled = !composer.destinationRequestId || availableRuns.length === 0
  const label = !composer.destinationRequestId
    ? 'No Work Items'
    : selectedWorkItemReferences.length > 0
      ? `Continue from: ${selectedWorkItemReferences.length} item${
          selectedWorkItemReferences.length === 1 ? '' : 's'
        }`
      : 'Add item context'

  function toggleRun(run: WorkboardRun): void {
    const reference = createWorkItemContextReference(run)
    onComposerChange({
      contextReferences: selectedKeys.has(reference.key)
        ? composer.contextReferences.filter((item) => item.key !== reference.key)
        : [...composer.contextReferences, reference]
    })
  }

  function toggleOpen(): void {
    if (disabled) return
    setOpen((nextOpen) => {
      const willOpen = !nextOpen
      if (!willOpen) setSearch('')
      return willOpen
    })
  }

  return (
    <div
      className="relative"
      onBlur={(event) => {
        const nextTarget = event.relatedTarget
        if (!nextTarget || !event.currentTarget.contains(nextTarget as Node)) {
          setOpen(false)
        }
      }}
    >
      <button
        type="button"
        className={cn(
          targetDropdownTriggerClass,
          disabled
            ? 'cursor-not-allowed text-muted-foreground'
            : open
              ? 'border-primary/40 text-foreground'
              : 'text-foreground hover:bg-accent'
        )}
        disabled={disabled}
        onClick={toggleOpen}
      >
        <span className="min-w-0 truncate">{label}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </button>

      {open ? (
        <div className={cn(targetDropdownPanelClass, 'right-0')}>
          <TargetDropdownSearch
            placeholder="Search Work Items..."
            value={search}
            onChange={setSearch}
            onEscape={() => setOpen(false)}
          />
          <div className="mt-2 max-h-72 overflow-y-auto ordinus-scrollbar">
            {filteredRuns.length === 0 ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">No Work Items found.</p>
            ) : (
              filteredRuns.map((run) => {
                const selected = selectedKeys.has(
                  getContextReferenceKey({ kind: 'work_item', runId: run.id })
                )
                return (
                  <ComposerOptionButton
                    key={run.id}
                    selected={selected}
                    label={run.title}
                    detail={`${formatRunStatus(run.status)} - ${run.agentName}`}
                    icon={
                      selected ? <Check className="size-4" /> : <GitBranch className="size-4" />
                    }
                    onClick={() => toggleRun(run)}
                  />
                )
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function TargetDropdownSearch({
  placeholder,
  value,
  onChange,
  onEscape
}: {
  placeholder: string
  value: string
  onChange: (value: string) => void
  onEscape: () => void
}): React.JSX.Element {
  return (
    <label className="flex h-9 items-center gap-2 rounded-md border bg-background px-2 text-muted-foreground">
      <Search className="size-4 shrink-0" />
      <input
        className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onEscape()
          }
        }}
      />
    </label>
  )
}

function ComposerOptionButton({
  selected,
  label,
  detail,
  icon,
  onClick
}: {
  selected: boolean
  label: string
  detail: string
  icon: React.ReactNode
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={cn(
        'flex w-full min-w-0 items-start gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors',
        selected ? 'bg-primary-soft text-foreground' : 'hover:bg-accent'
      )}
      onClick={onClick}
    >
      <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
      <span className="min-w-0">
        <span className="block truncate font-medium">{label}</span>
        <span className="block truncate text-xs text-muted-foreground">{detail}</span>
      </span>
    </button>
  )
}

function FileContextPanel({
  composer,
  data,
  onComposerChange
}: {
  composer: WorkComposerState
  data: WorkboardData
  onComposerChange: (patch: Partial<WorkComposerState>) => void
}): React.JSX.Element {
  const [view, setView] = useState<ReferenceView>('suggested')
  const fileReferences = composer.contextReferences.filter(
    (reference) => reference.input.kind === 'workspace_path'
  )
  const selectedKeys = new Set(fileReferences.map((reference) => reference.key))
  const scopedRuns = getReferenceScopedRuns(composer, data)
  const suggestedFileReferences = getRunFileContextReferences(scopedRuns)
  const allFileReferences = getRunFileContextReferences(data.runs)
  const visibleFileReferences = getVisibleFileReferences(
    view,
    suggestedFileReferences,
    fileReferences,
    allFileReferences
  )

  function addWorkspacePath(): void {
    const trimmedPath = composer.workspacePath.trim()
    if (!trimmedPath) return

    const reference = createWorkspacePathContextReference(trimmedPath)
    onComposerChange({
      workspacePath: '',
      contextReferences: selectedKeys.has(reference.key)
        ? composer.contextReferences
        : [...composer.contextReferences, reference]
    })
  }

  function addFileReference(reference: ComposerContextReference): void {
    if (selectedKeys.has(reference.key)) return
    onComposerChange({ contextReferences: [...composer.contextReferences, reference] })
  }

  function removeContextReference(key: string): void {
    onComposerChange({
      contextReferences: composer.contextReferences.filter((reference) => reference.key !== key)
    })
  }

  return (
    <section className="rounded-lg border bg-card">
      <div className="flex flex-col gap-3 border-b px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">References</h3>
          <p className="text-xs text-muted-foreground">
            Suggested files follow the selected Work Request and Work Items.
          </p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-md border bg-background p-1">
          {referenceViews.map((referenceView) => (
            <ReferenceViewButton
              key={referenceView.id}
              active={view === referenceView.id}
              onClick={() => setView(referenceView.id)}
            >
              {referenceView.label}
            </ReferenceViewButton>
          ))}
        </div>
      </div>

      <div className="grid gap-3 p-3">
        {fileReferences.length > 0 && view !== 'selected' ? (
          <div className="flex flex-wrap gap-2">
            {fileReferences.map((reference) => (
              <button
                key={reference.key}
                type="button"
                className="inline-flex max-w-full items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                onClick={() => removeContextReference(reference.key)}
              >
                <span className="max-w-[28rem] truncate">{reference.label}</span>
                <XCircle className="size-3.5 shrink-0" />
              </button>
            ))}
          </div>
        ) : null}

        {view === 'manual' ? (
          <div className="flex gap-2">
            <input
              className="h-9 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/50"
              placeholder="src/renderer/src/..."
              value={composer.workspacePath}
              onChange={(event) => onComposerChange({ workspacePath: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  addWorkspacePath()
                }
              }}
            />
            <Button type="button" variant="outline" size="sm" onClick={addWorkspacePath}>
              Add
            </Button>
          </div>
        ) : (
          <div className="grid max-h-64 gap-1 overflow-y-auto ordinus-scrollbar">
            {visibleFileReferences.length === 0 ? (
              <p className="rounded-md border bg-background px-3 py-3 text-sm text-muted-foreground">
                {view === 'suggested'
                  ? 'Select a Work Request or Work Item to see suggested files, or add a manual path.'
                  : 'No file references selected yet.'}
              </p>
            ) : (
              visibleFileReferences.map((reference) => {
                const selected = selectedKeys.has(reference.key)
                return (
                  <ComposerOptionButton
                    key={reference.key}
                    selected={selected}
                    label={reference.label}
                    detail={reference.detail}
                    icon={selected ? <Check className="size-4" /> : <FileText className="size-4" />}
                    onClick={() =>
                      selected ? removeContextReference(reference.key) : addFileReference(reference)
                    }
                  />
                )
              })
            )}
          </div>
        )}
      </div>
    </section>
  )
}

function ReferenceViewButton({
  active,
  children,
  onClick
}: {
  active: boolean
  children: React.ReactNode
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={cn(
        'h-7 rounded px-2.5 text-xs font-medium transition-colors',
        active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
      )}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

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
                            {inputBadge ? (
                              <Badge variant={inputBadge.variant} className="shrink-0">
                                {inputBadge.label}
                              </Badge>
                            ) : null}
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">{run.agentName}</p>
                          <RunCardActivity run={run} observedRun={observedRun} />
                          <div className="mt-2 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                            {run.parentRunId ? (
                              <CornerDownRight
                                className="size-3 shrink-0 text-muted-foreground/80"
                                aria-label="Follow-up item"
                              />
                            ) : null}
                            <span className="truncate">{run.requestTitle}</span>
                          </div>
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
    const activity = getRunCardActivitySignal(observedRun)

    return (
      <div className={cn('mt-2 rounded-md border px-2.5 py-2', activity.surfaceClassName)}>
        <div className="flex min-w-0 items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                'flex size-5 shrink-0 items-center justify-center rounded-full',
                activity.iconClassName
              )}
            >
              <Loader2 className={cn('size-3', activity.spinning && 'animate-spin')} />
            </span>
            <p className="min-w-0 truncate text-xs font-medium leading-5 text-foreground">
              {activity.title}
            </p>
          </div>
          <span
            className={cn(
              'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium leading-4',
              activity.healthClassName
            )}
          >
            {activity.healthLabel}
          </span>
        </div>
      </div>
    )
  }

  return (
    <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
      {run.error || run.resultSummary || run.expectedOutput || run.instruction}
    </p>
  )
}

function getRunCardActivitySignal(observedRun: ObservedRunSnapshot): {
  title: string
  healthLabel: string
  surfaceClassName: string
  iconClassName: string
  healthClassName: string
  spinning: boolean
} {
  return {
    title: runCardPhaseTitles[observedRun.currentPhase],
    ...getRunCardHealthSignal(observedRun),
    iconClassName: getRunCardIconClass(observedRun),
    spinning:
      observedRun.livenessHealth !== 'exited' && observedRun.currentPhase !== 'waiting_for_user'
  }
}

const runCardPhaseTitles: Record<ObservedRunSnapshot['currentPhase'], string> = {
  queued: 'Waiting to start',
  starting: 'Starting up',
  running: 'Working now',
  reading: 'Reading context',
  editing: 'Editing workspace',
  waiting_for_user: 'Waiting for you',
  blocked: 'Blocked',
  completed: 'Finished',
  failed: 'Failed',
  cancelled: 'Cancelled'
}

const runningHealthClasses = {
  surfaceClassName: 'border-status-running/20 bg-card',
  healthClassName: 'border-status-running/20 bg-status-running/10 text-status-running'
}

const quietHealthClasses = {
  surfaceClassName: 'border-status-blocked/25 bg-status-blocked/10',
  healthClassName: 'border-status-blocked/25 bg-status-blocked/10 text-status-blocked'
}

const attentionHealthClasses = {
  surfaceClassName: 'border-status-attention/30 bg-status-attention/10',
  healthClassName: 'border-status-attention/25 bg-status-attention/10 text-status-attention'
}

function getRunCardHealthSignal(observedRun: ObservedRunSnapshot): {
  healthLabel: string
  surfaceClassName: string
  healthClassName: string
} {
  if (observedRun.livenessHealth === 'healthy') {
    return {
      healthLabel: 'Active',
      ...runningHealthClasses
    }
  }

  if (observedRun.livenessHealth === 'quiet') {
    return {
      healthLabel: observedRun.idleMs
        ? `Quiet ${formatElapsedSeconds(observedRun.idleMs)}`
        : 'Quiet',
      ...quietHealthClasses
    }
  }

  if (observedRun.livenessHealth === 'stalled') {
    return {
      healthLabel: 'Attention',
      ...attentionHealthClasses
    }
  }

  if (observedRun.livenessHealth === 'exited') {
    return {
      healthLabel: 'Stopped',
      ...runningHealthClasses
    }
  }

  return {
    healthLabel: 'Checking',
    ...runningHealthClasses
  }
}

function getRunCardIconClass(observedRun: ObservedRunSnapshot): string {
  if (
    observedRun.livenessHealth === 'stalled' ||
    observedRun.currentPhase === 'waiting_for_user' ||
    observedRun.currentPhase === 'blocked'
  ) {
    return 'bg-status-attention/15 text-status-attention'
  }

  if (observedRun.livenessHealth === 'quiet') {
    return 'bg-status-blocked/15 text-status-blocked'
  }

  if (observedRun.currentPhase === 'reading') {
    return 'bg-status-reading/15 text-status-reading'
  }

  if (observedRun.currentPhase === 'editing') {
    return 'bg-status-editing/15 text-status-editing'
  }

  return 'bg-status-running/15 text-status-running'
}

function formatElapsedSeconds(value: number): string {
  const totalSeconds = Math.max(0, Math.floor(value / 1000))
  return `${totalSeconds}s`
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
  const isContinuation = Boolean(target.destinationRequestId)
  const targetRequestTitle = target.destinationRequestTitle ?? ''
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
                {target.contextLabels.length > 0 ? (
                  <Badge variant="outline">{target.contextLabels.length} Context refs</Badge>
                ) : null}
                {parallelStageCount > 0 ? (
                  <Badge variant="outline">{parallelStageCount} Parallel stages</Badge>
                ) : null}
              </div>
            ) : null}
          </div>
        </DialogHeader>
        {plan ? (
          <div className="grid min-h-0 grid-cols-1 overflow-y-auto ordinus-scrollbar lg:grid-cols-[minmax(0,1fr)_460px] lg:overflow-hidden xl:grid-cols-[minmax(0,1fr)_480px]">
            <div className="flex min-w-0 flex-col gap-4 overflow-x-hidden p-5 ordinus-scrollbar sm:p-6 lg:min-h-0 lg:overflow-y-auto">
              <section className="grid gap-3" aria-label="Work request">
                <label className={draftFieldClassName}>
                  Request name
                  <input
                    className={draftInputClassName}
                    value={plan.title}
                    onChange={(event) => onUpdatePlan({ ...plan, title: event.target.value })}
                  />
                </label>
                <label className={draftFieldClassName}>
                  Planned scope
                  <textarea
                    className={cn(draftTextareaClassName, 'min-h-24')}
                    value={plan.summary}
                    onChange={(event) => onUpdatePlan({ ...plan, summary: event.target.value })}
                  />
                </label>
              </section>

              <DraftStageTimeline
                levels={levels}
                stageById={stageById}
                agents={agents}
                selectedItemId={selectedItemId}
                onSelectItem={onSelectItem}
              />

              <div className="rounded-lg border bg-background p-4">
                <h3 className="text-sm font-semibold">
                  {isContinuation ? 'Continuation request' : 'Your original request'}
                </h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                  {request}
                </p>
                {target.contextLabels.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {target.contextLabels.map((label) => (
                      <Badge key={label} variant="outline">
                        {label}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="min-w-0 overflow-x-hidden border-t bg-card p-4 ordinus-scrollbar lg:min-h-0 lg:overflow-y-auto lg:border-l lg:border-t-0">
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
        'group min-w-0 rounded-md border bg-card px-3 py-2.5 text-left transition-colors',
        selected ? 'border-primary bg-primary-soft/10' : 'hover:border-primary/40'
      )}
      onClick={onSelect}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-5">{item.title}</p>
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
    <div className="grid min-w-0 gap-4">
      <div>
        <p className="text-xs font-medium text-muted-foreground">
          Stage {stageById.get(item.tempId) ?? 1}
        </p>
        <h3 className="mt-1 text-sm font-semibold">Work item</h3>
      </div>
      <label className={draftFieldClassName}>
        Item name
        <input
          className={draftInputClassName}
          value={item.title}
          onChange={(event) => onChange({ title: event.target.value })}
        />
      </label>
      <label className={draftFieldClassName}>
        Assigned agent
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
      <label className={draftFieldClassName}>
        Instruction
        <textarea
          className={cn(draftTextareaClassName, 'min-h-28')}
          value={item.instruction}
          onChange={(event) => onChange({ instruction: event.target.value })}
        />
      </label>
      <label className={draftFieldClassName}>
        Expected output
        <textarea
          className={cn(draftTextareaClassName, 'min-h-20')}
          value={item.expectedOutput}
          onChange={(event) => onChange({ expectedOutput: event.target.value })}
        />
      </label>
      <DraftPriorityControl
        value={item.priority}
        onChange={(priority) => onChange({ priority })}
      />
      <DraftDependencyChecklist
        item={item}
        items={items}
        stageById={stageById}
        onChange={onChange}
      />
      <DraftDependencyMap item={item} items={items} stageById={stageById} />
    </div>
  )
}

function DraftPriorityControl({
  value,
  onChange
}: {
  value: number
  onChange: (value: number) => void
}): React.JSX.Element {
  const selectedValue = value < 0 ? -1 : value > 0 ? 1 : 0

  return (
    <div className="grid min-w-0 gap-1">
      <p className="text-xs font-medium text-muted-foreground">Priority</p>
      <div className="grid min-w-0 grid-cols-3 overflow-hidden rounded-md border bg-background">
        {draftPriorityOptions.map((option) => {
          const selected = option.value === selectedValue

          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              className={cn(
                'h-10 min-w-0 truncate border-r px-3 text-sm font-medium transition-colors last:border-r-0',
                selected
                  ? 'bg-card text-foreground shadow-inner'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </button>
          )
        })}
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        Used to order Work Items that are ready at the same time.
      </p>
    </div>
  )
}

function DraftDependencyChecklist({
  item,
  items,
  stageById,
  onChange
}: {
  item: WorkboardDraftItem
  items: WorkboardDraftItem[]
  stageById: Map<string, number>
  onChange: (patch: Partial<WorkboardDraftItem>) => void
}): React.JSX.Element {
  const dependencyCandidates = items.filter((candidate) => candidate.tempId !== item.tempId)

  return (
    <div className="grid gap-2">
      <p className="text-xs font-medium text-muted-foreground">Waits for</p>
      {dependencyCandidates.length > 0 ? (
        dependencyCandidates.map((candidate) => {
          const checked = item.dependsOnTempIds.includes(candidate.tempId)
          const createsCycle = !checked && draftItemDependsOn(items, candidate.tempId, item.tempId)

          return (
            <label
              key={candidate.tempId}
              className={cn(
                'flex min-w-0 items-start gap-2 rounded-md border bg-background px-2 py-2 text-sm',
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
        })
      ) : (
        <p className="min-w-0 rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground">
          No other Work Items in this request.
        </p>
      )}
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
    <section className="min-w-0 overflow-hidden rounded-lg border bg-background p-3">
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
        <div className="min-w-0 rounded-md border border-primary/30 bg-primary-soft/40 px-3 py-2">
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
    <div className="min-w-0 rounded-md border bg-card p-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-2 grid gap-1.5">
        {items.length > 0 ? (
          items.map((item) => (
            <div key={item.tempId} className="min-w-0 rounded-sm bg-accent/60 px-2 py-1.5">
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
  canGoBack,
  onBack,
  onClose,
  onCancel,
  onContinue,
  onSelectRun,
  onAnswered,
  onError
}: {
  run: WorkboardRun | null
  dependencies: WorkboardData['dependencies']
  runs: WorkboardRun[]
  observedRun: ObservedRunSnapshot | null
  inputRequest?: WorkRunInputRequest
  busy: string
  canGoBack: boolean
  onBack: () => void
  onClose: () => void
  onCancel: (runId: string) => void
  onContinue: (run: WorkboardRun) => void
  onSelectRun: (runId: string) => void
  onAnswered: (data: WorkboardData) => void
  onError: (message: string) => void
}): React.JSX.Element | null {
  const [answerState, setAnswerState] = useState<{
    key: string
    answers: Record<string, InteractionAnswer>
  }>({ key: '', answers: {} })
  const answerKey = `${run?.id ?? ''}:${inputRequest?.id ?? ''}`
  const answers = answerState.key === answerKey ? answerState.answers : {}

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
          observedRun={observedRun}
          canGoBack={canGoBack}
          onBack={onBack}
          onClose={onClose}
        />

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-5 ordinus-scrollbar">
          <RunDetailReport
            run={run}
            waitsFor={waitsFor}
            observedRun={observedRun}
            inputRequest={inputRequest}
            answers={answers}
            onAnswerChange={updateAnswer}
            onSubmitAnswers={() => void submitAnswers()}
            onRevealPath={(path) => void revealPath(path)}
            onSelectRun={onSelectRun}
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
  observedRun,
  canGoBack,
  onBack,
  onClose
}: {
  run: WorkboardRun
  observedRun: ObservedRunSnapshot | null
  canGoBack: boolean
  onBack: () => void
  onClose: () => void
}): React.JSX.Element {
  const durationLabel = getHeaderDurationLabel(run, observedRun)

  return (
    <header className="border-b bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={statusBadgeVariant(run.status)}>{formatRunStatus(run.status)}</Badge>
            {run.parentRunId ? <Badge variant="outline">Follow-up</Badge> : null}
            {durationLabel ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <Clock3 className="size-3.5" />
                {durationLabel}
              </span>
            ) : null}
          </div>
          <div className="mt-3 flex min-w-0 items-start gap-2">
            {canGoBack ? (
              <Button
                variant="ghost"
                size="icon"
                className="mt-0.5 size-7 shrink-0 text-muted-foreground hover:text-foreground"
                onClick={onBack}
              >
                <ChevronLeft />
                <span className="sr-only">Back to previous Work Item</span>
              </Button>
            ) : null}
            <h3 className="min-w-0 break-words text-2xl font-semibold leading-8 tracking-normal [overflow-wrap:anywhere]">
              {run.title}
            </h3>
          </div>
          <div className="mt-3 flex min-w-0 text-sm">
            <Link
              to={appRoutePaths.agents}
              className="inline-flex min-w-0 items-center gap-1.5 font-medium text-foreground underline-offset-2 hover:text-primary hover:underline"
            >
              <Bot className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{run.agentName}</span>
            </Link>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="shrink-0" onClick={onClose}>
          <XCircle />
          <span className="sr-only">Close</span>
        </Button>
      </div>
    </header>
  )
}

function RunDetailReport({
  run,
  waitsFor,
  observedRun,
  inputRequest,
  answers,
  onAnswerChange,
  onSubmitAnswers,
  onRevealPath,
  onSelectRun
}: {
  run: WorkboardRun
  waitsFor: WorkboardRun[]
  observedRun: ObservedRunSnapshot | null
  inputRequest?: WorkRunInputRequest
  answers: Record<string, InteractionAnswer>
  onAnswerChange: (answer: InteractionAnswer) => void
  onSubmitAnswers: () => void
  onRevealPath: (path: string) => void
  onSelectRun: (runId: string) => void
}): React.JSX.Element {
  return (
    <div className="grid min-w-0 gap-4">
      <RunOutputSection
        run={run}
        inputRequest={inputRequest}
        answers={answers}
        onAnswerChange={onAnswerChange}
        onSubmitAnswers={onSubmitAnswers}
        onRevealPath={onRevealPath}
        linkedItems={waitsFor}
        onSelectRun={onSelectRun}
      />
      <RunContextSection
        key={`context-${run.id}`}
        run={run}
      />
      <RunActivitySection key={`activity-${run.id}`} run={run} observedRun={observedRun} />
      <TechnicalDetailsSection key={`technical-${run.id}`} run={run} observedRun={observedRun} />
    </div>
  )
}

function RunContextSection({
  run
}: {
  run: WorkboardRun
}): React.JSX.Element {
  return (
    <CollapsibleReportSection title="Context" defaultOpen={run.status === 'blocked'}>
      <div className="grid gap-3">
        <CopyableTextBlock label="Asked to" value={run.instruction} />
        <CopyableTextBlock label="Expected" value={run.expectedOutput || 'Not specified'} />
      </div>
    </CollapsibleReportSection>
  )
}

function RunOutputSection({
  run,
  inputRequest,
  answers,
  onAnswerChange,
  onSubmitAnswers,
  onRevealPath,
  linkedItems,
  onSelectRun
}: {
  run: WorkboardRun
  inputRequest?: WorkRunInputRequest
  answers: Record<string, InteractionAnswer>
  onAnswerChange: (answer: InteractionAnswer) => void
  onSubmitAnswers: () => void
  onRevealPath: (path: string) => void
  linkedItems: WorkboardRun[]
  onSelectRun: (runId: string) => void
}): React.JSX.Element {
  const files = getFileReferences(run.artifactRefs, run.changedFiles)

  return (
    <section className="min-w-0 overflow-hidden pb-1">
      <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">Output</h4>
        {run.resultSummary ? <CopyButton value={run.resultSummary} label="Copy output" /> : null}
      </div>
      {inputRequest?.status === 'queued_for_resume' ? <QueuedResumePanel /> : null}
      {inputRequest?.status === 'pending' ? (
        <div className="mb-3">
          <WorkInputRequestPanel
            inputRequest={inputRequest}
            answers={answers}
            onAnswerChange={onAnswerChange}
            onSubmit={onSubmitAnswers}
          />
        </div>
      ) : null}
      {run.resultSummary ? (
        <MarkdownContent content={run.resultSummary} />
      ) : (
        <EmptyDetailState>No output yet.</EmptyDetailState>
      )}
      {run.error ? (
        <div className="mt-3">
          <CopyableTextBlock label="Error" value={run.error} tone="error" />
        </div>
      ) : null}
      {files.length > 0 ? (
        <div className="mt-5 border-t pt-4">
          <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">Produced files</p>
          <FileReferenceList files={files} onRevealPath={onRevealPath} />
        </div>
      ) : null}
      {linkedItems.length > 0 ? (
        <div className="mt-5 border-t pt-4">
          <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">Depends on</p>
          <DependencyWorkItemList items={linkedItems} onSelectRun={onSelectRun} />
        </div>
      ) : null}
    </section>
  )
}

function DependencyWorkItemList({
  items,
  onSelectRun
}: {
  items: WorkboardRun[]
  onSelectRun: (runId: string) => void
}): React.JSX.Element {
  return (
    <div className="grid min-w-0 gap-2">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className="flex min-w-0 items-center justify-between gap-3 rounded-md border bg-card px-2 py-2 text-left transition-colors hover:bg-accent"
          onClick={() => onSelectRun(item.id)}
        >
          <span className="min-w-0">
            <span className="block break-words text-sm font-medium [overflow-wrap:anywhere]">
              {item.title}
            </span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {item.agentName}
            </span>
          </span>
          <Badge variant={statusBadgeVariant(item.status)}>{formatRunStatus(item.status)}</Badge>
        </button>
      ))}
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

function RunActivitySection({
  run,
  observedRun
}: {
  run: WorkboardRun
  observedRun: ObservedRunSnapshot | null
}): React.JSX.Element | null {
  const [events, setEvents] = useState<ObservedRunEvent[]>([])
  const [error, setError] = useState('')
  const observedRunId = observedRun?.id

  useEffect(() => {
    let mounted = true
    if (!observedRunId) {
      return
    }
    const activeObservedRunId = observedRunId

    async function loadEvents(): Promise<void> {
      try {
        const nextEvents = await window.ordinus.observability.listEvents({
          observedRunId: activeObservedRunId
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
  }, [observedRunId, observedRun?.updatedAt])

  if (!observedRun) return null

  return (
    <CollapsibleReportSection title="Activity" defaultOpen={run.status === 'running'}>
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
      {error ? <CopyableTextBlock label="Activity error" value={error} tone="error" /> : null}
      {events.length > 0 ? (
        <div className="grid gap-2">
          {events.slice(0, 5).map((event) => (
            <div key={event.id} className="flex min-w-0 gap-3 rounded-lg border bg-card p-3">
              <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary/70" />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <p className="min-w-0 break-words text-sm font-medium [overflow-wrap:anywhere]">
                    {event.summary}
                  </p>
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
    </CollapsibleReportSection>
  )
}

function TechnicalDetailsSection({
  run,
  observedRun
}: {
  run: WorkboardRun
  observedRun: ObservedRunSnapshot | null
}): React.JSX.Element {
  return (
    <CollapsibleReportSection title="Technical details">
      <CopyableTextBlock
        label="Agent"
        value={`${run.agentName}${run.agentRole ? ` - ${run.agentRole}` : ''}`}
      />
      <CopyableTextBlock label="Provider" value={`${run.providerId} / ${run.model}`} />
      <CopyableTextBlock label="Sandbox" value={run.sandbox} />
      <CopyableTextBlock label="Session" value={run.providerSessionRef || 'Not started'} />
      <DetailGrid
        items={[
          { label: 'Created', value: formatOptionalDate(run.createdAt) },
          { label: 'Started', value: formatOptionalDate(run.startedAt) },
          { label: 'Completed', value: formatOptionalDate(run.completedAt) }
        ]}
      />
      <RunDiagnosticsPanel observedRun={observedRun} />
    </CollapsibleReportSection>
  )
}

function CollapsibleReportSection({
  title,
  defaultOpen = false,
  children
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section className="min-w-0 overflow-hidden border-t">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 py-3 text-left"
        onClick={() => setOpen((value) => !value)}
      >
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold">{title}</h4>
          </div>
        </div>
        <ChevronDown
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform',
            open ? 'rotate-180' : ''
          )}
        />
      </button>
      {open ? <div className="grid gap-3 pb-4 pt-1">{children}</div> : null}
    </section>
  )
}

function CopyableTextBlock({
  label,
  value,
  tone = 'normal'
}: {
  label: string
  value: string
  tone?: 'normal' | 'error'
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'min-w-0 overflow-hidden rounded-lg border bg-background p-3',
        tone === 'error' ? 'border-status-failed/30 bg-status-failed/10' : ''
      )}
    >
      <BlockHeader label={label} copyValue={value} />
      <div className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]">
        {value}
      </div>
    </div>
  )
}

function BlockHeader({
  label,
  copyValue
}: {
  label: string
  copyValue: string
}): React.JSX.Element {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2">
      <p className="min-w-0 break-words text-xs font-medium uppercase text-muted-foreground [overflow-wrap:anywhere]">
        {label}
      </p>
      <CopyButton value={copyValue} label={`Copy ${label}`} />
    </div>
  )
}

function CopyButton({ value, label }: { value: string; label: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false)

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-7 text-muted-foreground hover:text-foreground"
      onClick={() => void copy()}
    >
      {copied ? <Check /> : <Copy />}
      <span className="sr-only">{label}</span>
    </Button>
  )
}

function DetailGrid({
  items
}: {
  items: Array<{ label: string; value: string }>
}): React.JSX.Element {
  return (
    <div className="grid min-w-0 gap-2 sm:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="min-w-0 overflow-hidden rounded-lg border bg-background p-3">
          <p className="text-xs font-medium uppercase text-muted-foreground">{item.label}</p>
          <p className="mt-1 break-words text-sm [overflow-wrap:anywhere]">{item.value}</p>
        </div>
      ))}
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
  const observedRunId = observedRun?.id

  useEffect(() => {
    if (!open || !observedRunId) {
      return
    }

    let mounted = true
    const activeObservedRunId = observedRunId

    async function loadDiagnostics(): Promise<void> {
      try {
        const nextDiagnostics = await window.ordinus.observability.getDiagnostics({
          observedRunId: activeObservedRunId,
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
  }, [open, observedRunId, diagnostics?.stdout.nextOffset, diagnostics?.stderr.nextOffset])

  if (!observedRun) {
    return (
      <EmptyDetailState>Diagnostics are available after this Work Item starts.</EmptyDetailState>
    )
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
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOpen((value) => !value)}
        >
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

function isWorkItemContextInRequest(
  reference: ComposerContextReference,
  requestId: string,
  data: WorkboardData
): boolean {
  const input = reference.input
  if (input.kind !== 'work_item') return true
  if (!requestId) return false

  return data.runs.some((run) => run.id === input.runId && run.requestId === requestId)
}

function matchesTargetSearch(search: string, ...values: string[]): boolean {
  const normalizedSearch = search.trim().toLocaleLowerCase()
  if (!normalizedSearch) return true

  return values.some((value) => value.toLocaleLowerCase().includes(normalizedSearch))
}

function getRunCountByRequestId(runs: WorkboardRun[]): Map<string, number> {
  const counts = new Map<string, number>()

  runs.forEach((run) => {
    counts.set(run.requestId, (counts.get(run.requestId) ?? 0) + 1)
  })

  return counts
}

function getReferenceScopedRuns(composer: WorkComposerState, data: WorkboardData): WorkboardRun[] {
  const selectedRunIds = new Set(
    composer.contextReferences.flatMap((reference) =>
      reference.input.kind === 'work_item' ? [reference.input.runId] : []
    )
  )

  if (selectedRunIds.size > 0) {
    return data.runs.filter((run) => selectedRunIds.has(run.id))
  }

  if (composer.destinationRequestId) {
    return data.runs.filter((run) => run.requestId === composer.destinationRequestId)
  }

  return []
}

function getVisibleFileReferences(
  view: ReferenceView,
  suggestedFileReferences: ComposerContextReference[],
  fileReferences: ComposerContextReference[],
  allFileReferences: ComposerContextReference[]
): ComposerContextReference[] {
  if (view === 'suggested') return suggestedFileReferences
  if (view === 'selected') return fileReferences
  if (view === 'all') return allFileReferences
  return []
}

function buildComposerTarget(composer: WorkComposerState, data: WorkboardData): WorkComposerTarget {
  const destinationRequest = composer.destinationRequestId
    ? data.requests.find((request) => request.id === composer.destinationRequestId)
    : null

  return {
    destinationRequestId: destinationRequest?.id,
    destinationRequestTitle: destinationRequest?.title,
    contextReferences: composer.contextReferences.map((reference) => reference.input),
    contextLabels: composer.contextReferences.map((reference) => reference.label),
    requestedAgentIds: composer.requestedAgentIds
  }
}

function createWorkItemContextReference(run: WorkboardRun): ComposerContextReference {
  const input = { kind: 'work_item', runId: run.id } as const
  return {
    key: getContextReferenceKey(input),
    input,
    label: run.title,
    detail: `${run.requestTitle} - ${formatRunStatus(run.status)}`
  }
}

function createWorkspacePathContextReference(path: string): ComposerContextReference {
  const input = { kind: 'workspace_path', path } as const
  return {
    key: getContextReferenceKey(input),
    input,
    label: path,
    detail: 'Workspace path'
  }
}

function getRunFileContextReferences(runs: WorkboardRun[]): ComposerContextReference[] {
  const references = new Map<string, ComposerContextReference>()

  runs.forEach((run) => {
    getFileReferences(run.artifactRefs, run.changedFiles).forEach((file) => {
      const reference = createWorkspacePathContextReference(file.path)
      if (!references.has(reference.key)) {
        references.set(reference.key, {
          ...reference,
          detail: `${file.artifact ? 'Artifact' : 'Changed file'} - ${run.title}`
        })
      }
    })
  })

  return Array.from(references.values()).slice(0, 24)
}

function getContextReferenceKey(reference: WorkboardContextReferenceInput): string {
  if (reference.kind === 'work_item') return `work_item:${reference.runId}`
  if (reference.kind === 'work_request') return `work_request:${reference.requestId}`
  return `workspace_path:${reference.path}`
}

type MentionPickerState = {
  start: number
  end: number
  query: string
}

type AgentMentionOption = {
  agentId: string
  label: string
  detail: string
}

function AgentMentionPicker({
  activeIndex,
  options,
  onActiveIndexChange,
  onSelect
}: {
  activeIndex: number
  options: AgentMentionOption[]
  onActiveIndexChange: (index: number) => void
  onSelect: (option: AgentMentionOption) => void
}): React.JSX.Element {
  return (
    <div className="absolute left-0 top-full z-20 mt-2 w-full max-w-md overflow-hidden rounded-lg border bg-card shadow-lg">
      <div className="max-h-56 overflow-y-auto p-1">
        {options.map((option, index) => (
          <button
            key={option.agentId}
            type="button"
            className={cn(
              'grid w-full min-w-0 gap-1 rounded-md px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none',
              index === activeIndex ? 'bg-primary-soft' : 'hover:bg-accent'
            )}
            onMouseEnter={() => onActiveIndexChange(index)}
            onMouseDown={(event) => {
              event.preventDefault()
              onSelect(option)
            }}
          >
            <span className="truncate font-medium">@{option.label}</span>
            <span className="line-clamp-1 text-xs text-muted-foreground">{option.detail}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function getAgentMentionOptions(agents: Agent[], query: string): AgentMentionOption[] {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const options = agents.map((agent) => ({
    agentId: agent.id,
    label: agent.name,
    detail: agent.role
  }))

  if (!normalizedQuery) {
    return options
  }

  return options.filter((option) => option.label.toLocaleLowerCase().includes(normalizedQuery))
}

function getActiveMentionPicker(value: string, caret: number): MentionPickerState | null {
  const mentionStart = value.lastIndexOf('@', caret - 1)

  if (mentionStart < 0 || !isMentionStart(value, mentionStart)) {
    return null
  }

  const query = value.slice(mentionStart + 1, caret)

  if (/\s/.test(query) || query.length > 80) {
    return null
  }

  return {
    start: mentionStart,
    end: caret,
    query
  }
}

function isMentionStart(value: string, index: number): boolean {
  return index === 0 || /\s/.test(value[index - 1])
}

function getTextareaSelectionRange(
  textarea: HTMLTextAreaElement | null,
  fallbackPosition: number
): { start: number; end: number } {
  const start = textarea?.selectionStart ?? fallbackPosition

  return {
    start,
    end: textarea?.selectionEnd ?? start
  }
}

function insertMention(
  value: string,
  agentName: string,
  selectionStart: number,
  selectionEnd: number
): { value: string; start: number; end: number; caret: number } {
  const mention = `@${agentName}`
  const beforeSelection = value.slice(0, selectionStart)
  const afterSelection = value.slice(selectionEnd)
  const prefix = beforeSelection.length > 0 && !beforeSelection.endsWith(' ') ? ' ' : ''
  const suffix = afterSelection.startsWith(' ') ? '' : ' '
  const insertedMention = `${prefix}${mention}${suffix}`
  const start = beforeSelection.length + prefix.length
  const end = start + mention.length

  return {
    value: `${beforeSelection}${insertedMention}${afterSelection}`,
    start,
    end,
    caret: end + suffix.length
  }
}

function generateDraftPlan(
  target: WorkComposerTarget,
  request: string
): Promise<WorkboardDraftPlan> {
  return window.ordinus.workboard.generateRequestPlan({
    request,
    destinationRequestId: target.destinationRequestId,
    contextReferences: target.contextReferences,
    requestedAgentIds: target.requestedAgentIds
  })
}

function startPlan(
  target: WorkComposerTarget,
  originalRequest: string,
  plan: WorkboardDraftPlan
): Promise<WorkboardData> {
  return window.ordinus.workboard.startRequestPlan({
    originalRequest,
    destinationRequestId: target.destinationRequestId,
    contextReferences: target.contextReferences,
    requestedAgentIds: target.requestedAgentIds,
    plan
  })
}

function findStartedRequest(
  data: WorkboardData,
  target: WorkComposerTarget,
  originalRequest: string,
  plan: WorkboardDraftPlan
): WorkboardData['requests'][number] | undefined {
  if (target.destinationRequestId) {
    return data.requests.find((item) => item.id === target.destinationRequestId)
  }

  return data.requests.find(
    (item) => item.originalRequest === originalRequest && item.title === plan.title
  )
}

function getLargePlanReviewMessage(target: WorkComposerTarget): string {
  return target.destinationRequestId
    ? 'Review this continuation before starting because it has many Work Items.'
    : 'Review this Work Request before starting because it has many Work Items.'
}

function getStartErrorMessage(error: unknown, target: WorkComposerTarget): string {
  if (error instanceof Error) {
    return error.message
  }

  return target.destinationRequestId
    ? 'Continuation work could not start.'
    : 'Work Request could not start.'
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

function formatOptionalDate(value: string | null): string {
  if (!value) {
    return 'Not available'
  }

  return new Date(value).toLocaleString()
}

function getHeaderDurationLabel(
  run: WorkboardRun,
  observedRun: ObservedRunSnapshot | null
): string {
  const elapsedMs = getRunElapsedMs(run, observedRun)
  if (elapsedMs === null || !shouldShowHeaderDuration(run.status)) {
    return ''
  }

  return formatElapsedMs(elapsedMs)
}

function shouldShowHeaderDuration(status: WorkboardRun['status']): boolean {
  return (
    status === 'completed' ||
    status === 'failed' ||
    status === 'cancelled' ||
    status === 'running' ||
    status === 'waiting_for_user'
  )
}

function getRunElapsedMs(
  run: WorkboardRun,
  observedRun: ObservedRunSnapshot | null
): number | null {
  if (run.status === 'running' && observedRun) {
    return observedRun.elapsedMs
  }

  const startedAt = run.startedAt ? Date.parse(run.startedAt) : Number.NaN
  if (Number.isNaN(startedAt)) {
    return null
  }

  const completedAt = run.completedAt ? Date.parse(run.completedAt) : Number.NaN
  if (!Number.isNaN(completedAt)) {
    return Math.max(0, completedAt - startedAt)
  }

  if (run.status === 'running' || run.status === 'waiting_for_user') {
    return Math.max(0, Date.now() - startedAt)
  }

  return null
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
