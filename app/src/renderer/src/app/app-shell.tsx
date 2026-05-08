import { NavLink, Outlet } from 'react-router-dom'
import { RefreshCcw } from 'lucide-react'
import type { DbStatus, SetupStatus } from '@shared/contracts'
import { appNavigation } from './routes'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Separator } from '@renderer/components/ui/separator'
import { cn } from '@renderer/lib/utils'

type AppShellProps = {
  dbStatus: DbStatus | null
  setupStatus: SetupStatus | null
  loading: boolean
  onRefreshStatus: () => void
}

export function AppShell({
  dbStatus,
  setupStatus,
  loading,
  onRefreshStatus
}: AppShellProps): React.JSX.Element {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-6 py-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Desktop shell</Badge>
              {setupStatus?.workspaceConfigured ? (
                <Badge variant="completed">Workspace ready</Badge>
              ) : null}
              {dbStatus?.initialized ? <Badge variant="completed">Local state ready</Badge> : null}
            </div>
            <div>
              <h1 className="text-[26px] font-semibold leading-tight tracking-normal">Ordinus</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Local-first command center for AI-assisted software work.
              </p>
            </div>
            <nav className="flex flex-wrap gap-2" aria-label="Primary">
              {appNavigation.map((item) => (
                <NavLink
                  key={item.id}
                  to={item.path}
                  className={({ isActive }) =>
                    cn(
                      'inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors',
                      isActive
                        ? 'border-primary/20 bg-primary-soft text-foreground'
                        : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground'
                    )
                  }
                >
                  <item.icon className="size-4" />
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <Button variant="outline" onClick={onRefreshStatus} disabled={loading}>
            <RefreshCcw className={loading ? 'animate-spin' : ''} />
            Refresh
          </Button>
        </header>

        <Separator />

        <Outlet />
      </div>
    </main>
  )
}
