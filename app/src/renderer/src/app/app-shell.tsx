import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Moon, Settings, Sun } from 'lucide-react'
import type { DbStatus, SetupStatus } from '@shared/contracts'
import { appNavigation, ordinusHomeNavItem } from './routes'
import { appRoutePaths } from './routes'
import { Toaster } from '@renderer/components/ui/sonner'
import { cn } from '@renderer/lib/utils'
import { notify } from '@renderer/lib/notifications'

type AppShellProps = {
  dbStatus: DbStatus | null
  setupStatus: SetupStatus | null
  workboardPlanReady: boolean
  planQueue?: React.ReactNode
}

type ThemeMode = 'light' | 'dark'

export function AppShell({ workboardPlanReady, planQueue }: AppShellProps): React.JSX.Element {
  // ADR-029: Home leads the nav. The kill-switch flag was retired after M8
  // ship — Ordinus is unconditionally enabled.
  const navItems = [ordinusHomeNavItem, ...appNavigation]
  const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme())
  const navigate = useNavigate()

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    window.localStorage.setItem('ordinus-theme', theme)
  }, [theme])

  useEffect(() => {
    const off = window.ordinus.schedules.onChanged((event) => {
      if (!event) return
      if (event.kind === 'auto_disabled') {
        void window.ordinus.schedules
          .get({ id: event.scheduleId })
          .then((schedule) => {
            const reason =
              event.reason === 'failures'
                ? `failed ${schedule.consecutiveFailures} times in a row`
                : 'its linked Work Request was archived'
            notify.attention({
              id: `schedule-disabled-${schedule.id}`,
              title: `Schedule disabled: ${schedule.name}`,
              description: `Auto-disabled because ${reason}.`,
              action: {
                label: 'View',
                onClick: () => navigate(appRoutePaths.schedules)
              }
            })
          })
          .catch(() => {
            notify.attention({
              id: `schedule-disabled-${event.scheduleId}`,
              title: 'A schedule was auto-disabled',
              action: {
                label: 'View',
                onClick: () => navigate(appRoutePaths.schedules)
              }
            })
          })
      } else if (event.kind === 'fire_failed') {
        notify.error({
          id: `schedule-fire-failed-${event.scheduleId}`,
          title: 'Schedule failed to fire',
          description: event.error
        })
      }
    })
    return off
  }, [navigate])

  function toggleTheme(): void {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/92 backdrop-blur-md">
        <div className="mx-auto flex h-12 w-full max-w-screen-2xl items-stretch px-5">
          {/* Logo — the front door is Home (ADR-029), not Workboard. */}
          <NavLink
            to={appRoutePaths.home}
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
            {navItems.map((item) => (
              <NavLink
                key={item.id}
                to={item.path}
                className={({ isActive }) =>
                  cn(
                    'relative flex shrink-0 items-center gap-1.5 px-3 text-[12.5px] font-medium transition-colors',
                    isActive
                      ? 'text-foreground after:absolute after:bottom-0 after:left-3 after:right-3 after:h-[2px] after:rounded-t-sm after:bg-primary after:content-[""] motion-safe:after:animate-in motion-safe:after:fade-in motion-safe:after:zoom-in-75 motion-safe:after:duration-200'
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
            {planQueue}
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
