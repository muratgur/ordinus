# ADR-047: Bundled Node Runtime For Managed CLI Install And Execution, With Network-Error Resilience

## Status

Accepted

Amended by ADR-056 (Remove Gemini Provider Support): the bundled Node still backs the
remaining CLIs (`claude`, `codex`), but Gemini drops out of the set of CLIs it
provisions. Google closed the Gemini CLI's individual-account auth on 2026-06-18. No
change to the Node-on-PATH mechanism itself.

Amends ADR-028 (First-Run Onboarding And Managed CLI Install). ADR-028 §1 assumed
that "Ordinus reuses its bundled Electron Node runtime to `npm install` the selected
CLI packages" and that, because "Electron already bundles a Node runtime", no further
Node provisioning was required. Field evidence (see Context) shows that assumption is
incomplete: `ELECTRON_RUN_AS_NODE` is sufficient to *start* npm but not to satisfy npm
lifecycle scripts or the installed CLI launchers, both of which require a real `node`
executable on `PATH`. This ADR corrects that and adds the install-time network-error
handling that ADR-028 only gestured at in its Risks section.

## Date

2026-06-14

## Context

A user attempted to install Ordinus on a Windows machine that had **no Node.js**
installed. Onboarding failed at the "Setting up your team" stage with
**"Gemini couldn't join — npm install exited with code 1."**

The error code is the key signal. `code 1` means the bundled npm **actually ran** and
then failed *inside* the install — this is not a `spawn ENOENT` / "npm not found"
crash. So the current design's first half works: Ordinus bundles npm
(`npm ^11.16.0`) and runs it through Electron's own Node via
`process.execPath` + `ELECTRON_RUN_AS_NODE=1`
([`app/src/main/runtime/cli/install/npm-runner.ts`](../../app/src/main/runtime/cli/install/npm-runner.ts)).
The user does **not** need their own npm for npm to start.

The failure is subtler, and ADR-028 missed it:

1. **Electron is a Node engine, not a `node` executable on disk.**
   `ELECTRON_RUN_AS_NODE` only makes *the process Ordinus spawns* behave like Node.
   It does not place a `node` / `node.exe` anywhere on `PATH`.

2. **npm lifecycle scripts need a real `node` on `PATH`.** When npm runs a package's
   `postinstall` (or any lifecycle script), that child script resolves `node` from
   `PATH`. With no real Node on the machine, the script fails and npm exits `code 1`.
   This is the same class of problem the `--scripts-prepend-node-path` flag was
   created for: the engine running npm is not findable as `node` by npm's own child
   scripts.

3. **The installed CLI also needs a real `node` at *run* time.** Even if install
   somehow succeeded, the `gemini` launcher on Windows is a `gemini.cmd` / `gemini.ps1`
   shim that invokes `node`. With no Node, the CLI cannot run. So Node is required in
   **two** places — installing *and* executing — not just installing.

4. **`@google/gemini-cli` requires Node 20+.** A machine with no Node fails outright;
   a machine with an *old* Node (16/18) can pick the wrong engine off `PATH` and fail
   with confusing version errors; a machine with a *too-new* Node (24/25) has hit a
   known `ECOMPROMISED` npm-cache bug.

5. **Every failure collapses into one opaque message.** The install service surfaces
   a single `npm install exited with code ${code}`
   ([`app/src/main/runtime/cli/install/service.ts`](../../app/src/main/runtime/cli/install/service.ts)),
   and although `stderrTail` is captured it is not clearly shown. The user cannot tell
   a missing-Node failure from a proxy failure from a TLS-interception failure — they
   are all "code 1". ADR-028's Risks section anticipated proxy failures but only
   proposed "surface the npm error verbatim", which is not enough to act on.

Once Node is provisioned by Ordinus itself (this ADR), the dominant remaining
failure class is **the network**: no connectivity, corporate proxy, TLS interception
(self-signed cert), slow/flaky links, blocked/redirected registry. These all surface
as `code 1` today too.

Scope note (explicitly out of scope): **true offline install is not a goal.** The
CLIs make network calls at runtime, so a CLI installed on an offline machine is
useless anyway. We only need the *online* install to be robust — not an offline one.
This is why prebundling the CLI packages (ADR-028 already rejected it; restated below)
remains rejected.

## Decision

### 1. Bundle a real, standalone Node runtime and use it only in Ordinus-spawned processes

