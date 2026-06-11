// ADR-029 §4 / M3 — Ordinus internal MCP server.
//
// One in-process HTTP MCP server that exposes the Ordinus tool registry to
// any provider CLI configured to talk to us (Codex, Claude, Gemini — all three
// use the same HTTP transport, only their config format differs; see
// ../integrations/materialize.ts for the per-CLI wiring).
//
// Architectural choices and why:
//   - HTTP transport, not stdio. stdio would force tool executors into a
//     subprocess that can't share our better-sqlite3 handle, observability
//     service, etc. HTTP keeps everything in main.
//   - Per-request McpServer + Transport pair, stateless mode. We do not
//     consume any of MCP's session-lifecycle features (push notifications,
//     progress streaming, sampling, elicitation, multi-call stateful tools,
//     long-running task polling, resource subscriptions). Our tools are
//     atomic. So the session-id bookkeeping a stateful server requires
//     gives us zero benefit. The SDK's stateless transport contract is
//     "fresh transport per request" — we honor that by spawning a fresh
//     McpServer too (handler registration is microseconds; the bookkeeping
//     savings of *not* tracking a Map<sessionId, pair> are worth more).
//   - Ephemeral port (`listen(0)`). The OS picks a free port, we read it
//     back and embed it in the URL we hand the CLI. No collisions.
//   - Bound to 127.0.0.1 only. The MCP server is for in-process consumers
//     plus child CLI processes on the same machine; binding to a public
//     interface would invite untrusted access. ADR-029 explicitly notes
//     the localhost-as-security-boundary stance.
//   - No auth token. Same reason — localhost. If we ever expose this
//     beyond the machine we'll add per-server bearer tokens.
//
// Logical "MCP server" identity (the URL, the tool catalog, the name) is
// stable for the app's lifetime. The per-request McpServer JS objects are
// implementation detail — from a CLI's perspective there's one server at
// one URL serving the same seven tools.

import { z, type ZodType } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createServer, type Server as HttpServer } from 'node:http'
import { getOrdinusToolsRaw, invokeTool, type ToolInvocationResult } from '../ordinus-tools'
import type { OrdinusToolContext, OrdinusToolSummary } from '../ordinus-tools/types'
import { createPendingConfirmation } from '../ordinus/confirmation'

