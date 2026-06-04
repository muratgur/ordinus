import type { AgentSchedule } from '@shared/contracts'

const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function pad2(value: string | number): string {
  return String(value).padStart(2, '0')
}

export type CadenceKind = 'once' | 'daily' | 'weekly' | 'hourly' | 'advanced'

export interface CadenceInfo {
  kind: CadenceKind
  label: string
  weeklyDays?: number[]
}

function describeWeeklyDays(dayOfWeek: string): { label: string; days: number[] } | null {
  if (dayOfWeek === '1-5') return { label: 'Mon–Fri', days: [1, 2, 3, 4, 5] }
  if (dayOfWeek === '0,6' || dayOfWeek === '6,0') return { label: 'Sat–Sun', days: [0, 6] }
  if (dayOfWeek === '*') return { label: 'Every day', days: [0, 1, 2, 3, 4, 5, 6] }
  if (/^\d$/.test(dayOfWeek)) {
    const d = Number(dayOfWeek)
    return { label: WEEKDAYS_LONG[d], days: [d] }
  }
  if (/^[0-6](,[0-6])+$/.test(dayOfWeek)) {
    const days = dayOfWeek
      .split(',')
      .map((s) => Number(s))
      .sort((a, b) => a - b)
    const label = days.map((d) => WEEKDAYS_SHORT[d]).join(', ')
    return { label, days }
  }
  return null
}

export function humanizeCadence(schedule: AgentSchedule): CadenceInfo {
  if (schedule.runAt && !schedule.cron) {
    const d = new Date(schedule.runAt)
    if (Number.isNaN(d.getTime())) {
      return { kind: 'once', label: `Once · ${schedule.runAt}` }
    }
    const label = d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
    return { kind: 'once', label: `Once · ${label}` }
  }
  const cron = schedule.cron?.trim() ?? ''
  if (!cron) return { kind: 'advanced', label: '—' }

  const parts = cron.split(/\s+/)
  if (parts.length !== 5) return { kind: 'advanced', label: cron }
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts

  // Hourly: 0 */N * * *
  const hourlyEvery = /^\*\/(\d+)$/.exec(hour)
  if (
    hourlyEvery &&
    /^\d+$/.test(minute) &&
    dayOfMonth === '*' &&
    month === '*' &&
    dayOfWeek === '*'
  ) {
    return { kind: 'hourly', label: `Every ${hourlyEvery[1]}h` }
  }

  // Every N minutes
  const everyMinutes = /^\*\/(\d+)$/.exec(minute)
  if (everyMinutes && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return { kind: 'hourly', label: `Every ${everyMinutes[1]}m` }
  }

  // Hourly at :MM
  if (
    /^\d+$/.test(minute) &&
    hour === '*' &&
    dayOfMonth === '*' &&
    month === '*' &&
    dayOfWeek === '*'
  ) {
    return { kind: 'hourly', label: `Hourly at :${pad2(minute)}` }
  }

  // Time-based patterns
  if (!/^\d+$/.test(minute) || !/^\d+$/.test(hour)) {
    return { kind: 'advanced', label: cron }
  }
  const time = `${pad2(hour)}:${pad2(minute)}`

  if (dayOfMonth === '*' && month === '*') {
    if (dayOfWeek === '*') return { kind: 'daily', label: `Daily · ${time}` }
    const w = describeWeeklyDays(dayOfWeek)
    if (w) return { kind: 'weekly', label: `${w.label} · ${time}`, weeklyDays: w.days }
  }
  if (dayOfWeek === '*' && month === '*' && /^\d+$/.test(dayOfMonth)) {
    return { kind: 'advanced', label: `Monthly · day ${dayOfMonth} · ${time}` }
  }
  return { kind: 'advanced', label: cron }
}

// Format the time-until/since `target` from `now`, in a way that doesn't
// twitch every second. Callers tick at adaptive cadences (see useTickingNow).
export function humanizeRelative(target: Date | string | null, now: Date = new Date()): string {
  if (!target) return '—'
  const d = typeof target === 'string' ? new Date(target) : target
  if (Number.isNaN(d.getTime())) return '—'
  const diffMs = d.getTime() - now.getTime()
  const abs = Math.abs(diffMs)
  const past = diffMs < 0

  if (abs < 10_000) return past ? 'just now' : 'firing now…'
  if (abs < 60_000) return past ? '<1m ago' : 'in <1m'
  const mins = Math.round(abs / 60_000)
  if (mins < 60) return past ? `${mins}m ago` : `in ${mins}m`
  const hours = Math.round(abs / 3_600_000)
  if (hours < 24) return past ? `${hours}h ago` : `in ${hours}h`
  const days = Math.round(abs / 86_400_000)
  if (days < 7) return past ? `${days}d ago` : `in ${days}d`
  // Beyond a week, fall back to absolute short.
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// Absolute short label shown under the relative time.
export function formatAbsolute(target: Date | string | null): string {
  if (!target) return ''
  const d = typeof target === 'string' ? new Date(target) : target
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  }
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  const isTomorrow =
    d.getFullYear() === tomorrow.getFullYear() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getDate() === tomorrow.getDate()
  if (isTomorrow) {
    return `Tomorrow ${d.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit'
    })}`
  }
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// "Europe/Istanbul" -> "İstanbul". Returns null when same as local TZ.
export function humanizeTimezone(tz: string, localTz?: string): string | null {
  const local = localTz ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  if (!tz || tz === local) return null
  const tail = tz.includes('/') ? tz.slice(tz.lastIndexOf('/') + 1) : tz
  return tail.replace(/_/g, ' ')
}
