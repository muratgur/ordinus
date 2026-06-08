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

// ADR-029 §10 — First-run welcome panel "seen" flag. Pure UI nicety (no DB
// migration): the welcome overlay shows once, the first time a freshly
// onboarded user lands on Home, then never auto-opens again. The user can
// still re-open it manually from the Home header affordance — that does NOT
// clear this flag.
const homeWelcomeSeenStorageKey = 'ordinus.home.welcome-seen'

export function readHomeWelcomeSeen(): boolean {
  try {
    return window.localStorage.getItem(homeWelcomeSeenStorageKey) === 'true'
  } catch {
    // On storage failure, treat as "seen" so we never trap the user behind an
    // overlay that can't record its own dismissal.
    return true
  }
}

export function writeHomeWelcomeSeen(seen: boolean): void {
  try {
    window.localStorage.setItem(homeWelcomeSeenStorageKey, String(seen))
  } catch {
    /* localStorage unavailable */
  }
}
