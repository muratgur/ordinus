# Implementation Plan — ADR-028 First-Run Onboarding

This plan turns [ADR-028](../decisions/ADR-028-first-run-onboarding-and-managed-cli-install.md)
into concrete, ordered work. Each milestone is independently shippable behind a
feature flag (`app_meta.onboarding_v2 = true`), so the legacy `setup-screen.tsx`
keeps working until M5 retires it.

The visual vocabulary throughout the renderer borrows from
[`agent-creation-flow.tsx`](../../app/src/renderer/src/components/agent-creation-flow.tsx):
top progress dots, centered stage with `motion-safe:fade-in duration-500`, large
title (`text-2xl font-semibold tracking-tight`), subtle muted subtitle, and a
single round 56×56 primary action button at the bottom-center
(`border-2 border-foreground` with arrow icon). It is **not** a dialog — the
onboarding takes the full window, but the inner stage column is the same width
(`max-w-md`) and the same rhythm as the agent-creation modal so the two
experiences feel like siblings.

---

## M1 — CLI managed-install service

Build the install backbone independently of any UI change so it can be tested
in isolation against the existing `setup-screen.tsx`.

### Files

- `app/src/main/paths.ts` — extend `SystemPaths` and `getSystemPaths()`:
  ```ts
  cliPrefix: join(userData, 'cli')         // ~/.ordinus/cli on mac
  cliBin:    join(userData, 'cli', 'node_modules', '.bin')
  ```
- `app/src/main/runtime/cli/install/service.ts` *(new)* — install orchestrator.
  - `installProvider(providerId): AsyncIterable<InstallEvent>` — yields
    `{phase: 'download' | 'extract' | 'link' | 'verify', percent, message}`.
  - Uses Electron's bundled Node to spawn `npm install <pkg> --prefix <cliPrefix>
    --no-audit --no-fund --omit=dev`.
  - Package map (pinned versions, refreshable on Ordinus updates):
    ```
    claude → @anthropic-ai/claude-code
    codex  → @openai/codex
    gemini → @google/gemini-cli
    ```
  - Verification: after install, run `<bin>/<cmd> --version` and parse output.
    Surface any failure as `InstallEvent{phase:'verify', error}`.
- `app/src/main/runtime/cli/install/npm-runner.ts` *(new)* — thin wrapper
  around `spawn(process.execPath, [require.resolve('npm/bin/npm-cli.js'), ...])`
  with progress parsing. On Windows, falls back to `npm.cmd` if the bundled
  resolution fails.
- `app/src/main/runtime/cli/executable.ts` — prepend prefix discovery:
  ```ts
  // Before PATH/`where.exe` lookup:
  const prefixPath = join(getSystemPaths().cliBin, isWin ? `${cmd}.cmd` : cmd)
  if (existsSync(prefixPath)) return normalize({command: prefixPath, shell: isWin})
  ```
  Keeps the existing PATH fallback intact — power users with their own install
  win on the fallback when nothing is in the prefix.

### IPC

Add to `app/src/shared/contracts.ts`:
```ts
export const InstallEventSchema = z.discriminatedUnion('phase', [...])
export const InstallProviderInputSchema = z.object({
  providerId: ProviderIdSchema
})
```

Register in `app/src/main/ipc/register.ts`:
- `cli:install:start` → streams events via a channel-scoped subscription, same
  pattern as existing run-event streaming.

### Tests

- Unit test `executable.ts` prefix-first resolution on both platforms (mock fs).
- Integration test against a fake registry (npm `--registry`) that the install
  succeeds, the binary is callable, and verification passes.

### Out of scope here

- No UI change. The legacy `setup-screen.tsx` keeps using its current
  detection-only Provider step. M3 wires the install flow into the new UI.

---

## M2 — Onboarding state machine + IPC contract

A single state machine owned by main process drives onboarding. The renderer is
a thin view over it. This makes the flow resumable (user closes the app
mid-install, re-opens, picks up exactly where they left off).

### Schema

`app/src/main/db/schema.ts` — extend `app_meta`:
```ts
onboardedAt:      integer('onboarded_at', { mode: 'timestamp' }),
onboardingState:  text('onboarding_state'),  // JSON blob; see below
```

`onboardingState` shape:
```ts
{
  stage: 'welcome' | 'providers' | 'workspace' | 'install' | 'colleague' | 'done',
  selectedProviders: ProviderId[],
  workspace: { root: string, name: string } | null,
  installResults: Record<ProviderId, 'pending' | 'installed' | 'authed' | 'failed'>,
  firstAgentId: string | null
}
```

### IPC surface

New namespace on `window.ordinus.onboarding`:

| Call | Purpose |
|---|---|
| `getStatus()` | Returns current `OnboardingState` plus a `nextStage` hint. |
| `selectProviders({ providers: ProviderId[] })` | Persists selection, advances to `workspace`. |
| `confirmWorkspace({ root, name })` | Validates path exists + is writable, persists, advances to `install`. |
| `installAndAuth()` | Streams `{providerId, event: InstallEvent}` until all selected providers are either `authed` or `failed`. |
| `retryProvider({ providerId })` | Re-runs install + auth for one provider. |
| `completeWithAgent({ profileId? })` | Materializes the first agent (from a profile or blank), sets `onboardedAt`, advances to `done`. |

### App.tsx route gate

Replace the current `setupStatus.ready` gate ([App.tsx:99](app/src/renderer/src/App.tsx)) with:
```ts
if (!onboardingState.onboardedAt) return <OnboardingFlow />
```

Until `onboardedAt` is set, every app launch resumes the in-progress flow at
`onboardingState.stage`.

### Tests

- State-machine unit tests: each transition's preconditions, idempotency of
  `installAndAuth` (calling twice doesn't re-install completed providers).
- Resume test: kill mid-install, restart, verify partial completion is
  remembered.

---

## M3 — First-run UI flow

A single full-screen React component `OnboardingFlow` at
`app/src/renderer/src/screens/onboarding/onboarding-flow.tsx`, mounted from
`App.tsx` when `!onboardedAt`. Internally, five stage components share the
agent-creation visual vocabulary.

### Shell

```tsx
<main className="grid h-screen grid-rows-[auto_minmax(0,1fr)_auto] bg-background">
  <OnboardingProgressDots stage={state.stage} />   {/* 5 dots, top */}
  <section className="flex items-center justify-center px-10 py-6">
    {/* current stage component, max-w-md, fade-in */}
  </section>
  <OnboardingFooter ... />                          {/* round next-button */}
