# ADR-046: X (Twitter) Connector

## Status

Accepted

## Date

2026-06-14

## Context

ADR-041 established the managed local MCP server infrastructure (supervisor,
loopback proxy, per-tool permissions, born-disabled outward actions); ADR-042
proved Ordinus can author its own MCP server as a self-contained `electron-node`
sub-package (WhatsApp/Baileys); and ADR-043 added the **BYO-OAuth** pattern — a
user-supplied OAuth client, `loginMode: 'byo-oauth'`, a static-client fork of
`oauth-broker.ts` (no DCR), and a guided setup wizard. X (Twitter) is the next
requested connector: let agents read from X and, primarily, **post** to it.

X is people's public-but-personal space, so the official path is preferred on
principle where one exists. It does. Two facts (verified June 2026) shape every
decision below:

1. **X has no official hosted MCP server and no DCR-capable MCP endpoint.** The
   remote `mcp-http` + Dynamic Client Registration shape used for Atlassian and
   Datadog (ADR-015) is physically unavailable. The only sanctioned integration
   surface is the **X API v2** REST endpoints.
2. **X API economics changed in February 2026.** New developers default to
   **pay-per-use** — roughly **$0.01 per post written, $0.005 per post read**
   (≈2M reads/month cap); the free tier was discontinued for new signups and the
   flat $200 Basic / $5,000 Pro tiers are legacy-only. **Reading is no longer
   free** — every read accrues cost on the developer's own bill — while writing
   is cheap. The intended use here is **write-heavy with light reads**, so the
   official API is economically viable; this also removes the temptation to
   collect timeline data via scraping.

The hard constraints: Ordinus is a backend-less, desktop-first app; the
maintainer will not stand up a central X application or absorb per-user API
costs; and posting to X is public and near-irreversible, raising the stakes of
any outward action above a private WhatsApp message.

## Decision

Ship a first-party X connector as an Ordinus-authored MCP server
(`electron-node` sub-package under the ADR-041 supervisor), authenticated by a
**user-supplied ("bring your own") X developer app** and talking to X API v2 via
raw `fetch`. It is the **twin of the Google connector (ADR-043)** with one
deliberate divergence forced by X's token model (refresh-token rotation, below).

