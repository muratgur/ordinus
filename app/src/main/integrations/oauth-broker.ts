import { shell } from 'electron'
import { createHash, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { createServer as createNetServer } from 'node:net'
import type { AddressInfo } from 'node:net'
import { getConnectorManifest } from './registry'
import { discoverAuthServer, registerClient } from './mcp-oauth'
import { readCredential, readRedirectPort, storeCredential, storeRedirectPort } from './vault'
import type { ByoOAuthClient, StoredCredential } from './types'
import { focusMainWindow } from '../window'

function base64Url(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// PKCE verifier + S256 challenge + anti-forgery state, shared by both the DCR
// and the static-client (BYO) authorization-code flows.
function createPkceParams(): { verifier: string; challenge: string; state: string } {
  const verifier = base64Url(randomBytes(32))
  const challenge = base64Url(createHash('sha256').update(verifier).digest())
  const state = base64Url(randomBytes(16))
  return { verifier, challenge, state }
}

function readTokenResponse(
  json: Record<string, unknown>,
  base: Partial<StoredCredential>
): StoredCredential {
  const accessToken = json.access_token
  if (typeof accessToken !== 'string') {
    throw new Error('OAuth token response did not include an access token.')
  }
  const expiresIn = typeof json.expires_in === 'number' ? json.expires_in : undefined
  return {
    ...base,
    accessToken,
    refreshToken: typeof json.refresh_token === 'string' ? json.refresh_token : base.refreshToken,
    expiresAt: expiresIn ? Date.now() + expiresIn * 1000 : undefined
  }
}

async function postToken(
  tokenEndpoint: string,
  params: Record<string, string>
): Promise<Record<string, unknown>> {
  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params)
  })
  if (!response.ok) {
    throw new Error(`OAuth token endpoint failed: ${response.status} ${await response.text()}`)
  }
  return (await response.json()) as Record<string, unknown>
}

function getMcpUrl(connectorId: string): string {
  const manifest = getConnectorManifest(connectorId)
  if (manifest.authMethod !== 'oauth' || manifest.transport !== 'mcp-http' || !manifest.mcpUrl) {
    throw new Error(`Connector ${connectorId} does not support MCP OAuth.`)
  }
  return manifest.mcpUrl
}

/**
 * ADR-052: Discovers the connector's authorization server (RFC 9728 / RFC 8414),
 * then runs authorization-code + PKCE through the shared `runLoopbackAuth`
 * helper — the consent screen opens in the user's system default browser (not an
 * embedded window), so saved passwords and existing provider sessions are
 * available. Dynamic Client Registration (RFC 7591) happens inside
 * `acquireClient`, once the loopback redirect URI is known. Ordinus only obtains
 * and stores the token, never the data behind it.
 */
export async function authorizeConnector(connectorId: string): Promise<void> {
  const manifest = getConnectorManifest(connectorId)
  const mcpUrl = getMcpUrl(connectorId)
  const meta = await discoverAuthServer(mcpUrl)
  if (!meta.registrationEndpoint) {
    throw new Error(`${manifest.label} does not advertise a dynamic client registration endpoint.`)
  }
  const registrationEndpoint = meta.registrationEndpoint

  const credential = await runLoopbackAuth({
    connectorId,
    authorizationEndpoint: meta.authorizationEndpoint,
    tokenEndpoint: meta.tokenEndpoint,
    scopes: manifest.scopes ?? meta.scopesSupported ?? [],
    redirectPath: '/callback',
    port: 0,
    resource: mcpUrl,
    // DCR: the client is registered against the loopback redirect URI, so it
    // can only be created once the port is bound.
    acquireClient: async (redirectUri) => {
      const client = await registerClient(
        registrationEndpoint,
        redirectUri,
        `Ordinus (${manifest.label})`
      )
      return { clientId: client.clientId, clientSecret: client.clientSecret }
    },
    // DCR providers have no BYO setup wizard to surface fixes; keep messages
    // generic. (Do NOT route through translateOAuthError — its default branch is
    // Google-specific and would mislead Datadog/Linear/etc.)
    translateError: (code, fallback) =>
      code === 'access_denied'
        ? `You declined access in your browser. Retry and authorize ${manifest.label} to continue.`
        : fallback
  })

  storeCredential(connectorId, credential)
}

