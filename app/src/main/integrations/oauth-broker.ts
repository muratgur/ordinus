import { BrowserWindow, shell } from 'electron'
import { createHash, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { createServer as createNetServer } from 'node:net'
import type { AddressInfo } from 'node:net'
import { getConnectorManifest } from './registry'
import { discoverAuthServer, registerClient, type RegisteredClient } from './mcp-oauth'
import { readCredential, readRedirectPort, storeCredential, storeRedirectPort } from './vault'
import type { ByoOAuthClient, StoredCredential } from './types'

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
 * Discovers the connector's authorization server (RFC 9728 / RFC 8414),
 * registers a client dynamically (RFC 7591), then runs authorization-code +
 * PKCE in a dedicated window. Ordinus only obtains and stores the token, never
 * the data behind it.
 */
export async function authorizeConnector(connectorId: string): Promise<void> {
  const manifest = getConnectorManifest(connectorId)
  const mcpUrl = getMcpUrl(connectorId)
  const meta = await discoverAuthServer(mcpUrl)
  if (!meta.registrationEndpoint) {
    throw new Error(`${manifest.label} does not advertise a dynamic client registration endpoint.`)
  }

  const { verifier, challenge, state } = createPkceParams()
  const scopes = manifest.scopes ?? meta.scopesSupported ?? []

  const credential = await new Promise<StoredCredential>((rawResolve, rawReject) => {
    let redirectUri = ''
    let client: RegisteredClient | null = null
    let authWindow: BrowserWindow | null = null
    let settled = false
    let receivedCallback = false

    const resolve = (value: StoredCredential): void => {
      if (settled) return
      settled = true
      rawResolve(value)
    }
    const reject = (cause: Error): void => {
      if (settled) return
      settled = true
      rawReject(cause)
    }

    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '', 'http://127.0.0.1')
      if (url.pathname !== '/callback') {
        res.writeHead(404).end()
        return
      }
      receivedCallback = true
      res
        .writeHead(200, { 'content-type': 'text/html' })
        .end('<html><body>You can close this window and return to Ordinus.</body></html>')
      const code = url.searchParams.get('code')
      const returnedState = url.searchParams.get('state')
      server.close()
      if (!code || returnedState !== state || !client) {
        authWindow?.close()
        reject(new Error('OAuth authorization was cancelled or returned an invalid state.'))
        return
      }
      const activeClient = client
      void (async () => {
        try {
          const json = await postToken(meta.tokenEndpoint, {
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
            code_verifier: verifier,
            client_id: activeClient.clientId,
            ...(activeClient.clientSecret ? { client_secret: activeClient.clientSecret } : {}),
            resource: mcpUrl
          })
          resolve(
            readTokenResponse(json, {
              tokenEndpoint: meta.tokenEndpoint,
              clientId: activeClient.clientId,
              clientSecret: activeClient.clientSecret,
              resource: mcpUrl
            })
          )
        } catch (cause) {
          reject(cause instanceof Error ? cause : new Error(String(cause)))
        } finally {
          authWindow?.close()
        }
      })()
    })

    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo | null
      if (!address) {
        reject(new Error('Could not start the OAuth callback server.'))
        return
      }
      redirectUri = `http://127.0.0.1:${address.port}/callback`

      void (async () => {
        try {
          client = await registerClient(
            meta.registrationEndpoint as string,
            redirectUri,
            `Ordinus (${manifest.label})`
          )

          const authorizeUrl = new URL(meta.authorizationEndpoint)
          authorizeUrl.searchParams.set('response_type', 'code')
          authorizeUrl.searchParams.set('client_id', client.clientId)
          authorizeUrl.searchParams.set('redirect_uri', redirectUri)
          if (scopes.length > 0) {
            authorizeUrl.searchParams.set('scope', scopes.join(' '))
          }
          authorizeUrl.searchParams.set('state', state)
          authorizeUrl.searchParams.set('code_challenge', challenge)
          authorizeUrl.searchParams.set('code_challenge_method', 'S256')
          authorizeUrl.searchParams.set('resource', mcpUrl)

          authWindow = new BrowserWindow({
            width: 520,
            height: 720,
            title: `Connect ${manifest.label}`,
            webPreferences: { nodeIntegration: false, contextIsolation: true }
          })
          authWindow.on('closed', () => {
            if (receivedCallback || settled) {
              return
            }
            server.close()
            reject(new Error('OAuth window was closed before authorization completed.'))
          })
          void authWindow.loadURL(authorizeUrl.toString())
        } catch (cause) {
          server.close()
          reject(cause instanceof Error ? cause : new Error(String(cause)))
        }
      })()
    })
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
 * ADR-043: authorize a 'byo-oauth' connector against the user's own ("bring
 * your own") OAuth client — loopback + PKCE, but with a static client_id/secret
 * (no Dynamic Client Registration) and the manifest's fixed authorization/token
 * endpoints. `access_type=offline` + `prompt=consent` are required to obtain a
 * refresh token. Returns the credential; the caller persists it (so token and
 * BYO-client storage stay ordered together).
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
  const scopes = manifest.scopes ?? []
  const { verifier, challenge, state } = createPkceParams()

  // A new attempt for the same connector supersedes any in-flight one — closes
  // the prior loopback server instead of stacking listeners (e.g. the user
  // retries after abandoning a consent tab).
  pendingStaticAuth.get(connectorId)?.('A new sign-in attempt was started.')

  return new Promise<StoredCredential>((rawResolve, rawReject) => {
    let redirectUri = ''
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
    // Registered so cancelStaticClientAuth (dialog Cancel) and a superseding
    // attempt can tear this flow down without waiting for the timeout.
    const abort = (reason: string): void => reject(new Error(reason))
    pendingStaticAuth.set(connectorId, abort)

    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '', 'http://127.0.0.1')
      const code = url.searchParams.get('code')
      const returnedState = url.searchParams.get('state')
      const errorCode = url.searchParams.get('error') ?? undefined
      // Desktop clients use a bare loopback redirect, so accept any path — but
      // only the redirect carries `code`/`error`. Ignore everything else (the
      // browser also fetches /favicon.ico, which would otherwise race the
      // in-flight token exchange and reject the whole flow).
      if (!code && !errorCode) {
        res.writeHead(404).end()
        return
      }
      res
        .writeHead(200, { 'content-type': 'text/html' })
        .end('<html><body>You can close this tab and return to Ordinus.</body></html>')
      if (errorCode || !code || returnedState !== state) {
        reject(
          new Error(
            translateOAuthError(
              connectorId,
              errorCode,
              'Sign-in was cancelled or returned an invalid response.'
            )
          )
        )
        return
      }
      void (async () => {
        try {
          const json = await postToken(tokenEndpoint, {
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
            code_verifier: verifier,
            client_id: client.clientId,
            ...(client.clientSecret ? { client_secret: client.clientSecret } : {})
          })
          resolve(
            readTokenResponse(json, {
              tokenEndpoint,
              clientId: client.clientId,
              clientSecret: client.clientSecret
            })
          )
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : String(cause)
          const match = /"error"\s*:\s*"([a-z_]+)"/.exec(message)?.[1]
          reject(new Error(translateOAuthError(connectorId, match, message)))
        }
      })()
    })

    // ADR-046: a fixedRedirect connector (X) binds its locked port; if that port
    // is busy the bind fails here — surface a fixable message instead of the raw
    // EADDRINUSE. Dynamic-port connectors (Google) can't realistically collide.
    server.on('error', (cause) => {
      if (fixedPort) {
        reject(
          new Error(
            `Couldn't open the sign-in callback on port ${fixedPort} — another app may be using it. ` +
              'Close it and try again, or re-run setup to pick a new port.'
          )
        )
        return
      }
      reject(cause)
    })
    const onListening = (): void => {
      if (fixedRedirect && fixedPort) {
        redirectUri = `http://127.0.0.1:${fixedPort}${fixedRedirect.path}`
      } else {
        const address = server.address() as AddressInfo | null
        if (!address) {
          reject(new Error('Could not start the OAuth callback server.'))
          return
        }
        redirectUri = `http://127.0.0.1:${address.port}`
      }

      const authorizeUrl = new URL(authorizationEndpoint)
      authorizeUrl.searchParams.set('response_type', 'code')
      authorizeUrl.searchParams.set('client_id', client.clientId)
      authorizeUrl.searchParams.set('redirect_uri', redirectUri)
      if (scopes.length > 0) {
        authorizeUrl.searchParams.set('scope', scopes.join(' '))
      }
      authorizeUrl.searchParams.set('state', state)
      authorizeUrl.searchParams.set('code_challenge', challenge)
      authorizeUrl.searchParams.set('code_challenge_method', 'S256')
      // ADR-046: provider-specific authorize params (Google: access_type=offline
      // + prompt=consent for a refresh token; X: none — offline.access handles it).
      for (const [key, value] of Object.entries(extraAuthParams ?? {})) {
        authorizeUrl.searchParams.set(key, value)
      }

      // The system browser, NOT an embedded BrowserWindow: providers reject OAuth
      // in embedded webviews ("disallowed_useragent"). The loopback server above
      // catches the redirect. This is the flow validated in the Phase 0 PoCs.
      timer = setTimeout(
        () => reject(new Error('Sign-in timed out — the consent screen was not completed.')),
        3 * 60_000
      )
      void shell.openExternal(authorizeUrl.toString())
    }
    if (fixedRedirect && fixedPort) {
      server.listen(fixedPort, '127.0.0.1', onListening)
    } else {
      server.listen(0, '127.0.0.1', onListening)
    }
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
