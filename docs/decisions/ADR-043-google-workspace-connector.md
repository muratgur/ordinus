# ADR-043: Google Workspace Connector (Gmail / Calendar / Drive)

## Status

Accepted

## Date

2026-06-13

## Context

ADR-041 established the managed local MCP server infrastructure (supervisor,
loopback proxy, per-tool permissions, born-disabled outward actions) and
ADR-042 proved that Ordinus can author its own MCP server as a self-contained
`electron-node` sub-package (WhatsApp/Baileys). Google Workspace — Gmail,
Calendar, Drive — is the most-requested next connector.

An earlier expansion sketch (ADR-015 notes, 2026-06-10) proposed a thin Google
stdio adapter behind an Ordinus-owned static OAuth client, scoped to avoid the
Google CASA audit. That sketch **predated the local-MCP infrastructure and is
discarded.** The space was re-evaluated from scratch, and two facts (verified
June 2026) reshaped it:

1. **Google now ships official *hosted* Workspace MCP servers**
   (`gmailmcp.googleapis.com`, `calendarmcp.googleapis.com`,
   `drivemcp.googleapis.com`). But they are **Developer Preview** (not GA),
   require a **Web-application** OAuth client with a hosted HTTPS redirect (a
   desktop app with no backend does not fit), do not support Dynamic Client
   Registration, and **fix the scope set** (the Gmail server forces the
   restricted `gmail.readonly`). Not a foundation to ship on today.
2. **There is no usable API to create a consumer OAuth client.** The only
   programmatic path is the IAP "brand" API, which creates internal-only
   brands, allows one brand per project, breaks when made public, and itself
   needs pre-existing credentials. OAuth client creation and consent-screen
   configuration are **Cloud-Console-only** for external `@gmail.com` users.

The hard constraint behind every decision below: **Ordinus is a backend-less,
desktop-first app, and the maintainer cannot and will not stand up a verified
Google application.** Reading Gmail content requires the restricted
`gmail.readonly` scope, whose only public-launch path is a recurring annual
third-party **CASA security assessment** — a process the maintainer cannot
complete. A single Ordinus-owned OAuth app is therefore off the table.

## Decision

Ship a first-party Google Workspace connector as an Ordinus-authored MCP server
(`electron-node` sub-package under the ADR-041 supervisor), authenticated by a
**user-supplied ("bring your own") OAuth client** that the user creates in
their own Google Cloud project and keeps in Testing publishing status.

