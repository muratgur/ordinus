// ADR-041: managed local MCP servers — supervisor, stdio bridge, loopback proxy.
//
// One shared loopback HTTP listener fronts every local connector at a
// token-gated path (`/local/<connectorId>/<token>`, ADR-037 stance: localhost
// alone is not a boundary once worker CLIs learn addresses). Behind it, the
// supervisor owns each server's child process and talks to it through a
// persistent MCP SDK client over stdio. Each incoming HTTP request gets a
// fresh per-request McpServer (same stateless pattern as ordinus-mcp/server)
// that exposes only the connector's *enabled* tools and forwards calls to the
// SDK client — so tool permissions are enforced here, provider-independently:
// disabled tools are absent from tools/list and unreachable via tools/call.
//
// Lifecycle is observation-based, not bookkeeping-based: every proxied
// request stamps lastUsedAt and holds an in-flight count. The reaper stops a
// `heavy` server once it has been idle past the timeout with nothing in
// flight — so cancelled turns and killed work runs can never strand a
// process. The proxy URL stays stable across child restarts.

import { createServer, type Server as HttpServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { getConnectorManifest } from '../integrations/registry'
import { spawn } from 'node:child_process'
import { ensureConnectorInstalled, requireLocalSpec } from './runtime-bootstrap'
import { getConnectorHomeDir, getConnectorSessionDir } from './paths'

// ADR-042: a pairing-mode server that detects a revoked session drops this
// marker in its session dir and exits; the supervisor maps that to the
// "Reconnect required" state instead of crash accounting.
const LOGGED_OUT_MARKER = 'logged-out'

function hasLoggedOutMarker(connectorId: string): boolean {
  return existsSync(join(getConnectorSessionDir(connectorId), LOGGED_OUT_MARKER))
}

const IDLE_TIMEOUT_MS = 5 * 60_000
const REAPER_INTERVAL_MS = 60_000
// N rapid failures within the window → unhealthy (ADR-041 crash policy).
const FAILURE_WINDOW_MS = 2 * 60_000
const FAILURE_THRESHOLD = 3

export type DiscoveredTool = { name: string; description: string }

/**
 * Persistence boundary, injected at app boot so this module has no direct
 * database dependency. Enabled tools drive proxy-level permission filtering;
 * health flows back out for the Settings badge.
 */
export type LocalConnectorStateAccess = {
  getEnabledTools: (connectorId: string) => string[]
  setHealth: (connectorId: string, health: 'ok' | 'unhealthy' | 'reconnect-required') => void
}

type RunningServer = {
  client: Client
  lastUsedAt: number
  inFlight: number
}

type SupervisorState = {
  http: HttpServer | null
  port: number
  tokens: Map<string, string>
  servers: Map<string, RunningServer>
  /** In-flight boots, so concurrent ensures share one start (lifecycle.ts idiom). */
  pendingStarts: Map<string, Promise<RunningServer>>
  failures: Map<string, number[]>
  reaper: NodeJS.Timeout | null
  access: LocalConnectorStateAccess | null
  /** Set during will-quit so delayed persistent restarts cannot respawn. */
  shuttingDown: boolean
}

const state: SupervisorState = {
  http: null,
  port: 0,
  tokens: new Map(),
  servers: new Map(),
  pendingStarts: new Map(),
  failures: new Map(),
  reaper: null,
  access: null,
  shuttingDown: false
}

export function initLocalMcpSupervisor(access: LocalConnectorStateAccess): void {
  state.access = access
}

type ChildLaunch = {
  command: string
  args: string[]
  env: Record<string, string>
}

/**
 * Resolve everything needed to spawn a connector child: installed command,
 * argv with `${sessionDir}` substituted, and a deliberately minimal
 * environment — third-party servers must not inherit the main process's
 * secrets (shell-exported API keys etc.). HOME points at the persistent
 * per-connector home (caches survive Disconnect); the manifest's
 * sessionDirArgs steer sensitive session state into the deletable session
 * dir. Both live under app-data — the clean-machine guarantee (ADR-041).
 */
async function resolveChildLaunch(
  connectorId: string,
  extraArgs: string[] = []
): Promise<ChildLaunch> {
  const manifest = getConnectorManifest(connectorId)
  const spec = requireLocalSpec(manifest)
  const launch = await ensureConnectorInstalled(manifest)

  const sessionDir = getConnectorSessionDir(connectorId)
  const homeDir = getConnectorHomeDir(connectorId)
  mkdirSync(sessionDir, { recursive: true })
  mkdirSync(homeDir, { recursive: true })

  const substitute = (arg: string): string => arg.replaceAll('${sessionDir}', sessionDir)
  const args = [...launch.args, ...(spec.sessionDirArgs ?? []), ...extraArgs].map(substitute)

  const inherited: Record<string, string> = {}
  for (const key of ['PATH', 'TMPDIR', 'TEMP', 'TMP', 'LANG', 'LC_ALL', 'SYSTEMROOT', 'COMSPEC']) {
    const value = process.env[key]
    if (value !== undefined) {
      inherited[key] = value
    }
  }
  const env: Record<string, string> = {
    ...inherited,
    ...launch.env,
    HOME: homeDir,
    USERPROFILE: homeDir,
    XDG_DATA_HOME: homeDir,
    XDG_CACHE_HOME: homeDir,
    XDG_CONFIG_HOME: homeDir
  }
  return { command: launch.command, args, env }
}

/** Spawn the connector's process and connect an MCP client over stdio. */
async function startServer(connectorId: string): Promise<RunningServer> {
  // A revoked session would just boot, detect loggedOut, and exit again —
  // refuse up front so agents get a clear error instead of a churn loop.
  if (hasLoggedOutMarker(connectorId)) {
    state.access?.setHealth(connectorId, 'reconnect-required')
    throw new Error(`${connectorId} session expired — reconnect from Settings → Connections.`)
  }
  const launch = await resolveChildLaunch(connectorId)

  const transport = new StdioClientTransport({
    command: launch.command,
    args: launch.args,
    env: launch.env,
    stderr: 'pipe'
  })
  const client = new Client({ name: 'ordinus-local-mcp', version: '1.0.0' })
  await client.connect(transport)

  // The pipe MUST be drained: an unread stderr fills its buffer (~64KB) and
  // then blocks the child's writes, stalling its event loop — a real hazard
  // for persistent servers that log reconnects over weeks. Servers are
  // expected to keep stderr to status lines (never message content).
  transport.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString().trim()
    if (text) {
      console.error(`[local-mcp] ${connectorId} stderr: ${text}`)
    }
  })

  // The SDK owns the child process it spawned; closing the client closes the
  // transport, which terminates the child.
  const running: RunningServer = {
    client,
    lastUsedAt: Date.now(),
    inFlight: 0
  }

  transport.onclose = () => {
    // Unexpected exit (we did not remove the entry first). A `logged-out`
    // marker in the session dir (ADR-042) means the server detected a revoked
    // session and exited deliberately — surface "Reconnect required" instead
    // of counting it as a crash. Session data stays; only Disconnect deletes.
    if (state.servers.get(connectorId) === running) {
      state.servers.delete(connectorId)
      if (hasLoggedOutMarker(connectorId)) {
        console.log(`[local-mcp] ${connectorId} session revoked — reconnect required`)
        state.access?.setHealth(connectorId, 'reconnect-required')
      } else {
        recordFailure(connectorId)
        // Persistent servers are ingesters — a dead child means messages stop
        // landing in the store, so restart instead of waiting for traffic.
        // recordFailure above still applies the rapid-failure threshold; once
        // unhealthy we stop trying until the next explicit start.
        const manifest = getConnectorManifest(connectorId)
        const failures = state.failures.get(connectorId)?.length ?? 0
        if (manifest.local?.lifecycle === 'persistent' && failures < FAILURE_THRESHOLD) {
          console.log(`[local-mcp] ${connectorId} persistent server exited — restarting in 5s`)
          setTimeout(() => {
            if (state.shuttingDown) {
              return
            }
            ensureServer(connectorId).catch((err) => {
              console.error(`[local-mcp] ${connectorId} restart failed:`, err)
            })
          }, 5_000).unref()
        }
      }
    }
  }

  console.log(`[local-mcp] ${connectorId} started (${launch.command})`)
  if (getConnectorManifest(connectorId).local?.heavy) {
    ensureReaper()
  }
  return running
}

