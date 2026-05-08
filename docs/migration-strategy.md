# Migration Strategy

Ordinus uses Drizzle migration SQL as the source of truth for SQLite schema changes. The current schema is intentionally minimal and contains only `app_meta`.

## Location

- Drizzle schema: `app/src/main/db/schema.ts`
- Migration config: `app/drizzle.config.ts`
- Migration files: `app/resources/db/migrations`
- Packaged app copy: Electron Builder copies migrations to `process.resourcesPath/db/migrations`

## Runtime Flow

On app startup, the Electron main process opens `userData/ordinus.db`, enables WAL mode, and runs Drizzle migrations before any IPC handlers are registered.

The renderer never runs migrations and never accesses SQLite directly.

## Version Tracking

Two layers are tracked:

- Drizzle tracks applied SQL files in its internal `__drizzle_migrations` table.
- Ordinus tracks the app-level schema version in `app_meta.schema_version`.

`app_meta.schema_version` should be incremented only when a migration changes the durable app schema. If a user opens a database created by a newer Ordinus build, startup fails instead of silently downgrading.

## Adding The Next Table

1. Update `app/src/main/db/schema.ts`.
2. Run `npm run db:generate` from the repo root or app directory.
3. Review the generated SQL before committing it.
4. Increment `databaseSchemaVersion` in `app/src/main/db/migrations.ts`.
5. Keep the new data access behind main-process services and typed IPC.
6. Run `npm run typecheck`, `npm run lint`, and `npm run build`.
