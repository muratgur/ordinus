# Implementation Plan: Agent Home (ADR-027)

Implements [ADR-027](decisions/ADR-027-agent-home-chat-room-and-colleague-profile.md). Rebuilds the
Agents screen into an "agent home": a 1:1 chat room plus a colleague-style profile
(Chat · CV · Agenda · About), with direction-not-configuration framing.

**Guiding principle: relocate, don't rebuild.** The warm mechanics already exist (conversation
engine, `agent_memory`, Skills/Schedules panels, avatar picker, feedback panel). Most work is
re-composing them into the new shell + a thin data/IPC layer for the canonical room.

Key existing files:
- `app/src/renderer/src/screens/agents-screen.tsx` — to be rebuilt
- `app/src/renderer/src/screens/conversations-screen.tsx` — source of the room components to extract
- `app/src/renderer/src/components/agent-creation-flow.tsx` — avatar picker + greeting
- `app/src/renderer/src/components/agent-feedback-panel.tsx` — memory capture logic
- `app/src/renderer/src/components/agent-reflection-dialog.tsx` — rule pruning (moves to About)
- `app/src/main/db/{schema,database}.ts`, `app/src/main/ipc/register.ts`, `app/src/shared/{ipc,contracts}.ts`

---

## Phase 0 — Data & IPC foundation (main + shared)

Establishes the canonical-room concept and the Agents=room / Conversations=group split.

1. **Schema** (`main/db/schema.ts`): add `kind: text('kind').notNull().default('group')` to the
   `conversations` table. Values: `'room'` (agent home) | `'group'` (multi-agent). Add an index on
   `kind`.
2. **Migration** (bootstrap/migration path): add the column; **delete all legacy single-agent
   (`mode='direct'`) conversations** and their participants/turns/input-requests (pre-release clean
   split per ADR-027 §10); set surviving multi-agent conversations to `kind='group'`. Follow
   `sqlite-minimal-persistence` conventions.
3. **DB method** (`main/db/database.ts`): `getOrCreateAgentRoom(agentId): ConversationDetail` — find
   the `kind='room'` conversation whose sole participant is `agentId`; if none, create one
   (reuse `createDirectConversation` internals, set `kind='room'`, title = agent name). One room per
   agent invariant.
4. **List filter**: `listConversations` (the Conversations screen source) returns only `kind='group'`.
   Rooms never appear in the Conversations nav.
5. **IPC** (`shared/ipc.ts`, `main/ipc/register.ts`, `preload/index.ts` + `.d.ts`): add
   `conversations:get-or-create-room` → `conversations.getOrCreateRoom({ agentId })`. Follow
   `ipc-contract-design` (Zod input/output in `shared/contracts.ts`).
6. **Contracts**: `AgentRoomGetInput { agentId }`; reuse `ConversationDetail` as the return type.

*Deliverable:* `window.ordinus.conversations.getOrCreateRoom({ agentId })` returns a stable room;
Conversations list excludes rooms. No UI yet.

---

## Phase 1 — Agent home shell (renderer)

Rebuild `agents-screen.tsx` layout; no behavior change to sub-features yet.

1. Keep the left **team roster** rail (presence added in Phase 7) and `AgentCreationFlow`.
2. Replace the 4 config tabs with: **persistent identity header** (avatar · name · role · presence)
   + tab bar **Chat (default) · CV · Agenda · About**.
3. Extract the avatar color+symbol picker from `agent-creation-flow.tsx` into a shared
   `components/agent-avatar-picker.tsx` (used by header inline edit + create flow).
4. Identity header: inline-edit name/role (reuse `getAgentNameIssue` validation + `updateSettings`),
   avatar edit via the shared picker.
5. Tab content components stubbed; wire active-tab state. Remove the global `Reflect` button (moves
   to About in Phase 6).

*Apply `ordinus-ui-system` + `shadcn-project-workflow` for styling.*

---

## Phase 2 — Chat tab: the room

Extract a reusable single-participant room from `conversations-screen.tsx`.

1. New `components/agent-room.tsx`: Composer + turn list + streaming + inline input-requests, reusing
   `TurnCard`, `Composer`, `InputRequestDialog`, scroll-follow logic. **Strip** @mentions,
   `RoutingModeSwitch`, `MentionPicker`, multi-participant selection, `OrchestratorPlanningRow`.
2. Mount the room on `getOrCreateAgentRoom(agent.id)`; send via `conversations.sendTurn`.
3. **Bare chat by default**: hide `TurnObservabilityPanel`/diagnostics/file lists behind a per-turn
   "what did they do?" expander (reuse existing components, collapsed by default).
4. **Session-break note (extends ADR-013)**: when a turn reports fresh-session fallback, render one
   gentle in-room system line ("I might not clearly recall our earlier conversation"). Needs the
   runtime to signal fallback to the renderer (a flag on the turn/diagnostic); add if absent.

*Refactor risk: keep `conversations-screen.tsx` working — share components, don't fork blindly.*

---

## Phase 3 — In-room memory capture (mechanic, phase 1)

1. Add a light "remember this" affordance on a message (hover action / message menu) → call
   `agents.addMemory({ agentId, rule })` (reuse `agent-feedback-panel.tsx` logic, no new IPC).
