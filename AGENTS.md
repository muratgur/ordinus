# Ordinus Agent Guide

## Mission

Ordinus is a desktop workspace for coordinating AI agents around real software work. Keep the product simple, observable, local-first, and user-controlled.

Build a command center for AI-assisted work, not a generic chatbot.

## Product Principles

- Make agent activity visible: planned, running, blocked, completed.
- Give agents clear roles and responsibilities.
- Help agents coordinate instead of running disconnected conversations.
- Keep the user in control of important actions.
- Prefer a small reliable workflow over broad unfinished features.
- Avoid integrations before the core runtime model is stable.

## Architecture Direction

- Electron main process owns privileged work: filesystem, database, process execution, provider runtimes, and OS integration.
- Renderer is UI only. It must not access Node, filesystem, child processes, secrets, or SQLite directly.
- Preload exposes only a small typed `window.ordinus` API.
- Never expose raw `ipcRenderer`, `electron`, filesystem, process, or database APIs to renderer code.
- Provider runtime must follow `docs/provider-runtime-contract.md` before adding CLI detection or process spawning.
- Provider commands use executable plus args, not raw shell strings.
- Runtime environment is deny-by-default; secrets are referenced, resolved in main, and never logged.
- Shared contracts live in `src/shared`.
- Use SQLite for durable app state, but add tables only when the product model is clear.
- Keep SQLite schema changes in Drizzle migrations under `app/resources/db/migrations`.
- Run migrations from the Electron main process before registering IPC handlers.
- Track applied SQL through Drizzle and app-level schema version through `app_meta.schema_version`.
- Do not add agent, task, provider, schedule, or inbox schemas prematurely.

## Current Stack

- Electron + electron-vite
- React + TypeScript
- Tailwind + shadcn/ui components
- Drizzle + better-sqlite3
- Zod for contracts and validation
- npm

## Repository Layout

- Electron app code lives under `app/`.
- Product docs live under `docs/`.
- Project skills live under `.codex/skills/`.
- GitHub Actions workflows live under `.github/workflows/`.
- Issue templates live under `.github/ISSUE_TEMPLATE/`.
- Open-source contribution and security policy live in `CONTRIBUTING.md` and `SECURITY.md`.
- Run npm scripts from `app/` unless a task explicitly targets repository-level docs or skills.
- Packaging and release rules live in `docs/packaging-release.md`.

## Implementation Rules

- When a task touches Electron security, IPC, persistence, UI, shadcn components, or provider runtime, consult the matching project skill under `.codex/skills`.
- Keep changes small and verifiable.
- Preserve the secure Electron boundary.
- Prefer typed IPC handlers and Zod validation in main/shared.
- Keep preload lightweight and sandbox-friendly.
- Avoid third-party runtime imports in preload unless there is a strong reason.
- Use shadcn/ui reusable components for UI primitives.
- Prefer the shadcn CLI when adding registry components. Run it from `app/`.
- Keep `components.json`, `tailwind.config.ts`, TypeScript aliases, and component imports aligned.
- Do not introduce large product features until the foundation is stable.
- Keep release builds signed. Local unsigned Windows workarounds must stay in explicit `*:local` scripts.

## UI Direction

- Ordinus should feel calm, practical, and work-focused.
- Avoid marketing-page layouts.
- Avoid decorative clutter.
- Prioritize clear status, readable history, and obvious next actions.
- Use interface text that explains product state, not implementation details.

## Testing Expectations

Before finishing meaningful changes, run:

- `npm ci` when dependency installation or CI behavior changes
- `npm run typecheck`
- `npm run lint`
- `npm run build`

For UI primitive or shadcn changes, also run:

- `npm run ui:info`
- `npm run ui:check`

For Electron, preload, database, or runtime changes, also smoke test:

- `npm run dev` or a packaged app when relevant.

## Out of Scope for Now

- Cloud sync
- Hosted accounts
- Marketplace features
- Complex permissions
- Deep third-party integrations
- Premature multi-agent automation before single-agent workflows are solid
