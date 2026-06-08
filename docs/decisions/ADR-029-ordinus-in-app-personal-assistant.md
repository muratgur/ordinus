# ADR-029: Ordinus — In-App Personal Assistant

## Status

Proposed

Adds a new top-level surface (Home) and a new singleton system agent (Ordinus).
Does not supersede existing ADRs. Reuses ADR-003 (session-backed conversations),
ADR-007 (workboard request planning), ADR-013 (provider session validity and fresh-start
fallback), ADR-017 (background plan generation), and ADR-027 (agent home 1:1 chat).
Coexists with ADR-027 — Ordinus is not a replacement for agent 1:1 chat.

## Date

2026-06-07

## Context

Ordinus today lands the user on the Workboard. There is no front door for the application
itself — no place to ask "what just happened in that run?", "how would I build this with
agents?", or "turn what I just typed into a recurring task." The user can talk with their
own agents (each an expert in their own domain) and orchestrate work through Workboard and
the Workflow designer, but there is no in-app counterpart that knows **Ordinus itself**.

An earlier exploration (memory note from 2026-06-04) proposed a "Lead coordinator" that
would broker requests to specialist agents from a Home thread. That direction was
abandoned before any ADR was written — the coordinator framing conflated routing with
conversation and felt like a wrapper around existing agents rather than its own thing.
This ADR starts fresh from a different premise: a standalone in-app assistant that is
**not** a coordinator, knows the application deeply, and can act on it within safe limits.

Constraints shaping the design:

- The runtime is CLI-bound (Codex / Claude / Gemini). Turns are slower and more expensive
  than typical chat. Token cost is a first-class concern.
- All three provider adapters already support resumable sessions
  (`app/src/main/runtime/adapters/{claude,codex,gemini}/adapter.ts` — `--resume <sessionId>`),
  so per-turn re-injection of system prompt and tool catalog is unnecessary.
- Ordinus persistence is a single SQLite file at `userData/ordinus.db`
  (`app/src/main/paths.ts:12`). Logs are **per-run**, stored under `userData/logs/<logRef>/`
  with `events.jsonl` and `stderr.txt`, written by runtime adapters via `createWriteStream`
  (`app/src/main/runtime/adapters/shared.ts:109`). There is no global app log.
  `ObservabilityService.getDiagnostics({ observedRunId, stdoutOffset, stderrOffset })`
  already tails these safely with path-traversal protection
  (`app/src/main/observability/service.ts`).
- Electron security boundary requires that any DB or log access live in the main process
  and be exposed to the renderer (and to the CLI tool layer) through typed IPC.

## Decision

Introduce **Ordinus** as a singleton in-app assistant, surfaced on a new **Home** route
that becomes the default landing screen. Ordinus is a system agent — provisioned with the
workspace, not deletable, not in the Agents roster — and lives only on Home. It is a
standalone assistant, not a coordinator: it does not route to or broker for other agents.

### 1. Identity and scope

- **Role:** In-app personal assistant. Primary expertise is Ordinus itself — features,
  flow design guidance, "what happened here?" answers, "how would I do this with agents?"
  exploration.
- **Relationship framing — a *presence*, a competent colleague (Jarvis-like).** Ordinus
  is positioned as someone the user *reaches when they need help*, a team member — not a
  "smart input box" (capability surface) and not a humanlike character. The other agents
  *do the work*; Ordinus *helps the user* (shape a Work Request, extract a Workflow from
  what they were just discussing, debug a run). The tone is calm, professional, capable —
  no fake emotions, no small talk, no humanlike avatar. This presence framing governs the
  Home UI (§8): Ordinus must feel like "someone is here," never like an empty box.
- **Visual identity:** a single, distinctive **abstract mark** with its own *living
  animation* — it breathes when idle and animates while thinking. Explicitly **not** the
  generic `Sparkles`/AI-cliché icon and **not** a human avatar. The mark is the emotional
  anchor of the surface; the live animation is what separates a *presence* from a static
  logo, and doubles as Ordinus's working/thinking indicator (§8).
- **Reactive, not proactive (v1).** The user opens Home with an intent already in mind;
  Ordinus waits for them rather than greeting with a pre-scanned status brief. Ordinus
  also does not scan app state on its own initiative. A measured-proactive mode (a short
  "here's what needs attention" brief) is a deliberate future enhancement, out of scope
  here.
