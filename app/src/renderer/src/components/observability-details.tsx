import type React from 'react'

export function DiagnosticBlock({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="rounded-md border bg-background p-3">
      <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
      <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 ordinus-scrollbar">
        {children}
      </pre>
    </div>
  )
}
