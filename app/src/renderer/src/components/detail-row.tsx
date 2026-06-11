import { CopyButton } from './copy-button'

type DetailRowProps = {
  label: string
  value: string
}

// Diagnostic label/value pair. Values are code-like (paths, versions), so the
// polish pass adds a hover-revealed copy affordance — skipped for the '-'
// placeholder, which isn't worth copying.
export function DetailRow({ label, value }: DetailRowProps): React.JSX.Element {
  const copyable = value.trim().length > 0 && value.trim() !== '-'

  return (
    <div className="group/detail grid gap-1">
      <dt className="flex items-center justify-between gap-2 text-xs font-medium uppercase tracking-normal text-muted-foreground">
        {label}
        {copyable ? (
          <CopyButton
            text={value}
            label={`Copy ${label.toLowerCase()}`}
            className="opacity-0 transition-opacity focus-visible:opacity-100 group-hover/detail:opacity-100"
            iconClassName="size-3"
          />
        ) : null}
      </dt>
      <dd className="select-text break-all rounded-md bg-accent px-2 py-1.5 font-mono text-xs leading-5">
        {value}
      </dd>
    </div>
  )
}