- **Not:** A coordinator, a general chat assistant, or a normal user agent.
- **Singleton system agent:** provisioned with the workspace, not deletable, not listed
  in the Agents roster, no Agent-tab 1:1.

### 2. Conversation model

- **Multiple manual conversations**, ChatGPT-style. User controls creation and lifecycle.
  Auto-generated titles, user-editable.
- **Per-conversation working context** belongs to the CLI session (ADR-003 pattern).
- **`ordinus_memory` table** holds cross-conversation persistent memory. Schema:
  `id, type, name, body, created_at, updated_at`. Type taxonomy starts loose
  (`user`, `preference`, `project`, `decision`) and is allowed to evolve.
- Memory writes are **explicit** — either user-triggered ("remember this") or Ordinus
  proposing a `memory_write` it then executes. **No silent auto-learning.** A future
  "should I remember this?" suggestion mode is allowed but out of scope.

### 3. Data access

Three-layered tool access from Ordinus into the application:

1. **Typed read tools** — common, cheap, frequent. Examples:
   `listRecentWorkRequests`, `getRun(id)`, `listAgents`, `listSchedules`,
   `getRunLog(observedRunId, opts?)` (thin wrapper over
   `ObservabilityService.getDiagnostics`).
2. **`runSqlReadonly(query)`** — escape hatch for novel questions not covered by typed
   tools. Opens the SQLite file with `{ readonly: true }`. Schema DDL is included in the
   Ordinus system prompt. Read-only by construction; no `runSqlWrite` equivalent exists.
3. **Typed destructive tools, with user confirmation** — `deleteWR(id)`, `retryRun(id)`,
   `cancelSchedule(id)`, etc. Invariant-aware (respect foreign keys, state machines).
   Always confirmed (see §9).

Logs are accessed only through typed run-scoped tools. No global `tailAppLog` —
that surface does not exist in the codebase, and per-run logs are the right granularity.

### 4. Tool layer architecture

Single home: **`src/main/ordinus-tools/`**. One file per tool, with four parts:

1. **Manifest** — `name`, `description` (used by Ordinus for tool selection),
   `capability: 'read' | 'write' | 'destructive'`, `requiresConfirmation: boolean`.
2. **Input schema** (Zod).
3. **Output schema** (Zod).
4. **Executor** — async function that calls the **same underlying repository / service
   functions** as the UI's IPC handlers. The tool layer never duplicates business logic;
   it shapes inputs/outputs and adds metadata.

`src/main/ordinus-tools/index.ts` is the registry. Adding a tool = one file + one import.
The registry derives the JSON tool catalog the runtime adapter passes to the CLI at
session init.

The runtime layer automatically enforces `requiresConfirmation` — executors block on a
user-confirmation event before running. Tool authors do not re-implement this per tool.

**`runSqlReadonly`** is a single tool that lives in the same directory; its system-prompt
schema documentation is generated from the Drizzle schema (`app/src/main/db/schema.ts`).

### 5. Slash commands

Slash commands are **UX sugar for tool invocation**, not a replacement for tool-use.
They expose common user intents as quick-typed shortcuts that compose into a normal
Ordinus turn (with possible follow-up questions and tool calls).

- **Registry:** `src/renderer/ordinus-commands/`, separate from the tool layer.
  Each command: `name`, `description`, parameter form, prompt template for Ordinus.
- **`/` autocomplete panel** in the input — Claude Code-style: opens on `/`, filters as
  the user types, Enter to select, Esc to dismiss.
- **Initial command set:**
  - `/workflow` — turn the selected text / current conversation into a workflow draft.
  - `/schedule` — turn the selected text / current conversation into a scheduled task.
  - `/agent` — start a new-agent flow from current context.
  - `/help` — pull from Ordinus knowledge pack for guided help.
  - `/workboard` — turn the conversation into a Work Request via the existing Planner
    (ADR-007) and the existing Workboard draft-review surface.
- Slash commands **do not** bypass confirmation for destructive tools. Intent is not
  consent.

### 6. Knowledge and memory

- **Knowledge pack:** `src/main/ordinus-knowledge/` — sectioned Markdown files
  (`core-identity.md`, `workflows.md`, `agents.md`, `schedules.md`, `connectors.md`,
  `recipes.md`, …). Curated and versioned with the repo. Sections concatenated into the
  Ordinus system prompt at session init.
