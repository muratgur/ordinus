# ADR-041: Managed Local MCP Servers

## Status

Accepted — amended by ADR-042 (adds `lifecycle: 'persistent'` as an
opt-out of the idle reaper, and `loginMode: 'pairing'` for code-based
device linking)

## Date

2026-06-12

## Context

The connector catalog (ADR-015) currently exposes only remote `mcp-http` +
OAuth servers (Datadog, Linear, Notion, Canva, Atlassian). A large part of the
MCP ecosystem — including high-value consumer integrations such as LinkedIn
(`stickerdaniel/linkedin-mcp-server`) and, later, WhatsApp — ships as *local*
servers: programs that must run on the user's machine, typically speaking
stdio, often carrying heavy runtime dependencies (Python 3.12+, `uv`, a
Patchright-managed Chromium) and interactive browser-based login instead of
OAuth.

Constraints that shaped this decision:

- **The catalog stays curated.** Users do not add their own MCP servers; the
  target audience would not understand the concept. Ordinus ships every
  connector, pins its version, and owns its quality.
- **The user's machine stays clean.** No global installs, nothing written to
  the user's home directory (`~/.linkedin-mcp` style litter is unacceptable).
  Everything lives under Ordinus app-data and disappears with the app.
- **Non-technical users.** "Install uv first" is not an acceptable
  prerequisite. Heavy first-time setup must happen silently behind the
  existing Connect affordance.
- **Three provider CLIs.** Claude, Codex, and Gemini each have a different
  per-invocation MCP injection mechanism (ADR-015 materialization). Any new
  transport multiplies across all three adapters unless it is normalized
  first.
- **ADR-015 tension.** ADR-015 rejected an "Ordinus-managed proxy layer" to
  keep Ordinus out of the data plane. That rejection targeted *remote*
  systems: proxying internet traffic would make Ordinus inherit every remote
  system's security surface, latency, and storage burden. A local child
  process that Ordinus itself spawns is a different situation — its security
  surface already belongs to Ordinus, and a loopback pass-through adds a
  management point rather than a new surface.

## Decision

Ordinus runs curated local MCP servers itself, in the main process domain, and
exposes them to agents as loopback HTTP — agents never see stdio.

**One rule, no exceptions:** every local MCP server in the catalog is spawned
and supervised by the main process and presented to agents through a single
loopback proxy endpoint (`127.0.0.1:<port>/<connectorId>`), regardless of
whether the server natively supports HTTP. From the agent's perspective a
local connector is indistinguishable from a remote `mcp-http` connector, so
the existing materialization paths for Claude / Codex / Gemini are reused
unchanged. This extends the loopback-server pattern established by ADR-029
(Ordinus internal MCP) and ADR-037 (scoped worker endpoints).

The model adds these layers:

- **Shared runtime bootstrap (lazy).** On first Connect of any uv-based
  connector, Ordinus downloads the single-binary `uv` into
  `app-data/runtimes/` once; all uv-based connectors share it. Future Node-
  based servers follow the same pattern with a portable Node. Package
  versions are pinned in the manifest (uvx auto-update behavior disabled);
  the connector package and its dependencies (including Chromium where
  needed) install under app-data on first Connect.

- **Supervisor + loopback proxy.** A main-process supervisor (generalization
  of `ordinus-mcp/lifecycle.ts`) owns process lifecycle. Servers that only
  speak stdio are fronted by a stdio↔HTTP bridge (MCP SDK
  `StdioClientTransport` + `StreamableHTTPServerTransport` back-to-back);
  servers with native streamable-http are still fronted by a thin
  pass-through proxy. The proxy gives every server: a stable agent-facing
  URL across restarts, a `lastUsedAt` observation point, metadata-level
  logging (which tool, when — never payloads), and the enforcement point for
  tool permissions. For stdio-bridged servers, v1 serializes concurrent
  requests through the single process; process pooling is deferred until a
  stateless server needs it.

- **Lifecycle policy (observation, not bookkeeping).** Lazy start at turn
  materialization when a bound agent needs the server. Shutdown is driven by
  observed traffic, not turn accounting: a server is stopped when
  `now − lastUsedAt` exceeds the idle timeout (~5 min for manifests marked
  `heavy`, e.g. Chromium-carrying servers) *and* no request is in flight.
  Cancelled or killed turns therefore never strand a process. Light servers
  may live until app quit. All servers shut down cleanly on `will-quit`.
  Crashes trigger on-demand restart; repeated rapid failures mark the
  connector "unhealthy" (Settings badge).

