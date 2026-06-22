# Ordinus Landing Page — Blueprint

> Narrative-driven landing redesign. Goal: hook AI-subscriber founders/builders, pull them
> through a story (novel-like scroll), make them curious, convince them to download.
> Decisions locked via grill-me session (2026-06-22).

## Strategy
- **Audience:** people who *already* pay for Claude/Codex, tech-savvy, curious how to put AI
  into their own work. Founders / indie builders / technical prosumers. NOT non-subscribers,
  NOT "developer juggling 10 CLIs".
- **Narrative:** hero = the user. Conflict = *AI you use today (one-at-a-time chatbot)* vs
  *AI now possible (a team with roles, that reaches into your tools, works while you sleep)*.
  Reward = the team. Opening "that's me" beat = not pain, but a quiet *awakening*.
- **Language:** English only.

## Hero (layout A — copy left / animation right)
Left column, top→bottom:
1. Mirror eyebrow: "You pay for the smartest AI in the world. You still use it like a chatbot."
2. Headline (largest): "Not an AI. A team."
3. Sub: "Ordinus turns Claude and Codex into a team of agents with roles — that talk things
   through, reach into your tools, and get the work done."
4. Badge: "Runs on your machine. Nothing leaves it."
5. CTA: Download · Star on GitHub

Right: existing 5-tab interactive doodle stage = **teaser** (quick taste).

## Scroll body = the novel (5 chapters, rising autonomy)
Each chapter: `0X · Name` thin number → narrative headline (a sentence, not a feature name)
→ 2-3 lines → **curiosity question** → rich animation. Chapters **alternate sides**.

| # | Chapter | Anchor scenario | Curiosity line |
|---|---------|-----------------|----------------|
| 01 | Conversations | "Your personal board of directors" | "How many voices do you want in the room?" |
| 02 | Workboard | "Brief them once. Get the whole thing back." | "What's the biggest thing you'd hand off?" |
| 03 | Connections | "Your team, where your work already lives." | "Where would you want to reach your team from?" |
| 04 | Workflow | "Build the machine once. Press the button forever." | "What do you do over and over that a flow could just do?" |
| 05 | Schedules | "It works the night shift." | "What would you want waiting for you tomorrow morning?" |

**Rich animation (option C):** doodle plays → morphs into the **real screenshot inside a
window frame** (transition technique **B: settle-into-frame** — frame stays, content goes
doodle→screenshot). Doodle resembles the real screen. Frame is brand-styled (hand-drawn,
Kalam, soft — not macOS chrome). Carousel screenshots get distributed into chapters.

## Finale
1. Closing headline: "Your AI team, right on your desktop." + "Stop talking to AI one message
   at a time. Put it to work."
2. Three trust cards: Runs on what you already pay for · Stays on your machine · Already built real things.
3. Proof: modest, growing, honest gallery (successes + failures). Shape Survivor = one card, not a trophy.
4. Big CTA + honest note: "Needs Claude or Codex installed. macOS & Windows. Unsigned — you'll
   approve it on first launch."

## Mechanics
- Scroll-triggered animation (IntersectionObserver): only one live scene on screen at a time
  → no "wall of motion". `prefers-reduced-motion` respected.
- Thin chapter numbers. **No nav**; only a small fixed Download top-right.

## Mobile
- Vertical stack (text above, animation below), full story.
- Lighter animations (short doodle or direct in-frame screenshot).
- CTA = Star on GitHub + thin "📤 Send to my computer" (`navigator.share`, fallback copy-link)
  + "Ordinus runs on your Mac or PC."

## Tech
- Keep vanilla HTML/CSS/JS + rough.js, GitHub Pages, no build. Grow existing `app.js`; reuse
  scene fns in hero + scroll. Split app.js into modules (scene drawing / scroll controller /
  transition engine).
- Palette/fonts kept: warm-black `#111` + orange `#d97757` + Kalam doodle.
- OG card aligned: "Not an AI. A team." + "Turn the AI you already pay for into a team that
  gets the work done." + doodle team frame.

## Build order
Skeleton + hero + Conversations chapter (full C transition) end-to-end → review → replicate
the remaining 4 chapters in the same mold.