- **Memory:** `ordinus_memory` table (§2), surfaced to Ordinus through `memory_search`
  (read, `capability: 'read'`) and `memory_write` (write, `capability: 'write'`,
  `requiresConfirmation: false`). Memory snapshot is included in the session-init system
  prompt.
- **Token discipline:** knowledge + tools + memory snapshot are sent **once at session
  init**. Subsequent turns rely on the CLI's native `--resume` to retain that context.
  Per-turn re-injection is forbidden. When memory changes mid-conversation, the
  `memory_write` tool itself updates Ordinus's working context for the current session;
  other concurrent sessions pick up the new memory on their next session init.

### 7. Provider and session

- **Provider default:** whatever the user selected as their default provider during
  first-run setup. Ordinus does not require any specific provider.
- **Provider is configurable** in Settings, in **Ordinus's own configuration** —
  independent from per-agent provider settings. (Ordinus is not a normal agent.)
- **Provider change behavior:**
  - New conversations use the newly-selected provider.
  - Existing conversations remain on their original provider as long as that provider
    is still installed and connected. They continue to resume normally (ADR-013 fallback
    applies).
  - When the original provider becomes unavailable (uninstalled, disconnected),
    those conversations enter a **frozen** state — read-only, with an in-conversation
    banner offering: reconnect the provider, or **"summarize and start new conversation"**
    on the current provider (a small, user-initiated summary turn; not an automatic
    transcript migration).
- **Conversation list signaling:** provider badge appears **only on conversations whose
  provider differs from the current Ordinus default**, or whose provider is unavailable
  (warning state). Conversations on the current default render without a badge —
  silent-by-default to keep the list clean.
- **Provider-change dialog:** when the user changes provider in Settings, show a dialog
  listing the count of existing conversations and the resulting behavior. Default action
  is "continue"; "archive existing now" is offered as a secondary option.

### 8. Home UI

Home is Ordinus's **only** access point, so it carries the entire relationship: it must
feel professional, classy, and bonding (§1). The screen is built as a **calm, focused
stage**, not a busy dashboard — disciplined emptiness (Linear/Raycast/Arc-level polish),
generous whitespace, restrained typography, a single signature tint. The animated mark
(§1) is the emotional center and is *always* present in some form so the user never feels
they are "talking to an empty box."

- **Default route:** Home. Workboard moves to being a navigation tab (no longer the
  landing screen).
- **Empty / welcoming state (the first impression):** a single centered hero stack —
  the animated Ordinus mark (NOT `Sparkles`), a short presence-toned greeting (colleague
  voice, not tool-language "I can help you build workflows…"), the input as the inviting
  focal point, and a quiet secondary row of slash-command chips below it. Composition is
  **optically balanced — slightly above true vertical center**, not dead-center. The
  conversation list is **hidden entirely** in this state so the stage stays pure.
  - **This welcoming state shows for ANY conversation with zero messages**, including a
    freshly-created "New conversation" — not only when there is no active conversation.
    (Implementation note: gate the hero on "active conversation has no messages," not on
    "active conversation is null"; otherwise clicking New conversation drops the user
    into a blank transcript and the welcoming surface is never seen again after the first
    conversation exists.)
- **Active conversation:** the presence **persists but shrinks** into a thin top strip —
  a small live mark + "Ordinus" (+ conversation title) — whose mark animates while
  Ordinus is thinking, so the working indicator and the presence are the same object.
  Below it, the linear transcript takes the main area at comfortable width; the input is
  pinned at the bottom.
- **Conversation list (left rail) recedes:** default **collapsed**, summoned from the
  edge; it is not a persistent always-on rail. Keeps Home feeling like a focused space
  for a colleague rather than a generic multi-thread chat app. (Supersedes the earlier
  "sticky conversation list in the left rail" intent.)
- **Transcript style (Ordinus-only — intentionally diverges from Agents / Conversations
  bubble UI):** Claude Code / Codex-style linear stream. **No chat bubbles.**
  - User messages render as a simple prefixed line.
  - Ordinus replies render as Markdown blocks.
  - **Tool calls are first-class collapsible blocks**, not messages. Title is the tool
    name + a short summary; expanded shows parameters and result.
    - Default expansion: `read` collapsed, `write` / `destructive` results expanded.
  - Inline previews for side-effects: `memory_write` shows a compact "💭 Remembered: …"
    line.
  - **Result delivery is the bonding payoff and happens *in place*, beside Ordinus.**
    When Ordinus produces something (a Work Request draft, a Workflow, a schedule) it
    surfaces as a **compact result card in the transcript** — "here's your draft: …" —
    like a colleague leaving a deliverable on your desk. The card must stay **compact and
    must not take over the transcript**. Navigating onward (e.g. open/edit in Workboard)
    is a **user choice on the card**, never an automatic context-switch. This explicitly
    replaces the toast-plus-auto-navigate behavior: Ordinus does not yank the user off
    Home to another screen the moment a result is ready. A toast may remain as a quiet
    secondary signal, but the card in the transcript is the primary event.
  - Status indicators (thinking, tool running) appear near the input, not as transcript
    entries. The top-strip mark animation (above) is the primary "Ordinus is working"
    cue.
