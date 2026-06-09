# ADR-032: Moderator-Routed Advisory Conversations

## Status

Accepted

## Date

2026-06-09

## Context

The Conversations area was originally built to cover both one-agent chat and multi-agent
chat. After ADR-027 moved one-on-one agent chat into the agent's own home (Chat/CV/Agenda/About
tabs), Conversations is left with a single purpose: **discussing a topic with two or more
authorized agents at once.**

Today that multi-agent surface ships only the early modes from ADR-003:

- Manual multi-agent (the user picks recipients via `@mentions`, or broadcasts to all).
- A one-shot "Orchestrator" toggle that routes a single user message to one or more agents
  through a single LLM call (`generateOrchestrationPlan` /
  `app/src/main/runtime/prompts/orchestration.ts`).

This orchestrator is a **router**, not a moderator. Its prompt declares "Your job is routing
only." It sees only the participants list, the mentioned participant ids, and the current user
message. It runs exactly once per user message. Selected agents then execute **in parallel,
fire-and-forget** (`startPreparedConversationTurns`, `app/src/main/ipc/register.ts`), and each
agent sees only the transcript up to the user message — never the other agents' replies from the
same exchange.

The consequence: agents cannot hear each other. The feature behaves as a **panel** (each agent
answers independently), not as a **discussion** (agents build on, agree with, or challenge each
other). The product owner wants the latter — a natural back-and-forth — but without the
unbounded cost and control problems that ADR-003 flagged for autonomous agent-to-agent loops.

ADR-003 already anticipated this as the "Coordinator-Routed Conversation" mode (roadmap step 9)
and required: routing decisions visible to the user, budget limits, maximum turns, loop
detection, stop controls, and clear attribution. This ADR realizes that mode with a specific,
deliberately bounded shape.

## Decision

Promote the existing Orchestrator toggle from a one-shot router into a bounded
**moderator-routed advisory conversation**. The framing is a **danışma kurulu / advisory board**:
the goal is to *gather opinions on a topic*, not to *execute tasks*. This framing is the compass
for every rule below.

### Entry point (no new mode)

The current per-conversation Orchestrator toggle is the gate.

- **Orchestrator OFF** — unchanged behavior. Mentions route to the mentioned agents; no mention
  broadcasts to all; agents run in parallel, one shot. Zero behavior change, zero new risk.
- **Orchestrator ON** — the moderator-routed advisory discussion defined here.

### The moderator

The existing orchestrator LLM call is upgraded from a router to a moderator. Three concrete
extensions to `buildOrchestrationPrompt` / `generateOrchestrationPlan`:

1. **It sees the discussion.** Its input gains a `transcript` field carrying a **sliding window**
   of the most recent turns (not the full history — see Cost below).
2. **It runs after every agent turn**, not only at the start of the exchange, to decide who
   speaks next.
3. **It can end the discussion.** The `action` enum gains `conclude` (alongside `route`), and a
   concluding plan also carries the final `summary`.

### Flow when Orchestrator is ON

1. The user puts a question to the room.
2. The moderator selects the **relevant** agents for the topic (typically 2–3) from their roles.
   If the user `@mentioned` a subset, the moderator is **bounded to that subset** — mentions are a
   membership list for this discussion, consistent with ADR-003's "mentions are signals."
3. Selected agents speak **sequentially** (replacing the parallel fire-and-forget path). Each
   agent's turn is fed the **last 1–2 messages** of preceding turns, with **speaker attribution**
   ("Ayşe said: …"), so it can respond to what was just said. Each agent's own provider session
   (ADR-003, ADR-009) still retains its long-term context; only the recent cross-agent turns are
   added.
4. After each turn the moderator runs again: pick the next speaker, or `conclude`.
5. **Fixed turn cap: 3–4 agent turns.** The discussion stops at the cap or when the moderator
   concludes, whichever comes first.
6. On conclusion the moderator produces the **final synthesis** in the same `conclude` call — no
   extra LLM round trip.

### Advisory-board rules

- **Agents do not ask the user questions.** During an Orchestrator-ON discussion the
  `needs_input` outcome (ADR-005) is suppressed; an agent states its assumption explicitly and
  gives an opinion (`final_response`) instead. This keeps the autonomous (watch-only) loop clean.
  Task execution that legitimately needs `needs_input` belongs to Workboard, not to advisory
  conversations.
