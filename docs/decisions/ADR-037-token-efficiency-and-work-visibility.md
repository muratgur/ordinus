# ADR-037: Token Efficiency Instrumentation And Cross-Item Work Visibility

## Status

Accepted

Amends ADR-030 (database-backed result content and handoffs): the same-session
duplicate-content case is removed from inline handoffs, the rejected "lazy fetch via an
agent tool" alternative is partially adopted as a *complement* (scoped read-only tools, not a
replacement for inlining), and a per-request digest file is added without reinstating
file-based handoffs. Amends ADR-029 (Ordinus in-app personal assistant): the
assistant-only tool boundary is refined — Workboard worker agents gain a *scoped read-only
subset* of the Ordinus tool catalog, never the full catalog. Amends ADR-014 / ADR-031
(work request destination and context): plan-time dependencies can now bind new Work Items
to *existing* completed runs, both automatically (planner) and manually (plan review UI).
Amends ADR-011 (centralized agent observability): the observability pipeline now captures
provider token usage per run. Builds on ADR-009 (request-scoped agent sessions) and
ADR-036 (run inspector bottom sheet); neither is changed.

## Date

2026-06-11

## Context

Ordinus exists so ordinary users can run agents on their existing Codex / Claude / Gemini
CLI subscriptions. Subscription limits make token efficiency a product constraint, not an
optimization nicety.

A measurement session over real usage logs (Codex `turn.completed` usage events in
`logs/<surface>/.../events.jsonl`) established the actual consumption picture:

- **Workboard** is the largest consumer (~3.9M input tokens across 12 threads in the
  sample), followed by Ordinus Home (~2.8M / 7 threads) and Conversations (~0.7M / 11).
- Cache hit rates vary wildly across Work Requests (90% down to ~10%); Ordinus Home is
  consistently healthy (~85%).
- **Provider usage counters are thread-cumulative**, not per-turn. A naive per-file sum
  overcounts the same conversation many times over; correct accounting requires deltas
  between consecutive reports on the same provider session, with the baseline reset when
  the session resets (ADR-013 fallback).
- Session resume works as designed: instructions go out only on the first turn
  (`ordinus/session.ts`), and history growth is standard CLI resume behavior, not a bug.

The code walk also surfaced concrete inefficiencies and one real visibility gap:

1. **Resumed Work Run prompts repeat fixed instruction blocks.** `buildClaudeResumePrompt`
   (and the Codex/Gemini equivalents) re-sends workspace rules, private-folder rules, and
   the outcome-schema instructions (~3–4k chars) on every resumed run, even though the
   session already holds them and the outcome schema is separately enforced via
   `--json-schema` / `--output-schema` CLI flags.
2. **Self-handoff duplication.** When a Work Item depends on a run the same agent executed
   in the same provider session, `formatRequiredInputs` still inlines the full upstream
   content — content that is already in the session history.
3. **Cross-item visibility gap.** The plan schema only supports `dependsOnTempIds`
   (dependencies among items created in the same plan). Dependencies on *existing* runs
   come only from manual context selection. So when a user adds follow-up work to an
   existing request ("translate the report agent A produced"), and A's output is
   database-backed text (ADR-030) with no file on disk, the newly planned item has no
   dependency edge, gets "Upstream work available: none", and sees at most the 500-char
   snippet the planner copied into the instruction. The new agent is effectively blind to
   prior work in the same request.
4. **No token accounting.** `observed_runs` has `input_tokens` / `output_tokens` /
   `usage_source` columns, but no adapter populates them; every row says `unavailable`.
   Optimizations cannot be validated without this data.

## Decision

Ship the following package, in this order. Measurement comes first so every later change
can be validated against real numbers.

### 1. Token usage instrumentation (first)

Adapters parse provider usage reports (Codex `turn.completed.usage`, Claude `result`
usage, Gemini stats) and forward them through the existing observability sink into
`observed_runs`.

- Store **both** the raw cumulative counters and the **computed delta** (the run's true
  cost), including the cached-input split.
- Delta semantics are per provider session: the baseline is the previous usage report on
  the same `providerSessionRef`; a `sessionReset` (ADR-013) resets the baseline. Provider
  reporting semantics differ — each adapter owns its own interpretation; never assume
  Codex semantics for the others.
- No new UI in this package. Data lands in the DB and is available to the run inspector
  (ADR-036) later.

### 2. Slim resumed-run prompts

