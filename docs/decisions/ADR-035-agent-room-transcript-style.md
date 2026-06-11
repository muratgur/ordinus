# ADR-035: Agent Room Transcript Style

## Status

Accepted

Builds on ADR-027 (agent home room), ADR-029 §8 (Home transcript language),
and ADR-034 (live turn activity line). **Revises** ADR-027's room rendering:
chat bubbles are replaced by the Home transcript language. The Conversations
group surface is explicitly unaffected.

## Date

2026-06-11

## Context

The agent 1:1 room rendered turns as chat bubbles: agent replies in a bordered
card with a per-message avatar + name header, user messages in a primary-tinted
bordered bubble. Home (ADR-029 §8) had already rejected the bubble metaphor for
agent work — "the bubble implies two equal speakers; the agent is doing work" —
and Ordinus's transcript proved the flat document style. Keeping two visual
languages for the same kind of 1:1 surface was incoherent, and the room still
showed a static "Thinking…" while ADR-034 gave Home a live activity line.

## Decision

1. **Home transcript language in the room.** User messages: right-aligned soft
   cards (`bg-primary/10`, no border). Agent replies: flat full-width Markdown.
   No per-message avatar/name — identity lives in the room chrome. Failed turns
   render as the Home-style destructive block. Files-touched stays as a flat
   collapsed sub-row.
2. **Scope: 1:1 room only.** Conversations (multi-agent/advisory, ADR-032)
   keeps bubbles — with several speakers, attribution needs avatars/names.
3. **Shared QuestionPanel.** Home's needs_input wizard panel moved to
   `components/question-panel.tsx` with a generic signature (requestId, title,
   detail, questions + accentLabel). The room's inline question card is
   replaced by this panel above the composer; the composer is no longer locked
   while a question pends (Home parity — panel is the primary path, plain
   messages stay possible).
4. **Live activity line adopted.** The room's running turn uses
   `useLiveTurnActivity` (ADR-034 second adopter); the hook gained an
   `openingLabel` option so the room says "<agent> is thinking…".
5. **Remember on both surfaces.** The room's hover-bookmark stays; Home gains
   the same affordance on user messages, writing to Ordinus's own memory
   (`writeMemory`, type 'note', name from the title helper) — same gesture,
   per-surface memory store.
6. **Token cleanup.** Hardcoded `#ff7a18` in the Home transcript and question
   panel replaced with `primary` tokens for theme/dark-mode consistency.

## Alternatives Considered

### Semi-transcript (flat blocks but keep avatar/name per agent message)
- Rejected: redundant with the room chrome; reintroduces the two-speakers
  framing the flat style exists to avoid.

### Keep the inline question card in the transcript
- Rejected: Home deliberately keeps questions OUT of the transcript
  (project_ordinus_home_design); sharing the wizard panel removes a UI fork
  and a second drafts/validation implementation.

## Consequences

- `agent-room.tsx` loses ~200 lines of bubble/inline-question code;
  `home-question-panel.tsx` is deleted in favor of the shared panel.
- Third copy avoided: any future surface needing needs_input UI consumes
  `QuestionPanel`.
- The composer-unlock means a user can send a message while a question pends —
  same semantics Home has had; the backend already tolerates it.
- Conversations screen is now the only bubble surface (by design, ADR-032).

## Addendum (same day): files-touched on Home, flat list styling

Home assistant replies could not show the "files touched" row because Ordinus
turn rows never persisted file references. Changes:

- `ordinus_conversation_turns` gained `artifact_refs` / `changed_files` JSON
  columns (additive migration 0041); `session.ts` persists them from the
  turn outcome; `OrdinusConversationTurnSchema` exposes them (default `[]`).
- New `ordinus:reveal-path` IPC mirrors the conversations surface's allowlist
  discipline: only paths recorded on the addressed turn row can be revealed.
- The collapsed row itself was extracted to `components/files-touched.tsx`
  (used by the room and Home). The expanded view no longer nests cards:
  `FileReferenceList` gained a `plain` variant (flat divided list) used on
  transcript surfaces; panel surfaces keep the `card` variant.
