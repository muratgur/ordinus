# ADR-052: System-Browser OAuth Unification for Connections

## Status

Accepted

## Date

2026-06-16

## Context

The Connections feature authenticates OAuth connectors through two
**accidentally divergent** code paths in `oauth-broker.ts`:

1. **DCR connectors** (Datadog, Linear, Notion, Canva, Atlassian — ADR-015):
   `authorizeConnector()` discovers auth-server metadata (RFC 8414), dynamically
   registers a client (RFC 7591), then opens the consent screen in an **embedded
   Electron `BrowserWindow`** (`new BrowserWindow()` + `loadURL()`), catching the
   redirect on a `127.0.0.1/callback` loopback server.
2. **BYO-OAuth connectors** (Google — ADR-043; X — ADR-046):
   `authorizeStaticClient()` uses a user-supplied static client (no DCR) and
   opens the consent screen in the **user's system default browser** via
   `shell.openExternal()`, catching the redirect on the *same* loopback shape.

The embedded `BrowserWindow` is a blank, signed-out browser profile. The user's
saved passwords, password manager, and existing provider sessions are not
present, so connecting Datadog/Atlassian/etc. forces a manual
username/password entry the user would otherwise never perform — and a password
prompt in an unfamiliar, chromeless window reads as suspicious ("what is this
asking for my password?"). The BYO path has none of this: it lands in the user's
real browser where the provider session and autofill already exist.

Investigation (during the design grilling) established there is **no hard
constraint** behind the embedded window — the BYO path proves the system browser
hits the identical loopback. The split is an under-considered implementation
artifact, not a deliberate design. The BYO code comment even records that
providers reject OAuth in embedded webviews (`disallowed_useragent`); the DCR
providers happen to tolerate it, so it shipped, but it never had a load-bearing
reason.

Two further facts shape the decision:

- The embedded window quietly provided three lifecycle behaviors the system
  browser does not: a `closed` event (instant cancel/abort signal), an automatic
  app-refocus when the owned window was closed on success, and a visible
  "abandoned" state. Removing it removes all three, which must be replaced.
- The DCR callback handler has two latent defects masked by the embedded window:
  it serves the "You can close this window and return to Ordinus" success page
  **unconditionally, before validating** `code`/`state`, and it **ignores the
  `error` query param** entirely — so a consent denial both shows a misleading
  success page and collapses with a genuine `state` mismatch (a security signal)
  into one vague "cancelled or returned an invalid state" message. With the
  system browser, "Deny → redirect with `?error=`" becomes a common, user-visible
  path rather than a hidden one.

## Decision

**Unify all OAuth connectors onto the system default browser
(`shell.openExternal`) + the existing `127.0.0.1/callback` loopback, and delete
the embedded `BrowserWindow` branch entirely.** Every brokered OAuth connector —
DCR and BYO alike — lands the user in their real browser, where saved passwords
and existing provider sessions remove the friction and the unease.

- **One shared loopback auth helper.** Extract `runLoopbackAuth({ connectorId,
  authMeta, client, port, scopes })` that owns everything downstream of "I have
  an authorize URL and a port": the loopback server, the `shell.openExternal`
  call, the timeout, the cancel registration (`pendingStaticAuth`), the
  validate-before-respond branching, the token exchange, credential storage, and
  the success-refocus. The two callers shrink to their **only genuine
  difference — client acquisition**: the DCR caller runs discovery +
  `registerClient()` then calls the helper; the BYO caller resolves the static
  client (and fixed/dynamic port — X locks 8723–8730 per ADR-046) then calls the
  helper. Client acquisition stays in its own functions; only the
  post-authorize-URL machinery merges. This kills the existing copy-paste drift
  (success pages already say "tab" vs "window"; error strings already diverge)
  and ensures the lifecycle fixes below land **once**, identical by construction
  rather than by discipline.

- **DCR waiting surface = inline row state, not a modal.** DCR connectors today
  have no modal — the embedded window *was* the UI. Once it is deleted, the
  connector's row in the Connections list carries the waiting state: the row's
  button (already disabled "Connecting…" today) becomes an enabled **"Cancel"**
  button during the flow, in the same slot, wired to the existing
  `connectors:cancel-connect` IPC. A modal is rejected: it would block the app
  while the actual interaction is in another window the user has already switched
  to — a dead modal. (The BYO connectors keep their existing
  `ByoOAuthConnectDialog`, since they collect credentials first; only the
  no-credential DCR connectors get the inline treatment.)

- **Cancel is the primary exit; the 3-minute timeout is the silent floor.** The
  system browser gives no window-close event, so closing the provider tab tells
  Ordinus nothing. Backing out is therefore done by the **Cancel** button (now
  prominent in the row) or, failing that, the existing **3-minute loopback
  timeout** that the BYO path already has and the DCR path will adopt. No
  abandonment heuristics: "abandoned" and "slowly completing SSO/2FA" are
  indistinguishable, and a short timeout that kills a legitimate slow login is
  worse than a stale row that self-heals the moment the user returns and clicks
  Cancel. A row stuck on "Connecting…" is acceptable because it is one glance
  away from resolution.

- **Validate before responding; typed failure reasons.** The shared callback
  reads `code`, `state`, **and `error`** first, then branches the HTTP response:
  the friendly success page only on real success, and a distinct "Sign-in was
  cancelled — you can return to Ordinus" page when `error` is present or `code`
  is missing. It rejects with a **typed reason** (`denied` / `state_mismatch` /
  `exchange_failed` / `timeout`) feeding a friendly inline row error, retiring
  both the leaked `Error invoking remote method 'connectors:connect'…` string and
  the now-impossible "OAuth window was closed" message. The `error`/
  `error_description` params are routed into the existing ADR-043/046 error-code
  translation helper instead of being discarded.

- **Refocus the app on success.** When the loopback fires a *successful*
  callback, the shared helper brings Ordinus forward (`mainWindow.show()` +
  `focus()`; on macOS `app.focus({ steal: true })`, with `app.dock.bounce()` as
  the fallback if the OS throttles focus-stealing). Not on failure/denial —
  there the user stays in the browser where the error context lives. This both
  meets the user at the success page's "return to Ordinus" prompt and repairs a
  regression: the embedded DCR window used to refocus the app *incidentally* by
  closing on success, so after deletion every connector would otherwise leave the
  user stranded in the browser. The fix lives in the shared helper, so all seven
  connectors get it uniformly.

### Scope boundary: LinkedIn is explicitly out

LinkedIn is **not** an OAuth connector Ordinus brokers; it is `loginMode:
'interactive'` (ADR-041), where Ordinus spawns the third-party
`mcp-server-linkedin` (PyPI, `uv tool`) with `--login` and **the server opens its
own browser**. That server drives a **Patchright-managed Chromium** through a
username/password **form automation**. An automation browser is, by design, a
fresh drivable profile — it *cannot* be the user's real browser with their real
session, so nothing in this ADR fixes it. Making LinkedIn use the system browser
would require an upstream `--use-system-browser` flag or a fork — a different
problem of a different class, deferred to its own investigation. The visual
similarity ("blank browser asking for a password") must not be mistaken for the
same fix. WhatsApp (pairing code, no browser — ADR-042) is unaffected.

### Verification

The repo has **no test framework** (no vitest/jest/playwright; the only gates are
`typecheck` and `lint`), so this change is not gated on automated tests:

- **Structural gate:** `npm run typecheck && npm run lint` — the real safety net
  for the shared-helper refactor.
- **The provider-agnostic edge cases are reachable by clicking a real login:**
  denial (`?error=`) by clicking Deny on the consent screen; cancel via the new
  in-app button; happy-path + refocus by completing login; timeout by temporarily
  shortening the 3-minute constant. `state_mismatch` is covered by reasoning, not
  hand-triggered (noted, not pretended).
- **Two real smokes, one per client-acquisition family:** Google (static client)
  and one DCR provider with a free tier (Linear or Notion). The other four DCR
  providers ride the shared paths — stated explicitly, not silently assumed.

## Alternatives Considered

### Keep the embedded `BrowserWindow`
- Pros: gives a `closed` cancel event and incidental refocus for free; no change.
- Cons: blank profile means no saved passwords, no provider session, manual
  credential entry, and a suspicious chromeless password prompt — the entire
  reported friction.
- Rejected: the friction is the whole reason for this ADR, and the embedded
  window has no load-bearing constraint behind it.

### Two separate paths, mirror the fixes carefully
- Pros: smaller diff; no refactor.
- Cons: the paths have already drifted (success-page wording, error strings) from
  copy-paste; the validate-before-respond and lifecycle fixes would have to be
  applied twice and would drift again.
- Rejected: a single shared helper makes the lifecycle identical by construction;
  the drift is direct evidence the duplication is a liability.

### A "Connecting…" modal for DCR
- Pros: an obvious, centered waiting affordance.
- Cons: blocks the app while the real interaction is in a browser window the user
  has already switched to; a modal that only says "go to your browser" is dead UI.
- Rejected: inline row state is less intrusive, survives the user navigating the
  app, and matches the "this connector is mid-handshake" mental model.

### Short abandonment timeout / refocus-with-no-callback heuristic
- Pros: would reset an abandoned row faster.
- Cons: cannot distinguish abandonment from a slow legitimate login (SSO, 2FA,
  "create an account first"); a false positive kills a real login.
- Rejected: keep the 3-minute floor and make Cancel prominent; the stale row
  self-heals on return.

### Fold LinkedIn into this change
- Pros: one consistent "every connector uses the real browser" story.
- Cons: LinkedIn's login is owned by a third-party automation-browser server, not
  Ordinus' broker; "fixing" it needs an upstream flag or a fork — unrelated risk.
- Rejected: mixing two unrelated fixes balloons the diff; deferred to its own
  investigation with a documented reason.

## Consequences

- **`oauth-broker.ts` gains a shared `runLoopbackAuth` helper** and loses the
  embedded-`BrowserWindow` branch; `authorizeConnector` (DCR) and
  `authorizeStaticClient` (BYO) reduce to client acquisition + a call into it.
  The DCR and BYO consent flows are henceforth identical below the authorize URL.
- **The Connections row gains a "Connecting…/Cancel" inline state** and a
  friendly typed error state, replacing the leaked
  `Error invoking remote method…` string. The connector list is the single status
  surface; no connect modal for DCR.
- **Consent denial is now a first-class, correctly-handled path** (its own page +
  `denied` reason) rather than a misleading success page plus a vague message.
- **All seven OAuth connectors refocus Ordinus on success**, fixing the
  post-deletion regression and standardizing what was previously incidental.
- **No migration / no re-auth.** Only the *connect* path changes; stored
  credentials, refresh flows, and live MCP sessions are untouched. Existing
  connections keep working; the new flow runs only on connect/reconnect.
- **LinkedIn's blank-browser problem persists**, by design and for a documented
  reason. The Connections screen will, until that separate work lands, show six
  brokered OAuth connectors that autofill cleanly alongside one interactive
  connector that does not.
- **Supersedes the embedded-window implementation detail of ADR-015** and
  **generalizes the system-browser approach of ADR-043/046** from the BYO
  connectors to every brokered OAuth connector.
