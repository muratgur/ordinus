# ADR-055: Agent Departments — User-Defined Rail Grouping

## Status

Accepted

Realizes the **grouping** capability that ADR-033 (Left Rail Design System)
deferred ("matured per-screen … starting with Workboard, in a later step") —
shipped first on **Agents**, not Workboard, because that is where the pressure is
real. Builds on ADR-027 (Agent home — team-roster rail) and ADR-038 (mascot avatar
+ `id|color` palette, reused if color is added later). Revises ADR-033's
"grouping's home is the ⚙ filter popover / Workboard-first" expectation; see
"Consequences for prior ADRs".

## Date

2026-06-21

## Context

The Agents rail (`agents-screen.tsx`, `AgentLibrary`) is a flat, status-sorted
list: pinned → has a pending question → working → most-recent activity
(`compareAgentChatRows`). That sort answers "who needs me right now?" well, and at
five or six agents the flat list is fine.

It stops being fine as the roster grows. The user runs agents across distinct
areas of life — Marketing, Management, Personal — and "gün geçtikçe artıyor": the
count keeps climbing. A flat list of twenty mixed-purpose colleagues forces the
user to scan the whole thing to find "my marketing people." The natural mental
model is **departments** — the same way a real org chart groups colleagues.

There is no grouping substrate today. The `agents` table has no `category`,
`department`, `group`, `folder`, or `tags` column. (`AgentProfile.category` exists
but is read-only *creation-template* metadata, never written onto a live agent.)
The IPC surface (`agents:list/create/update-settings/...`) has no grouping
operation. So this is a from-scratch data-model + UI decision, not a re-style.

The decision was pressure-tested in a design interview. Two tensions surfaced and
shaped the result:

1. **Grouping fights the status sort.** If the rail is *always* grouped by
   department, the agent that is waiting on you gets buried inside its section,
   and a second waiting agent sits in another section — you lose the single-glance
   "who needs me" signal that the flat sort exists to provide.
2. **There is no drag-and-drop library in the repo.** Manual section ordering — a
   stated requirement ("Management should sit on top") — is not free; it pulls in
   a new dependency. The user accepted that cost knowingly.

## Decision

Add a user-defined, single-membership **department** layer to agents, surfaced as
an optional grouping mode on the Agents rail. The data model is general; the v1 UI
is the Agents rail only.

### 1. Membership: one department per agent, nullable (1:1)

An agent belongs to **exactly one** department or to **none** (`departmentId`
nullable). "Department" is a deliberately singular, folder-like metaphor: a
colleague sits in one department on the org chart. This keeps the schema a single
FK, the UI free of "same agent in two sections" ambiguity, and the unassigned case
trivial. Multi-membership (tags/labels) was considered and rejected (see
Alternatives) — it can be layered later without invalidating this model.

### 2. Departments are user-defined, in their own table

Departments are first-class rows the user creates, names, reorders, and deletes —
**not** a fixed enum and **not** an implicit union of a free-text string on the
agent. A dedicated `departments` table is the home for identity (name), order
(`position`), and any future metadata (color), and it makes rename/delete/reorder
clean operations rather than bulk string updates.

```
departments
  id          text  PK
  name        text  NOT NULL          -- unique case-insensitive, trimmed, non-empty
  position    text|int                -- manual order (see §8)
  createdAt   text
  updatedAt   text
  -- color    text|null               -- deferred; nullable add when needed (§7)

agents
  + departmentId  text|null  FK → departments.id  ON DELETE SET NULL
```

### 3. Grouping is an opt-in view mode, not the default (resolves tension 1)

The rail keeps a **toggle** between two modes:

- **Flat** (default) — today's `compareAgentChatRows` status sort, unchanged.
  Single-glance "who needs me" is preserved.
- **By department** — agents grouped under department section headers.

The preference is a per-device view choice, persisted in `localStorage` (the
existing `home/storage.ts` pattern), not in the database. Defaulting to flat means
this feature never costs an existing user the urgency signal they rely on; they
opt into structure when they want it.