- **Stylistic divergence is intentional**, not a bug. Ordinus's interaction grammar
  (typed input + tools + side-effects + confirmations) is closer to Claude Code than to
  social chat. Agents and the existing Conversations surface continue to use bubble UI;
  no UI changes there.

### 9. Destructive-tool confirmation

- **Capability-based, no trust-mode.** `write` tools execute silently. `destructive`
  tools always prompt. Per-session "trust" toggles and per-pattern "never ask again"
  preferences are explicitly rejected — the cognitive cost of a single confirm tap is
  smaller than the cost of a silent destructive surprise.
- **Confirmation surface:** a focused **panel above the input**, not a card in the
  transcript. Same UX pattern as Claude Code / Codex permission prompts. Keeps the
  transcript clean and the destructive moment unmistakable.
- **Panel content:** tool name, parameters, **a one-line summary of the affected record**
  (e.g. WR title + status, not just `WR-42`), a "reversible?" indicator, primary
  `[Approve]` and `[Cancel]` actions, and an optional "Why?" disclosure that shows
  Ordinus's reasoning for the call.
- **Batch operations:** a single panel listing all affected records, all-or-nothing.
  Granular per-row selection is rejected as over-engineering; the user can cancel and
  ask Ordinus to narrow the set instead.
- **No-response behavior:** the panel **stays pending** indefinitely. Ordinus is told
  the call is awaiting confirmation and is free to continue the conversation
  ("standing by; let me know when you want me to do it"). Confirm/cancel remain
  actionable later. No auto-timeout, no auto-decline.
- **Post-action artifact:** a single compact log line lands in the transcript
  (`✓ WR-42 deleted` or `✗ Cancelled by user`), not a re-render of the panel.

### 10. First-run onboarding into Home (addendum, 2026-06-08)

ADR-028 ends the setup flow by dropping the user onto Home. The problem: a brand-new user
lands in front of a calm empty state with a blinking input and **no idea what to type** —
they don't yet know what Agents, Workboard, Workflows, or Schedules are, or that Ordinus
is the colleague who helps shape that work. This section defines the bridge between "setup
done" and "first useful action," **without** breaking the reactive presence model (§1) or
replacing the welcoming empty state (§8).

The shape is *prime, then hand the first sentence over* — not a tour, not a separate lesson
screen.

- **Welcome panel (one-time, Apple-style).** After setup completes and the user lands on
  Home, a dismissible overlay opens **over** the empty state (not inside the ADR-028
  full-window flow — the empty state must be standing behind it when it closes). It is a
  short swipeable stack of **5 steps**: (1) who Ordinus is, (2) **Agents** — the colleagues
  that do the work, called out as the prerequisite, (3) **Workboard**, (4) **Workflows +
  Schedules** (one combined step to avoid overwhelming), (5) **"Let's start"** — the
  hand-off step. Each concept step carries a **small, restrained static screenshot** (recognition
  aid, deliberately not in-your-face; minor UI drift over time is acceptable). "Seen" state
  is stored in **localStorage** (UI nicety, no migration). The panel is **re-openable** from
  an unobtrusive affordance (Home top-strip "?" / Settings → Ordinus), so an accidental
  dismissal is not permanent.
- **Empty-state starter buttons replace the bare slash-chip row.** The faint `/workboard
  /schedule /workflow` chip row (§8) is replaced with **human-phrased starter buttons** —
  *Create an agent · Define work on the Workboard · Build a workflow · Add a schedule* —
  ordered so **agent creation comes first** (it is the prerequisite for everything else).
  These are **permanent**, not first-run-only: they sit under the input on every zero-message
  state so the user always has a first sentence to reach for. `/help` is off the visible row
  (the row is action-first).
