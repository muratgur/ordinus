# Implementation Plan — Ordinus Home Redesign (presence + classy stage)

Turns the design decisions captured in [ADR-029](../decisions/ADR-029-ordinus-in-app-personal-assistant.md)
(§1 identity/presence, §8 Home UI — both revised 2026-06-08) into concrete work.

**This is a polish/redesign pass on an already-working Ordinus**, not a from-scratch
build. The runtime, MCP tool layer, confirmation flow, memory, slash commands, and
persistence already exist. The gap is between the current generic-chat presentation and
the agreed "competent-colleague presence on a calm, classy stage."

Guiding decisions (from the grill session):

1. Ordinus is a **presence / competent colleague** (Jarvis), not a tool surface, not
   humanlike.
2. Visual anchor = a **distinctive animated abstract mark** (not `Sparkles`, not an
   avatar) that breathes idle / animates while thinking.
3. **Reactive** in v1 — no proactive status brief.
4. Empty state = **calm focused stage**, optically balanced (slightly above center).
5. Active conversation keeps a **shrunk persistent presence** in a thin top strip; its
   mark animation IS the working indicator.
6. Conversation **sidebar recedes** (default collapsed, hidden in the welcoming state).
7. Ordinus's results land as **compact in-transcript result cards**, replacing
   toast + auto-navigate; onward navigation is a user choice.
8. The welcoming state must show for **any conversation with zero messages**, not only
   when no conversation is selected (current bug).

Each phase is independently shippable behind the existing `ordinus_v1` flag.

---

## P0 — Welcoming-state visibility fix (~½ day)

The cheapest, highest-impact fix. Today the hero only renders when `activeConversation`
is null; once any conversation exists (or "New conversation" is clicked) the user drops
into a blank transcript and never sees the welcoming surface again.

### Files
- `app/src/renderer/src/screens/home/home-screen.tsx` — change the render branch from
  "`activeConversation ?`" to "active conversation **has at least one message** ?".
  A zero-message conversation (including a just-created one) renders `HomeEmptyState`.
  The conversation row still exists in the sidebar and is selectable; it just shows the
  welcoming stage until the first turn lands.
- Keep the empty-state input wired to `handleSend` (already creates/uses the active
  conversation), so sending from the welcoming state of an empty existing conversation
  works without creating a second conversation.

### Verification
- Click "New conversation" → welcoming hero shows (not a blank transcript).
- Send a message → transcript replaces the hero for that conversation.
- Switch back to another empty conversation → hero again.

---

## P1 — The Ordinus mark (animated presence component) (~2–3 days, design-led)

The emotional anchor. A real design-production task: define the mark's form and its
idle/thinking animation, then build it as one reusable component used at two scales.

### Files
- `app/src/renderer/src/screens/home/ordinus-mark.tsx` (new) — single component,
  props: `size` (hero | strip), `state` (idle | thinking). Idle = slow breathing;
  thinking = a livelier loop. Pure CSS/SVG animation, respects
  `prefers-reduced-motion` (fall back to a static mark).
- Remove `Sparkles` usage from `home-empty-state.tsx` (P2) and avoid it anywhere
  Ordinus is represented.

### Notes / open
- **Direction locked (2026-06-08): "Concentric ring" (concept A in
  `ordinus-mark-concepts.html`)** — an open ring orbiting a calm breathing core, orange
  signature tint; the ring's rotation doubles as the thinking indicator. The component is
  no longer blocked on art direction; remaining work is to productionize the concept-A
  SVG into `ordinus-mark.tsx` and refine proportions/timing.

### Verification
- Mark renders at both sizes; switches idle↔thinking on a prop; reduced-motion shows a
  static version.

---

## P2 — Welcoming state as a calm stage (~1.5 days)

Elevate the empty state from "generic chat welcome" to "classy presence stage."

