export type ConnectorTransport = 'mcp-http' | 'mcp-stdio' | 'api'
export type ConnectorAuthMethod = 'oauth' | 'api-key' | 'none'

// ADR-041: which runtime the supervisor must bootstrap to run a local server.
//   - 'uv': single-binary uv downloaded into app-data; package installed via
//     `uv tool install` with all caches/data redirected under app-data.
//   - 'electron-node': the app's own binary re-run as Node
//     (ELECTRON_RUN_AS_NODE=1). Used by the dev-only fixture; needs no
//     download at all.
export type LocalConnectorRuntime = 'uv' | 'electron-node'

// ADR-041: how a session is established at Connect time. 'none' means the
// server needs no login (connected == installed). 'interactive' is for
// servers like LinkedIn that open their own login window. 'pairing'
// (ADR-042) is for servers like WhatsApp that emit a device-linking code the
// Ordinus UI must display: the login child prints line-delimited JSON events
// on stdout and exits 0 once paired. 'byo-oauth' (ADR-043) is for servers like
// Google whose login is a main-process OAuth flow against the user's own
// ("bring your own") OAuth client — Connect runs the forked loopback/PKCE
// broker (see byoOAuth), not a login child.
export type LocalConnectorLoginMode = 'none' | 'interactive' | 'pairing' | 'byo-oauth'

// ADR-043: static OAuth endpoints for a 'byo-oauth' connector. The client is
// user-supplied (no Dynamic Client Registration), so the authorization/token
// endpoints cannot be discovered — they live in the manifest. Scopes come from
// the manifest's `scopes`.
export type ByoOAuthConfig = {
  authorizationEndpoint: string
  tokenEndpoint: string
}

export type LocalConnectorSpec = {
  runtime: LocalConnectorRuntime
  /**
   * Package spec with pinned version for 'uv' (e.g. "linkedin-mcp-server==1.4.1").
   * For 'electron-node', a path relative to the app resources dir pointing at
   * the script to run. The pin lives here so connector upgrades ride app
   * releases (ADR-041 versioning).
   */
  package: string
  /** Extra argv after the resolved executable/script. */
  args?: string[]
  /**
   * Argv that points the server's sensitive session/profile state at the
   * per-connector session dir (deleted on Disconnect). `${sessionDir}` is
   * substituted by the supervisor. Servers whose HOME-side caches must
   * survive Disconnect (e.g. LinkedIn's downloaded Chromium) use this to
   * separate the deletable session from the persistent home.
   */
  sessionDirArgs?: string[]
  /** True when the server can serve streamable-http itself (still proxied). */
  nativeHttp?: boolean
  /** Heavy servers (e.g. Chromium-carrying) get an idle shutdown timer. */
  heavy?: boolean
  /**
   * ADR-042: 'persistent' servers are also ingesters (e.g. WhatsApp's live
   * message stream) — they start when the app boots (if connected), are
   * never idle-reaped, and are restarted after unexpected exits.
   */
  lifecycle?: 'persistent'
  loginMode: LocalConnectorLoginMode
  /**
   * Safe-default tool allowlist. Tools outside this list — including tools
   * added by a server upgrade — are born disabled until the user enables
   * them in Settings (ADR-041 permissions).
   */
  defaultEnabledTools: string[]
}

export type ConnectorManifest = {
  id: string
  label: string
  transport: ConnectorTransport
  authMethod: ConnectorAuthMethod
  /** ADR-041: 'remote' = vault-backed mcp-http; 'local' = supervisor-run. */
  kind: 'remote' | 'local'
  /** Remote MCP endpoint for `mcp-http` connectors. */
  mcpUrl?: string
  /** Optional scopes to request; otherwise the server's advertised scopes are used. */
  scopes?: string[]
  /** Present iff kind === 'local'. */
  local?: LocalConnectorSpec
  /** ADR-043: present iff local.loginMode === 'byo-oauth'. */
  byoOAuth?: ByoOAuthConfig
}

export type StoredCredential = {
  accessToken: string
  refreshToken?: string
  /** Epoch milliseconds. Absent means non-expiring. */
  expiresAt?: number
  /** Metadata captured at authorization time so refresh needs no rediscovery. */
  tokenEndpoint?: string
  clientId?: string
  clientSecret?: string
  resource?: string
}

// ADR-043: the user-supplied OAuth client for a 'byo-oauth' connector. Stored
// separately from the token (StoredCredential) so Disconnect can wipe tokens
// while keeping the client — reconnect is then one click, not a wizard redo.
// Cleared only by the explicit "Remove setup" action.
export type ByoOAuthClient = {
  clientId: string
  clientSecret: string
}

export type MaterializedConnectors = {
  /** Absolute path to an ephemeral MCP config file, or null when no connectors. */
  mcpConfigPath: string | null
  /** Tool-name patterns to allowlist so the non-interactive CLI can call them. */
  allowedTools: string[]
  cleanup: () => void
}
