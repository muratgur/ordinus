# ADR-011: Add Centralized Agent Observability

## Status

Proposed

Presentation of the Workboard diagnostics surface is refined by ADR-036 (run
inspector bottom sheet); the pipeline, sanitization, and opt-in diagnostics
principles here are unchanged.

## Date

2026-05-14

## Context

Ordinus can create agents, run session-backed conversations, and execute Workboard Work Requests
through provider CLIs. The current product can show coarse state such as queued, running, waiting
for user, completed, or failed. That is not enough for a command center for real software work.

When an agent is running, the user often waits without knowing:

- Whether the provider process is still alive.
- Which phase the agent is in.
- Whether the agent is reading, editing, running commands, or waiting.
- How long the work has been running.
- What the latest meaningful activity was.
- Which agent is carrying which workload.
- How much provider usage a run consumed when usage data is available.

This creates a "waiting into the void" experience. It also makes multi-agent coordination harder:
Workboard, Conversations, Agents, and future modules could each invent their own activity display,
creating inconsistent behavior and duplicated runtime logic.

Ordinus needs a shared observability layer that makes live agent work visible without turning the
default product experience into a raw log viewer.

## Decision

Add a centralized agent observability layer owned by the Electron main process.

The observability layer will normalize provider runtime activity into durable, ordered events and
small derived snapshots that can be projected into different renderer surfaces. Workboard,
Conversations, Agents, and future modules may present this state differently, but they should read
from the same underlying model.

The renderer remains UI-only. It may subscribe to or request observability snapshots through typed
IPC, but it must not parse raw provider logs, inspect provider process state, access log files
directly, or infer privileged runtime facts on its own.

### Live Runtime Feedback Is Primary

The first product goal is live confidence while work is running, not retrospective audit after work
is finished.

Every long-running agent run should expose a current activity snapshot that can answer:

- Is this run still alive?
- Which provider process is running it?
- What is the latest known activity?
- How long has this run been active?
- Has the provider emitted output recently?
- Is Ordinus waiting for the user, the provider, or an upstream dependency?

Historical review remains useful, but it is secondary. The UI should prioritize the current run
state, current phase, latest activity, elapsed time, and live diagnostics access while the run is
active.

### Core Concepts

Use a provider-neutral observed run model:

```text
Observed Run
  stable id
  source surface: workboard | conversation | system | future module
  source item id
  assigned agent
  provider and model
  sanitized runtime invocation
  lifecycle status
  liveness health
  current phase
  latest activity
  timing metrics
  usage metrics when known
  log reference owned by main

Observed Run Event
  run id
  sequence
  timestamp
  kind
  source
  confidence
  phase/status when relevant
  user-readable summary
  structured payload for diagnostics
```

The first implementation should not create a broad telemetry platform. It should start with enough
state to answer the user's operational questions:

- What is running?
- What is the latest known activity?
- How long has it been running?
- Is it blocked or waiting for input?
- What did it produce?
- Which agent is carrying active and recent work?
- What live provider output or command detail is available when the user asks for diagnostics?

### Event Vocabulary

Use a small event vocabulary that can support both Workboard and Conversations:

```text
status
phase
message
tool
file
command
output
metric
error
```

Use product-facing phases aligned with the Ordinus design system:

```text
queued
starting
running
reading
editing
waiting_for_user
blocked
completed
failed
cancelled
```

Provider-specific raw events may be preserved in main-owned logs, but renderer UI should prefer the
normalized event summary. Diagnostics can expose additional technical detail only when the user asks
for it through an explicit diagnostic surface.

### Event Source And Confidence

Every normalized event should record where it came from and how confidently Ordinus can present it.

Event source:

```text
provider
runtime
inferred
user
system
```

Event confidence:

```text
reported
derived
estimated
unknown
```

Examples:

- A provider-emitted JSON tool event is `source=provider`, `confidence=reported`.
- `Provider process started` is `source=runtime`, `confidence=reported`.
- `Still running. Last output 2m ago.` is `source=inferred`, `confidence=derived`.
- Token usage from a provider result is `source=provider`, `confidence=reported`.
- Token usage from text estimation is `source=inferred`, `confidence=estimated`.

Renderer surfaces do not need to show source and confidence on every row, but diagnostics should make
them inspectable. Product copy should avoid overstating inferred or estimated events.

### Liveness Health

