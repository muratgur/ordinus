// ADR-029 §5 / M5 — `/` autocomplete panel.
//
// Floats above the input when the user is typing a slash-prefixed token (and
// hasn't yet started args). Arrow keys move selection, Enter accepts (inserts
// `/cmd ` and closes), Esc closes. The Home input owns keyboard routing; this
// component just renders the list with the externally-controlled highlight.

import type { SlashCommandDefinition } from './slash-commands'

export type SlashAutocompleteProps = {
  matches: ReadonlyArray<SlashCommandDefinition>
  highlightIndex: number
  onSelect: (command: SlashCommandDefinition) => void
  onHover: (index: number) => void
}

export function SlashAutocomplete(props: SlashAutocompleteProps): React.JSX.Element | null {
  if (props.matches.length === 0) return null
  return (
    <div className="mb-2 overflow-hidden rounded-lg border bg-popover shadow-lg">
      <ul className="max-h-64 overflow-y-auto py-1 text-sm">
        {props.matches.map((cmd, index) => (
          <li key={cmd.name}>
            <button
              type="button"
              onMouseDown={(event) => {
                // Prevent the input from losing focus before our select fires.
                event.preventDefault()
                props.onSelect(cmd)
              }}
              onMouseEnter={() => props.onHover(index)}
              className={`flex w-full items-baseline gap-3 px-3 py-2 text-left transition-colors ${
                index === props.highlightIndex
                  ? 'bg-accent text-accent-foreground'
                  : 'text-foreground hover:bg-accent/40'
              }`}
            >
              <span className="font-mono text-sm">{cmd.label}</span>
              <span className="flex-1 text-xs text-muted-foreground">{cmd.hint}</span>
              <span className="hidden text-[11px] text-muted-foreground/80 sm:block">
                {cmd.argsHint}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
