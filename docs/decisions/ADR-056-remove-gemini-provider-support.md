# ADR-056: Remove Gemini Provider Support

## Status

Accepted

Removes the Gemini provider that ADR-002 (System Default AI Provider And Model)
introduced as one of three peer CLIs and that many later ADRs assumed as a
standing third option. Amends ADR-002, ADR-028 (First-Run Onboarding And Managed
CLI Install), and ADR-047 (Bundled Node Runtime). Does **not** touch ADR-043
(Google Workspace connector) or any Google OAuth connector — those integrate
Gmail/Calendar/Drive and are unrelated to the Gemini *provider* runtime.

## Date

2026-06-22

## Context

On **June 18, 2026**, Google stopped serving requests from the Gemini CLI for
individual accounts. Personal Google accounts — free tier, Google AI Pro, and
Google AI Ultra — now receive an `IneligibleTierError` at login:

> Error authenticating: IneligibleTierError: This client is no longer supported
> for Gemini Code Assist for individuals. To continue using Gemini, please
> migrate to the Antigravity suite of products: https://antigravity.google.

Ordinus connects Gemini exactly the way Google deprecated: the
`gemini` CLI driven through the **OAuth personal** (`oauth-personal`) login flow.
The adapter (`startGeminiLogin`, `selectGeminiGoogleAuth`) sets
`security.auth.selectedType = 'oauth-personal'` and waits for the browser consent
URL. That server-side path is now permanently closed for individual accounts, so
**every** Ordinus user on a personal Google account gets the error above and
cannot complete a single turn. Only Gemini Code Assist Standard/Enterprise
licenses and raw API-key auth remain — neither of which is how Ordinus drives
Gemini today.

Google's stated replacement is the **Antigravity CLI** (`agy`) — a *different*
product: a new Go binary with a different command, different auth, different
event/output format, and a different agent model (async subagents, "plugins"
instead of extensions). It is not a drop-in for `@google/gemini-cli`. Supporting
it would mean a from-scratch provider adapter — executable discovery, login,
event parsing, output capture — not a version bump. We do not yet understand its
behavior well enough to commit to that, and a half-working third provider is
worse than none.

This leaves the Gemini provider in a dead-end state: its only working auth path
is gone, and its successor is an unknown, separate product. Carrying dead provider
code — a ~920-line adapter, a slot in every `Record<ProviderId, …>`, onboarding
cards, model lists, settings UI — taxes every future change to the provider layer
and presents users a connection that can only fail.

## Decision

**Remove all Gemini provider support from Ordinus.** The supported providers
become **Codex** and **Claude**. Antigravity is treated as a *separate, future*
decision — if and when we adopt it, it gets its own ADR and its own adapter, not
a revival of the Gemini code.

### 1. Narrow the provider identity at its two sources

`ProviderId` is sourced from two literal enums:
`ProviderIdSchema` (`app/src/shared/contracts.ts`) and `providerIds`
(`app/src/main/runtime/types.ts`). Both drop `'gemini'`, becoming
`['codex', 'claude']`. Every `Record<ProviderId, …>` and
`satisfies Record<ProviderId, …>` site then fails to typecheck until its Gemini
entry is removed — the type system, not a manual checklist, drives the removal to
completeness (registry, display names, model options, install packages).

### 2. Delete the adapter and the Gemini-only logic

- `app/src/main/runtime/adapters/gemini/adapter.ts` is deleted, and its entry +
  import removed from the provider registry.
- `materializeGeminiConnectors()` (`integrations/materialize.ts`) is deleted.
  Codex/Claude materialization and the shared `collectUsableConnectors` stay.
- The two Gemini-only branches in app logic are removed: the
  `providerId === 'gemini' ? '--include-directories' : '--add-dir'` flag choice
  (`ipc/register.ts`) collapses to `--add-dir`, and the Gemini-only "path may not
  contain a comma" rule (`workspace/extra-directory-policy.ts`) is dropped.
- The `@google/gemini-cli` managed-install entry and the `~/.gemini/skills`
  import scan root are removed.

### 3. Remove Gemini from every user-facing surface

Onboarding provider cards, the agent provider dropdown, the settings install
command and brand icon, the model option list, and the `gemini.svg` logo are all
removed. The default provider remains `codex`.

### 4. Normalize stored `'gemini'` values on startup

Provider id is stored as plain `text` with **no** DB enum/check constraint, so
existing rows do not break the schema. But those values are re-validated at the
runtime boundary through `ProviderIdSchema.parse()` — so a stored
`providerId='gemini'` would throw a `ZodError` the moment that agent/conversation
starts a turn, *before* any adapter lookup. To avoid that class of runtime
failure, app startup runs a one-time, idempotent normalization that rewrites any
`provider_id = 'gemini'` to the workspace default (`'codex'`) across
`agents`, `conversation_participants`, `work_request_agents`, `work_runs`,
`ordinus_settings`, `ordinus_conversations`, and `workspace_config.default_provider_id`.
This is a data repair, not a versioned Drizzle migration — historical Gemini
runs/sessions carry no value worth preserving, and the goal is simply that no
turn ever hits a dead provider id.

