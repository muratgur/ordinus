import { Cron } from 'croner'
import type { AgentSchedule, SchedulerEvent } from '@shared/contracts'
import type { OrdinusDatabase } from '../db/database'

export type StartRequestRunsFn = (requestId: string) => void

export type SchedulerNotifier = (event: SchedulerEvent) => void

interface ScheduleJob {
  cron: Cron
  scheduleId: string
}

export class SchedulerService {
  private readonly jobs = new Map<string, ScheduleJob>()
  private oneShotTimers = new Map<string, NodeJS.Timeout>()
  private started = false

  constructor(
    private readonly database: OrdinusDatabase,
    private readonly startRequestRuns: StartRequestRunsFn,
    private readonly notify: SchedulerNotifier = () => {}
  ) {}

  start(): void {
    if (this.started) return
    this.started = true
    this.runCatchUp()
    this.rescheduleAll()
  }

  stop(): void {
    if (!this.started) return
    this.started = false
    for (const { cron } of this.jobs.values()) cron.stop()
    this.jobs.clear()
    for (const timer of this.oneShotTimers.values()) clearTimeout(timer)
    this.oneShotTimers.clear()
  }

  refresh(scheduleId?: string): void {
    if (!this.started) return
    if (scheduleId) {
      this.disposeJob(scheduleId)
      try {
        const schedule = this.database.getAgentSchedule({ id: scheduleId })
        if (schedule.enabled) this.installJob(schedule)
      } catch {
        // schedule deleted — nothing to install
      }
      return
    }
    this.rescheduleAll()
  }

  fireNow(scheduleId: string): { runId: string; requestId: string } {
    return this.fireSchedule(scheduleId, { manual: true })
  }

  notifyRunTerminal(runId: string, success: boolean): void {
    const schedule = this.database.findScheduleByRunId(runId)
    if (!schedule) return
    const updated = this.database.recordAgentScheduleOutcome({
      id: schedule.id,
      runId,
      success
    })
    if (!updated.enabled && updated.disableReason === 'failures') {
      this.disposeJob(updated.id)
      this.notify({ kind: 'auto_disabled', scheduleId: updated.id, reason: 'failures' })
    }
  }

  private rescheduleAll(): void {
    for (const id of Array.from(this.jobs.keys())) this.disposeJob(id)
    const schedules = this.database.listAgentSchedules({ enabled: true })
    for (const schedule of schedules) this.installJob(schedule)
  }

  private installJob(schedule: AgentSchedule): void {
    this.disposeJob(schedule.id)

    if (schedule.runAt && !schedule.cron) {
      const fireAt = new Date(schedule.runAt).getTime()
      const delay = fireAt - Date.now()
      if (delay <= 0) {
        // Past one-shot — catch-up already handled or it's a brand-new past target.
        return
      }
      const timer = setTimeout(() => {
        this.oneShotTimers.delete(schedule.id)
        this.fireSchedule(schedule.id, { manual: false })
      }, delay)
      this.oneShotTimers.set(schedule.id, timer)
      return
    }

    if (!schedule.cron) return

    let cron: Cron
    try {
      cron = new Cron(
        schedule.cron,
        { timezone: schedule.timezone, protect: true },
        () => {
          this.fireSchedule(schedule.id, { manual: false })
        }
      )
    } catch (error) {
      this.notify({
        kind: 'fire_failed',
        scheduleId: schedule.id,
        error: `Invalid cron expression: ${(error as Error).message}`
      })
      return
    }

    const next = cron.nextRun()
    this.database.updateAgentSchedule({
      id: schedule.id,
      nextRunAt: next ? next.toISOString() : null
    })
    this.jobs.set(schedule.id, { cron, scheduleId: schedule.id })
  }

  private disposeJob(scheduleId: string): void {
    const job = this.jobs.get(scheduleId)
    if (job) {
      job.cron.stop()
      this.jobs.delete(scheduleId)
    }
    const timer = this.oneShotTimers.get(scheduleId)
    if (timer) {
      clearTimeout(timer)
      this.oneShotTimers.delete(scheduleId)
    }
  }

  private fireSchedule(
    scheduleId: string,
    options: { manual: boolean }
  ): { runId: string; requestId: string } {
    const firedAt = new Date().toISOString()
    try {
      const schedule = this.database.getAgentSchedule({ id: scheduleId })
      if (!schedule.enabled && !options.manual) {
        return { runId: '', requestId: '' }
      }

      if (schedule.linkedWorkRequestId) {
        const request = this.database.getWorkRequest(schedule.linkedWorkRequestId)
        if (request.archivedAt) {
          this.database.setAgentScheduleEnabled({ id: schedule.id, enabled: false })
          this.database.updateAgentSchedule({ id: schedule.id, nextRunAt: null })
          this.disposeJob(schedule.id)
          this.notify({ kind: 'auto_disabled', scheduleId: schedule.id, reason: 'wr_archived' })
          return { runId: '', requestId: '' }
        }
      }

      const { runId, requestId } = this.database.createScheduleFireRun(scheduleId)
      const nextRunAt = computeNextRunAt({
        cron: schedule.cron,
        runAt: null,
        timezone: schedule.timezone
      })
      this.database.recordAgentScheduleFire({
        id: schedule.id,
        firedAt,
        runId,
        linkedWorkRequestId: requestId,
        nextRunAt
      })
      // One-shot schedules (no cron) have no future fire after this one. Close
      // the lifecycle so they leave the active list instead of sitting forever
      // with nextRunAt=null.
      if (!schedule.cron && !nextRunAt) {
        this.database.markAgentScheduleCompleted(schedule.id)
        this.disposeJob(schedule.id)
      }
      this.startRequestRuns(requestId)
      this.notify({ kind: 'fired', scheduleId: schedule.id, runId, requestId })
      return { runId, requestId }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.notify({ kind: 'fire_failed', scheduleId, error: message })
      throw error
    }
  }

  private runCatchUp(): void {
    const now = Date.now()
    const schedules = this.database.listAgentSchedules({ enabled: true })
    for (const schedule of schedules) {
      if (!schedule.nextRunAt) continue
      const due = new Date(schedule.nextRunAt).getTime()
      if (Number.isFinite(due) && due <= now) {
        try {
          this.fireSchedule(schedule.id, { manual: false })
        } catch {
          // notify already emitted
        }
      }
    }
  }

}

export function computeNextRunAt(input: {
  cron?: string | null
  runAt?: string | null
  timezone: string
}): string | null {
  if (input.cron) {
    try {
      const next = new Cron(input.cron, { timezone: input.timezone }).nextRun()
      return next ? next.toISOString() : null
    } catch {
      return null
    }
  }
  if (input.runAt) return input.runAt
  return null
}
