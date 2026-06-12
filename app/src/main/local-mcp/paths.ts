// ADR-041: every artifact of a managed local MCP server lives under one
// removable tree in app-data — runtimes, installed packages, caches, and
// session data. Nothing is ever written to the user's home directory; app
// removal removes all of it.

import { app } from 'electron'
import { join } from 'node:path'

export type LocalMcpPaths = {
  root: string
  /** Shared runtime binaries (one uv for all uv-based connectors). */
  runtimes: string
  /** uv tool dir / installed package environments. */
  packages: string
  /** Shared download/build caches (UV_CACHE_DIR etc.). */
  cache: string
  /** Per-connector session/profile data — deleted on Disconnect. */
  sessions: string
}

export function getLocalMcpPaths(): LocalMcpPaths {
  const root = join(app.getPath('userData'), 'local-mcp')
  return {
    root,
    runtimes: join(root, 'runtimes'),
    packages: join(root, 'packages'),
    cache: join(root, 'cache'),
    sessions: join(root, 'sessions')
  }
}

export function getConnectorSessionDir(connectorId: string): string {
  return join(getLocalMcpPaths().sessions, connectorId)
}
