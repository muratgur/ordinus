import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import { getConnectorManifest, hasConnectorManifest } from './registry'
import { refreshCredential } from './oauth-broker'
import { hasCredential, readCredential } from './vault'
import type { MaterializedConnectors } from './types'

const REFRESH_SKEW_MS = 60_000

export type UsableConnector = {
  id: string
  mcpUrl: string
  accessToken: string
}

/**
 * Resolves the connectors that are actually usable this turn: known, mcp-http,
 * connected, with a valid (refreshed if needed) token. An agent's connector
 * list is an allowlist decoupled from credential state, so unusable entries are
 * skipped rather than failing the whole turn.
 */
export async function collectUsableConnectors(connectorIds: string[]): Promise<UsableConnector[]> {
  const usable: UsableConnector[] = []
  for (const connectorId of connectorIds) {
    if (!hasConnectorManifest(connectorId)) {
      continue
    }
    const manifest = getConnectorManifest(connectorId)
    if (manifest.transport !== 'mcp-http' || !manifest.mcpUrl) {
      continue
    }
    if (!hasCredential(connectorId)) {
      continue
    }
    usable.push({
      id: manifest.id,
      mcpUrl: manifest.mcpUrl,
      accessToken: await resolveAccessToken(connectorId)
    })
  }
  return usable
}

const envVarName = (connectorId: string): string =>
  `ORDINUS_MCP_${connectorId.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`

/**
 * Codex consumes streamable-HTTP MCP servers via `-c mcp_servers.*` overrides
 * and a bearer token read from an environment variable (keeps the token out of
 * argv). No temp file, so cleanup is a no-op.
 */
export async function materializeCodexConnectors(connectorIds: string[]): Promise<{
  configArgs: string[]
  env: Record<string, string>
}> {
  const usable = await collectUsableConnectors(connectorIds)
  const configArgs: string[] = []
  const env: Record<string, string> = {}
  for (const connector of usable) {
    const tokenEnv = envVarName(connector.id)
    env[tokenEnv] = connector.accessToken
    configArgs.push(
      '-c',
      `mcp_servers.${connector.id}.url=${JSON.stringify(connector.mcpUrl)}`,
      '-c',
      `mcp_servers.${connector.id}.bearer_token_env_var=${JSON.stringify(tokenEnv)}`
    )
  }
  return { configArgs, env }
}

/**
 * Gemini reads MCP servers only from settings.json under GEMINI_CLI_HOME, which
 * is shared. To keep per-agent scoping (and stay safe under concurrent turns)
 * this builds a turn-private home: auth files are symlinked back to the real
 * home, and only settings.json is rewritten with this agent's connectors.
 */
export async function materializeGeminiConnectors(
  connectorIds: string[],
  sourceConfigDir: string,
  destHomeDir: string
): Promise<{ home: string | null; cleanup: () => void }> {
  const usable = await collectUsableConnectors(connectorIds)
  if (usable.length === 0) {
    return { home: null, cleanup: () => {} }
  }

  const destConfigDir = join(destHomeDir, '.gemini')
  mkdirSync(destConfigDir, { recursive: true })

  let baseSettings: Record<string, unknown> = {}
  const sourceSettingsPath = join(sourceConfigDir, 'settings.json')
  if (existsSync(sourceConfigDir)) {
    for (const entry of readdirSync(sourceConfigDir)) {
      if (entry === 'settings.json') {
        continue
      }
      try {
        symlinkSync(join(sourceConfigDir, entry), join(destConfigDir, entry))
      } catch {
        // Best-effort: a stale link from a reused dir is fine.
      }
    }
    if (existsSync(sourceSettingsPath)) {
      try {
        baseSettings = JSON.parse(readFileSync(sourceSettingsPath, 'utf8')) as Record<
          string,
          unknown
        >
      } catch {
        baseSettings = {}
      }
    }
  }

  const baseMcpServers =
    typeof baseSettings.mcpServers === 'object' && baseSettings.mcpServers !== null
      ? (baseSettings.mcpServers as Record<string, unknown>)
      : {}
  const mcpServers: Record<string, unknown> = { ...baseMcpServers }
  for (const connector of usable) {
    mcpServers[connector.id] = {
      httpUrl: connector.mcpUrl,
      headers: { Authorization: `Bearer ${connector.accessToken}` },
      trust: true
    }
  }

  writeFileSync(
    join(destConfigDir, 'settings.json'),
    JSON.stringify({ ...baseSettings, mcpServers }),
    { encoding: 'utf8', mode: 0o600 }
  )

  return {
    home: destHomeDir,
    cleanup: () => {
      rmSync(destHomeDir, { recursive: true, force: true })
    }
  }
}

async function resolveAccessToken(connectorId: string): Promise<string> {
  const credential = readCredential(connectorId)
  if (!credential) {
    throw new Error(`Connector ${connectorId} is not connected.`)
  }
  const expiringSoon =
    credential.expiresAt !== undefined && credential.expiresAt - Date.now() < REFRESH_SKEW_MS
  if (expiringSoon && credential.refreshToken) {
    const refreshed = await refreshCredential(connectorId, credential.refreshToken)
    return refreshed.accessToken
  }
  return credential.accessToken
}

/**
 * Builds an ephemeral, agent-scoped MCP config containing only the connectors
 * bound to this agent, with credentials injected from the vault. Nothing is
 * written to the CLI's global configuration. The caller MUST invoke cleanup()
 * once the turn ends so secrets do not linger on disk.
 */
export async function materializeConnectors(
  connectorIds: string[],
  agentHomePath: string
): Promise<MaterializedConnectors> {
  const usable = await collectUsableConnectors(connectorIds)
  if (usable.length === 0) {
    return { mcpConfigPath: null, allowedTools: [], cleanup: () => {} }
  }

  const mcpServers: Record<string, unknown> = {}
  const allowedTools: string[] = []
  for (const connector of usable) {
    mcpServers[connector.id] = {
      type: 'http',
      url: connector.mcpUrl,
      headers: { Authorization: `Bearer ${connector.accessToken}` }
    }
    // Allow every tool exposed by this MCP server so the non-interactive CLI
    // does not deny connector tool calls it cannot prompt for.
    allowedTools.push(`mcp__${connector.id}`)
  }

  const dir = join(agentHomePath, '.ordinus-connectors')
  mkdirSync(dir, { recursive: true })
  const mcpConfigPath = join(dir, 'mcp-config.json')
  writeFileSync(mcpConfigPath, JSON.stringify({ mcpServers }), { encoding: 'utf8', mode: 0o600 })

  return {
    mcpConfigPath,
    allowedTools,
    cleanup: () => {
      rmSync(dir, { recursive: true, force: true })
    }
  }
}
