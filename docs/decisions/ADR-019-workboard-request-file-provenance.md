# ADR-019: Workboard Request File Provenance Panel

## Status

Accepted

## Date

2026-05-22

## Context

Workboard work is organized by Work Request. Each request groups one or more Work Runs, and
each run is executed by an assigned agent. When a run completes, the agent reports the files it
touched as workspace-relative paths: `artifactRefs` for newly produced files and `changedFiles`
for modified files (ADR-008). These are stored per run on `work_runs` and surfaced in the
per-run "Produced files" section of the Run Detail drawer.

The product has no request-level view of those files. To answer "who produced or changed what
in this work", the user must open every finished run one by one, scan its output, and navigate
to each file. As the number of runs per request grows, this becomes the dominant friction in
reviewing completed work.

This is a provenance problem, not only a navigation one. The user wants to see, as one whole:
which agent produced or changed which file, as part of which run, for a given request. Fast
access to the file is a by-product of that view.

Two facts about the file model shape the design:

- Reported paths are not all inside the request working folder. ADR-008 allows agents to edit
  existing project files in their natural locations and to write outside
  `workboard/<request-slug>/`. Writing outside the request folder is legitimate but worth
  surfacing during review.
- A reported file may no longer exist on disk. A later run can delete or rename a file an
  earlier run produced. A provenance view that silently drops missing files loses history.

The Workboard UI does not render requests as headers or cards. In `WorkFilterBar`, a request
appears only as a filter chip (title plus run count). Selecting a request chip sets the active
filter, narrows `WorkColumns` to that request's runs, and populates `selectedRequest`, which
makes the contextual "Continue this work" button appear. There is no request body that could
hold additional inline elements, and the filter chip row should not be expanded with more
content.

## Decision

Add a request-scoped file provenance panel to the Workboard, opened from a button next to
"Continue this work" and rendered as a drawer.

### Placement

When a request is selected as the active filter (`selectedRequest` is set), show a second
button next to "Continue this work" labelled "Files (N)", where N is the total number of
distinct files reported across that request's runs. The button is only present in the
request-focused state; it does not appear for the "All" or "Active" filters. The filter chip
row is not changed.

Pressing the button opens a request-scoped drawer that follows the existing `RunDetailDrawer`
pattern, but scoped to the request rather than a single run.

### Data Model

No new tables and no schema migration. The renderer already receives every run as a
`WorkboardRun` carrying `artifactRefs` and `changedFiles`. The panel derives its content at
read time by aggregating all runs with the selected `requestId`.

Aggregation is file-centric: distinct files are keyed by normalized workspace-relative path.
For each file, the panel collects every (run, agent, kind) touch, where kind is "produced" or
"changed". The same file may carry multiple attributions when more than one run touched it.

### Panel Layout

The drawer presents a flat file list — not a per-run or per-agent sub-grouping. The user's
core friction is opening runs one by one; re-introducing a run-level grouping inside the panel
would recreate that friction at smaller scale.

Files are split into two groups by location:

- **In the work folder** — files under `workboard/<request-slug>/`.
- **Outside the work folder** — files reported elsewhere in the workspace.

The "outside" group exists so that legitimate-but-notable writes outside the request folder
are immediately visible during review.

Within each group, files are listed flat, most recent first. Each row shows the
workspace-relative path, attribution chips ("Produced: Agent A", "Changed: Agent B"), and row
actions. Clicking an attribution chip opens that run's Run Detail drawer, so deeper inspection
stays available but optional. Row actions are copy path and reveal in the OS file manager,
reusing the existing `workboard.revealPath` IPC.

### Missing Files

A file reported by a run but no longer present on disk is still shown. The row is rendered in
a muted style with a "missing" badge, and the reveal action is disabled; copy path and the
attribution-to-run navigation remain available. Provenance history is preserved: a deleted
output is still part of the record of what the request produced.

### Existence Check