Ship a genuine standalone `node` (Windows: `node.exe`) binary per platform inside the
app's `resources`. On **every** Ordinus-spawned process that needs Node — both the
`npm install` during onboarding **and** every provider CLI run (`gemini`, `codex`,
`claude`) — prepend the bundled Node's directory to the **front** of that child
process's `PATH`, passed through the child's `env` only.

The defining constraint: **never write to the system / user environment.** No registry
edits, no global `PATH` changes. The bundled Node lives entirely inside the env handed
to Ordinus's child processes. Because child processes inherit their parent's env, the
CLI launchers and any grandchild `node` calls resolve to *our* Node; the user's own
terminal is a separate process tree and never sees it.

This yields deterministic behaviour across all three machine states:

| User's machine | Result | User's own Node |
| --- | --- | --- |
| No Node at all | Installs + runs against bundled Node | — (none) |
| Old Node (16/18) | Bundled Node wins (prepended first); old one is shadowed for our processes only | Untouched |
| Newer Node (24/25) | Bundled Node still used → predictable; sidesteps the Node 24/25 cache bug | Untouched |

So bundling Node does not "mess up" a machine that already has Node — it shadows it
*within Ordinus's own processes only* and leaves the user's environment exactly as it
was. The `--prefix` flag already isolates installed packages into the Ordinus-scoped
prefix (ADR-028), so installs never touch the user's global `node_modules`.

The size cost is accepted as worth the determinism: it removes the entire "works on my
machine / fails on theirs" class of Node failures. (Measured: the official Node 22.13.0
binary adds ~40 MB to the compressed installer/DMG download and ~120 MB to the installed
footprint per platform — V8 + full ICU. Larger than first estimated, still acceptable.)

**Precedent in the codebase.** This is not a new architectural pattern for Ordinus — it
is the one we already use everywhere *except* the CLI install. The local-MCP supervisor
runs the bundled connector servers (whatsapp/google/x) with their `node_modules` shipped
as `extraResources` and executes them via Electron-as-node — no user Node involved,
because those scripts are self-contained and never shell out to `node` or npm
([`app/src/main/local-mcp/runtime-bootstrap.ts`](../../app/src/main/local-mcp/runtime-bootstrap.ts)).
And for the Python/uv connector class (LinkedIn), Ordinus already **bundles/pins a
self-contained `uv` runtime** and redirects all of its state under `userData`
([`app/src/main/local-mcp/`](../../app/src/main/local-mcp/)). Bundling a real Node for
the CLI class is the direct equivalent of what we already do for `uv` — the CLI install
is simply the one place where we wrongly assumed the user's machine would provide the
runtime.

This also rides an established architectural principle, not a new one: ADR-003 fixed
that "the main process owns CLI execution … and provider-specific arguments", ADR-006's
generic work runtime "owns execution [and] provider sessions", and ADR-011 made "the
main process … the single owner of runtime activity". Process spawning and environment
construction are already centralized; injecting the bundled Node's directory once into
that central environment is the intended shape, not a special case.

### 2. Optionally isolate npm cache and config inside the Ordinus namespace

To keep the install bubble fully under Ordinus's control, point npm's cache (and, if
warranted, its config) at an Ordinus-scoped location rather than the user's shared
`%LocalAppData%\npm-cache` / `~/.npm`. This sidesteps the Node 24/25 `ECOMPROMISED`
shared-cache bug and any surprises from a user's custom `~/.npmrc` `registry`/`prefix`.
A user's proxy settings in `~/.npmrc` may still be worth honoring — see §3b.

### 3. Install-time network-error resilience

With Node bundled, the network becomes the #1 remaining failure source. Add, in
priority order:

**3a. Error classification + actionable message (required).** Parse npm `stderr` and
map it to a cause + action instead of one opaque "code 1":
- `ENOTFOUND` / `ETIMEDOUT` / `ECONNREFUSED` → "No connection or proxy issue → Retry"
- `self signed certificate` / cert-chain errors → "Corporate network certificate →
  contact IT" (diagnose only; see 3e)
- `EACCES` / permission → "Permission problem"
- registry/404/redirect → "Registry unreachable"
This is the highest-value, lowest-cost change and absorbs ADR-028's "surface npm error
verbatim" plus the broader intent of being explicit about *why* setup failed.

**3b. System proxy passthrough (required if targeting corporate machines).** Read the
system proxy (Electron can resolve it) and pass `HTTP_PROXY` / `HTTPS_PROXY` into the
install child's env (the same bubble as §1). Without this, corporate machines fail
every time.