2. Show a subtle inline "I learned this" confirmation in the thread.
3. Preserve ADR-018's explicit-confirmation principle (nothing saved without the user action).

---

## Phase 4 — CV tab

Résumé-style "what they can do."

1. Reuse `SkillsPanel` (skills list + editor dialog) as the CV's core.
2. **Move Connectors** out of `SettingsPanel` into CV (the toggle list + connected/not-connected
   state), framed as "tools they're fluent with."
3. **Move Capabilities** field into CV (with the existing "Improve with AI" `draftFromIntent`).

---

## Phase 5 — Agenda tab

1. Reuse `AgentSchedulesPanel` (+ `CreateScheduleDialog`) restyled as the agent's appointment
   book/calendar. Behavior unchanged (ADR-023); presentation only.

---

## Phase 6 — About tab

Working agreement + the single admin corner.

1. **Working agreement**: reuse `InstructionsPanel` (the brief) + a "What they've learned from you"
   list (the agent's `agent_memory` rules) with inline prune — relocate `AgentRulesCard` /
   `deactivateMemory` logic here. This is the **per-agent reflection** (replaces the global dialog).
2. **Trust & access** (the one quiet machine corner): `SandboxField` + `ExtraDirectoriesPanel` +
   provider/model (`ModelField` + `RuntimeModelSummary`), all moved from `SettingsPanel`. Sober,
   de-emphasized. Respect `electron-secure-boundary` for sandbox/extra-dir handling.
3. Delete `agent-reflection-dialog.tsx`'s global usage; keep stale-archive as an occasional team
   nudge (small surface in the roster, low priority).
4. Retire `SettingsPanel` once its fields are distributed (identity→header, capabilities/connectors→
   CV, sandbox/dirs/provider→About).

---

## Phase 7 — Roster presence

1. Left-rail presence dots: **Available** (enabled + has instructions), **Working…** (active turn or
   running schedule), **Off** (disabled), **Needs setup** (no instructions). Source signals from
   observability (running turns) + `schedules.list`. Replaces `getAgentStatus` ready/attention/offline.

---

## Phase 8 — CLI-generated first greeting (decision 9 / refines ADR-018 §1)

1. On create commit (`AgentCreationFlow.handleCreate`), after the agent exists, kick off a background
   greeting turn: `getOrCreateRoom` → `sendTurn` with a seed prompt asking the agent to introduce
   itself briefly in its own voice. This establishes `providerSessionRef`.
2. Overlap the 3–5s cold start with the existing create→home transition. If the room is opened before
   the greeting resolves, show a "typing…" indicator with the avatar.
3. On failure, fall back to a short canned line. Remove the canned `REPLY_LINES` greeting from the
   create flow's GreetStage (or keep only as the fallback).

---

## Phase 9 — Conversations nav cleanup

1. Conversations screen now lists `kind='group'` only (Phase 0 filter). Verify create flows there
   only produce group conversations (`createManual`); hide/disable the single-agent create path.
2. Confirm legacy single-agent data is gone post-migration. Optionally relabel nav "Conversations"
   later (out of scope).

---

## Phase 10 — Agent-proposed memory (fast-follow, mechanic phase 2)

*Not a launch blocker.*

1. Add `proposedRule?: string` to the conversation outcome schema
   (`main/runtime/prompts/conversation-outcome.ts` + the JSON schema/contract).
2. Prompt the agent to surface a standing preference when it detects one.
3. Render an inline "want me to remember this?" accept chip → `agents.addMemory`. One-tap confirm
   keeps the explicit-confirmation invariant.

---

## Sequencing & dependencies

```
Phase 0 ─┬─> Phase 1 ─┬─> Phase 2 ─> Phase 3
         │            ├─> Phase 4
         │            ├─> Phase 5
         │            └─> Phase 6
         ├─> Phase 7  (after roster exists in P1)
         ├─> Phase 8  (needs P0 room + P2 room UI)
         └─> Phase 9  (needs P0 filter)
Phase 10 ── independent fast-follow (after P2/P3)
```

- **P0 is the gate** for everything. Do it first and verify in isolation.
- **P1 unblocks** the four tab phases (P2/P4/P5/P6), which can then proceed largely in parallel.
- **P8** depends on both the room data (P0) and room UI (P2).
- **P10** is deferred; ship P0–P9 first.

## Cross-cutting

- **IPC**: every new channel via `ipc-contract-design` (Zod, preload bridge, typed renderer call).
- **Persistence**: `sqlite-minimal-persistence` for the `kind` column + migration.
- **Security**: `electron-secure-boundary` when moving sandbox/extra-dir controls (no new renderer
  privilege).
- **UI**: `ordinus-ui-system` + `shadcn-project-workflow` throughout.
- **Verify** with the `verify`/`run` skills after P2 (room works), P6 (full profile), P8 (greeting).
- **Review** each phase with `code-review` before merge.

## Out of scope / deferred

- Long-term fate of the Conversations (group) area (ADR-027 §10 — revisit later).
- Presence beyond the four states (typing indicators across the roster, etc.).
- Multiple named threads per agent (explicitly rejected; work isolation goes to Workboard).
