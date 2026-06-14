// Ordinus X (Twitter) MCP server (ADR-046) — runs as an electron-node child
// under the local-mcp supervisor. Raw fetch to X API v2 (no SDK), authenticated
// by the user's own ("bring your own") public OAuth client.
//
// SERVICE MODE ONLY — login is main-process OAuth (the forked oauth-broker),
// not a login child. The access token arrives via env (ORDINUS_X_ACCESS_TOKEN),
// injected per spawn from the vault by the supervisor's getSecretEnv. Refresh
// authority is the MAIN process (X rotates refresh tokens), so this child is
// stateless: on a 401 it drops a `logged-out` marker in --session-dir and exits
// 41 (supervisor → "Reconnect required").
//
// Tools (tools.mjs): get_my_profile, get_tweet, search_recent_tweets,
// get_user_timeline, get_mentions (read-only, born enabled). Write/interaction
// tools are Phase 3 (born disabled).

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
  accessToken: process.env.ORDINUS_X_ACCESS_TOKEN
})

const mcp = new Server({ name: 'ordinus-x', version: '0.3.0' }, { capabilities: { tools: {} } })
registerTools(mcp, auth)
await mcp.connect(new StdioServerTransport())
