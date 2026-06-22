# ADR-057: Worker Agent Multiple 1:1 Chat Sessions

## Status

Accepted

Extends ADR-027 (Agent Home — 1:1 chat room and colleague profile).
Builds on ADR-003 (session-backed conversations), ADR-013 (provider session validity),
ADR-031 (title-based working folders), and ADR-049 (chat-inline turn body).

## Date

2026-06-22

## Context

ADR-027 gave every worker agent a single 1:1 "room": one `conversations` row with
`kind='room'`, auto-created on first open via `getOrCreateAgentRoom({agentId})` and
rendered as a single `<AgentRoom>` on the Agents screen Chat tab. One agent = one
perpetual thread.

In practice a single thread is a poor fit for how people actually work with a
colleague. You discuss one topic, then want to switch to an unrelated one without
the first bleeding into the second — different tasks, different working context,
different histories. Forcing everything into one window makes the transcript a
muddle and makes the agent's working folder a dumping ground for unrelated
artifacts. The user's words: *"talking about everything in one window is not a good
experience."*

The Ordinus assistant already offers multiple conversations, but through a **separate
parallel stack** (`ordinus_conversations`, dedicated IPC, its own HomeScreen sidebar)
that deliberately shares one working folder because Ordinus drives work through MCP
tools rather than file writes. That model does not transfer to worker agents, which
do real filesystem work per conversation.

The key enabling observation: the worker-agent conversation schema **already supports
N conversations per agent**. Nothing in `conversations`, `conversationParticipants`,
or `conversationTurns` enforces "one room per agent" — the single-session behavior is
purely the `getOrCreateAgentRoom` find-or-create convention plus a UI that renders one
room. Multi-agent `kind='group'` conversations already prove an agent can belong to
many conversations at once. So this is an *extension of the existing stack*, not a new
one.

## Decision

Allow each worker agent to have **multiple 1:1 chat sessions**, modeled as a flat list
of equal `kind='room'` conversations, surfaced through a conversation list inside the
Agents screen Chat tab.

### Data model — reuse, don't add

- Keep `kind='room'` for all 1:1 conversations (the `'room'` vs `'group'` split still
  separates 1:1 from multi-agent). **Drop the "exactly one room per agent" invariant.**
- No new tables, no new columns for v1. Each conversation continues to carry its own
  `workingRoot` and each participant its own `providerSessionRef`, so threads are fully
  isolated on disk and in provider session context.
- Existing rooms become the first item in their agent's list — zero-migration.

### Working folders — per conversation

Each conversation keeps allocating its own `<workspace>/Conversation/<title>/` folder
via `createConversationWorkingRoot` (ADR-031 title-based naming with Finder-style
collision suffix). This is the only choice consistent with topic isolation: a file
written while discussing topic X must not land beside topic Y's artifacts. (Contrast
Ordinus, which intentionally shares one folder — ADR per `getOrdinusWorkingRoot`.)

### No auto-create — draft-until-send

`getOrCreateAgentRoom`'s lazy auto-create is **removed**. A conversation row and its
folder materialize only on the **first sent message**:

- An agent with zero conversations shows the existing `RoomEmptyState` (avatar, name,
  "Say hi, or hand them a task").
- "+ New chat" enters a draft: empty composer, no DB row, no folder.
- The first send creates the conversation + participant + folder, then runs the turn.

This avoids empty junk threads and folders from mis-clicks or transient visits.

### Titles — derived from the first message

New conversations are titled deterministically from the first message by extracting the
Ordinus helper `createOrdinusConversationTitleFromMessage` into a shared
`conversation-title.ts` (strip code/slash-commands, first sentence, 56-char cap, with a
default fallback). The derived title is both the display title and the basis for the
folder name. No AI-generated titles in v1.

### UI — conversation list inside the Chat tab

When the Chat tab is active the layout becomes
`agents rail | conversation list | transcript`. The slim conversation list appears only
on the Chat tab (Skills/Agenda/About are unaffected). It lists **only this agent's
`kind='room'` conversations** — group conversations stay in their dedicated
Conversations surface (`listConversations()` already filters `kind='group'`, so that
screen is unaffected).

Renderer structure: a new `AgentChat` container (rendered by `AgentTabContent`) owns the
conversation list, the selected `conversationId` (or `null` for a draft), last-viewed
restore, and rename/delete dialogs. `AgentRoom` is refactored from "fetch-by-agentId" to
**render-by-`conversationId`**, keeping all its existing transcript / composer / turn /
input-request logic. It accepts `conversationId: string | null`: `null` is the draft
state, where it reuses its own empty-state + composer and, on the first send, calls
`createRoom` (title from the message) before sending — reusing the composer rather than
duplicating it in the container. It then reports the new room up via `onConversationCreated`
so the container selects it, refreshes the list, and persists last-viewed.

