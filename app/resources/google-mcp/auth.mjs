// ADR-043: token holder for the Google MCP server. Every request is bearer-
// authenticated with the current access token; on a 401 the access token is
// refreshed once (Google access tokens last ~1h) and the request retried. The
// refresh token is long-lived and not rotated by Google's Desktop clients, so
// nothing is written back to the main process — a cold start just re-injects
// the vault token and refreshes on the first 401.
//
// The one terminal case is `invalid_grant` on refresh: the weekly Testing-mode
// expiry, or the user revoking access. We drop a `logged-out` marker in the
// session dir and exit 41 — the supervisor maps that to "Reconnect required"
// (the same ADR-042 mechanism WhatsApp uses), keeping data and surfacing a
// one-click reconnect.

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const EXIT_LOGGED_OUT = 41
const LOGGED_OUT_MARKER = 'logged-out'

export function createAuth(config) {
  const { sessionDir, clientId, clientSecret, refreshToken } = config
  const tokenUri = config.tokenUri || 'https://oauth2.googleapis.com/token'
  let accessToken = config.accessToken

  async function refresh() {
    const res = await fetch(tokenUri, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret
      })
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      if (json.error === 'invalid_grant') {
        // Revoked or weekly-expired. Marker → supervisor "Reconnect required".
        if (sessionDir) {
          writeFileSync(join(sessionDir, LOGGED_OUT_MARKER), String(Date.now()))
        }
        process.exit(EXIT_LOGGED_OUT)
      }
      throw new Error(`Token refresh failed: ${res.status} ${JSON.stringify(json)}`)
    }
    accessToken = json.access_token
    return accessToken
  }

  async function call(url, init = {}, retry = true) {
    if (!accessToken && refreshToken) {
      await refresh()
    }
    const res = await fetch(url, {
      ...init,
      headers: { ...(init.headers || {}), Authorization: `Bearer ${accessToken}` }
    })
    if (res.status === 401 && retry && refreshToken) {
      await refresh()
      return call(url, init, false)
    }
    return res
  }

  async function json(url, init) {
    const res = await call(url, init)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      const detail = body?.error?.message ?? JSON.stringify(body).slice(0, 300)
      throw new Error(`Google API ${res.status}: ${detail}`)
    }
    return body
  }

  async function text(url, init) {
    const res = await call(url, init)
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Google API ${res.status}: ${body.slice(0, 300)}`)
    }
    return res.text()
  }

  function postJson(url, payload) {
    return json(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    })
  }

  return { json, text, postJson, call, configured: Boolean(accessToken || refreshToken) }
}
