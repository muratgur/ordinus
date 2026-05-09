# ADR-003: Use Session-Backed Conversations For Agent Chat

## Status

Accepted

## Date

2026-05-09

## Context

Ordinus needs a Conversations area where users can talk with one agent, talk with multiple agents,
and eventually let agents coordinate with each other around real software work.

The product should avoid becoming a generic chat app. Conversations should remain a coordination
surface over agent work, provider runs, status, and user control.

Codex CLI, Claude Code CLI, and Gemini CLI all support two broad interaction styles:

- One-shot or non-interactive execution that accepts a prompt and exits.
- Persistent or resumable sessions that keep provider-owned conversation state.

Conversation transcripts can become very large. Storing full message history in SQLite would create
unbounded database growth, duplicate state already owned by provider CLIs, and make future retention
policy harder. At the same time, Ordinus still needs enough durable state to show conversation
lists, participants, latest activity, run status, and summaries.

## Decision

Use session-backed conversations.

An Ordinus `conversation` is the product-level container. Provider CLIs own the detailed per-agent
conversation memory through resumable sessions. Ordinus stores lightweight metadata and summaries,
not the full transcript by default.

Each `conversation_participant` has its own provider session reference:

```text
conversation
  participant: agent A -> providerSessionRef A
  participant: agent B -> providerSessionRef B
```

For a direct one-agent conversation, there is one participant and one provider session reference.
For a multi-agent conversation, each agent keeps a separate provider session. Ordinus coordinates
which participant receives each turn.

Provider runtime adapters should expose a provider-neutral operation shaped around a single
conversation turn:

```text
sendConversationTurn(provider, agent, sessionRef?, prompt, options)
  -> providerSessionRef
  -> final response preview or text
  -> normalized runtime events
  -> log reference
```

The renderer must not pass raw shell commands, read provider session files, or inspect provider
transcripts directly. Main process owns CLI execution, session references, logs, cancellation,
workspace validation, and provider-specific arguments.

## Persistence Policy

SQLite should store durable product metadata:

- Conversation identity, title, mode, status, timestamps.
- Participant identity, agent id, provider id, provider session reference, status.
- Turn metadata, per-conversation sequence, speaker, target participant or participants, status,
  timestamps, short preview.
- Optional conversation summaries, decisions, blockers, and latest known state.
- References to main-owned log files when detailed output is needed.

SQLite should not store full raw transcripts by default.

Full provider output and normalized runtime events may be written to main-owned log files under the
existing runtime/log boundary. Those logs need explicit retention policy before long-running or
high-volume conversations ship.

## Conversation Modes

Build modes from simplest to most capable. The data model should allow later modes without forcing
the first implementation to solve all orchestration problems.

### Direct Conversation

The user talks with one agent in one provider session.

- One conversation.
- One participant.
- One provider session reference.
- User can create multiple conversations with the same agent.

This is the first implementation target.

### Manual Multi-Agent Conversation

The user adds multiple agents to one conversation and manually chooses who receives each message:

- One selected agent.
- Multiple selected agents.
- All participants.

The user remains the coordinator. Ordinus only dispatches turns to chosen participants.

### Parallel Broadcast

The user sends the same prompt to multiple participants at the same time. Each participant answers
from its own provider session.

This requires concurrent run tracking, per-participant status, cancellation, and result comparison.

### Sequential Conversation

Ordinus sends a prompt through participants in a fixed order. Each answer can become context for
the next participant.

This requires a visible turn policy, ordered state transitions, stop controls, and intermediate
summaries.

### Coordinator-Routed Conversation

A coordinator agent decides which participant should respond, and in what order.

The coordinator's routing decision must be visible to the user before or while it is executed.
Ordinus should preserve user control over expensive, risky, or multi-step actions.

### Agent-To-Agent Autonomous Conversation

Agents can send messages to each other without the user choosing every recipient.

This is the most complex mode. It requires budget limits, maximum turns, loop detection, stop
controls, clear attribution, and reviewable rationale for why each agent spoke.

## Alternatives Considered

### Store Full Conversation Transcripts In SQLite

- Pros: Ordinus can render every historical message without consulting provider session files.
- Cons: Duplicates provider-owned session state, grows without clear bounds, increases migration
  cost, and makes retention/privacy policy harder.
- Rejected: Full transcript storage is too heavy for the current local-first foundation.

### Reconstruct Context And Use One-Shot Execution Every Turn

- Pros: Provider-neutral and easy to reason about.
- Cons: Ordinus would need to store and resend conversation history, manage context windows, and
  implement summarization earlier than necessary.
- Rejected: This makes Ordinus own memory before it needs to.

### One Global Session Per Agent

- Pros: Very simple mapping from agent to provider session.
- Cons: Unrelated work contaminates the same agent context. A user may need separate conversations
  with the same agent for different bugs, reviews, or planning efforts.
- Rejected: Conversation identity should separate work context from agent identity.

### One Shared Provider Session For All Agents In A Conversation

- Pros: Simple transcript shape for a room-like chat.
- Cons: Blurs agent identity, makes provider-specific role control fragile, and prevents each agent
  from keeping its own specialized working memory.
- Rejected: Multi-agent coordination should compose separate agent sessions.

### Start With Coordinator Automation

- Pros: More powerful and closer to autonomous agent teamwork.
- Cons: Harder to make observable, harder to stop safely, and likely to hide decisions from the
  user too early.
- Rejected for now: Direct and manual modes should establish the runtime and UI foundation first.

## Consequences

- Conversations can stay lightweight while provider sessions retain detailed context.
- The same agent can participate in multiple separate conversations without context pollution.
- Provider runtime adapters must support session references as first-class data.
- The UI can show useful history through previews, statuses, summaries, and log references without
  becoming responsible for complete transcript persistence.
- Multi-agent modes can be added incrementally on top of the same participant/session model.
- Provider-specific session behavior remains behind main-process adapters.
- The product needs explicit retention and export decisions before preserving full logs long term.

## Implementation Roadmap

1. Add the durable conversation metadata model for direct conversations.
2. Add a direct conversation UI: conversation list, agent selection, selected thread, message input,
   turn status, and response preview.
3. Add a provider-neutral `sendConversationTurn` runtime contract in main process.
4. Implement the first provider end to end, starting with Codex.
5. Add Claude and Gemini adapter parity using their session/resume capabilities.
6. Add manual multi-agent conversations by allowing multiple participants and explicit targets.
7. Add parallel broadcast once per-participant status and cancellation are reliable.
8. Defer manual sequential conversations. Explicit user-authored agent order adds coordination work
   without a clear near-term workflow; future coordinator-routed orchestration should own routing
   and sequencing decisions.
9. Add coordinator-routed conversations only after direct, manual, and parallel modes are observable
   and controllable.
10. Defer autonomous agent-to-agent loops until budget, maximum-turn, loop detection, and user stop
    controls are designed.

## Provider Notes

Direct conversations now treat Codex, Claude, and Gemini as peers behind the same
`sendConversationTurn` runtime contract:

- Codex uses `codex exec` for the first turn and `codex exec resume <session>` for later turns.
- Claude uses `claude -p --output-format json` and resumes with `--resume <session>`.
- Gemini receives the prompt on stdin with `--output-format json` and resumes with
  `--resume <session>`.

Each adapter remains responsible for provider-specific CLI arguments, session reference parsing,
auth readiness checks, bounded cancellation, and writing main-owned logs. The renderer still sees
only conversation status, participant state, bounded turn content, and user-readable errors.
