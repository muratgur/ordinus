# ADR-026: Workflow Designer Interaction Model

## Status

Accepted

Builds on ADR-025 (visual workflow designer), which defined the architecture
(node=task DAG compiled to `WorkboardDraftPlan`, reuse of the engine, IPC, and
persistence). This ADR covers the **interaction and presentation model** of the
Workflows screen — canvas chrome, the description editor, the action toolbar,
the Run control, run history, copy/tone, and supporting affordances. It does not
change the architecture, data model, or compile path from ADR-025. It **revises
one ADR-025 consequence**: the Workflows-screen "Run" is no longer new-WR-only
(see Run Control below).

## Date

2026-06-02

## Context

ADR-025 shipped a working but deliberately plain Workflows screen: a top header
bar (title + Refresh), a left list of designs, a React Flow canvas, inline
name/description inputs, and a single "Run" button that always created a new
Work Request. First real use surfaced several UX problems, walked through one by
one below.

A recurring grounding observation: **the Workboard screen already solves most of
these problems**, so aligning the Workflows chrome with Workboard buys
consistency for free. Workboard already has a dockable/hideable sidebar
(`sidebarDockedStorageKey`), an archived toggle (`showArchivedStorageKey`), a
left rail with a top-anchored "New" action, and it reads the active request from
a localStorage key (`ordinus-workboard-active-request`) on mount — which makes
deep-linking from another screen a one-line write.

### Description Prominence and Editing Comfort

The `description` field is not decoration: it becomes the request's
`originalRequest` and is injected into every agent's prompt as the overall goal
(ADR-025). It deserves prominence and room for long text. But a permanently
visible right panel felt odd when no node is selected, and a multi-line input
crammed into a header is uncomfortable to write in.

Chosen: a **collapsed "Goal" bar at the top of the canvas** that expands into a
**top-anchored drawer (top sheet) with a scrim** on click, collapsing back on
Esc / scrim-click / Done. Precedents: n8n's node-detail view (scrim over
canvas), FigJam top panels, Material "sheets + scrim." Rejected a centered
focus-modal (narrower horizontal writing area) and an anchored popover (too
small for long text, visually collides with the canvas without a scrim). The
top drawer gives full canvas-width writing room and is spatially consistent with
the collapsed bar it springs from.

### Canvas Chrome and Real Estate

The page-level header (title + Refresh) consumed vertical space for little
value. Removed. The canvas becomes the full surface. Authoring actions move onto
the canvas as floating controls (Excalidraw / Miro / tldraw precedent) rather
than a docked toolbar.

### Action Toolbar vs. Run

Authoring tools (Add Work Item, zoom/fit) and the Run action have different
weights: Run is terminal and consequential, the rest are frequent low-stakes
edits. Putting them in one strip risks accidental Runs. Chosen: a **left
vertical floating toolbar** for authoring (optionally an expandable speed-dial),
and a **separate, prominent Run control** on the right.

### Run Control and Target Memory

ADR-025 made the Workflows-screen Run create a new WR only, deferring append to
the composer. In practice the designer is exactly where you think "run this on
that job," so append belongs here too. And when a workflow was last run into a
specific WR, the user usually wants to re-run it there.

Chosen: a **split Run control with per-workflow target memory**, modeled on IDE
run-configuration buttons (IntelliJ / VS Code). The button shows its current
target ("Run → New request" or "Run → *[WR title]*"); one click runs that
target; the caret menu offers `New request`, `Last: [WR]`, and `Choose
request…` (an archived-aware picker). Default for a never-run workflow is New
request. The composer's workflow mode (ADR-025) is **kept** — Workboard is a
natural place to reach a workflow while working — so there are two entry points,
both funneling through the single `workflowRun` IPC / `compileDesign`.

Target memory is **per-workflow**, stored in **localStorage** keyed by design id
(`ordinus-workflow-last-target-<designId>`), not in the `workflow_designs`
table. It is convenience UI state, not durable design data; Workboard already
keeps analogous state (active request, sidebar dock, show-archived) in
localStorage. A stale (deleted) target silently falls back to New request.

### Sidebar: New-Workflow Placement and Hideability

Mirror Workboard: the left rail holds the design list with **"New workflow"
anchored at the top**, and the rail is **hideable/dockable** using the same
pattern as Workboard's `sidebarDockedStorageKey`.

### Run History: Deep-Link and Archived Runs

> **Amendment (2026-06-10, ADR-033):** Run history no longer lives in the left
> rail. The rail footer is removed under the shared rail design system, and **"Past
> runs" moves into the content area**, scoped to the selected workflow. The
> behavior described below (deep-link into Workboard, inline dimmed archived runs
> with an "Archived" badge) is preserved — only the location changes. The rail
> keeps "New workflow at top" and dockable behavior, now expressed through ADR-033's
> canonical stack.

