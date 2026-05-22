# ADR-021: Workboard Request Archiving

## Status

Accepted

Builds on ADR-007 (Work Requests) and ADR-020 (request sidebar). Supersedes no prior
decision.

## Date

2026-05-22

## Context

ADR-007 introduced the Work Request as the grouping container for planned agent work.
ADR-020 made the Workboard a single-request observation surface and moved cross-request
navigation into a request sidebar ordered by most recent activity.

ADR-020 solved unbounded accumulation *within* a request: the Done column windows recent
terminal runs and collapses the rest. It did not solve accumulation *across* requests. Every
Work Request a user has ever submitted stays in the sidebar forever. A finished request — its
work done, its output reviewed — has the same standing in the sidebar as live work. Over
time the sidebar becomes a long list dominated by completed work, and finding the request
the user currently cares about gets harder.

The user's mental model is that a finished request is done with: "I did it, it's over." But
they are not certain they will never look back — a finished request still holds its
instruction, agent output, and file provenance (ADR-019), which is useful for "we did this
before" recall. So the requirement is to get finished work *out of the way* without
*destroying* it.

This ADR defines how a user removes a finished Work Request from their working view while
keeping it recoverable.

## Decision

Add **archiving** to Work Requests: a manual, reversible action that hides a finished request
from the default Workboard view without deleting any data.

### Soft Archive, Not Deletion

Archiving is a soft operation. The Work Request and all of its data — work runs, run events,
file provenance — are kept intact. There is no destructive delete of Work Requests in this
iteration.

Rationale: the user is unsure whether they will revisit finished work. As long as that is
true, permanent deletion must not be on the table. The board growing is a *visibility*
problem, not a *storage* problem; archiving solves visibility without sacrificing data.

### Archive State Is A Separate Field

Archiving is recorded as a nullable `archivedAt` timestamp on the Work Request, not as a new
value in `WorkRequestStatus`.

Adding `archived` to the status enum would overwrite the request's terminal status
(`completed`, `failed`, or `cancelled`) and lose the information needed to restore it. A
separate `archivedAt` field leaves the original status in place: archived-or-not is "is
`archivedAt` set", and unarchiving simply clears the field. The timestamp also records *when*
the request was archived, available for future sorting or filtering.

### Manual Only

Archiving is always an explicit user action. A request is never archived automatically — not
on completion, and not after a time delay.

Rationale: immediate auto-archive would hide output the moment work finishes, exactly when
the user wants to look at it. Time-based auto-archive makes work disappear on a schedule the
user does not track. The user explicitly wants control here.

### Only Finished Requests Can Be Archived

The archive action is available only for Work Requests in a terminal status: `completed`,
`failed`, or `cancelled`. Requests in `active`, `running`, or `waiting_for_user` cannot be
archived.

Rationale: archiving a live request would hide work that is still producing output or that
needs the user (`waiting_for_user`). Archive is a tool for shelving finished work, not for
hiding unwanted live work. To stop unwanted live work the correct action is to cancel it,
which moves it to a terminal status — and only then can it be archived.

### Unarchiving

Archiving is reversible. An archived request can be unarchived, which clears `archivedAt` and
returns the request to the default view with its original terminal status intact.

Rationale: "I archived it by mistake" and "this work is relevant again" are real cases. A
one-way archive corners the user. Unarchive does nothing beyond clearing the field; it
applies no other change.

### Per-Request Action, No Bulk

Archiving is a per-request action. There is no "archive all finished requests" bulk
operation in this iteration.

Rationale: the user prefers to decide request by request. A bulk action would remove many
requests in one stroke and weaken the deliberate, manual character of the feature.

### Archived Requests Are Hidden Behind A Sidebar Filter

Archived requests are not removed from the sidebar's data, only from its default rendering.

- By default the sidebar (ADR-020) shows only non-archived requests.
- A **"Show archived"** toggle in the sidebar reveals archived requests alongside the rest.
  This is the user's "maybe I'll look back" path.
- The toggle carries a count of archived requests so the user knows how much is hidden.
- Sidebar search respects the toggle: with the toggle off, search does not match archived
  requests. Archived work must not leak back into the working view through search.

Rationale: a separate Archive screen would be a distinct place the user has to remember to
visit. A toggle in the same list keeps the board clean by default and puts the full history
one click away in the place the user already looks.

### Archive Action Placement

- The primary archive entry point is an overflow (`⋯`) menu in the request header (ADR-020).
  The header already carries "Continue this work" and "Files (N)"; the archive action — and
  later the unarchive action — live in the overflow menu so the header stays uncluttered and
  so the action only appears when the request is in a terminal status.