</main>
```

`OnboardingProgressDots` is a 5-dot adaptation of the
[`ProgressDots`](app/src/renderer/src/components/agent-creation-flow.tsx) in
agent-creation. `OnboardingFooter` is a near-copy of `FlowFooter` from the
same file.

### Stage 1 — Welcome

```
        ┌──────────────────────────────────┐
        │                                  │
        │   ✶ (slow soft pulse, 8px)       │
        │                                  │
        │   Build a space for your work.   │   ← text-2xl font-semibold
        │   Bring in colleagues to help.   │   ← text-sm muted-foreground
        │                                  │
        │            ( → )                 │   ← round button
        │                                  │
        └──────────────────────────────────┘
```

No inputs. Enter advances. The pulse element is reused from the
`GreetStage`'s pulse phase pattern.

### Stage 2 — Provider selection

`max-w-md` column with three cards (Claude / Codex / Gemini). Each card:

- 48×48 monogram avatar (provider color, single letter), reusing the
  `AGENT_COLORS` palette mapping.
- Name (`text-base font-semibold`)
- One-line role pitch (`text-xs muted-foreground`)
- Checkmark dot top-right when selected.
- Tap to toggle. Multi-select. Round selection ring on selected cards.

Below the cards, a single-line note:
```
Need a subscription? Anthropic ↗   OpenAI ↗   Google ↗
```
Three small underline-on-hover external links. No pricing copy.

Next button enabled when `selectedProviders.length >= 1`. On click,
`window.ordinus.onboarding.selectProviders(...)` and advance.

### Stage 3 — Workspace

Same column. Two stacked cards of equal weight:

**Card A — proposed default**
```
Use a fresh space
~/Ordinus/                       [ Use this folder → ]
```

**Card B — pick your own**
```
I have a folder in mind
[ Choose folder ]   <-- opens native picker via existing select-folder IPC
```

After either path, an editable `Project name` field appears below
(prefilled from the folder basename). The next button stays disabled until
both root and name are non-empty.

This stage's load-bearing nature (per ADR-028) is the reason for two equally
weighted options instead of a silently-applied default.

### Stage 4 — Install + auth

The screen changes character: instead of a single "stage" component it shows
a **vertical checklist** of selected providers. For each:

```
○  Hiring Claude…           45%   [progress bar]
●  Hiring Codex…            Ready
✕  Hiring Gemini…           Couldn't sign in — Try again ↻
```

The dots animate (a slow expand/contract on the active row). Background: a
gentle, very low-amplitude desk-assembling SVG — a horizontal line slowly
filling left-to-right, a small object dropping into place when each row
completes. Reference the existing `motion-safe` Tailwind utilities; no new
animation library.

On `installAndAuth` start, the renderer subscribes to the install event
stream and updates row state in place. Auth opens the provider's browser
flow as today (`provider.authUrl`). When all selected providers finish (any
mix of `authed` / `failed`), the next button activates **iff** at least one
is `authed`.

**Failure UX**

Failed rows expand inline to show three CTAs:

```
Couldn't sign in to Claude.
  • No Anthropic account?   Sign up ↗
  • Wrong plan?             See plans ↗
  • Network issue?          Try again ↻
