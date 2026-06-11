# ADR-039: UI polish micro-interaction language

## Status
Accepted

## Date
2026-06-12

## Context

The app's modules (Home, Agents, Conversations, Workboard, Workflows,
Schedules, Settings) are functionally coherent, but their micro-interaction
details grew up independently: some live status text was static while other
surfaces animated; copy-to-clipboard existed only on a few Workboard report
blocks (with two duplicate local implementations and no clipboard fallback in
one of them); expand/collapse toggles swapped chevron icons in some places and
rotated them in others; some interactive rows had hover transitions and others
none. None of these were bugs — together they made the product feel less
finished than it is.

DESIGN.md gives the guardrails (calm, hairline structure, restrained color,
"motion should clarify state transitions… not compete with the work") but did
not define a shared vocabulary for these small touches, so each screen
improvised.

## Decision

Adopt one app-wide micro-interaction language, built from four primitives.

### 1. Live status text shimmers (`ordinus-text-shimmer`)

A CSS utility in `main.css`: a soft emphasis band sweeps through status text
while work is in flight. Token-driven via two CSS vars so surfaces retint it
without new CSS:

- Default: `--shimmer-base: muted-foreground`, `--shimmer-hi: foreground`
  (used by `LiveStatusRow`, Conversations "Thinking"/orchestrator/moderator
  rows).
- Rail running labels: base `primary`, hi `primary-active`.
- Workboard run-card phase titles and rotating progress messages: base
  `foreground`, hi `muted-foreground`.

The band occupies ~25% of a 2.4 s cycle, so text mostly rests at its base
color. `prefers-reduced-motion` collapses it to static base-colored text.
Because the utility owns the `animation` property, it must not share an
element with `animate-in` classes — nest a `<span>` instead (see Workboard
`RunningOutputState`).

### 2. One copy grammar (`components/copy-button.tsx`)

A single shared `CopyButton` (quiet icon → green ✓ flash for 1.4 s, clipboard
fallback via `lib/clipboard`), revealed on container hover with
`opacity-0 group-hover:opacity-100`. Applied to: Home/Agent-room messages
(user bubbles next to the Remember bookmark; assistant messages in the inspect
gutter), Conversations turn cards (header; failed turns copy the error),
fenced code blocks app-wide (via `MarkdownContent`'s `pre` renderer), Workboard
report blocks/file paths/run errors (the two local implementations now
delegate to it), schedule prompts, and Settings `DetailRow` values.

### 3. Motion grammar

- **Entrance**: transcript/timeline entries, expanded disclosure bodies, and
  attention panels use `motion-safe:animate-in fade-in slide-in-from-bottom-1`
  (300 ms; top-1 for disclosure bodies, 200 ms).
- **Disclosure**: one `ChevronRight` rotating 90° (`transition-transform
  duration-200`) replaces icon swapping.
- **Press feedback**: the base button variants gain `transition duration-150`
  + `motion-safe:active:scale-[0.98]` (95 for tiny rail icons), so every
  button in the app answers the click.
- **Active nav/tab underline**: `motion-safe:after:animate-in after:fade-in
  after:zoom-in-75` grows the 2px bar in on switch (app shell nav + agent
  room tabs).
- **Presence**: the agent "working" dot uses `ordinus-presence-glow` (a calm
  swelling ring) instead of flat `animate-pulse`.

### 4. Hover signals interactivity, not decoration

Hover background/border changes belong only on actually clickable elements
(checklist labels, folder rows, skill cards got their missing
`transition-colors`/`hover:` states). Non-interactive content gets hover-
*revealed actions* (copy, inspect) instead of decorative lifts.

## Consequences

- New UI work should reuse these primitives instead of inventing local
  variants: status text that represents in-flight work gets
  `ordinus-text-shimmer`; anything copyable gets the shared `CopyButton`;
  disclosure toggles rotate a single chevron.
- All motion is `motion-safe`-guarded; reduced-motion users get a fully
  static but complete UI.
- `useCopyFeedback` stays private to `copy-button.tsx` (react-refresh rule);
  the run inspector keeps its own internal copy of the tiny hook.
- DESIGN.md remains the visual-token authority; this ADR only standardizes
  the interaction layer on top of it.
