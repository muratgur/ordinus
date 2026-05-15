# ADR-013: Treat Provider Sessions As Provider-Owned Hints

## Status

Accepted

## Date

2026-05-15

## Context

Ordinus uses provider sessions to keep Workboard and Conversation continuity lightweight. A Work
Request can keep one agent session across multiple Work Runs, and direct conversations keep one
provider session per participant.

That session reference is not an Ordinus-owned memory format. It is an opaque identifier created by
one provider CLI. A session reference from one provider cannot be assumed to exist, validate, or
resume inside another provider. A session reference can also become invalid inside the same provider
if provider-local state is deleted, expired, moved, or no longer available on the machine.

Users may change an agent from any provider to any other provider after a Work Request already has
session-backed history. This is expected to be rare, but it should not fail the Work Run. The user
made the provider change, so the app should not interrupt every affected run with explanatory UI.
At the same time, a fresh provider session will not have the previous provider's hidden session
memory, so Ordinus must rely on durable Workboard state when continuity cannot come from the
provider.

## Decision

Treat `providerSessionRef` as a provider-owned hint, not authoritative product memory.

Ordinus may resume a provider session only when the stored session is known to belong to the same
provider as the run being started. Provider identity is the validity boundary. Model identity is not
the boundary by default because providers may allow resuming a session with a changed model; adapter
implementations may add stricter checks if a provider requires them.

When a Work Run or Conversation turn has no provider-compatible session reference, Ordinus starts a
fresh provider session. Existing session references are preserved in historical run, participant, or
request-agent records; they are not deleted merely because the active provider changed.

If a same-provider resume attempt fails with a recognizable invalid-session condition, the runtime
should retry once with a fresh provider session instead of failing the user-visible run. Other
provider errors, authentication failures, malformed output, permission failures, cancellation, and
non-session runtime errors should still surface as failures.

Fresh-session fallback is silent in primary UI. It should not show a modal, confirmation, or toast.
The runtime may record a compact Activity or Runtime diagnostic such as:

```text
Started a new provider session using saved workboard context.
```

This diagnostic is for inspection, not for interrupting the user.

## Workboard Continuity Policy

Provider session memory is opportunistic. Durable Workboard state is authoritative.

For ordinary same-provider continuation, do not rebuild and resend broad history on every turn. The
existing provider session carries same-agent context, while Work Run prompts stay focused on the
current instruction, required inputs, artifact references, and expected output.

For fresh-session fallback, include only the minimum Workboard context needed to continue the
selected work:

- Original Work Request title or request summary when available.
- Current Work Item title, instruction, and expected output.
- Required upstream Work Run summaries already selected by dependencies.
- Selected anchor Work Run summary when this is explicit continuation work.
- Relevant artifact and changed-file references that the agent should inspect.
- The user's new continuation message or answered input request.

Do not reconstruct full provider transcripts by default. Do not copy hidden provider memory from
logs. Do not summarize every prior Work Run in the request unless the current task depends on them.

Example fresh-session packet:

```text
This is continuation work inside an existing Ordinus Work Request.

Work Request:
Faal.app Pazarlama Stratejisi ve Butce Plani

Selected prior Work Item:
Marka Dili, Reklam Konseptleri ve Gerilla Banner

Prior result summary:
The previous run defined a playful but practical brand voice, three campaign concepts, and banner
directions for guerilla acquisition.

Relevant files:
- work-requests/faal-pazarlama/brand-voice.md
- work-requests/faal-pazarlama/banner-concepts.md

Current instruction:
Create three landing-page hero message alternatives that build on the prior brand voice.
```

## Session Selection Rules

When starting a Work Run for `(workRequestId, agentId, providerId)`:

1. Prefer a non-empty request-agent session reference whose stored `providerId` matches the run's
   `providerId`.
2. If the request-agent session provider does not match, ignore its `providerSessionRef` for this
   run.
3. Look for the latest historical Work Run in the same Work Request and assigned to the same agent
   whose `providerId` matches the run's `providerId` and has a non-empty `providerSessionRef`.
4. If no compatible reference exists, start fresh.
5. After a successful run, write the returned session reference as the active request-agent session
   for that provider and run.

When starting a Conversation turn, apply the same compatibility rule to the conversation
participant's stored provider id and session reference. If an agent's provider changes after a
conversation starts, the participant must not resume a stale session from the previous provider.

## Alternatives Considered

### Fail When The Stored Session Cannot Resume

- Pros: Simple, exposes the exact provider error.
- Cons: A rare provider switch or missing local session breaks otherwise valid work.
- Rejected: Session persistence should improve continuity, not become a hard dependency.

### Ask The User Before Starting A Fresh Session

- Pros: Very explicit.
- Cons: Interrupts a flow for a technical recovery path after the user already chose the provider.
- Rejected: The expected behavior is to continue if Ordinus has enough durable work context.

### Delete Old Session References On Provider Change

- Pros: Prevents accidental cross-provider resume attempts.
- Cons: Destroys useful historical state and prevents future same-provider recovery.
- Rejected: Historical provider sessions remain valid context for their original provider.

### Always Reconstruct And Send Full Workboard History

- Pros: Provider-neutral continuity.
- Cons: Bloats prompts, increases cost and latency, and makes Ordinus own transcript memory before
  the product needs it.
- Rejected: Fresh-session fallback should be targeted, not the default memory model.

## Consequences

- Provider switches inside existing Work Requests do not fail merely because a previous provider
  session cannot be resumed.
- Old provider session references remain available for history and future same-provider recovery.
- Workboard correctness depends on persisted Work Run summaries, dependencies, artifacts, and file
  references, not on hidden provider memory.
- Runtime adapters need provider-specific invalid-session detection so they can retry only the safe
  recovery case.
- Observability should record fresh-session fallback without turning it into a disruptive user
  notification.
- Session lookup logic must treat provider id as part of the effective session key, even where the
  current storage table is keyed by request and agent.