- A secondary archive affordance appears as a hover action on the sidebar request row, so the
  user can archive a finished request without opening it. This keeps per-request archiving
  low-friction given there is no bulk action.

### Follow-Up On An Archived Request Auto-Unarchives

ADR-007's continuation flow (`WorkboardContinueRequestInputSchema`) lets a user add work to a
finished request. If the user starts a follow-up on an archived request, the request is
automatically unarchived: `archivedAt` is cleared and the request returns to the default
view.

Rationale: once a request has live work again it is no longer finished work, so it must be
visible — leaving it archived would hide running work, the exact hazard that bars archiving
live requests. Requiring a manual unarchive before follow-up would be a redundant extra step.

## Alternatives Considered

### Permanent Deletion

- Pros: Truly removes the request; the strongest possible cleanup.
- Cons: Irreversible. Destroys instruction, agent output, and file provenance the user may
  want for recall.
- Rejected: the user is unsure whether they will revisit finished work, so destruction is off
  the table. Archiving achieves the cleanup without the loss.

### `archived` As A Status Enum Value

- Pros: Single field describes the request's state.
- Cons: Overwrites the terminal status (`completed` / `failed` / `cancelled`); unarchiving
  cannot know which status to restore.
- Rejected in favour of a separate `archivedAt` field that preserves the original status.

### Automatic Archiving On Completion Or After A Delay

- Pros: No manual effort; the sidebar stays small on its own.
- Cons: Immediate auto-archive hides output the moment the user wants to see it; time-based
  auto-archive makes work vanish on an untracked schedule.
- Rejected: the user explicitly wants manual control.

### A Separate Archive Screen Or Route

- Pros: Cleanly separates finished work from live work.
- Cons: A distinct place the user must remember to visit; raises the chance archived work is
  simply forgotten.
- Rejected in favour of a toggle within the existing sidebar.

### Bulk "Archive All Finished" Action

- Pros: Fastest way to clear an accumulated backlog.
- Cons: Removes many requests in one stroke; weakens the deliberate, per-request character of
  the feature.
- Rejected: the user prefers to decide request by request.

### One-Way Archive (No Unarchive)

- Pros: Simpler; archive is a final resting state.
- Cons: No recovery from a mistaken archive or from work becoming relevant again.
- Rejected: archiving is reversible.

## Consequences

- Work Requests gain a nullable `archivedAt` timestamp. `WorkRequestStatus` is unchanged.
- Finished requests can be removed from the default Workboard view without data loss and
  restored later.
- The sidebar shows non-archived requests by default, with a "Show archived" toggle (carrying
  an archived count) to reveal the rest. Sidebar search respects the toggle.
- The archive and unarchive actions are exposed in the request header overflow menu, gated to
  terminal-status requests; archive is also available as a sidebar row hover action.
- Starting a follow-up on an archived request auto-unarchives it.
- Cross-request accumulation is bounded by user action, complementing ADR-020's within-request
  Done-column windowing.
- New typed IPC is required for archive and unarchive; archive state must be persisted.
- Permanent deletion of Work Requests remains out of scope and may be revisited.

## Implementation Notes

- Add a nullable `archivedAt` (ISO timestamp) column to the Work Request persistence model
  and to `WorkRequestSchema` in `app/src/shared/contracts.ts`. Existing rows default to null.
- Add `WorkboardArchiveRequestInputSchema` / `WorkboardUnarchiveRequestInputSchema`
  (a `requestId`) and corresponding `window.ordinus` archive/unarchive methods, preload
  bridge entries, and `ipcMain` handlers. Follow the IPC contract conventions.
- The archive handler must reject requests whose status is not `completed`, `failed`, or
  `cancelled`. The renderer must also gate the action on terminal status, but the main process
  is the source of truth.
- Unarchive clears `archivedAt`. It applies no other change; the original status stands.
- The continuation handler must clear `archivedAt` when a follow-up targets an archived
  request, so live work is never hidden.
- The sidebar filters out requests with a non-null `archivedAt` unless the "Show archived"
  toggle is on. The toggle's persisted state can reuse the existing renderer UI-preference
  persistence (`localStorage`), as ADR-020 does for sidebar dock state.
- Sidebar search filters the already-toggle-filtered list, so archived requests are
  unsearchable while the toggle is off.
- The request header overflow (`⋯`) menu shows "Archive" for a terminal non-archived request
  and "Unarchive" for an archived one.
- The sidebar row hover action archives a terminal-status request in place.