### 4. Assignment lives in the agent's profile editor

A department is set from a **dropdown in the agent's profile/identity editor**
(`EditProfileDialog`, the inline identity surface from ADR-027), alongside
name/role/avatar. The dropdown's footer carries a **"+ New department"** row, so a
department is created inline at the moment of first assignment — no separate setup
step, no empty-by-construction departments. This extends the existing
`agents:update-settings` contract (`AgentUpdateSettingsInput`) with `departmentId`
rather than adding a new assignment surface (drag-drop / context menu were
considered and deferred — see Alternatives).

### 5. Department management is inline on the rail

Rename / delete / reorder happen **in place** on the section headers in
"by department" mode (hover-revealed actions), not in a dedicated Settings page.
The department count is small and the management is lightweight; opening a new
Settings surface for it would be disproportionate. A general data model still lets
a Settings management page be added later if the count ever justifies it.

### 6. Unassigned agents are visible, never lost

Agents with `departmentId = null` render under a fixed **"Departmansız"** (No
department) section pinned to the **bottom** of the grouped rail. New agents are
born `null` — assignment is never forced at creation, keeping the ADR-027 create
flow untouched. Nothing disappears; the user assigns when ready.

### 7. v1 carries name only; color is deferred

A department row stores a **name** only. No color, no emoji in v1 — section
headers are text + agent count. Color is a cheap nullable column to add later
(reusing the ADR-038 mascot palette) if visual separation proves necessary; an
emoji/icon picker is explicitly out of scope. This keeps v1 minimal without
painting the schema into a corner.

### 8. Section order is manual; in-section order reuses the status sort

- **Between sections:** manual, drag-to-reorder, persisted via `position`. This is
  the one place v1 takes on a new dependency: **`@dnd-kit/core` + `@dnd-kit/sortable`**
  (the repo has no dnd library today). Because headers are *also* click-to-collapse
  (§9), the header carries a dedicated **drag handle**; the header body click
  toggles collapse, so the two gestures do not fight. The "Departmansız" section is
  exempt — it stays pinned to the bottom and is not draggable.
- **Inside a section:** the existing `compareAgentChatRows` comparator is reused
  verbatim — group by department first, then apply the same pinned → waiting →
  working → recent sort. Urgency is preserved *within* a section, and no new
  sorting code is written.

### 9. Sections are collapsible; collapsed state is per-device

Each section header toggles open/closed. The collapsed set lives in `localStorage`
(same store as the view-mode toggle), not the database — it is a per-device view
preference, and writing every collapse to the DB would be both over-engineered and
chatty. Collapsibility directly answers the "growing list" problem that motivated
the feature.

### 10. Deletion is safe: SET NULL plus confirmation

