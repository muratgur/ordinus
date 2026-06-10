import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Background,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  Check,
  History,
  Loader2,
  Maximize2,
  Plus,
  Sparkles,
  Trash2,
  Users,
  X,
  ZoomIn,
  ZoomOut
} from 'lucide-react'
import type { Agent, WorkflowDesign, WorkflowRunTarget, WorkRequest } from '@shared/contracts'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { Rail, RailItem, RailItemAction, RailList } from '@renderer/components/rail'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@renderer/components/ui/alert-dialog'
import { DraftItemFields } from '@renderer/components/draft-item-fields'
import { DeletableEdge, TaskNodeView } from '@renderer/components/workflow-canvas-views'
import {
  decorateNodeData,
  serializeCanvas,
  toReactFlowEdges,
  toReactFlowNodes,
  wouldCreateCycle,
  type TaskEdge,
  type TaskNode,
  type TaskNodeData
} from '@renderer/components/workflow-canvas-model'
import { RunControl } from '@renderer/components/workflow-run-control'
import {
  deepLinkToRequest,
  readLastTargetRequestId,
  readSidebarDocked,
  readViewport,
  writeLastTargetRequestId,
  writeSidebarDocked,
  writeViewport
} from '@renderer/components/workflow-storage'
import { appRoutePaths } from '@renderer/app/routes'
import { cn } from '@renderer/lib/utils'

const AUTOSAVE_DELAY_MS = 600
const nodeTypes = { task: TaskNodeView }
const edgeTypes = { deletable: DeletableEdge }

// --- Screen ----------------------------------------------------------------