Observed runs should expose a liveness health state separate from lifecycle status.

Lifecycle status answers what state the run is in:

```text
queued
starting
running
waiting_for_user
completed
failed
cancelled
```

Liveness health answers whether the active runtime appears alive:

```text
unknown
healthy
quiet
stalled
exited
```

Initial meanings:

- `unknown`: no live process information is available yet.
- `healthy`: the process is active and has emitted recent activity or is within expected startup.
- `quiet`: the process is active, but no provider output has arrived for a noticeable interval.
- `stalled`: the process is still alive, but silence has crossed a configured threshold or the run
  appears stuck.
- `exited`: the process has ended, but final persistence or parsing may still be resolving.

UI should use liveness health to reduce empty waiting. For example:

```text
Provider is running. No output yet.
Still running. Last output 2m ago.
Provider exited. Saving result.
```

Thresholds should be conservative and provider-aware. A quiet provider is not automatically failed.

### Runtime Invocation Visibility

Ordinus should be able to show the user which provider invocation is running without exposing unsafe
execution control to the renderer.

The main process may expose a sanitized invocation summary such as:

```text
Provider: Codex
Executable: codex
Args: exec --json - --sandbox workspace-write -C <workspace>
Cwd: <workspace root>
Started: 2026-05-14T10:42:01.000Z
```

This is display-only diagnostic information. The renderer must not construct, modify, replay, or
approve raw command strings from this data. Sensitive values, secret references, local runtime config
paths, and environment values must be redacted or omitted.

### Provider Output

Provider adapters should parse CLI stdout and stderr into normalized observability events where the
provider exposes useful structure. When a provider does not expose enough structure, Ordinus may emit
coarser events such as:

```text
Provider process started.
Provider is still running.
Provider returned output.
Provider exited with an error.
```

Do not pretend inferred state is provider-reported state. Events and metrics should track whether a
value came from the provider, from Ordinus runtime state, or from an estimate.

### Live Raw Diagnostics

The observability layer should support live raw diagnostic access for users who explicitly choose to
inspect it.

Default surfaces should show normalized, user-readable activity:

```text
Reading workspace context.
Running provider process.
Provider emitted output 4s ago.
Waiting for user input.
```

An explicit diagnostics surface may show live raw stdout and stderr chunks, plus the sanitized
provider invocation. This is useful for advanced users, debugging provider issues, and understanding
why a run appears stuck.

Raw diagnostics must be treated differently from product activity:

- Raw stdout/stderr is opt-in, not the default Workboard or Conversation view.
- Raw chunks are streamed or tailed through main-owned IPC, not read directly by renderer code.
- Secrets and sensitive environment values must be redacted before display or persistence.
- Raw chunks may be noisy, provider-specific, and incomplete; UI copy should not imply they are the
  authoritative product state.
- Normalized activity remains the primary source for board cards, conversation turns, and workload
  summaries.

Diagnostics streaming must have backpressure controls:

- Stream only while a diagnostics surface is open.
- Send bounded chunks rather than unbounded buffers.
- Throttle UI updates when providers emit output quickly.
- Load an initial tail window, such as the last N KB or last N lines, instead of the full log.
- Truncate or summarize oversized chunks in renderer views.
- Keep full raw data in the main-owned log file until retention cleanup, subject to size limits.

### Live Diagnostics Data Lifecycle

Live diagnostics should use both a hot path and a cold path.

The hot path is an in-memory main-process event bus used while a provider process is running. It
pushes normalized activity events and, when a diagnostics surface is open, redacted raw stdout/stderr
chunks to subscribed renderer windows.

The cold path is the main-owned log directory for the run. The provider process writes raw streams to
files as it runs. If the user navigates away and returns, the renderer should not depend on the
missed in-memory stream. It should ask main for a diagnostics snapshot and a log tail from the last
known byte offset or sequence.

This means:

- Switching screens should not lose diagnostic history for the active run.
- Finished runs can still expose diagnostics until retention cleanup or deletion removes the log
  files.
- Raw diagnostics are not durable forever by default.
- SQLite stores the log reference, offsets or sequence cursors when useful, compact summaries, and
  normalized timeline events.
- The current persisted log files are an implementation detail. Their names should not define the
  public IPC contract.

The current implementation writes provider stdout to a run log file named `events.jsonl`, stderr to
`stderr.txt`, and the final message to `last-message.txt`. Under this ADR, `events.jsonl` should be
treated as current raw provider output, not as the final normalized event model.

