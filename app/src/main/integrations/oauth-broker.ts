import { BrowserWindow } from 'electron'
import { createHash, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { getConnectorManifest } from './registry'
import { discoverAuthServer, registerClient, type RegisteredClient } from './mcp-oauth'
import { readCredential, storeCredential } from './vault'
import type { StoredCredential } from './types'

function base64Url(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
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

  const verifier = base64Url(randomBytes(32))
  const challenge = base64Url(createHash('sha256').update(verifier).digest())
  const state = base64Url(randomBytes(16))
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
  storeCredential(connectorId, merged)
  return merged
}
