import { resolveResourcePath } from '../paths'

export const databaseSchemaVersion = 38

export function getMigrationsFolder(): string {
  return resolveResourcePath('db', 'migrations')
}
