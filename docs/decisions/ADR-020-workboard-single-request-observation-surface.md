# ADR-020: Workboard As A Single-Request Observation Surface

## Status

Accepted

Supersedes the "Live Board" section of ADR-007 and the placement decision of ADR-019.
Extended by ADR-021, which adds request archiving to the sidebar this ADR introduced.

Amendment (2026-05-22): the collapsed-sidebar hover flyout described in "Sidebar Open,
Collapsed, And Hover States" was removed. In practice the flyout opened and closed on
incidental hover over the collapse toggle and got in the user's way. The collapse toggle now
only docks/collapses the sidebar on click; quick switching while collapsed is done by
docking the sidebar. The docked/collapsed states themselves are unchanged.

## Date

2026-05-22

## Context

ADR-007 established the Workboard as the surface where users create, review, start, and
monitor agent work, and defined the live board as horizontally scrollable status columns
mapped one-to-one onto the runtime status vocabulary: Queued, Running, Waiting, Blocked,
Completed, Failed, Cancelled. ADR-014 then removed the global request input and made the
Workboard "an observable command surface for selecting, monitoring, and inspecting work".
ADR-019 added a request-scoped file provenance panel, triggered by a "Files (N)" button in
`WorkFilterBar`.

In practice the observation experience does not hold up once a user has accumulated real
work. The current screen has the following problems:

- **Filter chips are misused as work tracking.** Requests appear only as chips in
  `WorkFilterBar`. A chip reads as a transient filter, but users treat selecting one as
  entering a persistent working context. The horizontal chip row overflows ("+13 more") and
  strains visibility.
- **Seven status columns, four chronically empty.** The runtime has seven statuses, so the
  board has seven columns. Queued, Waiting, Failed, and Cancelled are usually empty. Empty
  columns occupy the screen and force horizontal scrolling, while the columns the user
  actually watches compete for attention with dead space.
- **Completed work accumulates without bound.** Every finished run stays in the Completed
  column. A mature request shows tens of completed cards. The user wants to see what just
  finished, not scroll an ever-growing archive.
- **Cards lack the fields needed to track work.** Cards show an untruncated title, the agent
  name, an activity or summary line, and the parent request title. Long titles inflate card
  height. There is no timestamp and no clear within-column ordering, so a user cannot tell
  what is recent or what has been stuck longest.
- **The default route is a dead screen.** `defaultAppRoute` points at `/home`, but
  `HomeScreen` is an unstyled "Hello Ordinus" placeholder that is not even in the navigation.
  The application opens onto a dead screen and the user manually navigates to the Workboard.

The underlying issue is that the board is built as an equal-citizen kanban of every runtime
status, across every request at once. The user's actual mental model is narrower: at any
moment they work inside **one** request, they watch a small set of states closely, and they
treat the rest as background. The Workboard is meant to be their primary working surface but
does not feel like one.

This ADR redefines the Workboard's observation model. It does not change request creation,
the planning pass, the Review Plan modal, or the destination/context model from ADR-007 and
ADR-014.

## Decision

Make the Workboard a **single-request observation surface**: a master-detail screen where the
user selects one active Work Request and observes its runs through three consolidated status
columns.

### Workboard Is The Primary Surface

The Workboard becomes the application's primary surface.

- The dead `HomeScreen` placeholder is removed and `defaultAppRoute` points at the Workboard.
- The application opens directly onto the Workboard.

### Single Active Request

The user observes exactly one Work Request at a time.

ADR-007 listed "all work", "one Work Request", and "filtered subsets such as active work" as
board viewing modes. This ADR narrows that: the board always shows one request. There is no
"All" or "Active" cross-request board view. Cross-request awareness is provided by the
request sidebar (below), not by a combined board.

### Screen Layering

The Workboard has three distinct tiers, and the UI must make the tier of each region
visible:

1. **Application chrome** — the global top navigation (Agents, Workboard, Conversations,
   Schedules). Owned by the app shell, not the Workboard.
2. **Request navigation** — switching between Work Requests and creating new ones. This is a
   level above the work itself.
3. **The selected request** — everything else. The request header and the three columns all
   belong to the one selected Work Request.

The original design gave tiers 2 and 3 equal visual weight: the request list was rendered as
a bordered card identical to a board column. That is wrong. Tier 2 is navigation chrome and
must read as a different, lighter surface than the board columns of tier 3.

### Request Sidebar

Replace the `WorkFilterBar` chip row with a **request sidebar** — a tier-2 navigation
surface, not a board column.

- The sidebar is a navigation surface: no card border, a recessed background distinct from
  the bordered board columns, spanning the full height of the Workboard region.
- It lists Work Requests. Selecting a row makes that request active; the columns then show
  that request's runs. The selection is persistent — it is the user's working context, not a
  transient filter.
