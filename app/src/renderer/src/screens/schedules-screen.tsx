import { CalendarClock } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@renderer/components/ui/card'

export function SchedulesScreen(): React.JSX.Element {
  return (
    <div className="grid gap-4 py-6 lg:grid-cols-[240px_1fr]">
      <aside className="h-fit rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2">
          <CalendarClock className="size-4 text-primary" />
          <h2 className="text-base font-semibold leading-tight tracking-normal">
            Schedule filters
          </h2>
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Filters, saved views, and schedule groups can live here.
        </p>
      </aside>

      <Card>
        <CardHeader>
          <CardTitle>Schedules</CardTitle>
          <CardDescription>Track planned, running, and completed scheduled work.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid min-h-[420px] place-items-center rounded-md border bg-accent text-sm text-muted-foreground">
            No scheduled work yet
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
