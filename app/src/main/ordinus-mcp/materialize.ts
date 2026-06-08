// ADR-029 §4 — Ordinus internal MCP server constants.
//
// Per-CLI materialization was originally planned to live here as a parallel of
// integrations/materialize.ts. During M3 we instead extended the existing
// materialize functions with an `additionalServers` parameter (no auth, loopback
// URL) so that the Ordinus session module can inject our server into the same
// pipeline that handles user connectors — single code path per CLI, all three
// already proven to work.
//
// This file is now reduced to the shared identifier so callers (the session
// module that passes additionalServers, and the MCP server itself that names
// itself in its handshake) agree on the same string.

export const ORDINUS_MCP_SERVER_ID = 'ordinus'
