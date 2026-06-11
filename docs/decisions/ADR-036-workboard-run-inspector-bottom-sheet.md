# ADR-036: Workboard Run Inspector Bottom Sheet

## Status

Accepted

Builds on ADR-011 (centralized agent observability) and ADR-034 (live turn
activity line). Refines the run detail experience introduced alongside ADR-020's
single-request Workboard; ADR-020's board model is unchanged.

Amendment (2026-06-11): after first use, the vertical 55/45 split was replaced
by **tabs (Activity / Console)** — in practice the user attends to one region
at a time, and each benefits from the full sheet height. Both tabs stay
mounted so polling state and scroll positions survive switching. The
"Tabs instead of a vertical split" alternative below is therefore adopted,
not rejected. Clipboard copies (session id, Copy all) go through a shared
`copyTextToClipboard` helper with an execCommand fallback, since
`navigator.clipboard` can reject silently in the Electron context.

Amendment (2026-06-11, 2): Home mounts the shared sheet with **turn-scoped**
inspection — the unit of inspection on conversational surfaces is one turn,
mirroring the Workboard's one-work-item scope. A conversation-wide merged
history view was considered and rejected (an unbounded log wall; per-run
console logs cannot merge meaningfully). Two entry points:

- the live status row opens the in-flight turn (snapshot mutates via
  `observability:run-changed` pushes, matched by the in-memory
  `conversationId` decoration);
- hovering a finished assistant message reveals a terminal icon in the left
  gutter (absolutely positioned — transcript width and alignment unchanged)
  that opens that turn's record via a new read-only IPC,
  `observability.getTurnRun(turnId)` →
  `getObservedRunBySource('conversation', turnId)`. Message ids are persisted
  turn ids, so this works across screen switches and app restarts; console
  logs remain subject to ADR-011 retention.

`RunInspectorMeta.sandbox` became nullable for surfaces without a sandbox
concept.

Amendment (2026-06-11, 3): Agent Room adopts the same turn-scoped pattern —
clickable live activity line for the in-flight turn, hover gutter icon on
completed agent turns. Unlike Home, agent conversation turns are observed
under the turn row id itself, so `getTurnRun(turn.id)` resolves directly. On
Home the transcript row id (`oturn-…`) differs from the runtime turn id
(`ot-…`); the row's `turnId` column is surfaced on `HomeMessage` and used for
the lookup, and the icon is hidden when `turnId` is null (rows persisted
before turn ids were recorded).

## Date

2026-06-11

## Context

Two related observation problems on the Workboard's run detail modal:

1. **The brief is invisible.** When a run is running, cancelled, or delivered,
   the user often wants to know "what did we actually give this agent?" The
   instruction (`run.instruction`) and expected output (`run.expectedOutput`)
   exist on the run but are only rendered inside the "Behind the scenes"
   inspect overlay. The main modal shows only the title and output, so a
   running or cancelled item reads as "No output yet" with no content at all.
2. **The inspect overlay does not hold up.** It is a right-side panel hard
   fixed at `sm:w-[440px]`:
   - Raw provider logs (the most useful part) clip horizontally and cannot be
     read.
   - "How it went" renders each observability event as a full card with kind,
     source, and confidence badges — noisy, and capped at 5 events.
   - "Technical record" spreads agent/provider/sandbox/session/timestamps
     across stacked copy-blocks, taking a screen of vertical space for what is
     one line of metadata.
   - The Workboard polls `observability:listEvents` on its own 2-second timer
     instead of using the shared `useLiveTurnActivity` infrastructure shipped
     with ADR-034.

Reading logs is a *width* problem, not a height problem. A narrow side panel
is structurally the wrong container for it.

## Decision

### 1. Surface the brief in the run detail modal

`RunContextSection` ("What you asked for": Asked to + Expected) moves from the
inspect overlay into the main run detail modal, between the header and the
output area, as a collapsible section:

- **Expanded by default** for `running`, `cancelled`, and `failed` runs — there
  is no output yet, so the brief *is* the content.
- **Collapsed by default** for delivered runs — the output is the star.

### 2. Replace the side overlay with a bottom sheet

The "Inspect how this work happened" surface becomes a **bottom sheet**
(~60–70% of viewport height, full width), with three regions:

- **Top meta strip** — the Technical record collapsed into one compact line:
  agent · provider/model · sandbox · started time → elapsed, plus a truncated
  click-to-copy session id (`019eb3fc…7806 ⧉`). Only Started is shown;
  Created appears on hover/title when it differs (queued runs). No cards.