- **The user is an observer with one lever: stop.** The discussion runs autonomously to its cap.
  The user cannot interleave a turn mid-discussion; the only intervention is **cancel**, which
  ends the discussion so the user can re-send with new direction. The existing "no new message
  while a turn is running" guard is preserved.
- **Resilience.** A failed agent turn is recorded (`conversationTurns.status = 'failed'` + `error`)
  and surfaced in the UI; the moderator continues with the survivors. If **all** participants
  fail, the discussion ends cleanly with a "could not run" state.

### Cost discipline

Carrying the full transcript to every agent on every turn is rejected as too expensive. Two
controls:

- The moderator and the agents receive a **sliding window** (recent turns only), not the full
  history. Window size is a tunable implementation detail, starting small (last 1–2 messages).
- Per-agent long-term memory stays in the provider session; cross-agent context added per turn is
  limited to the few most recent replies with speaker labels.

The turn cap (3–4) bounds total LLM calls: an N-turn discussion costs ~2N calls (one agent + one
moderator per turn) plus the initial routing.

### Presentation

While running, agent turns appear live ("Ayşe is writing…"). On conclusion, the agent turns
**collapse** and a single **Result card** (the moderator's synthesis) is promoted to the top, with
a "▸ See discussion (N agents)" disclosure that expands the intermediate turns. The default view is
the conclusion; the deliberation is available on demand for transparency and audit. Intermediate
turns are never deleted.

## Alternatives Considered

### Keep the one-shot router (panel behavior)

- Pros: cheapest; already shipped.
- Cons: agents never hear each other; not the discussion the product wants.
- Rejected: fails the core goal.

### Free agent-to-agent turn-taking (agents take their own turns)

- Pros: most natural.
- Cons: the unbounded, hard-to-stop loop ADR-003 explicitly deferred (roadmap step 10).
- Rejected for now: this ADR keeps the moderator and the fixed cap as the control surface.

### Pre-planned speaking order (moderator plans the whole order up front)

- Pros: one moderator call, cheap.
- Cons: order is frozen before anyone speaks, so agents cannot actually respond to each other —
  a disguised panel.
- Rejected: defeats the purpose of a discussion.

### User as an in-discussion participant (interject between turns)

- Pros: most like a real meeting.
- Cons: requires pausing/resuming running turns and relaxing the running-turn guard — the
  concurrency complexity the product owner wanted to avoid first.
- Deferred: start observer-plus-cancel; revisit if needed.

### Let agents ask the user questions mid-discussion (`needs_input`)

- Rejected for advisory conversations: a board gives opinions under stated assumptions; it does
  not block on the user. Reintroduce only if Conversations later grows a "discuss then execute"
  step.

## Consequences

- The Orchestrator toggle changes meaning from "one-shot routing" to "moderated discussion."
  OFF behavior is unchanged, so existing manual/broadcast users are unaffected.
- `startPreparedConversationTurns`' parallel fire-and-forget path is replaced by a sequential,
  moderator-driven loop for Orchestrator-ON conversations.
- The orchestration contract grows: `transcript` input, `conclude` action, `summary` output.
  `OrchestrationPlanSchema` and the orchestration prompt change accordingly.
- `needs_input` is conditionally suppressed for Orchestrator-ON turns; this is a behavioral
  narrowing of ADR-005 scoped to advisory conversations only.
- The renderer gains a Result card + collapsible discussion view.
- This realizes ADR-003's Coordinator-Routed mode while still deferring its autonomous
  agent-to-agent mode (ADR-003 roadmap step 10).
- Budget, max-turn, loop bounding, stop control, and attribution — ADR-003's preconditions for
  this mode — are all satisfied by the fixed cap, the cancel lever, and per-turn speaker labels.

## Open Implementation Details

- Sliding-window size (last 1–2 messages vs. last full turn) — tune empirically.
- Exact turn-cap value within the 3–4 range — start at 4.
- Attribution format for cross-agent context ("Ayşe said: …") — required, format is cosmetic.
