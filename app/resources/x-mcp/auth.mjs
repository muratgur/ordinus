// ADR-046: token holder for the X MCP server. Unlike Google, the child is
// STATELESS — refresh authority lives in the MAIN process (X rotates refresh
// tokens on every use, so a child that refreshed then got idle-reaped before
// persisting would strand a consumed token). The supervisor refreshes + writes
// the rotated token back and injects only a short-lived access token per spawn
// (pre-spawn refresh, ADR-046 Phase 2); this helper never refreshes.
//
// A 401 means the injected access token was rejected (typically expiry on a
// child that outlived its ~2h token). The child can't refresh, but the main
// process CAN. So it drops a TOKEN_REJECTED_MARKER (a softer signal than
// logged-out) and exits non-zero: the supervisor's pre-spawn refresh sees the
// marker and force-refreshes regardless of the local expiry margin, so a token
// that was rejected while still looking "fresh" locally (e.g. server-side
// revoke) heals on respawn instead of looping. Only a genuinely dead rotation
// chain escalates to logged-out + "Reconnect required" (in the main process).
// TOKEN_REJECTED_MARKER mirrors app/src/main/local-mcp/protocol.ts — keep in sync.

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const EXIT_TOKEN_REJECTED = 75
const TOKEN_REJECTED_MARKER = 'token-rejected'
const API = 'https://api.twitter.com/2'

export function createAuth(config) {
  const { sessionDir } = config
  const accessToken = config.accessToken

  async function call(path, init = {}) {
    const url = path.startsWith('http') ? path : `${API}${path}`
    const res = await fetch(url, {
      ...init,
      headers: { ...(init.headers || {}), Authorization: `Bearer ${accessToken}` }
    })
    if (res.status === 401) {
      // Signal the main process to force-refresh on respawn (see header). The
      // marker write is best-effort — exit non-zero regardless, so a failed
      // write can't keep a child alive looping on a rejected token.
      try {
        if (sessionDir) {
          writeFileSync(join(sessionDir, TOKEN_REJECTED_MARKER), String(Date.now()))
        }
      } catch {
        // ignore — exit below still triggers the supervisor's respawn + refresh
      }
      process.exit(EXIT_TOKEN_REJECTED)
    }
    return res
  }

  async function json(path, init) {
    const res = await call(path, init)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      const detail = body?.detail ?? body?.title ?? JSON.stringify(body).slice(0, 300)
      throw new Error(`X API ${res.status}: ${detail}`)
    }
    return body
  }

  return { json, call, configured: Boolean(accessToken) }
}
