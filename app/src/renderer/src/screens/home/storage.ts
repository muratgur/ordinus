// ADR-029 M5 UI polish — Home-specific localStorage helpers.
//
// Persistent across navigation, silent on storage failure. Kept as a separate
// key per surface so collapsing the Home sidebar does not change the Workflows
// sidebar.
//
// ADR-029 §8 / P3 — unlike the Workflows sidebar (which defaults docked),
// Home's conversation list *recedes*: it defaults COLLAPSED so the welcoming
// stage stays a pure, focused space for Ordinus rather than a generic
// multi-thread chat rail. The user can summon/dock it from the edge toggle,
// and that choice persists.

const homeSidebarDockedStorageKey = 'ordinus.home.sidebar-docked'

export function readHomeSidebarDocked(): boolean {
  try {
    // Default collapsed: only docked when the user has explicitly opted in.
    return window.localStorage.getItem(homeSidebarDockedStorageKey) === 'true'
  } catch {
    return false
  }
}

export function writeHomeSidebarDocked(docked: boolean): void {
  try {
    window.localStorage.setItem(homeSidebarDockedStorageKey, String(docked))
  } catch {
    /* localStorage unavailable */
  }
}
