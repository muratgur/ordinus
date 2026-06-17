import { existsSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type {
  ConnectorSummary,
  ConnectorToolsResult,
  ConnectorSetEnabledToolsInput,
  ConnectorPairingEvent
} from '@shared/contracts'
import type { ByoOAuthClient } from './types'
import { getConnectorManifest, listConnectorManifests } from './registry'
import {
  authorizeConnector,
  authorizeStaticClient,
  cancelStaticClientAuth,
  lockRedirectPort,
  refreshCredential
} from './oauth-broker'
import {
  deleteByoClient,
  deleteCredential,
  deleteRedirectPort,
  hasByoClient,
  hasCredential,
  readByoClient,
  readCredential,
  storeByoClient,
  storeCredential
} from './vault'
import type { OrdinusDatabase } from '../db/database'
import {
  type DiscoveredTool,
  discoverConnectorTools,
  ensureLocalConnectorRunning,
  initLocalMcpSupervisor,
  revokeLocalConnector,
  runInteractiveLogin,
  runPairingLogin
} from '../local-mcp/supervisor'
import { installedVersionOf } from '../local-mcp/runtime-bootstrap'
import { getConnectorSessionDir } from '../local-mcp/paths'
import { LOGGED_OUT_MARKER, TOKEN_REJECTED_MARKER } from '../local-mcp/protocol'

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
    },
    getSecretEnv: (connectorId) => secretEnvFor(connectorId),
    ensureFreshToken: (connectorId) => ensureFreshTokenFor(connectorId)
  })
}

/**
 * ADR-046: pre-spawn token refresh for refreshAuthority:'main' connectors (X).
 * X rotates refresh tokens on every use, so the main process owns refresh and
 * writes the rotated token back to the vault (refreshCredential does the
 * write-back). Refresh only when the access token is missing or within a margin
 * of expiry, so each spawn does not needlessly burn a rotation. A TERMINAL
 * failure (revoked / consumed rotation chain / 4xx) marks "Reconnect required"
 * like the child's logged-out path; a TRANSIENT failure (offline / 5xx) is
 * rethrown WITHOUT bricking the connector, so the next spawn retries and a
 * network blip self-heals (the logged-out gate runs before this hook, so a
 * marker written on a transient error would otherwise be unrecoverable).
 */
const REFRESH_MARGIN_MS = 5 * 60_000

async function ensureFreshTokenFor(connectorId: string): Promise<void> {
  const manifest = getConnectorManifest(connectorId)
  if (manifest.local?.refreshAuthority !== 'main') {
    return
  }
  const credential = readCredential(connectorId)
  if (!credential?.refreshToken) {
    return
  }
  const sessionDir = getConnectorSessionDir(connectorId)
  // A prior child reported a 401 (TOKEN_REJECTED_MARKER): the token was rejected
  // even though it may still look unexpired locally (e.g. a server-side revoke).
  // Force a refresh regardless of the expiry margin so we can't loop respawning
  // with the same rejected token.
  const forced = existsSync(join(sessionDir, TOKEN_REJECTED_MARKER))
  if (
    !forced &&
    credential.accessToken &&
    credential.expiresAt &&
    credential.expiresAt - Date.now() > REFRESH_MARGIN_MS
  ) {
    return
  }
  try {
    await refreshCredential(connectorId, credential.refreshToken)
    // Recovered — clear the rejection signal so the next spawn isn't forced.
    rmSync(join(sessionDir, TOKEN_REJECTED_MARKER), { force: true })
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    // Only a genuine auth rejection is terminal (revoked, consumed rotation
    // chain, or a 4xx from the token endpoint). Escalate THOSE to the logged-out
    // marker so the supervisor refuses to boot and the badge flips. A transient
    // failure (offline, 5xx) must NOT write the marker — the logged-out gate runs
    // before this hook, so a marker here would brick a still-valid session until
    // a manual reconnect; leaving it lets the next spawn retry and self-heal.
    const terminal =
      /invalid_grant|invalid_request|invalid_token|unauthorized_client|did not return a new refresh token|missing refresh metadata/i.test(
        message
      ) || /failed:\s*4\d\d/.test(message)
    if (terminal) {
      writeFileSync(join(sessionDir, LOGGED_OUT_MARKER), String(Date.now()))
      if (database?.getLocalConnectorState(connectorId)) {
        requireDb().upsertLocalConnectorState(connectorId, { lastHealth: 'reconnect-required' })
      }
    }
    throw cause
  }
}

/**
 * ADR-043: build the secret env injected into a connector's child at spawn.
 * For byo-oauth connectors (Google) this hands the server the OAuth token and
 * the client it self-refreshes with — read fresh from the vault each spawn, so
 * the child never reaches back into the main process. Empty for everything
 * else (the env merge is then a no-op).
 */
