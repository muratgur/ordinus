import { rmSync } from 'node:fs'
import type {
  ConnectorSummary,
  ConnectorToolsResult,
  ConnectorSetEnabledToolsInput
} from '@shared/contracts'
import { getConnectorManifest, listConnectorManifests } from './registry'
import { authorizeConnector } from './oauth-broker'
import { deleteCredential, hasCredential } from './vault'
import type { OrdinusDatabase } from '../db/database'
import {
  discoverConnectorTools,
  initLocalMcpSupervisor,
  revokeLocalConnector,
  runInteractiveLogin
} from '../local-mcp/supervisor'
import { installedVersionOf } from '../local-mcp/runtime-bootstrap'
import { getConnectorSessionDir } from '../local-mcp/paths'

// ADR-041: the connector service needs durable local-connector state. The
// database instance is injected once at boot (see main/index.ts); the
// supervisor receives a narrow accessor so it has no db dependency.
let database: OrdinusDatabase | null = null

export function initConnectorService(db: OrdinusDatabase): void {
  database = db
  initLocalMcpSupervisor({
    getEnabledTools: (connectorId) => db.getLocalConnectorState(connectorId)?.enabledTools ?? [],
    setHealth: (connectorId, health) => {
      if (db.getLocalConnectorState(connectorId)) {
        db.upsertLocalConnectorState(connectorId, { lastHealth: health })
      }
    }
  })
}

/** Used by materialization to decide whether a local connector is usable. */
export function isLocalConnectorConnected(connectorId: string): boolean {
  return database?.getLocalConnectorState(connectorId) != null
}

function requireDb(): OrdinusDatabase {
  if (!database) {
    throw new Error('Connector service used before initConnectorService().')
  }
  return database
}

export function listConnectors(): ConnectorSummary[] {
  return listConnectorManifests().map((manifest) => {
    if (manifest.kind === 'local') {
      const state = requireDb().getLocalConnectorState(manifest.id)
      return {
        id: manifest.id,
        label: manifest.label,
        transport: manifest.transport,
        authMethod: manifest.authMethod,
        kind: 'local' as const,
        // ADR-041: connected stays derived — the state row is only written
        // after install (+ interactive login, when required) succeeded, so
        // its presence means "agents can use this now".
        connected: state !== null,
        health: state?.lastHealth === 'unhealthy' ? ('unhealthy' as const) : ('ok' as const),
        installedVersion: state?.installedVersion ?? null,
        interactiveLogin: manifest.local?.loginMode === 'interactive'
      }
    }
    return {
      id: manifest.id,
      label: manifest.label,
      transport: manifest.transport,
      authMethod: manifest.authMethod,
      kind: 'remote' as const,
      connected: hasCredential(manifest.id),
      health: 'ok' as const,
      installedVersion: null,
      interactiveLogin: false
    }
  })
}

export async function connectConnector(connectorId: string): Promise<ConnectorSummary[]> {
  const manifest = getConnectorManifest(connectorId)
  if (manifest.kind === 'local') {
    // Connect = install + login + discovery. Install happens lazily inside
    // the supervisor (both calls below resolve it); for interactive-login
    // servers the user signs in via the window the server opens (ADR-041:
    // login at Connect time, never mid-turn). State is only persisted after
    // every step succeeded, so a cancelled login leaves the connector
    // cleanly "Not connected".
    if (manifest.local?.loginMode === 'interactive') {
      await runInteractiveLogin(connectorId)
    }
    const tools = await discoverConnectorTools(connectorId)
    const defaults = new Set(manifest.local?.defaultEnabledTools ?? [])
    requireDb().upsertLocalConnectorState(connectorId, {
      installedVersion: installedVersionOf(manifest),
      toolCatalog: tools,
      // Safe defaults: only manifest-listed tools start enabled; everything
      // else (including future upgrade-added tools) is born disabled.
      enabledTools: tools.map((t) => t.name).filter((name) => defaults.has(name)),
      lastHealth: 'ok'
    })
    return listConnectors()
  }
  await authorizeConnector(connectorId)
  return listConnectors()
}

export async function disconnectConnector(connectorId: string): Promise<ConnectorSummary[]> {
  const manifest = getConnectorManifest(connectorId)
  if (manifest.kind === 'local') {
    // Disconnect = logout: stop the process, revoke the proxy token (live
    // agent sessions lose access immediately), and delete session/profile
    // data. Installed runtime + package stay so reconnecting is cheap.
    await revokeLocalConnector(connectorId)
    rmSync(getConnectorSessionDir(connectorId), { recursive: true, force: true })
    requireDb().deleteLocalConnectorState(connectorId)
    return listConnectors()
  }
  deleteCredential(connectorId)
  return listConnectors()
}

export function listConnectorTools(connectorId: string): ConnectorToolsResult {
  const manifest = getConnectorManifest(connectorId)
  if (manifest.kind !== 'local') {
    return { connectorId, tools: [] }
  }
  const state = requireDb().getLocalConnectorState(connectorId)
  const enabled = new Set(state?.enabledTools ?? [])
  return {
    connectorId,
    tools: (state?.toolCatalog ?? []).map((tool) => ({
      name: tool.name,
      description: tool.description,
      enabled: enabled.has(tool.name)
    }))
  }
}

export function setConnectorEnabledTools(
  input: ConnectorSetEnabledToolsInput
): ConnectorToolsResult {
  const manifest = getConnectorManifest(input.connectorId)
  if (manifest.kind !== 'local') {
    throw new Error(`Connector ${input.connectorId} has no tool-level permissions.`)
  }
  const state = requireDb().getLocalConnectorState(input.connectorId)
  if (!state) {
    throw new Error(`Connector ${input.connectorId} is not connected.`)
  }
  // Only names present in the discovered catalog can be enabled.
  const known = new Set(state.toolCatalog.map((tool) => tool.name))
  requireDb().upsertLocalConnectorState(input.connectorId, {
    enabledTools: input.enabledTools.filter((name) => known.has(name))
  })
  return listConnectorTools(input.connectorId)
}
