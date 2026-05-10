# ADR-006: Use Generic Work Runs For Agent Collaboration

## Status

Accepted

## Date

2026-05-10

## Context

Ordinus conversations now support direct and multi-agent agent turns, orchestrated routing, and
user input requests. This is enough for chat-shaped coordination, but the product is moving toward
broader agent work surfaces such as planner boards, agent inboxes, review flows, and future modules.

If agent collaboration remains owned by the Conversations feature, every new surface would need its
own partial runtime model. That would make the same work appear differently depending on where it
started, and it would make agent-to-agent collaboration harder to reason about.

The product needs a small generic work model that can answer:

- What work exists?
- Which agent owns each piece of work?
- Which work can start now?
- Which work is blocked because it needs outputs from other work?
- What output did completed work produce?
- Which product surface should show the work?

At the same time, Ordinus should not over-design a full project management system before the actual
workflows are proven. The first model should be small, durable, and easy to project into different
UI surfaces.

## Decision

Use a generic work runtime centered on work runs.

A work run is one durable unit of agent work. It may be created by a user, an agent, the planner, a
conversation, or a future module. A work run is not owned by Conversations, Planner, or Agent Inbox.
Those product areas are projections over the same underlying work state.

The initial model should treat the agent inbox as a derived view:

```text
agent inbox = active work runs assigned to that agent
```

Do not create a separate inbox-owned runtime model unless later product behavior requires it.

### Work Runs

A work run should track only the minimum product facts needed to execute and observe work:

- The assigned agent.
- The instruction or task to perform.
- The current status.
- The parent/root work relationship when one work run creates another.
- The provider/session reference needed to resume the agent.
- The product surface links that should display the work.
- A small result summary or output reference when completed.

The status vocabulary should stay operational and board-friendly:

```text
queued
running
blocked
waiting_for_user
completed
failed
cancelled
```

`blocked` means the work cannot start because required upstream outputs are not ready. It should not
need a separate blocker concept in the first implementation.

### Inputs From Other Work

A work run may declare that it needs the outputs of one or more other work runs before it can start.

Example:

```text
CEO perspective        -> completed output
CFO budget analysis    -> completed output
Social media analysis  -> completed output

Final marketing strategy waits for all three outputs.
```

The final strategy run must not start until all required upstream runs are completed. When it starts,
Ordinus should collect those upstream outputs and include them in the prompt/context for the assigned
agent.

This gives the runtime one simple rule:

```text
If a work run requires upstream outputs, it stays blocked until all required outputs exist.
```

### Agent-To-Agent Work

Agent-to-agent collaboration should use the same work run model.

If an agent gives another agent work and needs the result before continuing, the parent work run
waits for the child output.

If an agent gives another agent background work and does not need to wait, the child work run can
proceed independently. Its result can still appear later in the relevant surface.

The first implementation should prefer explicit dependency behavior over autonomous open-ended
loops. A work run can create child work, but the runtime must keep the graph visible and bounded.

### Product Surface Projections

Different modules may show the same work runtime differently:

- Conversations may show a compact activity line, such as "Planner assigned review work to CFO."
- Planner may show work runs on a board with To do, In progress, Blocked, and Done columns.
- Agent Inbox may show active work assigned to one agent.
- A future dashboard may show all running or blocked work.

These surfaces should not own separate execution semantics. They should create, display, and update
generic work runs.

### Planning Versus Execution

Work planning is separate from work execution.

Different modules may use different planning or orchestration behavior before creating work runs.
For example:

- Conversations may use a lightweight router that keeps the chat flowing and avoids unnecessary
  decomposition.
- Planner may use a stronger planning prompt that breaks a goal into board-friendly work items,
  dependencies, and final synthesis work.
- A future review module may use review-specific instructions to create security, test, docs, or
  risk-analysis work.

These planners may have different prompts, policies, and product goals, but they should emit the
same generic work shape:

```text
work runs
assigned agents
required upstream outputs
surface links
```

The work runtime then owns execution, dependency resolution, status changes, provider sessions, and
outputs. This keeps orchestration flexible without creating a separate runtime for each module.

## Example

A user asks:

```text
Define the company's marketing strategy.
```

The coordinator creates these work runs:

```text
[1] CEO perspective
Assigned to: CEO agent
Needs: nothing

[2] CFO budget analysis
Assigned to: CFO agent
Needs: nothing

[3] Marketing positioning
Assigned to: Marketing Officer agent
Needs: nothing

[4] Social media channel analysis
Assigned to: Social Media Agency agent
Needs: nothing

[5] Final marketing strategy
Assigned to: Marketing Officer agent or Coordinator
Needs outputs from: [1], [2], [3], [4]
```

Runs `[1]`, `[2]`, `[3]`, and `[4]` can run in parallel. Run `[5]` is blocked until all four outputs
are available. When `[5]` starts, Ordinus passes the four outputs into its prompt as input context.

## Alternatives Considered

### Keep Work Runtime Inside Conversations

- Pros: Reuses the current conversation turn model.
- Cons: Planner, inbox, review, and future modules would either depend on Conversations or duplicate
  execution state.
- Rejected: Agent work should be product-wide, while Conversations should remain one surface.

### Make Agent Inbox The Primary Model

- Pros: Simple mental model for agents receiving work.
- Cons: Inbox explains assignment but not parent work, upstream outputs, dependency blocking, or
  planner board state.
- Rejected for now: Inbox should be derived from work runs assigned to an agent.

### Build A Full Task Management Schema Now

- Pros: Could model many future cases up front.
- Cons: Too speculative. Ordinus does not yet know which planner, automation, or project-management
  workflows will survive product use.
- Rejected: Start with a small work runtime and add concepts only when product behavior needs them.

## Consequences

- Agent work can start from Conversations, Planner, Inbox, or future modules without changing the
  execution model.
- Work dependencies become simple: a run can start only when required upstream outputs are ready.
- Board-style blocked state can be derived from missing required outputs.
- Agent inbox can be implemented as a filtered view of active runs assigned to an agent.
- Conversation history does not need to become the source of truth for all agent collaboration.
- Future autonomous agent-to-agent loops must still be bounded by limits, graph visibility, and stop
  controls before shipping.

## Implementation Notes

- Keep the first schema small. Prefer work runs, dependency/input links, lightweight events, and
  output summaries over a broad task-management model.
- Store large provider logs and artifacts outside SQLite, with database references only when needed.
- Main process owns work execution, provider sessions, dependency resolution, and status changes.
- Renderer modules may request work creation or display work state only through typed IPC.
- Do not migrate the existing conversation turn model immediately. Introduce the generic work
  runtime as a foundation, then connect Conversations and Planner incrementally.
