// ADR-055 — Agents rail view preferences (device-local, persisted).
//
// Department grouping is an opt-in view mode: the rail defaults to the flat,
// status-sorted list so the "who needs me now" signal is never lost. The chosen
// mode and which department sections are collapsed are pure UI preferences, so
// they live in localStorage (per the home/storage.ts idiom), not the database.

export type AgentsViewMode = 'flat' | 'grouped'

const viewModeStorageKey = 'ordinus.agents.view-mode'
const collapsedDepartmentsStorageKey = 'ordinus.agents.collapsed-departments'

export function readAgentsViewMode(): AgentsViewMode {
  try {
    return window.localStorage.getItem(viewModeStorageKey) === 'grouped' ? 'grouped' : 'flat'
  } catch {
    return 'flat'
  }
}

export function writeAgentsViewMode(mode: AgentsViewMode): void {
  try {
    window.localStorage.setItem(viewModeStorageKey, mode)
  } catch {
    /* localStorage unavailable */
  }
}

export function readCollapsedDepartments(): Set<string> {
  try {
    const raw = window.localStorage.getItem(collapsedDepartmentsStorageKey)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed)
      ? new Set(parsed.filter((id): id is string => typeof id === 'string'))
      : new Set()
  } catch {
    return new Set()
  }
}

export function writeCollapsedDepartments(ids: Set<string>): void {
  try {
    window.localStorage.setItem(collapsedDepartmentsStorageKey, JSON.stringify([...ids]))
  } catch {
    /* localStorage unavailable */
  }
}
