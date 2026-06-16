# ADR-051: Dev Data Profiles — `real` And `scratch` userData Isolation

## Status

Accepted

## Date

2026-06-16

## Context

Ordinus is developed and used by the same person on the same machine, and that person
runs the app **only** via `npm run dev` (electron-vite dev) — there is no separately
installed packaged app in daily use. This collapses two intents onto one storage
location.

Both `npm run dev` and any packaged build resolve every piece of durable state from a
single root, `app.getPath('userData')` (`~/Library/Application Support/Ordinus` on
macOS), through one helper
([`getSystemPaths()`](../../app/src/main/paths.ts)):

- `ordinus.db` (the SQLite database)
- `agents/`, `skills-library/` (agent homes and skill folders)
- `runtime/` (provider homes — Claude/Codex/Gemini auth and sessions)
- `local-mcp/` (managed connector runtimes, packages, sessions)
- `connector-credentials.json` (the encrypted vault)
- `logs/`, `cli/`

There is **no environment separation whatsoever**. The consequence is the reported
pain: when the developer wipes data to start a clean experiment, they destroy their
**real** working data too, because real data and experimental data live in the same
directory. The two activities are mutually destructive.

The workspace folder (where `Conversations/`, `Projects/`, `Schedules/`, `Ordinus/`
files are written) is a special case: it lives **outside** userData at a user-chosen
absolute path stored in the DB (`workspace_config.workspaceRoot`,
[`schema.ts`](../../app/src/main/db/schema.ts)) and is read fresh on every call to
[`getWorkspaceConfig()`](../../app/src/main/db/database.ts). Any data-isolation scheme
that clones or shares the DB must also account for the workspace, or an experimental
session will write files into the real workspace.

The developer's actual workflows, elicited during design:

1. **Test changes against real data** — run dev with the real, accumulated data.
2. **Throwaway experimentation** — enter random/garbage data just to try something,
   without risk to real data.
3. **Reset** — wipe experimental data freely, *without ever* touching real data.

A key clarification during design: the experimental environment must be **persistent
but separate** — it starts empty the first time and continues from wherever it was left
on subsequent runs. There is **no desire to copy or seed from real data**; the
experimental environment is set up once (its own login + workspace) and remembered.
"To be able to try, I need my existing data" is satisfied not by copying real data, but
by the experimental environment persisting its own state across runs.

## Decision

Introduce **two named data profiles selected at launch by an environment variable**,
`ORDINUS_PROFILE`, each backed by a completely separate userData root. No copying, no
sharing, full isolation.

### 1. `real` is the default and is left exactly where it is today

When `ORDINUS_PROFILE` is unset or `real`, the app does nothing new: userData stays at
the current `~/Library/Application Support/Ordinus`. There is **no migration** — the
developer's existing data stays in place and `npm run dev` behaves byte-for-byte as it
does today. `real` is the protected profile: it has no script-driven wipe path (see §4).

### 2. `scratch` is a sibling userData root, fully isolated

When `ORDINUS_PROFILE=scratch`, the very first thing the main process does (before the
database singleton is constructed) is redirect userData to a **sibling** directory,
`~/Library/Application Support/Ordinus-scratch`, via `app.setPath('userData', …)`.
Because every durable path flows through `getSystemPaths()` → `app.getPath('userData')`,
this single redirect isolates the **entire** tree — db, agents, runtime, local-mcp,
vault, logs, cli — with no per-subsystem change.

A sibling directory (not a subfolder of the real root) is chosen so that:
- the scratch tree can never be mistaken for, or walked into by, code that scans the
  real root, and
- `scratch:reset` can `rm -rf` one self-contained directory with no risk of clipping
  real data.

### 3. `scratch` starts empty, persists across runs, and never copies from `real`

The first `npm run dev:scratch` run lands on an empty `Ordinus-scratch` and goes
through normal first-run onboarding (provider login + workspace pick) — this one-time
setup is explicitly **accepted** as the price of total isolation. Every subsequent
scratch run resumes from that persisted state. Nothing is ever copied or symlinked from
`real`; the two profiles share nothing. The scratch workspace is therefore also a
separate, scratch-owned folder picked during scratch onboarding, so scratch file writes
can never reach the real workspace.