Add one read-only IPC, `workboard.checkPaths`, that takes a list of workspace-relative paths
and returns, for each, whether it exists on disk. The panel calls it once each time it opens,
so missing state is always fresh and reflects deletions made after a run completed. The
existence logic reuses the central workspace path policy; no path resolution is duplicated.
The IPC needs a Zod request/response schema, a main-process handler, and a preload bridge
method, consistent with the existing IPC contract design.

## Alternatives Considered

### Per-run file view only (status quo)

- Pros: No new UI; data already shown in the Run Detail drawer.
- Cons: Reviewing a request means opening every finished run individually — the exact friction
  this ADR addresses.
- Rejected: does not solve the request-level provenance problem.

### New file-event table

- Pros: Durable per-(run, file, kind) rows; supports cross-request file history and a
  file-centric timeline.
- Cons: Requires a schema migration and a write path; the request-scoped view does not need
  cross-request history.
- Rejected: violates minimal-persistence guidance for a view that can be fully derived from
  existing run data. Revisit only if a cross-request or file-centric history view is later
  required.

### Request chips carrying file content

- Pros: Keeps everything in the filter bar.
- Cons: Request chips are compact filter controls with no room for additional elements;
  expanding them bloats the filter row.
- Rejected: the filter chip row must stay a compact filter control.

### Separate top-level "Outputs" screen

- Pros: One place for files across all requests.
- Cons: Detaches file review from the Workboard's request context; the provenance view was
  deliberately designed to be request-scoped.
- Rejected: the request-focused state is the natural home for a request-scoped view.

### Inline summary strip under the filter bar

- Pros: Visible without opening a drawer.
- Cons: Consumes vertical space whenever a request is selected, for a view that is only needed
  during review.
- Rejected in favor of an explicit button plus drawer.

### Per-run or per-agent sub-grouping inside the panel

- Pros: Clear run or agent context for each file.
- Cons: Recreates the open-each-run friction at smaller scale and slows scanning.
- Rejected: a flat file list with attribution chips keeps provenance without re-introducing
  per-run navigation.

### Hide missing files

- Pros: Every listed file is always openable.
- Cons: A deleted output silently disappears, losing the record of what the request produced.
- Rejected: provenance must survive deletion; missing files are shown and marked instead.

### Mark existence at run completion time

- Pros: No read-time IPC.
- Cons: Files deleted after completion would still show as present, misleading the user.
- Rejected: existence must be checked fresh when the panel opens.

## Consequences

- The user can review a Work Request's full file output as one whole, without opening each run.
- File attribution (which agent produced or changed each file, in which run) is visible at a
  glance, with optional drill-down into the originating run.
- Writes outside the request working folder are surfaced as a distinct group during review.
- Deleted or renamed outputs remain visible as provenance history rather than disappearing.
- No database migration is required; the view is derived from existing `work_runs` data.
- One new read-only IPC (`workboard.checkPaths`) is added, with its schema, handler, and
  preload bridge.
- The Workboard filter chip row is unchanged; the only new visible affordance is a button in
  the request-focused state.
- If a cross-request or file-centric file history is needed later, this decision should be
  revisited, likely superseded by an ADR introducing a durable file-event table.

## Implementation Notes

- The "Files (N)" button is rendered next to "Continue this work" in `WorkFilterBar`, gated on
  `selectedRequest`.
- File aggregation is a renderer-side derivation over the request's `WorkboardRun[]`,
  deduplicating by normalized workspace-relative path and collecting (run, agent, kind)
  attributions per file.
- In/outside grouping compares each path against the request's `workingRoot`.
- `getFileReferences` / `FileReferenceList` are extended, or a request-scoped variant is added,
  to support attribution chips, the missing state, and the two-group layout. Per-run behavior
  in the Run Detail drawer is unchanged.
- `workboard.checkPaths` reuses the central workspace path policy for resolution and existence
  checks; it must reject non-workspace-relative input like the existing path-policy guards.
- The request-scoped drawer follows the existing `RunDetailDrawer` structure and reuses the
  `workboard.revealPath` IPC for the reveal action.
