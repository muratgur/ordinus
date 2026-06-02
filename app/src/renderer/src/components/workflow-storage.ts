// localStorage-backed view state for the Workflows screen. Mirrors Workboard's
// convention of keeping convenience UI state out of the durable design (ADR-026).

const sidebarDockedStorageKey = 'ordinus-workflows-sidebar-docked'
// Workboard reads these on mount, so writing them lets a run-history click
// deep-link straight into the matching request.
const workboardActiveRequestKey = 'ordinus-workboard-active-request'
const workboardShowArchivedKey = 'ordinus-workboard-show-archived'

const lastTargetStorageKey = (designId: string): string =>
  `ordinus-workflow-last-target-${designId}`

const viewportStorageKey = (designId: string): string => `ordinus-workflow-viewport-${designId}`

export interface SavedViewport {
  x: number
  y: number
  zoom: number
}

export function readSidebarDocked(): boolean {
  try {
    return window.localStorage.getItem(sidebarDockedStorageKey) !== 'false'
  } catch {
    return true
  }
}

export function writeSidebarDocked(docked: boolean): void {
  try {
    window.localStorage.setItem(sidebarDockedStorageKey, String(docked))
  } catch {
    /* localStorage unavailable */
  }
}

/** Per-workflow Run target memory. Returns a requestId for append, or null for new. */
export function readLastTargetRequestId(designId: string): string | null {
  try {
    return window.localStorage.getItem(lastTargetStorageKey(designId))
  } catch {
    return null
  }
}

export function writeLastTargetRequestId(designId: string, requestId: string | null): void {
  try {
    if (requestId) {
      window.localStorage.setItem(lastTargetStorageKey(designId), requestId)
    } else {
      window.localStorage.removeItem(lastTargetStorageKey(designId))
    }
  } catch {
    /* localStorage unavailable */
  }
}

/** Per-workflow canvas camera (pan + zoom). Returns null when unset or malformed. */
export function readViewport(designId: string): SavedViewport | null {
  try {
    const raw = window.localStorage.getItem(viewportStorageKey(designId))
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as SavedViewport).x === 'number' &&
      typeof (parsed as SavedViewport).y === 'number' &&
      typeof (parsed as SavedViewport).zoom === 'number'
    ) {
      const { x, y, zoom } = parsed as SavedViewport
      return { x, y, zoom }
    }
    return null
  } catch {
    return null
  }
}

export function writeViewport(designId: string, viewport: SavedViewport): void {
  try {
    window.localStorage.setItem(viewportStorageKey(designId), JSON.stringify(viewport))
  } catch {
    /* localStorage unavailable */
  }
}

export function deepLinkToRequest(requestId: string, archived: boolean): void {
  try {
    window.localStorage.setItem(workboardActiveRequestKey, requestId)
    if (archived) {
      window.localStorage.setItem(workboardShowArchivedKey, 'true')
    }
  } catch {
    /* localStorage unavailable */
  }
}
