type DetailRowProps = {
  label: string
  value: string
}

export function DetailRow({ label, value }: DetailRowProps): React.JSX.Element {
  return (
    <div className="grid gap-1">
      <dt className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
        {label}
      </dt>
      <dd className="break-all rounded-md bg-accent px-2 py-1.5 font-mono text-xs leading-5">
        {value}
      </dd>
    </div>
  )
}
