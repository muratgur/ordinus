# ADR-045: Settings Information Architecture and Copy System

## Status

Proposed

Establishes a shared grammar (layout primitives, copy rules, status vocabulary) for the
Settings surface and resolves several per-section defects. Does not supersede prior ADRs;
it **amends** three:

- **ADR-029 (Ordinus in-app assistant):** resolves the deferred "persona editing — name,
  avatar, extra instructions" open item. The Ordinus **display name is removed** (it was
  never consumed); **extra instructions are wired** into the Ordinus system prompt at
  session init (honoring ADR-029 §6 "once at session init, no per-turn re-injection").
- **ADR-031 (folder-scoped agent isolation):** the workspace **root is no longer
  reselectable from Settings** (read-only). ADR-031's path-policy invariant ("the root can
  still be moved and reselected") remains true at the code level, but the user-facing
  reselection control is withdrawn because changing the root silently relocates every
  existing conversation/run (relative `workingRoot` paths re-resolve under the new root).
- **ADR-028 (first-run onboarding):** the workspace **name** is removed from the onboarding
  flow (dead value); onboarding collects only the folder. Reinforces ADR-028's already-stated
  rejection of "change the workspace anytime."

References ADR-002 (system default provider/model — left intact; only its UI framing is
corrected), ADR-015 (external system connectors), ADR-040 (agent skills system), ADR-041
(managed local MCP servers — born-disabled tool defaults), ADR-043 (Google connector),
ADR-044 (Telegram inbound), and the design language of ADR-033/ADR-039.

## Date

2026-06-14

## Context

The Settings surface works but reads as several screens built at different times. Three
problems compound:

1. **Inconsistent grammar.** Each section uses its own skeleton (Workspace is one form,
   Providers is two panels plus a card list, Connections is a card-row list, Local state is
   read-only cards), its own status wording ("Ready" / "Connected" / "Listening" for what is
   often the same idea), and a 1996-line `settings-screen.tsx` mixes five inline sections
   while three others already live in their own files under `settings/`.