function recordFailure(connectorId: string): void {
  const now = Date.now()
  const recent = (state.failures.get(connectorId) ?? []).filter((t) => now - t < FAILURE_WINDOW_MS)
  recent.push(now)
  state.failures.set(connectorId, recent)
  if (recent.length >= FAILURE_THRESHOLD) {
    console.error(`[local-mcp] ${connectorId} marked unhealthy after repeated failures`)
    state.access?.setHealth(connectorId, 'unhealthy')
  }
}

async function ensureServer(connectorId: string): Promise<RunningServer> {
  const existing = state.servers.get(connectorId)
  if (existing) {
    return existing
  }
  let pending = state.pendingStarts.get(connectorId)
  if (!pending) {
    pending = startServer(connectorId)
      .then((running) => {
        state.servers.set(connectorId, running)
        state.access?.setHealth(connectorId, 'ok')
        return running
      })
      .catch((err) => {
        recordFailure(connectorId)
        throw err
      })
      .finally(() => {
        state.pendingStarts.delete(connectorId)
      })
    state.pendingStarts.set(connectorId, pending)
  }
  return pending
}

/**
 * ADR-041 interactive login (LinkedIn-class servers): run the server's
 * `--login` flow as a one-shot visible process and wait for it to finish.
 * The user authenticates in the window the server opens; the session lands
 * in the session dir via sessionDirArgs. Resolves on exit 0, rejects on
 * non-zero exit or timeout (user closed the window / walked away).
 */