### 4. Reset targets `scratch` only

`npm run scratch:reset` deletes the entire `Ordinus-scratch` directory (the app must be
closed; the script warns rather than fighting a locked DB/WAL). **There is no
script-level reset for `real`** — it is precious and must not have a one-command wipe.
If the developer ever truly wants to reset real data, they delete the directory by hand,
deliberately.

### 5. The active profile is visible

When running `scratch`, the window title becomes `Ordinus — SCRATCH` and the renderer
shows a small colored profile badge. In `real`, nothing changes. This prevents the two
visually-identical sessions from being confused — entering real data thinking it is
scratch, or vice versa. The renderer learns the profile through the existing
app-status IPC surface.

### 6. Selection is via npm scripts

- `npm run dev` → `real` (no env var; unchanged).
- `npm run dev:scratch` → sets `ORDINUS_PROFILE=scratch` then `electron-vite dev`.
- `npm run scratch:reset` → deletes the scratch userData directory.

## Alternatives Considered

### Arbitrary named profiles (`real` + unlimited named scratches)

- Pros: Could keep several independent sandboxes (demo, telegram-test, …).
- Cons: Needs a selection mechanism richer than two npm scripts, plus naming/lifecycle
  management.
- Rejected: The developer wants exactly two buckets. Two fixed profiles cover every
  stated workflow; a sandbox is reset rather than accumulated. Can be revisited if a
  real need for multiple sandboxes appears (the env var already generalizes — a future
  ADR could let `ORDINUS_PROFILE=<name>` map to `Ordinus-<name>`).

### Seed/clone scratch from real (copy DB ± full userData on demand)

- Pros: A scratch that starts as a working copy of real data is realistic to test
  against.
- Cons: Copying the encrypted vault, provider sessions, and a potentially multi-GB
  workspace is slow and large, and the DB's stored `workspaceRoot` would point scratch
  at the real workspace unless rewritten — a sharp footgun.
- Rejected: The developer explicitly does **not** want copying. A persistent scratch
  set up once delivers the same end value (data already present to experiment on)
  without the cost or the workspace-pollution hazard.

### Distinguish environments by app name / `productName` per build

- Pros: Electron would derive distinct userData roots automatically.
- Cons: Changing `app.setName`/`productName` ripples into bundle identifiers, the
  vault's OS-keychain entry, window/app identity, and dock/menu naming. Daily use is
  `npm run dev`, not a packaged build, so there is nothing to re-brand.
- Rejected: Heavier and riskier than one `app.setPath` call; touches identity surfaces
  for no benefit here.

### In-app "Reset data" button scoped to the active profile

- Pros: No terminal needed; one button that wipes whichever profile you are in.
- Cons: Puts a destructive control inside the running app and, if it ever fired in
  `real`, would wipe real data — exactly the failure mode this ADR exists to remove.
- Rejected: Keep the wipe out-of-app and scratch-only. The command name (`scratch:reset`)
  makes the target unmistakable.

### Move both profiles under a `profiles/` subfolder

- Pros: Tidier on-disk layout.
- Cons: Requires migrating existing real data on first run — an avoidable, risky
  one-time move for zero functional gain.
- Rejected: `real` stays put (no migration); only `scratch` diverges.

## Consequences

### Code

- A tiny profile resolver runs at the very top of
  [`index.ts`](../../app/src/main/index.ts), **before** `new OrdinusDatabase()` (which
  reads userData in its constructor) and after `app.setName('Ordinus')`: it reads
  `ORDINUS_PROFILE`, and for `scratch` calls `app.setPath('userData', <sibling>)`. This
  is the single chokepoint; `getSystemPaths()` and every consumer inherit it unchanged.
- `app/package.json` gains `dev:scratch` and `scratch:reset` scripts (root passthrough
  added so `npm run dev:scratch` works from the repo root, matching the existing
  `dev`/`build` passthrough). A portable env-var setter (e.g. `cross-env`) is used if not
  already present, so the scripts work cross-platform.
- The active profile is exposed to the renderer via the existing app-status IPC and the
  window title is suffixed in `scratch`; the renderer renders a profile badge.
