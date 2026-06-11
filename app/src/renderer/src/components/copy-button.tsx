// Shared copy affordance (polish pass). One grammar everywhere: a quiet icon
// that flips to a ✓ for a moment after copying. Most surfaces reveal it on
// container hover (`opacity-0 group-hover:opacity-100` via className), so the
// affordance stays invisible until the user reaches for it.

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { copyTextToClipboard } from '@renderer/lib/clipboard'
import { cn } from '@renderer/lib/utils'

function useCopyFeedback(getValue: () => string): { copied: boolean; copy: () => void } {
  const [copied, setCopied] = useState(false)

  async function copy(): Promise<void> {
    const copiedNow = await copyTextToClipboard(getValue())
    setCopied(copiedNow)
    if (copiedNow) window.setTimeout(() => setCopied(false), 1400)
  }

  return { copied, copy: () => void copy() }
}

export function CopyButton({
  text,
  label = 'Copy',
  className,
  iconClassName
}: {
  /** The value to copy; pass a function to defer building it until click. */
  text: string | (() => string)
  label?: string
  className?: string
  iconClassName?: string
}): React.JSX.Element {
  const { copied, copy } = useCopyFeedback(() => (typeof text === 'function' ? text() : text))

  return (
    <button
      type="button"
      aria-label={copied ? 'Copied' : label}
      title={copied ? 'Copied' : label}
      onClick={copy}
      className={cn(
        'rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        className
      )}
    >
      {copied ? (
        <Check
          className={cn(
            'size-3.5 text-status-completed motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-200',
            iconClassName
          )}
        />
      ) : (
        <Copy className={cn('size-3.5', iconClassName)} />
      )}
    </button>
  )
}
