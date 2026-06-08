// ADR-029 §8 / M5 — Ordinus input box with slash-command autocomplete.
//
// Bottom-pinned textarea + send. Status indicator (when busy) sits ABOVE the
// input as a separate row — not inside the transcript — per ADR §8. The
// slash-command autocomplete panel (M5) hangs above the input on the same
// principle: focused floating UI that doesn't pollute the transcript.
//
// Keyboard model:
//   Enter (no slash panel open) → send
//   Enter (slash panel open, args not yet started) → accept highlighted
//   ArrowUp/Down (panel open) → move highlight
//   Tab (panel open) → accept highlighted (Codex-style)
//   Esc (panel open) → close panel, keep input
//   Shift+Enter → newline (never sends)

import { useRef, useState } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { filterSlashCommands, type SlashCommandDefinition } from './slash-commands'
import { SlashAutocomplete } from './slash-autocomplete'

export type HomeInputProps = {
  onSend: (text: string) => void
  busy: boolean
  /** When set, renders a small "doing X" line above the input. */
  statusLabel?: string
  /** Disables the entire input — e.g. while loading singleton config. */
  disabled?: boolean
  placeholder?: string
  /**
   * Visual variant:
   *   - 'docked' (default): bottom-pinned bar with a top border + backdrop.
   *     Used inside the active-conversation layout.
   *   - 'hero': standalone card with rounded corners and a heavier shadow.
   *     Used inside the empty-state hero stack so the input is the focal
   *     element on the page.
   */
  variant?: 'docked' | 'hero'
}

const MAX_HEIGHT_PX = 200

export function HomeInput(props: HomeInputProps): React.JSX.Element {
  const [text, setText] = useState('')
  const [rawAutocompleteIndex, setAutocompleteIndex] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const trimmed = text.trim()
  const canSend = !props.busy && !props.disabled && trimmed.length > 0

  // Recompute matches per render — cheap (5 commands).
  const matches: SlashCommandDefinition[] = filterSlashCommands(text)
  const showAutocomplete = matches.length > 0
  // Clamp the highlight inline rather than via an effect: when the match
  // set shrinks past the current selection we just project down. Avoids a
  // setState-in-effect anti-pattern.
  const autocompleteIndex = Math.min(rawAutocompleteIndex, Math.max(matches.length - 1, 0))

  function autosize(el: HTMLTextAreaElement): void {
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`
  }

  function selectSlashCommand(command: SlashCommandDefinition): void {
    const next = `/${command.name} `
    setText(next)
    setAutocompleteIndex(0)
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus()
        autosize(textareaRef.current)
        // Park the caret at the end of the inserted text so the user can
        // immediately type args.
        textareaRef.current.selectionStart = next.length
        textareaRef.current.selectionEnd = next.length
      }
    })
  }

  function handleSend(): void {
    if (!canSend) return
    props.onSend(trimmed)
    setText('')
    setAutocompleteIndex(0)
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.focus()
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.nativeEvent.isComposing) return

    if (showAutocomplete) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setAutocompleteIndex((current) => (current + 1) % matches.length)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setAutocompleteIndex((current) => (current - 1 + matches.length) % matches.length)
        return
      }
      if (event.key === 'Tab' || (event.key === 'Enter' && !event.shiftKey)) {
        event.preventDefault()
        const target = matches[autocompleteIndex]
        if (target) selectSlashCommand(target)
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        // Clear the leading `/` so the panel closes; user can keep typing
        // their plain message if they meant to abandon the command.
        setText('')
        setAutocompleteIndex(0)
        return
      }
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSend()
    }
  }

  // Variant styling: docked is used inside the active-conversation section
  // card. The parent section already has `rounded-md border bg-card`, so we
  // only add a top divider and inner padding — no backdrop blur, no extra
  // border, no card chrome. Hero is the centered empty-state focal element
  // and gets the prominent rounded shadow + ring.
  const variant = props.variant ?? 'docked'
  const outerClass = variant === 'docked' ? 'border-t px-4 py-3' : ''
  const inputBoxClass =
    variant === 'docked'
      ? 'flex items-end gap-2 rounded-md border bg-background px-3 py-2 shadow-sm focus-within:ring-1 focus-within:ring-ring'
      : 'flex items-end gap-2 rounded-2xl border bg-background px-4 py-3 shadow-lg focus-within:ring-2 focus-within:ring-ring/60'

  return (
    <div className={outerClass}>
      <div className="mx-auto w-full max-w-3xl">
        {props.statusLabel ? (
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>{props.statusLabel}</span>
          </div>
        ) : null}
        {showAutocomplete ? (
          <SlashAutocomplete
            matches={matches}
            highlightIndex={autocompleteIndex}
            onSelect={selectSlashCommand}
            onHover={setAutocompleteIndex}
          />
        ) : null}
        <div className={inputBoxClass}>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(event) => {
              setText(event.target.value)
              autosize(event.target)
            }}
            onKeyDown={handleKeyDown}
            placeholder={props.placeholder ?? 'Message Ordinus…  type / for shortcuts'}
            rows={1}
            className={
              variant === 'hero'
                ? 'flex-1 resize-none bg-transparent text-base leading-7 placeholder:text-muted-foreground focus:outline-none'
                : 'flex-1 resize-none bg-transparent text-sm leading-6 placeholder:text-muted-foreground focus:outline-none'
            }
            disabled={props.disabled}
            spellCheck
          />
          <Button
            type="button"
            size="sm"
            onClick={handleSend}
            disabled={!canSend}
            className={variant === 'hero' ? 'h-9 shrink-0 gap-1 px-4' : 'h-8 shrink-0 gap-1 px-3'}
          >
            <Send className="h-3.5 w-3.5" />
            Send
          </Button>
        </div>
      </div>
    </div>
  )
}