**3c. Retry with backoff (cheap insurance).** Tune npm's `--fetch-retries` /
`--fetch-timeout` and retry the whole install 1–2 times with backoff for flaky links.
The UI already has a manual "Try again"; this covers transient drops automatically.

**3d. Connectivity precheck (optional UX polish).** A fast registry reachability probe
before the long install, to fail fast with a clear message. Largely redundant once 3a
exists.

**3e. Never auto-disable TLS.** Do **not** silently set `strict-ssl=false` or
`NODE_TLS_REJECT_UNAUTHORIZED=0` to "fix" a self-signed-cert error. That defeats
transport security. Diagnose it (3a) and leave the remediation to the user/IT.

## Alternatives Considered

### Node provisioning: a `node` shim that redirects to Electron-as-node (option "1b")

- Pros: ~0 added size; no separate Node binary to update — rides the Electron version.
- Cons: Fragile. Argument/exit-code/`process.argv` forwarding, `process.versions.node`
  reporting (gemini-cli checks for 20+), and native-addon ABI all become edge cases.
  The reported Node version is tied to whatever Node the bundled Electron embeds. Hard
  to debug across 3 OSes × multiple CLIs; reintroduces "works here, fails there".
- Rejected: The size saving is not worth the unbounded, hard-to-debug failure surface.

### Node provisioning: rely on Electron-as-node only (status quo, ADR-028 §1)

- Pros: Nothing to bundle.
- Cons: This is exactly what failed in the field. Lifecycle scripts and CLI launchers
  cannot find `node`; machines without Node cannot install or run.
- Rejected: Proven insufficient.

### Node provisioning: use the user's system Node if present and new enough

- Pros: No bundle size when the user already has a good Node.
- Cons: Surrenders determinism to the user's version/quirks (old-Node version errors,
  Node 24/25 cache bug). Non-engineer target users frequently have no Node at all.
- Rejected: The whole point is to stop depending on the user's machine state.

### Prebundle the CLI packages for offline install

- Pros: No registry network needed at install.
- Cons: Couples Ordinus releases to CLI releases; the CLIs differ in how they package
  and update (Claude in particular behaves differently); and — decisively — the CLIs
  need network at runtime, so an offline-installed CLI is useless. Offline is not our
  problem; a CLI that installs but then can't connect helps no one.
- Rejected: Restates ADR-028's rejection; the user confirmed offline install is a
  non-goal.

### Auto-relax TLS on cert errors

- Pros: "Just works" through TLS-intercepting proxies.
- Cons: Disables certificate verification for package downloads — a security hole.
- Rejected: Diagnose and inform instead (3a/3e).

## Consequences

### Code / packaging

- A per-platform standalone Node binary is added to `resources` and unpacked from asar
  (it must be a real on-disk executable), wired into `electron-builder.yml` alongside
  the existing npm unpack config.
- The bundled Node's directory is prepended to `PATH` in the child `env` for **both**
  the install runner
  ([`app/src/main/runtime/cli/install/npm-runner.ts`](../../app/src/main/runtime/cli/install/npm-runner.ts))
  **and** every provider CLI spawn (the runtime adapters). Applying it to only one side
  reintroduces the bug.
- The install service
  ([`app/src/main/runtime/cli/install/service.ts`](../../app/src/main/runtime/cli/install/service.ts))
  gains stderr classification and emits a typed cause/action instead of a raw code, and
  the onboarding UI surfaces it (replacing the opaque "npm install exited with code 1").
- Optional: npm cache/config redirected into the Ordinus namespace; system proxy
  resolved and injected into the install env.

### Product / UX

- The "no Node on the machine" failure — the original report — is eliminated: Ordinus
  carries its own Node.
- Remaining setup failures (proxy, TLS, offline) now tell the user *what* went wrong
  and *what to do*, instead of a single opaque code.
- App download grows ~40 MB per platform (compressed); installed footprint grows
  ~120 MB (the uncompressed Node binary). Accepted.

### Maintenance / risk

- Ordinus now owns keeping the bundled Node patched (security + staying ≥ the CLIs'
  required major, currently Node 20+ for gemini-cli). This is a standing release task.
- The bundled Node major must remain compatible with each CLI's `engines` requirement;
  a CLI bumping its minimum Node is now an Ordinus release concern.
- True offline install remains unsupported by design; if that ever becomes a
  requirement it needs a separate ADR (and would resurrect the prebundle trade-offs).

## Implementation Plan

No code in this ADR — this is the agreed build order. Each phase is independently
shippable; Phase 1 alone fixes the reported bug.

