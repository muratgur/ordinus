# ADR-016: Capability-Aware Workboard Planning

## Status

Accepted

## Date

2026-05-19

## Context

The Workboard request planner takes a user's natural-language work request and
breaks it into agent-owned work items (see ADR-007). In practice it assigns
nearly everything to a single agent even when the user has a fleet of
specialized agents that should divide the work.

Two compounding root causes were identified by reading the code:

1. **The planner cannot see agent capabilities.** When building the plan
   prompt, `buildWorkboardPlanPrompt()`
   (`app/src/main/runtime/prompts/work-plan.ts` ~226-241) serializes only
   `name`, `role` (max 120 chars), `requestedWork`, `providerId`, and `model`
   per agent. It does **not** see `instructions` (where expertise actually
   lives), `connectors` (the strongest objective capability signal — e.g.
   which agent can read Jira vs. query Datadog), or filesystem skills. A
   120-char role is insufficient for specialization matching.

2. **The prompt actively discourages splitting.** The split rules
   (`work-plan.ts` ~129-150) instruct the model to "Default to the SMALLEST
   number of Work Items… split ONLY when (a) different agents needed…". Because
   the planner cannot tell that different agents are needed (cause 1), it never
   triggers the split exception. The two causes reinforce each other.

Motivating example: "Pull this Jira item, find the alert number, investigate it
in Datadog, and write me an investigation report" is routed to one agent,
despite being a clean three-way split across a Jira-reading agent, a
Datadog-analysis agent, and a report-writing agent.

A broader idea — letting agents create new work items mid-flight and append
them to a running Workboard run — was explored first and **explicitly
rejected** for now. It reintroduces the chaos of an agent silently rewriting an
in-flight plan (pre-empting downstream items, race conditions between proposal
approval and dispatch) and was deemed disproportionate complexity for the
actual need. The real need is better up-front planning, not dynamic replanning.

## Decision

Make the planner capability-aware via a two-sided change: give it the data, and
remove the prompt bias that suppresses splitting.

### 1. New stored `capabilities` field on agents

- Add a `capabilities` column to the `agents` table
  (`app/src/main/db/schema.ts` ~20-33).
- Add `capabilities` to `AgentDraftSchema` and `AgentUpdateSettingsInputSchema`
  (`app/src/shared/contracts.ts` ~171-199), Zod-enforced with a hard
  **~300 character** maximum, in the same style as `role`'s constraint.
- Persist it in `createAgent` and `updateAgentSettings`
  (`app/src/main/db/database.ts`).

The ~300 char cap is deliberate: capabilities for *all* enabled agents are
injected into a single plan prompt, so length has a multiplicative cost. The
limit forces concision (~2.5× the `role` cap) while leaving room for the
intended content pattern: *what work this agent is best at + which
capability/connector boundary it owns + when to route elsewhere*. This content
rule is embedded in the AI-generation prompt and the form placeholder so it
stays aligned with the split rule below.

### 2. Population per creation path (single source: `instructions`/intent)

All three agent-creation paths converge on `AgentDraft → createAgent()`:

- **Profile preset**: add a **new dedicated `capabilities` key** to the
  frontmatter of `app/resources/profiles/software-engineering/*.md`. Do **not**
  reuse the existing `summary` key — `summary` exists for catalog display and
  conflating the two concerns would create coupling that bites later.
- **AI-described**: add `capabilities` to `agentDraftOutputJsonSchema`
  (`app/src/main/runtime/prompts/agent-draft.ts` ~6-75) so the LLM generates it
  alongside name/role/profile.
- **Manual**: if the user leaves `capabilities` empty, the system
  auto-generates and fills it; if the user wrote something, that text is kept
  verbatim. There is **no automatic regeneration on edit** (it must never
  overwrite user-authored text). Instead the form offers an explicit "Improve
  with AI" button (`app/src/renderer/src/screens/agents-screen.tsx`) — opt-in,
  user-controlled, mitigating staleness without silent overwrites.

### 3. Surface capabilities + connectors to the planner

Extend the agent serialization in `buildWorkboardPlanPrompt()` to include
`capabilities` and `connectors` for each enabled agent.

### 4. Revise the split rule (surgical, not a rewrite)

Replace the "Default to SMALLEST number of Work Items, split ONLY when…" bias
in `work-plan.ts` with an **objective, capability/connector-boundary** rule:
split work where a step requires a different connector or a clearly distinct
capability declared in an agent's `capabilities`; keep single-connector,
single-capability work as one item. The existing dependency/parallelism
guidance is retained. The Jira→Datadog→report example then naturally produces
three items mapped to three agents, while "pull two Jira items" stays one item
— preventing both under-splitting (today) and over-splitting (the new failure
mode).

## Alternatives Considered

### Mid-flight agent-created work items (proposal queue)

- Agents detect scope gaps while running and propose new work runs (`proposed`
  status) that the user approves; proposals could place a provisional hold on
  declared downstream items.
- Rejected: high complexity and the original chaos this work set out to avoid —
  an agent mutating a running plan, plus approval/dispatch race conditions
  (a `feeds_into` proposal is meaningless if its target already ran). The
  underlying need is better up-front planning, which this ADR addresses
  directly. May be revisited later as an opt-in "auto-approve"-style feature
  once capability-aware planning is proven.

### Agent subtask decomposition

- Let an agent split its own assigned item into sub-items for traceability.
- Rejected: mostly generates noise; a single agent already sequences its own
  work internally.

### Derive capabilities at plan time instead of storing

- Summarize each agent's `instructions` (Strengths/Boundaries sections) +
  connectors on the fly when building the plan prompt; no schema change, never
  stale.
- Rejected: invisible and non-inspectable — the user could not see or correct
  why an agent was chosen, and it contradicts the desired mental model of
  capabilities as visible, editable agent "frontmatter". The hybrid
  (stored + auto-seeded + user-overridable + "Improve with AI") captures the
  freshness benefit without the opacity.

### Inject full `instructions` into the planner prompt

- Rejected: unbounded, noisy, inconsistent, and token-expensive across the
  whole fleet. A bounded purpose-built field is a cleaner signal.

### Two-phase planner (decompose into capability blocks, then assign)

- Rejected for the first version: a second LLM call enlarges the architecture.
  The single-call objective split rule achieves the same outcome; this can be
  evolved into a two-phase design later if needed.

### Remove the split bias entirely (let the LLM decide freely)

- Rejected: non-deterministic, low reproducibility, and the prompt-level form
  of the over-splitting chaos. An objective boundary criterion is auditable.

## Consequences

- One generation mechanism (seed from `instructions`/intent) covers all three
  creation paths; no per-path bespoke logic.
- The planner gains an auditable basis for assignment ("this agent owns the
  Datadog connector / declared this capability"), making plans easier to
  understand and correct.
- New surface area to maintain: a schema column + migration, three Zod schemas,
  the profile frontmatter key across all preset files, the draft output schema,
  and one form field with an "Improve with AI" action.
- Profiles need a one-time backfill of the new `capabilities` frontmatter key.
- Staleness is possible if a user edits `instructions` but not `capabilities`;
  consciously accepted and mitigated by the opt-in "Improve with AI" button
  rather than silent regeneration.
- Plan-prompt token cost grows with fleet size; bounded by the ~300 char cap.
- Out of scope and deliberately not built: agent mid-flight task creation,
  proposal queue, auto-approve, two-phase planner, injecting full
  instructions.
