# Use Cases

Real projects built with Ordinus, end-to-end. Each entry shows the original prompt, the crew and workflows that did the work, and what came out the other end.

---

## Shape Survivor — a Godot game in ~12 hours, zero human-written code

A complete Brotato-like with 6 characters, 7 weapons, 8 waves, a boss, draft upgrades, a shop, and a codex — all procedurally drawn, no assets. Built by a 6-agent crew (Creative Director, Game Designer, Analyst, Game Critic, Developer, CEO) running 3 reusable workflows over 142 tasks.

**[Read the story →](shape-survivor/)** &nbsp;·&nbsp; **[Game repo →](https://github.com/muratgur/shape-survivor)**

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
