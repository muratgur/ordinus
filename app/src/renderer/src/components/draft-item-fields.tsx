import type React from 'react'
import type { Agent } from '@shared/contracts'
import { SelectControl } from '@renderer/components/select-control'
import {
  draftFieldClassName,
  draftInputClassName,
  draftPriorityOptions,
  draftTextareaClassName,
  sortAgentsByUsage,
  type DraftItemFieldValues
} from '@renderer/components/draft-item-shared'
import { cn } from '@renderer/lib/utils'

export function DraftPriorityControl({
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

/**
 * The editable task fields of a single Work Item: name, assigned agent,
 * instruction, expected output, and priority. Dependency editing is
 * deliberately NOT here — the planner owns it via its own checklist, and the
 * workflow designer owns it via canvas edges (ADR-025).
 */
export function DraftItemFields({
  value,
  agents,
  onChange
}: {
  value: DraftItemFieldValues
  agents: Agent[]
  onChange: (patch: Partial<DraftItemFieldValues>) => void
}): React.JSX.Element {
  return (
    <>
      <label className={draftFieldClassName}>
        Item name
        <input
          className={draftInputClassName}
          value={value.title}
          onChange={(event) => onChange({ title: event.target.value })}
        />
      </label>
      <label className={draftFieldClassName}>
        Assigned agent
        <SelectControl
          value={value.assignedAgentId}
          onChange={(assignedAgentId) => onChange({ assignedAgentId })}
        >
          <option value="" disabled>
            Select an agent
          </option>
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
          value={value.instruction}
          onChange={(event) => onChange({ instruction: event.target.value })}
        />
      </label>
      <label className={draftFieldClassName}>
        Expected output
        <textarea
          className={cn(draftTextareaClassName, 'min-h-20')}
          value={value.expectedOutput}
          onChange={(event) => onChange({ expectedOutput: event.target.value })}
        />
      </label>
      <DraftPriorityControl
        value={value.priority}
        onChange={(priority) => onChange({ priority })}
      />
    </>
  )
}