export function WorkflowsScreen(): React.JSX.Element {
  const navigate = useNavigate()
  const [designs, setDesigns] = useState<WorkflowDesign[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [requests, setRequests] = useState<WorkRequest[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sidebarDocked, setSidebarDocked] = useState(readSidebarDocked)
  const [deleteTarget, setDeleteTarget] = useState<WorkflowDesign | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [designList, agentList, workboard] = await Promise.all([
        window.ordinus.workflows.list(),
        window.ordinus.agents.list(),
        window.ordinus.workboard.list()
      ])
      setDesigns(designList)
      setAgents(agentList)
      setRequests(workboard.requests)
      setSelectedId((current) => current ?? designList[0]?.id ?? null)
      setError(null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'We couldn’t load your workflows.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) void load()
    })
    return () => {
      cancelled = true
    }
  }, [load])

  useEffect(() => {
    writeSidebarDocked(sidebarDocked)
  }, [sidebarDocked])

  const selectedDesign = useMemo(
    () => designs.find((design) => design.id === selectedId) ?? null,
    [designs, selectedId]
  )

  const requestById = useMemo(
    () => new Map(requests.map((request) => [request.id, request])),
    [requests]
  )

  const selectedRuns = useMemo(
    () =>
      selectedId
        ? requests
            .filter((request) => request.workflowDesignId === selectedId)
            .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        : [],
    [requests, selectedId]
  )

  async function handleCreate(): Promise<void> {
    try {
      const created = await window.ordinus.workflows.create({
        name: 'Untitled workflow',
        description: '',
        canvas: { nodes: [], edges: [] }
      })
      setDesigns((current) => [created, ...current])
      setSelectedId(created.id)
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : 'We couldn’t create that workflow.'
      )
    }
  }

  async function confirmDelete(): Promise<void> {
    if (!deleteTarget) return
    const design = deleteTarget
    setDeleteTarget(null)
    try {
      await window.ordinus.workflows.delete({ id: design.id })
      setDesigns((current) => current.filter((item) => item.id !== design.id))
      setSelectedId((current) => (current === design.id ? null : current))
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : 'We couldn’t delete that workflow.'
      )
    }
  }

  const handleDesignSaved = useCallback((saved: WorkflowDesign) => {
    setDesigns((current) => current.map((item) => (item.id === saved.id ? saved : item)))
  }, [])

  function openRun(request: WorkRequest): void {
    deepLinkToRequest(request.id, Boolean(request.archivedAt))
    navigate(appRoutePaths.workboard)
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] gap-3 py-3">
      <Rail
        aria-label="Your workflows"
        collapsed={!sidebarDocked}
        onToggleCollapsed={() => setSidebarDocked((value) => !value)}
        cta={{ label: 'New workflow', onClick: () => void handleCreate() }}
        searchPlaceholder="Find workflow"
        search={designs.map((design) => ({
          id: design.id,
          label: design.name,
          meta: formatWorkflowStepCount(design),
          onSelect: () => setSelectedId(design.id)
        }))}
      >
        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        ) : null}
        <RailList
          isEmpty={!loading && designs.length === 0}
          empty="No workflows yet. Start one to design how your team works together."
        >
          {loading
            ? null
            : designs.map((design) => (
                <RailItem
                  key={design.id}
                  title={design.name}
                  selected={design.id === selectedId}
                  meta={formatWorkflowStepCount(design)}
                  onSelect={() => setSelectedId(design.id)}
                  actions={
                    <RailItemAction
                      icon={Trash2}
                      label="Delete workflow"
                      className="hover:text-destructive"
                      onClick={() => setDeleteTarget(design)}
                    />
                  }
                />
              ))}
        </RailList>
      </Rail>

      <section className="relative min-w-0 flex-1 overflow-hidden rounded-md border bg-card">
        {selectedDesign ? (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="absolute right-3 top-3 z-20 gap-1.5 bg-card/90 backdrop-blur"
              >
                <History className="size-3.5" />
                Run history
                {selectedRuns.length > 0 ? (
                  <span className="text-muted-foreground">({selectedRuns.length})</span>
                ) : null}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={6}
              className="w-80 border-border bg-card p-0 text-foreground shadow-lg"
            >
              <div className="border-b px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Past runs
              </div>
              {selectedRuns.length === 0 ? (
                <p className="px-3 py-4 text-[13px] text-muted-foreground">
                  Hasn’t run yet — hit Run when you’re ready.
                </p>
              ) : (
                <div className="ordinus-scrollbar max-h-72 overflow-y-auto py-1">
                  {selectedRuns.map((request) => (
                    <button
                      key={request.id}
                      type="button"
                      onClick={() => openRun(request)}
                      className={cn(
                        'flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-left transition-colors hover:bg-muted',
                        request.archivedAt ? 'opacity-60' : ''
                      )}
                    >
                      <span className="flex w-full items-center gap-1.5">
                        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                          {request.title}
                        </span>
                        {request.archivedAt ? (
                          <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                            Archived
                          </span>
                        ) : null}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {request.status} · {new Date(request.createdAt).toLocaleString()}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </PopoverContent>
          </Popover>
        ) : null}

        {selectedDesign ? (
          <ReactFlowProvider key={selectedDesign.id}>
            <WorkflowCanvasEditor
              design={selectedDesign}
              agents={agents}
              requests={requests}
              requestById={requestById}
              onSaved={handleDesignSaved}
              onRefreshRequests={load}
            />
          </ReactFlowProvider>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
            <Users className="size-9 opacity-40" />
            <p className="max-w-xs text-sm">
              Design how your team works together. Pick a workflow on the left, or start a new one.
            </p>
            <Button size="sm" onClick={() => void handleCreate()}>
              <Plus className="size-4" /> New workflow
            </Button>
          </div>
        )}
      </section>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleteTarget?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Your team will forget this routine and its steps. Past runs stay in the Workboard, but
              there’s no undo for the design itself.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void confirmDelete()}
            >
              Delete workflow
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function formatWorkflowStepCount(design: WorkflowDesign): string {
  const stepCount = design.canvas.nodes.length
  if (stepCount === 0) return 'No steps yet'
  return `${stepCount} step${stepCount === 1 ? '' : 's'}`
}

// --- Canvas editor ---------------------------------------------------------

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

function WorkflowCanvasEditor({
  design,
  agents,
  requests,
  requestById,
  onSaved,
  onRefreshRequests
}: {
  design: WorkflowDesign
  agents: Agent[]
  requests: WorkRequest[]
  requestById: Map<string, WorkRequest>
  onSaved: (design: WorkflowDesign) => void
  onRefreshRequests: () => Promise<void>
}): React.JSX.Element {
  const navigate = useNavigate()
  const { zoomIn, zoomOut, fitView, screenToFlowPosition } = useReactFlow()
  const flowWrapperRef = useRef<HTMLDivElement | null>(null)
  // Read once per design; restores the saved camera (pan + zoom) on open.
  const initialViewport = useMemo(() => readViewport(design.id), [design.id])
  const agentsById = useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [agents])

  const [nodes, setNodes, onNodesChange] = useNodesState<TaskNode>(
    toReactFlowNodes(design.canvas, agentsById)
  )
  const [edges, setEdges, onEdgesChange] = useEdgesState<TaskEdge>(toReactFlowEdges(design.canvas))
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [name, setName] = useState(design.name)
  const [description, setDescription] = useState(design.description)
  const [goalOpen, setGoalOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [lastTargetRequestId, setLastTargetRequestId] = useState<string | null>(() =>
    readLastTargetRequestId(design.id)
  )

  // Re-decorate nodes (teammate name + needs-attention flag) when agents change.
  useEffect(() => {
    setNodes((current) =>
      current.map((node) => {
        const next = decorateNodeData(node.data, agentsById)
        if (node.data.agentName === next.agentName && node.data.invalid === next.invalid) {
          return node
        }
        return { ...node, data: next }
      })
    )
  }, [agentsById, setNodes])

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return
      if (connection.source === connection.target) return
      setEdges((current) => {
        if (
          current.some(
            (edge) => edge.source === connection.source && edge.target === connection.target
          )
        ) {
          return current
        }
        if (wouldCreateCycle(current, connection.source as string, connection.target as string)) {
          setRunError('That connection would loop back on itself.')
          return current
        }
        setRunError(null)
        return addEdge(
          {
            ...connection,
            id: `edge-${crypto.randomUUID()}`,
            type: 'deletable',
            markerEnd: { type: MarkerType.ArrowClosed }
          },
          current
        )
      })
    },
    [setEdges]
  )

  const handleAddNode = useCallback(() => {
    if (nodes.length >= 16) {
      setRunError('A workflow can hold up to 16 steps.')
      return
    }
    const id = `node-${crypto.randomUUID()}`
    // Drop the node near the center of what the user is currently looking at,
    // not at a fixed canvas coordinate they may have scrolled away from. A small
    // per-node jitter keeps consecutive adds from stacking exactly.
    const rect = flowWrapperRef.current?.getBoundingClientRect()
    const jitter = (nodes.length % 5) * 16
    const center =
      rect !== undefined
        ? screenToFlowPosition({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 })
        : { x: 120, y: 80 }
    const newNode: TaskNode = {
      id,
      type: 'task',
      position: { x: center.x - 90 + jitter, y: center.y - 30 + jitter },
      data: decorateNodeData(
        { title: '', instruction: '', expectedOutput: '', assignedAgentId: '', priority: 0 },
        agentsById
      )
    }
    setNodes((current) => [...current, newNode])
    setSelectedNodeId(id)
    setInspectorOpen(true)
  }, [nodes.length, agentsById, setNodes, screenToFlowPosition])

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      setNodes((current) => current.filter((node) => node.id !== nodeId))
      setEdges((current) =>
        current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId)
      )
      setInspectorOpen(false)
    },
    [setEdges, setNodes]
  )

  const updateNodeData = useCallback(
    (nodeId: string, patch: Partial<TaskNodeData>) => {
      setNodes((current) =>
        current.map((node) =>
          node.id === nodeId
            ? { ...node, data: decorateNodeData({ ...node.data, ...patch }, agentsById) }
            : node
        )
      )
    },
    [agentsById, setNodes]
  )

  // Tracks unsaved edits so the unmount flush only writes when something
  // actually changed (avoids a redundant save every time a design is switched).
  const dirtyRef = useRef(false)

  const persist = useCallback(async () => {
    setSaveStatus('saving')
    try {
      const saved = await window.ordinus.workflows.update({
        id: design.id,
        name: name.trim() || 'Untitled workflow',
        description,
        canvas: serializeCanvas(nodes, edges)
      })
      onSaved(saved)
      dirtyRef.current = false
      setSaveStatus('saved')
      return saved
    } catch (saveFailure) {
      setSaveStatus('error')
      throw saveFailure
    }
  }, [design.id, name, description, nodes, edges, onSaved])

  const persistRef = useRef(persist)
  useEffect(() => {
    persistRef.current = persist
  }, [persist])

  const hasMountedRef = useRef(false)
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true
      return
    }
    dirtyRef.current = true
    const timer = setTimeout(() => {
      void persist().catch(() => {
        /* surfaced via saveStatus */
      })
    }, AUTOSAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [persist])

  // Flush pending edits when leaving so debounce-window changes aren’t lost.
  useEffect(() => {
    return () => {
      if (dirtyRef.current) {
        void persistRef.current().catch(() => {
          /* best-effort flush */
        })
      }
    }
  }, [])

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId]
  )

  // Focus the goal textarea once the drawer has slid into view.
  const goalTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  useEffect(() => {
    if (!goalOpen) return
    const timer = setTimeout(() => goalTextareaRef.current?.focus(), 60)
    return () => clearTimeout(timer)
  }, [goalOpen])

  const runValidation = useMemo(() => {
    if (nodes.length === 0) return 'Add a step or two before kicking this off.'
    const invalid = nodes.find((node) => node.data.invalid)
    if (invalid) {
      return `Finish setting up “${invalid.data.title.trim() || 'a step'}” first.`
    }
    return null
  }, [nodes])

  const lastTargetRequest = lastTargetRequestId
    ? (requestById.get(lastTargetRequestId) ?? null)
    : null

  const runTarget = useCallback(
    async (target: WorkflowRunTarget) => {
      if (runValidation) {
        setRunError(runValidation)
        return
      }
      setRunning(true)
      setRunError(null)
      try {
        // Flush the latest canvas first — run compiles the persisted design.
        await persist()
        await window.ordinus.workflows.run({ designId: design.id, target })
        const nextTargetId = target.kind === 'append' ? target.requestId : null
        writeLastTargetRequestId(design.id, nextTargetId)
        setLastTargetRequestId(nextTargetId)
        await onRefreshRequests()
        navigate(appRoutePaths.workboard)
      } catch (error) {
        setRunError(error instanceof Error ? error.message : 'We couldn’t kick this off.')
        setRunning(false)
      }
    },
    [runValidation, persist, design.id, onRefreshRequests, navigate]
  )

  const defaultTarget: WorkflowRunTarget = lastTargetRequest
    ? { kind: 'append', requestId: lastTargetRequest.id }
    : { kind: 'new' }

  return (
    <div className="flex h-full min-h-0">
      <div ref={flowWrapperRef} className="relative min-w-0 flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_event, node) => {
            setSelectedNodeId(node.id)
            setInspectorOpen(true)
          }}
          onPaneClick={() => setInspectorOpen(false)}
          onMoveEnd={(_event, viewport) => writeViewport(design.id, viewport)}
          defaultViewport={initialViewport ?? undefined}
          fitView={!initialViewport}
          proOptions={{ hideAttribution: true }}
        >
          <Background />
        </ReactFlow>

        {/* Goal bar (collapsed description) */}
        <button
          type="button"
          onClick={() => setGoalOpen(true)}
          className="absolute left-1/2 top-3 z-10 flex max-w-[min(40rem,70%)] -translate-x-1/2 items-center gap-2 rounded-full border bg-card/95 px-4 py-1.5 text-left shadow-sm backdrop-blur transition-colors hover:bg-accent"
        >
          <Sparkles className="size-3.5 shrink-0 text-primary" />
          <span className="truncate text-sm font-medium">{name.trim() || 'Untitled workflow'}</span>
          <span className="truncate text-xs text-muted-foreground">
            {description.trim() || 'Set the goal your team works toward…'}
          </span>
        </button>

        {/* Save status pill */}
        <div className="absolute right-3 top-3 z-10">
          <SaveStatusPill status={saveStatus} />
        </div>

        {/* Left floating toolbar */}
        <div className="absolute left-3 top-1/2 z-10 flex -translate-y-1/2 flex-col items-center gap-1 rounded-md border bg-card/95 p-1 shadow-sm backdrop-blur">
          <button
            type="button"
            title="Add a step"
            onClick={handleAddNode}
            className="grid size-8 place-items-center rounded bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary-active"
          >
            <Plus className="size-4" />
          </button>
          <div className="my-0.5 h-px w-6 bg-border" />
          <ToolbarButton title="Fit to view" onClick={() => fitView({ duration: 200 })}>
            <Maximize2 className="size-4" />
          </ToolbarButton>
          <ToolbarButton title="Zoom in" onClick={() => zoomIn({ duration: 150 })}>
            <ZoomIn className="size-4" />
          </ToolbarButton>
          <ToolbarButton title="Zoom out" onClick={() => zoomOut({ duration: 150 })}>
            <ZoomOut className="size-4" />
          </ToolbarButton>
        </div>

        {/* Run control */}
        <div className="absolute bottom-4 right-4 z-10 flex flex-col items-end">
          <RunControl
            requests={requests}
            running={running}
            disabled={runValidation !== null}
            lastTargetRequest={lastTargetRequest}
            defaultTarget={defaultTarget}
            onRun={(target) => void runTarget(target)}
          />
          {runError ? (
            <p className="mt-2 max-w-xs rounded-md bg-destructive/10 px-2 py-1 text-right text-xs text-destructive">
              {runError}
            </p>
          ) : null}
        </div>

        {/* Empty canvas state */}
        {nodes.length === 0 ? (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <Sparkles className="size-8 opacity-40" />
            <p className="text-sm">This canvas is empty.</p>
            <p className="text-xs">Add your first step to start mapping out the work.</p>
          </div>
        ) : null}

        {/* Goal drawer (top sheet + scrim) */}
        <div className={cn('absolute inset-0 z-30', goalOpen ? '' : 'pointer-events-none')}>
          <button
            type="button"
            aria-label="Close"
            tabIndex={goalOpen ? 0 : -1}
            className={cn(
              'absolute inset-0 cursor-default bg-background/60 backdrop-blur-sm transition-opacity duration-200',
              goalOpen ? 'opacity-100' : 'opacity-0'
            )}
            onClick={() => setGoalOpen(false)}
          />
          <div
            className={cn(
              'absolute inset-x-0 top-0 max-h-[60%] overflow-y-auto border-b bg-card p-5 shadow-xl transition-transform duration-200 ease-out',
              goalOpen ? 'translate-y-0' : '-translate-y-full'
            )}
          >
            <div className="mx-auto grid max-w-2xl gap-4">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <Sparkles className="size-4 text-primary" /> Workflow goal
                </h2>
                <button
                  type="button"
                  className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                  onClick={() => setGoalOpen(false)}
                >
                  <X className="size-4" />
                </button>
              </div>
              <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                Name
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Give this workflow a name"
                  className="text-sm font-medium"
                />
              </label>
              <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                What’s the goal?
                <textarea
                  ref={goalTextareaRef}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Your team reads this to understand the bigger picture — what are we trying to achieve, and why?"
                  className="ordinus-scrollbar min-h-40 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') setGoalOpen(false)
                  }}
                />
              </label>
              <div className="flex justify-end">
                <Button size="sm" onClick={() => setGoalOpen(false)}>
                  Done
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Node inspector */}
      <div
        className={cn(
          'flex min-h-0 overflow-hidden transition-[width] duration-200 ease-out',
          inspectorOpen && selectedNode ? 'w-80' : 'w-0'
        )}
      >
        <aside className="flex w-80 shrink-0 flex-col overflow-hidden border-l bg-card">
          {selectedNode ? (
            <>
              <div className="flex items-center justify-between border-b px-4 py-3">
                <h3 className="text-sm font-semibold">Step details</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                  onClick={() => handleDeleteNode(selectedNode.id)}
                >
                  <Trash2 className="size-3.5" /> Remove
                </Button>
              </div>
              <div className="ordinus-scrollbar grid min-w-0 gap-4 overflow-y-auto p-4">
                <DraftItemFields
                  value={selectedNode.data}
                  agents={agents}
                  onChange={(patch) => updateNodeData(selectedNode.id, patch)}
                />
                <p className="grid gap-1 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Hand-offs</span>
                  Drag from one step’s bottom dot to another’s top dot to make it wait for that
                  work. Click the × on a line to remove a hand-off.
                </p>
              </div>
            </>
          ) : null}
        </aside>
      </div>
    </div>
  )
}

function ToolbarButton({
  title,
  onClick,
  children
}: {
  title: string
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="grid size-8 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {children}
    </button>
  )
}

function SaveStatusPill({ status }: { status: SaveStatus }): React.JSX.Element | null {
  if (status === 'idle') return null
  if (status === 'saving') {
    return (
      <span className="flex items-center gap-1.5 rounded-full border bg-card/95 px-2.5 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur">
        <Loader2 className="size-3 animate-spin" /> Saving…
      </span>
    )
  }
  if (status === 'saved') {
    return (
      <span className="flex items-center gap-1.5 rounded-full border bg-card/95 px-2.5 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur">
        <Check className="size-3 text-emerald-500" /> Saved
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-destructive/40 bg-destructive/10 px-2.5 py-1 text-xs text-destructive shadow-sm">
      Couldn’t save
    </span>
  )
}
