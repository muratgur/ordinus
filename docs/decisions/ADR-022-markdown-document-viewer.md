# ADR-022: Markdown Document Viewer and Editor

## Status

Accepted

Builds on ADR-008 (workspace artifacts, Markdown frontmatter standard) and ADR-019 (request
file provenance panel). Adds a generic `files.*` IPC namespace and a new renderer surface.
Supersedes no prior decision.

Partially superseded by ADR-030 (database-backed result content and handoffs): the viewer's **edit
mode** (raw editor, formatting toolbar, `files.write`, and the save-time mtime/hash conflict UI) is
removed, making the viewer read-only; the viewer is generalized to render **database-backed result
content** in addition to disk `.md` files; and a **"Save as"** action is added that materializes a
database result into a new workspace `.md` file — overriding this ADR's rule that the viewer never
creates files. The read-mode presentation, frontmatter header card, `.md`-on-disk handling, and
`files.read` channel remain in force.

## Date

2026-05-22

## Context

The dominant output of Ordinus agents is Markdown documents. ADR-008 established that new
user-facing `.md` files carry concise YAML frontmatter and a final `## References` section,
and are reported as workspace-relative paths. ADR-019/020 added a request-scoped file
provenance panel that lists those files with copy-path and reveal-in-OS actions.

There is no way to read a produced `.md` file inside Ordinus. To review agent output the user
must reveal the file in the OS file manager and open it in an external application. Because a
raw `.md` file is plain text, most external text editors render it unformatted and unpleasant.
Users read these documents to do their work, so an unformatted, ugly presentation is a real
and recurring friction — the dominant friction once provenance navigation (ADR-019) is solved.

The product also has no way to make a small correction to a produced document without leaving
Ordinus. A reviewer who spots a wrong sentence in an agent's output should be able to fix it in
place rather than round-tripping through an external editor.

Two facts shape the design:

- These files are live agent output. While a user reads or edits a `.md` file, a Work Run may
  rewrite the same file on disk. Edits must not silently overwrite agent output, and a save
  must not silently lose a concurrent change.
- The renderer must not be granted general filesystem access. Reading and writing file content
  must cross the Electron security boundary through validated, narrow IPC, consistent with the
  central workspace path policy used by `workboard.checkPaths`.

## Decision

Add an in-app Markdown document viewer and editor, opened from file rows, presented as a large
overlay, backed by two new validated IPC channels.

### Scope

The viewer handles `.md` files only. Other file types are already presented adequately by the
operating system; the reveal-in-OS action remains their path. A polished, Markdown-specific
experience is where the value is, and ADR-008 already defines `.md`-specific structure
(frontmatter, `## References`, wikilinks) the viewer can build on.

### Entry Point

A reusable "Open" row action opens the viewer. In this ADR it is added to the file rows of the
ADR-019 request file provenance panel; the same action can be reused by future file-listing
surfaces. "Open" appears only for `.md` files that exist on disk and are within the size limit.
Missing files, non-`.md` files, and oversized files keep the reveal-in-OS action instead.
Files in the "outside the work folder" group are openable as long as they are
workspace-relative.

### Presentation Surface

The viewer is a full-screen overlay that slides up from the bottom and covers the entire
window, including the top navigation bar, so reading and editing happen with full focus. It is
not a route: closing it animates back down and leaves the user on the Workboard. A
drawer-on-drawer stack and a narrow side drawer are both rejected — `.md` documents are large
and need a wide, comfortable surface.

### Read and Edit Modes

The viewer opens in **read mode** (a formatted, rendered document) and has an explicit toggle
to **edit mode** (raw Markdown in a plain editor). The two modes use independent rendering and
editing surfaces; there is no WYSIWYG / live-preview surface in this version. Read mode is the
core of the feature — the user's primary need is to view produced documents well — and a
clean, lossless renderer matters more than an in-place rich editor. Editing is a secondary,
deliberately limited convenience: fix something without leaving Ordinus.

### Frontmatter

