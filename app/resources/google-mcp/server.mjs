// Ordinus Google Workspace MCP server (ADR-043) — runs as an electron-node
// child under the local-mcp supervisor. Raw fetch to Google REST (no
// googleapis SDK), authenticated by the user's own ("bring your own") OAuth
// client.
//
// SERVICE MODE ONLY — login is main-process OAuth (the forked oauth-broker),
// not a login child, so unlike the WhatsApp server there is no --login mode.
// OAuth tokens arrive via env (injected per spawn from the vault by the
// supervisor's getSecretEnv); the auth helper self-refreshes on 401 and, on an
// unrecoverable invalid_grant, drops a `logged-out` marker in --session-dir and
// exits 41 (supervisor → "Reconnect required", the ADR-042 mechanism).
//
// Tools (tools.mjs): search_emails, get_email, list_events, get_event,
// search_files, read_file (read-only, born enabled); send_email, create_event
// (outward-acting, born disabled, Phase 3).

import { mkdirSync } from 'node:fs'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createAuth } from './auth.mjs'
import { registerTools } from './tools.mjs'

function argValue(flag) {
  const index = process.argv.indexOf(flag)
  return index !== -1 ? process.argv[index + 1] : undefined
}

const sessionDir = argValue('--session-dir')
if (sessionDir) {
  mkdirSync(sessionDir, { recursive: true })
}

const auth = createAuth({
  sessionDir,
  accessToken: process.env.ORDINUS_GOOGLE_ACCESS_TOKEN,
  refreshToken: process.env.ORDINUS_GOOGLE_REFRESH_TOKEN,
  clientId: process.env.ORDINUS_GOOGLE_CLIENT_ID,
  clientSecret: process.env.ORDINUS_GOOGLE_CLIENT_SECRET,
  tokenUri: process.env.ORDINUS_GOOGLE_TOKEN_URI
})

const mcp = new Server({ name: 'ordinus-google', version: '0.3.0' }, { capabilities: { tools: {} } })
registerTools(mcp, auth)
await mcp.connect(new StdioServerTransport())
