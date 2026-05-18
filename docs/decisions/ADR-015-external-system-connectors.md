# ADR-015: External System Connectors As A Credential Broker

## Status

Accepted

## Date

2026-05-18

## Context

Agents need to read from, write to, and take action in external systems (for
example Datadog, GitHub, internal APIs). Each external system exposes itself
differently: some through an MCP server, some through a plain HTTP API, some
behind OAuth, some behind a static API key.

Two design pressures shape this:

1. **Ordinus must not become a data pipe.** Ordinus should not fetch, proxy,
   transform, or persist the data that flows between an agent and an external
   system. If Ordinus sits in the data plane it inherits the security surface,
   latency, and storage burden of every connected system.

2. **The provider decides when and how to call.** Whether and when an external
   system is invoked during a turn is a decision for the agent's own tool-use
   loop (the underlying `claude` / `codex` / `gemini` CLI), not for Ordinus
   orchestration logic.

A naive approach — putting MCP servers in the CLI's global configuration (for
example `~/.claude/settings.json`) — would leak every connector to every agent
with no per-agent scoping. That is unacceptable: connector access is a
per-agent authorization decision.

## Decision

Ordinus acts as a **connection broker and credential vault**, never as a data
broker.

The model has four layers:

- **Connector Registry (global catalog).** A static catalog of available
  connectors. Each entry is a transport-agnostic manifest:
  `{ id, label, transport: 'mcp-http' | 'mcp-stdio' | 'api', authMethod,
  mcpUrl?, scopes? }`. The registry says a connector *exists and how to connect
  to it* — not which agent may use it or when.

- **Per-agent binding.** Connector access is granted on the agent instance
  (`Agent` / `AgentDraft`), not on the static profile. A profile may carry a
  non-binding `suggestedConnectors` hint. The default is an empty set: an agent
  with no bindings reaches no external system.

- **Credential Vault.** The user connects a connector once from the Connections
  screen. Ordinus performs any required OAuth dance and stores the resulting
  token material encrypted with Electron `safeStorage`, keyed by connector id.
  Agent bindings remain separate allowlists: they grant or deny runtime access
  to an already-connected external system. Ordinus refreshes tokens when a turn
  needs them. Ordinus stores credentials only; it never stores or proxies the
  data those credentials unlock.

- **Materialization (per turn, ephemeral).** At turn start, the runtime adapter
  resolves the connector ids bound to the agent, filters to connected and
  supported connectors, injects credentials from the vault, and exposes only
  that set to the provider CLI through a provider-specific per-invocation
  mechanism. Claude receives an ephemeral `--mcp-config <file>`; Codex receives
  `mcp_servers.*` configuration overrides and bearer-token environment
  variables; Gemini receives a turn-private `GEMINI_CLI_HOME` with scoped
  `settings.json`. Temporary files are removed when the turn ends. Nothing is
  written to a CLI's global connector configuration.

The data plane runs directly between the CLI's tool-use loop and the external
system. Ordinus observes only tool-call event metadata (which connector, when),
never payloads — consistent with ADR-011 observability scoping.

## Alternatives Considered

**Write connectors to the CLI's global config.** Rejected: no per-agent
scoping; every agent would inherit every connector.

**Build a fully Ordinus-managed proxy layer.** Rejected: it places Ordinus in
the data plane, contradicting the core principle and multiplying the security
and storage surface.

**Let each CLI manage its own connector auth (e.g. native MCP OAuth).**
Rejected as the primary mechanism: behavior diverges per CLI, tokens live
outside our control, and per-agent scoping is not guaranteed. We use the CLI's
*per-invocation* config mechanism, but Ordinus owns credential lifecycle.

## Consequences

- Connector access is an explicit per-agent authorization decision with a safe
  empty default.
- Credentials are centralized and encrypted at rest; data is not.
- The transport-agnostic registry lets new connectors (api-key, mcp-stdio) reuse
  the same vault and materialization skeleton.
- Adapters need a provider-specific per-invocation MCP mechanism or an
  isolated-config fallback. Claude, Codex, and Gemini are wired in the current
  implementation, using different materialization strategies.

## Implementation Notes

The first implementation started with Datadog over `mcp-http` + OAuth and a
Claude `--mcp-config` materialization path, establishing the registry / vault /
oauth-broker / materialize skeleton. The implementation has since expanded to
multiple OAuth MCP connectors in the static catalog (`datadog`, `linear`,
`notion`, `canva`, and `atlassian`) and provider-specific materialization for
Claude, Codex, and Gemini. Other transports (`api-key`, `mcp-stdio`, direct
`api`) should follow the same broker/vault/materialization model before they
are exposed to agents.

OAuth follows the MCP authorization spec rather than a manually configured
client: at connect time Ordinus discovers the protected-resource and
authorization-server metadata (RFC 9728 / RFC 8414) from the connector's MCP
URL, performs Dynamic Client Registration (RFC 7591), then runs
authorization-code + PKCE with a loopback redirect and the RFC 8707 `resource`
indicator. The registry therefore only needs the MCP URL; no static
client_id/secret or env vars. Refresh metadata (token endpoint, client
credentials, resource) is stored with the token so refresh needs no
rediscovery. Connection is initiated from the dedicated Connections screen;
agents reference connected connectors via their per-agent allowlist.