- **A starter PREFILLS the input — it does not send.** Clicking a starter drops a natural,
  first-person half-sentence into the input box and focuses it (caret at the end); the user
  completes the thought and presses Enter. This was a deliberate correction: the original
  design had the buttons auto-send the matching slash command's `expandPrompt`, but those
  prompts assume an **existing conversation to act on** ("turn *this* into a Work Request"),
  so a cold click from the empty state produced a confused, context-less Ordinus reply. The
  transcript also showed a cryptic `/cmd` instead of a human sentence. Prefilling fixes the
  cold-context problem, keeps the user in control, and reads naturally. The `/` autocomplete
  and the slash commands themselves are **unchanged** and remain the power-user path.
- **No dedicated agent command.** Because starters prefill plain text rather than dispatch a
  command, the agent starter needs **no `/new-agent` (or `create_agent`) command** — it
  simply prefills *"I want to create an agent. Help me figure out what kind I need — "*.
  `/agent` stays read-only and untouched. Ordinus coaches the resulting natural-language
  request via a **`recipes.md` first-agent recipe** (per §6 — coaching behavior lives in the
  knowledge pack, always in the system prompt, not in any chip/command).
- **The reactive model is preserved.** A starter only *prefills*; nothing is sent until the
  user presses Enter, so every Ordinus turn is still a genuine user-sent message. Ordinus
  never auto-greets or posts unprompted. The static welcome copy lives in the panel and empty
  state, never in an Ordinus-authored auto-message.
- **Explicitly out of scope (separate, later work):** a `create_agent` tool (Ordinus
  building the agent itself), any soft hand-off / navigation action at the end of agent
  coaching, and anything about the user's *own agents'* internal behavior. Onboarding's job
  ends at **"the user has sent their first message."** Where the conversation goes next is the
  user's initiative.

## Alternatives Considered

### Coordinator / "Lead" agent (the 2026-06-04 exploration)

- Pros: Single front door brokers across all agents; eliminates need for the user to
  pick a specialist; transparent multi-agent collaboration.
- Cons: Conflates conversation with routing; the broker layer was complex and brittle;
  required cold-start briefings into specialist sessions; framing made the assistant
  feel like infrastructure rather than a presence.
- Rejected: The user retracted this direction in conversation before any ADR was
  written. Ordinus's value comes from *being itself*, not from being a routing layer
  over existing agents.

### One perpetual conversation (like the abandoned Lead Home thread)

- Pros: Simpler model, no "new conversation" ceremony, all memory in one place.
- Cons: CLI cost grows unbounded as transcript grows; user has no way to compartmentalize
  unrelated topics; switching topics mid-thread degrades quality.
- Rejected: Multiple manual conversations match how users actually work and let them
  reset context cheaply when needed.

### Raw SQL read+write tool ("just let Ordinus run any query")

- Pros: Maximum flexibility, minimum tool authoring overhead.
- Cons: Write side is catastrophic — a `DELETE` without invariant awareness orphans
  rows, breaks state machines, corrupts run history. Token-expensive for everyday
  questions (Ordinus has to learn schema and parse raw rows). Audit trail is weaker.
- Rejected for writes; **partially accepted for reads** — `runSqlReadonly` is the
  escape hatch (§3).

### Typed tools only, no SQL escape hatch

- Pros: Maximum safety, minimum surface area.
- Cons: Every novel question requires a new tool. Ordinus can't help with the long tail
  ("any schedule runs with corrupt timezone?") without code changes.
- Rejected: `runSqlReadonly` is a safe pressure-release valve. Frequently-used queries
  graduate to typed read tools over time; the escape hatch covers the rest.

### Bubble UI for Ordinus (consistent with Agents and Conversations)

- Pros: Visual consistency across the app.
- Cons: Bubbles assume turn-taking conversation. Ordinus does work — tool calls,
  previews, confirmations, side-effects — that doesn't fit the bubble metaphor and feels
  cramped inside one. Tiring at length, per user feedback.
- Rejected: Intentional divergence. Ordinus's UI grammar matches its role.

### Trust-mode for destructive tools ("don't ask again this session")

- Pros: Reduces friction for power users doing batch cleanup.
- Cons: Confirms-are-cheap, mistakes-are-not. A user clicks "trust" while doing one
  thing, then thirty minutes later in a different context Ordinus deletes the wrong
  record silently. Recovery is harder than the friction it saves.
