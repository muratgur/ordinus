# ADR-023: Scheduled Agent Tasks

## Status

Accepted

Builds on ADR-007 (Work Requests), ADR-009 (work-request-scoped agent sessions),
ADR-018 (agent ownership) and ADR-021 (request archiving). Supersedes no prior decision.

## Date

2026-05-26

## Context

Ordinus today launches agent work synchronously: the user opens a Work Request, points
an agent at it, and watches a run execute. Routine work — daily PR review, weekly
changelog, nightly test summary — currently requires the user to start each occurrence
by hand. The user wants the agent to do the routine work on a schedule without their
intervention, and they want it integrated into the existing Workboard surface rather
than as a parallel "automation" world.

Several design dimensions are entangled. Each was walked individually before
converging on the decisions below.

### Trigger Model: Cron vs. Event-Driven

Three trigger shapes were considered:

- **Recurring (cron-style):** "Every weekday at 09:00, run this prompt."
- **Deferred once:** "Tomorrow at 14:00, run this prompt."
- **Event-driven:** "When a PR is opened / file changes, run this prompt."

Recurring was chosen as the first-class model, with deferred-once expressed as its
degenerate case (a one-shot cron expression with a concrete date/time). Event-driven
was rejected for v1: it requires an event bus, source-system webhooks or polling, and
materially expands the surface area. There is no signal yet that recurring schedules
are insufficient.

### Schedule Definition Locus: Standalone vs. Agent-Bound

A schedule could be a self-contained template (provider + workspace + prompt +
settings, like a saved run), or it could attach to an existing agent and supply only
the work-specific bits.

Agent-bound was chosen. Agents are already first-class in Ordinus (ADR-018) and
carry the "who runs the work" definition — provider, workspace, persona, ownership.
A standalone template would duplicate that definition and immediately create the
"agent vs. schedule template" duality. Attaching to an agent keeps the agent
reusable: the same agent can carry multiple schedules with different prompts (a
morning review, an afternoon summary), and changing the agent's underlying setup
propagates to all of its schedules.

The schedule still carries its **own prompt**. The alternative — a single default
prompt on the agent that every schedule reuses — would force one agent per task and
inflate the agent list. The chosen split is: the agent answers *who/how*, the
schedule answers *what to do this time*.

### Workboard Placement: New WR Per Trigger vs. Shared WR vs. No WR

This was the load-bearing question. Each scheduled trigger produces a run, and the
Workboard is the place runs are observed (ADR-020). Four placements were considered:

- **A run with no Work Request.** Rejected: it breaks the model. Every observation
  surface, file-provenance link (ADR-019), and archiving primitive (ADR-021) assumes
  runs hang off a Work Request.
- **A single global "Scheduled" WR collecting all triggered runs.** Rejected: with
  several agents on daily schedules, the WR becomes an undifferentiated dumping
  ground within a week. The user loses the ability to find "this schedule's
  history" without cross-filtering.
- **A new Work Request per trigger.** Rejected: a daily schedule would mint a new
  WR every morning. The sidebar accumulates entries that all archiving would have
  to chase. The user feedback was explicit: this would create churn.
- **One Work Request per schedule; triggered runs accumulate inside it.** Selected.
  A schedule is a recurring *intent* — a natural fit for a Work Request as
  container. The WR title is the schedule name; each trigger is a new run beneath
  it. Sidebar grows with schedule count, not trigger count. ADR-020's single-request
  observation surface already gives a clean per-schedule history view for free.

### WR Lifetime: Eager vs. Lazy Creation

When should the Work Request actually exist?

- **Eager (created at schedule definition):** Workboard reflects the schedule
  immediately, with a "Next run: …" badge. But a user who creates and quickly
  deletes a never-fired schedule leaves behind an empty WR that has to be cleaned
  up. The visible "next run" affordance was not seen as worth the empty-WR
  cleanup cost.
- **Lazy (created on first trigger):** Selected. The schedule exists as a
  definition only until it actually fires. No empty WRs.

