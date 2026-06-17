# ADR-053: One-Shot Retry on Empty Provider Responses

## Status

Accepted

## Date

2026-06-16

## Context

A Workboard Work Request ("What's for Dinner Tonight?") had one run —
"Brock Suggests a Meal", on Gemini `gemini-3.1-pro-preview` — fail with:

```
Invalid stream: The model returned an empty response or malformed tool call.
```

The run log tells the whole story:

```json
"response": "",
"models": { "gemini-3.1-pro-preview": {
  "api":    { "totalRequests": 1, "totalErrors": 0, "totalLatencyMs": 16721 },
  "tokens": { "input": 11752, "candidates": 0, "thoughts": 1094, "tool": 0 }
}},
"error": { "type": "INVALID_STREAM", "message": "Invalid stream: ..." }
```

The API call **succeeded** (`totalErrors: 0`, HTTP 200, 16.7s). The model spent
1094 thinking tokens and then emitted **zero output tokens** (`candidates: 0`) —
no text, no tool call. The Gemini CLI flags an empty stream as `INVALID_STREAM`;
our adapter re-throws the CLI's `error.message` verbatim, which marks the run
`failed`.

Two facts make this worse than a single failed run:

1. **It is transient, not deterministic.** The sibling runs Mery and Emmet used
   the *same* `gemini/pro` and succeeded. This is a known preview/thinking-model
   flake (the model burns its budget reasoning and returns an empty completion),
   not a config, prompt, auth, or quota error. The identical turn replayed almost
   always succeeds.
2. **In Workboard the blast radius is the whole DAG.** Brock was a required
   upstream for "Mery Reviews All Suggestions", which the rest of the plan
   depended on. The single empty run cascaded — via
   `propagateBlockedDependentsToTerminalStatus` — to **9 downstream runs**, all
   marked `failed` with "Required upstream Work Item failed." 1 real failure
   produced 10 failed items.

The same empty-completion class exists on Claude (the adapter already throws
"Claude returned an empty conversation response.") and Codex (an empty/absent
last-message file). It is not Gemini-specific. In chat the blast radius is just
the one turn, but the user-facing result is the same: an error where a retry
would have produced an answer.

The runtime already has the right shape to fix this. Both the chat path
(`sendConversationTurn`) and the Workboard path (`sendWorkRun`) funnel through a
single choke point, `sendConversationTurnWithFreshSessionFallback()` in
`runtime/service.ts`, which already does a one-shot retry for the
`ProviderSessionInvalidError` stale-session case (ADR-013).

## Decision

Add a **one-shot retry on empty provider responses**, shared across all three
providers and both surfaces (chat + Workboard), using a typed error so the retry
only ever fires on this transient class.

1. **Typed error.** Introduce `EmptyProviderResponseError` in
   `runtime/adapters/shared.ts` alongside `ProviderSessionInvalidError`, plus
   `isEmptyProviderResponseError()` (instance guard) and
   `isEmptyProviderResponseMessage()` (matches CLI-originated wording:
   `empty (conversation) response`, `invalid stream`, `malformed tool call`).

2. **Each adapter classifies its own signal.** "Empty response" surfaces
   differently per provider, so each adapter maps its case to the shared typed
   error — at every throw site that can carry it:
   - **Gemini** — the non-zero-exit failure message, the zero-exit
     `parsed.error` block (the actual `INVALID_STREAM` path observed here), and
     the empty-`responseText` guard.
   - **Claude** — the non-zero-exit failure message, the `is_error` branch, and
     the empty-`responseText` guard.
   - **Codex** — the non-zero-exit failure message, and a missing or empty
     last-message file.
   Genuine errors (bad config, auth, quota) keep throwing a plain `Error` and are
   never retried.

3. **Shared retry at the choke point.** In
   `sendConversationTurnWithFreshSessionFallback()`, when the caught error
   `isEmptyProviderResponseError`, record an observability status
   (`reason: 'empty_provider_response'`) and replay the turn **once**, unchanged.
   Because both chat and Workboard flow through this function, one implementation
   covers both. The session is still valid, so the turn is replayed as-is (no
   session reset, no message rebuild).

The retry is bounded to a single attempt: if the replay also comes back empty,
the `EmptyProviderResponseError` propagates and the run fails as before. This
guards against a prompt that *systematically* yields empty output (e.g. a content
filter), which must not loop.

## Alternatives Considered

- **Gemini-only fix.** Rejected. The empty-completion flake is a model-output
  class, not a Gemini quirk — Claude and Codex have the same failure surface and
  already throw equivalent errors. Burying the retry in the Gemini adapter would
  also bypass the shared choke point and require copy-paste for the others.

- **Retry inside each adapter.** Rejected. Duplicates retry logic three times and
  mixes a cross-provider concern into provider-specific code. The choke point
  already hosts the analogous ADR-013 session retry; this belongs next to it.

- **Workboard-only retry (skip chat).** Rejected. Chat is interactive and
  latency-sensitive — a one-shot retry (~15–20s) is strictly better than showing
  the user an empty-response error, and the empty-stream case throws before the
  `'Done.'` normalization fallback can rescue it, so chat is otherwise unguarded.
  Routing both surfaces through the same code keeps the semantics identical.

- **Multiple retries / backoff.** Rejected for now. One retry clears the observed
  transient flake; more attempts risk masking a systematic empty-output condition
  and multiply latency. Can revisit if telemetry shows single-retry misses.

## Consequences

- A transient empty/`INVALID_STREAM` response on any provider is silently retried
  once instead of failing the run. In Workboard this prevents a single flake from
  cascading to every downstream dependent; in chat the user gets an answer
  instead of an error.
- A successful retry costs one extra model invocation (~one turn of latency and
  tokens). The cost is bounded to a single attempt.
- A genuinely deterministic empty response (e.g. content-filter/recitation block)
  fails after exactly two attempts, with the provider's message preserved.
- Each `empty_provider_response` retry is recorded as a runtime observability
  status, so the rate of these flakes is visible in the run console / telemetry.
- New adapters get this behavior by raising `EmptyProviderResponseError` from
  their own empty-output paths; the shared retry needs no change.
