# ADR-033: Left Rail Design System

## Status

Accepted

Cross-cutting UI decision. Builds on ADR-020 (Workboard request sidebar), ADR-021
(Workboard archiving), ADR-026 (Workflow designer interaction model), ADR-027
(Agent home), and ADR-032 (advisory Conversations). **Revises** ADR-021 (archive
moves from a sidebar footer toggle to a filter control) and ADR-026 (run history
moves out of the rail). See "Consequences for prior ADRs".

## Date

2026-06-10

## Context

Five screens share the same gross layout — a left column plus a center content
area: **Home, Workboard, Workflows, Conversations, Settings** (and Agents). The
left column is the most-used navigation surface in the product, yet each screen
grew its own version independently. An audit of the current code found:

- **Four different container treatments.** Workflows / Settings / Agents /
  Conversations wrap the column in a bordered `bg-card` "panel"; Workboard and
  Home use a borderless rail (`border-r`, page background). Workboard's
  borderlessness was a deliberate choice — the board already shows three bordered
  kanban columns, and a fourth bordered column on the left reads as confusing.
- **Two widths** (`w-64` vs Settings' `240px`) and **two dock behaviors**
  (Home/Workboard/Workflows are dockable; Agents/Conversations/Settings are not).
- **Inconsistent anatomy.** Workboard has no header; others do. CTA is a
  full-width button on some screens, an icon-only `+` on others. Search exists on
  some, not others. The bottom of the rail does three unrelated jobs: an archive
  filter (Workboard "Show/Hide archived"), an archive disclosure (Home), and a
  selected-record secondary list (Workflows "Past runs").
- **Divergent selection styling** — rounded filled chip + orange bar (Workboard),
  flat row + subtle `bg-accent` (Workflows), `bg-primary-soft` (Settings/Agents).

The cost is cognitive, not cosmetic: the same column behaves and looks different
on every screen, so the user re-learns the surface each time. The goal is **one
shared cognitive model** — the left column always sits in the same place, carries
the same weight, and offers the same selection behavior — *not* pixel-identical
screens. Per-screen differences are expected; they must express through a shared
grammar, not ad-hoc divergence.

A guiding principle surfaced during design: **fix where things belong before
making them look good where they are.** A control in the wrong place (an archive
"filter" rendered as a bottom-left footer button) should be relocated, not
restyled in place.

## Decision

### Two roles, one shared grammar

The left column is **not** a single component. It is two roles that share one
design language (width, frame, header typography, selection language, spacing
rhythm) but differ in item anatomy:

1. **Record List Rail** — Home, Workboard, Workflows, Conversations, Agents.
   You select one record from a collection; the selection opens on the right.
2. **Section Nav** — Settings only. You switch in-page sections (Workspace /
   Providers / …), not select an entity. This is a different interaction and
   keeps its card-panel, non-collapsible form. It shares the *visual language*
   (header typography, selection = left accent bar + neutral fill) but not the
   *behavior* (borderless, collapsible).

Forcing Settings into the rail mold, or forcing grouping/symmetry onto rails that
don't need it, would be the same mistake in reverse.

### Rail frame: borderless

All five rails are **borderless** — page background, no card border / `bg-card`,
and no vertical divider. The rail is a *selection edge*, not a content box; a
border makes it read as "another column / a separate object." Workboard's
existing borderless feel becomes the reference. Workflows, Agents, and
Conversations drop their card frames.

### Rail anatomy (canonical vertical stack)

```
RAIL (Home · Workboard · Workflows · Conversations · Agents)
┌─ borderless, page background
├─ Utility: [search] [filter]                       [collapse ‹]
├─ CTA:     [ + New X ]                              full width
├─ List:    rounded record rows · selection = left orange bar + neutral fill · hover bg-muted
└─ (no footer slot)
```

- **No local title header.** The global navigation already names the active
  screen, so the rail spends its first row on utilities. The collapse button
  (`PanelLeftClose`) is always top-right — a single home for the collapse
  affordance (Workboard's collapse moves here from the content header bar).
  **No count** — it is noise that does no work.
- **CTA** is a **full-width button** (`New X`) on every rail. The icon-only `+`
  (Agents/Conversations) is retired; a wide target is more readable in a `w-64`
  rail. In collapsed state the same action becomes an icon button and preserves
  the expanded button's disabled behavior.
- **Search** is a utility icon that opens a `CommandDialog` palette over the
  current rail records. It is present on every record rail except Settings. This
  keeps search available without consuming permanent rail height.
- **Filter** is a sibling utility icon beside search. It opens a `Popover`; a dot
  marks active filters. **If a screen has no filter options, the button is not
  rendered.** v1 contents: a **"Show archived"** toggle on screens that support
  archiving (today: Workboard, Home). Time filters and **grouping are deferred**
  (grouping is structurally invasive — it changes list rendering and interacts
  with search/selection — and is matured per-screen, starting with Workboard, in
  a later step).
- **No footer slot.** The old bottom-of-rail jobs are relocated: archive becomes
  a filter (above); a selected-record secondary list (Workflows "Past runs")
  moves into the **content area**, where it belongs, not the rail.

### Width and collapse

- Single expanded width: **`w-64`** (~256px) for all rails.
- **Settings excepted, every rail is collapsible/dockable.** Collapsed state is
  remembered **per screen** (Workboard collapsed while Home open is valid).
  Collapsed state is a **`w-12` icon strip** with expand, CTA, search, and filter
  icons as available. This keeps primary rail actions reachable without floating
  controls over the content area.

### Item anatomy (shared skeleton, role-specific fill)

```
[optional left slot]  Title (truncate, text-sm font-medium)     [optional right slot]
                      Meta (single line, text-xs muted)
[hover actions: right, ghost icons, size-8]
```

1. **Line 1 = title**, single line, `truncate`, same typography everywhere.
2. **Line 2 = one meta line**, `text-xs text-muted-foreground`. Content is
   role-specific but always one line, one style.
3. **Left slot** only where it carries identity — **Agents** (agent avatar).
   **Conversations has no avatar**: it is a 2+-agent discussion, so a single
   avatar is misleading. Other rails: no left slot (no empty circles for
   symmetry).
4. **Right slot** is role-specific (date, unread dot, status dot) but always
   right-aligned, same behavior.
5. **Hover actions** (pin / archive / delete) are **revealed on hover/focus**
   (not always visible), right side, compact ghost icons, identical
   look-and-feel across screens; only *which* actions differ by role.

Per-screen item mapping:

| Screen | Left slot | Title | Meta (line 2) | Right slot | Hover |
|---|---|---|---|---|---|
| Home | — | conversation title | frozen/provider anomaly or live status | updated date | pin · archive |
| Conversations | — | conversation title | last preview snippet or live status | status dot | delete |
| Agents | avatar | agent name | last preview snippet or live status | date + unread dot | pin · delete |
| Workboard | — | request title | progress (`1/1 done`) | — (no date) | archive |
| Workflows | — | workflow name | status (`3 steps` / `No steps yet`) | — (no date) | delete |

Chat rails (Home, Conversations, Agents) rhyme through title, one live/meta line,
and right-side activity state. Workboard/Workflows show no date — progress/status
is more valuable there and a date would be noise.

### Selection styling

Canonical selection merges Workflows' clarity with Workboard's accent bar:

- **Full-width rounded rows** with tight vertical rhythm.
- Rows are separated by compact spacing rather than borders.
- Selected = a thin **left accent bar in orange (primary)** + a **neutral subtle
  fill** (`primary-soft`). Orange lives **only in the bar**, never as a loud full
  fill.
- Hover = `bg-muted`, no bar.

Settings (Section Nav) reuses the same header typography and selection language
(left orange bar + neutral fill) while keeping its card-panel, non-collapsible
behavior.

### State signals are sacred

The largest risk of a restyle is silently dropping the affordances that tell the
user "this is done / running / unread / a reply arrived." **No status signal may
be lost.** Before implementing, audit each screen (`status`, `busy`, `unread`,
`archived`, `done`, bold-on-unread) and map every signal onto a standardized slot:

| Signal | Old surface (example) | New standard slot |
|---|---|---|
| Running / thinking | Agents meta "working" | Line 2 = live status text ("Thinking…/Working…"), primary color, subtle animation; replaces the snippet transiently |
| Unread / new reply | bold title, dot | title **bold** + filled dot in right slot |
| Completed | Workboard `1/1 done`, ✓ | Line 2 meta (progress / ✓ preserved) |
| Archived | "Archived" badge | item `opacity-60` + ⚙ "Show archived" filter |
| Run status | Workflows | Line 2 meta / right-slot badge |

Running vs unread are distinct and must not blur: **running** = animated meta
text (title normal); **unread** = bold title + right-slot dot (meta normal). When
work finishes, running → unread (animation stops, dot appears), so the user gets
an uninterrupted "done, and there's a reply" signal.

Live status text ("Thinking…/Working…") is added to **Home and Conversations**
as well, matching Agents.

### Empty states

One treatment across rails: a plain centered `text-sm text-muted-foreground`
message (e.g. "No workflows yet…"). No dashed boxes. Replaces today's mix of
dashed containers and plain text.

## Consequences

### For prior ADRs

- **ADR-021 (Workboard archiving) is revised.** The archive control moves from a
  **"Show/Hide archived" toggle at the bottom of the sidebar** to a **"Show
  archived" toggle inside the rail's ⚙ filter popover** (beside search). The
  semantics are unchanged — soft `archivedAt`, default-hidden, search respects the
  filter, persisted UI preference (`ordinus-workboard-show-archived`). Only the
  *surface* changes: it was always a filter; it now lives where filters live. The
  separate archived **count** in the toggle label is dropped (a dot/active state
  on ⚙ replaces it).
- **ADR-026 (Workflow designer) is revised.** "Run History lives at the bottom of
  the left rail" no longer holds: the rail footer is removed, and **run history
  ("Past runs") moves into the content area**, scoped to the selected workflow.
  Its behavior (deep-link into Workboard, inline dimmed archived runs with an
  "Archived" badge) is preserved — only its location changes. The rail keeps the
  "New workflow anchored at top" and dockable behavior, now expressed through this
  ADR's canonical stack.
- **ADR-027 (Agent home) and ADR-020 (Workboard sidebar):** compatible. The team
  roster's presence states map onto this ADR's live-status meta + unread dot, and
  the collapse-only (no hover flyout) behavior matches per-screen dock + summon.
- **ADR-032 / ADR-003 (Conversations):** the multi-agent nature is why
  Conversations has no item avatar; participant identity is not forced into the
  item.

### General

- Rails converge on one component family with role-specific fill; Settings stays a
  separate Section Nav sharing the visual language.
- Grouping and time filters are deferred but the ⚙ shell reserves their home, so
  adding them later is non-structural for the shell (grouping itself remains a
  per-screen list-rendering change).
- shadcn primitives throughout (`Input`, `Button`, `Popover`, `ScrollArea`).

## Alternatives Considered

- **One universal column (Settings included).** Rejected: Settings is a
  section-switcher, not a record list; unifying it would either strip its needed
  descriptions or force fake descriptions onto record lists.
- **Card-panel as the standard (border Workboard).** Rejected: a bordered left
  column reads as a fourth column against Workboard's kanban and as a box glued to
  the Workflows canvas. Borderless better expresses "selection edge."
- **Filter icon inside the search input.** Rejected: conflates free-text and
  structured filtering; the vertical cost is identical to a sibling button, so the
  compaction buys nothing.
- **Keep per-screen footers, standardize the slot.** Rejected: the footers do
  three unrelated jobs; standardizing the frame around mismatched contents is
  cosmetic. Relocating each job to where it belongs is the correct fix.
- **Full grouping in v1.** Deferred: grouping is the most structurally invasive
  piece and is better matured on one screen (Workboard) than rushed across five.

## Revision (2026-06-11): collapsed strip may host a mini-roster

The collapsed `w-12` strip was originally utility-only (expand / CTA / search /
filter). The Rail shell now exposes an optional `collapsedContent` slot rendered
below the utility icons: a screen-provided mini representation of its list,
scrolling within the strip while the icons stay fixed. The rail remains neutral —
it only provides the slot; content, selection, and interaction stay with the
owning screen.

First use: **Agents** renders a quick-switch avatar roster (32px mascot squircles
with presence/unread dots, ADR-038) so switching agents does not require
re-expanding the rail. Screens whose records have no compact visual identity
(e.g. Workboard) simply do not use the slot.
