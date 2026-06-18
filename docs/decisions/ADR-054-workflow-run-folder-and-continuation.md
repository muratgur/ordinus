# ADR-054: Workflow Run — Working-Folder And Continuation Selection

## Status

Accepted

Builds on ADR-025 (visual workflow designer: node=task DAG compiled to
`WorkboardDraftPlan`, engine/IPC/persistence reuse), ADR-026 (Workflows-screen
interaction model and the split **Run control** with per-workflow target
memory), and ADR-031 (Workboard working-folder picker: New-folder vs
Existing-folder, `assertSelectableWorkingRoot`, bucket-root guard). It **revises
one ADR-026 consequence**: the canvas Run control is no longer the only way to
launch a workflow with a target, and it gains a "Run with options…" entry. It
does not change the compile path, the run engine, or the DAG execution model.

## Date

2026-06-18

## Context

A saved workflow runs through one of two entry points today, and both are
poorer than the equivalent free-text ("Describe") path:

1. **Workboard → "New request" dialog → "Saved workflow" tab**
   ([`workboard-screen.tsx`](../../app/src/renderer/src/screens/workboard-screen.tsx)).
   The tab shows only a workflow picker plus the destination dropdown
   (`WorkRequestSelect`). It does **not** expose the working-folder panel or the
   "Continue from" run picker — both are hidden in workflow mode
   (`isWorkflowMode` guards at the `WorkingFolderPanel` and `ContinueFromSelect`
   render sites).
2. **Workflows screen → canvas "Run" split button**
   ([`workflow-run-control.tsx`](../../app/src/renderer/src/components/workflow-run-control.tsx),
   ADR-026). One-click run with remembered target; a dropdown offers "As a new
   request" / "Again on '<last>'" / "Add to an existing request…" (a bare list).
   No folder choice, no continuation.

The reported needs:

- **Pick the working folder when starting a new run.** Two different workflows
  may need to run against the *same* folder on disk (e.g. a "strategy" workflow
  and a "content" workflow both operating on one project). This is two separate
  Work Requests that share one physical folder — exactly the ADR-031
  *New request + Existing folder* case, which is already implemented for the
  Describe path but unreachable for workflows.
- **Continue an existing Work Request, or continue from a specific Work Run
  inside it.** Appending a workflow to a WR already works
  (`target: { kind: 'append', requestId }`), but the appended sub-DAG is fully
  isolated — it cannot be told "start after, and consume the output of, that
  run."

The grounding observation mirrors ADR-026's: **the Describe path already solves
all of this.** Its rich start path,
[`createWorkRequestPlan`](../../app/src/main/db/database.ts) (IPC
`workboard:start-request-plan`), already implements New-folder/Existing-folder
allocation, append-to-WR, and continuation via context references. The shared
contract is [`WorkboardStartRequestPlanInputSchema`](../../app/src/shared/contracts.ts):
`{ originalRequest, destinationRequestId?, contextReferences[], requestedAgentIds[], workingRoot?, plan }`.

By contrast, the workflow path uses an impoverished funnel: `workflow:run`
(`WorkflowRunInputSchema = { designId, target }`) → `createWorkRequest` /
`createWorkRequestFollowUp`. Neither accepts a `workingRoot` and neither binds
the new sub-DAG to an existing run. Extending *this* funnel would mean
re-implementing folder allocation and dependency binding that already exist.

Two semantic notes that shaped the decision:

- **No planner for workflows.** A workflow compiles directly to a plan
  ([`compileWorkflowDesign`](../../app/src/main/workboard/compile-design.ts));
  there is no free-text → LLM step. So "continue from a run" cannot ride the
  planner-context route the Describe path conceptually has — it must become a
  real plan dependency.
- **Context references already produce real dependencies.** In
  `createWorkRequestPlan`, a `work_item` context reference whose run is still
  in-flight *or* completed-with-output becomes a `contextDependencyRun`
  ([`shouldUseContextDependency`](../../app/src/main/db/database.ts)) and is
  injected into every plan item's required-run set. Failed/cancelled runs do
  not. This is precisely the "continue from a Work Run" semantic we want, for
  free.

## Decision

### 1. Unify the workflow start path on `createWorkRequestPlan`

The `workflow:run` IPC handler stays the entry point but becomes a thin
compile-then-delegate wrapper: it compiles the design to a plan
(`compileWorkflowDesign`, main-side, unchanged) and then calls
`createWorkRequestPlan` instead of the `createWorkRequest` /
`createWorkRequestFollowUp` split. The workflow path thereby inherits
folder allocation, append, and continuation with **identical semantics** to the
Describe path, and no logic is duplicated.

`WorkflowRunInputSchema` is enriched to carry the same target fields the Describe
composer already builds (a `WorkComposerTarget` subset):
`destinationRequestId?`, `workingRoot?`, `contextReferences[]`. The discriminated
`WorkflowRunTarget` union is retired in favor of these flat optional fields,
matching `WorkboardStartRequestPlanInputSchema`.

