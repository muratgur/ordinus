import { NavLink, Outlet } from 'react-router-dom'
import { RefreshCcw } from 'lucide-react'
import type { DbStatus, SetupStatus } from '@shared/contracts'
import { appNavigation } from './routes'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
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
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-5">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-3 py-3">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <div className="min-w-0">
              <h1 className="text-base font-semibold leading-tight tracking-normal">Ordinus</h1>
              <p className="truncate text-xs leading-5 text-muted-foreground">
                {setupStatus?.workspace?.workspaceName ?? 'Workspace'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {setupStatus?.workspaceConfigured ? (
                <Badge variant="completed">Workspace ready</Badge>
              ) : (
                <Badge variant="attention">Setup needs attention</Badge>
              )}
              {dbStatus?.initialized ? <Badge variant="completed">Local state ready</Badge> : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <nav className="flex flex-wrap gap-1" aria-label="Primary">
              {appNavigation.map((item) => (
                <NavLink
                  key={item.id}
                  to={item.path}
                  className={({ isActive }) =>
                    cn(
                      'inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors',
                      isActive
                        ? 'border-primary/20 bg-primary-soft text-foreground'
                        : 'border-transparent bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground'
                    )
                  }
                >
                  <item.icon className="size-4" />
                  {item.label}
                </NavLink>
              ))}
            </nav>

            <Button variant="outline" size="icon" onClick={onRefreshStatus} disabled={loading}>
              <RefreshCcw className={loading ? 'animate-spin' : ''} />
              <span className="sr-only">Refresh status</span>
            </Button>
          </div>
        </header>

        <Outlet />
      </div>
    </main>
  )
}