A schedule may also **attach to an existing Work Request** rather than minting a
new one. Existing-WR attachment is restricted to non-archived requests — schedules
must not silently resurrect archived work (ADR-021). A WR may have multiple
schedules attached (e.g., a daily progress agent and a weekly summary agent against
the same initiative).

### Concurrency: Agent-Level Lock vs. WR Queue

If a schedule fires while a previous run for the same agent is still executing,
something has to give. Three policies were considered:

- **Skip:** silently drop the new trigger.
- **Queue:** new trigger waits behind the running one.
- **Parallel:** start the new run alongside.

The codebase was inspected before deciding. `app/src/main/db/database.ts` already
handles the "agent session busy" condition: when a new run is started against an
agent whose session is still active, the run is created in `queued` status with
event reason `agent_session_busy` (around line 2081), and resumes when the session
frees. This is the Work Request runtime's existing concurrency behavior.

Given that, no new policy is needed. The scheduler delegates concurrency entirely
to the WR runtime: a triggered fire creates a run and lets the runtime decide
whether it executes immediately or queues. The scheduler does not own a parallel
lock or its own queue.

### Agent Deletion: Cascade vs. Block vs. Orphan

If a schedule's agent is deleted, three policies were considered:

- **Block deletion** until schedules are removed: safest against accidental loss.
- **Orphan** the schedule (disable it, keep the row, allow reassignment): preserves
  history but introduces a "broken schedule" state in the UI.
- **Cascade** delete the schedules along with the agent: simplest, no orphans.

Cascade was selected. The user's framing was direct: a scheduled task is the
agent's task; if the agent is gone, the task is gone with it. Blocking deletion
would create friction for what should be a clean operation, and orphan rows would
require a separate UI state that doesn't carry real value — a schedule with no
agent has nothing to run.

WR archiving is handled differently. When a WR with attached schedules is archived
(ADR-021), the schedules **disable** rather than cascade-delete. The schedule
definition is still useful — the user can reattach it to a different WR or convert
it to a lazy-WR schedule. Continuing to fire into an archived WR would defeat the
archiving model.

### Runtime Location: Main Process vs. OS Scheduler vs. Background Helper

The scheduler could live in the Electron main process, the OS-level scheduler
(launchd / Task Scheduler / systemd), or a tray-resident background helper.

Main process was selected. Provider CLIs (Codex, Claude, Gemini) and the Work
Request runtime already require the app to be running; firing a schedule while the
app is closed would produce a run the user cannot observe and would only "appear"
when they next open the app. OS-level scheduling additionally requires
cross-platform manifests and per-platform permission flows, expanding the scope
without producing a meaningfully better experience.

For missed triggers (app was closed when the schedule should have fired), a
catch-up policy fires the **most recent missed occurrence only**, not every
occurrence in the gap. Re-running ten missed daily fires in sequence on app launch
would create noise without value; the most recent fire is the one the user
typically wants.

A tray-only / always-running mode is acknowledged as a likely future addition but
is out of scope here; if it lands, it integrates with the same scheduler.

### Failure Handling: Per-Run Isolation with Soft Brake

A scheduled run that fails should not break the schedule itself: the next
occurrence still fires normally. But a schedule that fails *every* fire — a broken
prompt, a removed workspace, a stuck provider — should not keep firing silently
forever. After **5 consecutive failures**, the schedule auto-disables and the user
is notified. The user can re-enable after correcting the underlying cause.

Per-run retry (re-fire a failed occurrence N minutes later) was rejected for v1.
Provider failures in Ordinus are typically authentication, prompt, or workspace
issues, none of which a retry resolves.

### Timezone

The application is a desktop tool tied to the user's machine. Schedules are stored
and evaluated in the user's local timezone with no UTC conversion. There is no
multi-user or server-coordination requirement that would justify the complexity
of UTC normalization plus per-user timezone metadata.

### Schedule Expression UI

A cron expression covers every case but is hostile to typical users. Conversely, a
fixed preset list (Once / Daily / Weekly / Every N hours) covers the common cases
but leaves power users stuck. The chosen UI is **preset-first with an "advanced"
cron escape hatch**. Storage uses a normalized cron string for recurring schedules
and an optional `runAt` timestamp for one-shot schedules.

