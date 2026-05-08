# ADR-002: Use App-Owned System Default AI Provider And Model

## Status
Accepted

## Date
2026-05-09

## Context
Ordinus needs a default AI connection for app-owned work that is not tied to a specific agent. Examples include drafting an agent from an intent, reviewing setup state, or future system-level AI helpers.

The user may connect multiple local CLIs, such as Codex, Claude, and Gemini. Each CLI can have its own account and its own idea of a default model. Some CLIs do not expose a stable machine-readable model discovery command, and available models can vary by account, subscription, CLI version, or provider rollout.

## Decision
Persist a workspace-level system default made of:

- `defaultProviderId`
- `defaultModel`

The renderer exposes this as one settings surface. Main process validates and stores the choice through typed IPC, and provider runtime adapters decide how to turn the stored model into provider-specific CLI arguments.

Use an app-owned model catalog for common choices, plus a custom model id input. The special model value `default` means "do not pass an explicit model flag; let the provider CLI use its own configured default."

## Alternatives Considered

### Discover models from each CLI
- Pros: Could reflect account-specific availability.
- Cons: No stable provider-neutral command exists across CLIs; output formats and permissions vary.
- Rejected: This would make settings fragile and provider-specific too early.

### Store only default provider
- Pros: Simpler UI and storage.
- Cons: App-owned AI work would be unable to express model intent.
- Rejected: Provider choice without model choice is incomplete for system AI behavior.

### Store global defaults outside the workspace
- Pros: One preference across all projects.
- Cons: Ordinus workspaces may use different provider accounts, safety expectations, or cost/performance needs.
- Rejected: Workspace-level state matches the current local-first product model.

## Consequences
- Settings can choose a provider and model without renderer knowing CLI flags.
- System AI jobs read the workspace default in main process instead of accepting arbitrary provider/model from renderer state.
- Provider-specific CLI behavior lives behind main-process runtime adapters selected through a provider registry.
- Provider adapters should prefer app-owned CLI config homes under Electron `userData/runtime/<provider>` when the provider supports it, keeping Ordinus-managed auth separate from the user's terminal CLI profile.
- Unsupported custom model ids fail at runtime with the provider CLI error, which is acceptable because model availability is provider-owned.
- If a provider CLI later offers stable model discovery, it can enhance the catalog without changing the persisted contract.
