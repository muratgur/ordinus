# Use Cases

Real projects built with Ordinus, end-to-end. Each entry shows the original prompt, the crew and workflows that did the work, and what came out the other end.

---

## Shape Survivor — a Godot game in ~12 hours, zero human-written code

A complete Brotato-like with 6 characters, 7 weapons, 8 waves, a boss, draft upgrades, a shop, and a codex — all procedurally drawn, no assets. Built by a 6-agent crew (Creative Director, Game Designer, Analyst, Game Critic, Developer, CEO) running 3 reusable workflows over 142 tasks.

**[Read the story →](shape-survivor/)** &nbsp;·&nbsp; **[Game repo →](https://github.com/muratgur/shape-survivor)**

---

## Riley Brown — a personalized creator intelligence report in 23 minutes

The YouTuber Intelligence Pipeline: point a 5-agent crew at any YouTube channel and it researches the creator across the whole web, analyzes their brand and growth, and assembles a polished, personalized HTML report *about them*. One run, five sequential agents, zero failures, ~23 minutes. The twist: three of the five agents were built for a totally different job (solo-dev product marketing) and were retargeted onto a creator purely by the workflow instructions. This run profiled Riley Brown (@rileybrownai) — one folder per creator, so future runs live alongside it.

**[Read the story →](riley-brown/)** &nbsp;·&nbsp; **[Final report →](riley-brown/outputs/youtuber-report.html)**

---

## Failed Card Game — "Internship Inferno", a deckbuilder that never became playable

A post-mortem, not a success story. I wanted a Slay-the-Spire-like, built a 9-agent crew, drew a workflow that looked great, and walked away. 2.5 hours and two maxed-out Codex usage limits later I got ~3,000 lines of GDScript, 9 design docs, and one non-runnable `.pck` — nothing I could open on my Mac. This page debugs exactly where and why it broke: a strictly linear pipeline with no isolation, an environment missing Godot export templates, a model that hallucinated its own test files, and a Definition of Done that measured "code compiles" instead of "game runs." The crew did good work; I never verified the one thing I actually wanted.

**[Read the debug report →](failed-card-game/)**

---

## What goes in a use case

Each `<slug>/` folder contains:

- `README.md` — the story: what I asked, what came back, how Ordinus did it, what I learned
- `assets/` — hero image/GIF + supporting screenshots
- `workflows/<name>/` — one folder per reusable workflow, with:
  - `overview.png` — Workflow Designer screenshot
  - `README.md` — node-by-node spec (agent, prompt, expected output, dependencies)
- `agents/` — one markdown per agent in the crew, in the same shape Ordinus uses internally

## Contributing a use case

Built something interesting with Ordinus? Open a PR adding a folder under `use-cases/<your-slug>/` following the layout above. Keep the README narrative and concrete — the prompt you gave, the agents you used, what worked, what you'd change. Screenshots and numbers beat adjectives.
