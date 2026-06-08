# Workflows

A **Workflow** in Ordinus is a visual node-based design (ADR-025/026) that the
user composes in the Workflow designer. Each node is a task assigned to one of
their agents; edges declare dependencies. The designer compiles the graph into
a `WorkboardDraftPlan` that the existing Workboard engine executes — workflows
are not a separate execution layer, they are a *composition surface* over Work
Requests.

## When to suggest a workflow

- The user describes a multi-step recurring pattern ("every time we ship, do
  X, then Y, then Z").
- The work has parallel branches or fan-out that's tedious to express in a
  single Work Request.
- The user wants to capture a process they'll reuse, not a one-off task.

## When NOT to suggest a workflow

- A single agent doing one focused thing → just create a Work Request via
  `/workboard`.
- The user is exploring an idea, not yet committing to a process → keep
  the conversation in chat, propose a workflow only when the shape is clear.

## How to drive workflow creation

The slash command `/workflow` takes the conversation context and opens the
Workflow designer pre-seeded with a draft. You do not create workflow nodes
via tool calls — the designer is the canonical authoring surface. Your job is
to help the user think through the shape (agents, ordering, inputs/outputs)
before they open the designer.