### Provider Capability Differences

Each provider CLI has different output behavior. Observability should therefore use provider
capabilities, not hard-coded assumptions.

Initial capability categories:

```text
single-result-json
streaming-json-events
partial-token-stream
tool-event-stream
usage-metrics
human-progress-stderr
final-message-file
```

The adapter registry should expose what each provider supports for the installed CLI version. The
UI should degrade honestly:

- If structured streaming events are available, show richer phase and tool activity.
- If only single-result JSON is available, show process liveness and final metrics, but less live
  detail.
- If only human-readable progress exists, show it as diagnostics and derive only cautious normalized
  activity.
- If usage metrics are unavailable, show `Tokens unavailable` rather than guessing by default.

Provider capabilities suggest different baselines:

- The current Codex adapter already invokes exec with `--json` and captures the final message with
  `--output-last-message`, which can be used as the first structured stream baseline.
- Claude Code print mode supports `json` and `stream-json`; richer streaming uses
  `--output-format stream-json`, `--verbose`, and `--include-partial-messages`.
- Gemini CLI headless mode supports JSON output with response and stats. Its documentation also
  references `stream-json` in configuration/headless materials, so Ordinus should verify support for
  the installed CLI version before relying on streaming events.

### Metrics

Every observed run should support timing metrics:

- queued at
- started at
- first activity at
- last activity at
- completed at
- elapsed milliseconds
- idle milliseconds when useful

Usage metrics should be provider-neutral and explicit about confidence:

```text
input tokens
output tokens
total tokens
usage source: provider | estimated | unavailable
```

Renderer copy should distinguish exact provider-reported usage from estimates. For example,
`12.4k tokens` may mean provider-reported usage, while `~12.4k tokens` means an estimate.

### Storage Policy

SQLite should store compact product state, not raw provider streams.

Persist in SQLite:

- Observed run identity and source references.
- Current lifecycle status and current phase.
- Latest activity summary.
- Timing fields needed to render live state and completed duration.
- Usage metrics when known.
- Compact normalized events that are useful for product timelines.
- References to main-owned log files.

Do not persist raw stdout/stderr chunks in SQLite by default. Raw provider streams can be large,
provider-specific, and noisy. They should be written to main-owned files under Electron
`userData/logs`, with database rows storing only references and small summaries.

Normalized event payloads should stay small. If an event needs large text, store a short summary in
SQLite and point to the log file or artifact that contains the full data.

The initial storage policy should be:

```text
SQLite: current state, compact timeline, metrics, log refs
Log files: raw stdout/stderr, verbose provider diagnostics
Workspace files: user-facing artifacts and handoffs
```

Retention and cleanup are part of observability, not an optional later concern. Before long-running
automation ships, Ordinus should define retention controls for raw logs and normalized event
history. The first implementation may keep logs until the related run/conversation/work request is
deleted, but it should avoid designing SQLite around unbounded raw text.

### Redaction And Privacy

Observability must preserve Ordinus's local-first trust boundary.

Raw diagnostics and normalized events may contain sensitive data because providers can echo prompts,
file contents, command output, paths, and tool arguments. The main process must redact or omit
sensitive values before exposing data to renderer diagnostics or writing normalized event payloads.

Minimum redaction policy:

- Do not expose environment variable values.
- Do not expose plaintext secret values or secret refs resolved in main.
- Redact known token/key patterns before display or persistence.
- Redact provider auth file contents and app-managed runtime config details.
- Treat raw diagnostics as potentially sensitive and label them as diagnostics, not ordinary product
  activity.
- Delete run logs when the owning run, conversation, or Work Request is deleted.

All observability data remains local unless a future explicit export or sharing feature is designed
and approved separately.

### UI Projections

Different modules may show the same observability state in different densities:

- A global activity summary shows running, waiting, failed, and attention-needed work.
- Workboard cards show current phase, elapsed time, provider liveness, and latest activity.
- Workboard run details show an activity timeline, live output status, files, and diagnostics.
- Conversation turns show compact live activity while an agent response is running.
- Agent screens show workload summaries across active and recent runs.

The default UI should show meaningful live activity, not raw logs. Raw provider output belongs in an
explicit diagnostic view that can be opened while the run is active.

### Agent Workload

