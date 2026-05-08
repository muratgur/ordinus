# Contributing

Thanks for helping improve Ordinus. The project is early, so small, well-scoped changes are the easiest to review and merge.

## Before You Start

- Read `README.md`, `AGENTS.md`, and the relevant document under `docs/`.
- Keep product changes aligned with `docs/product-brief.md`.
- Keep Electron security, IPC, database, provider runtime, and packaging changes aligned with their matching docs.

## Local Setup

Use Node.js `22.13.0` or newer.

```bash
cd app
npm ci
npm run dev
```

## Checks

Run these before opening a pull request:

```bash
cd app
npm run typecheck
npm run lint
npm run build
```

If you change dependencies, run `npm ci` from `app/` to verify a clean install.

## Pull Requests

- Explain the user-facing or architectural reason for the change.
- Keep unrelated refactors out of feature or bug fix PRs.
- Include screenshots for visible UI changes.
- Update docs when changing architecture, runtime contracts, migrations, packaging, or setup.
- Do not commit secrets, local database files, build outputs, or `node_modules`.

## Architecture Guardrails

- Renderer code must not access Node, SQLite, filesystem, process APIs, or secrets directly.
- Main process owns privileged work.
- Preload exposes a small typed `window.ordinus` API.
- SQLite schema changes must use Drizzle migrations.
- Provider runtime changes must follow `docs/provider-runtime-contract.md`.