### 5. Antigravity is explicitly out of scope

This ADR does not add, stub, or reserve an Antigravity provider. When we have
enough understanding of the `agy` CLI to commit, it earns its own ADR and adapter.

## Alternatives Considered

### Keep Gemini and switch it to API-key auth
- Pros: `@google/gemini-cli` still runs with `GEMINI_API_KEY`/`GOOGLE_API_KEY`,
  and the adapter already passes those env vars through, so a single user can
  unblock themselves today.
- Cons: it makes API-key provisioning a first-class onboarding path for one
  provider only, keeps ~920 lines of adapter plus the whole UI surface alive for
  a product Google is actively winding down, and bets Ordinus's Gemini support on
  a CLI whose consumer story is ending. It also diverges from the OAuth-login
  model every other provider uses.
- Rejected: this is a personal stop-gap, not a product direction. A user who
  wants it can still set the env var manually against Codex/Claude-shaped flows;
  we will not carry a provider for it.

### Migrate the Gemini adapter to the Antigravity CLI now
- Pros: keeps a "Google option" in the roster.
- Cons: `agy` is a different binary, command, auth, and event format — a
  rewrite, not a migration. We do not understand its runtime behavior, async
  subagent model, or output contract well enough to ship a reliable adapter.
- Rejected: a separate, properly-scoped decision when we have the understanding.
  A flaky third provider is worse than two solid ones.

### Leave Gemini in place, disabled
- Pros: zero code churn now.
- Cons: presents users a connection that can only error, and every future change
  to the provider layer still pays the three-provider tax in types, registry,
  onboarding, and UI.
- Rejected: dead, always-failing surface is a worse user experience and a
  standing maintenance cost; clean removal is cheap because the architecture is
  provider-neutral.

### A versioned Drizzle migration to rewrite stored `'gemini'`
- Pros: the "proper" schema-evolution path.
- Cons: there is no schema *shape* change — the columns stay plain `text`. A
  migration would only rewrite data, and the user has stated historical Gemini
  data carries no value.
- Rejected: a small idempotent startup normalization (§4) is proportionate; a
  migration file would be ceremony for a one-time data cleanup.

## Consequences

### For prior ADRs

- **ADR-002 (System Default AI Provider And Model) is amended.** Its Context
  example "Codex, Claude, and Gemini" and any assumption that three providers
  exist is narrowed to **Codex and Claude**. The app-owned system-default
  mechanism (provider + model, validated through typed IPC) is unchanged; only
  the set of selectable providers shrinks. `defaultProviderId` stays `codex`.
- **ADR-028 (First-Run Onboarding And Managed CLI Install) is amended.** The
  onboarding "choose a CLI to install" stage no longer offers Gemini; the
  managed-install package map drops `@google/gemini-cli`. The flow and the
  install machinery are otherwise unchanged.
- **ADR-047 (Bundled Node Runtime) is amended.** The bundled Node still backs the
  remaining CLIs (`claude`, `codex`); Gemini drops out of the set of CLIs it
  provisions. No change to the Node-on-PATH mechanism.
- **Peer-mention ADRs are covered by this ADR, not individually rewritten.**
  Many ADRs (e.g. ADR-031 folder isolation, ADR-034 live turn activity,
  ADR-037 token efficiency, ADR-040 skills, ADR-049/050/053 output/retry
  behavior) reference Gemini only as one of three peer CLIs or to record a
  Gemini-specific quirk. These remain as historical record; this ADR is the
  single authoritative note that Gemini is no longer a supported provider. Their
  Gemini-specific observations are simply no longer load-bearing.
- **ADR-043 (Google Workspace connector) is explicitly untouched.** It connects
  Gmail/Calendar/Drive over the user's own Google OAuth client and has no
  relationship to the Gemini provider runtime.

### General

- **Types:** `ProviderId` becomes a two-member union; the compiler enforces
  removal at every `Record<ProviderId, …>` site.
- **Runtime:** one provider adapter deleted; provider registry, install service,
  materialization, and the two Gemini-only branches simplified.
- **Data:** a one-time idempotent startup normalization rewrites stored
  `'gemini'` provider ids to `'codex'`; no schema change, no migration file.
- **UI:** onboarding, agent provider picker, settings install/icon, and model
  options lose their Gemini entries; the `gemini.svg` asset is deleted. Default
  provider stays `codex`.
- **Docs:** README, `docs/architecture.md`, `docs/provider-runtime-contract.md`,
  and the `provider-runtime-adapter` skill description drop Gemini from the
  provider list.
- **Future:** Antigravity CLI support, if pursued, is a new ADR and a new
  adapter — not a revival of this code.

## Related

- ADR-002: System Default AI Provider And Model (amended — provider set narrowed)
- ADR-028: First-Run Onboarding And Managed CLI Install (amended — Gemini install removed)
- ADR-047: Bundled Node Runtime For Managed CLI Install And Execution (amended — Gemini CLI dropped)
- ADR-043: Google Workspace Connector (unaffected — Google OAuth connector, not the Gemini provider)
