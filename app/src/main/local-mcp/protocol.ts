// ADR-042/043: the cross-process "session lost" handshake between a local
// connector child and the supervisor. A server that detects a revoked/expired
// session drops LOGGED_OUT_MARKER (an empty-ish file) in its session dir and
// exits with EXIT_LOGGED_OUT; the supervisor maps that to the
// "Reconnect required" state instead of crash accounting.
//
// These are the canonical definitions for the main-process (TypeScript) side.
// The connector servers themselves run in separate runtimes
// (app/resources/*-mcp/*.mjs) and cannot import this module, so they redeclare
// the same literals locally — keep all copies in sync if this contract changes.
export const LOGGED_OUT_MARKER = 'logged-out'
export const EXIT_LOGGED_OUT = 41

// ADR-046: a softer signal than LOGGED_OUT_MARKER, for connectors whose refresh
// authority is the main process (X). The child can't refresh, so on a 401 it
// drops this marker and exits non-zero instead of declaring the session dead.
// The supervisor's pre-spawn refresh hook sees the marker and force-refreshes
// (ignoring the expiry margin) on the next spawn: a recoverable expiry heals
// silently, and only a genuinely broken rotation chain escalates to
// LOGGED_OUT_MARKER + "Reconnect required". Redeclared in app/resources/x-mcp.
export const TOKEN_REJECTED_MARKER = 'token-rejected'
