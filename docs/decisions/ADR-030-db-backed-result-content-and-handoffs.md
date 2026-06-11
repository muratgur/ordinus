# ADR-030: Database-Backed Result Content and Handoffs

## Status

Accepted

Amends and partially supersedes ADR-008 (workspace artifacts and handoffs): the default handoff
between dependent work is no longer "compact summary plus workspace file references the dependent
reads from disk", and textual agent output is no longer spilled to workspace files when it exceeds a
size threshold. Partially supersedes ADR-022 (Markdown document viewer): the viewer's edit mode is
removed, the viewer can render database-backed content in addition to disk files, and a "Save as"
action that materializes a database result into a new workspace file is added (ADR-022 stated the
viewer never creates files). Builds on ADR-006 (generic work runtime) and the planning ADRs
(ADR-007, ADR-016).

Amended by ADR-037 (token efficiency and work visibility): when the producing run lives in the
same provider session the dependent run resumes, the full-content inline is dropped (summary +
run id only); the rejected "lazy fetch via an agent tool" alternative is partially adopted as a
complement (scoped read-only `getWorkRunResult` / `getRequestDigest` for worker agents); and a
deterministic per-request `digest.md` (summaries + pointers, never full content) is added. The
inline direct-dependency handoff and its 100k budget remain the primary transport.

## Date

2026-06-09

## Context

Across Ordinus, agents produce too many workspace files. Almost every piece of work — including
intermediate, throwaway, and handoff output — becomes a `.md` document on disk. A user who starts a
four- or five-step Workboard request, where each step's output feeds the next, ends up with a
document per step. These documents accumulate, go stale as the work changes, and become impossible
to track. The user cannot follow this volume of files, and most of them were never wanted as files
in the first place.

The proliferation is not accidental. It is driven by explicit mechanics in the runtime:

- The agent outcome prompt instructs: *"Keep content under 16,000 characters. If the useful result
  is longer, write it to a workspace file and summarize that file."* Every long result therefore
  becomes a file. (`workRunResultSummaryMaxLength = 16_000`.)
- The handoff model (ADR-008) passes a compact summary plus workspace-relative file references and
  tells the dependent agent to read those files from disk for full detail. To support that, each
  step is pushed to leave something on disk for the next step to read.
- The Workboard planner asks each Work Item for a "concrete artifact", nudging every step toward its
  own file output.

Two facts reframe the problem:

- The full result text is already needed inside the app for preview. The Run Detail panel already
  renders `resultSummary` directly from the database. The separate on-disk file the user clicks is
  redundant for textual output — it duplicates what could be a database value.
- Handoffs only ever carry an item's **direct** dependencies, not the whole chain. In a linear
  `1 -> 2 -> 3` chain, item 3 receives only item 2; the chain does not accumulate. Realistic textual
  outputs are small (~16-20 KB ≈ ~5K tokens), and work is predominantly linear. Passing full result
  text inline between directly dependent steps is therefore cheap in practice.

The right distinction is between **textual agent output** (reports, analyses, plans, summaries),
which has no reason to be a file, and **genuine typed deliverables** (HTML, JavaScript, source code,
PDF, spreadsheets, binaries), which are legitimately files. The first should live in the database;
the second should remain real files and is not the problem.

## Decision

Make textual agent output database-backed by default, pass handoffs as inline database content, and
write workspace files only for genuine deliverables or explicit user intent.

### Two Output Channels Per Run

Every work run produces, conceptually, two independent channels:

1. **Result text (database).** The agent's own produced output as Markdown, stored in the database.
   This feeds the in-app preview and downstream handoffs. It is not written to a workspace file by
   default.
2. **Files (disk).** Genuine typed deliverables and edits to existing project files, reported as
   `artifactRefs` (newly produced) and `changedFiles` (modified), shown in the file provenance panel
   (ADR-019/020), and read from disk by downstream steps when they need the actual bytes.

These channels are not alternatives; a run may have either, both, or only a summary. The HTML case is
a both-channels case: the agent writes `index.html` (a file, reported in `changedFiles`) and writes a
short narrative ("Built `index.html`, a landing page with…") as result text. The byte content of the
HTML file is never copied into result text.

### Summary And Content Fields

The run result has two text fields:

- **`resultSummary` — required.** A concise Markdown narrative of what the agent did
  ("produced this HTML, did X, wrote it there"). Always present. This is what the user sees first in
  the Run Detail panel, and it is always included in the handoff to a dependent step.
