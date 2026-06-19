# Failed Card Game — "Internship Inferno", a Slay-the-Spire-like that never became playable

> I wanted a Slay-the-Spire-style roguelike deckbuilder. I built a 9-agent crew, drew a workflow that *looked* great, hit Run, and walked away. Two and a half hours and two maxed-out usage limits later, what I got back was something I couldn't open, couldn't read, and couldn't play. This is the debug report: what actually came back, how the run progressed, what each agent was doing, and exactly where it broke.

**This page is a post-mortem, not a success story.** It sits next to [shape-survivor](../shape-survivor/) on purpose — same kind of crew, same kind of workflow, opposite outcome. The difference between the two is the whole lesson.

---

## The ask

The game I was going for: a roguelike deckbuilder in the broad genre of Slay the Spire, but with its own identity — you're a **software-developer intern** and the "enemies" are white-collar workplace problems (toxic colleagues, pointless meetings, shifting requirements, burnout, performance reviews). Desktop, Godot, no assets yet, built one card/mechanic at a time around clear docs.

The exact original request I dropped into Ordinus is preserved verbatim in the work request — it's a long, careful brief that names four agents and their responsibilities (Game Director, Systems Designer, Godot Technical Lead, Game Critic) and lists the expected Markdown deliverables. It was a *good* prompt.

## What I expected vs. what I got

| | |
| --- | --- |
| **What I expected** | A playable Slay-the-Spire-like I could open and click through on my Mac. |
| **What I got** | ~3,000 lines of GDScript, 92 card/data resources, 9 design documents, 2 HTML reports — and **one 240 KB `builds/linux/internship_inferno.pck`** that doesn't run on macOS, doesn't run on anything without the exact Godot engine, and shows nothing if you double-click it. The `builds/macos/` and `builds/windows/` folders are **empty**. |

That gap — between a mountain of confident, high-quality *work* and zero *playable result* — is what this report explains.

## By the numbers

| | |
| --- | --- |
| Work request | "Interno Inferno" (game later named *Internship Inferno*) — final status **failed** |
| Clock time | ~2h41m (Jun 19, 05:52 → 08:33) |
| Provider | **Codex** (ChatGPT) for all 9 agents |
| Agents on the crew | 9 |
| Saved workflow designs | 2 ([first-playable](workflows/first-playable/), [full-game-development](workflows/full-game-development/)) |
| Work runs total | **73** — 42 completed, **31 failed** |
| Usage limit hit | **twice** (two whole batches died on "You've hit your usage limit") |
| Code produced | 25 `.gd` files (~3,085 lines), 92 `.tres`, 3 `.tscn`, 9 `.md` docs, 2 HTML reports |
| Real art assets | **0** (only the default `icon.svg`) |
| Runnable build for my OS (macOS) | **0** |

## The crew

I created 9 agents, all on Codex. Their full profiles are in [`agents/`](agents/).

| Agent | Role | What it was for |
| --- | --- | --- |
| [Game Director](agents/game-director.md) | Game Director | Concept, identity, scope, the "what not to build" |
| [Systems Designer](agents/systems-designer.md) | Systems Designer | Combat/resource/card systems, status effects, archetypes |
| [Godot Technical Lead](agents/godot-technical-lead.md) | Godot Technical Lead | Data-driven architecture, milestones, *no code itself* |
| [Game Critic & Evaluation Lead](agents/game-critic-and-evaluation-lead.md) | Evaluation | Reviews concept + gates each production phase |
| [Documentation Publisher](agents/documentation-publisher.md) | HTML Artifact Designer | Turns content into HTML reports |
| [Gameplay Programmer](agents/gameplay-programmer.md) | Senior Gameplay Programmer | **The one who actually writes the Godot game** |
| [Prototype UI/UX Designer](agents/prototype-ui-ux-designer.md) | UI/UX | Combat screen layout, flow |
| [Prototype Content Designer](agents/prototype-content-designer.md) | Content | Card text, copy, content bible |
| [Prototype Art Direction Lead](agents/prototype-art-direction-lead.md) | Art Direction | Visual/style direction, "asset kit" |

