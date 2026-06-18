import { ChevronDown, Loader2, Play, SlidersHorizontal, Sparkles, Target } from 'lucide-react'
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

/**
 * Split Run button with per-workflow target memory (IDE run-config style, ADR-026).
 *
 * The main button and the quick menu items run directly with the remembered or a
 * fresh target (auto folder). "Run with options…" hands off to the Workboard
 * composer in workflow mode, where working-folder and continue-from-run selection
 * live (ADR-054) — it supersedes the old bare "add to an existing request" picker.
 */
export function RunControl({
  running,
  disabled,
  lastTargetRequest,
  defaultTarget,
  onRun,
  onRunWithOptions
}: {
  running: boolean
  disabled: boolean
  lastTargetRequest: WorkRequest | null
  defaultTarget: WorkflowRunTarget
  onRun: (target: WorkflowRunTarget) => void
  onRunWithOptions: () => void
}): React.JSX.Element {
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
          <DropdownMenuItem onSelect={() => onRunWithOptions()}>
            <SlidersHorizontal className="size-4" /> Run with options…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
