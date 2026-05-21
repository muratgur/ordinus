# ADR-018: Agent Ownership And Learning Model

## Status

Proposed

## Date

2026-05-21

## Context

Ordinus shipped with the vision that users would create their own agents from
scratch. Built-in profiles were later added (see ADR-010) to lower the cost of
getting started. In practice, real usage has converged on a different pattern:
users pick from the built-in library and never customize. The profile becomes a
faceless tool rather than a teammate, and the library grows into a long tail of
agents the user cannot tell apart.

Investigation with a heavy user surfaced two concrete pain points:

- **Decision fatigue at manual selection.** Auto-selection from workboard
  works. But when the user wants to override and pick a specific agent, the
  list shows many names with no recall hook. "Which one was this, what did it
  do?" becomes a small but recurring tax on every override.
- **Loss of ownership.** Users do not feel any of the library agents are
  *theirs*. The "Describe with AI" creation flow exists, but it is so
  frictionless that users describe vaguely, accept the AI draft without
  reading, and click add. No bond is formed. Without a bond, there is also no
  motivation to refine the agent over time.

A natural-sounding fix is to introduce **teams** or **groups** to organize the
library. Investigation rejected this: teams add a second hierarchy layer
("which team? which agent in the team?") and do not address ownership. The
real ownership signal is not creation — it is shared history. A user owns an
agent the way they own a relationship: by working with it, correcting it, and
seeing it remember.

This ADR locks the redesign. It deliberately leaves provider-specific
mechanics and storage cache strategy to the implementation step.

Relevant existing code:

- `app/src/main/agents/profiles.ts` — built-in catalog, draft construction.
- `app/src/main/agents/filesystem.ts` — per-agent home, current `SKILL.md`
  storage convention.
- `app/src/renderer/src/screens/agents-screen.tsx` — agents management surface.
- `app/src/shared/agent-profile-template.ts` — profile instruction renderer.

## Decision

Reorganize the agent module around the principle that **ownership comes from
shared history, not from creation**. Concretely:

### 1. Creation is a bond ritual, not a form submission

Keep the "Describe with AI" flow. After the AI draft is produced, the user
must pass through a **non-dismissable first-contact modal** before the agent
is saved:

- A pre-filled opener ("Kısaca ne iş yapacaksın, nasıl yardımcı olacaksın?")
  is sent to the agent. The agent replies briefly with a short, animated
  response. This is the first real interaction.
- The user must give the agent a **name** of their own (the AI suggestion is
  visible in the upstream form but must be re-confirmed or replaced in the
  modal).
- The user must pick an **avatar** from a curated visual library. No random
  Dicebear fallback.

The modal cannot be skipped. This is the load-bearing piece against library
sprawl: a user who is not willing to spend ten seconds bonding with an agent
will not add it, which is the desired outcome.

### 2. Manual selection ordering: recency + frequency, no grouping

When the user opens the agent picker on the workboard, the list is ordered:

1. Recently used agents
2. Frequently used agents
3. Everything else

Each row carries a usage trace ("3 gün önce X işinde kullanıldı") so the user
recognizes the agent from history rather than from re-reading a description.
No teams, no tags, no categories.

### 3. Learning is captured through asynchronous feedback, not chat pins

Workboard is task-based, not conversational. There is no chat surface to pin
messages on. Instead:

- Every completed job exposes a feedback affordance.
- Feedback is free text plus an explicit toggle: *"Bunu kalıcı kural yapayım
  mı?"*
- If the user opts in, the rule is committed to the agent's memory store.
- Feedback is asynchronous: the user can return hours or days later.

There is no passive or silent learning. The agent never changes behavior
without an explicit confirmation from the user.

### 4. Three-layer agent storage

```
Agent Profile (identity)   →  filesystem, edited rarely
Agent Memory  (learning)   →  SQLite, structured rule list, append/prune
Skills        (capability) →  filesystem, independent modules
```

`agent_memory` schema (Drizzle):

```
agent_memory
  id TEXT PRIMARY KEY
  agent_id TEXT (FK)
  rule TEXT
  source_feedback_id TEXT NULL
  created_at INTEGER
  active INTEGER (1/0)   -- soft delete
```

Memory is agent-scoped. Two copies of the same library agent have independent
memories.

### 5. Runtime injection through the provider system channel

At agent run time, the provider runtime adapter:

1. Renders the agent profile (identity).
2. Loads active rules from `agent_memory` and renders them under a `Kalıcı
   tercihler` heading.
3. Concatenates both into the system-level context that the CLI provider
   ingests (e.g. `CLAUDE.md`, `AGENTS.md`, or the equivalent file for the
   active provider).
4. Starts the CLI; the user's workboard request becomes the user-role
   message.

Memory never leaks into the user prompt. The user does not see it during
normal operation; they manage it through the agent settings screen and
through the periodic reflection (below).