### Selection & restore

- On opening an agent, restore the **last-viewed** conversation for that agent. This is
  view state, stored in **localStorage keyed by agentId**, not in SQLite. Fallback when
  none: the most-recently-active conversation. Fallback when zero: the empty state.

### Lifecycle — rename + delete (v1)

- Reuse the existing `conversations:update-title` (rename) and `conversations:delete`
  (with the `deleteWorkspaceFiles` prompt). Deleting the last remaining conversation
  drops back to the empty state.
- **No pin/archive in v1.** An activity-sorted list with last-viewed restore is enough
  until real usage shows the list getting long; pin/archive (`pinnedAt`/`archivedAt`)
  is a clean later increment.

### Unread & rail aggregation — ephemeral, per conversation

- Unread stays **ephemeral** (the ADR-027 model: diff `lastActivityAt` with
  `lastSpeaker==='agent'`, cleared on view, reset on restart) — now tracked per
  conversation id instead of per agent id.
- The conversation list shows a **per-row unread dot** so you can see *which* thread the
  agent replied in.
- The agents rail still shows **one row per agent**, now an aggregate:
  preview / timestamp / last-speaker from the agent's most-recently-active conversation;
  unread dot = OR across the agent's conversations. `listAgentRoomSummaries` is reworked
  to fold across rooms; a new `conversations:list-agent-rooms({agentId})` returns the
  per-conversation summaries the list and aggregate are computed from.

### Concurrency — concurrent across an agent's threads

Different conversations of the same agent may run turns **concurrently** (separate
sessions + folders make this safe). Within a single conversation, a second turn still
cannot start while one is in flight (unchanged). The agent-level busy / live-activity
indicator becomes an OR across the agent's conversations.

## Alternatives Considered

### Clone the Ordinus multi-conversation stack
- Pros: a known-working pattern with list/create/switch already built.
- Cons: a second parallel stack to maintain; Ordinus's shared-single-folder model is
  wrong for worker agents that do per-conversation file work; ignores that the worker
  schema already supports N conversations.
- Rejected: extending the existing stack is less code and avoids divergence.

### Keep a privileged "default room" + secondary chats
- Pros: the rail can keep previewing one canonical room unchanged.
- Cons: asymmetric mental model (one "main" chat, some "side" chats) users must reason
  about; more conditional logic everywhere.
- Rejected: a flat peer list matches the user's mental model ("my different
  conversations with this agent") and makes migration trivial.

### Shared per-agent working folder
- Pros: fewer folders on disk.
- Cons: unrelated topics' artifacts pile up together — the exact muddle this feature
  exists to remove.
- Rejected: contradicts topic isolation.

### Create-on-click (row + folder when "+ New chat" is pressed)
- Pros: simpler send path (a `conversationId` always exists).
- Cons: resurrects empty junk threads/folders on mis-click; generic "New request"
  folder names.
- Rejected: draft-until-send keeps the workspace clean and yields meaningful folder
  names from the first message.

### Switcher in the chat header (dropdown) instead of a list
- Pros: keeps a two-column layout; lighter on width.
- Cons: hides the separation behind a click — the opposite of the stated goal of
  *seeing* distinct conversations at a glance.
- Rejected in favor of a persistent list (kept as the fallback if width becomes a real
  problem on small windows).

### Pin/archive in v1; serialized per-agent turns; AI-generated titles
- Deferred: each adds surface area without solving a demonstrated v1 problem. Pin/archive
  awaits real list clutter; serialization would undercut the "don't block me" point of
  separate threads; AI titles can refine display titles later without renaming folders
  (identity is the `workingRoot`, not the name — ADR-031).

## Consequences

- `getOrCreateAgentRoom` loses auto-create; callers that assumed a room always exists
  must handle the empty/draft state. The first-send path gains a create-room step.
- New IPC `conversations:list-agent-rooms`; `listAgentRoomSummaries` becomes an
  aggregate. Rename/delete reuse existing endpoints.
- `AgentRoom` becomes `conversationId`-driven; selection/list/draft move up to a new
  `AgentChat` container. Last-viewed lives in localStorage.
- More folders under `<workspace>/Conversation/` and potentially multiple concurrent CLI
  processes per agent — acceptable at realistic usage; not encouraged at dozens.
- The standalone Conversations screen is untouched (already `kind='group'`-filtered).
- Provider/model for a new room is inherited from the agent's *current* config at
  creation; existing conversations keep their own session — consistent with today.
- Deferred items (pin/archive, AI titles, cross-conversation provider switch) remain
  clean future increments.