Note who's missing: there is **no agent whose job is "install/export the build and confirm it launches on the target OS."** That hole is the whole story.

## How the run actually progressed

Eight distinct phases, reconstructed from the work-run timeline in the database:

| # | Time | Phase | Tasks | Outcome |
| --- | --- | --- | --- | --- |
| 1 | 05:52 | **Concept Package** — Game/Systems/Dev briefs, Critic review, Final summary | 5 | ✅ all completed — genuinely strong docs |
| 2 | 06:23 | Combat Micro-Slice spec | 1 | ✅ |
| 3 | 06:28 | Readiness assessment | 1 | ✅ |
| 4 | 06:35 | Starting-Point report + publish as HTML | 2 | ✅ |
| 5 | 06:58 | **[First Playable workflow](workflows/first-playable/)** — scaffold → combat → UI → debug → build → 2 critic gates → fix → candidate → docs | 17 | ✅ all completed — a real Godot combat sandbox got built |
| 6 | 07:42 | **[Full Game workflow](workflows/full-game-development/)**, run #1 | 16 | ⚠️ 5 ok, then design nodes hit the **usage limit**, and **11 downstream nodes auto-failed** ("Required upstream Work Item failed") |
| 7 | 07:44 | Full Game workflow, **retry** | 16 | ❌ **all 16 failed within 2 seconds** — usage limit again |
| 8 | 07:46 | Full Game workflow, retry #2 | 16 | ⚠️ design + gates completed, but the **Final Playable Game Build failed**, taking Final Handoff down with it → the whole work request is marked **failed** |

Phases 1–5 are the good news: by 07:32 there was a legitimately working **combat micro-slice** (a Godot project that boots, with a deterministic turn loop, 12 cards, statuses, encounters, debug tools). If I had stopped there and *looked*, I'd have had something. I didn't — I pointed the crew at "now build the whole game" and walked away.

## Root cause — why I got something unviewable

There isn't one bug. There are five, stacked:

### 1. The deliverable I needed was never the deliverable the workflow verified

The [full-game workflow](workflows/full-game-development/) ends with two nodes: **"Final Playable Game Build"** → **"Final Handoff Documentation."** But "build" here meant *write more GDScript and a `.pck`* — not *produce a thing I can open on my Mac*. Every gate in the pipeline reviewed **code and written claims**, never a launched application. So the pipeline could report success at every step and still hand me nothing runnable.

### 2. The killer: export templates were never in the environment

The crew's own handoff doc says it plainly:

> *"Standalone executable export is configured but could not be generated in this environment because Godot export templates are not installed under the local template path."*

Godot can't produce a `.exe`/`.app`/Linux binary without **export templates** installed. They weren't. So the *best possible outcome* of this entire 2.5-hour run was a `.pck` (a packed resource blob), which is **not a standalone game** — it needs the matching Godot engine to load it. On macOS, with only `builds/linux/` populated, there was literally nothing for me to double-click. **No amount of agent effort could have fixed this — the environment was missing a hard prerequisite before the run even started.**

### 3. The final node failed on a file the model only *claimed* to write

The last build node failed with:

> *`Provider reported file paths that were not created in the workspace: scripts/tests/beta_balance_test.gd`*

On disk there's a `beta_balance_test.gd.uid` but **no `beta_balance_test.gd`**. Codex said it wrote the file; it didn't. Ordinus's file-verification guard caught the lie and failed the node — that part is Ordinus *working correctly*. Worse, the Critic's Gate 4 review had *already* recorded "`beta_balance_test.gd` passed" — it was reviewing a test file that doesn't exist. The model was hallucinating its own verification.

### 4. A strictly linear pipeline turns one failure into total failure

The workflow is essentially one long chain. So:
- When the design nodes hit the usage limit in phase 6, **11 downstream nodes auto-failed** without running.
- When the Final Build node failed in phase 8, **Final Handoff auto-failed** and the **entire work request flipped to failed** — even though hours of valid work sat upstream.

