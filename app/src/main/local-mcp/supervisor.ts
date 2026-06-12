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
import { mkdirSync } from 'node:fs'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { getConnectorManifest } from '../integrations/registry'
import { ensureConnectorInstalled, requireLocalSpec } from './runtime-bootstrap'
import { getConnectorSessionDir } from './paths'

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
  setHealth: (connectorId: string, health: 'ok' | 'unhealthy') => void
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
}

const state: SupervisorState = {
  http: null,
  port: 0,
  tokens: new Map(),
  servers: new Map(),
  pendingStarts: new Map(),
  failures: new Map(),
  reaper: null,
  access: null
}

export function initLocalMcpSupervisor(access: LocalConnectorStateAccess): void {
  state.access = access
}

/** Spawn the connector's process and connect an MCP client over stdio. */
async function startServer(connectorId: string): Promise<RunningServer> {
  const manifest = getConnectorManifest(connectorId)
  const spec = requireLocalSpec(manifest)
  const launch = await ensureConnectorInstalled(manifest)

  const sessionDir = getConnectorSessionDir(connectorId)
  mkdirSync(sessionDir, { recursive: true })

  // Deliberately minimal child environment: third-party servers must not
  // inherit the main process's secrets (shell-exported API keys etc.). Only
  // basics needed to run, plus our redirections. HOME/profile redirection
  // keeps server-side state (cookies, browser profiles) inside app-data —
  // the clean-machine guarantee (ADR-041).
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
    HOME: sessionDir,
    USERPROFILE: sessionDir,
    XDG_DATA_HOME: sessionDir,
    XDG_CACHE_HOME: sessionDir,
    XDG_CONFIG_HOME: sessionDir
  }

  const transport = new StdioClientTransport({
    command: launch.command,
    args: launch.args,
    env,
    stderr: 'pipe'
  })
  const client = new Client({ name: 'ordinus-local-mcp', version: '1.0.0' })
  await client.connect(transport)

  // The SDK owns the child process it spawned; closing the client closes the
  // transport, which terminates the child.
  const running: RunningServer = {
    client,
    lastUsedAt: Date.now(),
    inFlight: 0
  }

  transport.onclose = () => {
    // Unexpected exit (we did not remove the entry first) counts as a failure.
    if (state.servers.get(connectorId) === running) {
      state.servers.delete(connectorId)
      recordFailure(connectorId)
    }
  }

  console.log(`[local-mcp] ${connectorId} started (${launch.command})`)
  if (spec.heavy) {
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
      if (!manifest.local?.heavy) {
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

/** Install (if needed), start, and ask the server for its real tool catalog. */
export async function discoverConnectorTools(connectorId: string): Promise<DiscoveredTool[]> {
  const running = await ensureServer(connectorId)
  running.lastUsedAt = Date.now()
  const { tools } = await running.client.listTools()
  return tools.map((tool) => ({ name: tool.name, description: tool.description ?? '' }))
}

/** will-quit: stop every child and unbind the proxy. Idempotent. */
export async function shutdownLocalMcp(): Promise<void> {
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