2. **AI-slop copy.** Descriptions oscillate between genuinely useful
   ("Agents can work inside this folder and nowhere above it.") and atmospheric filler that
   conveys no new information ("Ordinus keeps work scoped to this workspace so unrelated
   folders stay out of the flow."). The user cannot always tell **what** a control does or
   **what changes** when they touch it.

3. **Dead and dishonest fields — discovered while auditing for this ADR:**
   - **Workspace "project name"** (`workspace_config.workspace_name`) is persisted and
     editable but read nowhere except its own edit field. Pure dead weight.
   - **Ordinus "display name"** (`ordinus_singleton.display_name`) is persisted but never
     enters the system prompt, the chat UI, or any identity. Dead.
   - **Ordinus "extra instructions"** (`ordinus_singleton.extra_instructions`, max 8000
     chars) is persisted but **never injected into any turn**. The field's own label
     promises *"context Ordinus should always remember"* — a promise the code does not keep.
     This is worse than slop; it is a broken contract with the user.
   - **Workspace folder change** is editable in Settings, but the root is read live at turn
     time and combined with each unit's stored *relative* path
     (`resolve(currentRoot, storedRelativeWorkingRoot)` in
     `runtime/adapters/shared.ts`). Changing the root therefore **silently** moves every
     existing conversation/run into a different physical folder, with the only guard being
     "stop running work first." This contradicts the spirit of ADR-031 ("never let an
     existing unit's folder change") and ADR-028 ("changing `workspaceRoot` later orphans
     file references").

The fix is scoped deliberately: **copy + visual/structural consistency, plus the minimal
behavior changes needed to stop the surface from lying** (remove dead fields, wire the one
valuable orphaned field). It is **not** a wholesale information-architecture redesign; where
a genuine IA defect surfaced (provider/model appearing in two places, skill assignment
appearing in two places) it is resolved by clarifying roles in copy, not by moving the
underlying model.

## Decision

### Part A — Cross-cutting grammar (applies to every section)

**A1. Two layout primitives.** A shared `SettingRow` (split: label + description on the
left, a compact control — switch, select, short input — on the right) and a shared
`SettingBlock` (full-width: textarea, multi-step flow, card list). A section picks the
primitive per control by size. The **description's placement and tone are identical in
both**; only the arrangement flexes. Visual grammar is uniform; section composition is free.

**A2. Six copy rules.** Every description passes all six:
1. A description states **function or consequence, never atmosphere.** Empty phrases
   ("stay out of the flow", "seamless", "powerful") are banned.
2. **Label is the noun, description is the verb.** The description does not restate the
   label.
3. **Second person ("you"), plain verbs, no marketing voice.** Inform, don't sell.
4. **One sentence; two only when a second carries a real consequence or warning.**
5. **State behavioral consequences** ("applies only to new conversations", "agents can run
   these files").
6. **English** (the entire UI is English; mixed language is itself an inconsistency).

Guidance level is **guiding but lean**: trivial controls get one sentence; complex,
misconfiguration-prone areas (Connections) get richer, state-aware guidance. Extra sentences
are earned by a real consequence, not by decoration.

**A3. State-driven guidance (progressive disclosure).** The static description says what the
control *is*; the "what you should do" text is **state-dependent** and always shows a single
next step (e.g. not-connected → "Sign in to use it"; unhealthy → how to fix). Setup
complexity lives in a dialog, not in the row. Empty and error states are the most guiding
moments and get the most copy; the healthy/connected state is the calmest.

**A4. Status vocabulary (five states, fixed colors).**

| Meaning | Word | Color |
| --- | --- | --- |
| Working / ready | **Connected** (external) or **Ready** (in-app capability) | success |
| Not set up | **Not connected** | outline / neutral |
| Awaiting user action | **Action needed** (+ specific reason: "Needs login", "Awaiting pairing") | attention / amber |
| Broken | **Error** (+ short cause) | failed / red |
| In transition | **Connecting…** | muted + spinner |

The main word distinguishes **external connection ("Connected")** from **in-app readiness
("Ready")**. More than two synonyms for one state is banned; amber/red badges always carry a
one-line cause + next step. A section may keep a domain word as a *badge label* only when it
carries real information (Remote access "Listening"), but the **color semantics are shared**.

**A5. Code organization.** Each section is its own file under
`settings/` (`workspace-section.tsx`, `providers-section.tsx`, `connections-section.tsx`,
`skill-library-section.tsx`, `diagnostics-section.tsx`, joining the existing
`ordinus-settings-section.tsx` and `remote-access-section.tsx`). `settings-screen.tsx`
becomes navigation + routing only. Shared parts (`SettingRow`, `SettingBlock`, `StatusBadge`,
copy helpers) live in `settings/_shared/`. Sections are migrated one at a time, moving and
rewriting together (no half-migrated intermediate state).

### Part B — Per-section decisions

**B1. Workspace.** Single concept: the folder.
- The **project name is removed** from the UI, the onboarding flow, and the database
  (`workspace_config.workspace_name` dropped via migration). It was never read.
- The **folder is read-only** in Settings. It is chosen once at onboarding and displayed
  here with a **Reveal in Finder** action. The "Choose folder" / "Save" controls and the
  running-work guard are removed from Settings (the onboarding picker remains the one place a
  folder is set). Purpose line: *"The folder agents read and write in. They can't touch
  anything above it."* Badge: **Ready**.

**B2. Diagnostics** (formerly "Local state"). Re-identified as a **diagnostics/info screen,
not a settings screen**, separated in the nav (bottom, visually set apart). Content (App,
Persistence, Paths) stays but gains one real action — **Copy diagnostics** — and the
workspace's resolved absolute path appears here as a bridge row. Workspace stays a
first-class section; it is **not** merged into Diagnostics (read-only ≠ unimportant).
(Implementation note: the "Disconnect removes only the provider credentials…" sentence the
plan expected to find here actually lives in the Providers connection details, where it
belongs — so nothing was removed from Diagnostics.)

**B3. Ordinus.**
- **Display name removed** (UI + `ordinus_singleton.display_name` via migration).
- **Extra instructions wired.** Appended to the Ordinus system prompt in
  `assembleSystemPrompt` (`ordinus/session.ts`), read from the singleton and assembled
  **once at session init (the conversation's first turn)** — the same lifecycle as the
  knowledge pack and memory snapshot, which are also assembled there rather than copied into
  the conversation row. Because the CLI caches that prompt via `--resume`, editing the
  instructions in Settings shapes **new** conversations and leaves existing sessions
  untouched. (This corrects the earlier "snapshot at creation" framing: the effective
  snapshot point is first-turn session init, not row creation — provider/model are what get
  snapshotted at creation, instructions ride the system-prompt path.) Reaches all three
  providers (Claude, Codex, Gemini) unchanged, since they already inject `instructions`. Copy
  notes the behavior ("Applied when a new conversation starts").
- **Provider/model duplication resolved by copy, not structure.** The Ordinus provider/model
  (the assistant's brain) and the system-default provider/model (ADR-002 — agent and
  background-planning work) are genuinely different and stay in their respective sections.
  Each is labeled with exactly what it governs, in deliberate contrast. The current
  **incorrect** system-default sentence ("Ordinus uses this provider and model for app-owned
  AI work") is replaced with one that names what it actually governs.

**B4. Providers.** Order follows the workflow: **Connections first, System default second.**
The default panel is the *result* of the flow and shows an empty state ("Connect a provider
first") until at least one provider is connected. Provider status uses **Connected** as the
main word (not "Ready"); "Needs login" → **Action needed**; "CLI missing" → **Not installed**
with a copyable install command. The per-provider details panel stays collapsed (progressive
disclosure).

**B5. Connections.**
- **One card grammar; type-specific setup lives in the dialog.** OAuth, pairing, and local
  managed MCP connectors look identical from the outside (icon + name + what-it-does +
  status + Connect). Per-type complexity (Google BYO JSON, WhatsApp pairing, MCP tool
  toggles) appears inside the connect dialog.
- **Capability shown in human language.** A connector's tools are summarized in plain words
  ("Read & send email"), never as a raw tool name alone. Tool **defaults are declared in
  code** (`integrations/registry.ts` `local.defaultEnabledTools`) and remain the source of
  truth; side-effecting tools are born-disabled per ADR-041, enforced at call time by the
  loopback proxy. Per-tool management exists **only for local connectors** (there is no
  remote-MCP tool discovery today).
- **Large tool lists move to a dedicated surface.** The card shows a summary
  ("12 of 47 tools enabled · Manage tools"); a separate sheet holds search + a flat toggle
  list. No grouping or bulk actions until a real scenario demands them.
- **A connect intro precedes every connection.** Clicking Connect opens a consistent intro
  (Ordinus ⇄ connector visual, one-line "what this lets your agents do", capability summary,
  a trust line — "Ordinus stores only the credential on this machine, never your data" — then
  the Connect action), continuing into the type-specific flow within one multi-step dialog.
  The **capability summary is conditional**: for connectors with a known manifest, show the
  real list; for connectors whose tools are only discovered at connect time, **do not
  fabricate** — say "you'll see exactly what this can do, and choose which actions to allow,
  right after it connects" and point to Manage tools.

**B6. Remote access (Telegram).** Treated as a **bespoke section, not a Connections clone** —
it is the inbound door (outside → Ordinus), the conceptual inverse of Connections, and a hero
capability. Layout, visuals, and flow are custom; the **shared anchors are voice (the six
copy rules) and status color semantics** (the badge *word* may stay "Listening", but its
color comes from A4). Three states, each with a felt goal: **disconnected** = trust +
persuade (hero "reach Ordinus from your phone", owner-lock reassurance "only you can reach
it" up front, a visual, encouraging numbered setup — "paste the token BotFather gave you",
not a bare password field); **awaiting pairing** = momentum (large pairing code, one action);
**connected** = proof + encouragement (live green status, "listening while Ordinus is open",
"send your bot a message to try it").

**B7. Skill library.** Positioned explicitly as a **catalog**. The source of truth for which
agent uses which skill is the **per-agent Skills tab** (ADR-040). The import dialog's "Assign
to agents" step is framed as a **shortcut** ("you can change this per agent later"), not a
second source of truth. The import safety notice stays **simple** (existing text-level "read
before trusting" + bundled-executable note, cleaned up per the copy rules) — no tiered
acknowledgment gate.

## Alternatives Considered

### Copy-only pass (no structural or behavior change)
- Pros: lowest risk; touches no data model.
- Cons: the inconsistency is partly structural (every section a different skeleton, dead
  fields actively misleading). Copy alone leaves the broken-promise fields and the silent
  folder-relocation hazard in place.
- Rejected: it does not fix what the user actually complained about.

### Full information-architecture redesign
- Pros: could regroup/merge sections (e.g. unify all provider/model selection).
- Cons: expensive and risky; the underlying model (Ordinus brain vs agent default; library
  vs per-agent assignment) is correct — the defects are linguistic, not structural.
- Rejected: scope is consistency + honesty, not re-architecture. IA defects are fixed by copy
  where the model is already right.

### Keep the dead fields, just hide them
- Pros: no migration.
- Cons: leaves dead columns and the temptation to "use them later"; the display fields keep
  confusing future readers.
- Rejected: dead user-facing fields are removed at the source (UI + DB).

### Wire the Ordinus display name (instead of removing it)
- Pros: a renamable assistant.
- Cons: visible effect requires a persona label in the Ordinus transcript (which is
  deliberately label-light per ADR-029 §8) — real UI work for marginal value; "Ordinus" is
  already a good name.
- Rejected: removed. Extra instructions (high value, cheap to wire) are kept and wired.

### Keep the workspace folder editable with a strong warning
- Pros: supports the rare legitimate "I moved my project" case.
- Cons: makes a dangerous, rare action a visible part of the surface we are trying to
  declutter; the silent-relocation semantics are the confusion we are removing.
- Rejected: read-only by default. A deliberate, heavily-guarded "advanced" relocation can be
  added later if a real need appears.

### Merge Workspace into Diagnostics (both now read-only)
- Pros: one fewer section.
- Cons: conflates "read-only because it's a system fact" (schema version, log path) with
  "read-only because we deliberately locked an important concept." The workspace folder is
  the agent security boundary and deserves first-class framing.
- Rejected: kept separate; the absolute path is bridged into Diagnostics.

### Tiered acknowledgment for skill import (explicit confirm for bundled executables)
- Pros: stronger safety signal.
- Cons: added friction and complexity for a flow the user wants kept simple; first-party
  skills would need carve-outs.
- Rejected: keep the existing text-level warning, cleaned up.

## Consequences

### Behavior / data
- Drizzle migration drops `workspace_config.workspace_name` and
  `ordinus_singleton.display_name` (both NOT NULL today). Onboarding and
  `saveWorkspaceConfig` types/Zod schemas lose `workspaceName`.
- `ordinus_singleton.extra_instructions` becomes live: snapshotted into the Ordinus
  conversation at creation and concatenated into the session-init system prompt across all
  three adapters. This is the only net-new functional behavior and is bounded by ADR-029 §6
  (session-init only, no per-turn re-injection).
- The workspace folder is no longer changeable from Settings; the running-work guard and
  save path tied to that control are removed. The path-policy root-relative invariant
  (ADR-031) is unchanged at the code level.

### UI / code
- New `settings/_shared/` primitives (`SettingRow`, `SettingBlock`, `StatusBadge`).
- Implementation sequencing (pragmatic deviation from "every section to its own file"):
  Workspace and Diagnostics got their own files (`workspace-section.tsx`,
  `diagnostics-section.tsx`); Ordinus and Remote access already had files. **Providers,
  Connections, and Skill library were reworked in place** in `settings-screen.tsx` — full
  file extraction for those three is deferred as a non-user-facing refactor, since the
  user-facing goal (consistent grammar, status vocabulary, guiding copy) is met without
  moving ~1500 lines. `settings-screen.tsx` is no longer a pure router as a result.
- Skill library already embodied B7 (catalog framing, assign-as-shortcut copy, simple
  "I trust these instructions — import" safety gate), so it needed no change.
- "Local state" is renamed/re-identified as "Diagnostics" and set apart in the nav.
- New connector **connect-intro** step (uniform multi-step dialog) and a **Manage tools**
  sheet for local connectors. A **Reveal in Finder** / open-path affordance is needed
  (reuse an existing IPC if present; otherwise a small addition).
- Remote access gets bespoke per-state visuals while inheriting the shared voice and status
  colors.

### Documentation
- ADR-029, ADR-031, and ADR-028 carry "Amended by ADR-045" notes (see Status).
- ADR-002 is unchanged; only the Settings copy that misattributed the system default to the
  Ordinus assistant is corrected.
