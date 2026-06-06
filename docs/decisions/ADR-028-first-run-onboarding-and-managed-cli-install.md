# ADR-028: First-Run Onboarding And Managed CLI Install

## Status

Proposed

Supersedes the workspace-first, manual-CLI assumption in the existing
`setup-screen.tsx`. Complements ADR-027 (agent-as-colleague home) by extending the
"hire a colleague" metaphor into the first-run experience.

## Date

2026-06-07

## Context

Ordinus cannot run without at least one of three local AI CLIs — Codex, Claude Code,
or Gemini CLI. The current first-run flow (`setup-screen.tsx`) is a three-step
accordion: **Workspace → Provider → Review**. It assumes the user has already
installed the CLI of their choice on their machine; if not, the Provider step shows
"Not detected" and the user is stuck. No installation is offered, no guidance beyond
a deep link to the provider's auth page.

Three problems result:

1. **CLI-absence is a hard wall.** Most users — especially non-engineers Ordinus
   targets — do not have these CLIs installed and do not know how to install them.
   Even engineers who do have `npm`/`brew` would prefer not to mix Ordinus's runtime
   with their personal toolchain (Ordinus already stores CLI configs in its own
   namespace, so the isolation is incomplete if only the binary is shared).
2. **The setup is mechanical, not human.** The accordion talks about "workspace
   folders" and "providers" before it talks about *what the user is doing*. The
   broader Ordinus product narrative — "hire AI colleagues into a space you build"
   (ADR-027) — is absent from the very first screen.
3. **The first screen after setup is a dead end.** Once the user passes the
   Review step they land on the Agents screen (`agents-screen.tsx`) with an empty
   list. The "I just hired colleagues" feeling collapses immediately because no
   agent has actually been created.

The runtime substrate is in place to do better:

- All three target CLIs ship as pure-Node npm packages (`@anthropic-ai/claude-code`,
  `@openai/codex`, `@google/gemini-cli`). Electron already bundles a Node runtime.
- `findCliExecutable` (`app/src/main/runtime/cli/executable.ts`) already abstracts
  CLI binary discovery and can point at an Ordinus-private prefix without affecting
  any user-level install.
- Agent profile templates exist under `app/resources/profiles/` across nine
  categories — ready material for a "pick your first colleague" selection.
- `workspaceRoot` is heavily load-bearing: it is the `cwd` for every CLI run
  (`adapters/shared.ts`, `gemini/adapter.ts`, `codex/adapter.ts`) AND the security
  boundary enforced by `path-policy.ts`. Changing it later orphans chat history's
  file references and requires path-policy migration. It must be set correctly at
  first run; treating it as "you can change this later" is technically true but
  practically painful.

The CLIs themselves write auth and config into Ordinus-scoped directories already,
so a managed install does not conflict with any pre-existing user install of the
same CLI.

## Decision

Redesign first-run as a five-stage flow that **installs and authenticates the CLIs
on behalf of the user**, framed by the colleague-hiring metaphor, and ends by
landing the user in a chat-ready state with a real agent.

### 1. Managed CLI install via embedded Node + Ordinus-scoped `npm install`

Ordinus reuses its bundled Electron Node runtime to `npm install` the selected CLI
packages into an Ordinus-private prefix (e.g.
`~/Library/Application Support/Ordinus/cli/node_modules/...` on macOS,
`%APPDATA%\Ordinus\cli\node_modules\...` on Windows). `findCliExecutable` is
extended to resolve from this prefix first, falling back to PATH discovery for
power users who already have a CLI installed.

Network is required. Ordinus is unusable offline either way (the CLIs themselves
make network calls), so requiring network at install time is not a new constraint.

### 2. Five-stage flow, replacing the current accordion

1. **Welcome.** One-screen greeting: *"Soon you will be working with AI colleagues
   in a space you build."* Single "Get started" button. Light office-assembling
   animation.