const pendingLogins = new Map<string, Promise<void>>()

export function runInteractiveLogin(connectorId: string, timeoutMs = 5 * 60_000): Promise<void> {
  // Same share-the-in-flight-promise idiom as ensureServer: a second Connect
  // while a login window is open must not spawn a second window.
  let pending = pendingLogins.get(connectorId)
  if (!pending) {
    pending = runInteractiveLoginOnce(connectorId, timeoutMs).finally(() => {
      pendingLogins.delete(connectorId)
    })
    pendingLogins.set(connectorId, pending)
  }
  return pending
}

async function runInteractiveLoginOnce(connectorId: string, timeoutMs: number): Promise<void> {
  const launch = await resolveChildLaunch(connectorId, ['--login'])
  console.log(`[local-mcp] ${connectorId} interactive login starting`)
  await new Promise<void>((resolve, reject) => {
    const child = spawn(launch.command, launch.args, { env: launch.env, stdio: 'ignore' })
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('Login timed out — the sign-in window was not completed.'))
    }, timeoutMs)
    child.once('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.once('exit', (code) => {
      clearTimeout(timer)
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`Login was not completed (exit code ${code ?? 'unknown'}).`))
      }
    })
  })
  console.log(`[local-mcp] ${connectorId} interactive login completed`)
}

/**
 * ADR-042 pairing login (WhatsApp-class servers): run the server's `--login`
 * flow as a one-shot headless process. Unlike interactive login the server
 * has no window of its own — it emits line-delimited JSON events on stdout
 * (`pairing-code`, `paired`, `error`) which are forwarded to the caller so
 * the renderer can display the device-linking code. Same contract otherwise:
 * resolves on exit 0, rejects on non-zero exit or timeout. "Get a new code"
 * is simply a fresh runPairingLogin call after the previous one settled.
 */
export type PairingLoginEvent = {
  event: 'pairing-code' | 'paired' | 'error'
  code?: string
  reason?: string
}

const pairingChildren = new Map<string, ReturnType<typeof spawn>>()

export function runPairingLogin(
  connectorId: string,
  phone: string,
  onEvent: (event: PairingLoginEvent) => void,
  timeoutMs = 5 * 60_000
): Promise<void> {
  // Unlike interactive login, a new pairing request SUPERSEDES the in-flight
  // one: pairing codes expire in ~1 min and "Get a new code" restarts the
  // login run (ADR-042). Killing the old child rejects its promise; the
  // dialog ignores results from superseded attempts.
  pairingChildren.get(connectorId)?.kill()
  return runPairingLoginOnce(connectorId, phone, onEvent, timeoutMs)
}