/**
 * ADR-043/046: translate raw OAuth error codes (from the consent callback or the
 * token response) into a fix the user can act on in the BYO wizard. Wording is
 * per-connector where it matters (the redirect/setup mechanics differ between
 * Google's Desktop client and X's exactly-registered loopback URI).
 */
function translateOAuthError(
  connectorId: string,
  code: string | undefined,
  fallback: string
): string {
  // Fixed-redirect BYO connectors (X today) fail differently from Google's
  // any-port Desktop client: the callback URL must match an exactly-registered
  // value, and the client is public (id only). Key the wording on that manifest
  // trait, not the connector id, so the next such connector inherits it.
  const manifest = getConnectorManifest(connectorId)
  if (manifest.byoOAuth?.fixedRedirect) {
    const app = `${manifest.label} app`
    switch (code) {
      case 'access_denied':
        return `You declined access in the ${manifest.label} window. Retry and authorize the app to continue.`
      case 'invalid_client':
      case 'unauthorized_client':
        return `The Client ID looks wrong — re-copy it from your ${app}’s OAuth settings and try again.`
      case 'invalid_request':
      case 'redirect_uri_mismatch':
        return `Redirect mismatch — the Callback URL registered in your ${app} must exactly match the one shown during setup (including the port). Re-run setup to see it again.`
      default:
        return fallback
    }
  }
  switch (code) {
    case 'access_denied':
      return (
        'Google denied access. Most often your account is not on the app’s Test users list — ' +
        'add yourself under Audience → Test users in the consent screen, then try again. ' +
        '(If you saw the consent screen and clicked Cancel, just retry and Allow.)'
      )
    case 'invalid_client':
    case 'unauthorized_client':
      return 'The Client ID or Client secret looks wrong — re-copy them from your OAuth client and try again.'
    case 'redirect_uri_mismatch':
      return 'Redirect mismatch — make sure the OAuth client type is "Desktop app", not "Web application".'
    case 'admin_policy_enforced':
      return 'Your Google Workspace administrator has blocked this app from being authorized.'
    case 'org_internal':
      return 'This OAuth client is restricted to its organization; use an account in that organization.'
    default:
      return fallback
  }
}

// ADR-046: candidate loopback ports for a fixedRedirect connector (X). A small,
// uncommon high-port range keeps the URL stable and easy for the user to
// sanity-check while leaving room to step over an occupied port.
const REDIRECT_PORT_RANGE = [8723, 8724, 8725, 8726, 8727, 8728, 8729, 8730]

function tryBind(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createNetServer()
    probe.once('error', () => resolve(false))
    probe.once('listening', () => probe.close(() => resolve(true)))
    probe.listen(port, '127.0.0.1')
  })
}

/**
 * ADR-046: pick a free loopback port for X's fixed redirect, persist it, and
 * return the exact callback URL the user must register in their X app. Called
 * when the connect wizard opens — before the client_id is pasted — so the user
 * can configure the app's Callback URL first. The port is locked (persisted) so
 * every later Connect/Reconnect binds the same, exactly-registered value.
 */
