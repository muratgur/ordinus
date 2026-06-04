import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarClock, Plus, Users } from 'lucide-react'
import type { Agent, AgentSchedule, WorkRequest } from '@shared/contracts'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { agentColor } from '@renderer/lib/agent-color'
import { useThemeMode } from '@renderer/hooks/use-theme-mode'
import { useTickingNow } from '@renderer/hooks/use-ticking-now'
import { appRoutePaths } from '@renderer/app/routes'
import { AgentScheduleGroup } from './schedules/agent-schedule-group'
import { WhatsNextStrip } from './schedules/whats-next-strip'
import { ScheduleSkeleton } from './schedules/schedule-skeleton'
import { DeleteScheduleDialog } from './schedules/delete-schedule-dialog'

type PresetKey = 'once' | 'daily' | 'weekly' | 'hourly' | 'advanced'

interface ScheduleFormState {
  agentId: string
  name: string
  prompt: string
  preset: PresetKey
  runAtDate: string
  runAtTime: string
  dailyTime: string
  weeklyTime: string
  weeklyDays: number[]
  hourlyEvery: number
  advancedCron: string
  linkedWorkRequestId: string
}

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const COLLAPSE_PREFIX = 'ordinus.schedules.collapsed:'

function defaultFormState(agentId: string): ScheduleFormState {
  const now = new Date()
  const isoDate = now.toISOString().slice(0, 10)
  return {
    agentId,
    name: '',
    prompt: '',
    preset: 'daily',
    runAtDate: isoDate,
    runAtTime: '09:00',
    dailyTime: '09:00',
    weeklyTime: '09:00',
    weeklyDays: [1],
    hourlyEvery: 4,
    advancedCron: '',
    linkedWorkRequestId: ''
  }
}

function buildExpression(form: ScheduleFormState): { cron: string | null; runAt: string | null } {
  switch (form.preset) {
    case 'once': {
      const iso = new Date(`${form.runAtDate}T${form.runAtTime}:00`).toISOString()
      return { cron: null, runAt: iso }
    }
    case 'daily': {
      const [h, m] = form.dailyTime.split(':').map((n) => parseInt(n, 10))
      return { cron: `${m} ${h} * * *`, runAt: null }
    }
    case 'weekly': {
      const [h, m] = form.weeklyTime.split(':').map((n) => parseInt(n, 10))
      const days = form.weeklyDays.length ? form.weeklyDays.join(',') : '1'
      return { cron: `${m} ${h} * * ${days}`, runAt: null }
    }
    case 'hourly': {
      const n = Math.max(1, Math.min(23, form.hourlyEvery))
      return { cron: `0 */${n} * * *`, runAt: null }
    }
    case 'advanced':
      return { cron: form.advancedCron.trim() || null, runAt: null }
    default: {
      const _exhaustive: never = form.preset
      throw new Error(`Unhandled preset: ${String(_exhaustive)}`)
    }
  }
}

function writeCollapsed(agentId: string, collapsed: boolean): void {
  try {
    window.localStorage.setItem(COLLAPSE_PREFIX + agentId, collapsed ? '1' : '0')
  } catch {
    // ignore
  }
}

