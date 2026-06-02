# Architecture

Ordinus is a local-first Electron desktop app for coordinating AI agents around real software work. The architecture favors a small secure foundation before broad automation.

## Process Model

- Electron main process owns privileged work: filesystem, SQLite, provider runtime, OS integration, and packaging-sensitive behavior.
- Preload exposes a narrow typed `window.ordinus` API.
- Renderer is UI only. It must not access Node, child processes, SQLite, filesystem, or secrets directly.

## App Layout

```text
app/
|-- src/main/      Electron main process, IPC handlers, SQLite, runtime boundary
|-- src/preload/   Safe renderer bridge
|-- src/renderer/  React UI
|-- src/shared/    Shared IPC contracts and validation
`-- resources/     Runtime resources copied into packaged apps
```

Repository-level docs, project skills, CI, and contribution files live at the repo root.

## Persistence

SQLite lives at Electron `userData/ordinus.db`. The current schema is intentionally minimal:

- `app_meta`
- Drizzle internal migration table

Schema changes must use Drizzle migrations under `app/resources/db/migrations`. See `docs/migration-strategy.md`.

## Runtime Boundary

Codex, Claude, Gemini, and future providers will be integrated through provider-neutral main-process adapters. The current implementation only defines the safe contract and types; it does not run provider CLIs yet.

Runtime rules:

- Validate workspace boundaries in main.
- Use executable plus args, never raw shell strings.
- Normalize stdout/stderr into ordered events.
- Support cancel and timeout before advanced automation.
- Store secrets outside plaintext SQLite.

See `docs/provider-runtime-contract.md`.

Conversation runtime should follow the session-backed model in
`docs/decisions/ADR-003-session-backed-conversations.md`: Ordinus stores lightweight conversation
metadata and provider session references, while provider CLIs own detailed per-agent conversation
memory.

Provider session references are provider-owned hints, not portable product memory. Runtime session
selection and fresh-session fallback should follow
`docs/decisions/ADR-013-provider-session-validity-and-fresh-start-fallback.md`.

Each agent's primary surface is a single canonical 1:1 chat room (a one-participant session-backed
conversation) inside the Agents "home" screen; the Conversations area is reserved for multi-agent
group rooms. See `docs/decisions/ADR-027-agent-home-chat-room-and-colleague-profile.md`.

## UI

The renderer uses React, TypeScript, Tailwind, and shadcn/ui primitives. UI should feel calm, operational, and work-focused. Reusable primitives live under `app/src/renderer/src/components/ui`.

## Packaging

electron-builder owns package generation. Release builds should be signed and notarized where required. Local unsigned Windows workarounds live in explicit local scripts only.

See `docs/packaging-release.md`.