Or pick another colleague ←
```

The "pick another colleague" link returns to Stage 2 (provider selection)
**without losing the workspace** that was confirmed in Stage 3.

If **every** provider failed, the next button stays disabled — this is the
hard wall from ADR-028.

### Stage 5 — First colleague

```
        Choose your first colleague.

        ╔════════════════════════════════════╗
        ║  ⭐  General Assistant              ║
        ║      Helps with most things.       ║
        ║      Start here if unsure.         ║
        ║                          [ Pick → ]║
        ╚════════════════════════════════════╝

        Or pick a specialist:

        [ Engineer ] [ Writer ] [ Researcher ]
        [ Analyst  ] [ Define your own       ]
```

Default focus + Enter is on the General Assistant card — one keystroke
finishes onboarding.

The specialist row is **profile chips** loaded from `agents.listProfiles()`
(same IPC the existing library drawer uses). "Define your own" opens the
existing `AgentCreationFlow` in-place — when it returns, the created agent
is the first agent and onboarding completes.

On selection: `window.ordinus.onboarding.completeWithAgent({ profileId })`
returns the new `Agent`. We route into that agent's 1:1 home chat (ADR-027)
and unmount the onboarding component. `app_meta.onboardedAt` is set.

### Component tree

```
OnboardingFlow
├── OnboardingProgressDots
├── stage switch
│   ├── WelcomeStage
│   ├── ProvidersStage
│   ├── WorkspaceStage
│   ├── InstallStage      ← subscribes to install events
│   └── ColleagueStage    ← may open <AgentCreationFlow/>
└── OnboardingFooter (round next-button, like FlowFooter)
```

---

## M4 — Install animation + auth failure polish

Split out of M3 because it's tuning work, not structure. Once the checklist
renders correctly with real install events, this milestone makes it feel
intentional rather than mechanical.

- Per-row enter/exit transitions (slide-in from below, 200ms).
- Active row's progress bar uses an indeterminate shimmer while
  `phase === 'download'` (no percent yet), switches to determinate for
  `phase === 'extract' | 'link'`, then a brief check-pop on `verify` success.
- Failure row's inline CTA block is its own subcomponent
  (`<ProviderFailureCard/>`), reused by the retry path from the colleague
  stage if a chosen provider's auth lapses later.
- Copy review pass: every microcopy line in the flow audited against the
  colleague metaphor — "Hiring", "Ready", "Pick another colleague" — no
  word like "install", "package", "binary" appears in user-facing strings.

---

## M5 — Retire legacy setup (partial)

Done in this milestone:

- Deleted `app/src/renderer/src/screens/setup-screen.tsx`.
- Removed the `setupStatus.ready` gate from `App.tsx`; first-run is now
  driven solely by `onboardingStatus.onboardedAt`.
- Dropped the unused `state.entered` flag and `stayOnSetup` plumbing on
  `loadStatus`.

Deferred (Settings refactor — out of scope for ADR-028 cleanup):

- `setup.getStatus()` IPC and the `SetupStatus` type remain. The Settings
  screen still consumes them to render workspace + provider config.
- `runSetupAction`, `selectWorkspaceFolder`, `saveWorkspace`,
  `connectProvider`, `refreshProvider`, `disconnectProvider`,
  `updateSystemDefault` in `App.tsx` are kept — Settings depends on them.

A follow-up plan should migrate Settings off `setup.getStatus()` to use
direct `workspace.*` / `runtime.getProviders()` calls, then retire the
`setup.*` namespace entirely. This is a Settings-area refactor, not an
onboarding concern.

---

## Cross-cutting

### Windows specifics

- npm prefix path uses `app.getPath('userData')` which on Windows is
  `%APPDATA%\Ordinus` — no special-casing needed.
- The bundled-Node fallback to `npm.cmd` (see M1) is the only
  Windows-specific code branch.
- Folder picker (existing IPC) already handles Windows drive paths; the
  workspace stage doesn't need changes.

### Telemetry hooks (future)

Each onboarding stage transition is a natural event boundary. Add an
`onboardingState.stageHistory: {stage, at}[]` field now so future telemetry
can answer "where do users drop off?" without a schema migration.

### Failure modes to verify

1. User closes the window during install → resume picks up correctly.
2. npm install hits a strict-proxy corporate network → the raw npm error is
   surfaced in the failure CTA block; an "Use my own CLI install" link
   appears (escape hatch to point at PATH binary).
3. User selects 3 providers, only Claude succeeds, picks "Engineer" profile
   that defaults to Codex → `completeWithAgent` either swaps to the
   successful provider or surfaces an error before completion. Decision:
   swap. The agent is editable in Settings; the user can change provider
   after onboarding.
4. Native module ABI mismatch on a CLI's transitive dependency → install
   verify fails, failure CTA includes "Report this issue ↗".

### Sequencing & flag

- M1 ships first, dark — exercised by a hidden dev menu item ("Install
  Claude into prefix") to verify on real machines before any UI.
- M2 + M3 ship together behind `onboarding_v2`.
- M4 lands as polish PRs.
- M5 flips the flag and deletes the legacy path in a single PR.