Run history lives at the **bottom of the left rail**, scoped to the selected
workflow (top: all designs; bottom: the selected design's runs). Clicking an
entry writes the WR id to `ordinus-workboard-active-request` (and, if the run's
WR is archived, sets `show-archived` true) then navigates to the Workboard,
which opens that exact request — fixing the "always lands in the same place"
problem.

Archive is **request-level**, not run-level (there is no archived WorkRun; the
spawned WorkRequest is what gets archived). Run history is retrospective — its
value is the full timeline — so archived runs are shown **inline, dimmed, with
an "Archived" badge**, not hidden behind a toggle (unlike Workboard's
operational rail, which hides them by default).

### Copy and Tone

Current copy is mechanical ("Saved designs", "Select a workflow… to start
designing", "No agent", `window.confirm` for delete). The intended feeling is
warmer — designing how a team of collaborators works, "setting my friends'
work routine." But over-warming one screen while the rest of the app stays
technical creates inconsistency.

Chosen: **keep the core nouns** (Work Item, Agent, Run, Workflow) for app-wide
label consistency, and warm only the **connective copy** — empty states,
placeholders, helper text, confirmations, errors — with a "team / teammate /
routine / kick off" framing. Scope is **Workflows-only** for now (a pilot); a
broader voice pass across other screens is separate, owned work. The delete
confirmation moves from `window.confirm` to a **shadcn AlertDialog** (the
component does not exist yet and will be added) carrying the warm copy.

### Supporting Affordances

Three additions raised during design, all in scope:

- **Save-status indicator** — a small "Saving… / Saved / Save failed" pill in
  the floating chrome. Complements the autosave error-surfacing fix; reassures
  the user their work persists (the silent-save failure was a real bug).
- **Empty-canvas state** — a warm prompt ("add your first step…") when a
  workflow has zero nodes, instead of a blank canvas.
- **Edge-removal affordance** — a discoverable way to delete a dependency
  (hover-× on the edge and/or a hint), since the React Flow default
  (select + Backspace) is not discoverable.

## Decision

Redesign the Workflows screen interaction model, aligned with Workboard chrome
patterns, without changing ADR-025's architecture.

### Canvas Chrome

- Remove the page-level header (title + Refresh).
- Left rail = design list with "New workflow" at the top; rail is
  hideable/dockable, persisted in localStorage (mirroring Workboard).
- Run history at the bottom of the rail, scoped to the selected design;
  archived runs inline + dimmed + badged; click deep-links into the Workboard
  via `ordinus-workboard-active-request` (and `show-archived` when needed).

### Description Editor

- A collapsed "Goal" bar at the top of the canvas, showing a one-line preview
  or a placeholder.
- Click expands a top-anchored drawer with a scrim for roomy multi-line
  editing; Esc / scrim-click / Done collapses it.

### Floating Canvas Controls

- Left vertical floating toolbar: Add Work Item, zoom/fit (optionally an
  expandable speed-dial).
- Right-side split **Run** control with per-workflow target memory:
  - Button shows the current target; one click runs it.
  - Caret menu: `New request`, `Last: [WR]` (when set), `Choose request…`
    (archived-aware picker).
  - Memory in localStorage `ordinus-workflow-last-target-<designId>`; stale
    target falls back to New request.
  - Both targets dispatch through the existing `workflowRun` IPC.

### Copy and Tone

- Keep core nouns; warm connective copy only; Workflows-screen scope.
- Replace `window.confirm` delete with a shadcn **AlertDialog** (new component)
  carrying warm copy.

### Supporting Affordances

- Save-status pill (Saving… / Saved / Save failed) in the floating chrome.
- Warm empty-canvas state for zero-node workflows.
- Discoverable edge-removal affordance.

### Node Inspector

Unchanged from ADR-025: the right panel edits the selected node's task fields
(reusing `DraftItemFields`); dependencies remain edge-only.

## Consequences

The Workflows screen becomes visually and behaviorally consistent with
Workboard: same dockable sidebar idiom, same archived handling vocabulary, same
localStorage-backed view state, and a deep-link that reuses Workboard's existing
active-request mechanism. Users moving between the two screens meet familiar
patterns.

The split Run control with target memory makes "design once, run repeatedly on
the same job" a one-click action while keeping New request the safe default and
the target always visible (no accidental appends). Keeping the composer's
workflow mode means a workflow is reachable both where it is authored and where
work is happening.

Storing target memory and view state in localStorage keeps durable design data
clean (no schema change) at the cost of these conveniences being per-machine —
acceptable for a single-user desktop app, consistent with Workboard.

Warming only connective copy preserves cross-screen noun consistency while
making the authoring experience feel like arranging a team's work. Confining the
tone shift to Workflows avoids a half-migrated voice across the app; the broader
pass is deliberately deferred.

Adding the shadcn AlertDialog primitive is a small, reusable investment other
screens can later adopt for destructive confirmations.

## Out of Scope

- App-wide tone/voice revision and core-noun renaming (Workflows is the pilot).
- Persisting target memory or view state in the database / across machines.
- Run-level (as opposed to request-level) archiving.
- Cron / event triggers, runtime variables, and control-flow nodes — still
  deferred per ADR-025.
- Reworking the composer's workflow mode beyond keeping it as a second entry
  point.