In read mode, the YAML frontmatter is parsed and presented as a structured header card at the
top of the document: `title` as the document heading, `summary` below it, `created_by` /
`created_at` as a small meta line, `tags` as chips, `upstream` as a list. The raw `---` block
is not shown in read mode. If the frontmatter cannot be parsed, the viewer skips the card and
renders the document body without crashing. In edit mode the frontmatter stays in raw form at
the top of the text; there is no special toolbar protection for the `---` block.

### Read-Mode Visual Treatment

Read mode is a dedicated reading surface, not the cramped inline `MarkdownContent` component
used for chat and run output. The rendered document sits in a centered, width-limited "sheet"
(~70-character measure) on a slightly contrasting backdrop, with a subtle token-based shadow —
a document-on-a-desk, printed-paper feel. The sheet is theme-aware: in dark mode it is a
slightly raised surface, not white. All colors and elevation come from existing design tokens;
no new colors are introduced. Typography uses its own reading scale — larger body size,
comfortable line height, clear heading hierarchy, generous vertical rhythm — in the existing
sans font family; no serif font is introduced. Read mode is therefore a separate component from
`MarkdownContent`, which remains in place for chat and run output.

### Link Handling

The viewer renders a single document; there is no in-viewer navigation between documents.
`https` links open in the browser as today. Internal `.md` references (`[[wikilinks]]`,
`## References` entries) render as visually distinct but inert text — not clickable. Resolving
wikilinks to workspace paths and navigating between documents is deferred to a later decision.

### Edit Mode

Edit mode is a plain monospace `<textarea>` over the raw Markdown — no syntax highlighting or
code-editor dependency. Above it is a small formatting toolbar whose buttons wrap the selection
in Markdown syntax: bold, italic, headings (H1–H3), bullet list, numbered list, link, inline
code, code block, blockquote. The toolbar is an assist, not a full editor; tables and images
are left to raw typing.

### Saving and Concurrency

Saving is explicit: an edit is persisted only when the user presses Save. There is no
autosave — autosave would increase the risk of silently overwriting concurrent agent output.
Closing the viewer with unsaved changes prompts the user.

The read IPC returns the file content together with its `mtime` (or content hash). The write
IPC takes the path, the new content, and that expected `mtime`. On save, the main process
re-checks the file: if it changed on disk since it was opened, the write is rejected and the
user is told the file changed while they were editing, with the choice to overwrite or reload.
A silent overwrite never happens.

The viewer does not watch the file for live changes while open. The save-time conflict check is
sufficient; per-file `fs.watch` is out of scope for this version.

### IPC and Security

Two new IPC channels are added under a generic `files.*` namespace, since the "Open" action is
not Workboard-specific:

- `files.read` — takes a workspace-relative path, returns content plus `mtime`/hash.
- `files.write` — takes a workspace-relative path, new content, and expected `mtime`/hash;
  rejects on mismatch.

Both reuse the central workspace path policy: only workspace-relative paths are accepted;
absolute paths and `..` traversal are rejected; only the `.md` extension is accepted.
`files.write` writes only over an existing `.md` file — the viewer never creates new files.
`files.read` enforces a size limit (~5 MB); a larger file is rejected and its row keeps the
reveal-in-OS action instead of "Open". Each channel needs a Zod request/response schema, a
main-process handler, and a preload bridge method, consistent with the IPC contract design.

## Alternatives Considered

### General-purpose file viewer (all types)

- Pros: One viewer for `.md`, text, JSON, CSV, images, PDFs.
- Cons: Each file type is its own rendering decision and component; large scope creep for a
  problem that is specifically about Markdown.
- Rejected: other types are handled adequately by the OS; the value is a Markdown-specific
  experience.

### Render the viewer inside a drawer

- Pros: Reuses the existing drawer pattern directly.
- Cons: `.md` documents are large; a drawer is too narrow to present a formatted document well,
  and a drawer opened from the provenance drawer is a drawer-on-drawer stack.