async function runPairingLoginOnce(
  connectorId: string,
  phone: string,
  onEvent: (event: PairingLoginEvent) => void,
  timeoutMs: number
): Promise<void> {
  const launch = await resolveChildLaunch(connectorId, ['--login'])
  console.log(`[local-mcp] ${connectorId} pairing login starting`)
  await new Promise<void>((resolve, reject) => {
    // The phone number travels via env, not argv — argv is visible to every
    // local process (`ps`) for the lifetime of the login child.
    const child = spawn(launch.command, launch.args, {
      env: { ...launch.env, ORDINUS_WA_PHONE: phone },
      stdio: ['ignore', 'pipe', 'ignore']
    })
    pairingChildren.set(connectorId, child)
    let lastError: string | null = null
    let buffer = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      buffer += chunk
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) {
          continue
        }
        try {
          const event = JSON.parse(line) as PairingLoginEvent
          if (event.event === 'error') {
            lastError = event.reason ?? 'Pairing failed.'
          }
          // Never echo event payloads to the log — the pairing code is a
          // credential equivalent while valid.
          onEvent(event)
        } catch {
          // Non-JSON noise on stdout is ignored, not fatal.
        }
      }
    })
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('Pairing timed out — the code was not entered on the phone.'))
    }, timeoutMs)
    child.once('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.once('exit', (code, signal) => {
      clearTimeout(timer)
      if (pairingChildren.get(connectorId) === child) {
        pairingChildren.delete(connectorId)
      }
      if (code === 0) {
        resolve()
      } else if (signal !== null) {
        reject(new Error('Pairing was superseded by a new attempt.'))
      } else {
        reject(
          new Error(lastError ?? `Pairing was not completed (exit code ${code ?? 'unknown'}).`)
        )
      }
    })
  })
  console.log(`[local-mcp] ${connectorId} pairing login completed`)
}

/**
 * Disconnect: stop the child AND revoke the proxy token, so any live CLI
 * session still holding the old URL gets 404s instead of silently restarting
 * a connector the user just disconnected. A fresh token is minted on the
 * next materialization after reconnect.
 */
export async function revokeLocalConnector(connectorId: string): Promise<void> {
  state.tokens.delete(connectorId)
  await stopLocalConnector(connectorId)
}

/** Stop the child (idle reaper, shutdown). Idempotent. Token stays valid. */
export async function stopLocalConnector(connectorId: string): Promise<void> {
  const running = state.servers.get(connectorId)
  if (!running) {
    return
  }
  state.servers.delete(connectorId)
  await running.client.close().catch(() => {})
  console.log(`[local-mcp] ${connectorId} stopped`)
}

function ensureReaper(): void {
  if (state.reaper) {
    return
  }
  state.reaper = setInterval(() => {
    const now = Date.now()
    for (const [connectorId, running] of state.servers) {
      const manifest = getConnectorManifest(connectorId)
      // Persistent servers are never reaped (ADR-042), heavy or not.
      if (!manifest.local?.heavy || manifest.local.lifecycle === 'persistent') {
        continue
      }
      if (running.inFlight === 0 && now - running.lastUsedAt > IDLE_TIMEOUT_MS) {
        console.log(`[local-mcp] ${connectorId} idle — shutting down`)
        void stopLocalConnector(connectorId)
      }
    }
  }, REAPER_INTERVAL_MS)
  state.reaper.unref()
}

/**
 * Build the per-request forwarding server. The low-level Server (not
 * McpServer) lets us pass the upstream tool catalog through untouched —
 * descriptions and JSON input schemas included — while filtering to the
 * enabled subset. Disabled tools are absent from tools/list and rejected on
 * tools/call, so enforcement does not depend on provider permission
 * semantics (ADR-041).
 */
