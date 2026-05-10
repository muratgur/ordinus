# ADR-005: Use User Input Requests To Resume Agent Runs

## Status

Accepted

## Date

2026-05-10

## Context

Ordinus conversations currently work as session-backed agent turns: the user sends a message, the
main process starts a provider CLI turn, the provider returns a response, and Ordinus stores
lightweight conversation metadata plus the provider session reference.

This is enough for simple chat, but real software work often needs mid-task user decisions:

- The agent may need missing product context before it can continue.
- The agent may need the user to choose between several implementation paths.
- The agent may need approval before a risky action or a future handoff to another agent.
- A future coordinator may need to pause multi-agent work until the user resolves ambiguity.

Interactive CLIs can sometimes ask the user questions directly in their own terminal UI. For
example, Codex can ask questions in the TUI, Claude exposes stream-oriented input/output options,
and Gemini supports JSON/stream output, resume, and ACP mode. However, Ordinus should not make the
renderer depend on provider-specific terminal behavior, fragile PTY parsing, or a live process
waiting for stdin.

The product needs one provider-neutral user interaction model that works across Codex, Claude,
Gemini, and future local AI CLIs.

## Decision

Represent user-needed decisions as Ordinus-owned input requests attached to conversation turns.

When an agent cannot safely or usefully continue without user input, the agent should finish the
current provider CLI turn with a structured `needs_input` outcome instead of staying alive and
waiting inside the CLI process.

The high-level flow is:

```text
User sends a task to an agent.
Agent runs in a provider session.
Agent either completes normally or returns a structured input request.
Ordinus stores and shows the request in the UI.
User answers the request.
Ordinus resumes the same provider session with a follow-up message containing the user's answers.
Agent continues the work using those answers.
```

The first implementation should prefer a portable resume-based model:

```text
provider turn completes as needs_input
conversation waits for user input
user submits answers
main process sends a new turn through the existing providerSessionRef
```

Provider-native live input protocols may be added later as adapter capabilities, but the product
model must not require them. If a provider can support live bidirectional interaction through a
stable protocol, the adapter may translate that into the same Ordinus input request shape. The UI
should not need to know whether the request came from a completed turn or from a live provider
process.

### Input Request Shape

Start with a small provider-neutral request model:

```ts
type AgentTurnOutcome =
  | {
      outcome: 'final_response'
      content: string
    }
  | {
      outcome: 'needs_input'
      title: string
      detail?: string
      questions: InteractionQuestion[]
    }
```

The initial question model should support:

```ts
type InteractionQuestion = {
  id: string
  label: string
  detail?: string
  kind: 'choice' | 'text' | 'boolean'
  required: boolean
  options?: Array<{
    id: string
    label: string
    description?: string
  }>
  recommendedOptionId?: string
  allowCustom?: boolean
}
```

Choice questions should allow a custom answer unless a future product surface has a strong reason
to disable it. Agent-suggested options are accelerators, not constraints on the user's answer.

User answers should preserve whether the user selected a suggested option or supplied custom text:

```ts
type InteractionAnswer =
  | {
      questionId: string
      type: 'option'
      optionId: string
    }
  | {
      questionId: string
      type: 'custom'
      text: string
    }
  | {
      questionId: string
      type: 'text'
      text: string
    }
  | {
      questionId: string
      type: 'boolean'
      value: boolean
    }
```

### Question Limits

Agents should ask a small number of high-value questions:

- At most 3 questions in one input request.
- Use text questions for free-form facts such as names, ages, dates, paths, labels, or
  descriptions.
- Use choice questions only when the options are real alternatives the user can select.
- Prefer 2 or 3 choices when there are meaningful alternatives.
- Allow 1 to 4 choices for choice questions.
- Mark one recommended option when the agent has a sensible default.
- Do not mark placeholder custom-entry options as recommended.
- Do not ask questions the agent can reasonably answer from existing product conventions,
  repository context, or agent instructions.

These limits should be enforced by shared validation, not only by prompting.

### UI Behavior

The renderer should show input requests as a distinct "needs your input" surface, not as ordinary
assistant prose.

A choice question should show the agent's suggested options as fast actions and include a custom
answer path. A user who dislikes the provided options must be able to write their own answer without
fighting the UI.

Example:

```text
Planner needs your input

Authentication approach
[ Mock auth ] Recommended
[ Email/password ]
[ OAuth ]
[ Custom ]

Custom answer:
[ Use passkeys first, with email fallback. ]

[ Continue ]
```

If a request contains multiple questions, the UI should show them in one compact decision card.
Required questions must be answered before `Continue` is enabled. The user should also have a clear
way to cancel or reject continuing the run.

When answers are submitted, Ordinus should send a clear continuation message to the same provider
session, for example:

```text
The user answered your pending input request:

1. Authentication approach
Answer: Custom - Use passkeys first, with email fallback.

2. Persistence target
Answer: Local SQLite.

Continue the task using these answers. If more information is required, ask another explicit input
request.
```

### Provider Runtime Boundary

Input request parsing, validation, persistence, and answer submission belong to the Electron main
process and shared contracts. The renderer may render forms and submit typed answers, but it must
not parse raw provider output, inspect provider session files, or decide how to resume a provider
CLI.

Provider adapters may support structured outcomes in different ways:

- Codex can use non-interactive `exec`, session resume, JSON event output, and structured output
  where available.
- Claude can use non-interactive JSON output and may later use stream-json or agent-to-user message
  capabilities.
- Gemini can use non-interactive prompt mode, JSON or stream-json output, session resume, and may
  later use ACP mode.

The portable baseline remains: complete the current turn, store the input request, then resume the
provider session after the user answers.

### Relationship To Agent-To-Agent Communication

Agent-to-agent communication should build on this same mechanism.

An agent that wants to ask another agent for help should first produce a visible handoff request,
such as:

```text
Reviewer handoff requested
Planner wants to ask Reviewer: "Please inspect the settings persistence plan."
```

The user can approve, reject, or edit the handoff. Later bounded automation may auto-approve some
handoffs within explicit limits, but open-ended autonomous loops should remain deferred until
budgets, maximum turns, loop detection, and stop controls are designed.

## Alternatives Considered

### Keep The Provider CLI Process Alive And Write To stdin

- Pros: Feels like the agent is truly paused mid-run.
- Cons: Non-interactive CLI modes usually treat stdin as the initial prompt, not as a stable
  bidirectional control channel. Writing later input to stdin is provider-specific and fragile.
- Rejected for baseline: Ordinus should not depend on behavior that is not a documented provider
  protocol.

### Drive Interactive CLIs Through A PTY

- Pros: Can mimic a human typing into the provider's native terminal UI.
- Cons: Requires parsing terminal output, cursor state, prompts, spinners, colors, and provider UI
  changes. It is brittle and hard to make observable or accessible.
- Rejected for baseline: PTY control may be useful for experiments, but it should not define the
  product interaction model.

### Use Provider-Native Live Protocols First

- Pros: Could support true live input and richer event streams for providers that expose stable
  protocols.
- Cons: Capabilities differ across providers and would let the first supported provider shape the
  product model too early.
- Rejected for baseline: Treat native live protocols as optional adapter enhancements behind the
  same Ordinus input request contract.

### Let Agents Ask Questions In Free-Form Text Only

- Pros: Very simple to implement.
- Cons: The UI cannot reliably show fast choices, required fields, custom answers, or pending
  decision state. It also makes validation and future handoff approval harder.
- Rejected: User input requests are product state, not just prose.

## Consequences

- Agent runs can pause for user decisions without keeping provider processes alive.
- The same UX works across Codex, Claude, Gemini, and future providers.
- Users can answer quickly through suggested choices or provide custom answers when the suggested
  options are insufficient.
- Conversations need a visible waiting-for-user state distinct from running and completed.
- Main process must own request validation, persistence, answer submission, and provider resume.
- Provider adapters can later implement live protocol support without changing the renderer model.
- Agent-to-agent handoff approval can reuse the same interaction request foundation.

## Implementation Notes

- Add shared Zod schemas for agent turn outcomes, input requests, questions, and answers.
- Keep request limits in shared validation: at most 3 questions, bounded option counts, bounded
  labels/descriptions, and bounded custom answer text.
- Store pending requests durably before showing them in the renderer.
- Add a conversation status or turn status that can represent waiting for user input.
- Resume through the existing participant `providerSessionRef` after answers are submitted.
- Persist the user's selected option labels or custom text in a user-readable form before resuming.
- Keep provider-specific structured output flags inside main-process adapters.
- Do not add open-ended autonomous agent-to-agent loops as part of this decision.