- **`resultContent` — optional.** The agent's own produced textual body (the report, the analysis).
  Present when the work itself is textual; empty when the deliverable is a file and there is no
  textual body to produce. Stored up to 256,000 characters.

`resultContent` may be empty by design. When it is empty, no "see full text" preview affordance is
shown — only the summary (and any files). The summary carries the result; an empty `resultContent`
is never a blank panel, because the summary is always present.

The earlier 16,000-character "spill to a file" rule is removed. Long textual results stay in the
database as `resultContent`; they are not written to workspace files to escape a size cap.

### Handoffs

Dependent work receives its **direct** predecessors' output as inline database content, not as file
references to read from disk:

- The handoff includes each direct predecessor's `resultSummary` and, when present, its
  `resultContent`, inline in the prompt.
- It also includes that predecessor's `artifactRefs` and `changedFiles`. When a predecessor produced
  a genuine file (HTML, code, etc.), the dependent step reads that file from disk as before — the
  file genuinely exists. Disk reading remains the path for typed-file deliverables only.

There is no per-edge "summary vs full" mode and no agent-callable tool to fetch upstream output. Full
inline content of direct predecessors is the default because, for realistic sizes and predominantly
linear chains, it does not bloat the prompt. As a safety valve, if the combined inline content of a
step's direct predecessors exceeds a generous threshold (~100,000 characters), the overflow degrades
to summary-only for the predecessors that do not fit; this is not expected to trigger in practice.

Workboard, Conversations, and Schedules share the same runtime, outcome prompt, and handoff path, so
this behavior applies uniformly across all three modules rather than being patched into Workboard
alone.

### Files Only For Genuine Deliverables Or Explicit Intent

An agent writes a workspace file only when one of these is true:

1. The output is inherently a typed file: a patch or edit to an existing project file, source code,
   HTML, JavaScript, PDF, spreadsheet, image, or other binary/format-bearing deliverable.
2. The user explicitly asks for a file ("create a report file", "save this to …").
3. The user performs a "Save as" gesture on an in-app result (see below).

Every other textual output — reports, analyses, plans, handoff bodies — is database-backed result
text, not a file. The Markdown frontmatter and `## References` policy from ADR-008 applies to the
files that are genuinely written, not to database result text.

### Preview And Save As

The in-app preview behavior is refined:

- The Run Detail panel shows `resultSummary`. When `resultContent` is present, it offers a "see full
  text" affordance that opens the document viewer rendering `resultContent` **from the database**
  (no file needed).
- The existing file provenance panel and the `.md` document viewer for genuine on-disk files are
  retained unchanged in spirit: produced `.md` files still open in the internal viewer; other file
  types still reveal in the OS.
- The document viewer is generalized to take **either** a workspace-relative `path` (disk file) **or**
  inline `content` (database result). Rendering is identical.
- The viewer's **edit mode is removed.** It was unused, and editing live agent output in place was a
  secondary convenience that is no longer worth its concurrency and write-path complexity. The viewer
  is read-only.
- A **"Save as"** action is added to the viewer. It materializes the database `resultContent` into a
  new workspace `.md` file under the run's module working folder (`workboard/<request-slug>/`), with
  the ADR-008 frontmatter and `## References` policy applied, and the file then appears in the file
  provenance panel. "Save as" always writes Markdown (`.md`); result text is already GitHub-flavored
  Markdown, so no other output format is introduced.

Because `resultContent` already lives in the database, "Save as" is specifically the act of
materializing it as a durable workspace file — not a database write.

### Existing And Historical Files

This decision is forward-looking only. Workspace files already produced by prior runs are left in
place; there is no migration, cleanup, or automatic deletion of past output, consistent with ADR-008
treating the workspace as the user's. The lifecycle of genuine deliverable files (versioning,
cleanup) is explicitly out of scope.

## Alternatives Considered

### Keep file-based handoffs, only add lifecycle/cleanup

- Pros: No change to the output model; addresses stale files directly.
- Cons: Does not stop the unwanted file production at its source; the user's primary complaint is the
  volume of files created, not only that old ones remain.
- Rejected: treat the cause (file-by-default textual output), not the symptom.

### Single result text field

- Pros: Simplest schema; no summary/content split.
- Cons: Either the field must always hold full content (the handoff and preview list bloat on long
  output) or it must be short (full body has nowhere to live). The user explicitly wants a short
  always-present summary plus an optional full body.
