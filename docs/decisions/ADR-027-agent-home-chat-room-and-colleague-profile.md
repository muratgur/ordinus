# ADR-027: Agent Home — 1:1 Chat Room And Colleague Profile

## Status

Accepted

Partially supersedes ADR-018 (conversational learning capture and reflection placement).
Builds on ADR-003 (session-backed conversations) and ADR-013 (provider session validity).

## Date

2026-06-02

## Context

The Agent Create flow (`agent-creation-flow.tsx`) and the Workflow designer established a warm,
teammate-like tone: "bring an agent to life", "choose a soul", a greeting pulse, and first words.
The Agents management screen (`agents-screen.tsx`) never adopted that tone. It is a control-center:
a library list plus a four-tab detail panel (Instructions, Skills, Schedules, Settings) made of
config fields — name, role, capabilities, provider/model, sandbox radios, connector toggles, extra
directories. Tuning an agent there reads like configuring a machine, not directing a colleague.

The product intent is the opposite: *"If I added an agent to my team, I should not configure it — I
should direct it."* The Agents screen should be the place where a user talks one-on-one with an
agent and the central place to reach that agent. The existing Conversations area partially provides
this, but it is a multi-agent coordination surface (mentions, routing switch, orchestrator planning,
observability drawers), not a calm 1:1 room.

A prior decision, ADR-018, locked an "ownership through shared history" model but did so under the
explicit premise that **Ordinus has no conversational UI** — it captured learning through
asynchronous Workboard feedback and rejected chat-based capture for that reason. This ADR overturns
that premise by giving every agent a home conversation, so the learning-capture mechanics must be
revisited.

The relevant runtime substrate already exists:

- Session-backed conversations with per-participant `providerSessionRef` and native CLI resume
  (`--resume`); CLIs own context and auto-compaction (ADR-003).
- Silent fresh-session fallback when a session cannot resume (ADR-013).
- A structured per-agent memory store (`agent_memory`) rendered into the agent's system context
  under a `Kalıcı tercihler` heading, with explicit user confirmation (ADR-018, `memory-render.ts`).
- `AgentFeedbackPanel`, `AgentReflectionDialog`, and the create-flow greeting — warm pieces that are
  scattered and disconnected from any agent home.

## Decision

Rebuild the Agents screen as the **agent's home**, modeled on a colleague rather than a tool. The
primary surface is a 1:1 chat room; configuration retreats to a quiet, honest secondary layer.

### 1. The agent's home is a 1:1 chat room

Selecting an agent lands the user in a continuous, Slack/Teams-style direct-message room with that
agent. Talking — giving direction — is the primary action, not filling forms.

### 2. One canonical room per agent (refines ADR-003 direct conversations)

The room **is** a session-backed conversation (ADR-003) with a single participant: a **single
canonical, continuous conversation per agent**, created on first open (find-or-create) and resumed
forever after. This refines ADR-003's "the user can create multiple conversations with the same
agent": the agent home is one persistent room. Work that needs isolation flows to the Workboard
rather than to parallel chat threads. The existing conversation engine and `providerSessionRef`
model are reused unchanged.

### 3. Context is the CLI's job; session breaks degrade gently (extends ADR-013)

Continuity comes from native CLI session resume; the CLIs auto-compact, so Ordinus does not replay
history. When the underlying session cannot resume (invalid session, or the agent's provider/model
changed), Ordinus follows ADR-013's silent fresh-session fallback, and additionally surfaces **one
gentle, non-blocking in-room system line** — e.g. "I might not clearly recall the details of our
earlier conversation." This is the room-context extension of ADR-013: still no modal and no toast,
but a single human-toned line instead of only a hidden diagnostic. Ordinus keeps its own lightweight
transcript (per ADR-003), so the visible message bubbles remain.

### 4. Direction is warm; machinery is quiet (the split)

Two categories that today's Settings tab conflates are separated:

- **Direction** (role, abilities, instructions, working style, learned preferences) is expressed in
  human terms and partly through talking.
- **Machinery** (provider/model, sandbox, extra directories) is genuine admin and stays a sober,
  de-emphasized panel. You direct a colleague; you do not "chat-configure" their security clearance.

### 5. Information architecture: persistent identity header + four tabs

A persistent header (avatar, name, role, presence) sits above four tabs. Avatar/name/role are
inline-editable, reusing the create flow's color+symbol avatar picker (closing the gap that avatar
was previously only settable at creation).