- **Spine: our own `google-mcp` sub-package, not Google's hosted MCP.** The
  server lives at `app/resources/google-mcp/` as an independent mini-package
  (own `package.json`/`node_modules`), calling Google REST endpoints with raw
  `fetch` — **no `googleapis` SDK** — to keep the dependency tree, and thus the
  supply-chain surface of the process that holds the user's token, minimal.
  Google's hosted MCP (option above) is *parked* for a possible future swap-in
  once it reaches GA and supports a desktop/loopback client. Community Google
  MCP servers are rejected (uncontrolled scopes running with the user's token);
  the Gemini Workspace extension is rejected (Gemini-CLI-only, would serve only
  Gemini-provider agents, breaking provider neutrality).

- **Authentication is BYO OAuth — no Ordinus-owned Google app, ever.** Each
  user creates their own Google Cloud project, enables the three APIs, and
  creates their own **Desktop-app** OAuth client, then pastes the credentials
  into Ordinus. This is not a workaround but the trust model: every request
  runs under the user's own app and their own consent — *"your data, your
  permissions, your app."* It also permanently removes verification and CASA
  from Ordinus's path. The cost — real setup friction for non-power-users — is
  accepted and mitigated by the wizard below.

- **Desktop-app client, loopback PKCE, no DCR.** The Desktop client type
  auto-allows `http://127.0.0.1:<any-port>` redirects, so the wizard needs no
  redirect-URI configuration and the existing dynamic-port loopback flow in
  `oauth-broker.ts` is reused as-is. The broker is forked only to **skip
  `registerClient()` (DCR)** and use the pasted `client_id`/`client_secret`
  directly. A new manifest `loginMode: 'byo-oauth'` selects this path.

- **The user's app stays in Testing publishing status.** Publishing to
  Production with the restricted `gmail.readonly` scope re-introduces
  verification and outright blocking, plus publish prerequisites (homepage,
  privacy policy, authorized domains) — exactly what BYO avoids. In Testing,
  the user is their own test user and all scopes (including restricted) work
  with no verification and no CASA. The single accepted cost: **Google expires
  Testing-mode refresh tokens after 7 days** — a hard clock that cannot be
  extended by refreshing or by usage; only re-consent resets it.

- **Re-auth is reactive.** When refresh fails (`invalid_grant`, typically the
  weekly Testing-mode expiry), the child emits a structured error; the
  supervisor sets a **"Reconnect required"** state (Settings badge; tool calls
  fail with a clear message; no proactive tracking and no OS notification in
  v1), reusing the ADR-042 pattern. Because the client credentials are stored,
  reconnect is a single click that re-runs consent (~5 s) — not a wizard redo.

- **One "Google" connector, not three.** A single OAuth client covers all four
  scopes, so there is one connect flow, one wizard, and one consent screen. The
  ADR-041 per-tool permission proxy already provides Gmail-vs-Calendar-vs-Drive
  granularity without three separate setups.

- **Scope and tool surface.** Scopes: `gmail.readonly`, `gmail.send`,
  `calendar.events`, `drive.readonly`. Read tools — `search_emails`,
  `get_email`, `list_events`, `get_event`, `search_files`, `read_file` — are
  born enabled. Outward/write tools — `send_email`, `create_event` — are born
  disabled per the ADR-041 outward-acting rule; the user opts in from
  Settings → Connections. Drive is **read-only** in v1: `drive.readonly` (not
  `drive.file`, which only exposes app-created or interactively-picked files
  and is useless to an autonomous agent with no Picker mid-turn).

- **Token custody: child self-refresh, env-injected.** Main runs the forked
  loopback PKCE flow and stores `client_id`/`client_secret`/`refresh_token` in
  the `safeStorage` vault. On child spawn it injects
  `{access_token, refresh_token, client_id, client_secret, token_uri}` through
  a minimal env (the ADR-042 `ORDINUS_WA_PHONE` precedent). The child
  self-refreshes hourly access tokens on 401; an unrecoverable `invalid_grant`
  surfaces as the structured error that drives "Reconnect required". The
  refresh token and (non-confidential, Desktop-type) client secret living in
  the child env was chosen over a main-brokered token-vending endpoint: the
  marginal boundary gain did not justify the extra machinery for a secret
  Google itself treats as non-confidential.

- **Lazy lifecycle, idle-reaped.** Unlike WhatsApp, Google is request/response
  with no live ingestion, so the child starts lazily on first tool call and is
  idle-reaped (`heavy: true`, ~5 min) — ADR-041's default policy, unchanged.

- **Disconnect keeps the BYO client; a separate action forgets it.**
  "Disconnect" wipes the tokens (and revokes where possible) but **keeps** the
  pasted `client_id`/`client_secret`, so reconnect needs no wizard redo. An
  explicit "Remove Google setup" clears the BYO client entirely.

- **Guided BYO setup wizard.** Because automation is impossible, the wizard is
  the friction-reduction surface: in-app numbered steps with deep-link buttons
  to each exact console page — including the **one-shot multi-API enable URL**
  (`…/flows/enableapi?apiid=gmail.googleapis.com,calendar-json.googleapis.com,drive.googleapis.com`)
  — copy buttons for every value, **"paste the downloaded client JSON"** as the
  primary credential input (auto-extracting `client_id`/`client_secret` to kill
  copy-paste errors), and **paste-and-validate** that runs consent immediately
  and translates raw Google errors into plain-language fixes (e.g. "add
  yourself as a test user → here"). Screenshots/video live on a hosted,
  updatable guide page rather than baked into the binary, because the Google
  Cloud console UI changes and embedded images go stale.

### Phasing

- **Phase 0 — assumption-killer PoC (terminal only, throwaway).** ~50-line
  script run via `ELECTRON_RUN_AS_NODE=1` against a hand-made Desktop OAuth
  client: prove the forked loopback PKCE flow (static client, no DCR) obtains a
  token, make one real `gmail.users.messages.list` call, confirm hourly refresh
  works, and observe the `invalid_grant` shape. Validates the riskiest unknowns
  before any infrastructure.
- **Phase 1 — OAuth + wizard infrastructure.** `oauth-broker` fork (static
  client), vault storage, `loginMode: 'byo-oauth'` manifest, the guided wizard
  UI, and connect/disconnect/reconnect wiring including the "Reconnect
  required" mapping.
- **Phase 2 — server + read tools.** `google-mcp` sub-package (raw-fetch REST,
  self-refresh), the six read tools, lazy/idle supervisor integration, born
  defaults enforced at the proxy. **End of Phase 2 is the shippable v1.**
- **Phase 3 — `send_email` + `create_event`** (born disabled), as a separate PR
  so the outward-acting tools are reviewed in isolation.

## Alternatives Considered

### Google's official hosted Workspace MCP
- Pros: zero API maintenance; Google owns tool quality, security, freshness;
  fits the existing remote `mcp-http` connector shape.
- Cons: Developer Preview (not GA); Web-application client with a hosted HTTPS
  redirect (Ordinus has no backend); no DCR; scopes fixed by Google, forcing
  restricted `gmail.readonly`.
- Rejected for now, parked for a GA swap-in: unshippable on a preview API, and
  it would surrender scope control for no net gain under BYO.

### Ordinus-owned, verified Google OAuth app
- Pros: zero per-user setup friction; one polished consent screen.
- Cons: requires Google brand verification and, for Gmail read, a recurring
  annual CASA assessment the maintainer cannot complete; concentrates every
  user's access under one app identity.
- Rejected: the verification/CASA path is closed to this project, and BYO is a
  stronger trust story besides.

### Gemini Workspace CLI extension
- Pros: official-adjacent, maintained, already wraps Google REST.
- Cons: runs only inside Gemini CLI, so it would serve only Gemini-provider
  agents; ties auth to Gemini's mechanism.
- Rejected: breaks Ordinus's provider-neutral model (Claude/Codex/Gemini
  agents are interchangeable).

### Community Google Workspace MCP server
- Pros: mature, broad tool coverage.
- Cons: third-party code running on the user's machine with the user's Google
  token under scopes Ordinus does not control; supply-chain exposure.
- Rejected: reference material only.

### `googleapis` SDK instead of raw `fetch`
- Pros: official client, handles edge cases.
- Cons: large dependency tree inside the token-holding child process.
- Rejected: the v1 endpoint set is tiny; raw `fetch` keeps the sub-package lean
  and the supply-chain surface minimal, consistent with ADR-042.

### `drive.file` (non-sensitive) instead of `drive.readonly`
- Pros: non-sensitive scope, cleaner consent line.
- Cons: exposes only app-created or interactively-picked files; an autonomous
  agent has no Picker mid-turn, so it cannot find or read the user's existing
  Drive.
- Rejected: near-zero agent utility; under BYO+Testing the restricted scope is
  free anyway.

### Proactive re-auth (track issue time, OS-notify)
- Pros: catches the weekly expiry before a background/scheduled run fails.
- Cons: more machinery for a v1; the clock is unbeatable regardless.
- Rejected for v1: reactive "Reconnect required" reuses the ADR-042 pattern
  exactly; revisit if scheduled-task breakage proves painful.

### Main-brokered token vending over loopback
- Pros: the refresh token and client secret never leave the main process.
- Cons: a token-vending endpoint plus child fetch-before-call logic, for a
  secret Google's Desktop client type treats as non-confidential.
- Rejected: child self-refresh is simpler and the boundary gain is marginal.

## Consequences

- **Real per-user setup friction.** Even with the guided wizard, a first-timer
  faces ~10 minutes of Google Cloud Console work (project, three APIs, consent
  screen, Desktop client, paste). This is the accepted price of the no-CASA,
  no-Ordinus-app trust model and is the connector's main adoption risk;
  non-power-users will struggle and some will not complete it.
- **Weekly reconnect in Testing mode.** The 7-day refresh-token expiry is a
  permanent, unavoidable nuisance for every user; it is handled gracefully but
  not eliminated. Scheduled/background agent runs can hit a dead token and fail
  until the user reconnects (reactive policy).
- **`oauth-broker.ts` gains a static-client branch** (skip DCR), and the
  manifest type gains `loginMode: 'byo-oauth'` plus BYO credential storage —
  the first connector whose OAuth client is user-supplied rather than
  discovered or Ordinus-owned.
- **Ordinus owns the Google REST integration** (endpoint shapes, token refresh,
  error mapping) rather than depending on an upstream wrapper; protocol changes
  are our maintenance. The version-pin + app-release upgrade path (ADR-041)
  applies to the sub-package.
- **A new `electron-node` sub-package** (`app/resources/google-mcp/`) needs the
  same dev/CI setup step and extra-resources packaging entry as the WhatsApp
  sub-package.
- **The trust story is genuinely stronger** than an Ordinus-owned app: data
  never leaves the machine, consent is the user's own app asking the user's own
  permission, and there is no shared application identity to compromise.
