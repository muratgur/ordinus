# PLAN — Ordinus First-Run Onboarding into Home

**Status:** Ready for implementation
**Date:** 2026-06-08
**Decision record:** ADR-029 §10 (First-run onboarding into Home addendum)
**Supersedes:** the deleted `PLAN-ADR-028-first-run-onboarding.md` (content entirely new)

## Goal

A brand-new user, after finishing ADR-028 setup, lands on Home in front of a calm empty
state and **doesn't know what to type**. They don't yet know what Agents / Workboard /
Workflows / Schedules are, or that Ordinus is the colleague who helps shape that work.

This plan bridges "setup done" → "first useful message sent" by **priming the map**
(welcome panel) and **handing over the first sentence** (human-phrased starter buttons),
without breaking Ordinus's reactive presence model or replacing the welcoming empty state.

Onboarding's job **ends when the user sends their first message.** Where the conversation
goes next is the user's initiative.

## Principles (locked during grilling)

- **Don't replace the empty state — prime it.** The welcome panel opens *over* the empty
  state and, on dismiss, leaves the real Ordinus stage standing behind it.
- **Ordinus stays reactive.** Every starter is mechanically a *user-sent message* (chip
  click → prompt sent). Ordinus never auto-greets. Static welcome copy lives in the
  panel / empty state, never in an Ordinus-authored auto-message.
- **Agent first.** Agents are the prerequisite for Workboard/Workflows, so agent creation
  is the first starter and gets its own panel step.
- **No over-build.** No `create_agent` tool, no soft hand-off / nav action, nothing about
  the user's own agents' internal behavior. Those are separate, later work.

## Scope — single phase

1. Welcome panel (one-time, re-openable).
2. Empty-state starter buttons (replace the bare slash-chip row; permanent).
3. `/new-agent` intent + `recipes.md` first-agent coaching recipe.

### Explicitly out of scope (later)

- `create_agent` tool (Ordinus building the agent itself).
- Soft hand-off / `navigate` / `open_agent_create` action at the end of agent coaching.
- The user's own agents' internal behavior.

---

## Work items

### 1. Welcome panel component

**New file:** `app/src/renderer/src/screens/home/home-welcome-panel.tsx`

- Dismissible overlay rendered at the Home screen root (sibling to the memory `Dialog`,
  see [home-screen.tsx:721](app/src/renderer/src/screens/home/home-screen.tsx:721)) so it
  covers the full Home surface and the empty state sits behind it.
- Swipeable **5-step** stack:
  1. **Who Ordinus is** — animated mark + one sentence (colleague voice).
  2. **Agents** — "the colleagues that do the work"; called out as the prerequisite.
  3. **Workboard** — "where you hand work to agents."
  4. **Workflows + Schedules** — combined step (automate repeating work).
  5. **"Let's start"** — hand-off; closing the panel reveals the empty state + starters.
- Each concept step (2–4) shows a **small, restrained static screenshot**. Step 1 uses the
  mark; step 5 is copy + a "Let's start" button.
- Reuse `OrdinusMark` ([ordinus-mark.tsx](app/src/renderer/src/screens/home/ordinus-mark.tsx))
  on step 1. Match the ADR-029 §8 calm-stage styling (restrained, generous whitespace);
  follow the `ordinus-ui-system` skill conventions.
- Keyboard + dot-nav between steps; Esc / backdrop / "Let's start" all dismiss.

**Screenshots asset:** `app/resources/ordinus-knowledge/` is for prompt markdown — do **not**
put images there. Add panel screenshots under the renderer asset path (e.g.
`app/src/renderer/src/assets/onboarding/`) and import them. Keep them small/light.

### 2. "Seen" persistence + re-open affordance

**Edit:** `app/src/renderer/src/screens/home/storage.ts`

- Add `readWelcomeSeen()` / `writeWelcomeSeen(seen)` backed by localStorage key
  `ordinus.home.welcome-seen`, mirroring the existing `homeSidebarDocked` helpers.

**Edit:** `app/src/renderer/src/screens/home/home-screen.tsx`

- On mount, if `!readWelcomeSeen()`, open the welcome panel. Write `true` on dismiss.
- (No `app_meta` migration — this is a pure UI nicety, per ADR-029 §10.)

**Re-open affordance** (unobtrusive): a small "?" in the Home top strip
([home-top-strip.tsx](app/src/renderer/src/screens/home/home-top-strip.tsx)) **or** a
"Show welcome" row in Settings → Ordinus
([settings/](app/src/renderer/src/screens/settings/)). Pick one; top-strip "?" preferred for
discoverability. Re-opening just sets panel-open state; it does not clear the seen flag.

