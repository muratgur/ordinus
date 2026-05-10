import type {
  WorkRun,
  WorkRunActionInput,
  WorkRunCompleteInput,
  WorkRunCreateInput,
  WorkRunDependency,
  WorkRunEvent,
  WorkRunFailInput,
  WorkRunInputSummary
} from '@shared/contracts'
import type { OrdinusDatabase } from '../db/database'

export type WorkRuntimeService = {
  createWorkRun(input: WorkRunCreateInput): WorkRun
  getWorkRun(runId: string): WorkRun
  listWorkRuns(): WorkRun[]
  listRunnableWorkRuns(): WorkRun[]
  startWorkRun(input: WorkRunActionInput): WorkRun
  completeWorkRun(input: WorkRunCompleteInput): WorkRun
  failWorkRun(input: WorkRunFailInput): WorkRun
  cancelWorkRun(input: WorkRunActionInput): WorkRun
  getRequiredInputSummaries(runId: string): WorkRunInputSummary[]
  listWorkRunDependencies(runId: string): WorkRunDependency[]
  listWorkRunEvents(runId: string): WorkRunEvent[]
}

export function createWorkRuntimeService(database: OrdinusDatabase): WorkRuntimeService {
  return {
    createWorkRun(input) {
      return database.createWorkRun(input)
    },
    getWorkRun(runId) {
      return database.getWorkRun(runId)
    },
    listWorkRuns() {
      return database.listWorkRuns()
    },
    listRunnableWorkRuns() {
      return database.listRunnableWorkRuns()
    },
    startWorkRun(input) {
      return database.startWorkRun(input)
    },
    completeWorkRun(input) {
      return database.completeWorkRun(input)
    },
    failWorkRun(input) {
      return database.failWorkRun(input)
    },
    cancelWorkRun(input) {
      return database.cancelWorkRun(input)
    },
    getRequiredInputSummaries(runId) {
      return database.getRequiredInputSummaries(runId)
    },
    listWorkRunDependencies(runId) {
      return database.listWorkRunDependencies(runId)
    },
    listWorkRunEvents(runId) {
      return database.listWorkRunEvents(runId)
    }
  }
}