function secretEnvFor(connectorId: string): Record<string, string> {
  const manifest = getConnectorManifest(connectorId)
  if (manifest.local?.loginMode !== 'byo-oauth') {
    return {}
  }
  const credential = readCredential(connectorId)
  if (!credential) {
    return {}
  }
  // ADR-046: X's refresh authority is the main process — the child is stateless
  // and receives only a short-lived access token (no refresh token, no client).
  // The supervisor's ensureFreshToken hook (ensureFreshTokenFor) runs in
  // resolveChildLaunch BEFORE this, so credential.accessToken here is current
  // and the rotated refresh token has already been written back to the vault.
  // Guard the token: an empty one would spawn a child that just 401-loops —
  // return {} so the connector is visibly unusable instead.
  if (manifest.local.refreshAuthority === 'main') {
    return credential.accessToken ? { ORDINUS_X_ACCESS_TOKEN: credential.accessToken } : {}
  }
  // Google: confidential child self-refreshes, so it gets the token + the client.
  // (Read the BYO client only here — the X branch above never needs it.)
  const client = readByoClient(connectorId)
  if (!client || !credential.refreshToken || !client.clientSecret) {
    return {}
  }
  return {
    ORDINUS_GOOGLE_ACCESS_TOKEN: credential.accessToken,
    ORDINUS_GOOGLE_REFRESH_TOKEN: credential.refreshToken,
    ORDINUS_GOOGLE_CLIENT_ID: client.clientId,
    ORDINUS_GOOGLE_CLIENT_SECRET: client.clientSecret,
    ORDINUS_GOOGLE_TOKEN_URI: credential.tokenEndpoint ?? 'https://oauth2.googleapis.com/token'
  }
}

/**
 * ADR-042: persistent connectors (live-message ingesters like WhatsApp) start
 * with the app instead of waiting for first traffic, so the local store keeps
 * filling while the user works. Fire-and-forget per connector; failures land
 * in the supervisor's health machinery, not the boot path.
 */
export function startPersistentConnectors(): void {
  for (const manifest of listConnectorManifests()) {
    if (manifest.local?.lifecycle === 'persistent' && isLocalConnectorConnected(manifest.id)) {
      ensureLocalConnectorRunning(manifest.id)
        // The server is up anyway — refresh the persisted tool catalog so app
        // releases that add tools (the pin and the server ship together)
        // surface them without a manual reconnect.
        .then(() => discoverConnectorTools(manifest.id))
        .then((tools) => persistDiscoveredCatalog(manifest.id, tools))
        .catch((err: unknown) => {
          console.error(`[connectors] ${manifest.id} failed to start at boot:`, err)
        })
    }
  }
}

/**
 * Persist a freshly discovered catalog. Existing user tool choices are kept;
 * tools NEW to the catalog follow the manifest defaults — the curated
 * safe-list ships with the same app release that added the tools, so this is
 * the intended default, not an escalation (new tools outside the manifest
 * list stay disabled, per ADR-041).
 */
function persistDiscoveredCatalog(connectorId: string, tools: DiscoveredTool[]): void {
  const manifest = getConnectorManifest(connectorId)
  const existing = requireDb().getLocalConnectorState(connectorId)
  const defaults = new Set(manifest.local?.defaultEnabledTools ?? [])
  const toolNames = tools.map((tool) => tool.name)

  let enabledTools: string[]
  if (existing) {
    const currentNames = new Set(toolNames)
    const previouslyKnown = new Set(existing.toolCatalog.map((tool) => tool.name))
    const keptChoices = existing.enabledTools.filter((name) => currentNames.has(name))
    const newDefaultTools = toolNames.filter(
      (name) => defaults.has(name) && !previouslyKnown.has(name)
    )
    enabledTools = [...new Set([...keptChoices, ...newDefaultTools])]
  } else {
    enabledTools = toolNames.filter((name) => defaults.has(name))
  }

  requireDb().upsertLocalConnectorState(connectorId, {
    installedVersion: installedVersionOf(manifest),
    toolCatalog: tools,
    enabledTools,
    lastHealth: 'ok'
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
        health:
          state?.lastHealth === 'unhealthy' || state?.lastHealth === 'reconnect-required'
            ? state.lastHealth
            : ('ok' as const),
        installedVersion: state?.installedVersion ?? null,
        interactiveLogin: manifest.local?.loginMode === 'interactive',
        pairingLogin: manifest.local?.loginMode === 'pairing',
        // ADR-043: byoOAuthLogin tells the UI to use the BYO setup wizard;
        // byoClientConfigured lets it skip the paste step on reconnect.
        byoOAuthLogin: manifest.local?.loginMode === 'byo-oauth',
        byoClientConfigured: manifest.local?.loginMode === 'byo-oauth' && hasByoClient(manifest.id),
        byoFixedRedirect: manifest.byoOAuth?.fixedRedirect != null
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
      interactiveLogin: false,
      pairingLogin: false,
      byoOAuthLogin: false,
      byoClientConfigured: false,
      byoFixedRedirect: false
    }
  })
}

