import { NavLink, Outlet } from 'react-router-dom'
import { RefreshCcw } from 'lucide-react'
import type { DbStatus, SetupStatus } from '@shared/contracts'
import { appNavigation, utilityNavigation } from './routes'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'

type AppShellProps = {
  dbStatus: DbStatus | null
  setupStatus: SetupStatus | null
  loading: boolean
  onRefreshStatus: () => void
}

export function AppShell({ loading, onRefreshStatus }: AppShellProps): React.JSX.Element {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-6 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <NavLink
              to="/home"
              className="text-[22px] font-semibold leading-none tracking-normal text-foreground transition-colors hover:text-primary"
            >
              Ordinus
            </NavLink>

            <div className="flex flex-wrap items-center gap-2">
              {utilityNavigation.map((item) => (
                <NavLink
                  key={item.id}
                  to={item.path}
                  className={({ isActive }) =>
                    cn(
                      'inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors',
                      isActive
                        ? 'border-primary/20 bg-primary-soft text-foreground'
                        : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground',
                      'size-10 justify-center px-0'
                    )
                  }
                >
                  <item.icon className="size-4" />
                  <span className="sr-only">{item.label}</span>
                </NavLink>
              ))}

              <Button variant="outline" size="icon" onClick={onRefreshStatus} disabled={loading}>
                <RefreshCcw className={loading ? 'animate-spin' : ''} />
                <span className="sr-only">Refresh status</span>
              </Button>
            </div>
          </div>

          <nav
            className="flex gap-1 overflow-x-auto rounded-lg border bg-card p-1"
            aria-label="Primary"
          >
            {appNavigation.map((item) => (
              <NavLink
                key={item.id}
                to={item.path}
                className={({ isActive }) =>
                  cn(
                    'inline-flex h-9 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary-soft text-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  )
                }
              >
                <item.icon className="size-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <div className="mx-auto flex min-h-[calc(100vh-7rem)] w-full max-w-6xl flex-col px-6">
        <Outlet />
      </div>
    </main>
  )
}