Resumed Work Run messages drop the repeated workspace / private-folder / outcome
instruction blocks in favor of a one-line reminder ("Workspace and output-format rules
are unchanged from the first message of this session"). Schema conformance continues to
be enforced by the CLI schema flags. First-turn (new session) prompts are unchanged.

### 3. Same-session handoff dedupe

When a required input's producing run executed in the *same provider session* the
dependent run will resume, `formatRequiredInputs` sends **summary + run id only**, never
the full content — it is already in session history. Cross-session dependencies keep the
full inline behavior. The inline content budget stays at **100,000 chars** (unchanged
from ADR-030): for direct cross-session dependencies, inline remains cheaper and faster
than a tool-call round trip.

### 4. Plan-time dependencies on existing runs

The plan schema gains `dependsOnRunIds` (existing Work Run ids) alongside
`dependsOnTempIds`. The planner already sees existing runs (title, id, 500-char snippet,
artifact paths) when planning into a destination request; it may now bind new items to
them, which routes the existing `getRequiredInputSummaries` → inline handoff machinery
with no new transport.

The plan review surface lists the destination request's existing runs and shows which
ones each new item is bound to, so the user can correct, remove, or add bindings before
accepting. Automatic binding is the default; manual selection is the authoritative
override.

### 5. Per-request digest file

The engine appends a formatted entry to `<request working folder>/digest.md` at
`completeWorkRun` time: run id, agent name/role, item title, the result summary, and
artifact/changed-file paths. Deterministic engine writes — never an extra LLM call, never
delegated to the agent. The digest is simultaneously:

- the user-readable "what happened in this request" record, and
- the discovery index agents use to find prior work (run ids are the keys for the tool
  surface below).

This does not reinstate ADR-008-style file handoffs: results remain database-backed; the
digest holds summaries and pointers, never full result content.

### 6. Scoped read-only tool surface for worker agents

Workboard worker agents get a minimal MCP tool subset — `get_work_run_result(runId)`
(read-only, scoped to the agent's own Work Request via a per-request endpoint
`/mcp/work/<requestId>` on the shared loopback server) — so an agent can lazily pull the
full content of any prior run it discovers via the digest, even without a dependency edge.

*Implementation note (2026-06-11):* the originally envisioned `getRequestDigest` tool was
dropped — `digest.md` lives inside the request working folder, which the agent can read
natively with zero tool-definition token cost. One tool suffices.

The full Ordinus catalog (ADR-29: `proposeWorkRequest`, `createSchedule`,
`archiveWorkRequest`, `runSqlReadonly`, memory tools, …) remains assistant-only. Two
reasons: destructive/privileged surface, and token cost — every tool definition is paid
as input on every worker session, so the worker subset must stay small.

### Explicitly deferred (backlog, revisit with instrumentation data)

- **Conversations moderator transcript replay** — smallest measured surface; bounded by
  the ADR-032 turn cap. Re-evaluate once per-surface deltas accumulate.
- **Session rotation / summarize-and-restart** — provider CLIs already compact their own
  context; revisit only if measured per-turn deltas show runaway growth.
- **Planner fixed-prompt slimming (~12k chars/call)** — already cache-friendly
  (fixed-prefix, variable-suffix); trim opportunistically while implementing item 4 only
  if obvious, plan quality outranks the saving.
- **Token display in UI** — after the package lands.

## Alternatives Considered

### Always lazy: drop inlining, deliver everything via digest + tools

- Pros: leanest prompts in all cases.
- Cons: every dependent step pays at least one extra model round trip (time and tokens);
  linear chains — the dominant shape — get slower and often *more* expensive.
- Rejected: keep inline for direct dependencies; lazy fetch is the complement for
  non-dependency visibility, not the primary transport.

### Inline all completed request work into every new run

- Pros: guaranteed visibility without planner or tool changes.
- Cons: unbounded growth with request size; pays for content most runs never need.
- Rejected: visibility flows through dependencies (inline) and the digest + tools (lazy).

### Agent-authored digest entries

- Pros: richer prose summaries.
- Cons: extra output tokens per run, inconsistent formats, agents can forget; the result
  summary already exists and is good enough.
- Rejected: deterministic engine writes from `resultSummary`.

### Granting workers the full Ordinus MCP catalog

- Pros: no new server/subset plumbing.
- Cons: widens the security boundary (destructive tools reachable from raw provider
  CLIs); inflates every worker session's input by the whole catalog's tool definitions.
- Rejected: scoped read-only subset only. (This preserves the spirit of ADR-030's
  original rejection while adopting the lazy-fetch mechanics it turned down.)

### Per-turn token columns only (no cumulative raw values)

- Pros: simpler schema.
- Cons: deltas are derived data; if a provider's reporting semantics turn out to be
  misread (as the cumulative discovery in this session proved possible), raw values are
  the only way to recompute history.
- Rejected: store raw cumulative and delta both.

## Consequences

- Every optimization in this package (and future ones) becomes measurable: per-run true
  cost with cache split, per-surface aggregates, before/after comparisons.
- Resumed Work Runs shed ~3–4k chars of repeated instructions per run, and same-session
  chains shed up to 100k chars of duplicated content — both also improve provider cache
  hit rates by keeping the variable suffix small.
- "Continue this work" follow-ups stop going blind: the planner binds them to prior runs,
  the user can audit the binding, and even unbound agents can discover and fetch prior
  work via digest + tools.
- The digest gives users a zero-cost activity record per request.
- New maintenance surfaces: plan review dependency UI, the digest writer, the scoped MCP
  subset, and per-adapter usage parsing (three providers × evolving CLI output formats).
- Risk: very long sessions whose CLI compacted away the first-turn rules could degrade
  output formatting after item 2; the schema flags backstop outcome shape, and the
  one-line reminder keeps the pointer alive.