- The **New** action lives at the top of the sidebar, above search and the list. Creating
  new work and switching between work are the same family of action and both belong to
  tier 2. New does not appear in the request header.
- Search sits below New and filters the sidebar (a request finder). It does not search
  within a request's runs in this iteration.
- Each sidebar row is a lightweight two-line list item — not a card: line one is an
  attention marker plus the request title; line two is a muted progress indicator
  (completed of total). The attention marker is shown when one of the request's runs needs
  the user or is actively running.
- Rows are ordered by most recent activity, not alphabetically.

### Sidebar Open, Collapsed, And Hover States

The sidebar has two persistent states plus a transient hover affordance:

- **Docked** — the sidebar is open and pushes the columns narrower. Used when the user wants
  the request list continuously visible, e.g. while tracking more than one request.
- **Collapsed** — the sidebar is hidden and the columns take the full width.
- The collapse toggle lives at the far left of the request header and is always visible.
  Clicking it switches between docked and collapsed.
- When collapsed, **hovering** the toggle opens a small transient flyout containing only the
  request list (the same lightweight rows). Clicking a request switches to it and closes the
  flyout; the sidebar stays collapsed. This gives reflow-free quick switching. New and search
  are not in the flyout; reaching them means clicking the toggle to dock the full sidebar.

The docked/collapsed state and the last active request are remembered across sessions; on
first launch the sidebar is docked.

### Request Header

Request-scoped affordances live in a **request header** — a borderless strip above the
columns, not a separate filter bar and not a bordered card.

- The header contains the collapse toggle, the active request title, "Continue this work",
  and the ADR-019 file provenance entry point ("Files (N)").
- The header and the three columns together read as one unit — the selected request — but
  this unity comes from alignment and proximity, not from a wrapping container. There is no
  outer box around the header and columns; the header is a plain strip and each column keeps
  its own border. Nested boxes are avoided deliberately.

### Three Consolidated Columns

Replace the seven status columns with three columns that group the seven runtime statuses.
The runtime status vocabulary is unchanged; only the board projection is consolidated.

- **Waiting** — runtime statuses `queued` and `blocked`. Work that has not started, including
  work blocked behind dependencies. The user glances at this column; it is not actionable,
  because blocked means runs waiting on each other, not runs waiting on the user.
- **Running** — runtime statuses `running` and `waiting_for_user`. Work in flight.
  `waiting_for_user` belongs here, not in Waiting: such a run is the active thing and it needs
  the user. It is distinguished by an input-needed badge on the card (the existing
  `getWorkRunInputBadge` affordance), so it stands out without leaving the column the user
  watches most.
- **Done** — runtime statuses `completed`, `failed`, and `cancelled`. All terminal outcomes.
  Outcomes are distinguished within the column by colour and icon rather than by separate
  columns, because `failed` and `cancelled` are low-frequency and do not justify dedicated
  columns. A failed run is visible in this column; no separate notification or sidebar badge is
  added for failures in this iteration.

The three columns are equal-width and fit on screen without horizontal scrolling. Each column
scrolls vertically within itself.

### Done Column Windowing

The Done column shows a rolling window of the most recent terminal runs (approximately the
last five), newest first. Older terminal runs are collapsed behind an inline expander within
the same column. Expansion happens in place; it does not navigate away.

This keeps recent outcomes glanceable — the user's ambient "what just finished" need — without
the column growing without bound.

### Card Content

Each run card shows:

- The run title, truncated to two lines.
- The assigned agent name.
- A status-relevant timestamp (for example, time since start, time waiting, or time since
  completion, depending on the column).
- For running cards, the existing live activity signal from the observability layer (ADR-011).

The parent request title is removed from the card. The sidebar already shows the active request,
so repeating it on every card is noise.

Within-column ordering:

- **Waiting** — longest-waiting first. The run stuck longest deserves attention first.
- **Done** — newest first.
- **Running** — ordered to surface runs needing attention or appearing stalled first.

### Context-Aware Empty States

Columns do not show a generic "No Work Items" placeholder. Each empty column shows a message
that reflects the request's actual state.

- An empty **Running** column explains why nothing is running: work is queued in Waiting, the
  request is fully complete, or the request has no runs yet (with a prompt to add work).
- An empty **Waiting** column reads as a cleared queue.
- An empty **Done** column reads as nothing completed yet.

When no request is selected — rare, because the last active request is remembered — the board
area shows a simple prompt to pick a request from the sidebar.

## Alternatives Considered

### Keep The Seven-Column Status Board

- Pros: One column per runtime status; the board is a direct mirror of the runtime model.
- Cons: Four columns are chronically empty; the board needs horizontal scrolling; the columns
  the user watches compete with dead space.