| Tab | Metaphor | Contents (from today's screen) |
| --- | --- | --- |
| **Chat** (default) | DM with a teammate | the 1:1 room |
| **CV** | résumé skills | Skills + Connectors (tools they are fluent with) + Capabilities |
| **Agenda** | their appointment book | Schedules, reframed as the agent's own calendar |
| **About** | who they are + how we work + the admin corner | identity, the working agreement (instructions + learned memory), and a single **"Trust & access"** corner holding sandbox, extra directories, and provider/model |

"Trust & access" is the one place the user is explicitly an admin, not a colleague. All mechanical
residue lives there, so it is honest and contained rather than scattered.

### 6. The room shows bare chat with details on demand

The 1:1 room strips multi-agent chrome (no @mentions, no routing switch, no orchestrator rows). By
default it shows only messages, streaming, and the agent's inline input-requests. Per-message
activity, file outputs, and diagnostics are available behind a quiet "what did they do?" expander —
present for trust, collapsed for calm.

### 7. Talking becomes lasting direction (supersedes ADR-018 §3 and its pin-on-message rejection)

Because the agent now has a conversational home, learning is captured in the room, not only through
asynchronous Workboard feedback:

- **Phase 1 (manual capture):** any message in the room can be turned into a standing rule via a
  light "remember this" gesture, writing to the existing `agent_memory` store. The chat shows a
  subtle "I learned this" confirmation. No model or prompt changes.
- **Phase 2 (agent-proposed):** when the agent detects a standing preference/instruction it offers
  an inline "want me to remember this going forward?", confirmed with one tap. This requires a new
  `proposedRule` field on the conversation outcome schema.

ADR-018's load-bearing principle is **kept**: there is no passive or silent learning; every rule is
committed only on explicit user confirmation, and identity/memory remain separate storage layers.
The asynchronous Workboard feedback affordance also remains for run-based feedback. What changes is
that chat-based capture is now a first-class path, which ADR-018 had rejected for lack of a chat UI.

### 8. Reflection becomes per-agent (refines ADR-018 §6/§7)

Pruning learned rules moves into each agent's **About** tab (review and remove rules in context).
The standalone global reflection dialog is retired. The 14-day stale-agent archiving becomes an
occasional, gentle team-level nudge rather than a dedicated monthly screen.

### 9. First greeting is generated by the provider CLI (refines ADR-018 §1)

The first message in a new agent's room is generated by the agent's own provider CLI, so each agent
greets in its own personality with a short self-introduction, and the same call establishes the
canonical room's `providerSessionRef`. The 3–5s cold start is hidden inside the create→home
transition animation (kicked off when the user commits creation). If the greeting is not ready when
the user arrives, the room shows a gentle "typing…" with the avatar; on generation failure it falls
back to a short canned line. This replaces the create flow's canned greeting with a real first
interaction.

### 10. Team roster and Conversations boundary

The left rail is the user's **team roster** with presence dots (Available / Working… / Off / Needs
setup) instead of flat status. The Conversations nav is retained for now as the **group-room**
(multi-agent) space and will be revisited later; one-on-one threads live in agent rooms. Existing
single-agent conversations are deleted (the product is pre-release), giving a clean split: **Agents =
1:1 rooms, Conversations = group rooms.**

## Alternatives Considered

### Keep Agents as a profile/contact card and deep-link to Conversations for chat
- Pros: smaller change; keeps the two surfaces separate.
- Cons: the 1:1 room is not the home; reaching the agent stays a two-step, control-center feel.
- Rejected: contradicts "the Agents screen is my hub for reaching this agent."

### Fully merge Conversations into Agents (remove the Conversations nav now)
- Pros: one center for all interaction.
- Cons: forces multi-agent coordination into the per-agent home before that model is settled.
- Rejected for now: group coordination is deferred; only the 1:1 boundary is decided here.

### Multiple threads / sessions per agent in the home
- Pros: separates distinct work streams.
- Cons: breaks the continuous-teammate-DM feel; reintroduces "which thread?" overhead.
- Rejected: a single continuous room maps to the colleague metaphor; work isolation goes to
  Workboard. (Multiple per-agent conversations remain technically possible per ADR-003 but are not
  the home model.)

### Distribute machinery (sandbox, dirs, provider) across the metaphor tabs
- Pros: fewer "settings" affordances.
- Cons: security/trust knobs get mixed into "abilities", blurring an honest admin boundary.
- Rejected: machinery is consolidated into one "Trust & access" corner in About.

### Keep observability always-on in the room (warmer styling only)
- Pros: maximum transparency.
- Cons: retains the cockpit feel the redesign is trying to remove.
- Rejected: bare chat by default, details on demand.

### Agent-proposed memory only (no manual capture)
- Pros: most "alive" feeling.
- Cons: reliability depends on the model and needs outcome-schema/prompt changes before any value
  ships.
- Rejected as the starting point: ship reliable manual capture first, layer agent-proposed second.

### Keep ADR-018's "no chat capture / global reflection" model
- Pros: no change to a recently locked decision.
- Cons: its premise ("Ordinus has no conversational UI") no longer holds once agents have a home
  room; async-only capture and a detached monthly screen are weaker than in-context capture and
  per-agent review.
- Rejected: superseded for the affected parts; the durable store and explicit-confirmation rule are
  preserved.

## Consequences

- The Agents screen is rebuilt around a chat room and four humanized tabs; today's panels map onto
  it (Instructions → About working agreement; Skills → CV; Schedules → Agenda; Settings split into
  header identity + CV capabilities + About "Trust & access").
- Reuse is maximized: conversation engine, `providerSessionRef`, `agent_memory`, and the
  create-flow avatar picker are all reused rather than rebuilt.
- ADR-018 §3 (no chat capture) and its pin-on-message rejection are superseded; §6/§7 (reflection
  placement) are refined to per-agent. ADR-018's storage layers and explicit-confirmation principle
  remain in force.
- ADR-013 gains a room-context extension: a single gentle in-room note on fresh-session fallback,
  still without modal/toast.
- Phase 2 (agent-proposed memory) requires a new `proposedRule` field on the conversation outcome
  schema and a prompt change; it is a fast-follow, not a launch blocker.
- A clean Agents=1:1 / Conversations=group split is established; legacy single-agent conversations
  are removed during the pre-release stage.
- Presence semantics (mapping running turns and active schedules to "Working…") must be defined in
  implementation.

## Related

- ADR-003: Session-backed conversations (built on; direct-conversation model refined)
- ADR-013: Provider session validity and fresh-start fallback (extended with an in-room note)
- ADR-018: Agent ownership and learning model (partially superseded)
- ADR-010: Built-in agent profile selection
- ADR-011: Centralized agent observability
- ADR-023: Scheduled agent tasks (surfaced as the Agenda tab)
- ADR-015: External system connectors (surfaced under CV)
- ADR-024: Agent extra directories (surfaced under Trust & access)
