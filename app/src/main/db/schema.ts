import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const appMeta = sqliteTable('app_meta', {
  id: integer('id').primaryKey(),
  schemaVersion: integer('schema_version').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

export const workspaceConfig = sqliteTable('workspace_config', {
  id: integer('id').primaryKey(),
  workspaceRoot: text('workspace_root').notNull(),
  workspaceName: text('workspace_name').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})
