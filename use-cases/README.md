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