### Decisions fixed up front

- **Node version to bundle: Node 22 LTS.** It satisfies every CLI's `engines`
  (gemini-cli needs ≥20), matches the app's own `engines.node` (`>=22.13.0`) and
  Electron 39's embedded Node major (22), and avoids the Node 24/25 `ECOMPROMISED`
  npm-cache bug. Pin an exact patch and bump deliberately.
- **Targets: one `node` binary per platform/arch we ship** — `darwin-arm64`,
  `darwin-x64`, `win-x64`, `linux-x64` (mirror the existing `build:mac/win/linux`
  scripts; add `win-arm64`/`darwin` universal only if those targets are ever added).
- **Only the `node`/`node.exe` executable is bundled**, not the full Node distribution.

### Phase 1 — Bundle Node + inject PATH (fixes the bug)

1. A build-time script fetches the correct official `node` binary for the target
   platform/arch into `resources/runtime/node/` (with the executable bit set on
   mac/linux). Runs before `electron-builder`, analogous to `mascots:build`.
2. `electron-builder.yml`: ship `resources/runtime/node` via `extraResources`
   (it must be a real on-disk file, like the existing mini-MCP packages and npm's
   asar-unpack note).
3. One helper resolves the bundled Node path — packaged:
   `join(process.resourcesPath, 'runtime/node', binName)`; dev: fall back to system
   `node` (dev already works). Mirror the dev-vs-packaged handling in
   [`runtime-bootstrap.ts`](../../app/src/main/local-mcp/runtime-bootstrap.ts).
4. At app startup ([`index.ts`](../../app/src/main/index.ts)), prepend
   `dirname(bundledNode)` to the **front** of the Electron main process's
   `process.env.PATH`. This mutates only Ordinus's own in-memory process environment —
   it never writes to the OS / user `PATH`, so it stays within the "scoped to our own
   process tree" rule. This single line is the real chokepoint; everything downstream
   inherits it:
   - `buildRuntimeEnvironment()`
     ([`environment.ts`](../../app/src/main/runtime/cli/environment.ts)) copies `PATH`
     from `process.env` → **all** provider CLI runs, logins, version/auth/logout/
     install-verify (the audit below counts 18+ call sites across the 3 adapters)
     inherit it with **zero** changes;
   - `npm-runner.ts`
     ([`npm-runner.ts`](../../app/src/main/runtime/cli/install/npm-runner.ts)) builds
     its child env from `process.env` → the onboarding install inherits it, so npm
     lifecycle scripts find `node`;
   - any libuv-level resolution of a bare `node` / `npm` command resolves against it.
5. Harden the one literal-`node` spawn. `createNodeScriptExecutable()` in
   [`executable.ts`](../../app/src/main/runtime/cli/executable.ts) returns
   `{ command: 'node', ... }` for the gemini `.js` fallback path. Change it to the
   **absolute** bundled-node path so it never relies on a `PATH` lookup at all. (Same
   module already being extended for Ordinus-prefix resolution, so not a new surface.)

**Net surface: one startup line + one binary-resolver change.** No parameter
threading; no edits to the 18+ CLI call sites or the 3 adapters — they all inherit
`process.env.PATH`. Applying the startup prepend is what makes the single-chokepoint
property real.

### Phase 2 — Error classification + UI (§3a, highest-value resilience)

6. In [`service.ts`](../../app/src/main/runtime/cli/install/service.ts), parse
   `stderrTail` into a typed `cause` (`offline` | `proxy` | `tls-cert` | `permission`
   | `registry` | `unknown`) + suggested action; extend the install error event shape.
7. Onboarding UI renders cause + action instead of the opaque
   "npm install exited with code 1".

### Phase 3 — Proxy passthrough + retry (§3b/§3c)

8. Resolve the system proxy (Electron session) and inject `HTTP_PROXY`/`HTTPS_PROXY`
   into the install child env (same bubble as Phase 1).
9. Add npm `--fetch-retries` / `--fetch-timeout` and wrap the install in a 1–2×
   backoff retry.

### Phase 4 — Optional config/cache isolation (§2)

10. Point npm cache (and optionally a dedicated `--userconfig`) under
    `<userData>/cli/` so the user's shared cache / `~/.npmrc` cannot interfere.
    Resolve the open `~/.npmrc` proxy-vs-isolation question here.

### Verification (note for a Mac-only dev)