- `scratch:reset` is a small Node script that resolves the same sibling path and removes
  it, refusing/ warning if the scratch app appears to be running.

### Product / behavior

- `npm run dev` is unchanged — zero risk to existing real data.
- Resetting experimental data (`scratch:reset`) can no longer destroy real data.
- The two sessions are visually distinguishable, removing the "which one am I in?"
  hazard.
- Scratch's one-time onboarding (login + workspace) is the accepted cost of full
  isolation; thereafter it persists.

### Risk / maintenance

- The profile redirect must stay ahead of the database construction in `index.ts`; a
  future reorder that constructs the DB earlier would silently break isolation. The
  resolver is placed immediately after `app.setName` with a comment to that effect.
- The encrypted vault under scratch is a *separate* file; in dev the vault already falls
  back to base64 when OS encryption is unavailable, so scratch credentials work
  independently of real.
- `cli/` and `local-mcp/` runtimes are re-provisioned per profile (they are large but
  regenerable); this is accepted. If their footprint becomes a concern, a future ADR
  could share read-only runtime binaries across profiles.

## Implementation Plan

1. **Profile resolver + redirect.** Add `resolveDataProfile()` (reads `ORDINUS_PROFILE`,
   returns `'real' | 'scratch'`) and, in [`index.ts`](../../app/src/main/index.ts),
   immediately after `app.setName('Ordinus')` and before `new OrdinusDatabase()`,
   redirect userData to the `Ordinus-scratch` sibling when the profile is `scratch`.
2. **npm scripts.** Add `dev:scratch` and `scratch:reset` to `app/package.json` (+ root
   passthrough). Use a portable env setter for cross-platform safety.
3. **`scratch:reset` script.** A Node script that computes the sibling userData path and
   `rm -rf`s it, with a "close the app first" guard.
4. **Profile visibility.** Suffix the window title with `— SCRATCH` in scratch; surface
   the profile on the app-status IPC; render a small badge in the renderer.

### Verification

- `npm run dev` → confirm userData is the existing root and real data is intact.
- `npm run dev:scratch` → confirm a fresh `Ordinus-scratch` appears, onboarding runs,
  and real data is untouched; enter throwaway data, restart scratch, confirm it
  persists.
- `npm run scratch:reset` (app closed) → confirm `Ordinus-scratch` is gone and the next
  scratch run is empty again, while real remains untouched.
- Confirm the window title/badge reflect the active profile.

## Implementation status

- **Implemented.**
  - Profile resolver + userData redirect: `app/src/main/profile.ts`
    (`resolveDataProfile`/`applyDataProfile`/`getActiveProfile`), called in
    `app/src/main/index.ts` immediately after `app.setName` and before the DB singleton.
  - Window marker: scratch pins the `Ordinus — SCRATCH` window title via a
    `page-title-updated` guard in `index.ts`.
  - Profile surfaced to the renderer through `AppInfo.profile`
    (`app/src/shared/contracts.ts`, `appGetInfo` handler in `ipc/register.ts`); badge
    rendered by `app/src/renderer/src/components/scratch-profile-badge.tsx` (mounted in
    `App.tsx`).
  - Scripts: `dev:scratch` (cross-env) and `scratch:reset`
    (`app/scripts/reset-scratch.mjs`) in `app/package.json`, with root passthrough.
  - **Onboarding fresh-space proposal (isolation fix).** The "Use a fresh space"
    default in `onboarding-flow.tsx` previously stripped the userData basename and
    re-appended a hardcoded `/Ordinus`, so under `scratch` it proposed the *real*
    profile's directory — a direct isolation breach (picking it would write scratch's
    workspace into real data). Fixed to use `paths.userData` verbatim, which is already
    profile-correct (`…/Ordinus` vs `…/Ordinus-scratch`). This was the one realistic
    vector for a real path to enter the empty scratch DB; with it closed, no runtime
    workspace-override guard is needed under the zero-copy model.
  - Verified: `typecheck` + `eslint` clean; `scratch:reset` resolves the sibling path
    and no-ops when absent. Not yet exercised end-to-end via a live `npm run dev:scratch`
    GUI launch.