### Management Surface

Schedule definitions live in two surfaces:

- A **top-level "Schedules"** screen lists all schedules across agents — useful for
  the "what's going to fire tomorrow" question.
- A **per-agent schedules tab** on the agent's detail screen — the natural place to
  create a schedule, since the user starts from "I want this agent to do X
  routinely."

The Workboard remains the place where *results* live (per ADR-020). The Schedules
screens manage *definitions*; they do not duplicate run history. To make the
relationship discoverable from the Workboard side, the WR card surfaces a
**linked-schedule badge** that links back to the schedule definition.

## Decision

Introduce **scheduled agent tasks**: time-based triggers that fire a configured
prompt as a run against a specified agent, observable on the Workboard through the
existing Work Request model.

### Data Model

A schedule is a first-class entity with the following fields:

- `id`
- `agentId` (FK; cascade on agent deletion)
- `prompt` (the work-specific instruction for each fire)
- Schedule expression: a cron string for recurring, plus an optional `runAt`
  timestamp for one-shot
- `timezone` (the user's local timezone at definition time)
- `linkedWorkRequestId` (nullable; if null, a WR is minted lazily on first fire)
- `enabled` (bool)
- `lastRunAt`, `nextRunAt`
- `consecutiveFailures` (for the auto-disable brake)

### Workboard Integration

- Each schedule maps to one Work Request. The schedule's name becomes the WR title.
- The WR is created **lazily on first fire** unless the user explicitly attaches the
  schedule to an existing non-archived WR at creation.
- A WR may have multiple schedules attached.
- The WR carries a **linked-schedule badge** that surfaces this relationship.

### Triggering and Concurrency

- The scheduler lives in the Electron main process and fires when the app is
  running. It uses a standard cron library (`croner` or equivalent).
- When the app starts after being closed, a catch-up pass fires the most recent
  missed occurrence per schedule, no more.
- A fire creates a run on the linked WR and hands off to the existing Work Request
  runtime. The runtime's existing "agent session busy → queued" behavior provides
  concurrency control; the scheduler does **not** implement its own queue or lock.

### Failure Policy

- A failed run does not affect future occurrences.
- After **5 consecutive failed fires**, the schedule auto-disables and the user is
  notified.
- No automatic per-occurrence retry.

### Lifecycle Coupling

- Agent deletion **cascades** to its schedules.
- WR archiving (ADR-021) **disables** attached schedules but does not delete them.

### Schedule Authoring UX

- Preset-first UI: Once, Daily, Weekly (with day picker), Every N hours.
- Advanced mode accepts a raw cron expression.
- Definitions managed from a top-level Schedules screen and from a Schedules tab on
  the agent detail screen.

## Consequences

The Work Request stays the central observation surface for agent work; scheduled
work integrates without inventing a parallel automation world. The WR runtime's
existing queue behavior absorbs all schedule-induced concurrency for free, which
is the single largest correctness win in this design — there is no second source
of truth about "is this agent busy."

Lazy WR creation keeps the Workboard clean and avoids janitor work for never-fired
schedules, at the cost of a small lag: the user cannot see the future schedule on
the Workboard until it has fired at least once. The top-level Schedules screen
mitigates this — it is where "what's coming up" lives.

The cascade-on-agent-deletion choice means deleting an agent is unambiguously
destructive of its automations. The UI should reflect this in the agent deletion
confirmation; the user signed off on the trade-off explicitly.

App-closed schedules silently miss their fires, with only the most recent
occurrence replayed on launch. For a desktop tool this matches user expectations;
when the tray-resident mode lands, the same scheduler can run without app windows
open and this constraint dissolves.

## Out of Scope

The following were considered and explicitly deferred:

- Event-driven triggers (file change, PR opened, webhook).
- Tray-only / app-closed scheduling — likely a future ADR.
- Per-schedule concurrency override (force-parallel or force-skip).
- Per-occurrence retry policy.
- UTC normalization and multi-timezone coordination.