Deleting a department sets its members' `departmentId` to `null` (DB
`ON DELETE SET NULL`); the agents survive and fall into "Departmansız". If the
department is non-empty, deletion is gated by a confirmation ("N agent will move to
Departmansız"). A department may sit **empty** (0 agents) and still render with a
"henüz agent yok" placeholder, keeping its `position` — a department is a standing
intent that lives until the user explicitly deletes it. Auto-hiding or
auto-deleting an emptied department was rejected (see Alternatives).

### 11. Name validation

Department names are **trimmed, non-empty, unique case-insensitively** (`marketing`
== `Marketing`), with a reasonable max (~40 chars). Inline create/rename warn on
collision. This keeps the taxonomy clean and prevents accidental twin departments,
which would defeat the organizing purpose.

### 12. Search keeps the grouping

In "by department" mode, searching filters within the grouped view: matching agents
stay under their department headers and sections with no matches are hidden. The
mode does not silently collapse to a flat result list — department context is part
of what the user is looking at. (Flat mode's search is unchanged.)

### 13. Scope: Agents rail only in v1

The data model (`departments` + `agents.departmentId`) is general, but the **only
v1 UI surface is the Agents rail**. Other agent-pickers — Ordinus handoff, the
Telegram inbound picker (ADR-044), Workboard/workflow agent assignment — are left
untouched. The user framed this as "öncelikle Agents sayfasında"; landing the rail
first, on a model that already generalizes, makes adding those surfaces a cheap
follow-up rather than a v1 tax.

## Alternatives Considered

### Multi-membership tags/labels (N:N) instead of 1:1 department
- Pros: an agent could be both "Marketing" and "Personal"; more flexible.
- Cons: needs a join table, the same agent appears in multiple sections, and the
  unassigned/sort/ordering logic all get more complex.
- Rejected: the user's own framing was "departments", which are singular; the
  folder model is cleaner and a tag layer can be added later over the same table.

### Free-text `department` string on the agent (no table)
- Pros: minimal migration, no second table.
- Cons: rename becomes a bulk update, a typo silently forks a new department, there
  is no home for `position`/color, and an empty department cannot exist.
- Rejected: contradicts the user-curated-taxonomy goal; the table is the right home
  for identity, order, and metadata.

### Fixed enum of departments
- Pros: simplest possible.
- Cons: a new department is a code change — it does not solve "the count keeps
  growing" at all.
- Rejected: the whole point is a taxonomy the user owns.

### Always-grouped rail (no flat mode)
- Pros: simpler — one rendering path.
- Cons: buries the "who needs me right now" signal across sections; the status sort
  that the rail exists to provide is lost.
- Rejected: grouping is made an opt-in view mode so both needs are served without
  conflict. (A global "Needs attention" section above the groups was also weighed;
  rejected for v1 as it shows some agents in two places.)

### Drag-drop / right-click assignment instead of a profile dropdown
- Pros: direct, tactile bulk re-filing.
- Cons: drag-drop needs the dnd library *and* only works in grouped mode; a context
  menu is a new, low-discoverability surface.
- Rejected for v1: the profile dropdown is the lowest-surface, single-IPC change and
  puts department where the agent's identity is edited. Drag-to-assign can be a
  fast-follow.

### Manage departments in a dedicated Settings section
- Pros: formal, good for heavy bulk management.
- Cons: an extra nav surface and round-trip for what is a handful of rows.
- Rejected for v1: inline header management is proportionate; Settings can come later
  off the same model if volume justifies it.

### Color + emoji identity in v1
- Rejected: needs a picker UI and meaningfully grows scope; name-only ships now,
  color is a cheap nullable add later (ADR-038 palette).

### Auto-hide or auto-delete an emptied department
- Rejected: "departmanım nereye gitti?" confusion and surprise data loss; an empty
  department is a kept intent until explicitly deleted.

## Consequences

### For prior ADRs

- **ADR-033 (Left Rail Design System) is the parent and is partially revised.**
  ADR-033 deferred grouping, reserved the ⚙ filter popover as "grouping's home",
  and expected grouping to "mature per-screen, starting with Workboard." This ADR
  **realizes grouping first on Agents** (strongest need) and expresses it as a
  **view-mode toggle (Flat ↔ By department)** rather than a filter-popover entry.
  The exact pixel home of the toggle (a segmented control in the rail utility row
  vs. a control inside the ⚙ popover) is an implementation detail that stays
  consistent with ADR-033's utility row; what changes is that grouping is no longer
  Workboard-first and is no longer assumed to live *inside* the filter. ADR-033's
  item anatomy (Agents row = avatar · name · live/snippet meta · date+unread dot) is
  **unchanged** — sections are headers *above* unchanged rows. The collapsed `w-12`
  mini-roster strip (ADR-033 revision) stays **flat** in v1; grouping applies to the
  expanded rail only.
- **ADR-027 (Agent home) gains an organizational layer.** The team-roster rail now
  optionally groups by department, and `EditProfileDialog`'s inline identity editor
  gains a department selector. Department is neither "warm direction" nor "security
  machinery" (ADR-027 §4's split) — it is a lightweight org attribute on identity,
  and it sits with name/role rather than in the About "Trust & access" corner.
  Presence semantics and the 1:1 room are untouched.

### General

- **Schema:** new `departments` table + `agents.departmentId` (nullable,
  `ON DELETE SET NULL`); name unique case-insensitive. Migration is an additive,
  versioned change (per the conservative SQLite persistence approach).
- **IPC:** new `departments:list / create / rename / delete / reorder` channels;
  `AgentUpdateSettingsInput` / `agents:update-settings` extended with
  `departmentId`. Renderer calls go through the typed `window.ordinus` bridge.
- **New dependency:** `@dnd-kit/core` + `@dnd-kit/sortable` (first dnd use in the
  repo) for section reordering. Accepted knowingly as the cost of manual ordering in
  v1.
- **Renderer:** `AgentLibrary` gains grouped rendering, the view-mode toggle,
  collapsible draggable section headers, and inline header CRUD;
  `compareAgentChatRows` is reused inside sections; `localStorage` holds view-mode
  and collapsed-set.
- **Reuse maximized:** existing status comparator, profile editor, avatar palette,
  and localStorage pattern; no change to the create flow, the 1:1 room, presence, or
  any other agent-picker surface.
- **Deferred, non-structural follow-ups:** department color, drag-to-assign,
  grouping in other agent-pickers, and a Settings management page — all additive over
  this model.

## Revision (2026-06-22): separate the three responsibilities

The first implementation shipped exactly as §4/§5/§8 described — assignment via a
profile dropdown with inline create, CRUD inline on the rail section headers, and
drag-to-reorder by dragging whole rail sections. Using it surfaced a clear problem:
**three distinct responsibilities — display, assignment, and taxonomy management —
were conflated onto the rail rows and the profile dialog.** Listing happened where
editing happened; a draggable grip pushed section titles around; and dragging a whole
section (header + all its agent rows, with avatars) produced unstable visuals
(the group grew/shrank mid-drag). The conflation, not any single control, was the
fault. This revision separates the three:

- **Display — rail section headers become display-only.** A header is now just a
  collapse chevron + name + agent count. No grip, no rename, no delete. This removes
  the title-shift artifact and the whole-section drag jank.
- **Management — a single "Departments" popover anchored to the rail's Layers icon**
  (the icon opens the popover instead of directly toggling). It hosts everything
  taxonomy: a **"Group by department"** switch (the flat ↔ grouped toggle moves here),
  the department list with **inline rename, delete, and drag-to-reorder within that
  contained list**, and **"+ New department"** inline create. Reordering short name
  rows in a small list is smooth and predictable — the jank was a side effect of
  dragging heavy rail sections, not of dnd itself. This **revises §5** (management is
  no longer inline on the rail) and **§8** (reorder happens in the popover list, not by
  dragging rail sections). `@dnd-kit` usage moves from the rail to this popover.
- **Assignment — the profile dialog keeps a selection-only dropdown.** The inline
  "+ New department" sentinel is removed (creation now lives in the management popover),
  which **revises §4**: assignment is dropdown-selection only in v1. Drag-to-assign
  (dragging a single agent row into a section — stable because rows are uniform and
  small, unlike sections) is the deferred fast-follow.
- **Product strings are English.** The first cut leaked Turkish ("Departmansız",
  "henüz agent yok") into an otherwise-English UI. The catch-all section and the
  no-department dropdown option read **"No department"**; the empty-department
  placeholder reads **"No agents yet"**. (The ADR's earlier Turkish examples were
  illustrative, not product copy.)

Unchanged: the schema, the `departments:*` IPC channels and repo methods, the
`compareAgentChatRows` reuse within sections, and the localStorage view-mode +
collapsed-set persistence. The data model and backend carry over verbatim; only the
renderer's surface for management and assignment is reshaped.

## Related

- ADR-033: Left Rail Design System (parent; grouping deferral realized here)
- ADR-027: Agent home — 1:1 chat room and colleague profile (roster + profile editor extended)
- ADR-038: Agent mascot avatar system (`id|color` palette, reused if color is added)
- ADR-044: Telegram inbound trigger layer (an agent-picker surface, out of v1 scope)
