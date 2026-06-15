# ADR-048: Ordinus Assistant Redesign — Concierge Identity, Live Self-Knowledge, Provider-Neutral

## Status

Proposed

Amends and extends **ADR-029** (Ordinus in-app personal assistant). Does not supersede it;
re-grounds Ordinus's *purpose* (executive-assistant concierge that builds the user's mental
model), its *self-knowledge* (static concepts vs. live introspection), its *tool catalog*
(adds preparation + navigation tools behind a hard "no domain work" line), its *provider
neutrality* (identity layer carries no provider steering), and its *visual + verbal identity*
(a signature character; "warm professional" voice).

Supersedes the **visual** decision in [[project_ordinus_home_design]] (the "concentric ring"
abstract mark): the ring is retained only as a halo motif behind a new character. Keeps the
ADR-029 §6 prompt lifecycle (assembled once at session init), ADR-037 token-efficiency
posture, ADR-038 mascot art system (Ordinus is a distinct class within it), ADR-045 Settings
wiring, ADR-028 first-run onboarding (the technical setup stages are unchanged; a new
Ordinus self-introduction stage is appended).

## Date

2026-06-15

## Context

Ordinus is the user's front door to the application. But the people we are onboarding have
**no prior mental model for coordinating work across multiple agents** — in their working
lives they do their own work themselves; they have never directed a team of specialists.
The product asks them to do exactly that. Ordinus must therefore behave like an **executive
assistant / trusted right hand**: it does not do the work, it helps the user direct the work,
clears confusion, and builds the mental model.

Two gaps block this today:

1. **Ordinus does not know itself well enough.** The knowledge pack has fallen behind the
   product (connections, workflow designer, scheduled tasks, skills, managed MCP connectors
   shipped after it was written). An assistant that misdescribes the app is worse than none.
   It also gives agent-creation advice unrelated to the real creation flow.
2. **First contact is wrong.** Onboarding is a generic *app tour*, not an introduction to
   Ordinus. A past attempt at having Ordinus auto-message the user on Home destroyed the
   empty state and pushed users toward a single action; it was removed.

Additional constraints surfaced during design (grill-me, 2026-06-15):

- A live Ordinus session has meaningful first-token latency (~7–8s) and unpredictable output
  — unacceptable for a scripted first-contact experience.
- The infra is *already* provider-neutral (`ordinus_singleton.providerId/model`, per-conversation
  provider; Codex/Claude/Gemini). The real coupling is in **prose/behavior**, not architecture.
- The app dependency chain is **agent → connection → work** — without an agent, Workboard /
  Conversations / Schedules are dead ends.

## Decision

### 1. Positioning — proactive onboarding, reactive thereafter

Ordinus is **proactive during first contact and when the user is stuck**, **reactive in the
normal flow** of an experienced user (no unprompted status reports, no notification spam).
This preserves the ADR-029 "reactive presence" posture for steady-state use while letting
Ordinus carry the onboarding and recovery moments.

The single legitimate source of steady-state proactivity is the `attention` block of
`get_app_status` (§7) — e.g. surfacing a run that is waiting for user input when the user
returns. Ordinus does not scan or volunteer beyond that.

### 2. The bright line — "hands and feet, but does not do the work"

> Ordinus reads the application's internal state, edits it, and **prepares objects on the
> user's behalf** (agent / work request / workflow / schedule drafts) — but **never does
> domain work** and **never runs anything irreversible without the user pulling the trigger.**

Three concrete prohibitions:
1. **No domain work** — no writing code, sending mail, editing files, or calling connector
   tools (post a tweet, send an email). That is the **agents'** job.
2. **No reading external services** — Ordinus reads *application* state (who is connected,
   how many agents exist), never external content (Gmail/X). The outside world is the agent's.
3. **No autonomous triggering** — Ordinus *prepares* a work request; the **user dispatches it**.

### 3. Identity, voice, persona

- Name **Ordinus** (fixed). **Neutral** persona/pronoun. **Multilingual** (matches the user's
  language).
- Voice: **"trusted senior companion" / warm professional.** Warmth comes from reliability,
  not chattiness — no emoji, no fake enthusiasm, no small talk; short; more protective and
  calm in a crisis. Familiarity is built through **memory** (remembers the user's name and
  past work, references it), not pleasantries.
- **Anchor metaphor — "you are directing your own expert team."** Agent = expert teammate,
  Ordinus = right hand / EA, work request = an assignment, workflow = a recurring process,
  schedule = a routine. Used consistently across all copy, buttons, and Ordinus's speech.
  Rationale: users are strangers to "multiple AI agents" but fluent in "running a team";
  binding the unknown to the known is the fastest path to the mental model.