- Rejected: Capability-based confirmation is the line. Destructive always asks.

### Automatic memory ("Ordinus summarizes each conversation and writes what it learned")

- Pros: Memory accumulates effortlessly.
- Cons: User can't see what's being remembered; surprise entries erode trust ("I didn't
  say that"); wrong inferences propagate silently.
- Rejected: Explicit `memory_write` only. A "should I remember this?" suggestion mode
  is a future enhancement and is out of scope.

### Provider migration by transcript re-injection

- Pros: Preserves continuity across provider changes.
- Cons: Token-catastrophic at scale (every existing conversation × full transcript);
  the destination model behaves differently anyway, so "continuity" is partly illusory.
- Rejected: Frozen-and-summarize is the explicit, opt-in path.

## Consequences

### Adopted

- New top-level route `/home` becomes the default landing screen. Workboard remains a
  nav tab.
- New singleton system agent provisioned with the workspace. Workspace bootstrap and
  first-run flow (ADR-028) need a small extension to seed the Ordinus row, default
  provider config (inheriting user's default), and an empty `ordinus_memory` table.
- New `ordinus_conversations` and `ordinus_memory` tables in the Drizzle schema
  (exact shape TBD in implementation).
- New `src/main/ordinus-tools/` package; registry surfaced through a new IPC channel
  consumed by the runtime layer when starting Ordinus sessions.
- New `src/main/ordinus-knowledge/` directory of curated Markdown sections, concatenated
  into the system prompt at session init.
- New `src/renderer/ordinus-commands/` registry and `/` autocomplete UI component.
- New transcript renderer for Ordinus (linear, non-bubble, tool-blocks-as-first-class),
  separate from existing Conversation / Agent bubble views.
- A distinctive **animated Ordinus mark** (abstract, non-`Sparkles`, non-avatar) is a
  design-production deliverable, used at hero scale on the welcoming state and shrunk into
  the active-conversation top strip where its animation doubles as the working indicator
  (§1, §8).
- **In-transcript result cards** for Ordinus-produced artifacts (WR drafts, workflows,
  schedules), replacing the toast-plus-auto-navigate handoff (§8). Onward navigation
  becomes a user action on the card.
- Welcoming/empty state is gated on "active conversation has no messages," so it appears
  for freshly-created conversations too, not only when no conversation is selected (§8).
- New permission-prompt panel component (sits above the input, mirrors Claude Code /
  Codex pattern).
- Settings: new "Ordinus" section for provider/model selection, with provider-change
  dialog.

### Preserved

- ADR-003 (session-backed conversations): Ordinus uses the same pattern — provider
  owns transcript via `--resume`, Ordinus stores only conversation metadata + memory.
- ADR-007 (workboard request planning) and ADR-017 (background plan generation):
  `/workboard` slash command and any Ordinus-initiated "let's make this a WR" flow
  reuse the existing Planner and Workboard draft-review surfaces unchanged.
- ADR-009 (work-request-scoped agent sessions): Ordinus has its own session model;
  WR-scoped agent sessions are untouched.
- ADR-013 (provider session validity and fresh-start fallback): applies to Ordinus
  sessions the same way it applies to agent sessions.
- ADR-027 (agent home 1:1 chat): unchanged. Ordinus does not replace or compete with
  agent 1:1 chat — it's a different surface for a different need.
- ADR-028 (first-run onboarding and managed CLI install): unchanged in spirit; gains
  a small additional provisioning step for the Ordinus singleton.

### Open / deferred (resolved during implementation)

- **Ordinus persona editing** — name, avatar, extra instructions. Likely surfaces in
  Settings → Ordinus, possibly with a quick-edit affordance in Home. Out of scope here.
- **Memory panel** — where the user views/edits `ordinus_memory` entries. Likely a
  Home side-panel or a Settings → Ordinus → Memory subsection. Out of scope here.
- **First-run greeting** — Ordinus's first message after workspace creation. Reuses
  the existing greeting mechanism (cf. ADR-027). Copy TBD. *(Superseded for the first-run
  experience by §10: the greeting is static panel/empty-state copy, not an Ordinus
  auto-message — Ordinus stays reactive.)*
- **Log redaction** — `getRunLog` may need a `redactSecrets` filter once we observe
  what leaks (CLI tokens, API responses). Add when needed, not preemptively.
- **`searchRunLogs`** across multiple runs — add when the single-run `getRunLog` proves
  insufficient. Not in initial set.