- Rejected: the document needs a wide surface.

### Dedicated route / screen for the viewer

- Pros: Maximum space.
- Cons: Detaches the user from the Workboard context they opened the file from.
- Rejected in favor of a large overlay that closes back onto the Workboard.

### WYSIWYG / live-preview editing

- Pros: Editing directly on the formatted view feels the most polished.
- Cons: Requires lossless Markdown ↔ document-model round-tripping; ADR-008-specific structure
  (frontmatter, wikilinks, `## References`) is easily corrupted, and a corrupted agent output
  written back to disk is a real harm.
- Rejected: read/edit mode separation keeps the renderer lossless and the write path safe.

### Split source/preview editing

- Pros: Live preview while editing.
- Cons: Splits the wide surface into two narrow panes with two scrolls; editing is a secondary
  feature that does not justify it.
- Rejected: read mode already provides the formatted view.

### Autosave

- Pros: No lost edits, no Save button.
- Cons: Increases the risk of silently overwriting concurrent agent output.
- Rejected: explicit Save plus a save-time conflict check.

### Live file watching while the viewer is open

- Pros: The user sees agent rewrites immediately.
- Cons: Per-file `fs.watch` adds complexity for every open document.
- Rejected: the save-time conflict check covers the real risk.

### In-viewer navigation between documents

- Pros: Lets the user follow upstream chains via wikilinks.
- Cons: Requires wikilink-to-path resolution, a navigation/breadcrumb stack, and dirty-state
  handling on navigation — its own decision tree.
- Rejected for this version: wikilinks render as inert, visually distinct text; navigation is
  deferred.

### Reuse the existing `MarkdownContent` component for read mode

- Pros: No new rendering component.
- Cons: `MarkdownContent` is a compact inline component for chat and run output; it is not a
  reading surface.
- Rejected: read mode is a dedicated document presentation; `MarkdownContent` stays for its
  current uses.

## Consequences

- The user can read and lightly edit an agent's `.md` output inside Ordinus, without an
  external editor.
- Read mode presents Markdown as a polished, paper-like document; frontmatter becomes a
  structured header card instead of a raw `---` block.
- A reusable "Open" row action exists for `.md` files and can be added to future file-listing
  surfaces.
- Two new validated IPC channels (`files.read`, `files.write`) are added under a generic
  `files.*` namespace, each with a Zod schema, handler, and preload bridge.
- Concurrent agent rewrites are handled: an explicit Save with a save-time `mtime`/hash
  conflict check prevents silent overwrite and silent loss.
- No database migration is required; the viewer reads and writes files directly.
- A new read-mode document component is added; `MarkdownContent` is unchanged.
- If in-viewer navigation between documents, wikilink resolution, or non-`.md` file types are
  needed later, this decision should be revisited.

## Implementation Notes

- `files.read` and `files.write` resolve and validate paths through the central workspace path
  policy reused by `workboard.checkPaths`: workspace-relative only, no `..` traversal, `.md`
  extension only. `files.write` requires an existing target file.
- `files.read` returns content plus `mtime` (or content hash); `files.write` requires the
  expected value and rejects on mismatch with a distinct conflict result the renderer can
  surface as "overwrite / reload".
- `files.read` enforces a ~5 MB cap; the provenance panel gates the "Open" action on existence,
  `.md` extension, and size, falling back to reveal-in-OS otherwise.
- The viewer is a full-screen bottom overlay that covers the window, including the top
  navigation bar, and animates open/close; it is not a route.
- Read mode is a new document component using `react-markdown` + `remark-gfm` with its own
  sheet layout, token-based elevation, theme-aware surface, and reading-scale typography.
- Frontmatter is parsed for the header card; a parse failure degrades gracefully to a
  body-only render.
- Edit mode is a plain monospace `<textarea>` with a selection-wrapping formatting toolbar
  (bold, italic, H1–H3, bullet list, numbered list, link, inline code, code block, blockquote).
- Unsaved changes prompt on close; Save is the only persistence trigger.
