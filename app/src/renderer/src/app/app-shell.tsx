import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Moon, RefreshCcw, Settings, Sun } from 'lucide-react'
import type { DbStatus, SetupStatus } from '@shared/contracts'
import { appNavigation } from './routes'
import { appRoutePaths } from './routes'
import { Toaster } from '@renderer/components/ui/sonner'
import { cn } from '@renderer/lib/utils'

type AppShellProps = {
  dbStatus: DbStatus | null
  setupStatus: SetupStatus | null
  loading: boolean
  workboardPlanReady: boolean
  onRefreshStatus: () => void
}

type ThemeMode = 'light' | 'dark'

export function AppShell({
  loading,
  workboardPlanReady,
  onRefreshStatus
}: AppShellProps): React.JSX.Element {
  const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme())

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    window.localStorage.setItem('ordinus-theme', theme)
  }, [theme])

  function toggleTheme(): void {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/92 backdrop-blur-md">
        <div className="mx-auto flex h-12 w-full max-w-screen-2xl items-stretch px-5">
          {/* Logo */}
          <NavLink
            to="/home"
            className="mr-6 flex shrink-0 items-center gap-2 transition-opacity hover:opacity-80"
            aria-label="Ordinus home"
          >
            <span className="flex size-6 items-center justify-center rounded-md bg-primary">
              <svg
                width="13"
                height="13"
                viewBox="0 0 13 13"
                fill="none"
                stroke="white"
                strokeWidth="1.75"
                strokeLinecap="round"
              >
                <circle cx="6.5" cy="6.5" r="4.5" />
                <line x1="2" y1="6.5" x2="11" y2="6.5" />
                <line x1="6.5" y1="2" x2="6.5" y2="11" />
              </svg>
            </span>
            <span className="text-[13px] font-bold uppercase tracking-[.07em] text-foreground">
              Ordinus
            </span>
          </NavLink>

          {/* Modül linkleri */}
          <nav className="flex flex-1 items-stretch gap-0 overflow-x-auto" aria-label="Primary">
            {appNavigation.map((item) => (
              <NavLink
                key={item.id}
                to={item.path}
                className={({ isActive }) =>
                  cn(
                    'relative flex shrink-0 items-center gap-1.5 px-3 text-[12.5px] font-medium transition-colors',
                    isActive
                      ? 'text-foreground after:absolute after:bottom-0 after:left-3 after:right-3 after:h-[2px] after:rounded-t-sm after:bg-primary after:content-[""]'
                      : 'text-muted-foreground hover:text-foreground'
                  )
                }
              >
                <item.icon className="size-3.5 shrink-0" />
                {item.label}
                {item.id === 'workboard' && workboardPlanReady ? (
                  <span className="rounded-full bg-primary px-1.5 py-px text-[10px] font-semibold leading-none text-primary-foreground">
                    ready
                  </span>
                ) : null}
              </NavLink>
            ))}
          </nav>

          {/* Utility aksiyonlar */}
          <div className="flex shrink-0 items-center gap-1 pl-4">
            <NavLink
              to={appRoutePaths.settings}
              className={({ isActive }) =>
                cn(
                  'flex size-[30px] items-center justify-center rounded-md border border-transparent transition-colors',
                  isActive
                    ? 'border-border bg-accent text-foreground'
                    : 'text-muted-foreground hover:border-border hover:bg-accent hover:text-foreground'
                )
              }
              aria-label="Settings"
            >
              <Settings className="size-3.5" />
            </NavLink>

            <button
              type="button"
              onClick={onRefreshStatus}
              disabled={loading}
              aria-label="Refresh status"
              className="flex size-[30px] items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-accent hover:text-foreground disabled:opacity-40"
            >
              <RefreshCcw className={cn('size-3.5', loading && 'animate-spin')} />
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              aria-pressed={theme === 'dark'}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              className="flex size-[30px] items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-accent hover:text-foreground"
            >
              {theme === 'dark' ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-screen-2xl flex-col px-5">
        <Outlet />
      </div>

      <Toaster
        theme={theme}
        position="top-center"
        closeButton
        visibleToasts={4}
        offset={{ top: 56 }}
      />
    </main>
  )
}

function getInitialTheme(): ThemeMode {
  const savedTheme = window.localStorage.getItem('ordinus-theme')
  if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