### 3. Empty-state starter buttons (replace bare slash-chip row)

**Edit:** `app/src/renderer/src/screens/home/home-empty-state.tsx`

- Replace the current `slashCommands.map(...)` chip row
  ([home-empty-state.tsx:57](app/src/renderer/src/screens/home/home-empty-state.tsx:57))
  with **human-phrased starter buttons**, ordered agent-first:
  1. **Create an agent** → sends the `/new-agent` intent (item 4).
  2. **Define work on the Workboard** → sends `/workboard` (existing `expandPrompt`).
  3. **Build a workflow** → sends `/workflow` (existing `expandPrompt`).
  4. **Add a schedule** → sends `/schedule` (existing `expandPrompt`).
- These are **permanent** — they render on every zero-message empty state, not first-run
  only. They are the always-available "first sentence."
- Styling: slightly more present than today's faint hover-only chips (they're the answer to
  "what do I type?"), but still secondary to the input per §8. Keep the input the focal point.
- `/help` is **not** on the visible row — it remains available via `/` autocomplete only.
- `/` autocomplete is unchanged
  ([slash-autocomplete.tsx](app/src/renderer/src/screens/home/slash-autocomplete.tsx),
  [slash-commands.ts](app/src/renderer/src/screens/home/slash-commands.ts)).

**Note on send path:** the existing chips call `onSend('/cmd')`, and the home send path
expands slash commands via `parseSlashCommand` → `expandPrompt`. Verify `/new-agent`
routes through the same expansion (item 4) so the starter button just sends `/new-agent`.

### 4. `/new-agent` intent + first-agent recipe

**Edit:** `app/src/renderer/src/screens/home/slash-commands.ts`

- Add a `new-agent` `SlashCommandDefinition`. The `expandPrompt` stays **short** (per
  ADR-029 §6 — visible prompt thin, behavior in the knowledge pack). It seeds a discovery
  conversation: a brief intent like *"The user wants help creating their first agent and
  isn't sure what they need — coach them per your first-agent recipe."* It must **not**
  reuse `/agent` (read-only) and must **not** open the New Agent screen.
- Decide whether `/new-agent` appears in the `/` autocomplete list or is starter-button-only.
  Recommended: include it in the list for discoverability, with a clear hint.

**Edit:** `app/resources/ordinus-knowledge/recipes.md`

- Add a **first-agent coaching recipe**: how Ordinus runs the discovery conversation — ask
  what kind of work they want done, surface the agents.md anatomy (role / instructions /
  sandbox / connectors) in plain language, recommend a starting shape. Note that the
  agents.md "don't push agent creation as a default" guidance is relaxed here because the
  user **explicitly asked** via the starter.
- The recipe ends at guidance/coaching only. **No** instruction to navigate or to claim the
  agent was created — there is no `create_agent` tool yet (out of scope).

**No change** to `agents.md` core content; the recipe references it.

## Touch list (summary)

| File | Change |
| --- | --- |
| `screens/home/home-welcome-panel.tsx` | **new** — 5-step overlay |
| `assets/onboarding/*` | **new** — small static screenshots |
| `screens/home/storage.ts` | add welcome-seen helpers |
| `screens/home/home-screen.tsx` | mount panel on unseen; render re-open affordance; wire panel state |
| `screens/home/home-top-strip.tsx` *(or Settings → Ordinus)* | unobtrusive re-open "?" |
| `screens/home/home-empty-state.tsx` | replace slash-chip row with starter buttons |
| `screens/home/slash-commands.ts` | add `new-agent` definition |
| `resources/ordinus-knowledge/recipes.md` | add first-agent coaching recipe |

## Verification

- Fresh DB (no `onboardedAt`) → complete setup → land on Home → **welcome panel opens once**.
- Close panel → empty state with **starter buttons** visible; reload Home → panel does **not**
  reappear; buttons still there.
- Click **Create an agent** → `/new-agent` expands → Ordinus runs a coaching conversation
  (no New Agent screen opened, no create_agent tool call, no nav).
- Click **Define work on the Workboard / Build a workflow / Add a schedule** → existing
  flows fire unchanged.
- Type `/` → autocomplete still lists commands (incl. `/help`); visible starter row does not
  show `/help`.
- Re-open affordance re-shows the panel without resetting any other state.

## Open implementation details (decide while building)

- Exact re-open location: top-strip "?" vs Settings → Ordinus (recommended: top-strip).
- Whether `/new-agent` shows in `/` autocomplete (recommended: yes).
- Final starter-button copy and visual weight (must stay secondary to the input).
