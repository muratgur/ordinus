// ADR-029 §3 — `run_sql_readonly` escape-hatch tool.
//
// Opens the Ordinus SQLite file in read-only mode and executes a single query.
// This is the pressure-release valve for questions the typed read tools don't
// cover ("any schedule_runs with broken timezones?", "count of WRs per agent
// this week?"). Frequently-asked questions should graduate to typed tools over
// time; this stays for the long tail.
//
// Safety properties (all enforced here, not trusted to the LLM):
//   - The connection is opened with `{ readonly: true }`. better-sqlite3 will
//     reject any INSERT/UPDATE/DELETE/CREATE/DROP/ATTACH with an error before
//     the statement executes.
//   - Row cap: ROW_LIMIT prevents an unbounded `SELECT *` from a wide table
//     from blowing the LLM's context.
//   - Byte cap: TOTAL_BYTE_LIMIT bounds the serialized payload independently
//     of row count (long text columns can defeat the row cap alone).
//   - The connection is closed in finally so we don't leak file handles even
//     when the query errors.
//
// Schema documentation for the LLM is assembled separately (M3 will fold the
// Drizzle schema into the system prompt). This tool intentionally does NOT
// return schema introspection — that's not its job, and the LLM should have
// the DDL already.

import Database from 'better-sqlite3'
import { z } from 'zod'
import { getSystemPaths } from '../../paths'
import { defineOrdinusTool } from '../types'

const ROW_LIMIT = 500
const TOTAL_BYTE_LIMIT = 64 * 1024

const InputSchema = z.object({
  /**
   * A single SELECT statement (or PRAGMA). Writes are rejected by the
   * readonly connection, but keeping the query single-statement and intent-
   * obvious is good practice.
   */
  query: z.string().trim().min(1)
})

const OutputSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())),
  rowCount: z.number().int().nonnegative(),
  truncated: z.boolean(),
  /** Filled when the query errored — the rejection text, no rows. */
  error: z.string().nullable()
})

export const runSqlReadonly = defineOrdinusTool({
  manifest: {
    name: 'run_sql_readonly',
    description:
      'Run a read-only SQL query against the Ordinus SQLite database. Use ONLY when ' +
      'the typed read tools (list_recent_work_requests, get_run, list_agents, ...) ' +
      'cannot express the question. Connection is forced read-only — writes return an ' +
      'error. Output is capped at ' +
      String(ROW_LIMIT) +
      ' rows and ~64 KB. Schema DDL is provided in your system prompt; do not query ' +
      'sqlite_master for it. Prefer typed tools first; reach for this only for the ' +
      'long tail of ad-hoc questions.',
    capability: 'read'
  },
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  execute: (input) => {
    const path = getSystemPaths().database
    const db = new Database(path, { readonly: true })
    try {
      let rows: unknown[]
      try {
        const stmt = db.prepare(input.query)
        rows = stmt.all()
      } catch (err) {
        return {
          rows: [],
          rowCount: 0,
          truncated: false,
          error: err instanceof Error ? err.message : String(err)
        }
      }

      // Cap rows first (cheap), then enforce byte cap by trimming further.
      let truncated = rows.length > ROW_LIMIT
      let kept = rows.slice(0, ROW_LIMIT) as Record<string, unknown>[]
      let serialized = JSON.stringify(kept)
      while (serialized.length > TOTAL_BYTE_LIMIT && kept.length > 0) {
        // Drop rows from the tail until we fit. Binary-search would be fancier
        // but linear shrink is fine for the typical 1.5–2x overshoot.
        const drop = Math.max(1, Math.floor(kept.length * 0.25))
        kept = kept.slice(0, kept.length - drop)
        serialized = JSON.stringify(kept)
        truncated = true
      }

      return {
        rows: kept,
        rowCount: kept.length,
        truncated,
        error: null
      }
    } finally {
      db.close()
    }
  }
})