## Build status — DONE (2026-06-22)
Shipped end-to-end and verified in preview.
- **Hero**: mirror eyebrow added above "Not an AI. A team.", 5-tab teaser kept.
- **Doodle approach evolved**: each chapter's doodle is now a loose hand-drawn **wireframe of
  the real screen** (not a metaphor) whose viewBox matches the screenshot, so it maps onto and
  morphs into the actual UI in place. Frame ratio is per-chapter via `--shot-ratio` (real px),
  so every screenshot fits with no crop.
- **5 chapters** built (`chapters.js` + sections in `index.html`), alternating sides:
  01 Conversations · 02 Workboard (flip) · 03 Connections · 04 Workflow (flip, dark shot) ·
  05 Schedules. Scroll-triggered (IntersectionObserver), click-to-replay.
- **Screenshots**: all toolbar-free, 2880×1740 except where noted — Conversations, Workboard,
  Connections, Workflow (Workflow -Security.png, dark), Schedules.
- **Finale** (replaces old carousel tail): "So — what's the catch? / There isn't one." +
  free/open-source/electricity kicker + 3 fact pills + big CTA (Download for Mac & Windows /
  Star) + honest install note. Proof gallery dropped per owner — punchy close instead.
- **Mobile**: `is-mobile` swaps Download → "📤 Send to my computer" (Web Share API, clipboard
  fallback) + "runs on your Mac or PC" hint.
- **Tech**: still vanilla HTML/CSS/JS + rough.js, GitHub Pages, no build.

Open polish (non-blocking): OG share image (`og-image.png`) could be regenerated from `og.html`
if desired; title/description already on-message. The IO-restart flicker seen during isolated
testing is a test artifact only — real scroll-in plays once, clean.

## Second page — "How You Use It" — DONE (2026-06-22)
Pre-download persuasion (Plan A), usage-journey, text-first. New files:
`docs/how-you-use-it.html` + `docs/landing/how-you-use-it.js` (+ styles appended to styles.css).
- **Audience altitude**: indie builder / vibe-coder / solo founder — NOT super-dev. No "CLI",
  "SQLite", "DAG"; plain language, example-driven; safety/trust is the emotional anchor.
- **Walking trail** (revised — replaced the spine diagram AND the screenshots): the body is a
  hand-drawn left rail (rough.js) with numbered stations ①–④ connected by bowing down-arrows —
  a literal "walk" through the journey. NO app screenshots here (they live on the home page);
  text-first. Rail is drawn to measured layout, redraws on resize, light stroke-reveal on view.
- **Journey stations**: 01 Build your team (examples) · 02 Give them work — 4 ways as lanes off
  the path (talk / hand off / flow / schedule), each a bullet + heading + accent example ·
  03 Reach your tools · 04 Your stuff stays yours (directly answers "do you inject into my
  Claude/Codex / does my data leave?") · then FAQ "which to use when" · CTA + send-to-computer.
- **Nav**: top-bar "How you use it" link was tried then **removed** (looked awkward) — discovery
  is now via the contextual `.midlink` bridge on the home page before the finale only. Home top bar
  = Ordinus · GitHub ★; sub-page top bar = Ordinus · Download.
- **Hero CTA trimmed**: "Star on GitHub" removed from the hero (just Download now); on mobile the
  hero Download swaps to "📤 Send to my computer" (global is-mobile rule).
- Sticky section-nav on the sub-page.

Deferred (future): **Plan B** deeper technical "how it works" page; a **Built with Ordinus**
case-studies page (use-cases content incl. honest failure already exists); an **About/maker** page
(pending the personal-info decision).

## Smart download buttons — DONE (2026-06-22)
`docs/landing/download.js` (loaded on both pages). Detects OS → labels the primary
button "Download for Mac" / "Download for Windows" (buttons opt in via `data-os-label`),
and resolves the CURRENT release's `.dmg`/`.exe` directly via the GitHub API
(`/repos/muratgur/ordinus/releases/latest`, match by extension) so links auto-follow the
version bump with no release-process change. Falls back to the releases page if the API is
unavailable or OS is unknown. A `.js-download-other` link points to the other platform's
installer ("On Windows? Get that version →"). Verified live: resolved v0.5.1 dmg/exe directly.
