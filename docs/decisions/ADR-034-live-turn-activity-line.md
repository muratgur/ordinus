# ADR-034: Live Turn Activity Line

## Status

Accepted

Builds on ADR-029 (Ordinus in-app personal assistant) and the runtime
observability pipeline (`ObservedRunSnapshot` / `ObservedRunEvent`,
`observability:run-changed`). Relates to the Home presence design (calm stage,
single reactive presence) and the Electron security boundary (raw command text
stays in the main process).

Extended by ADR-036: the Workboard run inspector adopts `useLiveTurnActivity`
as the header line of its bottom sheet, replacing the Workboard's bespoke
event polling.

## Date

2026-06-11

## Context

While a Home turn is in flight the renderer shows a static "Ordinus is
thinking…" line — twice (once in the transcript, once above the composer in
`home-input.tsx`'s `statusLabel`). Turns routinely take 15–20 seconds; a static
label over that span gives no signal whether the agent is progressing or stuck,
which erodes trust exactly when the product needs it most.

The data to do better already exists. The main-process observability pipeline
parses provider CLI streams into structured observations:

- **Claude** and **Codex** adapters emit per-event observations (session
  started, "Using tool: X", "Running command: Y", "Preparing response") with
  phases (`reading`/`editing`/`running`).
- **Gemini** has no `observeStdoutLine` yet — it produces only runtime-level
  lifecycle events.
- `ObservabilityService` maintains liveness (`quiet` at 90 s without events,
  `stalled` at 180 s) and pushes `ObservedRunSnapshot` to the renderer on every
  change via `observability:run-changed`.
- Cancellation exists end-to-end (`conversations:cancel-turn`) but no UI calls
  it.

Constraints from product direction: the Home stage stays calm (no scrolling
technical feed), end users must not see raw shell commands, the UI is English,
and whatever ships for Home must be reusable on agent rooms and Conversations
later.

## Decision

Replace the static thinking label with a **single mutating live activity line**
in the transcript, fed by the existing observability pipeline through a shared
hook.

1. **One surface.** The transcript status row becomes the live line. The
   duplicate `statusLabel` above the composer is removed. The top-strip
   `OrdinusMark` keeps its thinking animation only — no text.

2. **Renderer-composed wording.** `ObservedRunSnapshot` gains two nullable
   fields, `latestEventKind` and `latestEventLabel`, populated by
   `ObservabilityService` when recording events. The renderer builds calm
   English sentences from a kind→phrase dictionary: `file` → "Reading
   {label}…", `tool` → "Using {label}…", `command` → "Running a command…",
   `message` → "Preparing a response…", unknown → "Working…". For `command`
   events the **service blanks the label** so raw command text never crosses
   into the renderer; full fidelity remains available through the diagnostics
   channel.

3. **Provider-agnostic with graceful degradation.** The line enriches as
   provider events arrive. Gemini (no events today) degrades to "Working… +
   elapsed timer"; a future Gemini observer enriches the line with zero UI
   changes. Liveness thresholds stay at 90 s/180 s — they measure event
   silence, not turn length, and lowering them would false-alarm on
   event-less providers.

4. **Timing behavior.** A state displays for a minimum ~1.5–2 s
   (latest-event-wins, no queueing). After 5 s the total-turn elapsed timer
   appears ("Reading agenda.md · 12s"). On `quiet` the text softens to "Still
   working — this is taking a bit longer…"; on `stalled`, "Something may be
   stuck."

5. **Stop replaces Send.** While a turn is in flight the composer's Send
   button becomes Stop (always, not only when stalled), wired to
   `conversations:cancel-turn`. The text area stays editable; sending waits
   for the turn to finish (no message queueing — v2 if ever). On Stop the
   line shows "Stopping…" until the run closes, then a permanent muted
   transcript row remains: "You stopped this response."

6. **Lifecycle edges.** Between send and the first snapshot the line shows the
   opening state "Ordinus is thinking…". On normal completion the live line
   disappears without trace — a per-turn step history is deliberately out of
   scope (the events are already persisted; `observability:list-events` can
   power a v2 expandable view).