### 6. Periodic reflection: one screen, two jobs

A monthly "Agent reflection" screen does both jobs the design needs:

- For each active agent: list current memory rules with an *"Hâlâ geçerli
  mi?"* prompt for each. Edit and delete inline.
- For agents that have been untouched for 14 days: offer batch archive.

This is the second ownership moment after the creation ritual. The user
becomes the editor of their own agent collection, on a cadence the system
prompts but does not enforce.

### 7. Long-tail management: 14-day silent archive

Agents untouched for 14 days are auto-archived. Archive is reversible. There
is **no distinction** between library-added and user-created agents — one
uniform rule. Deletion remains a manual action.

## Alternatives Considered

### Teams / groups for organizing the library
- Adds a second hierarchy ("which team? which agent in the team?") that
  recreates the original decision-fatigue problem one level up.
- Teams do not produce emotional attachment; users bond with individual
  agents, not with collections.
- **Rejected.**

### Tags as a lighter form of grouping
- Same conceptual cost as teams once a user is asked "which tag filter?"
- Only worth the bookkeeping if the library is genuinely large; current
  scale does not require it.
- **Rejected for now**, may revisit if the library outgrows simple search.

### "Why are you adding this?" sentence at creation time
- Users do not yet know why they need an agent at creation time. The
  question generates either blank text or polite filler. Adds friction
  without value.
- **Rejected.**

### Passive / silent learning from user corrections
- An agent that updates itself behind the user's back is unsettling and
  hard to debug.
- The agent can also learn the wrong pattern; the user has no chance to
  intercept.
- **Rejected.** All learning is explicit.

### Visual aging / fading of unused agents
- Adds visual noise on top of the recency ordering, which already encodes
  the same information through position.
- **Rejected.**

### Pin-on-message ("📌 bunu hatırla") in chat
- Assumes a conversational UI that Ordinus does not have. Workboard
  produces job outputs (MD files, summaries), not a back-and-forth
  conversation with pinnable turns.
- The same intent is fully covered by the feedback-with-toggle mechanism
  in §3.
- **Rejected.**

### Store learned rules in the agent's system prompt directly
- The system prompt is identity. Mixing identity with accumulated
  preferences makes both harder to edit and grows the prompt without
  bound.
- **Rejected.** Identity and memory are separate layers.

### Store learned rules as a skill
- Skills are reusable, shareable capability bundles. Personal preferences
  ("Murat 3 maddeyi geçmesin der") are agent-scoped, not capability-scoped.
  Wrong abstraction.
- **Rejected.**

### Remove the from-scratch creation path entirely
- The "Describe with AI" flow does have a place for users who want to
  describe a role that does not exist in the library. With the new bond
  ritual gating it, it no longer contributes to sprawl.
- **Kept.**

## Consequences

### Positive

- Manual agent selection becomes a recognition task rather than a recall
  task. Decision fatigue drops without adding hierarchy.
- The creation modal forces enough engagement to produce ownership without
  asking users to do work they cannot do (writing a "why" sentence cold).
- Memory is structured, queryable, and editable as a list. Periodic
  reflection becomes a concrete UI task instead of a vague "tidy up your
  agents."
- Storage layers are cleanly separated. Skills can be moved between agents
  without dragging personal preferences with them.
- Library sprawl has two natural brakes: the creation ritual at the
  entrance and the 14-day archive at the exit.

### Negative

- Implementation work is non-trivial: a new SQLite table, a runtime
  rendering step in every provider adapter, a new modal flow, a new
  periodic reflection screen, and changes to the agent picker.
- The non-dismissable creation modal will frustrate users who want to add
  ten agents quickly to test something. This is the intended trade-off —
  the modal exists *because* fast bulk adds are the sprawl path.
- Per-provider system channel rendering means each provider adapter must
  be updated when memory is introduced. Adapter parity becomes part of
  the rollout plan.

### Decided at implementation

The following points are deferred from this ADR and will be resolved during
implementation rather than re-debated here:

- **Per-provider system channel render.** Each CLI provider (Claude Code,
  Codex, Gemini) has its own auto-loaded system file convention
  (`CLAUDE.md`, `AGENTS.md`, etc.). The render path lives in the
  provider runtime adapter and is decided per provider.
- **Memory render cache strategy.** Whether memory is re-rendered on every
  run or cached and invalidated on change is a performance/consistency
  trade-off to settle when the first adapter is wired.
- **Library categorization.** Current library size is small enough that
  search + recency surfacing is sufficient. Categorization is revisited
  when the library outgrows simple browsing — not in this ADR.

## Related

- ADR-001: Opaque agent identifiers
- ADR-004: Agent disable and hard delete
- ADR-009: Work-request scoped agent sessions
- ADR-010: Built-in profiles as the default agent creation path
- ADR-011: Centralized agent observability
