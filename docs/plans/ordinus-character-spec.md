# Ordinus signature character — generation spec (ADR-048 §4, phase 5)

Ordinus needs ONE fixed, static signature character, derived from the agent base
mascot (`docs/Chars/Base.png`) but unmistakably a distinct class — "the right
hand above the roster," not another agent. This file is the brief for generating
that asset. I (Claude) cannot generate images; produce the PNG with an image tool
using the prompt below, drop it in, and I'll wire the build pipeline + UI.

## What makes it Ordinus (the three differentiators)

1. **Reserved brand color** — use the app's `--primary` tint, which no agent color
   uses (agents draw from slate/rose/amber/emerald/sky/violet). This is the
   strongest "this one is special" signal.
2. **Halo / ring motif** — a calm concentric ring behind the character's
   head/shoulders, inheriting the old Ordinus mark. Agents have no halo.
3. **Headset** — a subtle, professional over-ear headset (concierge / executive-
   assistant signifier). Adult and understated, never toy-like.

Everything else stays in the base mascot's language: the same soft, rounded,
matte clay/plush body and minimal friendly face. It must read as the same world.

## Image-generation prompt (starting point)

> A soft, rounded 3D clay/plush character mascot, same style and proportions as a
> minimal beige clay figure with a simple friendly face (small eyes, gentle
> smile), head-and-shoulders portrait, front-facing. It wears a slim modern
> over-ear headset (professional, understated). Behind its head is a single calm
> glowing concentric ring (a soft halo). The character and halo use a refined
> [PRIMARY BRAND COLOR] palette. Studio-soft lighting, smooth matte finish,
> centered, generous padding, fully transparent background. Calm, competent,
> warm-professional mood. No text, no logos.

Replace `[PRIMARY BRAND COLOR]` with the resolved `--primary` value (check the
theme; the prior mark used an orange signature tint, see
`docs/plans/ordinus-mark-concepts.html`).

## Deliverable

- A square PNG with a transparent background, head-and-shoulders, generous
  padding (mirror the framing of `docs/Chars/Base.png`).
- Save the source as `docs/Chars/Ordinus.png`.
- One pose only (static). State-based animation is deferred (ADR-048 phase 6).

## Wiring (I'll do this once the PNG exists)

- Add an Ordinus-specific entry to the mascot WebP build (`app/scripts/build-mascots.mjs`)
  or a sibling step, emitting an optimized WebP into the renderer assets.
- Surface it as Ordinus's avatar across Home (hero + top strip) and the onboarding
  self-introduction (phase 4), replacing/augmenting the concentric-ring mark.
- Keep the ring mark component as a fallback and as the in-line "thinking" affordance.
