# ADR-008: Store Workboard Artifacts In The Selected Workspace

## Status

Accepted

## Date

2026-05-10

## Context

Workboard work can produce more than short text summaries. Agents may create reports, research
notes, spreadsheets, PDFs, images, patches, or other project files. Some outputs are intermediate
agent-owned materials, while others are shared or final deliverables for the whole Work Request.

The generic work runtime already records status, dependencies, summaries, and provider session
references. It also keeps internal logs and database state under the application's user data
directory. That is appropriate for Ordinus-owned runtime state, but it is not the right place for
user work artifacts. User-visible work should live in the workspace the user selected for the work.

Agent-to-agent handoff also needs a bounded context strategy. Passing full upstream outputs into
every dependent prompt does not scale when prior work produced long reports or files. It increases
token use, hides the useful signal, and makes later agents depend on copied context instead of the
workspace as the shared source of truth.

## Decision

Store Workboard artifacts under the selected workspace, grouped by Work Request.

When a Work Request starts, Ordinus should define a workspace-relative artifact root:

```text
workboard/<work-request-slug-id>/
```

The slug should be readable but collision-resistant, such as a short request slug plus a short
stable id:

```text
workboard/bulgarian-sme-strategy-wr8f3a/
```

Ordinus should pass this artifact root to every Work Item prompt for that Work Request. Agents may
organize files inside that root according to the shape of the work.

### Artifact Organization

Use the Work Request artifact root for shared or final deliverables:

```text
workboard/bulgarian-sme-strategy-wr8f3a/final-report.md
workboard/bulgarian-sme-strategy-wr8f3a/strategy-deck.pdf
```

Use agent-specific subdirectories for role-specific or intermediate materials:

```text
workboard/bulgarian-sme-strategy-wr8f3a/ceo/go-to-market-notes.md
workboard/bulgarian-sme-strategy-wr8f3a/researcher/competitor-table.xlsx
```

If the task naturally requires changing existing project files, agents may write those files in
their normal project locations rather than forcing everything into `workboard/`. For example, a
code implementation should modify source files in the project tree, while a research report should
usually be saved under the Work Request artifact root.

Ordinus should not store user-facing artifacts in AppData. AppData remains for Ordinus-owned data:

- SQLite database state.
- Runtime metadata.
- Provider session references.
- Internal event logs and diagnostic logs.

### Agent Prompt Contract

Every Work Item execution prompt should include:

- The workspace root.
- The Work Request artifact root.
- A suggested agent-specific artifact directory.
- Guidance that shared or final deliverables belong in the Work Request root.
- Guidance that intermediate role-owned files belong in the agent directory.
- Guidance that project files should be changed in their natural project locations when the task
  requires it.
- A requirement to report created or changed files using workspace-relative paths.

Example prompt guidance:

```text
Artifacts for this Work Request should be saved under:
workboard/bulgarian-sme-strategy-wr8f3a/

Use your agent folder for role-specific or intermediate files:
workboard/bulgarian-sme-strategy-wr8f3a/ceo/

Use the Work Request root for shared or final deliverables. If the task requires changing existing
project files, write them in their natural project locations. At completion, list every file you
created or modified using paths relative to the workspace root.
```

### Handoffs Between Work Items

Dependent Work Items should receive upstream context as a compact handoff, not as full copied
outputs by default.

The default handoff from an upstream Work Item should include:

- The upstream Work Item title and assigned agent.
- A concise result summary.
- Workspace-relative artifact references.
- Workspace-relative changed file references.
- A short critical excerpt only when needed for the dependent item.

The dependent agent should be told to read referenced files from the workspace when it needs the
full detail:

```text
Upstream work available:

Researcher completed "Market scan".
Summary:
The Bulgarian micro-SME accounting market appears fragmented, with opportunity in compliance-led
onboarding and vertical templates.

Files:
- workboard/bulgarian-sme-strategy-wr8f3a/researcher/market-scan.md
- workboard/bulgarian-sme-strategy-wr8f3a/researcher/competitors.xlsx

Read these files if you need the full detail. Do not assume the summary contains everything.
```

Full upstream text may still be included when the output is short, when the dependent task cannot
reasonably read files, or when a provider limitation requires inline context. That should be the
exception, not the default.

## Alternatives Considered

### Store Artifacts In AppData

- Pros: Easy for Ordinus to manage and clean up.
- Cons: Hides user work outside the selected workspace, mixes product runtime state with user
  deliverables, and makes artifacts harder to inspect, version, or share.
- Rejected: User-facing outputs should belong to the selected workspace.

### Force Every File Under The Agent Subdirectory

- Pros: Simple ownership model.
- Cons: Final deliverables and shared request-level outputs become buried under whichever agent
  happened to create them.
- Rejected: Agents need a request-level root for shared outputs and agent folders for intermediate
  materials.

### Pass Full Upstream Outputs Into Every Dependent Prompt

- Pros: Dependent agents can work without reading files.
- Cons: Bloats prompts, duplicates large documents, raises cost, and can bury the actual decision
  signal.
- Rejected as the default: handoffs should use summaries plus file references.

### Persist Draft Artifacts Before Approval

- Pros: Draft plans could pre-create folder structure.
- Cons: Leaves filesystem clutter for discarded plans.
- Rejected for now: create artifact roots only for approved or direct-start Work Requests.

## Consequences

- The selected workspace becomes the source of truth for user-visible Workboard outputs.
- Work Request artifacts remain grouped and inspectable as one unit.
- Agents can organize files intelligently without losing the Work Request boundary.
- AppData stays focused on Ordinus internal state.
- Dependent Work Items avoid prompt bloat by receiving summaries and file references.
- Runtime completion contracts should evolve toward explicit `artifactRefs` and `changedFiles`
  fields, using workspace-relative paths.
- The Workboard UI can later show artifact links from the Work Request root and each Work Item
  without exposing AppData internals.

## Implementation Notes

- Main process should create or ensure the Work Request artifact root after a Work Request is
  approved or direct-started.
- Renderer should never create artifact directories directly.
- Artifact refs stored in database records should be workspace-relative paths.
- Provider logs may remain in AppData, but `artifactRef` must not point to provider logs unless the
  product is explicitly showing diagnostics.
- Slug generation should sanitize path segments and include a short stable id to avoid collisions.
- Work execution prompts should be updated before relying on agents to create organized files.
