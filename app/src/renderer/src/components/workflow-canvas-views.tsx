import {
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  Position,
  getBezierPath,
  useReactFlow,
  type EdgeProps,
  type NodeProps
} from '@xyflow/react'
import { X } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import type { TaskNode } from '@renderer/components/workflow-canvas-model'

export function TaskNodeView({ data, selected }: NodeProps<TaskNode>): React.JSX.Element {
  return (
    <div
      className={cn(
        'min-w-44 max-w-56 rounded-md border bg-card px-3 py-2 shadow-sm transition-colors',
        selected ? 'border-primary ring-2 ring-primary/30' : 'border-border',
        data.invalid ? 'border-destructive/60' : ''
      )}
    >
      <Handle type="target" position={Position.Top} className="!size-2 !bg-muted-foreground" />
      <div className="truncate text-sm font-medium text-foreground">
        {data.title.trim() || 'Untitled step'}
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-2">
        <span className="truncate text-xs text-muted-foreground">
          {data.agentName || 'No teammate yet'}
        </span>
        {data.invalid ? (
          <span className="shrink-0 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
            !
          </span>
        ) : null}
      </div>
      <Handle type="source" position={Position.Bottom} className="!size-2 !bg-muted-foreground" />
    </div>
  )
}

/** Edge with a small × at its midpoint so removing a dependency is discoverable. */
export function DeletableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  selected
}: EdgeProps): React.JSX.Element {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition
  })
  const { setEdges } = useReactFlow()

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} />
      <EdgeLabelRenderer>
        <button
          type="button"
          title="Remove this connection"
          className={cn(
            'nodrag nopan pointer-events-auto absolute grid size-4 place-items-center rounded-full border bg-card text-muted-foreground shadow-sm transition-opacity hover:text-destructive',
            selected ? 'opacity-100' : 'opacity-60 hover:opacity-100'
          )}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          onClick={() => setEdges((current) => current.filter((edge) => edge.id !== id))}
        >
          <X className="size-2.5" />
        </button>
      </EdgeLabelRenderer>
    </>
  )
}
