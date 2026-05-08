import Database from 'better-sqlite3'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DbStatusSchema, type DbStatus } from '@shared/contracts'
import { getSystemPaths } from '../paths'
import { databaseSchemaVersion, getMigrationsFolder } from './migrations'
import { appMeta } from './schema'

export class OrdinusDatabase {
  private readonly databasePath: string
  private readonly existedBeforeOpen: boolean
  private readonly sqlite: Database.Database
  private readonly db: ReturnType<typeof drizzle>

  constructor() {
    this.databasePath = getSystemPaths().database
    mkdirSync(dirname(this.databasePath), { recursive: true })
    this.existedBeforeOpen = existsSync(this.databasePath)
    this.sqlite = new Database(this.databasePath)
    this.db = drizzle(this.sqlite, { schema: { appMeta } })
  }

  initialize(): DbStatus {
    this.sqlite.pragma('journal_mode = WAL')
    migrate(this.db, { migrationsFolder: getMigrationsFolder() })

    const now = new Date().toISOString()
    const existing = this.db.select().from(appMeta).where(eq(appMeta.id, 1)).get()

    if (!existing) {
      this.db
        .insert(appMeta)
        .values({
          id: 1,
          schemaVersion: databaseSchemaVersion,
          createdAt: now,
          updatedAt: now
        })
        .run()
    } else if (existing.schemaVersion < databaseSchemaVersion) {
      this.db
        .update(appMeta)
        .set({
          schemaVersion: databaseSchemaVersion,
          updatedAt: now
        })
        .where(eq(appMeta.id, 1))
        .run()
    } else if (existing.schemaVersion > databaseSchemaVersion) {
      throw new Error(
        `Database schema version ${existing.schemaVersion} is newer than this Ordinus build supports.`
      )
    }

    return this.getStatus()
  }

  getStatus(): DbStatus {
    const meta = this.db.select().from(appMeta).where(eq(appMeta.id, 1)).get()

    return DbStatusSchema.parse({
      databasePath: this.databasePath,
      exists: this.existedBeforeOpen || existsSync(this.databasePath),
      initialized: Boolean(meta),
      schemaVersion: meta?.schemaVersion ?? null,
      createdAt: meta?.createdAt ?? null,
      updatedAt: meta?.updatedAt ?? null
    })
  }

  close(): void {
    this.sqlite.close()
  }
}