- Rejected: the board should project the runtime model for the user, not mirror it
  one-to-one.

### A New Separate Dashboard Or Home Module

- Pros: Could give an at-a-glance overview distinct from the working board.
- Cons: The user's pain is observation inside the board, not the absence of an overview. A new
  module adds a surface and cross-screen navigation without solving that pain.
- Rejected: refocus the Workboard in place instead of adding a surface.

### Split Creation And Observation Into Separate Screens

- Pros: Each screen optimised for one task.
- Cons: Creation already works well; ADR-014 deliberately unified New and Continue into one
  composition surface. Splitting observation off would scatter a working flow.
- Rejected: the observation problem does not require moving creation.

### Multi-Request Board View

- Pros: See several requests' runs at once.
- Cons: The user reports that tracking multiple requests at once is confusing; a combined
  board is the current overflow problem at larger scale.
- Rejected: one active request at a time; the sidebar carries cross-request awareness.

### Attention Strip Instead Of A Waiting Column

An earlier iteration considered a top "needs you" strip merging `waiting_for_user` and
`blocked`, collapsing to a thin line when empty.

- Pros: An empty attention area would occupy almost no space.
- Cons: `blocked` is not actionable by the user — it means runs waiting on each other — so an
  attention strip would be permanently populated by non-actionable work and would not collapse
  in practice. `waiting_for_user` is the only genuinely actionable state, and a card badge
  already surfaces it.
- Rejected: three equal columns; `waiting_for_user` is surfaced by a card badge inside
  Running.

### Collapsing The Done Column By Default

- Pros: Removes the accumulation entirely from view.
- Cons: Also hides recently finished work, killing the user's ambient "what just finished"
  signal.
- Rejected in favour of a rolling recent window with an inline expander.

## Consequences

- The Workboard becomes the application's primary surface and opens by default; the dead
  `HomeScreen` placeholder is removed.
- The board always shows one request. There is no combined "All" or "Active" board view.
- `WorkFilterBar` and the request chip row are removed and replaced by the request sidebar.
- The request sidebar is a tier-2 navigation surface, visually distinct from the tier-3
  board columns; it is dockable, collapsible, and offers a hover flyout for quick switching.
- Cross-request awareness moves from a chip row to per-row sidebar indicators.
- The board has three consolidated columns instead of seven; horizontal scrolling is removed.
- The runtime status vocabulary is unchanged; only the board's projection of it changes.
- Terminal runs no longer accumulate unbounded in view; the Done column windows recent
  outcomes with an inline expander for the rest.
- Run cards gain a timestamp and explicit ordering and lose the redundant request title.
- The ADR-019 file provenance panel is unchanged in data model, layout, missing-file
  handling, and the `workboard.checkPaths` IPC. Only its entry point moves: the "Files (N)"
  affordance now lives in the request header instead of `WorkFilterBar`.
- ADR-007's "Live Board" section and ADR-019's placement decision are superseded; their other
  decisions stand.
- Status colour coding and a dedicated failure notification are deliberately out of scope for
  this iteration and may be revisited.

## Implementation Notes

- The three-column grouping is a renderer-side projection over `WorkboardRun.status`. Do not
  change `WorkRunStatusSchema` or any runtime status value.
- Replace the `columns` definition in `workboard-screen.tsx` with the three-column model and
  a status-to-column mapping.
- Remove `WorkFilterBar` and the `requestFilter` / `All` / `Active` filter state. Introduce a
  request sidebar component with persistent active-request selection.
- The sidebar is a borderless, recessed navigation surface — not a `rounded-lg border bg-card`
  column. The request header is a borderless strip. Board columns keep their individual
  borders. No wrapper border groups the header and columns.
- Persist the active request id and the sidebar docked/collapsed state. Reuse the existing
  renderer UI-preference persistence (`localStorage`, as used for theme) rather than adding a
  table or IPC.
- The collapse toggle lives at the request header's far left. A hover flyout over the toggle
  shows the request list for quick switching while the sidebar is collapsed.
- "New" lives at the top of the sidebar, not in the request header.
- Move "Continue this work" and the ADR-019 "Files (N)" button into the request header. The
  provenance drawer, its aggregation, and `workboard.checkPaths` are unchanged.
- Add a two-line clamp to the card title and a status-relevant timestamp; remove the parent
  request title from the card.
- Done-column windowing is renderer-side: sort terminal runs newest first, render the first
  N, collapse the rest behind an inline expander.
- Empty-state copy is derived from the active request's run counts per column.
- Update `defaultAppRoute` to the Workboard and remove `HomeScreen` and its route.
- Keep all behaviour behind the existing typed IPC; this ADR adds no new IPC.