export async function lockRedirectPort(
  connectorId: string
): Promise<{ port: number; callbackUrl: string }> {
  const manifest = getConnectorManifest(connectorId)
  const path = manifest.byoOAuth?.fixedRedirect?.path
  if (!path) {
    throw new Error(`Connector ${connectorId} does not use a fixed redirect port.`)
  }
  // Reuse an already-locked port UNCONDITIONALLY: the user may have already
  // registered its callback URL in their X app, so it must never silently change
  // (a transient bind by another process would otherwise churn it to a port X
  // doesn't have registered → redirect_uri_mismatch at consent). If that port is
  // occupied at actual authorize time, server.listen surfaces a fixable error.
  // Only first-time setup probes the range for a free port.
  const existing = readRedirectPort(connectorId)
  if (existing) {
    return { port: existing, callbackUrl: `http://127.0.0.1:${existing}${path}` }
  }
  for (const port of REDIRECT_PORT_RANGE) {
    if (await tryBind(port)) {
      storeRedirectPort(connectorId, port)
      return { port, callbackUrl: `http://127.0.0.1:${port}${path}` }
    }
  }
  throw new Error('Could not find a free local port for sign-in. Close other apps and try again.')
}

// ADR-043: in-flight BYO authorizations, keyed by connector. The value aborts
// the flow (closes the loopback server, rejects the promise) — used to cancel
// from the UI and to supersede a stale attempt.
const pendingStaticAuth = new Map<string, (reason: string) => void>()

/** Cancel an in-flight BYO authorization (dialog Cancel). No-op if none. */
export function cancelStaticClientAuth(connectorId: string): void {
  pendingStaticAuth.get(connectorId)?.('Sign-in was cancelled.')
}

/**
 * ADR-052: configuration for one system-browser loopback authorization-code +
 * PKCE flow, shared by the DCR (`authorizeConnector`) and BYO
 * (`authorizeStaticClient`) callers. Everything downstream of "I have an
 * authorize URL and a port" lives in `runLoopbackAuth`; the callers differ only
 * in how the client is acquired (`acquireClient`) and a few provider params.
 */
interface LoopbackAuthConfig {
  connectorId: string
  authorizationEndpoint: string
  tokenEndpoint: string
  scopes: string[]
  /** Appended to the loopback redirect URI. DCR: '/callback'; BYO dynamic: ''; X: the fixed path. */
  redirectPath: string
  /** Loopback port to bind. 0 = OS-assigned (DCR, Google); fixed = X's locked port. */
  port: number
  /** RFC 8707 resource indicator — set for DCR (the MCP URL), undefined for BYO. */
  resource?: string
  /** Extra authorize-URL params (Google: access_type=offline + prompt=consent). */
  extraAuthParams?: Record<string, string>
  /** Produce the OAuth client once the redirect URI is known. DCR runs RFC 7591 here; BYO returns its static client. */
  acquireClient: (redirectUri: string) => Promise<{ clientId: string; clientSecret?: string }>
  /** Map a raw OAuth error code (or token-exchange failure) into a user-facing message. */
  translateError: (code: string | undefined, fallback: string) => string
  /** Message for a port-bind failure on a fixed port (X). Omitted for dynamic ports. */
  bindErrorMessage?: (port: number) => string
}

/**
 * ADR-052: the branded page the user's browser lands on after consent. Fully
 * self-contained (inline CSS/SVG) — the loopback server can't serve app assets,
 * and `charset=utf-8` is mandatory or the em-dash/UTF-8 text shows as mojibake.
 * Two variants: a success confirmation and a cancelled/failed notice.
 */
