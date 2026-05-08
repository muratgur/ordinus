import { Route } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@renderer/components/ui/card'

export function PlannerScreen(): React.JSX.Element {
  return (
    <div className="grid gap-4 py-6">
      <section>
        <h2 className="text-xl font-semibold leading-tight tracking-normal">Planner</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Plan work before assigning it to agents.
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Route className="size-4 text-primary" />
            Work plan
          </CardTitle>
          <CardDescription>
            This area can become a board, outline, or task inspector without changing the global
            shell.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid min-h-[420px] place-items-center rounded-md border bg-accent text-sm text-muted-foreground">
            No plan open
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
