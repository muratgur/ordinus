// ADR-041 dev-only fixture: a dependency-free MCP server speaking stdio
// (newline-delimited JSON-RPC). Exists so the local-connector pipeline can be
// exercised end-to-end without a real third-party server. Run with the app's
// own binary via ELECTRON_RUN_AS_NODE=1; never shipped in packaged builds.
//
// Tools: echo_tool / add_numbers (read-like, enabled by default) and
// fake_send (simulates an outward-acting tool — born disabled, so it should
// be invisible to agents until the user enables it in Settings).

import { createInterface } from 'node:readline'

const TOOLS = [
  {
    name: 'echo_tool',
    description: 'Echoes back the provided text. Dev fixture tool.',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string', description: 'Text to echo back.' } },
      required: ['text']
    }
  },
  {
    name: 'add_numbers',
    description: 'Adds two numbers. Dev fixture tool.',
    inputSchema: {
      type: 'object',
      properties: { a: { type: 'number' }, b: { type: 'number' } },
      required: ['a', 'b']
    }
  },
  {
    name: 'fake_send',
    description:
      'Pretends to send a message to the outside world. Dev fixture stand-in for outward-acting tools like send_message; default-disabled by the manifest.',
    inputSchema: {
      type: 'object',
      properties: { to: { type: 'string' }, message: { type: 'string' } },
      required: ['to', 'message']
    }
  }
]

function reply(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n')
}

function replyError(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n')
}

function textResult(payload) {
  return { content: [{ type: 'text', text: JSON.stringify(payload) }] }
}

function handleToolCall(id, params) {
  const args = params?.arguments ?? {}
  switch (params?.name) {
    case 'echo_tool':
      reply(id, textResult({ echoed: String(args.text ?? '') }))
      return
    case 'add_numbers':
      reply(id, textResult({ sum: Number(args.a) + Number(args.b) }))
      return
    case 'fake_send':
      reply(id, textResult({ sent: true, to: String(args.to ?? ''), simulated: true }))
      return
    default:
      reply(id, { ...textResult({ error: `Unknown tool: ${params?.name}` }), isError: true })
  }
}

const rl = createInterface({ input: process.stdin })
rl.on('line', (line) => {
  const trimmed = line.trim()
  if (!trimmed) {
    return
  }
  let message
  try {
    message = JSON.parse(trimmed)
  } catch {
    return
  }
  const { id, method, params } = message
  if (id === undefined || id === null) {
    // Notification (e.g. notifications/initialized) — nothing to answer.
    return
  }
  switch (method) {
    case 'initialize':
      reply(id, {
        protocolVersion: params?.protocolVersion ?? '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: { name: 'ordinus-dev-fixture', version: '1.0.0' }
      })
      return
    case 'ping':
      reply(id, {})
      return
    case 'tools/list':
      reply(id, { tools: TOOLS })
      return
    case 'tools/call':
      handleToolCall(id, params)
      return
    default:
      replyError(id, -32601, `Method not found: ${method}`)
  }
})

process.stdin.on('close', () => process.exit(0))
