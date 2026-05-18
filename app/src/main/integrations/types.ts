export type ConnectorTransport = 'mcp-http' | 'mcp-stdio' | 'api'
export type ConnectorAuthMethod = 'oauth' | 'api-key' | 'none'

export type ConnectorManifest = {
  id: string
  label: string
  transport: ConnectorTransport
  authMethod: ConnectorAuthMethod
  /** Remote MCP endpoint for `mcp-http` connectors. */
  mcpUrl?: string
  /** Optional scopes to request; otherwise the server's advertised scopes are used. */
  scopes?: string[]
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

export type MaterializedConnectors = {
  /** Absolute path to an ephemeral MCP config file, or null when no connectors. */
  mcpConfigPath: string | null
  /** Tool-name patterns to allowlist so the non-interactive CLI can call them. */
  allowedTools: string[]
  cleanup: () => void
}