`WorkboardStartRequestPlanInputSchema` gains an optional `workflowDesignId`,
set only on the new-WR workflow path and written to the `work_requests` row, so
run history still records which workflow produced the request (preserving the
ADR-025 linkage that the old `createWorkRequest` carried). Append does **not**
set the link (unchanged from prior behavior).

### 2. Selections are per-run, not saved on the workflow

The folder, destination, and continuation choices are made each time the
workflow is launched and are **not** persisted into the `WorkflowDesign`. The
motivating need ("run the same workflow in different folders") is inherently
per-run, and this keeps the design schema and the Describe path identical. A
saved "default folder" per workflow was considered and rejected as unneeded
complexity (see Alternatives).

### 3. Continuation binds to the workflow's root nodes

When the user picks one or more runs in "Continue from," those runs become
dependencies of the compiled workflow. Mechanically this rides the existing
`contextReferences` path, which adds the dependency to *every* plan item; since
the workflow's roots gate all downstream nodes, this is behaviorally equivalent
to "the root nodes depend on the selected run(s)." Completed runs count as
already satisfied and contribute their output as context; in-flight runs are
awaited. Multiple selections are allowed (same as Describe).

### 4. Workflows run directly — no planner, no "Review before start"

The "Run workflow" action starts immediately. The Describe-only
"Review before start" checkbox is **not** added to the workflow surfaces: a
workflow is already a reviewed graph, and the folder/continuation choices are
visible in the dialog before launch.

### 5. UI — one rich dialog, two entry points

- **Workboard "Saved workflow" tab** gains the three controls that already
  exist on the Describe tab, with identical show/hide rules:
  - **Destination** (`WorkRequestSelect`): New Work Request ↔ existing WR.
  - **Continue from** (`ContinueFromSelect`): enabled once a WR is selected;
    multi-select.
  - **Working folder** (`WorkingFolderPanel`): shown only for New Work Request;
    hidden when a destination WR is selected (the WR's folder is inherited).
- **Canvas Run control** (ADR-026) keeps its one-click quick-run with remembered
  target (auto New-folder) — the ADR-026 speed is preserved. Its dropdown gains
  **"Run with options…"**, which opens the *same* rich "Run workflow" dialog
  with this workflow preselected. The old "Add to an existing request…" item and
  its bare `ExistingRequestPicker` list are superseded by the dialog (which now
  covers append + folder + continuation); the quick "Again on '<last>'" shortcut
  may remain.

Validation reuses ADR-031: when Existing-folder is chosen but no folder is
selected, "Run workflow" is disabled; bucket-root folders remain unselectable
via `assertSelectableWorkingRoot`.

## Alternatives Considered

### Extend the separate `workflow:run` / `createWorkRequest` funnel

- Pros: workflow path stays isolated; the shared Describe path is untouched.
- Cons: re-implements folder allocation and run-dependency binding that already
  live in `createWorkRequestPlan`; two divergent implementations to keep in sync;
  real risk of semantic drift (e.g. the `shouldUseContextDependency` rules).
- Rejected: the workflow start is strictly a subset of the Describe start
  (compile → plan, then the same persist-and-run), so a second implementation
  earns nothing.

### Save folder/continuation defaults on the `WorkflowDesign`

- Pros: a workflow that "always runs in folder X" pre-fills on open.
- Cons: a new field on the design schema, a divergence from the Describe path,
  and continuation defaults make no sense to persist (binding a design
  permanently to a transient run).
- Rejected: the actual need is choosing the folder *at run time*, which per-run
  selection already satisfies.

### Canvas Run button always opens the rich dialog (drop quick-run)

- Pros: a single consistent path; one less affordance to reason about.
- Cons: discards the ADR-026 one-click, remembered-target run that makes the
  canvas button feel like an IDE run-config.
- Rejected: keep the quick path; expose the rich path via "Run with options…".

### Resume a Work Run's provider session ("continue" = re-open that session)

- Pros: literally continues one agent's conversation.
- Cons: no such lifecycle exists; a workflow is a DAG, so mapping "which node
  resumes which session" is ill-defined; much larger surface.
- Rejected for v1: "continue from a Work Run" means *depend on and consume the
  output of* that run, not resume its session.

## Consequences

- One start path (`createWorkRequestPlan`) backs both Describe and workflow runs;
  folder/append/continuation behave identically across them.
- `WorkflowRunInputSchema` and `WorkboardStartRequestPlanInputSchema` change:
  the former drops the `WorkflowRunTarget` union for flat optional target fields;
  the latter gains optional `workflowDesignId`. Preload bridge and renderer call
  sites update accordingly.
- The canvas Run control’s "Add to an existing request…" path and its
  `ExistingRequestPicker` are superseded by the shared dialog; the component is
  simplified or removed.
- Two separate Work Requests can now intentionally share one physical working
  folder. They run independently — there is no cross-WR coordination or file
  locking; this is the user's explicit choice, not a managed mode.
- ADR-026's "Run is no longer new-WR-only" consequence is carried forward and
  extended: the canvas Run control now also reaches folder and continuation
  choices via the rich dialog.