- **Main area: "How it went" timeline** — vertically split with the console
  below it (~55/45), both visible at once. Row-based, not card-based: one line
  per event (dot/icon + summary + time on the right). `kind`, `source`, and
  `confidence` are hidden from rows (hover/title at most) — that fidelity
  belongs to the console. Consecutive same-kind events group ("File changes
  applied ×3"). The `slice(0, 5)` cap is removed; the timeline scrolls
  internally. The current-activity header line at the top is fed by the shared
  `useLiveTurnActivity` hook (ADR-034) instead of bespoke polling.
- **Bottom area: console** — a terminal-feel raw log region with its own
  scroll, monospace, soft-wrap (`whitespace-pre-wrap` + `break-all`; no
  horizontal clipping). The sanitized invocation renders once as a pinned
  header block (`$ codex exec --json …` feel). Below it stdout flows as the
  main body; stderr chunks append in a distinct (reddish) tone —
  *approximately* chronological, since the existing IPC delivers the two
  channels as separate offset-based texts. True interleaving via a merged
  main-process log buffer is deliberately deferred until needed. The console
  auto-follows the tail during live runs (toggleable) and has a Copy-all
  affordance. The existing offset-based incremental diagnostics IPC is
  unchanged.

### 3. Shared component, Workboard-bound for now

The sheet is implemented as a run-agnostic shared component (e.g.
`components/run-inspector-sheet.tsx`) whose inputs are the observability
surface (snapshot + events + diagnostics) plus header props for
surface-specific naming. Only the Workboard mounts it in this iteration; Agent
Room and Home can adopt it later with no rework. This also moves the inspector
out of the 4,600-line `workboard-screen.tsx`.

### 4. Entry points

The "Inspect how this work happened" text link stays. Two additions: a small
terminal icon in the run detail modal header (next to the status badge, valuable
mid-run), and clicking the in-flight progress box ("Thinking it through…")
opens the sheet — that box *is* the "what is it doing right now?" question.

### 5. Degraded states

If the run has no `ObservedRunSnapshot` (not started yet, or pre-observability
records), the sheet still opens: the meta strip shows what the run record
knows, and the timeline and console regions show a single "No observability
record for this run" empty state.

## Alternatives Considered

### Widen the side panel (~720px) and fix wrapping
- Pros: smallest change; keeps the familiar side-inspector idiom.
- Cons: logs want full width; a wider right panel still fights the modal
  underneath and caps out awkwardly on small screens.
- Rejected: the content's natural axis is horizontal; a bottom sheet matches it.

### Tabs (Timeline / Console) instead of a vertical split
- Pros: cleaner single-focus regions.
- Cons: "is it alive?" and "what exactly is happening?" are asked together;
  tabs force a click between them. Width is plentiful in a bottom sheet.
- Rejected: simultaneous split view.

### Phase-rollup timeline (one row per thinking/editing/running phase)
- Pros: maximum tidiness.
- Cons: loses event detail the console doesn't summarize; phase + elapsed is
  already carried by the live activity header line.
- Rejected: row-per-event with grouping is the right middle layer between the
  live line and the raw console.

### stdout / stderr as separate tabs in the console
- Pros: channel purity.
- Cons: providers in `--json` mode emit nearly everything on one channel; the
  second tab would usually be empty.
- Rejected: single stream, stderr tinted.

### Inline truncated instruction under the modal title
- Pros: cheapest way to surface the brief.
- Cons: long briefs (the common case for planned work) read badly truncated.
- Rejected: collapsible section with status-dependent default open.

## Consequences

- Running/cancelled/failed run modals show the brief instead of "No output
  yet"; the inspect sheet no longer carries "What you asked for".
- `RunInspectOverlay`, `RunActivitySection`'s card list, and
  `TechnicalDetailsSection`'s copy-block stack are replaced by the shared
  bottom-sheet component; the Workboard's bespoke 2s event polling is replaced
  by `useLiveTurnActivity` plus the existing events/diagnostics IPC.
- ADR-011's diagnostics principles are unchanged (sanitized invocation,
  redacted streams, opt-in fetch while the surface is open); this ADR only
  changes presentation.
- ADR-034's "agent rooms and Conversations adopt the hook later" path gains a
  third adopter: the Workboard inspector.
- True stdout/stderr interleaving and Agent Room/Home mounting of the sheet
  are explicit follow-ups, not part of this change.