- **Teaching is just-in-time + by doing**: Ordinus frames a concept in one sentence the first
  time it is relevant, and does the first instance *with* the user, then recedes. No upfront
  lectures, no dependence on the user knowing what to ask.

### 4. Visual identity — a signature character (distinct class within ADR-038)

Ordinus gets a single, fixed, **static** signature character derived from the base mascot
(`docs/Chars/Base.png`), differentiated from the agent mascot family by three levers:

1. **Reserved brand color** outside the six agent colors (tied to `--primary`) — no agent can
   take it.
2. **Halo/ring motif** behind the character — inherits the old concentric-ring mark; agents
   have no halo, signalling "above the roster / the app's intelligence."
3. A subtle, professional **headset** (concierge / EA signifier).

Not user-customizable (Ordinus's identity must be constant and trusted). Built to WebP via a
pipeline analogous to `app/scripts/build-mascots.mjs`. State-based animation (listening /
thinking / pleased) is explicitly **deferred** — static first.

### 5. Onboarding — Ordinus introduces itself (replaces the app tour)

```
Technical setup (existing, unchanged)        Ordinus self-introduction (NEW)
provider install → workspace → verify  ──►   character appears → identity → team metaphor
                                             → what I do / don't do → "let's begin"
                                                        │
                                                        ▼
                                             lands in Home empty-state; a suggestion is
                                             pre-filled in the input; the USER sends it
```

- The intro is **NOT a feature tour.** It is identity + the team metaphor + the first step.
  Feature discovery happens later, just-in-time, through Ordinus.
- The intro is **scripted + animated, not a live LLM session** — pre-written messages with a
  "Ordinus is typing…" rhythm and a typewriter/streaming reveal, advanced by the user
  ("Continue"), click-to-skip a message's animation, `prefers-reduced-motion` respected.
  3–5 short bubbles beside the character portrait. Skippable. Scripted text is multilingual
  and provider-neutral. This avoids the latency/unpredictability of a live session.
- The **first real Ordinus session starts only when the user sends their first message** in
  the chat — the empty state is preserved and Ordinus never talks to itself.
- First-step suggestions follow the dependency chain and are **not an equal menu**: lead with
  **create an agent**, then **connections**; Workboard/Schedule come later (meaningless with
  no agent). No free-text question is asked during onboarding (latency + unpredictable input).

### 6. Flows — preparation + handoff, never execution

- **Agent creation** (resolves the disconnect between Ordinus's advice and the real flow):
  Ordinus matures the intent in chat, then calls **`propose_agent`**, which feeds the *single*
  existing profile engine (`generateAgentDraft`) so Ordinus and the manual wizard share **one
  quality standard**. Ordinus's value is the conversation + distilling a rich brief; the
  standard lives in one engine. The draft skips wizard stage 1 and opens the **"shape"
  pop-up** (name / avatar / color); the user confirms; the agent is created. Ordinus then
  explains what the agent can do, points to connections, and suggests starter messages for
  the agent's own 1:1 chat.
- **Connections**: Ordinus **guides and reminds** (infers the need from the agent's purpose,
  routes the user to Connections, reminds them to attach it once done) but does not run OAuth
  itself — that crosses the security boundary and belongs in the Connections UI.
- **Handoff** is a single capability, **`navigate_and_prefill`**: go to a target surface and
  **pre-fill its input — never auto-send.** The send decision is always the user's. One
  mechanism serves onboarding→Ordinus, Ordinus→Connections, Ordinus→agent chat,
  Ordinus→Workboard/Schedule. It renders as a **distinct, recognizable chip** that stands out
  as Ordinus's own action but does not dominate the transcript.

### 7. Self-knowledge — static layer + live layer

The principle: **write what does not change; read what does.** Anything volatile that is
written into prose goes stale; reading it live cannot.

**Static layer (hand-written, stable concepts)** — six files:

| File | Holds |
| --- | --- |
| `core-identity` | who Ordinus is, role, the bright line (§2) |
| `voice` | tone rules (§3) |
| `mental-model` | the anchor metaphor + how to teach it (§3) |
| `concepts` | what each thing *is* (agent / work request / workflow / schedule / connection / skill) — concepts, not lists |
| `guiding-playbooks` | patterns for common situations ("I don't know what to do", "automate X", "a run failed") |
| `tools` | when/how to use each tool, confirmation rules, `get_app_status` discipline |

Removed from prose (now read live): connector lists, provider names, "screen X has Y".

**Live layer (read on demand, never stale):**

1. **Session-start snapshot** — a compact, freshly-rendered status digest injected into the
   system prompt at session init, labeled *"as of session start"*. Gives baseline awareness
   with no tool round-trip. Allowed to age.
2. **`get_app_status` tool** — live at call time; supersedes the stale snapshot. Payload:
   `onboarding{completed,stage}`, `providers[]{id,installed,connected}`,
   `connections{connected[],available[]}` (names, for guidance), `agents{count,enabled}`,
   `attention{runningCount,waitingForUserCount,recentFailures}`, and counts for
   `schedules/workflows/skills`. No detail (names/emails/tool lists) — those come from lazy
   tools. **Prompt discipline** tells Ordinus when to refresh (before asserting connection/
   provider state, after directing the user to connect something).
3. **Lazy detail tools** — `list_connectors`, `list_schedules` (typed). Workflows/skills via
   `run_sql_readonly` in phase 1.
4. **Event-push** (active session learns of a state change without polling) is **deferred to
   phase 2**.

### 8. Tool catalog

| Category | Tools |
| --- | --- |
| **Read** | `get_app_status` 🆕, `list_agents`, `list_recent_work_requests`, `get_run`, `get_run_log`, `list_connectors` 🆕, `list_schedules` 🆕, `memory_search`, `run_sql_readonly` |
| **Prepare (confirmation-gated)** | `propose_agent` 🆕, `propose_work_request`, `create_schedule`, `create_workflow` |
| **Navigate** | `navigate_and_prefill` 🆕 |
| **Remember** | `memory_write` |
| **Undo (destructive, confirmation-gated)** | `cancel_work_run`, `archive_work_request`, `delete_schedule` |

`propose_work_request` **prepares; the user pulls the trigger.** Deliberately absent: mail/
file/code tools, connector calls, external reads, autonomous agent execution.

### 9. Provider neutrality

The identity layer carries **no provider steering**. Provider names appear only when pulled
from **live provider status** (e.g. "nothing is connected — let's connect one"), never
hard-coded in prose. Runtime soft-assumptions (sandbox plan-mode, Codex tool-approval,
strict structured output) are **out of scope** — they stay encapsulated in the adapters.

### 10. Anti-staleness process

Knowledge-pack updates become part of **definition of done**: the `documentation-and-adrs`
skill gains a checklist item — *"Does this change affect a concept Ordinus knows? If so, were
`concepts` / `guiding-playbooks` updated?"*

## Implementation phasing

Ordered by dependency; each phase is independently shippable.

- **Phase 0 — Knowledge & provider neutralization (no new infra).**
  Rewrite the knowledge pack into the six static files (§7); neutralize the one provider-
  steering string (`recipes.md`); add the team metaphor, voice, and bright line. Lowest risk,
  highest immediate correctness gain.
- **Phase 1 — Live self-knowledge.**
  Add `get_app_status` (read-only wrapper over `runtime.getProviderStatuses()` +
  `listConnectors()` + counts) and the session-start snapshot in `assembleSystemPrompt`; add
  `list_connectors` / `list_schedules`; add the prompt discipline for refresh. Now Ordinus
  knows itself and the live state.
- **Phase 2 — Handoff capability.**
  Add `navigate_and_prefill` + the distinct handoff chip (never auto-send). Unlocks the
  guided flows.
- **Phase 3 — Smart agent creation.**
  Add `propose_agent` feeding `generateAgentDraft`; wire the "shape" pop-up entry that skips
  wizard stage 1; post-creation guidance (connections + starter messages).
- **Phase 4 — Onboarding self-introduction.**
  New scripted+animated intro stage after technical verify; character portrait; lands in
  empty-state with a pre-filled suggestion; skippable. Depends on the character asset.
- **Phase 5 — Visual identity.**
  Produce the signature character from `Base.png` (reserved color + halo + headset); WebP
  build; wire as Ordinus's avatar across Home/top-strip/onboarding. Static only.
- **Phase 6 (deferred).** State-based character animation; `get_app_status` event-push;
  typed `list_workflows` / `list_skills`.

## Consequences

- Ordinus becomes a genuine concierge that knows the current product and builds the user's
  mental model, instead of a knowledgeable-but-stale chat box.
- The knowledge pack stops going stale by construction (live layer + DoD process).
- The bright line is enforceable in the tool catalog, not just prose.
- New cost: a character art asset and a scripted onboarding stage to maintain; the team
  metaphor must be applied consistently across all product copy (a cross-cutting copy task).
- Token cost rises slightly (session-start snapshot + a few read tools); mitigated by keeping
  the snapshot compact and detail tools lazy (ADR-037 posture).

## Open / deferred

- Exact scripted onboarding copy (per language) and the handoff-chip visual spec are
  implementation details, not decided here.
- Event-push freshness, state-based animation, and typed workflow/skill list tools are
  deferred to phase 6.
