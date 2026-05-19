---
name: sqlite-minimal-persistence
description: Extend Ordinus SQLite persistence conservatively. Use when touching better-sqlite3, Drizzle schema, database bootstrap, app_meta, migrations, durable state, persistence boundaries, or proposals to add new product tables.
---

# SQLite Minimal Persistence

## Objective

Use SQLite as durable local app state without designing product tables before the workflow model is clear.

## Current Policy

- The minimum database starts with `app_meta`.
- Add new tables only when the product behavior needs durable state now.
- Avoid adding agent, task, provider, schedule, inbox, or run schemas speculatively.
- Keep secrets out of ordinary product tables unless a secure storage decision has been made.
- Treat SQLite as main-process owned. Renderer must access state only through typed IPC.

## Workflow

1. Confirm the requested behavior truly needs persistence.
2. Check whether existing `app_meta` or settings-level storage is sufficient.
3. If a table is necessary, define the smallest schema that supports the current behavior.
4. Add Drizzle schema and bootstrap/migration logic together.
5. Keep data access behind main-process services.
6. Update `db.getStatus` only if the status surface needs to show new bootstrap information.
7. Run typecheck, lint, build, and a runtime smoke test that opens the app.

## Design Guidance

- Prefer durable state for user-visible history, resumable work, and app configuration.
- Prefer filesystem storage for large artifacts and generated files, with database metadata later when needed.
- Prefer explicit timestamps and schema versioning for local migrations.
- Keep schema names product-oriented and stable.

## Red Flags

- A table is added because a future module might need it.
- Renderer imports database code.
- Database writes are mixed into UI event handlers.
- Migration behavior is not exercised by opening the app.
