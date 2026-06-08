// ADR-029 §4 / M3 — Ordinus MCP server lifecycle.
//
// One MCP server per app process, started lazily on the first Ordinus
// conversation start, kept alive for the rest of the process. We avoid two
// shapes that look tempting but cause trouble:
//
//   - Per-conversation server: would require fresh port allocation, fresh
//     MCP handshake, and fresh CLI config materialization for every turn —
//     slower, more failure surface, and CLIs can't easily switch URLs
//     mid-session.
//   - Eager start at app boot: would tie MCP server cost to app startup
//     even for users who never open Home. Cheap to defer.
//
// Lazy + once + shared is the right shape.

import { startOrdinusMcpServer, type OrdinusMcpHandle } from './server'
import type { OrdinusToolContext } from '../ordinus-tools/types'

let currentHandle: OrdinusMcpHandle | null = null
let pendingStart: Promise<OrdinusMcpHandle> | null = null

/**
 * Ensure the Ordinus MCP server is running and return its handle. Safe to
 * call concurrently — overlapping callers all await the same in-flight start
 * promise rather than racing two servers onto two ports.
 */
export async function ensureOrdinusMcpServer(
  toolContext: OrdinusToolContext
): Promise<OrdinusMcpHandle> {
  if (currentHandle) {
    return currentHandle
  }
  if (!pendingStart) {
    pendingStart = startOrdinusMcpServer(toolContext)
      .then((handle) => {
        currentHandle = handle
        pendingStart = null

        console.log(`[ordinus-mcp] server started on ${handle.url}`)
        return handle
      })
      .catch((err) => {
        pendingStart = null
        console.error('[ordinus-mcp] server failed to start:', err)
        throw err
      })
  }
  return pendingStart
}

/**
 * Tear down the server if it's running. Invoked from the app's `will-quit`
 * handler so we don't leak the listening port on graceful shutdown.
 * Idempotent.
 */
export async function shutdownOrdinusMcpServer(): Promise<void> {
  const handle = currentHandle
  currentHandle = null
  pendingStart = null
  if (handle) {
    await handle.close().catch((err: unknown) => {
      console.error('[ordinus-mcp] shutdown failed:', err)
    })
  }
}

/** Read-only accessor for tests / diagnostics. */
export function getCurrentOrdinusMcpHandle(): OrdinusMcpHandle | null {
  return currentHandle
}