- **Spine: our own `x-mcp` sub-package.** Lives at `app/resources/x-mcp/` as an
  independent mini-package (own `package.json`/`node_modules`), `electron-node`
  runtime, calling X API v2 endpoints with raw `fetch` — no Twitter SDK — to
  keep the dependency tree, and thus the supply-chain surface of the process
  that holds the user's token, minimal (the ADR-042/043 precedent). Community X
  MCP servers are rejected (uncontrolled scopes running with the user's token).

- **Official API only; scraping and unofficial clients rejected.** Reasons: X
  actively bans scraping and unofficial automation; it violates the "people's
  personal space" ethic of using the sanctioned path; and it would reproduce the
  WhatsApp session-invalidation pain (ADR-042) on a public surface. Write-heavy
  intent makes the paid-read economics tolerable, so there is no functional
  pressure toward grey methods.

- **Authentication is BYO-app — no Ordinus-owned X app, ever.** Each user
  creates their own X developer app, enables OAuth 2.0, adds the loopback
  redirect, and pastes `client_id`/`client_secret` into Ordinus. The trust model
  is the same as Google: every request runs under the user's own app and consent
  — *"your account, your app, your bill."* A single central app is rejected
  outright: it would pool every Ordinus user's traffic into one rate-limit
  bucket and one invoice, make the maintainer the payer under pay-per-use, and
  create a single point of failure for X's discretionary app suspensions. The
  setup friction is real and accepted — this is an advanced use case — and
  mitigated by the guided wizard (ADR-043 precedent).

- **User-context OAuth 2.0, loopback PKCE, no DCR.** Posting requires
  **user-context OAuth 2.0 Authorization Code + PKCE** (app-only bearer tokens
  cannot write). The ADR-043 static-client fork of `oauth-broker.ts` (skip
  `registerClient()`, use the pasted credentials directly) is reused. (ADR-052
  later folds this static-client loopback machinery into a shared
  `runLoopbackAuth` helper common to all OAuth connectors; X's fixed-port and
  main-process rotating-refresh divergences below are unaffected.) Manifest:
  `transport: 'mcp-stdio'`, `authMethod: 'oauth'`, `kind: 'local'`, `loginMode:
  'byo-oauth'`, with `byoOAuth` pointing at X's static endpoints — authorize
  `https://x.com/i/oauth2/authorize` (**`x.com`, not `twitter.com`** — the latter
  stalls at login; Phase 0 finding), token
  `https://api.twitter.com/2/oauth2/token`.
- **Fixed loopback redirect port, chosen once at setup — a second divergence
  from the Google twin.** Unlike Google's Desktop client, which auto-allows any
  `http://127.0.0.1:<port>` redirect, **X requires the redirect URI to match a
  pre-registered value exactly, including port and path** (Phase 0, verified).
  The redirect URI must be registered in the X app *before* the OAuth flow runs,
  so the port cannot be re-chosen per launch (that would force re-registration
  each time). Instead, the wizard's setup step **probes a small candidate range
  (e.g. 8723–8730), picks the first free port, shows the user the exact callback
  URL to register, and persists the chosen port** alongside the BYO client. Every
  subsequent Connect/Reconnect binds that persisted port. If it is occupied at a
  later auth moment (rare, and only during the interactive flow — never during
  normal tool use), the broker fails gracefully and offers to re-run setup with a
  newly probed port (a one-line update in the X console). This keeps a single,
  stable, exact-match URL while adapting to whatever port is free on the user's
  machine. Public ("Native App") client confirmed in Phase 0: no client secret,
  so the token endpoint needs no Basic auth and the vault stores only
  `client_id` (plus the chosen redirect port) under `byo:x`.

- **Refresh authority lives in the main process — the one divergence from the
  Google twin.** X OAuth 2.0 PKCE refresh tokens are **single-use and rotating**:
  every refresh returns a *new* refresh token and invalidates the old one.
  Google's child-self-refresh model (ADR-043) would silently break here — a
  child that refreshes, then is idle-reaped before persisting the rotated token,
  would leave the vault holding a consumed refresh token, so the next spawn fails
  with `invalid_grant` and the user faces "Reconnect required" after every use.
  Therefore the **supervisor (main process) owns refresh**: it refreshes the
  vault token before spawning the child (and within a turn as needed),
  **writes the rotated refresh token back to the `safeStorage` vault**, and
  injects only a fresh, short-lived access token into the child. The child is
  **stateless** with respect to credentials, so idle-reap causes no token loss.
  Correctness was chosen over code symmetry with Google; authoring each connector
  as its own sub-package is precisely what makes this per-service tailoring clean.

- **Scope and tool surface.** Scopes: `tweet.read`, `tweet.write`, `users.read`,
  `like.write`, `follows.write`, `offline.access` (the last is mandatory to
  obtain a refresh token). Read tools — `get_my_profile`, `get_tweet`,
  `search_recent_tweets`, `get_user_timeline`, `get_mentions` — are **born
  enabled**. Outward/interaction tools — `post_tweet`, `reply_to_tweet`,
  `post_thread`, `delete_tweet`, `like_tweet`, `retweet`, `follow_user` — are
  **born disabled** per the ADR-041 outward-acting rule. The convention is held
  *even though writing is the primary use case*: a public post is reputationally
  higher-stakes and less reversible than a private message, so the safe default
  wins and the user opts in. The connect wizard's final step surfaces an explicit
  "enable posting" toggle so a write-heavy user flips it once during setup rather
  than hunting for it later.

- **No extra confirmation layer.** Three independent gates already stack:
  per-tool `enabledTools`, per-agent `connectors[]` binding, and the provider's
  own in-turn approval gate. A mandatory per-post human-confirmation step (à la
  the Telegram inline-confirmation flow, ADR-044) is **not** added in v1 — it
  would be over-engineering on top of those three layers. Posting behaviour the
  user wants to constrain further is expressed in the agent's prompt.

- **Tool-only; not a trigger source.** v1 is **pull/request-response only**:
  agents read or write X when invoked (directly or by a scheduled task). X is
  **not** wired into the ADR-044 inbound/trigger layer. A push model (e.g.
  "react when @mentioned") would require continuous polling — filtered streams
  are Pro-tier ($5,000) only — which on pay-per-use becomes a permanent,
  always-on read-cost leak, the exact opposite of the write-heavy/light-read
  intent. Reactive needs are served by **scheduled agent tasks** (e.g. "every
  morning, review my mentions and draft replies"), which puts the read cadence —
  and its cost — under the user's explicit control rather than an always-on
  poller's.

- **Lean payload at the server.** Read tools return a **lean projection**
  (shared `toLeanTweet()` / `toLeanUser()` mappers — `id`, `text`, `author`,
  `created_at`, and only the essential metrics), never raw X JSON
  (`entities`/`includes`/full metrics), keeping the ADR-037 token-efficiency
  spirit: trim at the server, not in the agent's context. This is field
  selection, not a behavioural limit — it does not constrain what the agent can
  do.

- **No server-side page cap or spend budget in v1.** An earlier proposal to clamp
  `max_results` on list-returning tools was **rejected**: it is leaky pretend-
  protection (an agent simply calls four times for the same cost) and layers an
  Ordinus-invented constraint over the X API. Real cost control — a user-visible
  spend/call budget — is a separate, larger design deferred to a later ADR. Under
  BYO the bill is visible in the user's own X console, where they can also set
  limits. The connector passes X's native pagination defaults through unchanged.

- **Lazy lifecycle, idle-reaped (`heavy: true`).** X is request/response with no
  live ingestion, so the child starts lazily on first tool call and is idle-
  reaped (~5 min) — ADR-041's default, like Google and unlike persistent
  WhatsApp. At steady state, zero connector processes run.

- **Disconnect keeps the BYO client; a separate action forgets it.** Vault keys
  mirror Google: `tok:x` (rotating tokens) and `byo:x` (client credentials).
  "Disconnect" wipes the tokens; an explicit "Remove X setup" clears the BYO
  client. A guided `XConnectDialog` wizard deep-links to the X developer portal
  steps, with paste-and-validate that runs consent immediately and translates raw
  X errors into plain-language fixes.

### Phasing

- **Phase 0 — assumption-killer PoC (terminal only, throwaway). ✅ DONE
  (2026-06-14).** Against a hand-made BYO X app, all three unknowns resolved:
  static-client loopback PKCE obtained a user-context token (`/users/me` 200);
  real `POST /2/tweets` (201), `GET /2/tweets/search/recent` (200), and `DELETE
  /2/tweets/:id` (200) all worked; and — the riskiest unknown — **refresh-token
  rotation/single-use is confirmed**: refresh #1 succeeded and returned a *new*
  refresh token, reusing the *old* one failed (400, "token was invalid"), and the
  *new* one succeeded. This proves the main-process-refresh + write-back-to-vault
  divergence is mandatory. Two further findings folded into the Decision above:
  the authorize host must be `x.com` (not `twitter.com`), and X requires a
  fixed, exactly-pre-registered loopback redirect (no any-port flow).
- **Phase 1 — OAuth + wizard infrastructure.** Reuse the ADR-043 static-client
  broker; add **main-process refresh with rotated-token write-back**; vault
  storage (`tok:x`/`byo:x`); `XConnectDialog` wizard; connect/disconnect/
  reconnect wiring and the "Reconnect required" mapping.
- **Phase 2 — server + read tools.** `x-mcp` sub-package (raw-fetch X API v2,
  lean mappers), the five read tools, lazy/idle supervisor integration, born
  defaults enforced at the proxy. **End of Phase 2 is the shippable v1.**
- **Phase 3 — write/interaction tools** (`post_tweet`, `reply_to_tweet`,
  `post_thread`, `delete_tweet`, `like_tweet`, `retweet`, `follow_user`; born
  disabled), as a separate PR so outward-acting tools are reviewed in isolation.

## Alternatives Considered

### Scraping / unofficial X client
- Pros: free reads; no developer-app setup; richer timeline access.
- Cons: actively banned by X; session invalidation and account-ban risk;
  violates the sanctioned-path ethic for a personal space; reproduces the
  WhatsApp invalidation pain on a public surface.
- Rejected: write-heavy intent makes paid reads tolerable, so there is no
  functional need to take this risk.

### Remote `mcp-http` + DCR (the Atlassian/Datadog shape)
- Pros: no local process; reuses the ADR-015 broker as-is.
- Cons: X ships no hosted MCP server and no DCR-capable endpoint.
- Rejected: physically unavailable.

### `api` transport (raw REST from inside the main process, no MCP child)
- Pros: one fewer process.
- Cons: the bearer token would have to be handed to the agent's shell/context
  (curl), breaking Ordinus's "agent never sees credentials, observes only
  metadata" broker model; no per-tool permission chokepoint; the agent must
  hand-roll X API v2 endpoints, pagination, and error handling. The "lighter"
  win is illusory — idle-reap already zeroes the process cost.
- Rejected: loses token custody and governance for no real gain.

### Central Ordinus-owned X app
- Pros: zero per-user setup friction; one consent screen.
- Cons: pools all users into one rate-limit bucket and one invoice; makes the
  maintainer the payer under pay-per-use; single point of failure for X's
  discretionary app suspensions.
- Rejected: unscalable and economically untenable; BYO is the stronger trust
  story besides.

### Child self-refresh (Google's ADR-043 token model)
- Pros: code symmetry with the Google connector.
- Cons: X rotates refresh tokens on every use; a child that refreshes then is
  idle-reaped before persisting loses the rotated token, breaking the next spawn
  with `invalid_grant`.
- Rejected: correctness over symmetry — refresh authority moves to the main
  process, which writes the rotated token back to the vault.

### Write tools born enabled (break the outward-acting convention)
- Pros: matches the write-heavy primary use case out of the box.
- Cons: a public post is high-stakes and near-irreversible; an accidental or
  looped post is worse than a private mis-send.
- Rejected: hold the ADR-041 convention; the wizard's final "enable posting"
  toggle removes the friction without lowering the default.

### X as an inbound trigger source (mention/DM → agent)
- Pros: reactive "reply when mentioned" behaviour.
- Cons: requires continuous polling (filtered streams are Pro-tier only), an
  always-on read-cost leak on pay-per-use; pulls in the ADR-044 trigger
  subsystem.
- Rejected for v1: scheduled agent tasks deliver reactive behaviour with the
  read cadence and cost under the user's control.

### Server-side page cap / mandatory per-post confirmation / spend budget
- Pros: appear to bound cost and risk.
- Cons: a page cap is leaky (the agent re-calls for the same cost) and layers an
  Ordinus constraint over the X API; a confirmation layer duplicates the three
  existing gates; a real spend budget is a larger design.
- Rejected for v1: lean payload is kept (it is field selection, not a limit);
  genuine cost control is deferred to a later ADR.

## Consequences

- **Per-user setup friction, by design.** A first-timer must create an X
  developer app, enable OAuth 2.0, add the loopback redirect, and (under
  pay-per-use) attach a payment method. This is the accepted price of the
  no-central-app, user-pays trust model and is the connector's main adoption
  risk; it is positioned as an advanced feature.
- **The user bears API cost directly.** Reads accrue at ~$0.005 each and writes
  at ~$0.01 on the user's own X bill. Ordinus exposes lean payloads but adds no
  spend guardrail in v1, so an agent in a read loop can quietly run up the
  user's invoice — mitigated only by the user's own X-console limits until the
  deferred budget design lands.
- **`oauth-broker`/refresh path gains a rotating-token write-back branch** —
  the first connector whose refresh token must be persisted back on every
  refresh, owned by the main process rather than the child. This diverges
  intentionally from the Google connector's child-self-refresh.
- **A new `electron-node` sub-package** (`app/resources/x-mcp/`) needs the same
  dev/CI setup step and extra-resources packaging entry as the WhatsApp and
  Google sub-packages; the ADR-041 version-pin + app-release upgrade path
  applies.
- **Ordinus owns the X REST integration** (endpoint shapes, token rotation,
  error mapping) rather than depending on an upstream wrapper; protocol changes
  are our maintenance.
- **The trust story matches Google's:** data flows directly between the user's
  own app and X, consent is the user's own app asking the user's own permission,
  and there is no shared application identity to compromise.