// Map `cancel_work_run` → "Cancel Work Run" for the panel header. Pure
// presentation; keeps the panel readable without making tool authors set
// a separate "label" field.
function deriveToolLabel(name: string): string {
  return name
    .split('_')
    .map((part) => (part.length > 0 ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ')
}

export type OrdinusMcpHandle = {
  /** Full URL CLIs should connect to (e.g. http://127.0.0.1:54871/mcp). */
  url: string
  /** Numeric port the OS assigned; useful for diagnostics. */
  port: number
  /** Tears down the HTTP server. Idempotent. */
  close: () => Promise<void>
}

/**
 * Convert the registry's invokeTool() result into an MCP CallToolResult.
 *
 * The MCP protocol expects `content: ContentBlock[]` with optional
 * `isError: true`. We use a single text block carrying JSON; the LLM reads
 * the structured payload directly and decides how to surface it. We do NOT
 * try to render anything as Markdown here — that's the transcript renderer's
 * job (M4), not the protocol layer's.
 */
function asCallToolResult(invocation: ToolInvocationResult): {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
  structuredContent?: Record<string, unknown>
} {
  if (invocation.outcome === 'ok') {
    const output = invocation.output as Record<string, unknown> | unknown
    return {
      content: [{ type: 'text', text: JSON.stringify(output) }],
      // structuredContent lets MCP clients that understand it bypass JSON
      // re-parsing. Safe to set even when the client ignores it.
      structuredContent:
        typeof output === 'object' && output !== null
          ? (output as Record<string, unknown>)
          : { value: output }
    }
  }
  // Every non-ok outcome is surfaced as an MCP tool error with the structured
  // outcome embedded so the LLM can react (e.g. retry with different args
  // when invalid_input, or report missing data when not_found).
  return {
    content: [{ type: 'text', text: JSON.stringify(invocation) }],
    isError: true
  }
}

/**
 * Build a fresh McpServer with the current tool registry attached. Called
 * once per incoming HTTP request — cheap (handler registration is just
 * function attachments, no I/O). Factored out so the per-request branch in
 * the HTTP handler stays focused on request/response wiring.
 */
function buildPerRequestMcpServer(toolContext: OrdinusToolContext): McpServer {
  const mcp = new McpServer(
    { name: 'ordinus-internal', version: '1.0.0' },
    { capabilities: { tools: {} } }
  )
  for (const tool of getOrdinusToolsRaw()) {
    mcp.registerTool(
      tool.manifest.name,
      {
        description: tool.manifest.description,
        // Pass the full ZodObject as a single AnySchema. The SDK extracts
        // the shape internally for the JSON catalog it serves to the
        // client.
        inputSchema: tool.inputSchema as ZodType<unknown>
      },
      async (args: unknown) => {
        // ADR-029 §9 / M6 — destructive-tool gate.
        //
        // First pass: invokeTool with confirmed:false. For destructive tools
        // (capability:'destructive') the registry returns `requires_confirmation`
        // immediately, without running the executor. The MCP layer then:
        //   - validates input via the tool's Zod schema (manually here so we
        //     can produce a friendlier error than the registry's TDZ wrap)
        //   - calls the tool's `summarize` to build the panel payload
        //   - registers a pending entry, publishes the request event
        //   - awaits the user's decision
        //   - on approve: re-invokes with confirmed:true
        //   - on cancel: returns a structured cancellation so Ordinus can
        //     adapt ("standing by; let me know when you want me to do it")
        //
        // Read/write tools never reach the gate path; the first call returns
        // their result directly.
        const initial = await invokeTool(tool.manifest.name, args, toolContext, {
          confirmed: false
        })
        if (initial.outcome !== 'requires_confirmation') {
          return asCallToolResult(initial)
        }

        const parsedInput = (tool.inputSchema as ZodType<unknown>).safeParse(args)
        if (!parsedInput.success) {
          // Same validation invokeTool would have done with confirmed:true.
          // Surface back to Ordinus so it can correct its args.
          return asCallToolResult({
            outcome: 'invalid_input',
            name: tool.manifest.name,
            errors: parsedInput.error.message
          })
        }

        // Best-effort summary. If the tool author omitted `summarize` or the
        // summarizer throws (e.g. record not found), fall back to a minimal
        // payload so the user still sees *something* and can approve/cancel.
        let summary: OrdinusToolSummary
        try {
          summary = tool.summarize
            ? await tool.summarize(parsedInput.data, toolContext)
            : {
                affectedRecords: [],
                reversibility: 'irreversible'
              }
        } catch (err) {
          summary = {
            affectedRecords: [],
            reversibility: 'irreversible',
            why: `(could not summarize: ${err instanceof Error ? err.message : String(err)})`
          }
        }

        const { pending, promise } = createPendingConfirmation({
          toolName: tool.manifest.name,
          toolLabel: deriveToolLabel(tool.manifest.name),
          reversibility: summary.reversibility,
          affectedRecords: summary.affectedRecords,
          args: parsedInput.data,
          why: summary.why
        })

        toolContext.events.publish({
          kind: 'confirmation_requested',
          pending
        })

        const decision = await promise

        toolContext.events.publish({
          kind: 'confirmation_resolved',
          pendingId: pending.pendingId,
          decision
        })

        if (decision === 'cancelled') {
          return asCallToolResult({
            outcome: 'error',
            name: tool.manifest.name,
            message: 'Cancelled by user.'
          })
        }

        const approved = await invokeTool(tool.manifest.name, parsedInput.data, toolContext, {
          confirmed: true
        })
        return asCallToolResult(approved)
      }
    )
  }
  return mcp
}

// ADR-037 — worker tool surface.
//
// Workboard worker agents get a deliberately tiny, read-only MCP subset —
// NOT the assistant catalog above. Two reasons (ADR-029 amendment):
//   - Security: the full catalog includes destructive/privileged tools
//     (archive, schedules, raw SQL); raw provider CLIs must not reach them.
//   - Tokens: every tool definition is paid as input on every worker
//     session, so the worker surface must stay minimal.
//
// Scope is enforced by the URL: each Work Request gets its own endpoint
// (/mcp/work/<requestId>) and the tool only serves runs belonging to that
// request.
const workerEndpointPattern = /^\/mcp\/work\/([A-Za-z0-9_-]+)(?:[/?]|$)/

export function buildWorkerMcpUrl(baseUrl: string, requestId: string): string {
  return `${baseUrl}/work/${requestId}`
}

const getWorkRunResultInputSchema = z.object({
  runId: z.string().trim().min(1)
})

function buildWorkerMcpServer(toolContext: OrdinusToolContext, requestId: string): McpServer {
  const mcp = new McpServer(
    { name: 'ordinus-work', version: '1.0.0' },
    { capabilities: { tools: {} } }
  )

  mcp.registerTool(
    'get_work_run_result',
    {
      description:
        'Fetch the full stored result of a prior Work Run in this Work Request. Input: the run id (wrk-...) as listed in digest.md or an upstream-work reference. Returns the run title, agent, status, result summary, full result content, and file paths. Only call this when you need the FULL output of prior work that was not already provided inline.',
      inputSchema: getWorkRunResultInputSchema as ZodType<unknown>
    },
    async (args: unknown) => {
      const parsed = getWorkRunResultInputSchema.safeParse(args)
      if (!parsed.success) {
        return asCallToolResult({
          outcome: 'invalid_input',
          name: 'get_work_run_result',
          errors: parsed.error.message
        })
      }

      try {
        const run = toolContext.database.getWorkRun(parsed.data.runId)
        const runRequestId = run.source?.type === 'work_request' ? run.source.id : ''
        if (runRequestId !== requestId) {
          return asCallToolResult({
            outcome: 'error',
            name: 'get_work_run_result',
            message: 'That run does not belong to this Work Request.'
          })
        }

        return asCallToolResult({
          outcome: 'ok',
          output: {
            runId: run.id,
            title: run.title,
            agentName: run.assignedAgentName,
            agentRole: run.assignedAgentRole,
            status: run.status,
            resultSummary: run.resultSummary,
            resultContent: run.resultContent,
            artifactRefs: run.artifactRefs,
            changedFiles: run.changedFiles
          }
        })
      } catch {
        return asCallToolResult({
          outcome: 'error',
          name: 'get_work_run_result',
          message: 'No Work Run with that id was found in this Work Request.'
        })
      }
    }
  )

  return mcp
}

/**
 * Boot the HTTP server. The McpServer + Transport are NOT created here —
 * they live per-request (see the request handler below). This function just
 * binds the port and returns a handle whose close() unbinds it.
 */
export async function startOrdinusMcpServer(
  toolContext: OrdinusToolContext
): Promise<OrdinusMcpHandle> {
  // Touch the registry once on startup so we log the catalog the CLI will
  // see. Cheap visibility for diagnosing "no tools" complaints.

  console.log(
    `[ordinus-mcp] registered tools: ${getOrdinusToolsRaw()
      .map((t) => t.manifest.name)
      .join(', ')}`
  )

  const httpServer: HttpServer = createServer((req, res) => {
    console.log(`[ordinus-mcp] ${req.method} ${req.url}`)

    if (!req.url || !req.url.startsWith('/mcp')) {
      res.statusCode = 404
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ error: 'not_found' }))
      return
    }

    // ADR-037: worker endpoints get the scoped read-only subset, never the
    // assistant catalog. Matched BEFORE the assistant branch — /mcp/work/...
    // also satisfies startsWith('/mcp').
    const workerMatch = req.url.match(workerEndpointPattern)

    // Per-request fresh pair. The SDK's stateless transport contract is
    // "fresh transport per request" — we honor that and spawn the McpServer
    // alongside so the wiring is symmetric.
    void (async () => {
      const mcp = workerMatch
        ? buildWorkerMcpServer(toolContext, workerMatch[1])
        : buildPerRequestMcpServer(toolContext)
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined
      })
      try {
        await mcp.connect(transport)
        await transport.handleRequest(req, res)
      } catch (err) {
        console.error('[ordinus-mcp] request handling failed:', err)
        if (!res.headersSent) {
          res.statusCode = 500
          res.end()
        }
      } finally {
        // Release the pair so it can be collected immediately. Either
        // close call may have already happened internally; swallow.
        await transport.close().catch(() => {})
        await mcp.close().catch(() => {})
      }
    })()
  })

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject)
    httpServer.listen(0, '127.0.0.1', () => {
      httpServer.off('error', reject)
      resolve()
    })
  })

  const address = httpServer.address()
  if (!address || typeof address === 'string') {
    httpServer.close()
    throw new Error('Ordinus MCP server failed to bind to a local port.')
  }
  const { port } = address
  const url = `http://127.0.0.1:${port}/mcp`

  return {
    url,
    port,
    close: async () => {
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve())
      })
    }
  }
}
