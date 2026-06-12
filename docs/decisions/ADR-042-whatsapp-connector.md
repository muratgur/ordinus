# ADR-042: WhatsApp Connector (Baileys)

## Status

Accepted

## Date

2026-06-13

## Context

ADR-041 established the managed local MCP server infrastructure and shipped
its first real connector (LinkedIn, `uv` runtime, browser-based interactive
login). WhatsApp is the next catalog entry, and it differs from LinkedIn in
three structural ways:

1. **No existing server fits.** Community WhatsApp MCP servers
   (lharries/whatsapp-mcp and forks) wrap the Go library `whatsmeow`, which
   would force a per-platform compiled Go binary plus a Go↔MCP bridge into the
   app. Baileys — whatsmeow's actively-maintained TypeScript sibling
   (WhiskeySockets, pure websocket, no browser/puppeteer) — runs directly in
   Node, so Ordinus writes its own small MCP server instead of wrapping a
   foreign binary.
2. **Login is pairing, not browser.** WhatsApp links a device via QR code or
   an 8-digit pairing code typed into the phone. Unlike LinkedIn, the server
   cannot open its own login window; Ordinus must surface the code in its own
   UI.
3. **The server is also an ingester.** Useful tools ("what was said in this
   chat") require a local message store fed by WhatsApp's one-time history
   sync plus the live event stream. A process that only wakes on tool calls
   would miss messages and reconnect frequently — and frequent
   connect/disconnect cycles are themselves a ban-risk signal for an
   unofficial client.

Standing risk: Baileys (like whatsmeow) is an unofficial client. Meta may
invalidate sessions (community experience: re-auth needed after ~20 days) or
ban accounts exhibiting automation patterns, especially bulk or cold-contact
sending.

## Decision

Ship a first-party WhatsApp connector: an Ordinus-authored TypeScript MCP
server built on Baileys, running as an `electron-node` child under the
ADR-041 supervisor.

- **Self-contained sub-package.** The server lives at
  `app/resources/whatsapp-mcp/` as an independent mini-package with its own
  `package.json` and `node_modules` (Baileys + MCP SDK only). Dependencies
  never enter the main app bundle; a setup script installs them, and
  packaging copies the directory as an extra resource.

- **Pure-JS storage via `node:sqlite`.** The `electron-node` runtime re-runs
  the Electron binary with `ELECTRON_RUN_AS_NODE=1`, i.e. Electron's bundled
  Node (≥22), whose built-in `node:sqlite` removes the only native-module
  candidate (`better-sqlite3`) and with it the entire Electron-ABI rebuild
  problem. The sub-package stays pure JavaScript.

- **Pairing-code login, not QR (v1).** Connect opens a dialog asking for the
  phone number (with a one-line unofficial-client risk warning), then shows
  the 8-digit code WhatsApp expects under Linked Devices → "Link with phone
  number". Pairing-code needs no QR rendering, no ~20 s refresh loop, and no
  camera; QR can be added later if onboarding friction demands it.
  `loginMode: 'pairing'` is the new manifest value.

- **Two-phase login, LinkedIn-shaped.** Login is a separate child run that
  does one thing — pair, write session files to `${sessionDir}`, exit 0 —
  reusing the existing "exit 0 = login succeeded" supervisor contract. During
  the run the child emits line-delimited JSON events on stdout
  (`{"event":"pairing-code","code":…}`, `paired`, `error`), which a
  `runPairingLogin` supervisor variant forwards to the renderer dialog.
  "Get a new code" restarts the login run (codes expire in ~1 min). After
  exit 0 the supervisor marks the connector connected and starts the normal
  service process. The one-shot cost of a second WhatsApp connection at
  Connect time buys a single supervisor contract and no
  login-process-becomes-service error paths.

- **Persistent lifecycle (amends ADR-041).** While connected, the service
  process runs for the lifetime of the app instead of being idle-reaped:
  manifest gains `lifecycle: 'persistent'`, which the idle reaper skips. The
  store stays current, tool calls are instant, and the connection stays
  single and stable instead of cycling — relying on WhatsApp's offline queue
  to backfill reaped gaps was judged too fragile, and reconnect churn
  increases ban risk. ADR-041's lazy/idle policy remains the default for all
  other connectors.

- **Message store: text-only, lives and dies with the session.** Schema is
  minimal: `chats` (jid, name, last message time) and `messages` (id,
  chat_jid, sender, timestamp, text, from_me). Media is not downloaded in
  v1 — messages carry a type placeholder ("[image]", "[audio]"). Group chats
  are stored. No retention/quota in v1 (text rows are cheap; revisit if real
  usage proves otherwise). The database file lives inside `${sessionDir}`,
  so ADR-041's existing rule — Disconnect deletes the session directory —
  also deletes all message history, matching the LinkedIn trust story.
  Switching accounts is therefore Disconnect (wipe) + Connect (fresh store);
  as a belt-and-braces guard the server records the paired number in the
  store and resets it on mismatch.

- **Tool surface and defaults.** `search_contacts`, `list_chats`,
  `get_messages` are born enabled — the user explicitly linked their own
  messages, and a WhatsApp connector that cannot read messages is useless.
  `send_message` is born disabled per the ADR-041 outward-acting rule; the
  user enables it in Settings → Connections.

- **`send_message` guardrails (in the server, not the proxy).** Three
  WhatsApp-specific limits live inside the tool implementation, because the
  proxy stays domain-agnostic: text only (no media send); recipients must be
  existing chats in the store (agents cannot cold-contact arbitrary
  numbers — structurally blocks the highest-risk automation pattern); and a
  simple send queue enforces a minimum delay of a few seconds between
  messages. No additional per-send confirmation layer: consent lives in the
  born-disabled toggle, consistent with ADR-041.

- **Session loss → "Reconnect required", data kept.** When Baileys reports
  `loggedOut` (expired session or the user unlinking from the phone), the
  service child exits with a dedicated code (41); the supervisor sets a
  "Reconnect required" state (Settings badge; tool calls fail with a clear
  message; no OS notification in v1). Session directory and store are *not*
  deleted — unlinking on the phone is not a data-deletion request; deletion
  belongs to the explicit Disconnect button.

### Phasing

- **Phase 0 — assumption-killer PoC (terminal only, throwaway).** ~40-line
  script run via `ELECTRON_RUN_AS_NODE=1`: Baileys v7 pairing-code login,
  read one live message, write/read one row via `node:sqlite`. Validates the
  four risky assumptions before any UI work.
- **Phase 1 — login infrastructure.** `loginMode: 'pairing'`,
  `runPairingLogin`, phone/code dialog, risk warning, exit-41 →
  "Reconnect required".
- **Phase 2 — server + store + read tools.** Sub-package, persistent
  lifecycle, history sync + live ingestion, the three read tools.
  **End of Phase 2 is the shippable v1.**
- **Phase 3 — `send_message`** with the guardrails above, as a separate PR
  so the highest-risk piece is reviewed in isolation.

## Alternatives Considered

### Wrap whatsmeow (Go) like the community servers
- Pros: battle-tested library, existing MCP servers to copy
- Cons: per-platform Go binary compilation and signing; a Go↔MCP bridge
  layer; `runtime: 'binary'` infrastructure that nothing else needs
- Rejected: Baileys gives the same protocol coverage inside the Node runtime
  the app already has.

### QR login in v1
- Pros: the flow WhatsApp users already know; no phone-number entry
- Cons: QR rendering plus ~20 s refresh churn through child→IPC→dialog;
  strictly more UI and protocol work than displaying a static code
- Rejected for v1: pairing-code is the minimal correct path; QR can be added
  later without changing the supervisor contract.

### better-sqlite3 for the store
- Pros: already used (and trusted) in the main app
- Cons: native module → must be rebuilt against Electron's ABI inside the
  sub-package, on every Electron upgrade, on every platform
- Rejected: `node:sqlite` is built into the child's runtime and reduces the
  sub-package to pure JS.

### Lazy lifecycle + WhatsApp offline queue backfill
- Pros: zero infrastructure change; consistent with every other connector
- Cons: store goes stale while reaped; correctness depends on WhatsApp's
  offline-delivery behavior; cold start on every tool call; reconnect churn
  looks like automation
- Rejected: the store is half the connector's value; a persistent flag is a
  small, honest amendment.

### Single-phase login (login process becomes the service)
- Pros: one fewer WhatsApp connection at Connect time
- Cons: breaks the "exit 0 = login done" supervisor contract; introduces
  login-crashed-mid-transition and half-paired states the supervisor must
  reason about
- Rejected: the second connection is a one-time, seconds-long cost.

### Delete data on session loss (logged-out)
- Pros: stricter security reading of "unlink = revoke"
- Cons: punishes routine ~20-day session expiry with full history loss;
  conflates the phone's device list with Ordinus data consent
- Rejected: deletion stays tied to the explicit Disconnect action.

## Consequences

- First Ordinus-authored MCP server: we own protocol-breakage risk (Baileys
  major versions, WhatsApp protocol changes) instead of waiting on an
  upstream wrapper. The version pin + app-release upgrade path (ADR-041)
  applies unchanged.
- `lifecycle: 'persistent'` is new supervisor vocabulary; the idle reaper
  must skip such connectors and `will-quit` shutdown must include them.
- A connected WhatsApp keeps a child process and a websocket alive for the
  whole app session (~50–100 MB memory) — accepted as the price of a
  trustworthy store.
- The unofficial-client risk is disclosed at Connect time and mitigated
  structurally (read-heavy defaults, send born disabled, no cold contact,
  send throttling), but cannot be eliminated; account bans remain possible
  and this remains the user's informed choice.
- Sub-package `node_modules` needs a setup step in dev/CI and an
  extra-resources entry in packaging — a new, small moving part in the build.
- `node:sqlite` is formally experimental in Node; its sync API has been
  stable across releases and our usage is trivial, but Phase 0 explicitly
  verifies it loads under `ELECTRON_RUN_AS_NODE`.
