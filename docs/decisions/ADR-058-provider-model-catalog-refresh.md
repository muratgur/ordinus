# ADR-058: Provider Model Catalog Refresh Policy And Explicit Factory Defaults

## Status

Accepted

Amends ADR-002 (System Default AI Provider And Model): the factory default
model is no longer the CLI-delegating `default` sentinel but an explicit
per-provider pick. Documents the maintenance policy for the model catalog in
`app/src/shared/provider-models.ts`.

## Date

2026-07-23

## Context

The model dropdowns for both providers are hard-coded in
`app/src/shared/provider-models.ts`. Two recurring problems:

1. **Pinned ids go stale.** The list shipped `claude-opus-4-7` /
   `claude-sonnet-4-6` and `gpt-5.4` while the providers had moved on to
   Opus 4.8 / Sonnet 5 / Fable 5 and GPT-5.6 (Sol/Terra/Luna). Every provider
   release cycle required a manual edit that was easy to forget.
2. **The `default` sentinel misfires as a factory default.** `default` omits
   `--model` and delegates to whatever the CLI happens to have configured
   (`addCliModelArg` in `runtime/adapters/shared.ts`). Users typically start
   working without visiting settings, so their runs were pinned to an
   unpredictable CLI-side choice rather than a deliberate one.

## Decision

1. **Prefer aliases over pins wherever the provider offers them.** The Claude
   entries `sonnet` / `opus` / `haiku` / `opusplan` resolve CLI-side to the
   newest model of each tier and never go stale. Pinned ids remain in the list
   only for users who need reproducibility.
2. **Codex has no aliases, so its list is accepted as a manual-refresh
   surface.** When OpenAI ships a new model generation (or moves its
   recommended default), `providerModelOptions.codex` and
   `providerDefaultModel.codex` must be updated together. This is the one
   deliberate maintenance point; everything else tracks automatically.
3. **Factory defaults are explicit, not `default`.** `getDefaultModelForProvider`
   returns `sonnet` (Claude) and `gpt-5.5` (Codex) instead of the first list
   entry. The `default` option stays selectable for users who manage models in
   the CLI itself. Onboarding no longer hard-codes `default`; it inherits the
   fallback in `saveWorkspaceConfig`.
4. **Removed list entries do not migrate stored rows.** Old ids
   (`claude-opus-4-7`, `claude-sonnet-4-6`, `gpt-5.4`, `gpt-5.4-mini`) keep
   working against the provider APIs; the settings UI already renders any
   unknown stored id through the "Custom model" branch. No DB migration.

## Alternatives Considered

### Fetch model lists dynamically from the CLIs or provider APIs

- Pros: never stale.
- Cons: neither CLI exposes a stable "list models" surface; adds a network
  dependency to a settings screen that must work offline; descriptions and
  ordering still need curation.
- Rejected: curation cost is low once aliases carry the Claude side.

### Migrate existing `default` rows to the new explicit defaults

- Pros: existing installs get the new behavior immediately.
- Cons: overrides users who deliberately chose `default`; the DB cannot
  distinguish "never touched" from "chosen". Conservative-persistence policy
  (ADR on SQLite minimalism) says don't rewrite durable state on ambiguity.
- Rejected: only fresh workspaces get the new factory default.

## Consequences

- New workspaces run on `sonnet` / `gpt-5.5` unless the user picks otherwise;
  behavior no longer depends on CLI-side configuration the user never sees.
- Claude-side catalog maintenance is near-zero (aliases). Codex-side requires
  one edit per OpenAI generation — tracked here as the known cost.
- Stored old pins surface as "Custom model" in settings; they continue to run.
- Managed CLI installs must be recent enough for new pinned ids
  (Claude Code ≥ 2.1.215 for Sonnet 5 / Fable 5).
