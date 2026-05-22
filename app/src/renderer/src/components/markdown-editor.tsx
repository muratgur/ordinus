import type { JSX } from 'react'
import { useRef } from 'react'
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  SquareCode
} from 'lucide-react'
import { Button } from '@renderer/components/ui/button'

type EditResult = { value: string; selectionStart: number; selectionEnd: number }

type ToolbarAction = {
  key: string
  label: string
  icon: JSX.Element
  apply: (value: string, start: number, end: number) => EditResult
}

const toolbarActions: ToolbarAction[] = [
  { key: 'bold', label: 'Bold', icon: <Bold />, apply: wrap('**', '**', 'bold text') },
  { key: 'italic', label: 'Italic', icon: <Italic />, apply: wrap('*', '*', 'italic text') },
  { key: 'h1', label: 'Heading 1', icon: <Heading1 />, apply: linePrefix('# ') },
  { key: 'h2', label: 'Heading 2', icon: <Heading2 />, apply: linePrefix('## ') },
  { key: 'h3', label: 'Heading 3', icon: <Heading3 />, apply: linePrefix('### ') },
  { key: 'ul', label: 'Bullet list', icon: <List />, apply: linePrefix('- ') },
  { key: 'ol', label: 'Numbered list', icon: <ListOrdered />, apply: numberedList },
  { key: 'quote', label: 'Quote', icon: <Quote />, apply: linePrefix('> ') },
  { key: 'link', label: 'Link', icon: <LinkIcon />, apply: insertLink },
  { key: 'code', label: 'Inline code', icon: <Code />, apply: wrap('`', '`', 'code') },
  {
    key: 'codeblock',
    label: 'Code block',
    icon: <SquareCode />,
    apply: wrap('```\n', '\n```', 'code')
  }
]

export function MarkdownEditor({
  value,
  onChange
}: {
  value: string
  onChange: (next: string) => void
}): JSX.Element {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function runAction(action: ToolbarAction): void {
    const textarea = textareaRef.current
    if (!textarea) return

    const result = action.apply(value, textarea.selectionStart, textarea.selectionEnd)
    onChange(result.value)
    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(result.selectionStart, result.selectionEnd)
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-0.5 border-b bg-card px-2 py-1.5">
        {toolbarActions.map((action) => (
          <Button
            key={action.key}
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            title={action.label}
            onClick={() => runAction(action)}
          >
            {action.icon}
            <span className="sr-only">{action.label}</span>
          </Button>
        ))}
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        className="min-h-0 flex-1 resize-none bg-background px-6 py-5 font-mono text-[13px] leading-6 text-foreground outline-none"
        placeholder="Markdown content"
      />
    </div>
  )
}

function wrap(
  prefix: string,
  suffix: string,
  placeholder: string
): (value: string, start: number, end: number) => EditResult {
  return (value, start, end) => {
    const selected = value.slice(start, end) || placeholder
    return {
      value: `${value.slice(0, start)}${prefix}${selected}${suffix}${value.slice(end)}`,
      selectionStart: start + prefix.length,
      selectionEnd: start + prefix.length + selected.length
    }
  }
}

function linePrefix(prefix: string): (value: string, start: number, end: number) => EditResult {
  return (value, start, end) => {
    const lineStart = value.lastIndexOf('\n', start - 1) + 1
    const block = value.slice(lineStart, end)
    const prefixed = block
      .split('\n')
      .map((line) => `${prefix}${line}`)
      .join('\n')
    return {
      value: `${value.slice(0, lineStart)}${prefixed}${value.slice(end)}`,
      selectionStart: lineStart,
      selectionEnd: lineStart + prefixed.length
    }
  }
}

function numberedList(value: string, start: number, end: number): EditResult {
  const lineStart = value.lastIndexOf('\n', start - 1) + 1
  const block = value.slice(lineStart, end)
  const prefixed = block
    .split('\n')
    .map((line, index) => `${index + 1}. ${line}`)
    .join('\n')
  return {
    value: `${value.slice(0, lineStart)}${prefixed}${value.slice(end)}`,
    selectionStart: lineStart,
    selectionEnd: lineStart + prefixed.length
  }
}

function insertLink(value: string, start: number, end: number): EditResult {
  const label = value.slice(start, end) || 'link text'
  const snippet = `[${label}](url)`
  const urlStart = start + label.length + 3
  return {
    value: `${value.slice(0, start)}${snippet}${value.slice(end)}`,
    selectionStart: urlStart,
    selectionEnd: urlStart + 3
  }
}