There's no isolation and no fallback path. One bad node sinks everything after it.

### 5. The work was piled onto one agent in giant, token-heavy, hard-to-verify lumps

A single **Gameplay Programmer** owns six enormous serial nodes — "Core Full Loop Foundation," "Alpha Full-Run Production," "Beta Polish and Balance," "Final Playable Game Build"… Each is a monolith. That's *where the "incredible token use" came from*, and it's why I **maxed out my Codex usage limit twice**: huge implementation turns, retried wholesale on failure.

## Why the visuals looked "weird and unreadable"

The concept brief explicitly said *don't rely on simple rectangles and triangles — define a real visual direction*. But there was **no asset pipeline and no real art**: the project ships **zero textures, zero custom fonts** (only the stock `icon.svg`), and not a single `draw_*` call. Everything is default, unstyled Godot `Control` nodes at a fixed 1366×768 layout with the engine's default gray theme. So even in the best case — opening the project in the Godot editor — you get raw default UI, not the "readable desktop card-game" the Art Direction agent wrote three documents about. And if you instead opened the `.pck` (the only thing in `builds/`) directly, you saw binary garbage. Either way: "görünemeyen, okunamayan, garip görüntüler."

(There's also light naming drift that signals how loosely the late phases were supervised: the work request is titled *"Interno Inferno,"* the project is *"Internship Inferno,"* the workflow says *"Intern Inferno,"* and the build metadata says *"Internship Inferno Beta."*)

## What I'd do differently

1. **Make "runs on my OS" the Definition of Done — and verify it, not document it.** Add a final node that actually exports *and launches* the build, and fails loudly if it can't. A gate that reads code is not a gate that proves a game runs.
2. **Check the environment before a long run.** Godot export templates had to be installed up front. Five minutes of setup would have saved 2.5 hours. If the environment can't export, scope the goal honestly to "editor-runnable project."
3. **Don't trust "I wrote the file" — Ordinus already doesn't.** The phantom-file guard is right. Lean into it: smaller write steps fail smaller and re-run cheaper.
4. **Break the chain.** A strict linear pipeline means one failure = total failure. Split the Gameplay Programmer monolith into smaller, independently verifiable nodes, and don't let a late cosmetic node sink hours of good upstream work.
5. **Read your own quality gate.** Gate 4 literally said *"Release Candidate: Not Approved Yet — no verified exported desktop build."* The workflow marched past its own Critic straight into the failing build node.
6. **Watch the provider budget.** Nine agents, one provider, monolithic turns → two maxed usage limits. Smaller steps and/or mixed providers keep a long run alive.
7. **Look at the intermediate output.** My real mistake was human, not technical: I "didn't look at any detail." The Phase-1 concept package and the Phase-5 combat micro-slice were *good*. Had I inspected them, I'd have caught that the leap to "build the entire game and export it" had no runnable target — before burning two usage limits on it.

## The honest takeaway

This wasn't an AI-can't-make-a-game story. The crew produced a coherent design and a genuinely working combat prototype. It failed because I treated a multi-agent workflow like a vending machine — drew a pretty graph, fed it a great prompt, walked away, and never defined or verified the one thing I actually wanted: *a file I can open and play.* The agents optimized exactly what the workflow measured (documents and code that compiles), and nobody — including me — measured "playable on my Mac."

## Reproduce / inspect

- **Agents:** [`agents/`](agents/) — the 9 crew profiles as Ordinus stored them.
- **Workflows:** [`workflows/first-playable/`](workflows/first-playable/) (the one that worked) and [`workflows/full-game-development/`](workflows/full-game-development/) (the one that failed), reconstructed node-by-node from the saved canvas.
- **Live artifacts:** the run produced a Godot project folder (the `.gd`/`.tres`/`.tscn` source, the design docs, the two HTML reports, and the lone non-runnable `.pck`) under the configured Ordinus workspace.