2. **Provider selection.** Multi-select cards for Claude, Codex, Gemini — at least
   one required. Each card carries a logo, a one-line role pitch, and a small
   "no subscription? ↗" link out to the provider's signup page. **No pricing copy,
   no provider explainer pages** — the user is assumed to know they have at least
   one subscription, the link is only for the edge case.
3. **Workspace.** Ordinus proposes a default (`~/Ordinus/` on macOS, equivalent on
   Windows) and shows it. **"Use this folder"** and **"Choose another"** are
   equally weighted buttons. An "I already have a project folder" link opens the
   folder picker. The user must explicitly confirm before continuing — the default
   is *proposed*, not *applied silently*, because of the load-bearing nature of
   `workspaceRoot`.
4. **Install + auth animation.** Selected CLIs install in parallel; as each one
   finishes, its provider auth flow opens. The screen shows a checklist
   (*"Hiring Claude… ✓"*, *"Hiring Codex… ✓"*) over a continuous animation
   (a desk being assembled, a chair sliding in). Expected duration: 30–120 seconds.
5. **First colleague selection.** A single screen with one large primary card
   *"General Assistant — start here if unsure"* and a row of smaller specialist
   cards drawn from `resources/profiles/` (Engineer, Writer, Researcher, Analyst,
   "Define your own"). The selected profile is materialized as an `agents` row.
   The user then lands in that agent's 1:1 chat room (ADR-027), ready to type.

### 3. No free tier, no demo mode