export async function connectConnector(
  connectorId: string,
  options?: {
    phone?: string
    oauthClient?: ByoOAuthClient
    onPairingEvent?: (event: ConnectorPairingEvent) => void
  }
): Promise<ConnectorSummary[]> {
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
    if (manifest.local?.loginMode === 'pairing') {
      // ADR-042: the login child emits the device-linking code; forward it to
      // the renderer dialog. Also the re-pair path after "Reconnect required".
      const phone = options?.phone
      if (!phone) {
        throw new Error('A phone number is required to pair this connector.')
      }
      await runPairingLogin(connectorId, phone, (event) => {
        options?.onPairingEvent?.({ connectorId, ...event })
      })
    }
    if (manifest.local?.loginMode === 'byo-oauth') {
      // ADR-043: first-time setup supplies the OAuth client; reconnect reuses
      // the stored one (no wizard redo). authorizeStaticClient runs the
      // main-process loopback/PKCE consent and returns the token; persist both.
      const client = options?.oauthClient ?? readByoClient(connectorId)
      if (!client) {
        throw new Error(
          `${manifest.label} setup is incomplete — provide your OAuth client to connect.`
        )
      }
      if (options?.oauthClient) {
        storeByoClient(connectorId, options.oauthClient)
      }
      const credential = await authorizeStaticClient(connectorId, client)
      // Without a refresh token the connector is silently dead once the access
      // token expires (and, for X, the main process can never refresh). Fail
      // loudly rather than persist a credential that spawns an unusable server.
      if (!credential.refreshToken) {
        throw new Error(
          `${manifest.label} did not return a refresh token. Re-run setup and grant access when prompted (the app must request offline access).`
        )
      }
      storeCredential(connectorId, credential)
      // A successful (re)auth supersedes any prior "Reconnect required" state.
      rmSync(join(getConnectorSessionDir(connectorId), LOGGED_OUT_MARKER), { force: true })
    }
    const tools = await discoverConnectorTools(connectorId)
    persistDiscoveredCatalog(connectorId, tools)
    // A reconnected persistent connector should resume ingesting immediately.
    if (manifest.local?.lifecycle === 'persistent') {
      ensureLocalConnectorRunning(connectorId).catch((err: unknown) => {
        console.error(`[connectors] ${connectorId} failed to start after connect:`, err)
      })
    }
    return listConnectors()
  }
  await authorizeConnector(connectorId)
  return listConnectors()
}

/**
 * ADR-043/052: cancel an in-flight Connect. For any OAuth connector — BYO (local)
 * or DCR (remote) — this aborts the loopback flow (the user backed out of the
 * browser consent) so it doesn't linger until the 3-minute timeout. No-op for
 * pairing/interactive connectors, which register no loopback.
 */
export function cancelConnect(connectorId: string): void {
  cancelStaticClientAuth(connectorId)
}

export async function disconnectConnector(connectorId: string): Promise<ConnectorSummary[]> {
  const manifest = getConnectorManifest(connectorId)
  if (manifest.kind === 'local') {
    // Disconnect = logout: stop the process, revoke the proxy token (live
    // agent sessions lose access immediately), and delete session/profile
    // data. Installed runtime + package stay so reconnecting is cheap.
    await revokeLocalConnector(connectorId)
    rmSync(getConnectorSessionDir(connectorId), { recursive: true, force: true })
    // ADR-043: byo-oauth connectors also keep OAuth tokens in the vault — wipe
    // them on Disconnect. The BYO client is intentionally kept so reconnect is
    // one click; "Remove setup" (forgetConnectorClient) clears that.
    if (manifest.local?.loginMode === 'byo-oauth') {
      deleteCredential(connectorId)
    }
    requireDb().deleteLocalConnectorState(connectorId)
    return listConnectors()
  }
  deleteCredential(connectorId)
  return listConnectors()
}

/**
 * ADR-043: forget a BYO-OAuth connector's stored OAuth client entirely (the
 * "Remove setup" action). Fully tears down first if connected, then drops the
 * client so the next Connect starts the wizard from scratch.
 */
export async function forgetConnectorClient(connectorId: string): Promise<ConnectorSummary[]> {
  const manifest = getConnectorManifest(connectorId)
  if (manifest.local?.loginMode !== 'byo-oauth') {
    throw new Error(`Connector ${connectorId} has no stored OAuth client.`)
  }
  if (isLocalConnectorConnected(connectorId)) {
    await disconnectConnector(connectorId)
  }
  deleteByoClient(connectorId)
  // ADR-046: a fixedRedirect connector's locked port is part of its setup —
  // clear it too so the next Connect re-locks (and the user re-registers) fresh.
  deleteRedirectPort(connectorId)
  return listConnectors()
}

/**
 * ADR-046: lock the loopback redirect port for a fixedRedirect connector (X)
 * when the connect wizard opens, returning the exact callback URL the user must
 * register in their app before pasting the client_id.
 */
export function lockConnectorRedirectPort(
  connectorId: string
): Promise<{ port: number; callbackUrl: string }> {
  return lockRedirectPort(connectorId)
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
