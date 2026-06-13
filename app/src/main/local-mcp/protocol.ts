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
