type SelectControlProps = {
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
}

export function SelectControl({
  value,
  onChange,
  children
}: SelectControlProps): React.JSX.Element {
  return (
    <select
      className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground shadow-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {children}
    </select>
  )
}