export function SchedulesScreen(): React.JSX.Element {
  const [schedules, setSchedules] = useState<AgentSchedule[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [requests, setRequests] = useState<WorkRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [showSkeleton, setShowSkeleton] = useState(false)
  const [error, setError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [deleting, setDeleting] = useState<AgentSchedule | null>(null)
  const [defaultAgentId, setDefaultAgentId] = useState<string | undefined>(undefined)
  const [busyId, setBusyId] = useState('')
  const [collapsedMap, setCollapsedMap] = useState<Record<string, boolean>>({})
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const collapsedInitialized = useRef(false)
  const navigate = useNavigate()
  const theme = useThemeMode()

  // Tick cadence driven by upcoming fires.
  const nextTargets = useMemo(
    () =>
      schedules
        .filter((s) => s.enabled && s.nextRunAt)
        .map((s) => new Date(s.nextRunAt as string).getTime())
        .filter((t) => Number.isFinite(t)),
    [schedules]
  )
  const now = useTickingNow(nextTargets)

  const load = useCallback(async (quiet = false): Promise<void> => {
    if (!quiet) setLoading(true)
    try {
      const [s, a, w] = await Promise.all([
        window.ordinus.schedules.list(),
        window.ordinus.agents.list(),
        window.ordinus.workboard.list()
      ])
      setSchedules(s)
      setAgents(a)
      setRequests(w.requests)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load schedules.')
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) void load()
    })
    const off = window.ordinus.schedules.onChanged(() => {
      void load(true)
    })
    return () => {
      cancelled = true
      off()
    }
  }, [load])

  // Skeleton only shows up if loading exceeds 600ms, avoiding a flash on quick
  // fetches.
  useEffect(() => {
    if (!loading) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot reset when loading completes
      setShowSkeleton(false)
      return
    }
    const t = window.setTimeout(() => setShowSkeleton(true), 600)
    return () => window.clearTimeout(t)
  }, [loading])

  const agentsById = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents])

  // Agents that have at least one schedule, plus any pinned active agents (so
  // the user can add to a colleague that doesn't have anything yet).
  const groupedAgents = useMemo(() => {
    const byAgent = new Map<string, AgentSchedule[]>()
    for (const s of schedules) {
      const list = byAgent.get(s.agentId) ?? []
      list.push(s)
      byAgent.set(s.agentId, list)
    }
    const ids = new Set<string>(byAgent.keys())
    for (const a of agents) {
      if (a.enabled && !a.archivedAt && a.pinnedAt) ids.add(a.id)
    }
    const sorted = [...ids]
      .map((id) => ({ agent: agentsById.get(id) ?? null, schedules: byAgent.get(id) ?? [], id }))
      .sort((a, b) => {
        const aPin = a.agent?.pinnedAt ? 1 : 0
        const bPin = b.agent?.pinnedAt ? 1 : 0
        if (aPin !== bPin) return bPin - aPin
        const an = a.agent?.name ?? ''
        const bn = b.agent?.name ?? ''
        return an.localeCompare(bn)
      })
    return sorted
  }, [schedules, agents, agentsById])

  // Default-collapse rules (S2a + S7f):
  //  ≤5 agents: all expanded
  //  >5: pinned + agents with a fire in the next 48h expanded; otherwise first 3.
  useEffect(() => {
    if (collapsedInitialized.current) return
    if (loading) return
    if (groupedAgents.length === 0) {
      collapsedInitialized.current = true
      return
    }
    const next: Record<string, boolean> = {}
    const cutoff = Date.now() + 48 * 3_600_000
    const hasSoonFire = (list: AgentSchedule[]): boolean =>
      list.some((s) => {
        if (!s.enabled || !s.nextRunAt) return false
        const t = new Date(s.nextRunAt).getTime()
        return !Number.isNaN(t) && t <= cutoff
      })
    let openedFallback = 0
    for (const { id, agent, schedules: list } of groupedAgents) {
      const stored = window.localStorage.getItem(COLLAPSE_PREFIX + id)
      if (stored != null) {
        next[id] = stored === '1'
        continue
      }
      if (groupedAgents.length <= 5) {
        next[id] = false
        continue
      }
      const shouldOpen = Boolean(agent?.pinnedAt) || hasSoonFire(list)
      next[id] = !shouldOpen
      if (shouldOpen) openedFallback++
    }
    // If >5 and nothing was opened (no pin, no near fires), open first 3.
    if (groupedAgents.length > 5 && openedFallback === 0) {
      let i = 0
      for (const { id } of groupedAgents) {
        if (i >= 3) break
        if (window.localStorage.getItem(COLLAPSE_PREFIX + id) == null) {
          next[id] = false
          i++
        }
      }
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot init from groupedAgents + localStorage
    setCollapsedMap(next)
    collapsedInitialized.current = true
  }, [groupedAgents, loading])

  function toggleCollapse(agentId: string): void {
    setCollapsedMap((prev) => {
      const nextVal = !prev[agentId]
      writeCollapsed(agentId, nextVal)
      return { ...prev, [agentId]: nextVal }
    })
  }

  function openCreate(agentId?: string): void {
    setDefaultAgentId(agentId)
    setCreateOpen(true)
  }

  async function toggleEnabled(schedule: AgentSchedule): Promise<void> {
    setBusyId(schedule.id)
    try {
      await window.ordinus.schedules.setEnabled({ id: schedule.id, enabled: !schedule.enabled })
      await load(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update schedule.')
    } finally {
      setBusyId('')
    }
  }

  async function fireNow(schedule: AgentSchedule): Promise<void> {
    setBusyId(schedule.id)
    try {
      await window.ordinus.schedules.fireNow({ id: schedule.id })
      await load(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not fire schedule.')
    } finally {
      setBusyId('')
    }
  }

  async function confirmDelete(schedule: AgentSchedule): Promise<void> {
    setBusyId(schedule.id)
    try {
      await window.ordinus.schedules.delete({ id: schedule.id })
      setDeleting(null)
      await load(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete schedule.')
    } finally {
      setBusyId('')
    }
  }

  function focusSchedule(schedule: AgentSchedule): void {
    setCollapsedMap((prev) => {
      if (prev[schedule.agentId]) {
        writeCollapsed(schedule.agentId, false)
        return { ...prev, [schedule.agentId]: false }
      }
      return prev
    })
    setHighlightId(schedule.id)
    window.setTimeout(() => setHighlightId(null), 1100)
  }

  const hasAnyAgent = agents.length > 0
  const activeAgents = useMemo(() => agents.filter((a) => a.enabled && !a.archivedAt), [agents])

  return (
    <div className="space-y-5 py-6">
      {error ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <span className="truncate">{error}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 text-destructive hover:text-destructive"
            onClick={() => void load()}
          >
            Retry
          </Button>
        </div>
      ) : null}

      {loading && showSkeleton ? <ScheduleSkeleton /> : null}

      {!loading && !hasAnyAgent ? (
        <EmptyNoAgents onGo={() => navigate(appRoutePaths.agents)} />
      ) : null}

      {!loading && hasAnyAgent ? (
        <>
          {groupedAgents.length === 0 ? (
            <EmptyNoSchedules onAdd={() => openCreate(undefined)} />
          ) : (
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <WhatsNextStrip
                  schedules={schedules}
                  agentsById={agentsById}
                  agentColorFor={(id) => agentColor(id, theme).dot}
                  now={now}
                  onSelect={focusSchedule}
                />
              </div>
              <Button
                size="sm"
                onClick={() => openCreate(undefined)}
                disabled={activeAgents.length === 0}
                className="shrink-0"
              >
                <Plus className="size-4" /> New schedule
              </Button>
            </div>
          )}
          {groupedAgents.length === 0 ? null : (
            <div className="space-y-3">
              {groupedAgents.map(({ id, agent, schedules: list }) => (
                <AgentScheduleGroup
                  key={id}
                  agent={agent}
                  schedules={list}
                  busyId={busyId}
                  agentColor={agentColor(id, theme).dot}
                  variant="standalone"
                  collapsed={collapsedMap[id] ?? false}
                  highlightId={highlightId}
                  now={now}
                  onToggleCollapse={() => toggleCollapse(id)}
                  onAdd={() => openCreate(id)}
                  onFire={(s) => void fireNow(s)}
                  onToggle={(s) => void toggleEnabled(s)}
                  onDelete={(s) => setDeleting(s)}
                />
              ))}
            </div>
          )}
        </>
      ) : null}

      <CreateScheduleDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        agents={agents}
        requests={requests}
        defaultAgentId={defaultAgentId}
        onCreated={() => {
          setCreateOpen(false)
          void load(true)
        }}
      />

      <DeleteScheduleDialog
        schedule={deleting}
        busy={Boolean(deleting && busyId === deleting.id)}
        onClose={() => setDeleting(null)}
        onConfirm={(s) => void confirmDelete(s)}
      />
    </div>
  )
}

function EmptyNoAgents({ onGo }: { onGo: () => void }): React.JSX.Element {
  return (
    <div className="grid place-items-center gap-3 rounded-lg border border-dashed border-border/60 bg-card shadow-sm px-6 py-12 text-center">
      <CalendarClock className="size-8 text-muted-foreground/60" />
      <div>
        <p className="text-sm font-medium">No teammates yet</p>
        <p className="mt-1 max-w-xs text-xs text-muted-foreground">
          Schedules live on agents. Add a teammate first.
        </p>
      </div>
      <Button size="sm" onClick={onGo} className="gap-1">
        <Users className="size-3.5" />
        Go to Agents
      </Button>
    </div>
  )
}

function EmptyNoSchedules({ onAdd }: { onAdd: () => void }): React.JSX.Element {
  return (
    <div className="grid place-items-center gap-3 rounded-lg border border-dashed border-border/60 bg-card shadow-sm px-6 py-10 text-center">
      <CalendarClock className="size-7 text-muted-foreground/60" />
      <div>
        <p className="text-sm font-medium">Nothing on anyone&rsquo;s agenda</p>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          Give a teammate a standing time — they&rsquo;ll pick up the work on their own.
        </p>
      </div>
      <Button size="sm" onClick={onAdd} className="gap-1">
        <Plus className="size-3.5" />
        New schedule
      </Button>
    </div>
  )
}

interface CreateScheduleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  agents: Agent[]
  requests: WorkRequest[]
  onCreated: () => void
  defaultAgentId?: string
}

export function CreateScheduleDialog({
  open,
  onOpenChange,
  agents,
  requests,
  onCreated,
  defaultAgentId
}: CreateScheduleDialogProps): React.JSX.Element {
  const activeAgents = useMemo(() => agents.filter((a) => a.enabled && !a.archivedAt), [agents])
  const initialAgentId = defaultAgentId ?? activeAgents[0]?.id ?? ''
  const [form, setForm] = useState<ScheduleFormState>(() => defaultFormState(initialAgentId))
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const wasOpenRef = useRef(open)

  // Reset only on the false→true open transition. Depending on `activeAgents`
  // here would wipe the form whenever the parent polls and produces a new
  // agents array reference — that's the "inputs clear while I'm typing" bug.
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setForm(defaultFormState(defaultAgentId ?? activeAgents[0]?.id ?? ''))
      setFormError('')
    }
    wasOpenRef.current = open
    // activeAgents intentionally excluded — see comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultAgentId])

  const openRequests = useMemo(() => requests.filter((r) => !r.archivedAt), [requests])

  async function submit(): Promise<void> {
    setFormError('')
    if (!form.agentId) return setFormError('Pick an agent.')
    if (!form.name.trim()) return setFormError('Name is required.')
    if (!form.prompt.trim()) return setFormError('Prompt is required.')
    const { cron, runAt } = buildExpression(form)
    if (!cron && !runAt) return setFormError('Provide a schedule expression.')
    setSubmitting(true)
    try {
      await window.ordinus.schedules.create({
        agentId: form.agentId,
        name: form.name.trim(),
        prompt: form.prompt.trim(),
        cron,
        runAt,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        linkedWorkRequestId: form.linkedWorkRequestId || null,
        enabled: true
      })
      onCreated()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not create schedule.')
    } finally {
      setSubmitting(false)
    }
  }

  function toggleWeekday(day: number): void {
    setForm((prev) => ({
      ...prev,
      weeklyDays: prev.weeklyDays.includes(day)
        ? prev.weeklyDays.filter((d) => d !== day)
        : [...prev.weeklyDays, day].sort()
    }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New schedule</DialogTitle>
          <DialogDescription>Run an agent prompt on a recurring schedule.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Agent</label>
            <select
              className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm text-foreground"
              value={form.agentId}
              onChange={(e) => setForm({ ...form, agentId: e.target.value })}
            >
              {activeAgents.length === 0 ? <option value="">No active agents</option> : null}
              {activeAgents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Name</label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Daily PR review"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Prompt</label>
            <textarea
              className="min-h-[88px] w-full rounded-md border border-input bg-card px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground"
              value={form.prompt}
              onChange={(e) => setForm({ ...form, prompt: e.target.value })}
              placeholder="What should the agent do each time?"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Schedule</label>
            <div className="flex gap-1">
              {(['once', 'daily', 'weekly', 'hourly', 'advanced'] as PresetKey[]).map((preset) => (
                <Button
                  key={preset}
                  type="button"
                  size="sm"
                  variant={form.preset === preset ? 'default' : 'outline'}
                  onClick={() => setForm({ ...form, preset })}
                >
                  {preset[0].toUpperCase() + preset.slice(1)}
                </Button>
              ))}
            </div>
            <div className="rounded-md p-1 text-sm">
              {form.preset === 'once' ? (
                <div className="flex gap-2">
                  <Input
                    type="date"
                    value={form.runAtDate}
                    onChange={(e) => setForm({ ...form, runAtDate: e.target.value })}
                  />
                  <Input
                    type="time"
                    value={form.runAtTime}
                    onChange={(e) => setForm({ ...form, runAtTime: e.target.value })}
                  />
                </div>
              ) : null}
              {form.preset === 'daily' ? (
                <Input
                  type="time"
                  value={form.dailyTime}
                  onChange={(e) => setForm({ ...form, dailyTime: e.target.value })}
                />
              ) : null}
              {form.preset === 'weekly' ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1">
                    {weekdayLabels.map((label, idx) => (
                      <Button
                        key={label}
                        type="button"
                        size="sm"
                        variant={form.weeklyDays.includes(idx) ? 'default' : 'outline'}
                        onClick={() => toggleWeekday(idx)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                  <Input
                    type="time"
                    value={form.weeklyTime}
                    onChange={(e) => setForm({ ...form, weeklyTime: e.target.value })}
                  />
                </div>
              ) : null}
              {form.preset === 'hourly' ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Every</span>
                  <Input
                    type="number"
                    min={1}
                    max={23}
                    className="w-20"
                    value={form.hourlyEvery}
                    onChange={(e) =>
                      setForm({ ...form, hourlyEvery: parseInt(e.target.value || '1', 10) })
                    }
                  />
                  <span className="text-xs text-muted-foreground">hours</span>
                </div>
              ) : null}
              {form.preset === 'advanced' ? (
                <Input
                  placeholder="Cron expression (e.g. 0 9 * * 1-5)"
                  value={form.advancedCron}
                  onChange={(e) => setForm({ ...form, advancedCron: e.target.value })}
                />
              ) : null}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Link to Work Request (optional)
            </label>
            <select
              className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm text-foreground"
              value={form.linkedWorkRequestId}
              onChange={(e) => setForm({ ...form, linkedWorkRequestId: e.target.value })}
            >
              <option value="">Lazy: create a new WR on first fire</option>
              {openRequests.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
          </div>

          {formError ? <div className="text-xs text-destructive">{formError}</div> : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={submitting}>
            {submitting ? 'Creating…' : 'Create schedule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