7. **Shared hook.** All subscription, dictionary, and timing logic lives in a
   `useLiveTurnActivity(conversationId)` hook subscribed to
   `observability:run-changed`. First delivery targets Home; agent rooms and
   the Conversations screen adopt the same hook in a follow-up.

## Alternatives Considered

### Accumulating step list in the transcript (CLI-style tool-call rows)
- Pros: full visibility of what happened; familiar from Claude Code/Codex.
- Cons: violates the calm-stage Home direction; surfaces technical noise to
  non-technical users; permanent clutter in a conversational transcript.
- Rejected: a single mutating line answers "is it stuck?" without the noise.
  The data stays in the DB for a future expandable view.

### Showing adapter summaries verbatim (`snapshot.latestActivity`)
- Pros: zero contract change.
- Cons: leaks raw command strings ("Running command: grep -rn …") to end
  users; wording owned by adapters instead of the product layer.
- Rejected: renderer-composed wording from `kind + label` keeps adapter
  summaries intact for logs/diagnostics while the product controls tone.

### New per-event push channel (`observability:event`)
- Pros: maximum flexibility for future UIs.
- Cons: new channel, subscription, and ordering concerns for what a
  single-line UI needs; snapshot extension is strictly smaller.
- Rejected: two nullable snapshot fields suffice; revisit if a v2 step view
  needs live event granularity.

### Writing the Gemini observer first (provider parity before UI)
- Pros: all three providers equally rich on day one.
- Cons: couples the UI to the least stable CLI stream format; the UI must
  handle event silence anyway (long single tool calls on Claude too).
- Rejected: graceful degradation makes parity a later, independent task.

### Message queueing while a turn runs
- Pros: never blocks the user's input.
- Cons: the CLIs cannot inject mid-turn anyway, so a queue only hides a wait;
  requires queue semantics (edit/cancel/staleness) for little gain.
- Rejected: Stop-replaces-Send (Claude Code/ChatGPT model); editable text
  area, send on turn end.

## Consequences

- `ObservedRunSnapshotSchema` grows `latestEventKind` / `latestEventLabel`
  (nullable, backward-compatible). `ObservabilityService` populates them and
  blanks command labels at the boundary.
- `home-input.tsx` loses its `statusLabel` prop/rendering; the composer gains
  a busy-state Stop button calling `conversations:cancel-turn`.
- The kind→phrase dictionary becomes the single product-voice source for
  activity wording across providers; adapters keep emitting English summaries
  for logs and diagnostics unchanged.
- Agent rooms and Conversations get the live line nearly for free via
  `useLiveTurnActivity` once they pass a conversation id.
- A cancelled turn now leaves a permanent transcript marker, explaining
  truncated responses in history.
- Adding a Gemini `observeStdoutLine` later is purely additive — the Home UI
  requires no changes to benefit.

## Implementation notes (2026-06-11)

Two details settled during implementation:

- **Ordinus turns were not observed at all.** `ordinus/session.ts` never
  created an observation sink, so Home had zero observability before this
  change. A new `ObservabilityService.startOrdinusTurn` registers the phantom
  agent's turn on the existing 'conversation' source surface (sourceItemId =
  turn id), which keeps `markConversation*` and the diagnostics path working
  unchanged.
- **Snapshot decoration is in-memory, and includes `conversationId`.** The
  snapshot additionally gained a nullable `conversationId` so the renderer
  hook can match push updates without new queries. All three new fields
  (`conversationId`, `latestEventKind`, `latestEventLabel`) are decorated at
  broadcast/list time from an in-process map rather than persisted — no DB
  migration, and the fields naturally exist only for runs of the current app
  session, which is exactly the live line's scope (sqlite-minimal-persistence
  conservatism).
- Cancellation rides the existing runtime process map: the session service
  tracks conversation→turn ids, `ordinus:cancel-turn` kills the provider
  process, and the interrupted `sendTurn` resolves normally after persisting
  the 'cancelled' transcript row (new turn kind) — no error bubble.
