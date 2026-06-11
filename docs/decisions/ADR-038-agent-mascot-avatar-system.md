# ADR-038: Agent mascot avatar system

## Status
Accepted

## Date
2026-06-11

## Context

Agents currently get their visual identity from an abstract `color|symbol` pair
(8 Tailwind colors × 16 Lucide icons), packed into the single `avatar` text
column (`"rose|Target"`) and rendered entirely in code by `AgentAvatar`. The
symbol was meant to create a bond between user and agent, but an abstract icon
carries little personality. Since ADR-027 the product frames agents as
colleagues (1:1 rooms, presence, CV/About tabs); the visual identity should
match that framing.

A set of mascot character renders exists in `docs/Chars/`: one felt-doll base
character ("Base") plus 12 outfit variants — same face and body, different
clothing/accessories. Constraints that shaped this decision:

- The owner will regenerate and replace character images often; swapping an
  image must require **zero code changes**.
- Source renders are ~2 MB each (27 MB total) with a baked-in solid background;
  they must not bloat the open-source repo history or the app bundle.
- Users should later be able to customize the avatar background color, which
  requires transparent-background assets.
- Avatars render from 16 px (workboard cards) up to 56 px today.

## Decision

Replace the color+symbol avatar system with a **single-species mascot**: every
agent is a variant of the same base character, differentiated by outfit and a
user-chosen background color.

### Identity & data model

1. **One mascot species, outfit variants** — variants are not tied to roles or
   personas; the outfit is purely visual and interpretation is left to the
   user (consistent with the direction-not-configuration philosophy).
2. **Numeric variant ids** (`0` = Base, `1..n`). Ids are never reused for a
   different character once released; the owner's workflow is to overwrite an
   existing number with a new render, which preserves this invariant naturally.
   An id with no matching asset falls back to Base.
3. **Reuse the existing `avatar` column and IPC contract** with a new packed
   format: `"<variantId>|<colorId>"` (e.g. `"3|emerald"`). No schema migration.
   Parse rule: numeric left side → mascot; anything else (legacy
   `color|symbol`, legacy emoji, empty) → Base variant, with the legacy color
   reused as background where present.
4. **Background palette reduced from 8 to 6**: `slate, rose, amber, emerald,
   sky, violet` (drop `indigo` ≈ violet and `fuchsia` ≈ rose). The format can
   carry a hex value later if free color selection is added.

### Asset pipeline

5. **Source renders stay out of git**: `docs/Chars/` is gitignored and remains
   the owner's local working folder (numbered PNGs, high resolution, baked
   background).
6. A build script (`npm run mascots:build`) removes the solid background,
   resizes to **512 px transparent WebP** (~30–60 KB each), and writes to
   `app/src/renderer/src/assets/mascots/`. Only the built WebPs are committed
   (~0.5 MB for the full set), so contributors get a fully working app.
   512 px covers the largest current use at 2× and leaves room for large
   portraits. One size only; the browser downscales well.
7. **No hand-maintained manifest**: the renderer discovers variants via Vite
   `import.meta.glob` over the assets folder. Adding `13.png` and rebuilding
   makes it appear in the picker with zero code changes.
8. Characters must share a **standard crop** (same head line, shoulder cut,
   padding) so the squircle mask treats every variant equally; Base is the
   crop template.

### Rendering

9. **Squircle, not circle** (Slack-style rounded square, radius ~22–25% of
   size, scaled). Portrait-cropped characters lose shoulders in a circle; the
   square gives ~20% more visible area. All "person" avatars in the app use
   the squircle; status dots stay round. The change lives in `AgentAvatar`
   only — call sites are untouched.
10. **Size threshold**: below 24 px the mascot is unreadable, and with 6
    colors a color-only chip collides between agents. `AgentAvatar` renders a
    colored mini-squircle with the agent's initial instead. Callers keep
    passing `size={16}`; the component decides.
11. The user-selected background color fills the squircle behind the
    transparent character at all mascot sizes.

### Selection UX

12. The create flow's Shape Stage becomes a **carousel**: one large character
    shown at a time, left/right navigation, dot indicator for position/count,
    color swatches (6) below, live preview of character-on-color. A random
    variant + color is pre-selected so the step can be skipped in one click.
    The same picker is reused in agent settings (per ADR-027).
13. **No AI involvement** in character suggestion — role-based picks
    ("analyst → glasses") would reintroduce role-coupling through the back
    door (see decision 1).
14. **Agent room welcome scene**: the room's empty state shows a large mascot
    portrait (~120–160 px) with the agent's name and a short static intro.
    The auto-sent first greeting (ADR-027 §9) is **retired**: its content
    moves into the static welcome scene, and the conversation starts when the
    user writes first. This also makes the welcome scene actually visible.

### Relationship to prior ADRs

- **Refines ADR-018 §1**: the curated-library bonding ritual stays, but "no
  random fallback" is softened to random *pre-selection* within the curated
  set — browsing the carousel remains the bonding moment, skipping is allowed.
- **Revises ADR-027**: §"reuse color+symbol picker" → reuse the mascot picker;
  §9 provider-generated first greeting → static welcome scene (see 14).
- **Consistent with ADR-029**: the Ordinus assistant keeps its distinct
  abstract animated mark and explicitly does **not** become a mascot; the home
  presence visual is a separate future effort.
- ADR-033 (rail avatar slot) and ADR-035 (room chrome identity) are unaffected
  structurally; they inherit the squircle rendering.

## Alternatives Considered

### Distinct character species per agent
- Pros: maximum differentiation between agents.
- Cons: brand inconsistency, every new character is a from-scratch asset cost,
  rosters of mixed creatures look incoherent.
- Rejected: outfit variants give differentiation while keeping a single brand
  mascot and enabling future combinatorial customization.

### Keep symbols alongside mascots
- Rejected: two permanent identity systems to maintain and parse, split design
  language, no real user value at the current (pre-release) stage.

### Semantic slugs / hand-written manifest
- Rejected as over-engineering: the owner is the only asset producer, users
  never see identifiers, and overwrite-by-number plus glob discovery meets the
  "swap images without touching code" requirement with less machinery.

### Separate DB columns for variant and color
- Rejected: schema migration and contract churn for no behavioral gain;
  contrary to the minimal-persistence stance.

## Consequences

- `agent-palette.ts` (symbols) and the symbol picker UI are deleted; Lucide
  symbol list and 2 of 8 colors retired. Existing avatars degrade gracefully
  to Base + their old color without a data migration.
- App bundle grows ~0.5 MB for the full variant set; repo history is protected
  from the 27 MB sources.
- The build script becomes part of the asset workflow; background removal
  quality (felt texture edges vs. similar-tone background) must be verified
  per batch — color-key first, AI matting (rembg) as fallback.
- Out of scope for v1, deliberately: layered outfit/accessory composition,
  animated/state-reactive mascots (future Home presence work), user-uploaded
  images, free color picker.
