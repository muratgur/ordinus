import { MessageSquareText, Users } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@renderer/components/ui/card'

export function GroupChatScreen(): React.JSX.Element {
  return (
    <div className="grid gap-4 py-6 xl:grid-cols-[240px_1fr_260px]">
      <aside className="h-fit rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2">
          <MessageSquareText className="size-4 text-primary" />
          <h2 className="text-base font-semibold leading-tight tracking-normal">Rooms</h2>
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Group sessions will appear here.
        </p>
      </aside>

      <Card>
        <CardHeader>
          <CardTitle>Group Chat</CardTitle>
          <CardDescription>Coordinate with multiple agents in one shared thread.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex min-h-[420px] items-center justify-center rounded-md border bg-accent text-sm text-muted-foreground">
            No group chat selected
          </div>
        </CardContent>
      </Card>

      <aside className="h-fit rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-primary" />
          <h2 className="text-base font-semibold leading-tight tracking-normal">Participants</h2>
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Roles and shared context will live here.
        </p>
      </aside>
    </div>
  )
}
