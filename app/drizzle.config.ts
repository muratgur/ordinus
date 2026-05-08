import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/main/db/schema.ts',
  out: './resources/db/migrations',
  dialect: 'sqlite',
  verbose: true,
  strict: true
})