- **Connect = install + login; Disconnect = logout.** Connect lazily
  installs runtime + package, then runs the server's interactive login
  (e.g. LinkedIn's browser window), with all profile/session data redirected
  into app-data. `connected: true` means "agents can use this now" —
  scheduled runs never hit a surprise login. A health check detects expired
  sessions and surfaces "Reconnect required" as a Settings badge only (the
  notification layer is not mature enough to carry this). Disconnect stops
  the process and deletes session/profile data — credentials never outlive
  the user's intent — but keeps the installed runtime and package so
  reconnecting is login-only. No package/runtime garbage collection:
  installed bits stay until the app is removed (everything is under app-data,
  so app removal removes all of it).

- **Tool-level permissions, enforced at the proxy.** After install the
  supervisor calls `tools/list` and persists the real tool catalog. The
  manifest supplies safe defaults: read tools enabled, tools that act
  outwardly as the user (e.g. LinkedIn `send_message`,
  `connect_with_person`) disabled until the user enables them. Tools added
  by a server upgrade are born disabled. The user edits the selection per
  connector, globally, in Settings → Connections (not per agent; per-agent
  granularity can be added later since the proxy can attribute requests).
  Enforcement is real, not advisory: the proxy strips disabled tools from
  `tools/list` responses and rejects `tools/call` for them, independent of
  provider permission semantics.

- **Access model unchanged.** Local connectors bind to agents through the
  existing `agent.connectors[]` allowlist and CV-tab toggle. Ordinus (the
  assistant, ADR-029) does not receive local connectors — it stays internal
  and delegates external work to agents via `proposeWorkRequest`.

- **Versioning rides app releases.** The pin lives in the manifest, so
  connector upgrades ship with Ordinus updates after we test them — users
  never see a separate "MCP update" concept. The supervisor applies a pending
  pin change lazily at next server start; if the new version fails to start,
  the previous installed version (never deleted) serves as automatic
  rollback, with an "unhealthy" badge.

- **Persistence (minimal).** One table,
  `local_connector_state(connector_id, installed_version, tool_catalog,
  enabled_tools, last_health, updated_at)`. Manifests stay hardcoded in the
  registry; session data stays on the filesystem under app-data;
  `connected` remains derived, not stored.

This ADR **amends ADR-015's scope**: the "Ordinus is never a data pipe"
principle remains absolute for remote connectors (their traffic still flows
directly between the provider CLI and the external system), and is narrowed
for locally-managed servers, where a loopback pass-through proxy is accepted
because the process is already Ordinus's own child, nothing is persisted, and
observation stays at tool-call metadata level (consistent with ADR-011).

## Alternatives Considered

### Let users add their own MCP servers
- Pros: maximum flexibility, no catalog maintenance
- Cons: target audience does not understand MCP; arbitrary command execution
  surface; unbounded support burden
- Rejected: the catalog stays curated; capability growth comes from Ordinus
  shipping more connectors, not from user configuration.

### Provider CLIs spawn stdio servers directly (classic stdio config)
- Pros: zero new infrastructure; the "standard" MCP wiring
- Cons: three divergent adapter injection paths to build and maintain;
  concurrent agents spawn duplicate heavy processes (two Chromiums fighting
  over one browser profile); process lifetime is invisible to Ordinus —
  no idle shutdown, no health, no cleanup guarantee; per-process env/dir
  hygiene must be enforced in three places
- Rejected: the loopback model reuses the existing HTTP path everywhere and
  centralizes lifecycle, cleanliness, and observability.

### Hybrid: proxy only the heavy/stateful servers, direct stdio for light ones
- Pros: marginally less infrastructure for trivial servers
- Cons: two architectures to maintain and reason about; the adapter-side
  stdio path must exist anyway; per-server policy debates forever
- Rejected: the proxy's value (single injection path, lifecycle, permission
  enforcement, stable URLs) applies to every server; variation belongs in
  the manifest (`heavy`, `nativeHttp`, runtime), not in the architecture.

### Docker as the execution environment
- Pros: strong isolation, reproducible
- Cons: requires Docker Desktop on consumer machines
- Rejected: unacceptable prerequisite for a non-technical audience.

### Use system-installed runtimes (uvx/npx from PATH)
- Pros: no downloads
- Cons: usually absent on target machines; version drift outside our control
- Rejected: app-managed runtime bootstrap keeps install silent and versions
  pinned.

### Login on first tool use instead of at Connect
- Pros: Connect stays instant
- Cons: login window pops mid-turn; scheduled runs fail unattended;
  "connected" stops meaning "usable"
- Rejected: Connect performs install + login so agents (including scheduled
  ones) always find a ready session.

### Turn-refcount lifecycle instead of last-used observation
- Pros: deterministic ownership
- Cons: every cancel/crash/error path must decrement or the process leaks
  forever; bookkeeping-based mechanisms fail exactly where bookkeeping is
  forgotten
- Rejected: traffic observation (`lastUsedAt` + in-flight check at the
  proxy) is immune to missed decrements and handles user-stopped turns and
  cancelled work runs for free.

## Consequences

- Agent capability grows by shipping catalog entries; each new local
  connector is a manifest (runtime, package pin, defaults, flags) plus
  whatever per-server quirks its login flow has — no adapter changes.
- The supervisor/bridge/proxy module is new, permanent infrastructure in the
  main process (`electron-secure-boundary` applies: spawning stays in main,
  renderer sees only IPC summaries).
- First Connect of a heavy connector downloads runtime + package + possibly
  Chromium (~150 MB+); the UI must present this as visible preparation, not
  a hung button.
- Disk usage grows monotonically (no GC by design); acceptable because
  everything is in one removable app-data tree.
- Scraping-based servers (LinkedIn) break when the upstream site changes;
  the pin + app-release upgrade path makes us the bottleneck for fixes —
  accepted cost of curation. Health checks and the unhealthy badge bound the
  blast radius to a visible, per-connector state.
- Tool permission enforcement at the proxy gives one provider-independent
  security boundary, at the cost of the proxy being on the hot path for
  every local tool call (loopback latency, negligible).
- ADR-015 remains authoritative for remote connectors; this ADR narrows its
  data-plane principle for the local case as described above.