function renderCallbackPage(ok: boolean): string {
  const badge = ok
    ? `<div class="badge ok"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></div>`
    : `<div class="badge cancel"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></div>`
  const title = ok ? 'Connected' : 'Sign-in cancelled'
  const sub = ok
    ? 'You can close this tab and return to Ordinus.'
    : 'No problem — you can close this tab and return to Ordinus to try again.'
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Ordinus</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: #faf9f8; color: #1c1917;
  }
  .card {
    width: min(92vw, 400px); padding: 44px 36px; text-align: center;
    background: #fff; border: 1px solid #f0eeec; border-radius: 18px;
    box-shadow: 0 1px 2px rgba(0,0,0,.04), 0 16px 40px rgba(0,0,0,.07);
  }
  .badge {
    width: 60px; height: 60px; margin: 0 auto 22px; border-radius: 999px;
    display: grid; place-items: center;
  }
  .badge.ok { background: #e9683f; box-shadow: 0 6px 16px rgba(233,104,63,.35); }
  .badge.cancel { background: #f0eeec; color: #78716c; }
  h1 { margin: 0 0 8px; font-size: 21px; font-weight: 600; letter-spacing: -.012em; }
  p { margin: 0; font-size: 14px; line-height: 1.55; color: #78716c; }
  .brand {
    margin-top: 30px; font-size: 11px; font-weight: 600;
    letter-spacing: .16em; text-transform: uppercase; color: #b6b0aa;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #0c0a09; color: #f5f5f4; }
    .card { background: #1c1917; border-color: #292524; box-shadow: 0 1px 2px rgba(0,0,0,.4), 0 16px 40px rgba(0,0,0,.5); }
    .badge.cancel { background: #292524; color: #a8a29e; }
    p { color: #a8a29e; }
    .brand { color: #57534e; }
  }
</style>
</head>
<body>
  <main class="card">
    ${badge}
    <h1>${title}</h1>
    <p>${sub}</p>
    <div class="brand">Ordinus</div>
  </main>
</body>
</html>`
}

/**
 * ADR-052: run one loopback + PKCE authorization-code flow in the user's system
 * default browser, returning the credential (the caller persists it). Owns the
 * loopback server, the in-flight cancel registration (`pendingStaticAuth`), the
 * 3-minute timeout, validate-before-respond branching of the callback page, and
 * the token exchange. Generalizes the flow validated in the Phase 0 PoCs.
 */
async function runLoopbackAuth(cfg: LoopbackAuthConfig): Promise<StoredCredential> {
  const { connectorId } = cfg
  const { verifier, challenge, state } = createPkceParams()

  // A new attempt for the same connector supersedes any in-flight one — closes
  // the prior loopback server instead of stacking listeners (e.g. the user
  // retries after abandoning a consent tab).
  pendingStaticAuth.get(connectorId)?.('A new sign-in attempt was started.')

  return new Promise<StoredCredential>((rawResolve, rawReject) => {
    let redirectUri = ''
    let client: { clientId: string; clientSecret?: string } | null = null
    let settled = false
    let timer: NodeJS.Timeout | null = null

    const finish = (): void => {
      if (timer) clearTimeout(timer)
      if (pendingStaticAuth.get(connectorId) === abort) {
        pendingStaticAuth.delete(connectorId)
      }
      server.close()
    }
    const resolve = (value: StoredCredential): void => {
      if (settled) return
      settled = true
      finish()
      rawResolve(value)
    }
    const reject = (cause: Error): void => {
      if (settled) return
      settled = true
      finish()
      rawReject(cause)
    }
    // Registered so cancelStaticClientAuth (UI Cancel) and a superseding attempt
    // can tear this flow down without waiting for the timeout.
    const abort = (reason: string): void => reject(new Error(reason))
    pendingStaticAuth.set(connectorId, abort)

    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '', 'http://127.0.0.1')
      const code = url.searchParams.get('code')
      const returnedState = url.searchParams.get('state')
      const errorCode = url.searchParams.get('error') ?? undefined
      // Only the redirect carries `code`/`error`. Ignore everything else (the
      // browser also fetches /favicon.ico, which would otherwise race the
      // in-flight token exchange and reject the whole flow).
      if (!code && !errorCode) {
        res.writeHead(404).end()
        return
      }
      // ADR-052: validate BEFORE responding, then branch the page — a denial must
      // not show a "Connected" message. The success page renders only on success.
      const ok = !errorCode && !!code && returnedState === state && !!client
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(renderCallbackPage(ok))
      if (!ok) {
        reject(
          new Error(
            cfg.translateError(errorCode, 'Sign-in was cancelled or returned an invalid response.')
          )
        )
        return
      }
      // ADR-052: consent succeeded — meet the user back in Ordinus (the success
      // page just told them to return). Token exchange continues below.
      focusMainWindow()
      const activeClient = client as { clientId: string; clientSecret?: string }
      void (async () => {
        try {
          const json = await postToken(cfg.tokenEndpoint, {
            grant_type: 'authorization_code',
            code: code as string,
            redirect_uri: redirectUri,
            code_verifier: verifier,
            client_id: activeClient.clientId,
            ...(activeClient.clientSecret ? { client_secret: activeClient.clientSecret } : {}),
            ...(cfg.resource ? { resource: cfg.resource } : {})
          })
          resolve(
            readTokenResponse(json, {
              tokenEndpoint: cfg.tokenEndpoint,
              clientId: activeClient.clientId,
              clientSecret: activeClient.clientSecret,
              ...(cfg.resource ? { resource: cfg.resource } : {})
            })
          )
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : String(cause)
          const match = /"error"\s*:\s*"([a-z_]+)"/.exec(message)?.[1]
          reject(new Error(cfg.translateError(match, message)))
        }
      })()
    })

    // ADR-046: a fixed-port connector (X) binds its locked port; if that port is
    // busy the bind fails here — surface a fixable message instead of the raw
    // EADDRINUSE. Dynamic-port connectors (Google, DCR) can't realistically collide.
    server.on('error', (cause) => {
      if (cfg.port && cfg.bindErrorMessage) {
        reject(new Error(cfg.bindErrorMessage(cfg.port)))
        return
      }
      reject(cause)
    })
    const onListening = (): void => {
      if (cfg.port) {
        redirectUri = `http://127.0.0.1:${cfg.port}${cfg.redirectPath}`
      } else {
        const address = server.address() as AddressInfo | null
        if (!address) {
          reject(new Error('Could not start the OAuth callback server.'))
          return
        }
        redirectUri = `http://127.0.0.1:${address.port}${cfg.redirectPath}`
      }

      void (async () => {
        try {
          // DCR registers its client against this exact redirect URI; BYO returns
          // its static client. Either way the client is known before consent opens.
          client = await cfg.acquireClient(redirectUri)

          const authorizeUrl = new URL(cfg.authorizationEndpoint)
          authorizeUrl.searchParams.set('response_type', 'code')
          authorizeUrl.searchParams.set('client_id', client.clientId)
          authorizeUrl.searchParams.set('redirect_uri', redirectUri)
          if (cfg.scopes.length > 0) {
            authorizeUrl.searchParams.set('scope', cfg.scopes.join(' '))
          }
          authorizeUrl.searchParams.set('state', state)
          authorizeUrl.searchParams.set('code_challenge', challenge)
          authorizeUrl.searchParams.set('code_challenge_method', 'S256')
          if (cfg.resource) {
            authorizeUrl.searchParams.set('resource', cfg.resource)
          }
          // ADR-046: provider-specific authorize params (Google: access_type=offline
          // + prompt=consent for a refresh token; X: none — offline.access handles it).
          for (const [key, value] of Object.entries(cfg.extraAuthParams ?? {})) {
            authorizeUrl.searchParams.set(key, value)
          }

          // The system browser, NOT an embedded BrowserWindow (ADR-052): providers
          // reject OAuth in embedded webviews ("disallowed_useragent"), and the real
          // browser carries the user's saved passwords and provider session.
          timer = setTimeout(
            () => reject(new Error('Sign-in timed out — the consent screen was not completed.')),
            3 * 60_000
          )
          void shell.openExternal(authorizeUrl.toString())
        } catch (cause) {
          reject(cause instanceof Error ? cause : new Error(String(cause)))
        }
      })()
    }
    if (cfg.port) {
      server.listen(cfg.port, '127.0.0.1', onListening)
    } else {
      server.listen(0, '127.0.0.1', onListening)
    }
  })
}

/**
 * ADR-043/052: authorize a 'byo-oauth' connector against the user's own ("bring
 * your own") OAuth client — a thin wrapper over `runLoopbackAuth` that supplies
 * the static client_id/secret (no Dynamic Client Registration) and the
 * manifest's fixed authorization/token endpoints. `access_type=offline` +
 * `prompt=consent` (via extraAuthParams) are required to obtain a refresh token.
 * Returns the credential; the caller persists it (so token and BYO-client
 * storage stay ordered together).
 */
export async function authorizeStaticClient(
  connectorId: string,
  client: ByoOAuthClient
): Promise<StoredCredential> {
  const manifest = getConnectorManifest(connectorId)
  if (!manifest.byoOAuth) {
    throw new Error(`Connector ${connectorId} is not a BYO-OAuth connector.`)
  }
  const { authorizationEndpoint, tokenEndpoint, publicClient, fixedRedirect, extraAuthParams } =
    manifest.byoOAuth
  // ADR-046: confidential clients (Google) must carry a secret; public clients
  // (X "Native App") must not — the token endpoint then takes only the client_id.
  if (!publicClient && !client.clientSecret) {
    throw new Error(`Connector ${connectorId} requires a client secret.`)
  }
  // ADR-046: a fixedRedirect connector binds the port locked at setup. Without
  // it the user never registered a matching Callback URL, so fail with a fixable
  // message rather than binding a random port X would reject.
  const fixedPort = fixedRedirect ? readRedirectPort(connectorId) : null
  if (fixedRedirect && !fixedPort) {
    throw new Error('Sign-in setup is incomplete — re-run setup so the callback URL can be locked.')
  }

  return runLoopbackAuth({
    connectorId,
    authorizationEndpoint,
    tokenEndpoint,
    scopes: manifest.scopes ?? [],
    redirectPath: fixedRedirect?.path ?? '',
    port: fixedPort ?? 0,
    extraAuthParams,
    acquireClient: async () => ({ clientId: client.clientId, clientSecret: client.clientSecret }),
    translateError: (code, fallback) => translateOAuthError(connectorId, code, fallback),
    bindErrorMessage: (port) =>
      `Couldn't open the sign-in callback on port ${port} — another app may be using it. ` +
      'Close it and try again, or re-run setup to pick a new port.'
  })
}

export async function refreshCredential(
  connectorId: string,
  refreshToken: string
): Promise<StoredCredential> {
  const existing = readCredential(connectorId)
  if (!existing?.tokenEndpoint || !existing.clientId) {
    throw new Error(`Connector ${connectorId} is missing refresh metadata; reconnect it.`)
  }
  const json = await postToken(existing.tokenEndpoint, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: existing.clientId,
    ...(existing.clientSecret ? { client_secret: existing.clientSecret } : {}),
    ...(existing.resource ? { resource: existing.resource } : {})
  })
  const merged = readTokenResponse(json, { ...existing, refreshToken })
  // ADR-046: for a rotating (single-use) refresh token — refreshAuthority:'main'
  // (X) — the token we just sent is now consumed. If the response carried no
  // fresh refresh_token, readTokenResponse fell back to that consumed value;
  // persisting it would guarantee the next refresh fails. Treat it as a broken
  // chain so the caller surfaces "Reconnect required" instead. (Google's
  // refresh token is stable and legitimately omitted from refresh responses, so
  // this only applies to main-refresh connectors.)
  const manifest = getConnectorManifest(connectorId)
  if (manifest.local?.refreshAuthority === 'main' && merged.refreshToken === refreshToken) {
    throw new Error(
      `${connectorId}: token refresh did not return a new refresh token; the session must be reconnected.`
    )
  }
  storeCredential(connectorId, merged)
  return merged
}