Agent workload should be a derived view over observed runs, not a separate execution model.

Useful workload fields include:

- active runs
- queued runs
- waiting-for-user runs
- completed runs over a selected period
- failed runs over a selected period
- average duration
- token usage when known
- latest activity
- provider and model distribution

This supports user trust and coordination without adding premature scheduling or capacity planning
features.

### Cancellation Visibility

Cancellation is part of observability, not only a command.

When the user cancels a run, the activity timeline should record the cancellation path:

```text
Cancellation requested.
Graceful stop sent.
Provider process exited.
Forced stop after timeout.
Cancelled.
```

This keeps user control visible and helps diagnose providers that do not stop cleanly.

## Alternatives Considered

### Add Per-Screen Spinners And Polling

- Pros: Fastest way to reduce empty waiting in one screen.
- Cons: Workboard, Conversations, Agents, and future modules would drift into separate behavior.
- Rejected: Observability is a product-wide runtime concern, not a local component concern.

### Show Raw Provider Logs As The Default UI

- Pros: Easy to implement because raw stdout/stderr already exists in runtime logs.
- Cons: Raw logs are noisy, provider-specific, sometimes incomplete, and not always user-readable.
- Rejected: Ordinus should be a command center that explains work state. Raw logs should remain
  available only as opt-in diagnostics.

### Store All Provider Telemetry In SQLite

- Pros: Easy querying and historical analysis.
- Cons: Large raw logs and verbose provider streams can bloat the local database and complicate
  retention.
- Rejected for raw data: Store compact normalized events and snapshots in SQLite. Keep large raw
  provider output in main-owned log files with references and retention controls.

### Make Workboard Own Observability

- Pros: Workboard is the most immediate surface for planned work.
- Cons: Conversations and future modules need the same lifecycle visibility.
- Rejected: Workboard should project observability state, not own it.

## Consequences

- Main process becomes the single owner of runtime activity, event normalization, metrics, and
  process-liveness facts.
- Renderer screens can present consistent feedback without parsing provider output.
- Workboard and Conversations can share a common activity timeline pattern.
- Agents can gain workload views without creating a separate workload runtime.
- Advanced users can inspect live raw provider output and sanitized invocation details when needed.
- Active runs can distinguish lifecycle status from runtime liveness, reducing ambiguous waiting.
- Event source and confidence make provider-reported facts distinguishable from runtime inference.
- Provider adapters need incremental event parsing work, starting with the provider that offers the
  best structured output.
- The product can show honest partial information when a provider does not expose detailed activity.

## Implementation Notes

- Start with Workboard because Workboard has the clearest user pain: planned work can run for long
  enough that silence feels broken.
- Reuse the existing `work_run_events` direction where possible, but broaden the model only after
  deciding whether conversation turns should share a new generic observed-run table or map into the
  same event contract through source references.
- Add typed shared contracts before exposing renderer APIs.
- Add explicit IPC methods or subscriptions for observability snapshots and event updates.
- Add opt-in live diagnostics IPC that can stream or tail redacted stdout/stderr for a selected run.
- Add stream limits and throttling before exposing live diagnostics to renderer surfaces.
- Keep provider raw logs main-owned under Electron `userData/logs`.
- Keep SQLite event payloads compact; do not store raw stdout/stderr chunks there by default.
- Redact secrets before writing normalized events, diagnostics, or raw logs.
- Preserve platform safety: provider commands stay executable-plus-args, not shell strings.
- Treat token usage as optional. Do not block observability MVP on exact token accounting.

## Open Questions

- Should `ObservedRun` be a new durable table, or should Work Runs and Conversation Turns keep their
  own rows while sharing a common event table keyed by source?
- Should renderer updates use push subscriptions, polling, or push with polling fallback?
- Which provider should be the first fully parsed adapter for phase and usage events?
- What quiet and stalled thresholds should be used for each provider?
- Which sanitized invocation fields are safe and useful enough to show in diagnostics?
- Should live raw diagnostics be streamed continuously while open, or tailed from the persisted log?
- How long should normalized observability events and raw logs be retained?
- Should users get a setting for raw log retention, maximum size, or manual cleanup?
- What maximum tail size and stream throttle should diagnostics use?
- Which events should be considered user-facing activity versus diagnostic-only detail?
- Should usage estimates be enabled in the first version, or should the MVP only show provider-
  reported usage and `unavailable`?