The bug only reproduces on a machine with **no system Node**, and only in a
**packaged** build (dev uses your system Node and works). So:
- Build a packaged artifact (`build:mac` for fast local checks; `build:win` for the
  real reported case).
- Simulate "no Node" by launching the packaged app with a `PATH` that excludes your
  Homebrew/system Node, and confirm both install and a CLI run succeed off the bundled
  Node. The authoritative test is a clean Windows machine/VM with Node never installed.

## Audit: complete spawn inventory (why "nothing else" needs the bundled Node)

A full sweep of `app/src/main` for every external-process launch (`spawn`/`exec*`/
`fork`/`StdioClientTransport`, and every literal `node`/`npm`/`npx`/`process.execPath`/
`ELECTRON_RUN_AS_NODE`) classified every site. The result confirms the fix surface is
closed:

- **Provider CLI runs (gemini/claude/codex)** — runs, logins, version checks, auth
  status, logout, install-verify. **Every one** builds its env via `getXxxEnvironment()`
  → `buildRuntimeEnvironment()`. Covered by the startup `process.env.PATH` prepend.
- **Onboarding `npm install`** — `npm-runner.ts`, env from `process.env`. Covered.
- **The single literal `spawn('node', …)`** — `createNodeScriptExecutable()` in
  `executable.ts` (gemini `.js` fallback). Covered by §Phase 1 step 5 (absolute path),
  and by the startup prepend as backstop.
- **Local-MCP mini servers (whatsapp/google/x, ADR-042/043/046)** — spawned via
  `process.execPath` + `ELECTRON_RUN_AS_NODE`, self-contained, `node_modules` shipped.
  **No** `node`-on-PATH needed. No change.
- **`uv` / Python connectors (LinkedIn) and `tar`** — separate bundled `uv` runtime and
  a system archiver; not Node. No change.
- **MCP servers wired into the CLIs** — worker MCP, scoped worker MCP (ADR-037), the
  Ordinus internal server (ADR-029), and all local/remote connectors are reached by the
  CLIs over **loopback HTTP**, not spawned. The CLIs never launch a Node-based MCP child,
  so there is no separate or transitive Node dependency to cover. (If a CLI ever did
  spawn a stdio child, it would inherit the CLI's env and therefore the injected PATH.)

**Verdict:** besides the startup `process.env.PATH` prepend and the one-line
`executable.ts` hardening, **nothing else** in the codebase needs the bundled Node.
The known chokepoints (`buildRuntimeEnvironment` for runs, `npm-runner` for install)
both consume `process.env`, so the startup prepend reaches them without per-site edits.

## Follow-up

- A short spec for the stderr→cause classification table and the new install event
  shape (cause + action), shared by the onboarding UI. **Done:** implemented as
  `classify.ts` (cause + message) with a renderer-side cause→guidance map; the event
  carries `cause`, state carries `installErrorCauses`.
- Decide whether to honor a user's `~/.npmrc` proxy/registry or fully isolate config.
  **Resolved:** isolate the npm **cache** under `<cliPrefix>/cache` (sidesteps the Node
  24/25 shared-cache bug) but do **not** override `--userconfig` — the user's `~/.npmrc`
  may carry the corporate proxy/registry we need. A system proxy is injected only when
  none is already configured (`proxy.ts`).

## Implementation status

- **Phase 1 (bundle Node + PATH):** implemented — `before-pack-node.cjs`,
  `electron-builder.yml`, `bundled-node.ts`, `index.ts`, `executable.ts`.
- **Phase 2 (classification + UI):** implemented — `classify.ts`, `cause` on the install
  event and `installErrorCauses` in onboarding state, cause-aware guidance in the
  onboarding failure card.
- **Phase 3 (proxy + retry):** implemented — `proxy.ts` (system-proxy passthrough),
  npm `--fetch-retries`/`--fetch-timeout`, and an abortable transient-only outer retry.
- **Phase 4 (cache isolation):** implemented — npm `--cache <cliPrefix>/cache`.
- **Review hardening (applied):** `afterPack` hook asserts the bundled Node actually
  shipped (electron-builder silently skips a missing `extraResources` source); the
  system-proxy resolve is capped with a 3s timeout so a slow PAC URL can't stall the
  install; the packaged-vs-dev resource lookup is unified in `paths.ts`
  (`resolveResourcePath`) and reused by migrations/profiles/knowledge/local-MCP/bundled
  Node.
- **Not yet verified** end-to-end in a packaged build on a Node-less Windows machine —
  the authoritative test. Classifier logic unit-checked against representative npm
  stderr samples.
