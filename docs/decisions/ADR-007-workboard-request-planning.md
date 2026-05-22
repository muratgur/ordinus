# ADR-007: Use Workboard Requests For Planned Agent Work

## Status

Accepted

The "Live Board" section is superseded by ADR-020, which replaces the seven horizontally
scrollable status columns with three consolidated columns and a single-request observation
model. All other decisions in this ADR stand.

## Date

2026-05-10

## Context

Ordinus needs a user-facing surface where a user can describe a larger work goal, let Ordinus break
that goal into agent-owned work items, review the proposed assignments and dependencies, and then
start the resulting work.

The existing generic work runtime already provides the durable execution model:

- Work runs assigned to agents.
- Runtime statuses such as queued, running, blocked, waiting for user, completed, failed, and
  cancelled.
- Dependencies between work runs.
- Result summaries from completed work.

The remaining product decision is how users should create and inspect planned work without mixing
unapproved draft items into the live board. A user may have many independent streams of agent work
active at the same time, so the board also needs a grouping concept that lets users focus on one
request or inspect all active work.

## Decision

Create a user-facing **Workboard** surface.

The Workboard is the place where users create, review, start, and monitor agent work. It replaces
the earlier user-facing "Planner" naming. Internal code should use the same product language where
practical instead of introducing a separate planner concept unless an implementation boundary
requires it.

### Work Requests

Group planned work by **Work Request**.

A Work Request represents one user-submitted goal, such as "Prepare the release notes" or "Analyze
the marketing strategy." A Work Request can contain one or more Work Items. Each Work Item becomes a
generic work run after the user starts the request.

The Workboard should support viewing:

- All work.
- One Work Request at a time.
- Useful filtered subsets such as active work or agent-specific work when needed.

This grouping behaves like an epic-level container, but the product should prefer the clearer
"Work Request" label in the UI unless future user research shows that "Epic" is better understood
by the target audience.

### Planning Flow

The top of the Workboard should include a request input. When the user submits a goal, Ordinus runs
a planning pass that:

- Interprets the user's request.
- Reads available enabled agents and their roles.
- Decides how many Work Items are needed.
- Assigns each Work Item to an agent.
- Defines dependencies between Work Items when a later item needs earlier output.
- Produces draft Work Items, not live work runs.

This planning pass is an internal product capability, not a visible conversational agent. The UI
should describe the result in product terms, such as "Review the work plan before agents start."

### Review Before Start

By default, the user reviews a draft plan before any work starts.

The review should appear in a large modal review surface, not in the live board columns. This keeps
draft work separate from existing queued, running, blocked, or completed work.

The review surface should show:

- A summary of the Work Request.
- The planned Work Items.
- Agent assignments.
- Dependencies between Work Items.
- A selected-item detail panel or drawer with instruction, inputs, expected output, status preview,
  and metadata.

The primary action is to start the work. Secondary actions may include discard, regenerate, and edit.

### Dependency Visualization

The draft review should visualize dependencies as a graph-like flow where possible.

The first implementation does not need a complex graph engine. A simple layered layout is enough:

- Independent Work Items appear in the same level.
- Dependent Work Items appear after the items they wait for.
- Edges or explicit "waits for" labels show dependency relationships.
- A list fallback is acceptable for dense or narrow layouts.

The purpose is comprehension, not diagram perfection. Users should understand which agent will do
what and what must finish before another item can start.

### Optional Direct Start

The request input should include a user-controlled option to skip review, expressed as a safe default
such as **Review before start**.

The default is enabled. If the user disables it, Ordinus may create the Work Request and start the
generated Work Items directly.

Even in direct-start mode, Ordinus should interrupt with review or an attention state when it cannot
act safely or clearly, such as when:

- The generated plan is ambiguous.
- A required provider or assigned agent is unavailable.
- The plan requires an unusually large number of agents or work items.
- A work item implies risky or privileged actions beyond the agent's current sandbox.

### Live Board

After approval, draft Work Items become live work runs grouped under the Work Request.

The board should use horizontally scrollable status columns so small windows do not compress cards
or hide important state. Each column may scroll vertically within the board surface.

Initial columns should map closely to the runtime status vocabulary:

- Queued.
- Running.
- Waiting.
- Blocked.
- Completed.
- Failed.
- Cancelled.

UI labels may be refined for clarity, but they should remain visibly tied to the runtime status so
the product stays observable.

## Alternatives Considered

### Show Draft Plans Directly On The Live Board

- Pros: The board is the single surface for all work.
- Cons: Draft items would mix with real queued or running work, making it unclear what has started
  and what still needs approval.
- Rejected: Draft review needs a separate temporary surface.

### Use A Small Confirmation Dialog

- Pros: Simple to implement.
- Cons: Too cramped for multi-agent assignments, dependencies, and item details.
- Rejected: Work plans need a review workspace, not just a yes/no confirmation.

### Always Start Work Immediately

- Pros: Fast and low-friction.
- Cons: Weakens user control and can surprise users when many agents start running.
- Rejected as the default: direct start should be an explicit user option.

### Always Add A Final Synthesis Item

- Pros: Gives users a tidy final output for multi-agent work.
- Cons: Assumes the desired workflow and may create unnecessary agent work. Users can assign
  synthesis explicitly when they need it.
- Rejected: Ordinus should not invent final report work by default.

### Call The Surface Planner

- Pros: Accurate implementation term.
- Cons: Feels like a feature or internal mechanism rather than a user-facing place to monitor work.
- Rejected for UI: "Workboard" better matches the board-centered product surface.

## Consequences

- Workboard becomes the primary surface for planned agent work.
- Work Requests provide a clear grouping layer for independent user goals.
- Draft planning remains separate from live runtime state until the user starts work.
- The user can choose between controlled review and lower-friction direct start.
- The board remains useful when many independent requests exist at once.
- Generic work runs remain the execution source of truth.
- Implementation likely needs a small Work Request persistence model or an equivalent stable source
  grouping before the Workboard ships beyond a prototype.

## Implementation Notes

- Prefer product terms in route names, component names, and UI copy: Workboard, Work Request, and
  Work Item.
- Keep renderer behavior behind typed IPC. The renderer may submit requests and render draft plans,
  but main process should own planning, validation, work-run creation, dependency resolution, and
  runtime start.
- Planning output should be schema-validated before it reaches the renderer.
- Starting a reviewed or direct Work Request should create generic work runs and dependency links in
  one main-process operation.
- The review modal should be large enough to behave as a focused planning surface while still making
  it clear that draft work has not yet joined the live board.
- Horizontal board scrolling should be designed intentionally with stable column widths and compact,
  readable Work Item cards.
