/**
 * Minimal MCP-spec OAuth discovery and Dynamic Client Registration.
 *
 * Implements the subset of RFC 9728 (Protected Resource Metadata),
 * RFC 8414 (Authorization Server Metadata) and RFC 7591 (Dynamic Client
 * Registration) that the MCP authorization spec requires, so connectors do not
 * need a manually created OAuth client.
 */

export type AuthServerMetadata = {
  issuer: string
  authorizationEndpoint: string
  tokenEndpoint: string
  registrationEndpoint?: string
  scopesSupported?: string[]
}

export type RegisteredClient = {
  clientId: string
  clientSecret?: string
}

async function fetchJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(url, { headers: { accept: 'application/json' } })
    if (!response.ok) {
      return null
    }
    return (await response.json()) as Record<string, unknown>
  } catch {
    return null
  }
}

function parseResourceMetadataUrl(header: string | null): string | null {
  if (!header) {
    return null
  }
  const match = /resource_metadata="([^"]+)"/.exec(header)
  return match ? match[1] : null
}

/**
 * Resolves the authorization server for a remote MCP endpoint: probe the
 * endpoint for a `WWW-Authenticate` challenge, fall back to the well-known
 * protected-resource document, then read that server's metadata.
 */
export async function discoverAuthServer(mcpUrl: string): Promise<AuthServerMetadata> {
  const resource = new URL(mcpUrl)
  const origin = resource.origin

  let resourceMetadataUrl: string | null = null
  try {
    const probe = await fetch(mcpUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: '{}'
    })
    resourceMetadataUrl = parseResourceMetadataUrl(probe.headers.get('www-authenticate'))
  } catch {
    // Network probe failures fall through to the well-known location.
  }

  const prmCandidates = [
    resourceMetadataUrl,
    `${origin}/.well-known/oauth-protected-resource${resource.pathname}`,
    `${origin}/.well-known/oauth-protected-resource`
  ].filter((value): value is string => Boolean(value))

  let authServerUrl: string | null = null
  for (const candidate of prmCandidates) {
    const prm = await fetchJson(candidate)
    const servers = prm?.authorization_servers
    if (Array.isArray(servers) && typeof servers[0] === 'string') {
      authServerUrl = servers[0]
      break
    }
  }
  if (!authServerUrl) {
    // Some servers co-locate the authorization server at their own origin.
    authServerUrl = origin
  }

  const asBase = authServerUrl.replace(/\/$/, '')
  const metadata =
    (await fetchJson(`${asBase}/.well-known/oauth-authorization-server`)) ??
    (await fetchJson(`${asBase}/.well-known/openid-configuration`))

  if (!metadata) {
    throw new Error(
      `Could not discover OAuth metadata for ${mcpUrl}. The server may not support MCP authorization.`
    )
  }

  const authorizationEndpoint = metadata.authorization_endpoint
  const tokenEndpoint = metadata.token_endpoint
  if (typeof authorizationEndpoint !== 'string' || typeof tokenEndpoint !== 'string') {
    throw new Error(`Authorization server metadata for ${mcpUrl} is incomplete.`)
  }

  return {
    issuer: typeof metadata.issuer === 'string' ? metadata.issuer : asBase,
    authorizationEndpoint,
    tokenEndpoint,
    registrationEndpoint:
      typeof metadata.registration_endpoint === 'string'
        ? metadata.registration_endpoint
        : undefined,
    scopesSupported: Array.isArray(metadata.scopes_supported)
      ? (metadata.scopes_supported.filter((s) => typeof s === 'string') as string[])
      : undefined
  }
}

export async function registerClient(
  registrationEndpoint: string,
  redirectUri: string,
  clientName: string
): Promise<RegisteredClient> {
  const response = await fetch(registrationEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      client_name: clientName,
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      application_type: 'native'
    })
  })
  if (!response.ok) {
    throw new Error(
      `Dynamic client registration failed: ${response.status} ${await response.text()}`
    )
  }
  const body = (await response.json()) as Record<string, unknown>
  const clientId = body.client_id
  if (typeof clientId !== 'string') {
    throw new Error('Dynamic client registration did not return a client_id.')
  }
  return {
    clientId,
    clientSecret: typeof body.client_secret === 'string' ? body.client_secret : undefined
  }
}
