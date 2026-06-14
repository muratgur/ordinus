# ADR-031: Bind Each Work Request and Conversation to One Isolated Folder

## Status

Accepted

Partially supersedes ADR-008 (workspace artifacts and handoffs): the execution model
("run the provider CLI from the workspace root and pass the module folder only as a
non-restrictive prompt suggestion"), the lowercase `workboard/<slug-id>` module-folder
naming, and the "agents may read or modify other files inside the workspace / edit
existing project files in their natural locations" stance are reversed. The
single-workspace-root concept, workspace-relative reporting, agent-owned support
directories, internal provider paths, and the Markdown frontmatter/`## References`
policy from ADR-008 remain in force.

Partially supersedes ADR-014 (destination and context): the file/folder **context
reference** mechanism — the References surface (Suggested / Selected / All files /
Manual path) — is removed and replaced by per-request **folder selection**. ADR-014's
**destination** model (new Work Request vs. add Work Item to an existing Work Request)
and the **Continue** entry path remain.

Builds on ADR-024 (per-agent extra directories) as the explicit, user-configured escape
hatch out of the folder boundary, and on ADR-030 (database-backed result content and
handoffs) as the mechanism for cross-request continuation that does not rely on shared
filesystem access.

Amended by ADR-045 (Settings IA and copy system): the workspace **root is no longer
reselectable from Settings** (read-only, with Reveal in Finder only). The path-policy
invariant below ("the root can still be moved and reselected") remains true at the code
level, but the user-facing reselection control is withdrawn — changing the root re-resolves
every existing unit's stored *relative* `workingRoot` under the new root
(`resolve(currentRoot, relativeWorkingRoot)` in `runtime/adapters/shared.ts`), silently
relocating live conversations and runs. This operationalizes the hard rule in Consequences
("never let an existing unit's folder change") at the UI level.

## Date

2026-06-09

## Context

Every Ordinus run (Work Request, conversation, schedule) today executes the provider CLI
with `cwd = WorkspaceRoot` — the single user-selected root. ADR-008 deliberately chose
this: it passes the per-module folder (`workboard/<slug-id>`, `conversations/<slug-id>`)
to the agent only as a **suggested** working folder in the prompt, and explicitly rejected
executing the CLI from the module subfolder so the agent would keep the project root as
natural context and could "read or modify other files inside the workspace when the task
requires it."

In practice this produced a concrete failure. The user asked an agent to build a game in a
fresh Work Request. Because the agent's real boundary was the workspace root — not its WR
folder — it discovered an unrelated, previously created project sitting elsewhere under the
root, read it, and produced a derivative of it. The agent was not misbehaving: the prompt
told it to work "broadly," its sandbox writable root was the whole workspace, and the
neighbouring project was plainly in scope. The "suggested folder" was a soft hint with no
enforcement; the hard boundary was the entire root.

The root cause is a mismatch between the intended product model and the execution model:

- **Intended model (the user's real world):** each Work Request and each conversation is an
  independent unit of work — a self-contained deliverable (a game, a report, a revised page).
  There is no shared, continuously evolving monorepo that all agents collaborate on. Work
  Requests do not legitimately need to see each other.
- **Execution model (ADR-008):** one broad sandbox (the workspace root) shared by every WR,
  every conversation, and every project the user has ever placed under the root, with the
  per-unit folder reduced to a prompt suggestion.

Reference CLIs (Codex, Claude, Gemini, and the user-facing Claude Code / Codex products) all
operate against a **single project directory** as their cwd and sandbox boundary. Ordinus
diverged from this for "broad" access, and the divergence is what leaked.

A second concern is realism of the boundary. Provider sandbox capability is asymmetric:

- **Codex** has a real OS sandbox (`--sandbox workspace-write`) whose writable root is the
  cwd. Confining cwd to the WR folder physically confines writes to it.
- **Claude Code** has an OS sandbox (macOS Seatbelt / Linux bubblewrap) but it only jails
  **Bash subprocesses**, not Claude's own Read/Edit/Write tools, which are permission-gated.
- **Gemini** can OS-sandbox the whole CLI process via Seatbelt (macOS, no Docker) but only
  confines reads with a `restrictive`/`strict` profile; the default profile confines writes
  only.

So a hard, OS-level single-folder jail is available today only on Codex; on Claude/Gemini a
true jail needs additional work (a `@anthropic-ai/sandbox-runtime` wrapper for Claude, a
restrictive Seatbelt profile for Gemini).

## Decision

**The unit of filesystem isolation is a folder. Each Work Request and each conversation is
bound to exactly one folder, and the agent is confined to that folder.**

### Execution boundary

The provider CLI is executed with the per-unit **working folder** as its working directory
and sandbox root, not the workspace root:

- Codex: `-C <workingRoot>` and the `workspace-write` sandbox (writable root follows cwd).
- Claude: `cwd = <workingRoot>`.
- Gemini: `cwd = <workingRoot>`.

The workspace root is no longer passed as the execution cwd. The only directories an agent
can reach beyond its folder are the explicit, intentional ones: the agent home
(`agentHomePath`, `--add-dir`) and the user-configured per-agent extra directories
(ADR-024). The selected project folder is **not** an "extra" directory — it *is* the cwd;
the agent is never handed two project folders at once.

### Prompt model

The working folder is no longer described as a "suggestion." The workspace prompt is rewritten
to state that the agent is working **inside** the folder and must stay within it. The ADR-008
instructions "You are running from the workspace root" and "Edit existing project files in
their natural locations" are removed, because under folder isolation there is no broader
workspace the agent should reach into.

### Folder layout

Ordinus-owned folders live under three clear, capitalized buckets directly under the root:

```text
<root>/Projects/
<root>/Conversations/
<root>/Ordinus/
```

The root itself remains the user's own area; users may keep their own folders and files there.
Ordinus only creates content inside the three buckets.

Project folders use **human-readable, title-based names**, not slug+id:

```text
<root>/Projects/Landing page
<root>/Projects/Snake game
```

- The folder name is derived from the request title, sanitized for the filesystem and length-
  capped. No id suffix.
- **Uniqueness for new folders is guaranteed by a Finder-style numeric suffix on collision**
  (`Landing page`, then `Landing page 2`, `Landing page 3`, …). Each "New" request gets its own
  folder; two new requests never silently share one.
- **Identity lives in the database** (the `workingRoot`), not in the folder name. The folder
  name is computed once at creation. Editing the request title later does **not** rename or move
  the folder — the agent's bound path and session resume stay valid. Renaming a folder, if ever
  offered, is a separate explicit action.

### Folder selection at request creation

The References surface (Suggested / Selected / All files / Manual path) is removed. A request
instead selects its folder:

- **New (default):** a fresh title-named folder under `Projects/` (with collision suffix).
- **Existing:** any folder under the root, chosen via a directory browser. The browser may
  descend into subfolders (e.g. a package inside a monorepo the user placed under the root) but
  **hides the system buckets** (`Conversations/`, `Ordinus/`, agent homes) and never permits a
  selection outside the root (out-of-root access is ADR-024's job).

Pointing two Work Requests at the **same existing folder** is permitted and is the supported,
**deliberate handoff** mechanism: shared context becomes an explicit user choice, not an
accident. "New" always isolates; "Existing" allows intentional sharing.

### Immutability and Continue

A unit's folder is chosen once and is immutable for its lifetime. **Continue Work Item does not
prompt for a folder** — the continued/child run inherits the same `workingRoot`
(`parentRun.workingRoot ?? request.workingRoot`) and the provider is resumed with the identical
cwd/`-C` it was created with. We never resume a session against a different folder, which avoids
the "session created at folder A, resumed at folder B" hazard entirely. Folder selection happens
only at creation, before any session exists.

### Conversations

1:1 and group conversations get the same isolation: `cwd = <root>/Conversations/<title>`. Existing-
folder selection is **not** offered for conversations — a conversation is a conversation, not a
project task; touching an existing project is what a Work Request is for. Per-agent extra
directories (ADR-024) still apply.

### Folder creation timing

The working folder is created **at run start, by the dispatcher (main process), immediately before
the provider is spawned**, with an idempotent recursive `mkdir`. It is not created when the WR/
conversation record is created (avoiding empty folders for units that never run), and it cannot be
created lazily "on first write" because the cwd/sandbox root must exist before the process spawns.
Concurrent agents within one Work Request share the one folder; the idempotent `mkdir` makes
concurrent dispatch race-free (first wins, rest no-op).

**No empty-folder garbage collection.** Cleaning up empty folders on run completion is rejected:
two Work Requests may legitimately point at the same folder, so an empty-check-and-delete on one
run could race with or destroy a folder another run is about to use. Empty folders for output-less
runs are an accepted trade-off; the buckets are not surfaces users browse constantly.

### Sandbox calibration (now vs. later)

- **Now (pragmatic):** cwd/`-C` confinement + the rewritten "stay inside this folder" prompt +
  Codex's existing OS sandbox. This alone resolves the observed contamination on all three
  providers, because the neighbouring project is no longer in the cwd and the prompt no longer
  invites broad work. On Codex the boundary is additionally OS-enforced.
- **Later (hard OS jail), if needed:** a real single-folder jail on every provider — Gemini via a
  `restrictive`/`strict` Seatbelt profile (macOS, no Docker), Claude via the
  `@anthropic-ai/sandbox-runtime` wrapper around the whole process. This is the same future work
  ADR-024 deferred ("real read-only / OS-level sandbox is future work") and is only warranted if
  Ordinus needs to run genuinely untrusted code.

### Migration

None. Existing installs keep their current `workboard/` / `conversations/` / `ordinus/` folders and
the `workingRoot` paths already stored in the database; those remain immutable and resume correctly.
The new buckets and naming apply only to newly created Work Requests and conversations going forward.

## Alternatives Considered

### Keep ADR-008's "broad workspace, suggested folder" model

- Pros: agents can opportunistically use anything under the root; no new selection UI.
- Cons: it is exactly the model that leaked. A prompt suggestion is not a boundary; the sandbox
  writable root was the whole workspace.
- Rejected: the observed contamination is a direct consequence of this model in a world where Work
  Requests are independent units.

### Per-Work-Request fresh folder as the only boundary (no "Existing")

- Pros: simplest; every WR is absolutely isolated.
- Cons: cannot revise an existing project (the screenshot case: "revise the site"), and cannot do an
  intentional handoff.
- Rejected: folder selection (New vs. Existing) covers both greenfield and revise-existing without
  reopening broad access.

### Real OS sandbox on all providers now

- Pros: hard guarantee everywhere immediately.
- Cons: significant work (Claude wrapper, Gemini restrictive profile), and the user's problem is a
  behavior leak, not an adversarial breakout.
- Rejected for now; recorded as deferred work (see Sandbox calibration).

### Human-readable folder name that renames when the title changes

- Pros: folder name always matches the current title.
- Cons: renaming moves the bound path; the agent's cwd and any resumed session break.
- Rejected: name is derived once at creation; identity is the DB `workingRoot`, not the name.

### Empty-folder cleanup on completion

- Pros: tidier buckets.
- Cons: shared-folder requests make an empty-check-and-delete racy and potentially destructive.
- Rejected: accept empty folders; revisit only if clutter becomes a real problem.

## Consequences

- The contamination class is closed: an agent's cwd and (on Codex) its writable sandbox root are its
  own folder; neighbouring projects are neither visible by default nor invited by the prompt.
- Work Requests and conversations map cleanly to "a folder," matching how reference CLIs behave and
  how the user already thinks about projects.
- Intentional cross-request work is explicit: point two requests at the same Existing folder, or pass
  upstream results inline via ADR-030. Sharing is never accidental.
- The buckets (`Projects/`, `Conversations/`, `Ordinus/`) read like a workspace instead of a pile of
  slug-id folders.
- Continue/resume needs no folder UI and no new plumbing: the folder is inherited and re-supplied each
  turn (consistent with ADR-013).
- The single hard rule to preserve: never let an existing unit's folder change. Any future "move/rename
  folder" feature must recreate or re-point the session deliberately, not silently.
- Out-of-folder access remains possible only through ADR-024 per-agent extra directories — a deliberate,
  validated, user-configured grant.

## Implementation Notes

- `app/src/main/workspace/path-policy.ts`:
  - Rename module folders to `Projects` / `Conversations` / `Ordinus` (capitalized) for new content;
    introduce a title-based folder-name builder with filesystem sanitization, length cap, and
    Finder-style numeric-suffix collision resolution against the existing `Projects/` contents.
    Retire `<slug>-<shortStableId>` for new Work Request / conversation folders.
  - Keep `resolveWorkspaceRelativePath` and the workspace-relative invariant (the root can still be
    moved and reselected).
- `app/src/main/runtime/adapters/{codex,claude,gemini}/adapter.ts`:
  - Change the execution working directory from `input.workspaceRoot` to `input.workingRoot`
    (Codex `-C input.workingRoot` and spawn cwd; Claude/Gemini spawn `cwd: input.workingRoot`) in
    **both** the fresh and resume branches, so creation and resume always use the identical folder.
  - Leave `agentHomePath` and `extraDirectories` grants (`--add-dir` / `--include-directories` /
    `writable_roots`) unchanged.
- `app/src/main/runtime/prompts/workspace.ts`:
  - Rewrite `buildWorkspaceWorkingFolderInstructions` to state the agent is working inside the folder
    and must stay within it; remove "You are running from the workspace root" and "Edit existing
    project files in their natural locations." Keep the Markdown frontmatter / `## References` policy.
- Renderer (`agent-creation-flow.tsx` / workboard request composer): remove the References section
  (Suggested / Selected / All files / Manual path); add New-vs-Existing folder selection with a
  root-scoped directory browser that hides system buckets. Do not offer folder selection in the
  conversation composer.
- Dispatcher (run start, `register.ts` / `service.ts`): ensure the working folder exists with an
  idempotent recursive `mkdir` immediately before spawning the provider. No empty-folder cleanup.
- Contracts (`app/src/shared/contracts.ts`): retire the file/folder context-reference input shapes
  tied to the removed References surface; add the folder-selection input (New vs. Existing absolute/
  root-relative folder), validated to resolve inside the root.
- IPC: add a root-scoped directory listing/browse handler for the Existing-folder picker that filters
  out `Conversations/`, `Ordinus/`, and agent-home paths.
