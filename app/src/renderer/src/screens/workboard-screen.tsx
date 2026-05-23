import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { Link } from 'react-router-dom'
import {
  Archive,
  ArchiveRestore,
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
  Files,
  FolderOpen,
  GitBranch,
  Loader2,
  MoreHorizontal,
  PanelLeft,
  PanelRight,
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
import { AgentAvatar } from '@renderer/components/agent-avatar'
import { AgentFeedbackPanel } from '@renderer/components/agent-feedback-panel'
import { RequestFileList } from '@renderer/components/file-reference-list'
import { MarkdownDocumentViewer } from '@renderer/components/markdown-document-viewer'
import {
  getFileReferences,
  getRequestFileProvenance
} from '@renderer/components/file-reference-utils'
import type {
  FileReference,
  RequestFileProvenance
} from '@renderer/components/file-reference-utils'
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
import { useLiveness } from '@renderer/app/liveness'
import type { PlanOperationsController } from '@renderer/app/plan-operations'
import {
  emptyWorkboardDraftReviewState,
  type WorkComposerTarget,
  type WorkboardDraftReviewState
} from './workboard-draft-review'

type WorkColumnId = 'waiting' | 'running' | 'done'

const columns: Array<{
  id: WorkColumnId
  label: string
  icon: typeof Play
  statuses: Array<WorkboardRun['status']>
}> = [
  { id: 'waiting', label: 'Waiting', icon: Clock3, statuses: ['queued', 'blocked'] },
  { id: 'running', label: 'Running', icon: Play, statuses: ['running', 'waiting_for_user'] },
  {
    id: 'done',
    label: 'Done',
    icon: CheckCircle2,
    statuses: ['completed', 'failed', 'cancelled']
  }
]

const doneWindowSize = 5

const activeRequestStorageKey = 'ordinus-workboard-active-request'
const sidebarDockedStorageKey = 'ordinus-workboard-sidebar-docked'
const showArchivedStorageKey = 'ordinus-workboard-show-archived'

function getStoredActiveRequestId(): string {
  try {
    return window.localStorage.getItem(activeRequestStorageKey) ?? ''
  } catch {
    return ''
  }
}

function getStoredSidebarDocked(): boolean {
  try {
    return window.localStorage.getItem(sidebarDockedStorageKey) !== 'false'
  } catch {
    return true
  }
}

function getStoredShowArchived(): boolean {
  try {
    return window.localStorage.getItem(showArchivedStorageKey) === 'true'
  } catch {
    return false
  }
}

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

const draftFieldClassName = 'grid min-w-0 gap-1.5 text-xs font-medium text-foreground'
const draftInputClassName =
  'h-10 min-w-0 rounded-md border border-input bg-card px-3 text-sm font-normal text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background'
const draftTextareaClassName =
  'ordinus-scrollbar min-w-0 resize-none rounded-md border border-input bg-card px-3 py-2 text-sm font-normal leading-6 text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background'

export function WorkboardScreen({
  draftReview,
  onDraftReviewChange,
  planOperations
}: {
  draftReview: WorkboardDraftReviewState
  onDraftReviewChange: Dispatch<SetStateAction<WorkboardDraftReviewState>>
  planOperations: PlanOperationsController
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
  const [activeRequestId, setActiveRequestId] = useState(getStoredActiveRequestId)
  const [sidebarDocked, setSidebarDocked] = useState(getStoredSidebarDocked)
  const [showArchived, setShowArchived] = useState(getStoredShowArchived)
  const [railSearch, setRailSearch] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [staleConfirmOpen, setStaleConfirmOpen] = useState(false)
  const [watchedOpId, setWatchedOpId] = useState<string | null>(null)
  const [filesDrawerOpen, setFilesDrawerOpen] = useState(false)
  const [openFilePath, setOpenFilePath] = useState<string | null>(null)

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
  const railStats = useMemo(() => buildRequestRailStats(data), [data])
  const archivedCount = useMemo(
    () => railStats.filter((request) => request.archived).length,
    [railStats]
  )
  const visibleRailStats = useMemo(
    () => (showArchived ? railStats : railStats.filter((request) => !request.archived)),
    [railStats, showArchived]
  )
  const activeRequest =
    data.requests.find((item) => item.id === activeRequestId) ??
    data.requests.find((item) => item.id === (visibleRailStats[0]?.id ?? '')) ??
    null
  const activeRequestRuns = useMemo(
    () => (activeRequest ? data.runs.filter((run) => run.requestId === activeRequest.id) : []),
    [data.runs, activeRequest]
  )
  const activeRequestFiles = useMemo(
    () =>
      activeRequest ? getRequestFileProvenance(activeRequestRuns, activeRequest.workingRoot) : [],
    [activeRequest, activeRequestRuns]
  )

  useEffect(() => {
    try {
      window.localStorage.setItem(activeRequestStorageKey, activeRequest?.id ?? '')
    } catch {
      /* localStorage unavailable */
    }
  }, [activeRequest?.id])

  useEffect(() => {
    try {
      window.localStorage.setItem(sidebarDockedStorageKey, String(sidebarDocked))
    } catch {
      /* localStorage unavailable */
    }
  }, [sidebarDocked])

  useEffect(() => {
    try {
      window.localStorage.setItem(showArchivedStorageKey, String(showArchived))
    } catch {
      /* localStorage unavailable */
    }
  }, [showArchived])

  const draftPlan = draftReview.plan
  const draftContext = draftReview.context
  const selectedDraftId = draftReview.selectedItemId
  const selectedDraftItem = draftPlan?.items.find((item) => item.tempId === selectedDraftId) ?? null
  const watchedOp = watchedOpId
    ? (planOperations.operations.find((op) => op.id === watchedOpId) ?? null)
    : null
  const planWatching: PlanWatching | null =
    !draftPlan && watchedOp && watchedOp.status !== 'ready'
      ? { status: watchedOp.status, createdAt: watchedOp.createdAt, error: watchedOp.error }
      : null

  useEffect(() => {
    if (!watchedOpId) return
    const op = planOperations.operations.find((candidate) => candidate.id === watchedOpId)
    if (!op || op.status !== 'ready' || !op.plan) return
    // One-shot promotion when the watched background op finishes: copy its
    // plan into the editable review state, then stop watching. Self-
    // terminating (watchedOpId is cleared), so it cannot cascade.
    onDraftReviewChange({
      plan: op.plan,
      context: {
        target: op.target,
        request: op.request,
        runVersion: op.runVersion,
        persistedId: op.persistedId
      },
      selectedItemId: op.plan.items[0]?.tempId ?? ''
    })
    planOperations.dismissPlanOp(op.id)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- external async completion sync, one-shot
    setWatchedOpId(null)
  }, [watchedOpId, planOperations, onDraftReviewChange])

  async function handleSubmitComposer(nextComposer = composer): Promise<void> {
    if (nextComposer.request.trim().length < 12 || enabledAgents.length === 0 || busy) return
    setError('')
    const submittedRequest = nextComposer.request.trim()
    const target = buildComposerTarget(nextComposer, data)

    if (reviewBeforeStart) {
      const opId = planOperations.startPlanOp(
        target,
        submittedRequest,
        computeContinuationVersion(data.runs, target.destinationRequestId)
      )
      setWatchedOpId(opId)
      setComposer(emptyComposerState)
      return
    }

    setBusy('submit')
    try {
      const plan = await generateDraftPlan(target, submittedRequest)
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

  function isDraftStale(): boolean {
    if (!draftContext || !draftContext.target.destinationRequestId) return false
    if (draftContext.runVersion === null) return false
    return (
      draftContext.runVersion !==
      computeContinuationVersion(data.runs, draftContext.target.destinationRequestId)
    )
  }

  async function proceedStartDraft(): Promise<void> {
    if (!draftPlan || !draftContext) return
    setStaleConfirmOpen(false)
    setBusy('start-draft')
    setError('')

    try {
      await startDraftPlan(draftPlan, draftContext.target, draftContext.request)
      planOperations.removePersisted(draftContext.persistedId)
    } catch (startError) {
      setError(getStartErrorMessage(startError, draftContext.target))
    } finally {
      setBusy('')
    }
  }

  async function handleStartDraft(): Promise<void> {
    if (!draftPlan || !draftContext) return
    if (isDraftStale()) {
      setStaleConfirmOpen(true)
      return
    }
    await proceedStartDraft()
  }

  function handleRegenerateDraft(): void {
    if (!draftContext) return
    const opId = planOperations.startPlanOp(
      draftContext.target,
      draftContext.request,
      computeContinuationVersion(data.runs, draftContext.target.destinationRequestId)
    )
    setStaleConfirmOpen(false)
    onDraftReviewChange(emptyWorkboardDraftReviewState)
    setWatchedOpId(opId)
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
      context: {
        target,
        request: originalRequest,
        runVersion: computeContinuationVersion(data.runs, target.destinationRequestId),
        persistedId: null
      },
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
    if (startedRequest?.id) {
      setActiveRequestId(startedRequest.id)
    }
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

  function changeActiveRequest(requestId: string): void {
    setActiveRequestId(requestId)
    setFilesDrawerOpen(false)
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

  async function handleArchiveRequest(requestId: string): Promise<void> {
    setBusy(`archive-${requestId}`)
    setError('')
    try {
      const nextData = await window.ordinus.workboard.archiveRequest({ requestId })
      setData(nextData)
    } catch (archiveError) {
      setError(
        archiveError instanceof Error ? archiveError.message : 'Work Request could not be archived.'
      )
    } finally {
      setBusy('')
    }
  }

  async function handleUnarchiveRequest(requestId: string): Promise<void> {
    setBusy(`unarchive-${requestId}`)
    setError('')
    try {
      const nextData = await window.ordinus.workboard.unarchiveRequest({ requestId })
      setData(nextData)
    } catch (unarchiveError) {
      setError(
        unarchiveError instanceof Error
          ? unarchiveError.message
          : 'Work Request could not be unarchived.'
      )
    } finally {
      setBusy('')
    }
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
    <div className="flex min-h-[calc(100vh-3rem)] flex-col gap-3 py-4 xl:h-[calc(100vh-3rem)] xl:min-h-0 xl:overflow-hidden">
      {enabledAgents.length === 0 ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">
          Create and enable at least one agent before creating Work Requests.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <div
          className={cn(
            'flex min-h-0 overflow-hidden transition-[width,margin] duration-200',
            sidebarDocked ? 'mr-3 w-64' : 'mr-0 w-0'
          )}
        >
          <RequestSidebar
            requests={visibleRailStats}
            activeRequestId={activeRequest?.id ?? ''}
            search={railSearch}
            newDisabled={enabledAgents.length === 0}
            showArchived={showArchived}
            archivedCount={archivedCount}
            onSearchChange={setRailSearch}
            onSelect={changeActiveRequest}
            onNew={handleNewRequest}
            onToggleArchived={() => setShowArchived((value) => !value)}
            onArchive={handleArchiveRequest}
          />
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <RequestHeaderBar
            request={activeRequest}
            sidebarDocked={sidebarDocked}
            fileCount={activeRequestFiles.length}
            onToggleSidebar={() => setSidebarDocked((docked) => !docked)}
            onContinue={handleContinueRequest}
            onOpenFiles={() => setFilesDrawerOpen(true)}
            onArchive={handleArchiveRequest}
            onUnarchive={handleUnarchiveRequest}
          />
          <WorkColumns
            request={activeRequest}
            runs={activeRequestRuns}
            inputRequests={data.inputRequests}
            observedRuns={observedRunByWorkRunId}
            onSelectRun={openRunDetail}
          />
        </div>
      </div>

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
        open={Boolean(draftPlan) || planWatching !== null}
        request={draftContext?.request ?? watchedOp?.request ?? composer.request}
        target={draftContext?.target ?? watchedOp?.target ?? newWorkComposerTarget}
        plan={draftPlan}
        agents={enabledAgents}
        selectedItem={selectedDraftItem}
        selectedItemId={selectedDraftId}
        busy={busy}
        watching={planWatching}
        onSelectItem={setSelectedDraftId}
        onUpdatePlan={setDraftPlan}
        onUpdateItem={updateDraftItem}
        onStart={() => void handleStartDraft()}
        onRegenerate={() => void handleRegenerateDraft()}
        onBackground={() => setWatchedOpId(null)}
        onRetryWatched={() => {
          if (watchedOpId) planOperations.retryPlanOp(watchedOpId)
        }}
        onDiscard={() => {
          planOperations.removePersisted(draftContext?.persistedId ?? null)
          onDraftReviewChange(emptyWorkboardDraftReviewState)
        }}
      />

      <Dialog
        open={staleConfirmOpen}
        onOpenChange={(open) => {
          if (!open) setStaleConfirmOpen(false)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Work request changed</DialogTitle>
            <DialogDescription>
              This plan was prepared against an earlier state of the work request, which has changed
              since (another continuation may have been added). Applying it now could conflict with
              that work.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setStaleConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="outline" onClick={() => handleRegenerateDraft()}>
              Regenerate
            </Button>
            <Button onClick={() => void proceedStartDraft()}>Apply anyway</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
        onOpenFile={setOpenFilePath}
        onAnswered={(nextData) => setData(nextData)}
        onError={setError}
      />

      {filesDrawerOpen && activeRequest ? (
        <RequestFilesDrawer
          request={activeRequest}
          files={activeRequestFiles}
          runs={data.runs}
          onClose={() => setFilesDrawerOpen(false)}
          onSelectRun={(runId) => {
            setFilesDrawerOpen(false)
            openRunDetail(runId)
          }}
          onOpenFile={setOpenFilePath}
          onError={setError}
        />
      ) : null}

      {openFilePath ? (
        <MarkdownDocumentViewer
          key={openFilePath}
          path={openFilePath}
          onClose={() => setOpenFilePath(null)}
        />
      ) : null}
    </div>
  )
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
        setActiveMentionIndex(
          (index) => (index - 1 + mentionOptions.length) % mentionOptions.length
        )
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
      <DialogContent className="grid max-h-[calc(100vh-2rem)] max-w-2xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 p-0">
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
              icon={
                !destinationRequestId ? <Check className="size-4" /> : <Plus className="size-4" />
              }
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

function WorkColumns({
  request,
  runs,
  inputRequests,
  observedRuns,
  onSelectRun
}: {
  request: WorkboardData['requests'][number] | null
  runs: WorkboardRun[]
  inputRequests: WorkRunInputRequest[]
  observedRuns: Map<string, ObservedRunSnapshot>
  onSelectRun: (runId: string) => void
}): React.JSX.Element {
  const [doneExpanded, setDoneExpanded] = useState(false)

  if (!request) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg border bg-card">
        <div className="max-w-sm px-6 text-center">
          <Columns3 className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">No Work Request selected</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Select a Work Request from the list, or use New to start one.
          </p>
        </div>
      </div>
    )
  }

  const runsByColumn = new Map<WorkColumnId, WorkboardRun[]>()
  columns.forEach((column) => {
    runsByColumn.set(
      column.id,
      sortColumnRuns(
        column.id,
        runs.filter((run) => column.statuses.includes(run.status)),
        observedRuns
      )
    )
  })

  return (
    <div className="flex min-h-0 flex-1 gap-3">
      {columns.map((column) => {
        const columnRuns = runsByColumn.get(column.id) ?? []
        const Icon = column.icon
        const isDone = column.id === 'done'
        const visibleRuns =
          isDone && !doneExpanded ? columnRuns.slice(0, doneWindowSize) : columnRuns
        const hiddenCount = columnRuns.length - visibleRuns.length

        return (
          <section
            key={column.id}
            className="flex min-h-0 flex-1 flex-col rounded-lg border bg-card"
          >
            <header className="flex items-center justify-between border-b px-3 py-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Icon className="size-4" />
                {column.label}
              </div>
              <Badge variant="secondary">{columnRuns.length}</Badge>
            </header>
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2 ordinus-scrollbar">
              {columnRuns.length === 0 ? (
                <ColumnEmptyState columnId={column.id} runsByColumn={runsByColumn} />
              ) : (
                <>
                  {visibleRuns.map((run) => (
                    <RunCard
                      key={run.id}
                      run={run}
                      columnId={column.id}
                      inputRequest={getVisibleWorkRunInputRequest(inputRequests, run.id)}
                      observedRun={observedRuns.get(run.id)}
                      onSelect={onSelectRun}
                    />
                  ))}
                  {isDone && hiddenCount > 0 ? (
                    <button
                      type="button"
                      className="rounded-md border border-dashed py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      onClick={() => setDoneExpanded(true)}
                    >
                      Show {hiddenCount} older
                    </button>
                  ) : null}
                  {isDone && doneExpanded && columnRuns.length > doneWindowSize ? (
                    <button
                      type="button"
                      className="rounded-md border border-dashed py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      onClick={() => setDoneExpanded(false)}
                    >
                      Show less
                    </button>
                  ) : null}
                </>
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function RunCard({
  run,
  columnId,
  inputRequest,
  observedRun,
  onSelect
}: {
  run: WorkboardRun
  columnId: WorkColumnId
  inputRequest: WorkRunInputRequest | undefined
  observedRun?: ObservedRunSnapshot
  onSelect: (runId: string) => void
}): React.JSX.Element {
  const inputBadge = getWorkRunInputBadge(inputRequest)
  const outcomeBadge = columnId === 'done' ? getDoneOutcomeBadge(run.status) : null
  const timestamp = getCardTimestampLabel(run, columnId)
  const timestampTitle = getCardTimestampTitle(run, columnId)

  return (
    <button
      type="button"
      className={cn(
        'rounded-md border bg-background p-3 text-left shadow-sm transition-colors animate-in fade-in-0 duration-150 hover:border-primary/40',
        columnId === 'done' ? doneAccentClassName(run.status) : ''
      )}
      onClick={() => onSelect(run.id)}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="line-clamp-2 text-sm font-semibold leading-5">{run.title}</h3>
        {inputBadge ? (
          <Badge variant={inputBadge.variant} className="shrink-0">
            {inputBadge.label}
          </Badge>
        ) : outcomeBadge ? (
          <Badge variant={outcomeBadge.variant} className="shrink-0">
            {outcomeBadge.label}
          </Badge>
        ) : null}
      </div>
      <div className="mt-2 flex min-w-0 items-center gap-1.5">
        <AgentAvatar avatar={run.agentAvatar} size={16} className="shrink-0" />
        <p className="min-w-0 truncate text-xs text-muted-foreground">{run.agentName}</p>
      </div>
      <RunCardActivity run={run} columnId={columnId} observedRun={observedRun} />
      {timestamp ? (
        <div
          className="mt-2 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground"
          title={timestampTitle || undefined}
        >
          {run.parentRunId ? (
            <CornerDownRight
              className="size-3 shrink-0 text-muted-foreground/80"
              aria-label="Follow-up item"
            />
          ) : null}
          <span className="truncate">{timestamp}</span>
        </div>
      ) : null}
    </button>
  )
}

function ColumnEmptyState({
  columnId,
  runsByColumn
}: {
  columnId: WorkColumnId
  runsByColumn: Map<WorkColumnId, WorkboardRun[]>
}): React.JSX.Element {
  return (
    <div className="rounded-md border border-dashed bg-background/60 p-3 text-xs text-muted-foreground">
      {getColumnEmptyMessage(columnId, runsByColumn)}
    </div>
  )
}

function getColumnEmptyMessage(
  columnId: WorkColumnId,
  runsByColumn: Map<WorkColumnId, WorkboardRun[]>
): string {
  if (columnId === 'waiting') {
    return 'Queue is clear — nothing waiting to start.'
  }
  if (columnId === 'done') {
    return 'Nothing completed yet.'
  }

  const waiting = runsByColumn.get('waiting')?.length ?? 0
  const done = runsByColumn.get('done')?.length ?? 0
  if (waiting + done === 0) {
    return 'No work items yet. Use New to add work to this request.'
  }
  if (waiting > 0) {
    return 'Nothing running yet — work is waiting in the queue.'
  }
  return 'All work in this request is complete.'
}

function sortColumnRuns(
  columnId: WorkColumnId,
  runs: WorkboardRun[],
  observedRuns: Map<string, ObservedRunSnapshot>
): WorkboardRun[] {
  const sorted = [...runs]

  if (columnId === 'waiting') {
    sorted.sort((first, second) => Date.parse(first.createdAt) - Date.parse(second.createdAt))
    return sorted
  }

  if (columnId === 'done') {
    sorted.sort(
      (first, second) =>
        Date.parse(second.completedAt ?? second.updatedAt) -
        Date.parse(first.completedAt ?? first.updatedAt)
    )
    return sorted
  }

  sorted.sort(
    (first, second) => runningRank(first, observedRuns) - runningRank(second, observedRuns)
  )
  return sorted
}

function runningRank(run: WorkboardRun, observedRuns: Map<string, ObservedRunSnapshot>): number {
  if (run.status === 'waiting_for_user') return 0
  if (observedRuns.get(run.id)?.livenessHealth === 'stalled') return 1
  return 2
}

function getCardTimestampLabel(run: WorkboardRun, columnId: WorkColumnId): string {
  if (columnId === 'running') {
    const started = formatRelativeTime(run.startedAt)
    return started ? `Started ${started}` : 'Starting'
  }

  if (columnId === 'done') {
    const finished = formatTimelineTime(run.completedAt ?? run.updatedAt)
    return finished ? `Finished ${finished}` : ''
  }

  if (run.status === 'blocked') {
    const since = formatRelativeTime(run.updatedAt)
    return since ? `Blocked ${since}` : 'Blocked'
  }

  const created = formatRelativeTime(run.createdAt)
  return created ? `Created ${created}` : ''
}

function getCardTimestampTitle(run: WorkboardRun, columnId: WorkColumnId): string {
  if (columnId === 'running') return formatFullTimestamp(run.startedAt)
  if (columnId === 'done') return formatFullTimestamp(run.completedAt ?? run.updatedAt)
  if (run.status === 'blocked') return formatFullTimestamp(run.updatedAt)
  return formatFullTimestamp(run.createdAt)
}

function getDoneOutcomeBadge(
  status: WorkboardRun['status']
): { label: string; variant: 'failed' | 'outline' } | null {
  if (status === 'failed') return { label: 'Failed', variant: 'failed' }
  if (status === 'cancelled') return { label: 'Cancelled', variant: 'outline' }
  return null
}

function formatTimelineTime(iso: string | null): string {
  if (!iso) return ''
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return ''

  const now = new Date()
  const then = new Date(ms)
  const diff = now.getTime() - ms
  if (diff < 60_000) return 'just now'

  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return `${minutes}m ago`

  const time = then.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  if (now.toDateString() === then.toDateString()) return time

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (yesterday.toDateString() === then.toDateString()) return `Yesterday ${time}`

  const date = then.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return `${date} ${time}`
}

function formatFullTimestamp(iso: string | null): string {
  if (!iso) return ''
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return ''
  return new Date(ms).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return ''
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return ''

  const diff = Date.now() - ms
  if (diff < 60_000) return 'just now'

  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  return `${Math.floor(hours / 24)}d ago`
}

function doneAccentClassName(status: WorkboardRun['status']): string {
  if (status === 'failed') return 'border-l-2 border-l-status-attention'
  if (status === 'cancelled') return 'border-l-2 border-l-muted-foreground/40'
  return ''
}

type RequestRailStat = {
  id: string
  title: string
  status: WorkboardData['requests'][number]['status']
  archived: boolean
  totalCount: number
  completedCount: number
  attention: 'input' | 'running' | 'none'
  updatedAt: string
}

function isTerminalRequestStatus(status: WorkboardData['requests'][number]['status']): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}

function buildRequestRailStats(data: WorkboardData): RequestRailStat[] {
  return data.requests
    .map((request) => {
      const requestRuns = data.runs.filter((run) => run.requestId === request.id)
      const hasInput = requestRuns.some((run) => run.status === 'waiting_for_user')
      const hasRunning = requestRuns.some((run) => run.status === 'running')

      return {
        id: request.id,
        title: request.title,
        status: request.status,
        archived: Boolean(request.archivedAt),
        totalCount: requestRuns.length,
        completedCount: requestRuns.filter((run) => run.status === 'completed').length,
        attention: hasInput ? 'input' : hasRunning ? 'running' : 'none',
        updatedAt: request.updatedAt
      } satisfies RequestRailStat
    })
    .sort((first, second) => Date.parse(second.updatedAt) - Date.parse(first.updatedAt))
}

function useExitAnimation(open: boolean): {
  mounted: boolean
  handleAnimationEnd: () => void
} {
  const [mounted, setMounted] = useState(open)
  if (open && !mounted) {
    setMounted(true)
  }
  return {
    mounted,
    handleAnimationEnd: () => {
      if (!open) {
        setMounted(false)
      }
    }
  }
}

function RequestSidebar({
  requests,
  activeRequestId,
  search,
  newDisabled,
  showArchived,
  archivedCount,
  onSearchChange,
  onSelect,
  onNew,
  onToggleArchived,
  onArchive
}: {
  requests: RequestRailStat[]
  activeRequestId: string
  search: string
  newDisabled: boolean
  showArchived: boolean
  archivedCount: number
  onSearchChange: (value: string) => void
  onSelect: (requestId: string) => void
  onNew: () => void
  onToggleArchived: () => void
  onArchive: (requestId: string) => void
}): React.JSX.Element {
  const normalized = search.trim().toLowerCase()
  const filtered = normalized
    ? requests.filter((request) => request.title.toLowerCase().includes(normalized))
    : requests

  return (
    <aside className="flex min-h-0 w-64 shrink-0 flex-col gap-2 border-r border-border pr-3">
      <Button type="button" size="sm" className="w-full" onClick={onNew} disabled={newDisabled}>
        <Plus />
        New Work Request
      </Button>
      <label className="flex h-9 items-center gap-2 rounded-md border bg-background px-2 text-muted-foreground">
        <Search className="size-4 shrink-0" />
        <input
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          placeholder="Find Work Request"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </label>
      <RequestList
        requests={filtered}
        activeRequestId={activeRequestId}
        onSelect={onSelect}
        onArchive={onArchive}
      />
      {archivedCount > 0 ? (
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          onClick={onToggleArchived}
        >
          <Archive className="size-3.5 shrink-0" />
          {showArchived ? 'Hide archived' : 'Show archived'} ({archivedCount})
        </button>
      ) : null}
    </aside>
  )
}

function RequestList({
  requests,
  activeRequestId,
  onSelect,
  onArchive
}: {
  requests: RequestRailStat[]
  activeRequestId: string
  onSelect: (requestId: string) => void
  onArchive?: (requestId: string) => void
}): React.JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto ordinus-scrollbar">
      {requests.length === 0 ? (
        <p className="px-2 py-3 text-xs text-muted-foreground">No Work Requests found.</p>
      ) : (
        requests.map((request) => (
          <RequestListRow
            key={request.id}
            request={request}
            active={request.id === activeRequestId}
            onSelect={onSelect}
            onArchive={onArchive}
          />
        ))
      )}
    </div>
  )
}

function RequestListRow({
  request,
  active,
  onSelect,
  onArchive
}: {
  request: RequestRailStat
  active: boolean
  onSelect: (requestId: string) => void
  onArchive?: (requestId: string) => void
}): React.JSX.Element {
  const [exiting, setExiting] = useState(false)
  const canArchive =
    Boolean(onArchive) && !request.archived && isTerminalRequestStatus(request.status)

  return (
    <div
      className={cn(
        'group relative flex flex-col gap-0.5 rounded-md transition-colors',
        active ? 'bg-primary-soft' : 'hover:bg-accent',
        exiting && 'animate-out fade-out-0 slide-out-to-right-2 duration-150'
      )}
      onAnimationEnd={() => {
        if (exiting) onArchive?.(request.id)
      }}
    >
      {active ? (
        <span className="absolute bottom-1 left-0 top-1 w-0.5 rounded-full bg-primary" />
      ) : null}
      <button
        type="button"
        className="flex flex-col gap-0.5 px-2 py-1.5 text-left"
        onClick={() => onSelect(request.id)}
      >
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              'size-1.5 shrink-0 rounded-full',
              request.attention === 'input'
                ? 'bg-status-attention'
                : request.attention === 'running'
                  ? 'bg-status-running'
                  : 'bg-transparent'
            )}
          />
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{request.title}</span>
        </div>
        <span className="pl-3 text-[11px] tabular-nums text-muted-foreground">
          {request.archived ? 'Archived - ' : ''}
          {request.completedCount}/{request.totalCount} done
        </span>
      </button>
      {canArchive ? (
        <div
          className={cn(
            'absolute bottom-0 right-0 top-0 hidden w-16 items-center justify-end rounded-r-md bg-gradient-to-l to-transparent pr-1 group-hover:flex',
            active ? 'from-primary-soft via-primary-soft' : 'from-accent via-accent'
          )}
        >
          <button
            type="button"
            aria-label="Archive Work Request"
            title="Archive Work Request"
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
            onClick={() => setExiting(true)}
          >
            <Archive className="size-3.5" />
          </button>
        </div>
      ) : null}
    </div>
  )
}

function RequestHeaderBar({
  request,
  sidebarDocked,
  fileCount,
  onToggleSidebar,
  onContinue,
  onOpenFiles,
  onArchive,
  onUnarchive
}: {
  request: WorkboardData['requests'][number] | null
  sidebarDocked: boolean
  fileCount: number
  onToggleSidebar: () => void
  onContinue: (requestId: string) => void
  onOpenFiles: () => void
  onArchive: (requestId: string) => void
  onUnarchive: (requestId: string) => void
}): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)
  const menu = useExitAnimation(menuOpen)
  const isArchived = Boolean(request?.archivedAt)
  const canArchive = request ? !isArchived && isTerminalRequestStatus(request.status) : false

  return (
    <section className="flex shrink-0 items-center gap-2 px-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="shrink-0 px-2"
        onClick={onToggleSidebar}
        aria-label={sidebarDocked ? 'Collapse request list' : 'Dock request list'}
      >
        <PanelLeft />
      </Button>
      <h2 className="min-w-0 truncate text-sm font-semibold">
        {request ? request.title : 'Workboard'}
      </h2>
      {request ? (
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onContinue(request.id)}>
            <GitBranch />
            Continue this work
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onOpenFiles}>
            <Files />
            Files ({fileCount})
          </Button>
          {canArchive || isArchived ? (
            <div className="relative">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="px-2"
                aria-label="Work Request actions"
                onClick={() => setMenuOpen((open) => !open)}
              >
                <MoreHorizontal />
              </Button>
              {menu.mounted ? (
                <>
                  <button
                    type="button"
                    aria-hidden
                    tabIndex={-1}
                    className="fixed inset-0 z-30 cursor-default"
                    onClick={() => setMenuOpen(false)}
                  />
                  <div
                    className={cn(
                      'absolute right-0 top-full z-40 mt-1 w-44 rounded-lg border bg-card p-1 shadow-lg',
                      menuOpen
                        ? 'animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 duration-150'
                        : 'animate-out fade-out-0 zoom-out-95 duration-100'
                    )}
                    onAnimationEnd={menu.handleAnimationEnd}
                  >
                    {isArchived ? (
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
                        onClick={() => {
                          setMenuOpen(false)
                          onUnarchive(request.id)
                        }}
                      >
                        <ArchiveRestore className="size-4" />
                        Unarchive
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
                        onClick={() => {
                          setMenuOpen(false)
                          onArchive(request.id)
                        }}
                      >
                        <Archive className="size-4" />
                        Archive
                      </button>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function RunCardActivity({
  run,
  columnId,
  observedRun
}: {
  run: WorkboardRun
  columnId: WorkColumnId
  observedRun?: ObservedRunSnapshot
}): React.JSX.Element | null {
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

  if (columnId === 'done') {
    if (run.status === 'failed' && run.error) {
      return (
        <p className="mt-1 line-clamp-1 text-xs leading-5 text-muted-foreground">{run.error}</p>
      )
    }
    return null
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

type PlanWatching = {
  status: 'generating' | 'failed'
  createdAt: number
  error: string
}

function PlanWaitingBody({ watching }: { watching: PlanWatching }): React.JSX.Element {
  const liveness = useLiveness(watching.createdAt, watching.status === 'generating')

  if (watching.status === 'failed') {
    return (
      <div className="flex min-h-0 flex-col items-center justify-center gap-3 p-10 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-status-attention/15">
          <span className="size-2.5 rounded-full bg-status-attention" />
        </span>
        <p className="text-base font-semibold text-status-attention">Plan generation failed</p>
        <p className="max-w-md text-sm text-muted-foreground">
          {watching.error || 'The plan could not be generated.'}
        </p>
      </div>
    )
  }

  const phase = liveness.phase
  const reassurance = liveness.reassurance ?? 'Setting things up…'
  const elapsedLabel = liveness.elapsedLabel

  return (
    <div className="flex min-h-0 flex-col items-center justify-center gap-5 p-10 text-center">
      <span className="relative flex size-14 items-center justify-center">
        <span className="absolute inline-flex size-14 animate-ping rounded-full bg-primary/20" />
        <span className="relative inline-flex size-3 rounded-full bg-primary" />
      </span>
      <div className="grid gap-1.5">
        <p className="text-lg font-semibold">{phase}</p>
        <p className="text-sm text-muted-foreground">{reassurance}</p>
      </div>
      <p className="text-3xl font-semibold tabular-nums text-muted-foreground">{elapsedLabel}</p>
      <p className="max-w-sm text-xs text-muted-foreground">
        You can keep working — choose “Continue in the background” and we&apos;ll notify you when
        the plan is ready.
      </p>
    </div>
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
  watching,
  onSelectItem,
  onUpdatePlan,
  onUpdateItem,
  onStart,
  onRegenerate,
  onDiscard,
  onBackground,
  onRetryWatched
}: {
  open: boolean
  request: string
  target: WorkComposerTarget
  plan: WorkboardDraftPlan | null
  agents: Agent[]
  selectedItem: WorkboardDraftItem | null
  selectedItemId: string
  busy: string
  watching: PlanWatching | null
  onSelectItem: (tempId: string) => void
  onUpdatePlan: (plan: WorkboardDraftPlan | null) => void
  onUpdateItem: (tempId: string, patch: Partial<WorkboardDraftItem>) => void
  onStart: () => void
  onRegenerate: () => void
  onDiscard: () => void
  onBackground: () => void
  onRetryWatched: () => void
}): React.JSX.Element {
  const levels = useMemo(() => (plan ? buildDraftLevels(plan.items) : []), [plan])
  const stageById = useMemo(() => buildDraftStageMap(levels), [levels])
  const isContinuation = Boolean(target.destinationRequestId)
  const targetRequestTitle = target.destinationRequestTitle ?? ''
  const isWaiting = !plan && watching !== null
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)

  useEffect(() => {
    // Focus is the default posture: every time a (new) plan is shown the
    // detail panel starts closed. Resets only on plan identity change, so
    // toggling within the same plan is preserved.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot reset on plan change
    setPanelOpen(false)
  }, [plan])

  function requestClose(): void {
    if (isWaiting) {
      onBackground()
      return
    }
    setDiscardConfirmOpen(true)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) return
        requestClose()
      }}
    >
      <DialogContent
        hideClose
        onEscapeKeyDown={(event) => {
          if (isWaiting) event.preventDefault()
        }}
        onInteractOutside={(event) => {
          if (isWaiting) event.preventDefault()
        }}
        className={cn(
          'grid max-h-[calc(100vh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 p-0 transition-[max-width] duration-200 ease-out',
          panelOpen ? 'max-w-5xl' : 'max-w-3xl'
        )}
      >
        <DialogHeader className="border-b px-5 py-4 pr-12 sm:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <DialogTitle>
                {isWaiting
                  ? isContinuation
                    ? 'Preparing continuation'
                    : 'Preparing your plan'
                  : isContinuation
                    ? 'Review Continuation'
                    : 'Review Work Request'}
              </DialogTitle>
              <DialogDescription className="mt-1">
                {isWaiting
                  ? 'You can keep working while we draft this in the background.'
                  : isContinuation
                    ? `Add these Work Items to ${targetRequestTitle}.`
                    : 'Review assignments and dependencies before agents start.'}
              </DialogDescription>
            </div>
            {plan ? (
              <div className="flex flex-wrap items-center gap-2 text-left">
                <Button
                  type="button"
                  variant={panelOpen ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 gap-1.5 px-2 text-xs"
                  aria-pressed={panelOpen}
                  onClick={() => setPanelOpen((current) => !current)}
                >
                  <PanelRight className="size-3.5" />
                  {panelOpen ? 'Hide details' : 'Show details'}
                </Button>
              </div>
            ) : null}
          </div>
        </DialogHeader>
        {plan ? (
          <div
            className={cn(
              'grid min-h-0 grid-cols-1 overflow-y-auto ordinus-scrollbar transition-[grid-template-columns] duration-200 ease-out lg:overflow-hidden',
              panelOpen
                ? 'lg:grid-cols-[minmax(0,1fr)_460px] xl:grid-cols-[minmax(0,1fr)_480px]'
                : 'lg:grid-cols-1'
            )}
          >
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
                agents={agents}
                selectedItemId={selectedItemId}
                onSelectItem={onSelectItem}
              />

              <div className="rounded-lg bg-muted/50 p-4">
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

            {panelOpen ? (
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
            ) : null}
          </div>
        ) : watching ? (
          <PlanWaitingBody watching={watching} />
        ) : null}
        <DialogFooter className="border-t bg-background px-5 py-4 sm:px-6">
          {isWaiting && watching ? (
            <>
              {watching.status === 'failed' ? (
                <Button variant="outline" onClick={onRetryWatched}>
                  <RefreshCcw />
                  Retry
                </Button>
              ) : null}
              <Button onClick={onBackground}>Continue in the background</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setDiscardConfirmOpen(true)}>
                Discard
              </Button>
              <Button variant="outline" onClick={onRegenerate}>
                <RefreshCcw />
                Regenerate
              </Button>
              <Button onClick={onStart} disabled={busy === 'start-draft'}>
                {busy === 'start-draft' ? <Loader2 className="animate-spin" /> : <Play />}
                {isContinuation ? 'Add continuation' : 'Start work'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>

      <Dialog
        open={discardConfirmOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setDiscardConfirmOpen(false)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard this plan?</DialogTitle>
            <DialogDescription>
              The draft plan will be removed. This cannot be undone — you would need to generate it
              again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDiscardConfirmOpen(false)}>
              Keep plan
            </Button>
            <Button
              onClick={() => {
                setDiscardConfirmOpen(false)
                onDiscard()
              }}
            >
              Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}

function DraftStageTimeline({
  levels,
  agents,
  selectedItemId,
  onSelectItem
}: {
  levels: WorkboardDraftItem[][]
  agents: Agent[]
  selectedItemId: string
  onSelectItem: (tempId: string) => void
}): React.JSX.Element {
  return (
    <section className="grid gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <Columns3 className="size-4 shrink-0 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Execution stages</h3>
      </div>
      <div className="grid gap-3">
        {levels.map((level, index) => (
          <section key={index} className="rounded-lg border bg-background">
            <header className="border-b px-4 py-3">
              <h4 className="text-sm font-semibold">Stage {index + 1}</h4>
            </header>
            <div className="grid gap-2 p-3">
              {level.map((item) => (
                <DraftStageItemButton
                  key={item.tempId}
                  item={item}
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
  agents,
  selected,
  onSelect
}: {
  item: WorkboardDraftItem
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
        {dependencyCount > 0 ? (
          <div className="flex shrink-0 flex-wrap gap-1.5 sm:justify-end">
            <Badge variant="outline">Waits for {dependencyCount}</Badge>
          </div>
        ) : null}
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
          {sortAgentsByUsage(agents).map((agent) => (
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
      <DraftPriorityControl value={item.priority} onChange={(priority) => onChange({ priority })} />
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
  onOpenFile,
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
  onOpenFile: (path: string) => void
  onAnswered: (data: WorkboardData) => void
  onError: (message: string) => void
}): React.JSX.Element | null {
  const [answerState, setAnswerState] = useState<{
    key: string
    answers: Record<string, InteractionAnswer>
  }>({ key: '', answers: {} })
  const answerKey = `${run?.id ?? ''}:${inputRequest?.id ?? ''}`
  const answers = answerState.key === answerKey ? answerState.answers : {}

  const [inspectOpen, setInspectOpen] = useState(false)

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
        className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px]"
        aria-label="Close Work Item details"
        onClick={onClose}
      />
      <aside className="absolute inset-x-4 top-[4vh] bottom-[4vh] z-10 mx-auto flex w-auto max-w-[860px] flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl">
        <RunDetailHeader
          run={run}
          runs={runs}
          observedRun={observedRun}
          canGoBack={canGoBack}
          onBack={onBack}
          onClose={onClose}
          onSelectRun={onSelectRun}
          onRevealPath={(path) => void revealPath(path)}
          onOpenFile={onOpenFile}
        />

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-6 py-6 ordinus-scrollbar sm:px-10">
          <div className="mx-auto w-full max-w-[640px]">
            <RunDetailReport
              run={run}
              inputRequest={inputRequest}
              answers={answers}
              onAnswerChange={updateAnswer}
              onSubmitAnswers={() => void submitAnswers()}
              onOpenInspect={() => setInspectOpen(true)}
            />
          </div>
        </div>

        <footer className="flex flex-col gap-2 border-t p-4 sm:flex-row">
          <Button variant="outline" className="w-full" onClick={() => onContinue(run)}>
            <GitBranch />
            Continue from here
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

      {inspectOpen ? (
        <RunInspectOverlay
          run={run}
          observedRun={observedRun}
          waitsFor={waitsFor}
          onSelectRun={onSelectRun}
          onClose={() => setInspectOpen(false)}
        />
      ) : null}
    </div>
  )
}

function RunDetailHeader({
  run,
  runs,
  observedRun,
  canGoBack,
  onBack,
  onClose,
  onSelectRun,
  onRevealPath,
  onOpenFile
}: {
  run: WorkboardRun
  runs: WorkboardRun[]
  observedRun: ObservedRunSnapshot | null
  canGoBack: boolean
  onBack: () => void
  onClose: () => void
  onSelectRun: (runId: string) => void
  onRevealPath: (path: string) => void
  onOpenFile: (path: string) => void
}): React.JSX.Element {
  const parentRun = run.parentRunId
    ? runs.find((candidate) => candidate.id === run.parentRunId)
    : undefined
  const deliveryLabel = getDeliveryLabel(run, observedRun)
  const files = getFileReferences(run.artifactRefs, run.changedFiles)

  return (
    <header className="border-b bg-card px-6 py-5 sm:px-10">
      <div className="mx-auto w-full max-w-[640px]">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
              {run.status !== 'completed' ? (
                <Badge variant={statusBadgeVariant(run.status)}>
                  {formatRunStatus(run.status)}
                </Badge>
              ) : null}
              {deliveryLabel ? <span>{deliveryLabel}</span> : null}
            </div>
            <div className="mt-2.5 flex min-w-0 items-start gap-2">
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
            <div className="mt-2.5 flex min-w-0 text-sm">
              <Link
                to={appRoutePaths.agents}
                className="inline-flex min-w-0 items-center gap-1.5 font-medium text-foreground underline-offset-2 hover:text-primary hover:underline"
              >
                <Bot className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{run.agentName}</span>
              </Link>
            </div>
            {parentRun ? (
              <button
                type="button"
                className="mt-1.5 inline-flex min-w-0 items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => onSelectRun(parentRun.id)}
              >
                <CornerDownRight className="size-3.5 shrink-0" />
                <span className="truncate">Continues “{parentRun.title}”</span>
              </button>
            ) : null}
          </div>
          <Button variant="ghost" size="icon" className="shrink-0" onClick={onClose}>
            <XCircle />
            <span className="sr-only">Close</span>
          </Button>
        </div>
        {files.length > 0 ? (
          <div className="mt-2 grid gap-1">
            {files.map((file) => (
              <AttachmentChip
                key={file.path}
                file={file}
                onRevealPath={onRevealPath}
                onOpenFile={onOpenFile}
              />
            ))}
          </div>
        ) : null}
      </div>
    </header>
  )
}

function AttachmentChip({
  file,
  onRevealPath,
  onOpenFile
}: {
  file: FileReference
  onRevealPath: (path: string) => void
  onOpenFile: (path: string) => void
}): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const name = getFileBasename(file.path)
  const isMarkdown = file.path.toLowerCase().endsWith('.md')

  async function copyPath(): Promise<void> {
    try {
      await navigator.clipboard.writeText(file.path)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="group flex min-w-0 items-center gap-1.5 text-sm">
      <FileText className="size-4 shrink-0 text-muted-foreground" />
      <button
        type="button"
        className="min-w-0 truncate font-medium text-foreground underline-offset-2 hover:text-primary hover:underline"
        title={file.path}
        onClick={() => (isMarkdown ? onOpenFile(file.path) : onRevealPath(file.path))}
      >
        {name}
      </button>
      <span className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
        {isMarkdown ? (
          <button
            type="button"
            className="rounded-full p-1 text-muted-foreground hover:text-foreground"
            onClick={() => onOpenFile(file.path)}
            aria-label="Open document"
          >
            <FileText className="size-3.5" />
          </button>
        ) : null}
        <button
          type="button"
          className="rounded-full p-1 text-muted-foreground hover:text-foreground"
          onClick={() => void copyPath()}
          aria-label="Copy file path"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </button>
        <button
          type="button"
          className="rounded-full p-1 text-muted-foreground hover:text-foreground"
          onClick={() => onRevealPath(file.path)}
          aria-label="Show in file manager"
        >
          <FolderOpen className="size-3.5" />
        </button>
      </span>
    </div>
  )
}

function getFileBasename(path: string): string {
  const normalized = path.replaceAll('\\', '/').replace(/\/+$/, '')
  const segment = normalized.slice(normalized.lastIndexOf('/') + 1)
  return segment || normalized
}

function getDeliveryLabel(run: WorkboardRun, observedRun: ObservedRunSnapshot | null): string {
  if (run.status === 'completed' && run.completedAt) {
    return `Delivered ${formatDeliveryMoment(run.completedAt)}`
  }
  return getHeaderDurationLabel(run, observedRun)
}

function formatDeliveryMoment(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const now = new Date()
  const startOfDay = (input: Date): number =>
    new Date(input.getFullYear(), input.getMonth(), input.getDate()).getTime()
  const dayDiff = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000)

  if (dayDiff === 0) return `today at ${time}`
  if (dayDiff === 1) return `yesterday at ${time}`
  if (dayDiff > 1 && dayDiff < 7)
    return `${date.toLocaleDateString([], { weekday: 'long' })} at ${time}`
  return `on ${date.toLocaleDateString()}`
}

function RequestFilesDrawer({
  request,
  files,
  runs,
  onClose,
  onSelectRun,
  onOpenFile,
  onError
}: {
  request: WorkboardData['requests'][number]
  files: RequestFileProvenance[]
  runs: WorkboardRun[]
  onClose: () => void
  onSelectRun: (runId: string) => void
  onOpenFile: (path: string) => void
  onError: (message: string) => void
}): React.JSX.Element {
  const [missingPaths, setMissingPaths] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const statuses = await window.ordinus.workboard.checkPaths({ requestId: request.id })
        if (cancelled) return
        setMissingPaths(
          new Set(
            statuses
              .filter((status) => !status.exists)
              .map((status) => status.path.replaceAll('\\', '/'))
          )
        )
      } catch (error) {
        if (cancelled) return
        onError(error instanceof Error ? error.message : 'File status could not be checked.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [request.id, onError])

  const inFolder = files.filter((file) => file.inWorkFolder)
  const outsideFolder = files.filter((file) => !file.inWorkFolder)

  async function revealPath(path: string): Promise<void> {
    const runId = files.find((file) => file.path === path)?.attributions[0]?.latestRunId
    if (!runId) return
    try {
      await window.ordinus.workboard.revealPath({ runId, relativePath: path })
    } catch (error) {
      onError(error instanceof Error ? error.message : 'File could not be shown.')
    }
  }

  return (
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px]"
        aria-label="Close request files"
        onClick={onClose}
      />
      <aside className="absolute inset-x-4 top-[4vh] bottom-[4vh] z-10 mx-auto flex w-auto max-w-[620px] flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl">
        <header className="border-b bg-card px-6 py-5 sm:px-8">
          <div className="mx-auto flex w-full max-w-[480px] items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h3 className="min-w-0 break-words text-xl font-semibold leading-7 [overflow-wrap:anywhere]">
                {request.title}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {files.length === 0
                  ? 'No files yet'
                  : `${files.length} ${files.length === 1 ? 'file' : 'files'} from this work request`}
              </p>
            </div>
            <Button variant="ghost" size="icon" className="shrink-0" onClick={onClose}>
              <XCircle />
              <span className="sr-only">Close</span>
            </Button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-6 py-6 ordinus-scrollbar sm:px-8">
          <div className="mx-auto w-full max-w-[480px]">
            {files.length === 0 ? (
              <EmptyDetailState>
                Nothing in this cabinet yet — files show up here as the work gets done.
              </EmptyDetailState>
            ) : (
              <div className="grid gap-6">
                {inFolder.length > 0 ? (
                  <RequestFileList
                    files={inFolder}
                    missingPaths={missingPaths}
                    runs={runs}
                    onRevealPath={(path) => void revealPath(path)}
                    onSelectRun={onSelectRun}
                    onOpenFile={onOpenFile}
                  />
                ) : null}
                {outsideFolder.length > 0 ? (
                  <section>
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                      Outside the work folder
                    </p>
                    <RequestFileList
                      files={outsideFolder}
                      missingPaths={missingPaths}
                      runs={runs}
                      onRevealPath={(path) => void revealPath(path)}
                      onSelectRun={onSelectRun}
                      onOpenFile={onOpenFile}
                    />
                  </section>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}

function RunDetailReport({
  run,
  inputRequest,
  answers,
  onAnswerChange,
  onSubmitAnswers,
  onOpenInspect
}: {
  run: WorkboardRun
  inputRequest?: WorkRunInputRequest
  answers: Record<string, InteractionAnswer>
  onAnswerChange: (answer: InteractionAnswer) => void
  onSubmitAnswers: () => void
  onOpenInspect: () => void
}): React.JSX.Element {
  return (
    <div className="grid min-w-0 gap-4">
      <RunOutputSection
        run={run}
        inputRequest={inputRequest}
        answers={answers}
        onAnswerChange={onAnswerChange}
        onSubmitAnswers={onSubmitAnswers}
      />
      <div className="border-t pt-3">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          onClick={onOpenInspect}
        >
          <TerminalSquare className="size-3.5" />
          Inspect how this work happened
        </button>
      </div>
    </div>
  )
}

function RunContextSection({
  run,
  defaultOpen = false
}: {
  run: WorkboardRun
  defaultOpen?: boolean
}): React.JSX.Element {
  return (
    <CollapsibleReportSection
      title="What you asked for"
      defaultOpen={defaultOpen || run.status === 'blocked'}
    >
      <div className="grid gap-3">
        <CopyableTextBlock label="Asked to" value={run.instruction} />
        <CopyableTextBlock label="Expected" value={run.expectedOutput || 'Not specified'} />
      </div>
    </CollapsibleReportSection>
  )
}

function RunInspectOverlay({
  run,
  observedRun,
  waitsFor,
  onSelectRun,
  onClose
}: {
  run: WorkboardRun
  observedRun: ObservedRunSnapshot | null
  waitsFor: WorkboardRun[]
  onSelectRun: (runId: string) => void
  onClose: () => void
}): React.JSX.Element {
  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-foreground/20"
        aria-label="Close inspector"
        onClick={onClose}
      />
      <aside className="absolute inset-y-0 right-0 z-10 flex w-full flex-col border-l bg-card shadow-2xl sm:w-[440px]">
        <header className="flex items-center justify-between gap-3 border-b px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">Behind the scenes</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              How {run.agentName} approached this work.
            </p>
          </div>
          <Button variant="ghost" size="icon" className="shrink-0" onClick={onClose}>
            <XCircle />
            <span className="sr-only">Close inspector</span>
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2 ordinus-scrollbar">
          <RunContextSection run={run} defaultOpen />
          <RunActivitySection run={run} observedRun={observedRun} defaultOpen />
          {waitsFor.length > 0 ? (
            <CollapsibleReportSection title="Depends on" defaultOpen>
              <DependencyWorkItemList items={waitsFor} onSelectRun={onSelectRun} />
            </CollapsibleReportSection>
          ) : null}
          <TechnicalDetailsSection run={run} observedRun={observedRun} />
        </div>
      </aside>
    </div>
  )
}

function RunOutputSection({
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
    <section className="min-w-0 overflow-hidden pb-1">
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
        <div className="group relative">
          <div className="absolute -right-1 top-0 z-10 opacity-0 transition-opacity group-hover:opacity-100">
            <CopyButton value={run.resultSummary} label="Copy output" />
          </div>
          <MarkdownContent content={run.resultSummary} />
        </div>
      ) : run.status === 'failed' ? (
        <EmptyDetailState>This agent stopped before it could finish the work.</EmptyDetailState>
      ) : (
        <RunOutputPending run={run} />
      )}
      {run.error ? (
        <div className="mt-3 rounded-lg border border-status-failed/30 bg-status-failed/5 p-3">
          <p className="text-xs font-medium text-muted-foreground">What went wrong</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]">
            {run.error}
          </p>
        </div>
      ) : null}
      {isTerminalRunStatus(run.status) && run.assignedAgentId ? (
        <AgentFeedbackPanel
          agentId={run.assignedAgentId}
          agentName={run.agentName}
          sourceFeedbackId={run.id}
        />
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
  observedRun,
  defaultOpen = false
}: {
  run: WorkboardRun
  observedRun: ObservedRunSnapshot | null
  defaultOpen?: boolean
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
    <CollapsibleReportSection
      title="How it went"
      defaultOpen={defaultOpen || run.status === 'running'}
    >
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
    <CollapsibleReportSection title="Technical record">
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
        <div
          key={item.label}
          className="min-w-0 overflow-hidden rounded-lg border bg-background p-3"
        >
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
  const ordered = sortAgentsByUsage(agents)
  const options = ordered.map((agent) => ({
    agentId: agent.id,
    label: agent.name,
    detail: buildAgentUsageDetail(agent)
  }))

  if (!normalizedQuery) {
    return options
  }

  return options.filter((option) => option.label.toLocaleLowerCase().includes(normalizedQuery))
}

function sortAgentsByUsage(agents: Agent[]): Agent[] {
  return [...agents].sort((left, right) => {
    const leftUsed = left.lastUsedAt ? Date.parse(left.lastUsedAt) : 0
    const rightUsed = right.lastUsedAt ? Date.parse(right.lastUsedAt) : 0
    if (leftUsed !== rightUsed) {
      return rightUsed - leftUsed
    }
    if (left.useCount !== right.useCount) {
      return right.useCount - left.useCount
    }
    return left.name.localeCompare(right.name)
  })
}

function buildAgentUsageDetail(agent: Agent): string {
  if (!agent.lastUsedAt) {
    return agent.role
  }
  const recency = formatRelativeUsage(agent.lastUsedAt)
  const frequency = agent.useCount > 0 ? ` · ${agent.useCount} kez` : ''
  return `${agent.role} · ${recency}${frequency}`
}

function formatRelativeUsage(iso: string): string {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) {
    return 'kullanıldı'
  }
  const diffMs = Date.now() - then
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'az önce kullanıldı'
  if (minutes < 60) return `${minutes} dk önce`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} saat önce`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} gün önce`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months} ay önce`
  const years = Math.floor(days / 365)
  return `${years} yıl önce`
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

/**
 * Marker of a continuation target's current run set, captured at generation
 * time and re-checked at accept time. If it differs, the draft was planned
 * against a stale view of the work request and merging it blindly could
 * conflict, so the user is asked to decide. New requests (no destination)
 * have no shared target and need no guard.
 */
function computeContinuationVersion(
  runs: WorkboardRun[],
  destinationRequestId: string | undefined
): string | null {
  if (!destinationRequestId) {
    return null
  }
  const targetRuns = runs.filter((run) => run.requestId === destinationRequestId)
  const latestUpdatedAt = targetRuns.reduce(
    (latest, run) => (run.updatedAt > latest ? run.updatedAt : latest),
    ''
  )
  return `${targetRuns.length}:${latestUpdatedAt}`
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

const runningOutputMessages = [
  'The agent is working on this…',
  'Thinking it through…',
  'Drafting and refining the output…',
  'Pulling the details together…',
  'Still going — good work takes a moment…',
  'Making steady progress…'
]

function RunOutputPending({ run }: { run: WorkboardRun }): React.JSX.Element {
  if (run.status === 'blocked') {
    return (
      <PendingOutputCard
        title="Waiting on earlier work"
        detail="This agent starts as soon as the work it depends on wraps up."
      />
    )
  }
  if (run.status === 'queued') {
    return (
      <PendingOutputCard
        title="Queued and ready to go"
        detail="This work item is in line and will start as soon as an agent is free."
      />
    )
  }
  if (run.status === 'waiting_for_user') {
    return (
      <PendingOutputCard
        title="Waiting for your input"
        detail="The agent paused to hear from you before it carries on."
      />
    )
  }
  if (!isTerminalRunStatus(run.status)) {
    return <RunningOutputState />
  }
  return <EmptyDetailState>No output yet.</EmptyDetailState>
}

function RunningOutputState(): React.JSX.Element {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % runningOutputMessages.length)
    }, 4200)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex items-center gap-3 px-4 py-4">
        <WorkingDots />
        <p
          key={index}
          className="text-sm text-foreground duration-700 animate-in fade-in-0 slide-in-from-bottom-1"
        >
          {runningOutputMessages[index]}
        </p>
      </div>
      <div className="h-1 w-full bg-border/60">
        <div className="h-full w-2/5 animate-pulse rounded-full bg-primary/50" />
      </div>
    </div>
  )
}

function WorkingDots(): React.JSX.Element {
  return (
    <span className="flex shrink-0 items-center gap-1" aria-hidden="true">
      {[0, 1, 2].map((dot) => (
        <span
          key={dot}
          className="size-1.5 animate-bounce rounded-full bg-primary/70"
          style={{ animationDelay: `${dot * 160}ms` }}
        />
      ))}
    </span>
  )
}

function PendingOutputCard({
  title,
  detail
}: {
  title: string
  detail: string
}): React.JSX.Element {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
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