function buildForwardingServer(connectorId: string, running: RunningServer): Server {
  const server = new Server(
    { name: `ordinus-local-${connectorId}`, version: '1.0.0' },
    { capabilities: { tools: {} } }
  )

  const enabledTools = (): Set<string> => new Set(state.access?.getEnabledTools(connectorId) ?? [])

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const enabled = enabledTools()
    const { tools } = await running.client.listTools()
    return { tools: tools.filter((tool) => enabled.has(tool.name)) }
  })

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params
    if (!enabledTools().has(name)) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: `Tool ${name} is not enabled for this connector.` })
          }
        ],
        isError: true
      }
    }
    console.log(`[local-mcp] ${connectorId} tools/call ${name}`)
    return running.client.callTool({ name, arguments: args })
  })

  return server
}

function ensureProxyListener(): Promise<void> {
  if (state.http) {
    return Promise.resolve()
  }
  const pattern = /^\/local\/([a-z0-9-]+)\/([A-Za-z0-9-]+)(?:[/?]|$)/

  const http = createServer((req, res) => {
    const match = req.url?.match(pattern) ?? null
    const connectorId = match?.[1] ?? ''
    const authorized = match !== null && state.tokens.get(connectorId) === match[2]
    if (!authorized) {
      res.statusCode = 404
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ error: 'not_found' }))
      return
    }

    void (async () => {
      let running: RunningServer | null = null
      try {
        running = await ensureServer(connectorId)
        running.lastUsedAt = Date.now()
        running.inFlight += 1
        const mcp = buildForwardingServer(connectorId, running)
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
        try {
          await mcp.connect(transport)
          await transport.handleRequest(req, res)
        } finally {
          await transport.close().catch(() => {})
          await mcp.close().catch(() => {})
        }
      } catch (err) {
        // Covers start failures too — the agent gets a clean 500 instead of a
        // hung request when the child cannot boot.
        console.error(`[local-mcp] ${connectorId} request failed:`, err)
        if (!res.headersSent) {
          res.statusCode = 500
          res.end()
        }
      } finally {
        if (running) {
          running.inFlight -= 1
          running.lastUsedAt = Date.now()
        }
      }
    })()
  })

  state.http = http
  return new Promise<void>((resolve, reject) => {
    http.once('error', reject)
    http.listen(0, '127.0.0.1', () => {
      http.off('error', reject)
      const address = http.address()
      if (!address || typeof address === 'string') {
        reject(new Error('Local MCP proxy failed to bind.'))
        return
      }
      state.port = address.port
      console.log(`[local-mcp] proxy listening on 127.0.0.1:${state.port}`)
      resolve()
    })
  })
}

/**
 * Resolve the stable, token-gated proxy URL for a connector — the only
 * address agents ever see. Does NOT eagerly start the child; that happens on
 * first traffic, which is what makes turn materialization cheap.
 */
export async function getLocalConnectorUrl(connectorId: string): Promise<string> {
  await ensureProxyListener()
  let token = state.tokens.get(connectorId)
  if (!token) {
    token = randomUUID()
    state.tokens.set(connectorId, token)
  }
  return `http://127.0.0.1:${state.port}/local/${connectorId}/${token}`
}

/**
 * ADR-042: start a persistent connector without waiting for traffic (app
 * boot, post-Connect). Errors surface through the failure/health machinery.
 */
export async function ensureLocalConnectorRunning(connectorId: string): Promise<void> {
  await ensureServer(connectorId)
}

/** Install (if needed), start, and ask the server for its real tool catalog. */
export async function discoverConnectorTools(connectorId: string): Promise<DiscoveredTool[]> {
  const running = await ensureServer(connectorId)
  running.lastUsedAt = Date.now()
  const { tools } = await running.client.listTools()
  return tools.map((tool) => ({ name: tool.name, description: tool.description ?? '' }))
}

/** will-quit: stop every child and unbind the proxy. Idempotent. */
export async function shutdownLocalMcp(): Promise<void> {
  state.shuttingDown = true
  if (state.reaper) {
    clearInterval(state.reaper)
    state.reaper = null
  }
  await Promise.all([...state.servers.keys()].map((id) => stopLocalConnector(id)))
  const http = state.http
  state.http = null
  if (http) {
    await new Promise<void>((resolve) => http.close(() => resolve()))
  }
}
