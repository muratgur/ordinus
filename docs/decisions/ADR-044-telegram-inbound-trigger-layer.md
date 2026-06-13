# ADR-044: Telegram Inbound — and the Inbound Trigger Layer

## Status

Accepted

## Date

2026-06-13

## Context

Every capability Ordinus has today assumes Ordinus *initiates*: the user opens
the app and starts a run, a schedule fires on a timer ([[ADR-035]]-era
scheduled tasks), or Ordinus drafts a Work Request. Nothing **inbound** exists —
Ordinus never listens for an external event and decides to act on it.

The motivating use case is "reach the Ordinus living on my computer from my
phone": text a message, have an agent act, get an answer back. Telegram is the
natural first channel — a Telegram *bot* (created via @BotFather, driven over
the HTTPS Bot API) can receive messages with no public URL via long-polling,
which suits a desktop app behind a home NAT.

But Telegram is only the first instance of a more general gap. Tomorrow the
same trigger could be an inbound WhatsApp message, an arriving email, or a
webhook. Their ingress mechanics differ wildly (a bot long-poll cursor, a live
socket event, a polling+dedup loop), but they converge: some data arrives,
Ordinus decides whether and how to act.

Two framings were possible and we rejected one:

- **Telegram as an outbound connector** (like the WhatsApp connector,
  [[ADR-042]]): an agent gains `telegram.send_message` tools and reaches *out*.
  This is a smaller, well-trodden variant of work already done twice and is
  **not** the point — the value is ingress, not another egress tool.
- **A speculative multi-source trigger framework** built up front: a generic
  `TriggerSource` registry with pluggable adapters. Rejected as premature — an
  abstraction guessed from one example leaks that example's assumptions. The
  curated-registry investment in [[ADR-041]] was justified because LinkedIn
  *and* WhatsApp were both in hand; here only one real source exists.

## Decision

Build an **inbound trigger layer** and ship **Telegram as its first and
reference consumer**, as a vertical slice: one adapter end-to-end, the seam
named cleanly enough to extract later, but **no** generic registry, manifest
system, or speculative WhatsApp/email adapters until a second source forces it.

### Architecture — three layers

1. **Trigger sources (adapters).** Heterogeneous, one per origin. Telegram is
   the only one in v1.
2. **Normalized inbound event + routing core.** Every adapter funnels into one
   shape (`{ source, sender identity, text, timestamp, threadKey }`). The core
   decides whether to act, which participant acts, and how. **This is the part
   Ordinus lacks today.**
3. **The action**, which bottoms out in the existing run engine: `run.create`
   against an agent — the same entry point the scheduler already uses. The
   reply path goes back out through the source adapter.

The open-endedness the user feared ("infinite trigger actions") collapses: an
inbound message is just a **user turn delivered to an agent**, and the agent (an
LLM with tools) handles interpretation. No per-intent routing code.

### Telegram is direct Bot API — not MCP, not a connector

Telegram is an **ingress / trigger source**, not an agent tool. The inbound
layer owns it; receiving is `getUpdates` long-polling, replying is
`sendMessage`/`editMessageText` — plain HTTPS. There is nothing for MCP to
mediate. It does **not** enter the [[ADR-041]] managed-local-MCP registry. It
lives as its own trigger-source subsystem in the main process. The bot token is
stored in the vault (Electron `safeStorage`). Settings surface lives near
Ordinus ("Remote access"), not under Connectors.

### Routing — open-select hybrid, Ordinus as the default front door

- **Default recipient = the Ordinus assistant.** It is the orchestrator and
  already owns "shared work" (Work Requests, schedules, workflows), so a user
  never needs to remember an agent name to do anything.
- **Specific worker agents are reachable by explicit selection.** When the user
  picks an agent, the message goes **directly** to that agent's room; Ordinus is
  not in the loop. Domain work (e.g. "summarize my mail") goes to a worker agent
  with the relevant connectors; orchestration goes to Ordinus.
- No smart/dynamic intent-routing in v1 — the recipient is chosen explicitly.