At least one provider must successfully install AND authenticate before the user
can enter the app. Attempting to weaken this (e.g. "skip auth and enter a
read-only demo") would require making `workspaceRoot` and provider auth optional
across the runtime contract (`service.ts`), which is a large refactor for a user
population that, by definition, will not use the app.

### 4. Auth failure handling — soft guidance, hard wall

If authentication fails for the selected provider (no account, no eligible
subscription, network problem), the screen surfaces three plausible causes with
actions: *"No account → [Sign up ↗]"*, *"Wrong plan → [Plans ↗]"*, *"Network
issue → [Retry]"*, plus a prominent *"Try a different colleague"* that returns to
provider selection. The wall remains — the user cannot enter — but every dead end
offers a visible exit to another path.

### 5. First agent is user-chosen, not auto-created

The user explicitly picks the first agent in stage 5. Auto-creating a General
Assistant silently would technically work but would break the promise made in
stage 1 ("you will build your space, hire your colleagues"). The General
Assistant card is the obvious default — large, focus-trapped for Enter-key
selection — so the decision is one keystroke for users who don't want to think
about it, while specialists are one click away for users who do.

## Alternatives Considered

### CLI install: bundle binaries inside Ordinus

- Pros: Zero network on first run; offline-capable.
- Cons: Couples every Ordinus release to every CLI release (Anthropic ships
  Claude Code weekly; Ordinus would lag); app size inflates with three CLIs ×
  two platforms; redistribution licensing is unclear for several of the CLIs.
- Rejected: The freshness and licensing costs outweigh the offline benefit,
  especially since the CLIs require network at runtime anyway.

### CLI install: shell out to system `brew install` / `npm i -g`

- Pros: Real system-level install; shared with any other tool the user owns.
- Cons: Requires `brew` (macOS) or `npm` (cross-platform) to already exist —
  for non-engineers, they typically do not. Falling back to install Homebrew
  or Node first is a deeper rabbit hole than running our own embedded install.
  Triggers `sudo` and permission prompts on some configurations.
- Rejected: The prerequisite chain is too long for the target user.

### CLI install: provider-specific native installers (e.g. `claude.ai/install.sh`)

- Pros: Official, smallest download per provider.
- Cons: Each provider has a different installer (or none); Windows support varies
  per provider; we would end up writing three different install paths plus a
  fallback. The maintenance surface is worse than the single-path npm approach.
- Rejected: Not worth the per-provider divergence.

### Onboarding ordering: workspace first (status quo)

- Pros: Matches the current code; technical dependencies map cleanly.
- Cons: The user's first interaction is a folder picker. The colleague-hiring
  metaphor never lands. Provider selection — the first *meaningful* decision —
  is buried in step 2.
- Rejected: This is exactly the "too mechanical" problem the redesign exists to
  solve.

### First-screen-after-install: hand-picked first task cards

- Pros: Guarantees a successful first run output ("summarize this folder"),
  avoids the blank-input freeze.
- Cons: Skips the agent-creation step entirely; the user lands in a chat with no
  understanding of *who* is replying. Inconsistent with the Agents screen's
  "everything starts from an agent" model (ADR-027).
- Rejected: Choosing a colleague *is* the first task; running a canned prompt is
  not a substitute for it.

### First agent: auto-create General Assistant silently

- Pros: Lowest friction; user lands in chat with zero clicks.
- Cons: Breaks the promise of stage 1 — the user did not hire anyone, somebody
  was assigned. A week later, when the user wants a second agent, they have not
  learned the colleague-selection flow because they never went through it.
- Rejected: One extra Enter keystroke is a cheap price for keeping the metaphor
  honest and teaching the agent-hiring flow on day one.

### Workspace: change-anytime, no explicit confirmation

- Pros: Faster onboarding; one fewer screen.
- Cons: `workspaceRoot` is the `cwd` of every CLI run and a security boundary
  in `path-policy.ts`. Changing it later orphans file references in chat
  history and requires path-policy migration. Engineering users, in particular,
  will not want their work dumped into `~/Ordinus/` — they have a project
  folder already.
- Rejected: The load-bearing nature of the path makes silent-default-then-change
  more painful than one explicit confirmation screen.

## Consequences

### Code changes

- `setup-screen.tsx` is replaced (not extended). The accordion model and its
  `SetupStepId` union go away.
- A new install service in `app/src/main/runtime/cli/` runs the embedded Node
  against an Ordinus-scoped prefix and reports progress events over IPC for the
  install animation.
- `findCliExecutable` is extended to resolve from the Ordinus-scoped prefix
  before PATH.
- The post-install hop currently going to `agents-screen.tsx` is replaced by a
  new "pick your first colleague" screen that materializes an `agents` row from
  a `resources/profiles/` template and routes into that agent's home chat
  (ADR-027).
- A new `app_meta.onboarded` flag (or equivalent) gates whether the first-run
  flow re-appears.

### Product / UX

- The "hire colleagues into a space you build" narrative is delivered in the
  first 30 seconds and reinforced through the install animation and first-agent
  pick, instead of being absent until the user finds the Agents screen.
- Users without a subscription to any of the three providers hit a soft wall
  with exit links. They cannot enter the app. This is intentional and not new
  — the current build has the same constraint, just stated less helpfully.
- Engineering users who already have a CLI installed get a fast path: PATH
  fallback in `findCliExecutable` lets Ordinus skip the install step entirely
  for that provider. They still pick a provider; they just don't wait for an
  install.

### Risks

- Embedded `npm install` may fail on networks with strict proxies or behind
  corporate registries. The install service must surface the underlying npm
  error verbatim, with a "use my existing CLI" escape that lets the user point
  at a PATH-installed binary.
- If any of the three CLIs adds a native module that is not pre-built for the
  Electron Node ABI, `npm install` will try to build from source and likely
  fail on machines without a C toolchain. Mitigation: pin known-good versions
  and fall back to the provider's official installer script for that CLI only.
- The install animation has to feel intentional, not like a frozen UI. The
  copy + animation budget is part of the design; cutting it to "Installing…"
  would undo most of the metaphor work.

### Follow-up

- A separate spec should detail the install service's IPC contract, the
  progress event shape, and the failure-recovery flows.
- The "pick your first colleague" screen and the existing Agents-screen
  "new agent" flow should share components, so the day-one experience and the
  day-N "add another colleague" experience are visibly the same act.
