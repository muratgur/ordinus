export function ScheduleSkeleton(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-7 w-32 animate-pulse rounded-full bg-muted/40"
            style={{ animationDelay: `${i * 80}ms` }}
          />
        ))}
      </div>
      {[0, 1].map((g) => (
        <div key={g} className="space-y-2">
          <div className="h-6 w-48 animate-pulse rounded bg-muted/40" />
          <div className="h-10 animate-pulse rounded-md bg-muted/20" />
          <div className="h-10 animate-pulse rounded-md bg-muted/20" />
        </div>
      ))}
    </div>
  )
}
