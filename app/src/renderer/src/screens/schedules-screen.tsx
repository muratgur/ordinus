import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CalendarClock, Plus, RefreshCw, Trash2, Zap } from 'lucide-react'
import type { Agent, AgentSchedule, WorkRequest } from '@shared/contracts'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@renderer/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { Switch } from '@renderer/components/ui/switch'

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
  }
}

function humanizeSchedule(schedule: AgentSchedule): string {
  if (schedule.runAt && !schedule.cron) {
    return `Once at ${new Date(schedule.runAt).toLocaleString()}`
  }
  if (schedule.cron) return `Cron: ${schedule.cron}`
  return '—'
}

function formatDateTime(value: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString()
}

function disableReasonLabel(schedule: AgentSchedule): string | null {
  if (schedule.enabled) return null
  switch (schedule.disableReason) {
    case 'failures':
      return `Auto-disabled after ${schedule.consecutiveFailures} failed fires`
    case 'wr_archived':
      return 'Linked Work Request was archived'
    case 'manual':
    case null:
    default:
      return 'Disabled'
  }
}

export function SchedulesScreen(): React.JSX.Element {
  const [schedules, setSchedules] = useState<AgentSchedule[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [requests, setRequests] = useState<WorkRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [busyId, setBusyId] = useState('')

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
    void load()
    const off = window.ordinus.schedules.onChanged(() => {
      void load(true)
    })
    return off
  }, [load])

  const agentsById = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents])
  const requestsById = useMemo(() => new Map(requests.map((r) => [r.id, r])), [requests])

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

  async function remove(schedule: AgentSchedule): Promise<void> {
    if (!window.confirm(`Delete schedule "${schedule.name}"?`)) return
    setBusyId(schedule.id)
    try {
      await window.ordinus.schedules.delete({ id: schedule.id })
      await load(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete schedule.')
    } finally {
      setBusyId('')
    }
  }

  const enabledSchedules = schedules.filter((s) => s.enabled)
  const disabledSchedules = schedules.filter((s) => !s.enabled)

  return (
    <div className="space-y-4 py-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarClock className="size-5 text-primary" />
          <h1 className="text-lg font-semibold leading-tight tracking-tight">Schedules</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => void load()}>
            <RefreshCw className="size-4" />
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)} disabled={agents.length === 0}>
            <Plus className="size-4" /> New schedule
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active</CardTitle>
          <CardDescription>
            {enabledSchedules.length} enabled schedule{enabledSchedules.length === 1 ? '' : 's'}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : enabledSchedules.length === 0 ? (
            <div className="text-sm text-muted-foreground">No active schedules yet.</div>
          ) : (
            <ScheduleTable
              schedules={enabledSchedules}
              agentsById={agentsById}
              requestsById={requestsById}
              busyId={busyId}
              onToggle={toggleEnabled}
              onFire={fireNow}
              onDelete={remove}
            />
          )}
        </CardContent>
      </Card>

      {disabledSchedules.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Disabled</CardTitle>
          </CardHeader>
          <CardContent>
            <ScheduleTable
              schedules={disabledSchedules}
              agentsById={agentsById}
              requestsById={requestsById}
              busyId={busyId}
              onToggle={toggleEnabled}
              onFire={fireNow}
              onDelete={remove}
            />
          </CardContent>
        </Card>
      ) : null}

      <CreateScheduleDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        agents={agents}
        requests={requests}
        onCreated={() => {
          setCreateOpen(false)
          void load(true)
        }}
      />
    </div>
  )
}

interface ScheduleTableProps {
  schedules: AgentSchedule[]
  agentsById: Map<string, Agent>
  requestsById: Map<string, WorkRequest>
  busyId: string
  onToggle: (s: AgentSchedule) => void
  onFire: (s: AgentSchedule) => void
  onDelete: (s: AgentSchedule) => void
}

function ScheduleTable({
  schedules,
  agentsById,
  requestsById,
  busyId,
  onToggle,
  onFire,
  onDelete
}: ScheduleTableProps): React.JSX.Element {
  return (
    <div className="divide-y">
      {schedules.map((schedule) => {
        const agent = agentsById.get(schedule.agentId)
        const linkedRequest = schedule.linkedWorkRequestId
          ? requestsById.get(schedule.linkedWorkRequestId)
          : null
        const disabledLabel = disableReasonLabel(schedule)
        return (
          <div
            key={schedule.id}
            className="grid grid-cols-[1fr_auto] items-center gap-3 py-3 first:pt-0 last:pb-0"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="font-medium leading-tight">{schedule.name}</div>
                <Badge variant="secondary" className="text-xs">
                  {agent ? agent.name : 'Missing agent'}
                </Badge>
                {linkedRequest ? (
                  <Badge variant="outline" className="text-xs">
                    WR: {linkedRequest.title}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs">
                    Lazy WR
                  </Badge>
                )}
                {schedule.lastRunStatus === 'failed' ? (
                  <Badge variant="failed" className="text-xs">
                    Last failed
                  </Badge>
                ) : null}
              </div>
              <div className="text-xs text-muted-foreground">
                {humanizeSchedule(schedule)} · TZ {schedule.timezone}
              </div>
              <div className="text-xs text-muted-foreground">
                Next: {formatDateTime(schedule.nextRunAt)} · Last:{' '}
                {formatDateTime(schedule.lastRunAt)}
              </div>
              {disabledLabel ? (
                <div className="text-xs text-amber-600">{disabledLabel}</div>
              ) : null}
            </div>
            <div className="flex items-center gap-1">
              <Switch
                checked={schedule.enabled}
                disabled={busyId === schedule.id}
                onCheckedChange={() => onToggle(schedule)}
                aria-label={schedule.enabled ? 'Disable' : 'Enable'}
              />
              <Button
                variant="ghost"
                size="icon"
                disabled={busyId === schedule.id}
                onClick={() => onFire(schedule)}
                title="Fire now"
              >
                <Zap className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                disabled={busyId === schedule.id}
                onClick={() => onDelete(schedule)}
                title="Delete"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        )
      })}
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
  const activeAgents = useMemo(
    () => agents.filter((a) => a.enabled && !a.archivedAt),
    [agents]
  )
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
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
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
              className="min-h-[88px] w-full rounded-md border bg-background px-2 py-1 text-sm"
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
            <div className="rounded-md border bg-muted/30 p-2 text-sm">
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
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
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

          {formError ? (
            <div className="text-xs text-destructive">{formError}</div>
          ) : null}
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
