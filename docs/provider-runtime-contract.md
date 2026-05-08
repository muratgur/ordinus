# Provider Runtime Contract

This contract defines the safety boundary for future Codex, Claude, Gemini, and similar local CLI providers. It does not implement provider execution yet.

## Ownership

Provider runtime belongs to the Electron main process. Renderer code must never spawn processes, access provider secrets, read raw logs, or pass arbitrary shell commands.

The renderer may eventually request a provider run only through typed IPC. Main process validates the request, owns the child process, normalizes events, writes logs, and enforces cancellation and timeout.

## Workspace Boundary

Every run must declare a workspace boundary:

- `rootPath`: the canonical workspace root.
- `allowedWritePaths`: explicit paths the provider may write to.

Main process must resolve real paths before execution and reject paths outside the workspace boundary. Symlinks and relative path traversal must be resolved before any write permission is granted.

Runs execute with a validated `cwd`; providers never receive an arbitrary renderer-supplied shell string.

## Process Lifecycle

Provider-neutral statuses:

- `queued`
- `starting`
- `running`
- `cancelling`
- `completed`
- `failed`
- `cancelled`
- `timed_out`

The lifecycle should be monotonic. Terminal statuses are `completed`, `failed`, `cancelled`, and `timed_out`.

## Cancel And Timeout

Each run must carry:

- `timeoutMs`
- `gracefulShutdownMs`

Cancellation first attempts a graceful stop. If the process does not exit before `gracefulShutdownMs`, the runtime may force kill the process tree. Timeout follows the same path and ends in `timed_out`.

Provider adapters should expose cancellation even before advanced orchestration exists.

## Command Shape

Use executable plus args, never raw shell strings.

Allowed:

```ts
{ executable: "codex", args: ["run", "--json"] }
```

Not allowed:

```ts
{
  command: "codex run --json && other-command";
}
```

Provider-specific arguments belong in main-process adapters. UI state should not depend on provider-specific flags unless the product explicitly exposes them.

## Environment And Secrets

Environment is deny-by-default:

- Do not inherit the full parent environment.
- Use an explicit env allowlist.
- Keep provider CLI home/config directories under Electron `userData/runtime/<provider>` when
  the CLI supports it, so app-managed authentication and terminal-managed authentication do not
  overwrite each other.
- Inject secrets only from secret references resolved in main process.
- Never persist plaintext secrets in SQLite.
- Never include secret values in stdout/stderr events, diagnostics, errors, or logs.

Secret storage decision is intentionally deferred. Candidate storage should be OS-backed where possible, such as Keychain, Credential Manager, or Secret Service.

## Event Normalization

All provider output is normalized into ordered runtime events:

- `status`: lifecycle state change.
- `output`: stdout/stderr text chunk.
- `diagnostic`: provider-specific non-secret diagnostic.
- `result`: provider result summary.
- `error`: runtime or provider failure.

Each event includes:

- `runId`
- `provider`
- `sequence`
- `timestamp`
- `kind`

Output events also include:

- `stream`: `stdout` or `stderr`
- `text`: normalized text chunk

Provider adapters may retain useful diagnostics, but normalized events should be stable enough for UI, logs, and later persistence.

## Logs

Logs are main-process owned and written under Electron `userData/logs`.

Minimum policy:

- One run log directory per `runId`.
- Separate normalized event log from raw provider output.
- Redact secrets before writing.
- Keep log paths out of renderer unless a future reviewed feature requires opening them.
- Add retention/rotation before long-running automation ships.

## Current Implementation Boundary

The current implementation supports provider status checks, login starts, and app-owned agent draft
generation through main-process provider adapters:

- `app/src/main/runtime/service.ts`
- `app/src/main/runtime/adapters/registry.ts`
- `app/src/main/runtime/adapters/*/adapter.ts`
- `app/src/main/runtime/cli/*`

Renderer code still does not choose CLI commands, spawn processes, read provider logs, or pass provider
flags. App-owned AI work, such as agent draft generation, reads the workspace default provider/model in
main process before dispatching to an adapter.

General provider run orchestration is still intentionally deferred. Queues, cancellation, normalized
runtime event streams, log persistence, IPC run endpoints, and durable run tables should be added only
when the product has a concrete run workflow.
