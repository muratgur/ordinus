# ADR-049: Surface-Aware Turn Outcome — Chat Renders a Single Inline Body

## Status

Accepted

Amends and partially supersedes ADR-030 (database-backed result content and handoffs): the
`summary` / `content` split is now a **Workboard-only** concept. Chat surfaces (the Ordinus
assistant and Agent 1:1 rooms) no longer split the agent's answer into a short `summary` plus a
collapsed full `content`; they carry the entire answer inline. The `content` field is removed from
the chat outcome schema, the `result_content` column is dropped from both chat turn tables, and the
16k `summary` ceiling is raised for chat. ADR-030's model is unchanged for Workboard (`work_runs`).

Amends ADR-037 (token efficiency and work visibility): the Claude relaxed StructuredOutput schema
and the `normalizeAgentTurnOutcome` repair layer remain (they are provider-level and protect both
chat and Workboard against Claude's empty-`{}` bail). This ADR adds a *surface* dimension on top of
the existing *provider* dimension: the outcome schema and prompt guidance now also branch on
`outcomeMode: 'chat' | 'work'`.

Amends ADR-029 (Ordinus in-app personal assistant): ADR-029 had Ordinus "ride the same pipeline"
and the same outcome contract as Agent chat and Workboard. That uniformity is what leaked the
Workboard split into chat. Ordinus and Agent rooms now share a single *chat* outcome shape that is
deliberately distinct from the *work* shape, and the Ordinus-vs-Agent-room persistence asymmetry is
removed.

Related: ADR-050 (Claude structured-output reliability). The chat single-body model here makes the
ADR-050 prompt nudge and parse fallback land cleanly — a Claude turn that answers in text maps
directly onto the chat `summary`.

Builds on ADR-027 (agent home 1:1 chat) and ADR-035 (agent room transcript style); neither is
changed.

## Date

2026-06-15

## Context

Ordinus has three turn-producing surfaces, all funneling through one runtime seam: every turn ends
as a call to a provider adapter's `sendConversationTurn`. Workboard's `sendWorkRun` does not have a
separate adapter path — it wraps its input into a `RuntimeConversationTurnInput` and calls the same
adapter method (`runtime/service.ts`). Consequently all three surfaces were forced to emit the
**same** structured outcome and were sent the **same** outcome prompt guidance.

That shared outcome is `AgentTurnOutcomeSchema`: a `final_response` carries `summary` (required,
short, always shown) plus `content` (optional, the full produced body), or a `needs_input` carries
`questions`. This split was designed for Workboard (ADR-030): the run card shows `summary`, and the
drawer reveals `content` (the deliverable). Two genuinely separate display slots, two fields.

In chat there is no second slot. The message *is* the card. But because the same prompt told the
model to split, chat turns came back split too: `summary` rendered in the bubble, `content` hidden
behind a "Show full result" expander (`TurnFullResponse`). The user had to expand the answer on
nearly every turn to read it — the chat equivalent of reading a letter through the envelope window.

The behavior was also **provider-dependent**, compounding the confusion:

- Claude is handed a *relaxed* StructuredOutput schema (ADR-037) where only `outcome` + `summary`
  are required, because the strict all-required schema made its forced StructuredOutput tool bail to
  an empty `{}`. Under the relaxed schema Claude tends to dump the whole answer into `summary` and
  leave `content` empty — which happened to render correctly inline.
- Codex / Gemini are handed the *strict* schema and constrain the text channel, so they faithfully
  split: a one-line `summary` and the body in `content` — which rendered as the broken
  summary-plus-expander case.

So the *same* chat question produced a clean inline answer on one provider and a truncated-looking
one on another. This is the "provider'a göre değişiklik arz ediyor" inconsistency.

Two further fault lines surfaced while tracing it:

- **A second, hidden 16k cap.** Beyond the Zod `summary.max(16_000)` ceiling, the Agent-room
  persistence path clips every turn's displayed `content` to `turnContentLimit = 16_000` via
  `createBoundedTurnContent` and sets a "Long output was shortened" flag. With the full answer now
  living in `summary`, a long chat answer would be silently clipped *and* — once the expander is
  gone — unrecoverable.
- **A chat persistence asymmetry.** The Ordinus path (`appendOrdinusTurn`) stores `content` raw
  (no clip), while the Agent-room path (`completeConversationTurn`) clips at 16k. The same "chat"
  behaved differently across its two surfaces even in the database — a concrete instance of the
  "Agent ve Ordinus tutarsız" complaint.

The root cause is uniformity in the wrong place: one outcome contract serving two genuinely
different jobs (a chat reply vs. a card-plus-deliverable work result).

## Decision

Make the turn outcome **surface-aware**. The `summary` / `content` split stays for Workboard and is
removed from chat; chat carries the whole answer inline in `summary`.

1. **Surface signal.** Add `outcomeMode: 'chat' | 'work'` to `RuntimeConversationTurnInput`.
   `sendWorkRun` sets `'work'`; the two chat call sites (the Ordinus assistant and the Agent room)
   set `'chat'`. Adapters select the schema and prompt guidance from this flag.

2. **Chat outcome schema.** Derive the chat schema from the existing work schemas by **omitting
   `content`**. A chat `final_response` is `{ outcome, summary, artifactRefs, changedFiles }`; the
   `needs_input` branch is unchanged. The provider split is preserved (strict-chat for Codex/Gemini,
   relaxed-chat for Claude). The model cannot emit `content` in chat — the split is structurally
   impossible, not merely discouraged. The chat `summary.maxLength` is generous (256k).

3. **Chat prompt guidance.** Chat variants of the outcome guidance drop the "content is the full
   body / long text belongs in content" instructions and tell the model to put the entire answer in
   `summary` as GitHub-flavored Markdown. Claude keeps field-style guidance (it fills a tool); Codex
   / Gemini keep "return JSON only" with `content` removed from the shape. Workboard guidance is
   untouched.

4. **Cap and clip alignment for chat.** Raise the Zod `summary` ceiling to 256k; raise
   `turnContentLimit` so the Agent room no longer clips chat answers; the Ordinus path already stores
   raw. The two chat surfaces are aligned to one generous behavior. `preview` (240 chars) and the
   `truncated` safety flag remain.

5. **Remove `result_content` from the chat data model.** Drop the `result_content` column from
   `conversation_turns` and `ordinus_conversation_turns`, remove `resultContent` from
   `ConversationTurnSchema`, the preload types, and the `session.ts` / `completeConversationTurn`
   mappings, and delete the `TurnFullResponse` component and its use. No migration — the database is
   reset between development builds and there are no production users. `work_runs.result_content` is
   a **separate table and column** and is left intact.

What is deliberately **not** changed:

- Workboard's `summary` / `content` model, its 16k summary ceiling, and its `work_runs` persistence.
- The provider schema divergence (Claude relaxed / Codex-Gemini strict) and the
  `normalizeAgentTurnOutcome` repair layer — both are provider-level and protect chat *and*
  Workboard from the Claude bail.
- The `needs_input` panel flow.

## Alternatives Considered

### Display-only merge (band-aid in the renderer)

Leave the shared schema and prompt alone; in chat, render the body inline by preferring `content`
over `summary`. Rejected: the model still splits, so the result stays provider-dependent — Claude
leaves nothing to merge, Codex/Gemini split and you must guess whether to show `summary`, `content`,
or both (risking double-rendering). It hides the symptom and preserves the inconsistency.

### Keep `content` in the chat schema but instruct the model not to use it

A softer version of the decision: the field stays, guidance says "leave it empty." Rejected:
Codex/Gemini under the strict text-channel schema can still populate it, and if chat ignores
`content` that text is silently lost. Removing the field makes the loss impossible.

### A dedicated, fully separate chat outcome type (drop the `summary` name)

Give chat its own schema with a `body` field so "summary" never appears in a chat context.
Rejected as over-engineering: it doubles the schema and prompt surface across three providers for a
naming nicety. Reusing `summary` (with `content` removed) reaches the same behavior with far less to
maintain, and aligns with Claude's existing tendency to fill `summary`.

### Unify the schema across providers (give Codex/Gemini the relaxed schema too)

Collapse the strict/relaxed divergence into one relaxed schema for all providers, leaning on the
repair layer. Rejected for this change: Codex/Gemini do not bail on the strict schema — it causes no
active problem — so relaxing them is an orthogonal behavior change to two working providers that
would muddy verification of this fix. Left as a possible later, separately-tested cleanup.

### Keep the 16k cap and treat overflow as the signal to collapse long answers

Rejected: a hard Zod `.max()` failure crashes the turn mid-conversation, and `turnContentLimit`
clips with no recovery once the expander is gone. Both are bad UX. A generous chat ceiling keeps the
"everything inline" promise robust; genuinely huge deliverables remain a future, deliberate move to
selective collapse (see Consequences).

## Consequences

- Chat answers render in full inside the message bubble across all three providers. No "Show full
  result" expander, no provider-dependent truncation, no hidden body.
- The chat `final_response` schema collapses toward `{ outcome, summary }`, which further reduces the
  Claude empty-`{}` bail risk on chat turns (the heavy part that triggered it lives only in the
  `needs_input` branch).
- The Ordinus assistant and Agent rooms now persist and render chat turns identically; the
  DB-layer asymmetry is gone.
- `result_content` no longer exists for chat — one fewer always-empty column and a deleted
  component. Workboard's deliverable storage is unaffected.
- Existing chat turns are discarded with the database reset; any historical `result_content` bodies
  are intentionally not migrated (they become inaccessible). This is acceptable given no production
  users.
- **Deferred:** if very long chat answers become a real problem (the "B" path discussed during
  design), reintroduce *selective* collapse in chat — inline by default, collapse only genuinely
  large produced documents — rather than reviving the per-turn summary/content split.