### Files
- `app/src/renderer/src/screens/home/home-empty-state.tsx`:
  - Replace `Sparkles` block with the `<OrdinusMark size="hero" state="idle" />`.
  - Rewrite copy in **colleague/presence voice** (not "I can help you build workflows,
    debug runs…"). Short, warm-but-not-chatty, presence-toned.
  - Composition: **optically balanced** — anchor the hero stack slightly above true
    vertical center, generous whitespace, restrained type scale, single tint.
  - Keep slash-command chips but make them clearly **secondary** (quieter than today).
- Ensure the conversation **sidebar is hidden entirely** while the welcoming state is
  showing (see P3) — the stage stays pure.

### Verification
- Welcoming state reads as calm/classy; mark is the focal point; no Sparkles; copy is
  colleague-toned; sidebar not visible.

---

## P3 — Receded sidebar (~½ day)

Make the conversation list a summoned layer, not a persistent rail.

### Files
- `app/src/renderer/src/screens/home/storage.ts` — flip `readHomeSidebarDocked` default
  to **collapsed** (return `false` unless `'true'` is explicitly stored).
- `app/src/renderer/src/screens/home/home-screen.tsx` — in the welcoming/empty state,
  force the sidebar hidden regardless of the stored docked preference (the stage is
  pure); in the active state, honor the (now default-collapsed) preference with the
  existing edge toggle to summon it.

### Verification
- Fresh load → sidebar collapsed. Welcoming state → sidebar not shown. Active
  conversation → summonable from the edge; preference persists.

---

## P4 — Persistent top-strip presence (~1.5 days)

Keep Ordinus "in the room" during a conversation; unify presence with the working
indicator.

### Files
- `app/src/renderer/src/screens/home/home-top-strip.tsx` (new) — thin header:
  `<OrdinusMark size="strip" state={busy ? 'thinking' : 'idle'} />` + "Ordinus" +
  conversation title. Sits above the transcript in the active branch.
- `app/src/renderer/src/screens/home/home-screen.tsx` — render the strip in the active
  branch; pass `busy` so the mark animates while a turn is running. The transient
  "Ordinus is thinking…" status line near the input can be reduced now that the strip
  carries the working cue (keep a minimal version for tool-running detail later).
- `app/src/renderer/src/screens/home/home-transcript.tsx` — unchanged structurally;
  just no longer the only place "Ordinus" is represented.

### Verification
- Open a conversation → top strip with small live mark + title. Send a turn → strip
  mark animates while busy, settles to idle when done. User never faces a markless
  blank canvas.

---

## P5 — In-transcript result cards (replaces toast + auto-navigate) (~3 days)

The bonding payoff, and the largest item. When Ordinus produces a WR draft / workflow /
schedule, deliver it **in the transcript** as a compact card, not a toast or a forced
screen switch.

### Contract / main-process
- `app/src/shared/contracts.ts` — add `conversationId` to the three artifact action
  events (`workboard_plan_ready`, `schedule_created`, `workflow_created`) so the card
  can be routed to the originating transcript. (They carry only artifact data today.)
- `app/src/main/ordinus-tools/tools/{createWorkflow,createSchedule,proposeWorkRequest}.ts`
  + the publish path — thread the current `conversationId` into the published event.

### Renderer
- `app/src/renderer/src/screens/home/types.ts` — add a `result` `HomeMessage` kind
  (artifact type, id, title, short summary, an optional onward-action descriptor).
- `app/src/renderer/src/screens/home/home-result-card.tsx` (new) — **compact** card:
  artifact icon + title + one-line summary + a single explicit action (e.g.
  "Open in Workboard" / "Open workflow" / "View schedule"). Must not dominate the
  transcript; sits inline like any other turn entry.
- `app/src/renderer/src/screens/home/home-transcript.tsx` — render the `result` kind.
- `app/src/renderer/src/screens/home/home-screen.tsx` — subscribe to the artifact
  action events; on receipt, append a `result` message to that conversation's
  transcript. **Do not auto-navigate.**
- `app/src/renderer/src/app/ordinus-action-bridge.tsx` — stop auto-navigating on
  `workboard_plan_ready`; navigation now happens only when the user clicks the card's
  action. The bridge keeps a quiet secondary toast at most (optional), and still wires
  the Workboard draft-review state when the user chooses to open it.

### Persistence note
- For result cards to survive reload, persist them like other turns (extend the
  Ordinus turn store with a `result` kind, or store an artifact reference on the turn).
  If full persistence is out of scope for this pass, scope it to in-memory for the page
  lifetime and note it — but the no-auto-navigate + compact-card behavior ships
  regardless.

### Verification
- Ask Ordinus to draft a WR → compact result card appears **in the transcript**, no
  screen switch. Click the card action → Workboard draft-review opens. Same for
  workflow/schedule. Toast no longer the primary signal.

---

## P6 — Voice/copy alignment (~½ day)

Make Ordinus *sound* like the presence the UI now looks like.

### Files
- `app/resources/ordinus-knowledge/core-identity.md` — tighten the greeting/voice so
  first contact and ongoing tone match "competent colleague" (it already leans this
  way; align the welcoming-state copy and the system prompt so they're consistent).
- Any first-run greeting copy seeded into the welcoming state.

### Verification
- Welcoming copy, system-prompt voice, and first reply all read as the same calm,
  capable colleague — no tool-language drift.

---

## Sequencing

| Phase | What | Depends on | Risk |
|------|------|-----------|------|
| P0 | Welcoming-state visibility fix | — | low |
| P1 | Animated Ordinus mark component | — (design-led) | medium (art) |
| P2 | Welcoming state as calm stage | P1 | low |
| P3 | Receded sidebar | — | low |
| P4 | Top-strip presence | P1 | low |
| P5 | In-transcript result cards | — | high (contract + persistence) |
| P6 | Voice/copy alignment | P2 | low |

P0 and P3 can ship immediately. P1 (the mark) is the long pole because the art itself
must be designed; build the component against a placeholder so P2/P4 aren't blocked. P5
is the largest behavior change and the highest-value bonding moment — sequence it after
the visual stage (P0–P4) so the result card lands on an already-classy surface.

---

## Out of scope (this pass)
- Measured-proactive Home brief (ADR §1 leaves the door open; reactive-only for now).
- Live tool-call visibility band / collapsible tool blocks in the transcript (a separate
  earlier discussion; revisit after the presence redesign lands).
- Summarize-and-fork for frozen conversations (already deferred).
- Empty→active transition choreography polish (nice-to-have once P0–P4 are in).
