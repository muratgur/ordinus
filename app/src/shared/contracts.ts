import { z } from 'zod'

export const AppInfoSchema = z.object({
  name: z.literal('Ordinus'),
  version: z.string(),
  platform: z.string(),
  arch: z.string(),
  isPackaged: z.boolean()
})

export const SystemPathsSchema = z.object({
  userData: z.string(),
  database: z.string(),
  runtime: z.string(),
  logs: z.string()
})

export const DbStatusSchema = z.object({
  databasePath: z.string(),
  exists: z.boolean(),
  initialized: z.boolean(),
  schemaVersion: z.number().int().nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable()
})

export type AppInfo = z.infer<typeof AppInfoSchema>
export type SystemPaths = z.infer<typeof SystemPathsSchema>
export type DbStatus = z.infer<typeof DbStatusSchema>
