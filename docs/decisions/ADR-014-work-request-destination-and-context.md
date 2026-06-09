# ADR-014: Use Destination And Context For Work Requests

## Status

Accepted

Partially superseded by ADR-031 (folder-scoped agent isolation). The **context reference**
mechanism defined here — selecting files, folders, prior outputs, or artifacts through the
References surface (Suggested / Selected / All files / Manual path) — is **removed** and replaced by
per-request **folder selection** (New: a fresh title-named folder; Existing: any folder under the
root). The **destination** model (no selection → new Work Request; selected Work Request → add a
Work Item) and the **Continue** entry path remain. Multi-item continuation context now flows through
inline database-backed results (ADR-030) and/or by pointing a new request at the same Existing
folder, rather than through filesystem context references.

## Date

2026-05-16

## Context

ADR-007 established the Workboard as the place where users create, review, start, and monitor
planned agent work. It also introduced Work Requests and Work Items as the user-facing grouping
model for planned work.

The first Workboard concept placed a request input directly on the board. That creates an important
UX problem: starting new work and continuing existing work become visually and behaviorally mixed.
Users can review a result, type a follow-up, and accidentally create detached work because they did
not explicitly select the right item and choose continue. The product should not require users to
remember hidden context rules before submitting work.

Ordinus also needs to support richer continuation workflows. A user may want to:

- Start a completely new area of work.
- Add a new item under an existing Work Request.
- Continue from one specific Work Item.
- Continue from multiple Work Items that together define the next step.
- Use files, folders, prior outputs, or artifacts as additional context.

These workflows should share one coherent request-composition experience instead of splitting into
unrelated "new" and "continue" screens.

## Decision

Remove the global request input from the Workboard.

The Workboard remains an observable command surface for selecting, monitoring, and inspecting work.
Creating or continuing work happens through a focused request-composition surface opened by actions
such as **New** or **Continue**.

Every submitted request has:

- One **destination**.
- Zero or more **context references**.

The destination decides where the resulting work is recorded. Context references decide what prior
work, files, or artifacts the new work should use as input.

### Destination

A request destination is singular.

Supported destination states:

- **No selected Work Request**: create a new Work Request and create the first Work Item inside it.
- **Selected Work Request**: create a new Work Item inside that Work Request.

The UI may label this destination as "New Work Request" or the selected Work Request title, but it
must make the effect visible before the user reviews or starts the request.

### Context References

A request can include many context references.

Initial reference types:

- One or more Work Items.
- One or more Work Requests when a broader prior work stream matters.
- Files or folders from the current workspace.
- Prior run outputs, summaries, artifacts, notes, or handoffs when available.

Selecting a Work Item as context means the new Work Item continues from or depends on that item. This
is not limited to a single item. For example, a user can create a request that continues from two
previous Work Items and asks Ordinus to reconcile or build on both.

Context references do not decide where the new item is stored. The destination still owns that.

### New And Continue Actions

**New** opens the request-composition surface with no destination selected by default.

From there, the user can:

- Leave the destination empty to create a new Work Request.
- Choose an existing Work Request to add a new Work Item there.
- Add one or more context references before reviewing the plan.

**Continue** is a shortcut into the same request-composition surface.

When launched from a Work Item, Continue preselects:

- Destination: that Work Item's parent Work Request.
- Context references: that Work Item.

The user can still add more context references, remove the preselected item, or change the
destination before review.

When launched from a Work Request, Continue preselects:

- Destination: that Work Request.
- Context references: none unless the user selected specific items first.

This keeps Continue compact and predictable without creating a separate product mode.

### Request Composition Surface

The shared surface should include, at minimum:

- A destination selector.
- A context/reference selector.
- A primary instruction field for what the user wants.
- Agent mention support using the same `@agent` pattern as Conversations where possible.
- Item selection for workspace files, folders, prior outputs, artifacts, and existing Workboard
  entities.

The screen should clearly explain the resulting behavior in product terms, such as:

- "This will start a new Work Request."
- "This will add a new Work Item to Improve Workboard UX."
- "This will add a new Work Item using 2 selected Work Items as context."

### Review Plan Boundary

For the current implementation step, requests created through **New** or **Continue** still enter
the existing Review Plan model from ADR-007.

This ADR does not redesign the planner or review-plan surface. It only defines how users choose the
destination and context before reaching review.

A later decision should revisit the planner experience so it can better reflect this model,
including:

- How destination and context are shown during review.
- How multi-item continuation is represented in the proposed plan.
- Whether the review surface should distinguish new Work Items from continuation Work Items.
- How edits to destination or context should flow back from review to the composition surface.

Until that follow-up decision is made, the Review Plan step remains the existing user-controlled
approval point before work starts.

## Alternatives Considered

### Keep A Global Workboard Input

- Pros: Fast entry point; fewer screens.
- Cons: Makes new work and continuation work easy to confuse; hides the target of the user's
  instruction; turns the board into a chat-like surface.
- Rejected: Workboard should monitor and organize work, not be the primary instruction composer.

### Separate New And Continue Screens

- Pros: Each screen could be optimized for one scenario.
- Cons: The data needed is almost the same; users can reasonably start from New and choose an
  existing Work Request, or start from Continue and broaden the context.
- Rejected: Separate screens would create product modes without adding enough clarity.

### Make Selected Work Items The Destination

- Pros: Simple language for "continue this item."
- Cons: Ambiguous when multiple items are selected; unclear where the new work should be stored;
  makes graph references and persistence harder to reason about.
- Rejected: destination and context must remain separate.

### Allow Multiple Destinations

- Pros: Could model a request that updates several Work Requests at once.
- Cons: Creates unclear ownership for status, history, review, and resulting Work Items.
- Rejected for now: one request should write to one destination while referencing many context
  inputs.

## Consequences

- Workboard becomes cleaner: it is a board for selecting, inspecting, and monitoring work.
- Request creation and continuation share one UX language.
- Continue becomes a prefilled entry path, not a separate workflow.
- A single new request can continue from multiple previous Work Items.
- The product can support richer graph-like relationships without forcing users into hidden modes.
- The Review Plan experience remains unchanged for now, but it now has a clearer input model to
  evolve from.

## Implementation Notes

- Prefer UI labels such as "New", "Continue", "Destination", and "Context" over implementation
  terms.
- The renderer must not infer privileged workspace details directly; workspace file and artifact
  selection should use typed IPC and validated shared contracts.
- Persist the resulting relationship as a new Work Item with explicit references to the selected
  context Work Items, Work Requests, files, artifacts, or outputs.
- Do not treat provider session history as authoritative continuity. Use durable Workboard context
  references as the source of truth, consistent with ADR-013.
- Keep the first implementation small: destination selection, context selection, instruction text,
  agent mentions, and the existing Review Plan handoff are enough.
