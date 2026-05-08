import { Bot, MessageSquareText } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@renderer/components/ui/card'

export function AgentsScreen(): React.JSX.Element {
  return (
    <div className="grid gap-4 py-6 lg:grid-cols-[280px_1fr]">
      <aside className="h-fit rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2">
          <Bot className="size-4 text-primary" />
          <h2 className="text-base font-semibold leading-tight tracking-normal">Agents</h2>
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Agent list and filters will live here.
        </p>
      </aside>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquareText className="size-4 text-primary" />
            Agent workspace
          </CardTitle>
          <CardDescription>
            Select an agent to inspect status, context, and conversation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex min-h-[420px] items-center justify-center rounded-md border bg-accent text-sm text-muted-foreground">
            No agent selected
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