- Rejected: the required-summary / optional-content split matches how the work is actually reviewed
  and handed off.

### Pass full content always inline, including the whole chain

- Pros: Conceptually uniform.
- Cons: Accumulating the whole chain (not just direct predecessors) would grow without bound. The
  runtime already passes only direct dependencies.
- Rejected: keep the existing direct-dependency-only handoff; inline only direct predecessors.

### Lazy fetch of upstream content via an agent tool (`get_run`)

- Pros: Leanest prompts; the dependent step pulls full content only when needed.
- Cons: `get_run` is part of the Ordinus MCP granted only to the in-app assistant. Exposing that tool
  surface to every worker agent (raw provider CLIs) widens the security boundary for little gain,
  since realistic inline content is cheap.
- Rejected: inline direct-predecessor content; do not grant worker agents the assistant tool surface.

### Per-edge "summary vs full" handoff mode chosen by the planner

- Pros: Sends full content only where the dependent step needs it.
- Cons: Adds planner complexity for a problem that does not exist at realistic sizes; mostly-linear
  single-predecessor chains never bloat.
- Rejected: always inline direct-predecessor content with a high-water safety valve.

### Keep the viewer edit mode

- Pros: In-place correction of agent output.
- Cons: Unused in practice; with result text now database-backed and read-only by nature, the
  file-edit concurrency machinery (mtime conflict checks, overwrite/reload) is complexity without a
  user.
- Rejected: a read-only viewer plus "Save as" matches actual use.

## Consequences

- Textual agent output no longer becomes a workspace file by default; the file count for a multi-step
  request drops to the genuine deliverables the user actually wants.
- The Run Detail panel is the source of truth for textual output: summary always, full text on
  demand, both from the database.
- Handoffs read from the database, not the disk, for textual output; genuine typed files are still
  read from disk by downstream steps.
- A new `result_content` column is added to `work_runs`; `result_summary` becomes the required short
  narrative. The agent outcome contract gains a required `summary` and an optional `content` body.
- The 16,000-character spill-to-file rule and its prompt language are removed; the planner's
  "concrete artifact" language is reworded so a textual result is an in-app result, not a file.
- The document viewer becomes read-only and dual-source (path or database content); a "Save as"
  action writes a new `.md` file, which ADR-022 previously disallowed.
- The change lives in the shared runtime/outcome/handoff layer, so Workboard, Conversations, and
  Schedules all inherit it.
- Bounded result text (≤256 KB) now lives in SQLite. This is an intentional, narrow exception to
  ADR-006's "store large artifacts outside SQLite" note: result text is small, durable, and needed
  for preview and handoff; large provider logs and binary artifacts still stay outside the database.
- Historical workspace files are untouched; deliverable-file lifecycle remains a future decision.

## Implementation Notes

- Schema: add `result_content` (text, default empty) to `work_runs`; keep `result_summary` as the
  required short narrative. A single additive migration; no backfill of historical runs.
- Outcome contract: the agent turn outcome returns a required `summary` and an optional `content`
  body, plus `artifactRefs` / `changedFiles` as today. Map `summary -> result_summary` and
  `content -> result_content`. Remove the "write it to a workspace file and summarize" instruction;
  state that the default result is in-app text, and that files are written only for genuine typed
  deliverables or explicit user intent.
- Handoff: `getRequiredInputSummaries` / `formatRequiredInputs` include each direct predecessor's
  `resultSummary` and, when non-empty, `resultContent`, inline. Keep `artifactRefs` / `changedFiles`
  in the handoff for typed-file deliverables. Apply the ~100K combined-content safety valve.
- Planner prompts (ADR-007/016 surfaces): reword `expectedOutput` and the splitting guidance so a
  textual deliverable is described as an in-app result, not a file artifact; keep file-deliverable
  language for genuine typed outputs.
- Viewer: generalize `MarkdownDocumentViewer` to accept `path` or `content`; render `resultContent`
  for the "see full text" affordance. Remove edit mode, the `files.write` usage from the viewer, and
  the mtime conflict UI. Add "Save as" that writes a new `.md` file under the module working folder
  via a validated main-process write (new-file creation is now allowed for this explicit action) and
  surfaces it in the provenance panel.
- Conversations: the same outcome shape applies; the assistant turn carries the summary as its
  message and exposes `resultContent` via the same preview affordance when present.