This does **not** violate the [[ADR-041]] rule that the Ordinus assistant holds
no connectors. That rule governs **egress** (acting outward with tools).
Receiving a Telegram message is **ingress** owned by the inbound layer, which
delivers a user turn and relays Ordinus's normal output. Ingress ≠ egress.

### Addressing — one bot, one thread, in-thread agent switching

A Telegram bot has exactly **one** private chat per user; there is no native
"new chat" within it. So:

- **One bot, one continuous thread.** Multiple bots (one per agent) were
  rejected — N tokens, N long-poll loops, new-bot-per-agent friction.
- **Agent switching happens in-thread** via a `/agents` inline keyboard listing
  agents by name. The user *selects from a menu* rather than *typing a name* —
  which solves the "user forgets agent names" problem directly. Replies carry a
  small identity label ("CEO ·" / "Ordinus ·") so the mixed scroll stays
  legible.
- A `/new` command resets context within the current participant. Not a
  Telegram thread — a logical session the bot manages.

### Security — single-owner lock via pairing code

A bot is publicly reachable: anyone who finds its @name can message it.
Therefore the bot **only accepts the single owner** (the owner's Telegram
user-id); all other senders are silently ignored. The owner identity is sealed
via a **pairing code**: Ordinus generates a code, the user types it into the
bot, and Ordinus seals that user-id as owner — the same pairing mindset as the
WhatsApp connector. (No multi-user allowlist in v1.)

### Action authority — tap-to-confirm via inline buttons

The desktop chat surface is already "headless": interactions, confirmations,
and actions are structured events, and the desktop is just one renderer. The
**Telegram adapter is a second, lower-fidelity renderer of the same events**.

| Intent class | Example | Telegram behavior |
| --- | --- | --- |
| Query / read | run status, "summarize my mail" | runs directly (an ordinary agent turn) |
| Consequential orchestration | run a workflow, create a schedule | propose → inline button → tap → execute |
| Outward / irreversible | a worker tool like `send_message` | governed by the connector's own permissions; plus a tap-confirm |

Ordinus's existing primitives map cleanly to Telegram's UI vocabulary
(text + inline keyboards):

- `OrdinusPendingConfirmation` → `[✅ Approve] [❌ Cancel]`, affected records and
  reversibility rendered as text.
- `InteractionQuestion` — **choice** (≤4 options, recommended starred) →
  inline keyboard; **boolean** → `[Yes] [No]`; **text** → a normal reply.

The **only** panel that does not map is `workboard_plan_ready` (the editable,
multi-item plan-review surface). For it: send a text **summary** plus
`[✅ Start as-is] [💻 Review on desktop]`. The existing **"Review before start"**
toggle is mirrored, and large plans (the existing forced-review threshold) force
the desktop path. On the phone there is **always at least one tap** — never a
blind start — because the phone user cannot watch the work unfold.

Telephone-initiated execution is in v1.

#### Forward-compatibility (free, by construction)

Gating a tool that is unguarded today (e.g. `create_workflow`, currently
`capability: 'write'`, no confirmation) requires only flipping its
`requiresConfirmation` / `capability: 'destructive'` flag. The confirmation then
flows automatically through **both** the desktop panel **and** Telegram inline
buttons — zero renderer changes. The structured-event design future-proofs new
approval points.

### Timing — edit-in-place, async fallback

A run takes seconds to minutes; Telegram is async messaging. The bot sends an
immediate `🔄 Working…` message and **edits that same message in place**
(`editMessageText`) — coarse progress, then the final answer (the phone analogue
of the desktop live-activity line). If a run exceeds ~60s, the message switches
to "taking a while, I'll ping you when done" and the final arrives as a separate
message, so the user can put the phone down. A second message while a run is
in flight reuses the engine's existing `agent_session_busy` → `queued`
semantics — no new mechanism, consistent with the one-message-at-a-time model
shared with desktop CLIs.

### Conversation continuity — shared room for agents, dedicated session for Ordinus

