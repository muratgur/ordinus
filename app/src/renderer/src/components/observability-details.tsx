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
      {/* `break-words` alone leaves an unbreakable token — a long registry URL or
          Windows path, exactly what CLI errors are made of — overflowing its box.
          `anywhere` breaks mid-token so nothing is clipped. */}
      <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap font-mono text-xs leading-5 [overflow-wrap:anywhere] ordinus-scrollbar">
        {children}
      </pre>
    </div>
  )
}