- **Worker agents → shared room.** Each agent already has one canonical room
  (`conversations`, find-or-create — [[project_agents_home]]). The Telegram
  thread is a remote window onto **that same room**; desktop and phone are one
  continuous conversation, with a "via Telegram" marker.
- **Ordinus → one dedicated phone session.** Ordinus supports multiple desktop
  conversations, which cannot fit one thread, so the phone gets a single
  canonical Ordinus session; `/new` resets it.
- **Telegram-originated turns are persisted** to `conversationTurns` with
  `source = 'telegram'` (not fed only to the provider session) — so the desktop
  transcript echoes them. The desktop showing the user's own "selam" is the
  whole point of the shared-room model.
- The **Telegram↔conversation link is an explicit mapping**
  (`(thread, participant) → conversationId`), not a hardcoded canonical lookup —
  so a future "multiple windows per agent" feature drops in without rework.
- Worker agents have **no live permission panel** (the sandbox sets
  `--permission-mode` up front). The only mid-run cross-surface artifact is a
  persisted `needs_input` question, answerable from either surface; because it
  is a record, not ephemeral UI, answering on Telegram resolves it everywhere —
  no orphaned panel.

### Lifecycle — local-first, app-open only

The bot is live only while the app is open and the machine awake — the same
constraint as the scheduler. A **cloud relay** (an always-on intermediary) was
rejected: it would break the "your data never leaves your machine" guarantee
([[ADR-015]] spirit) and is consciously out of scope. When the machine is
closed, messages wait on Telegram's servers and are processed at next launch via
**catch-up**; messages older than a threshold (~5–10 min) are **not** run
blindly — the bot asks "you sent this N hours ago, still want it?".

### Scope boundary

Telegram here is a **bot = the owner's remote control of their own Ordinus**. A
bot **structurally cannot** access the user's contact list or personal chats, or
initiate messages to anyone. It is **not** WhatsApp-style outbound to contacts.
"Have an agent message my Telegram contacts" would be an entirely different
integration — a Telegram *user-client* (MTProto) connector with its own ToS/ban
profile — and is out of scope.

## Phases

0. **Throwaway PoC** — `scripts/telegram-poc.mjs` (~80 lines, zero deps, Node
   built-in `fetch`). **DONE / verified 2026-06-13:** long-poll receives,
   `sendMessage` replies, `editMessageText` edits in place. Owner id observed.
1. **Ingress skeleton** — trigger-source subsystem + token vault + pairing /
   owner lock + normalize → `run.create` (default Ordinus) → edited reply. Plain
   Q&A; no picker or confirmations yet.
2. **Shipping v1** — agent picker (`/agents`), shared-room persistence
   (`source = 'telegram'`), inline-button confirmations (confirm / choice /
   boolean), plan summary + `[Start]/[Desktop]`, catch-up.
3. **Polish** — edit-in-place progress + long-run notify fallback, `/new`, a
   tray "listening" indicator, and enriching the Ordinus tool set as needed.

## Consequences

- Ordinus gains its first inbound capability; the normalized-event + routing
  core is reusable by future sources (WhatsApp-inbound, email) without
  committing to their abstractions now.
- The remote experience is bounded by local-first: "reachable" means "your open
  computer is reachable." Acceptable for v1; cloud relay remains a deliberate,
  rejected-for-now option.
- One real risk surface is the single-owner lock — a missing or wrong owner
  check would expose the user's machine to anyone who finds the bot. The pairing
  seal and silent-ignore-others rule are load-bearing and must be covered by
  tests in Phase 1.

## Related

[[ADR-041]] (managed local MCP — Telegram explicitly *not* in that registry),
[[ADR-042]] (WhatsApp connector — the contrasting outbound user-client),
[[ADR-015]] (broker / no-data-pipe — basis for rejecting a cloud relay),
[[project_agents_home]] (canonical agent rooms), [[ADR-029]] (Ordinus assistant
tools, confirmation panel, interaction questions).
