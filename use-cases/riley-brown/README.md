# Riley Brown — a personalized creator intelligence report in 23 minutes

> Built with the **YouTuber Intelligence Pipeline**: point a 5-agent Ordinus crew at any YouTube channel and it researches the creator across the whole web, analyzes their brand and growth, and assembles a polished, personalized HTML intelligence report *about them* — the kind of thing a senior analyst would charge for. One run, five sequential agents, zero failures, ~23 minutes end to end. The last agent even drafts the outreach message — but never sends it. This run profiled **Riley Brown** (@rileybrownai); the pipeline is reusable, so each creator gets its own folder like this one.

**Final deliverable:** [`outputs/youtuber-report.html`](outputs/youtuber-report.html) — open it in any browser. This is the artifact the whole pipeline exists to produce.

**This page:** how Ordinus built it — the workflow I set up, the crew that ran it, and the one design idea that made it work.

---

## The ask

I wanted to see whether Ordinus could turn a single name into a report good enough to hand to the person it's about. So I built a workflow — the **YouTuber Intelligence Pipeline** — and ran it against a real creator: **[Riley Brown](outputs/youtuber-report.html)** (@rileybrownai), the self-described "first vibe coder" and co-founder of VibeCode.

The workflow takes one input — a channel URL or creator name — and runs five agents in a strict relay. The original brief I gave the workflow:

> End-to-end pipeline that researches a YouTube creator, analyzes their channel strategy and web presence, assembles a polished intelligence report, and prepares a personalized outreach draft — ready for the user to review and send manually.

That's the whole product, and there's a deliberate marketing angle underneath it: the report is the hook. You produce a genuinely insightful, flattering-but-honest portrait of a creator, then reach out and say "we made this about you, using Ordinus." The artifact *is* the pitch.

## What came back

A single self-contained HTML file — [`youtuber-report.html`](outputs/youtuber-report.html) — that reads like a senior analyst spent a week studying Riley Brown. No data dump. A genuine portrait, structured in six movements:

1. **Creator Profile** — who he is, the niche he named, his cross-platform reach
2. **What You're Doing Right** — strengths backed by his own numbers (+22.4% subs / +35% views in 30 days, 2.9% engagement, the seven-account X strategy)
3. **Where the Gaps Are** — honest blind spots, led by the single sharpest finding: **0.35%** of his 1.5M social followers are an owned audience
4. **What Your Audience Is Telling You** — reading the 161-comments-per-video signal
5. **The Cross-Platform Picture** — a platform-by-platform table of reach vs. concentration risk
6. **Your Next Chapter** — the three highest-leverage growth moves, ordered by cost to execute

The report is opinionated and specific — it names his competitors (Matt Wolfe, Cole Medin, Liam Ottley), cites where each claim came from, and separates confirmed facts from inferences. That rigor isn't an accident; it's enforced at the agent level (see the crew below).

## How Ordinus did it

### By the numbers

| | |
| --- | --- |
| Clock time | **~23 minutes** (Jun 17, 2026, 00:08:52 → 00:32:16 UTC) |
| Work runs | **5** (5 completed, **0 failed**, 0 cancelled) |
| Human input | **1** — the creator name, plus reviewing the output |
| Agents on the crew | 5 |
| Workflow shape | linear 5-node relay |
| Final artifact | one self-contained `youtuber-report.html` |

Per-stage timing, straight from the work-run records:

| Stage | Agent | Duration |
| --- | --- | --- |
| YouTuber Research | YouTuber Research Agent | 5m 53s |
| Web Presence Analysis | Product Intelligence Analyst | 5m 04s |
| Channel Growth Analysis | Chief Marketing Strategist | 3m 08s |
| Intelligence Report | Marketing Report Builder | 8m 16s |
| Outreach Draft | Aria | 1m 03s |

The report-assembly step is the longest single stage — synthesizing three Markdown analyses into one designed HTML file is where the real work concentrates.

### The 5-agent crew

Each agent's full profile is in [`agents/`](agents/) — drop them into your own Ordinus to reuse the crew. All five run on Claude (Sonnet).

| Agent | Role in the pipeline | Profile |
| --- | --- | --- |
| **YouTuber Research Agent** | The scout. Web-researches the creator end to end, writes a cited dossier, labels inference vs. fact | [profile](agents/youtuber-research-agent.md) |
| **Product Intelligence Analyst** | Reads the dossier, produces the factual web-presence intelligence layer | [profile](agents/product-intelligence-analyst.md) |
| **Chief Marketing Strategist** | Turns intelligence into a channel-growth assessment and the top 3 moves | [profile](agents/chief-marketing-strategist.md) |
| **Marketing Report Builder** | The finisher. Synthesizes all three analyses into the polished `youtuber-report.html` | [profile](agents/marketing-report-builder.md) |
| **Aria** | Murat's standing executive assistant. Drafts the outreach message in his voice — and stops there | [profile](agents/aria.md) |

### The workflow

A strict linear chain — no fan-out, no convergence. Each node consumes the workspace artifacts the previous node wrote, and adds exactly one of its own.

```
YouTuber Research → Web Presence Analysis → Channel Growth Analysis → Intelligence Report → Outreach Draft
  (dossier.md)         (web-presence.md)        (growth.md)          (youtuber-report.html)   (draft.md, unsent)
```

The full node-by-node spec — instructions and expected outputs for all five nodes — is in [`workflows/youtuber-intelligence-pipeline/README.md`](workflows/youtuber-intelligence-pipeline/README.md).

## What I learned

**The workflow instruction is the steering wheel — not the agent.** This is the most interesting thing about this build. Three of the five agents weren't written for YouTubers at all. The **Product Intelligence Analyst**, **Chief Marketing Strategist**, and **Marketing Report Builder** were all authored for a completely different job: *marketing intelligence for solo developers shipping software products.* Their built-in briefs talk about product pages, ICPs, 30-day SEO plans, and `marketing-report.html`. None of that fits a creator.

And yet they slotted into a creator-intelligence pipeline without modification, because **each workflow node's instruction retargeted them**. The Analyst was pointed at a research dossier instead of a product page. The Strategist was asked to assess a YouTube channel's growth instead of a SaaS funnel. The Report Builder was told to produce a creator portrait with a six-part structure instead of a founder's action plan. What transferred was each agent's *discipline* — the Analyst's fact-vs-inference boundary, the Strategist's "name the white space" instinct, the Builder's no-flourish 740px house style. The subject changed; the craft didn't.

The takeaway: **a sharply-defined agent is reusable across domains, and the workflow node is where you aim it.** You don't need a bespoke agent per task — you need good agents and good instructions.

**A pure relay is the right shape when every stage needs the whole prior artifact.** There's no parallelism here, and there shouldn't be. You can't analyze web-presence gaps before the dossier exists; you can't synthesize a report before all three analyses do. Forcing fan-out would have just added coordination overhead with nothing to gain.

**Rigor lives in the agent, polish lives in the agent, and the workflow just sequences them.** The "cite every claim, separate fact from inference" behavior comes from the Research Agent's own profile. The clean, decoration-free report design comes from the Report Builder's own design standards. The workflow didn't have to specify either — it just had to put the right agents in the right order.

**Stopping before the irreversible step is a feature.** The pipeline's last act is to draft outreach — and deliberately not send it. That's Aria's hard boundary and Ordinus's "prepare, don't execute" line working together. The human stays in the loop for the one action that actually leaves the building.

## Try it yourself

1. **Clone or download Ordinus** ([install instructions](https://github.com/muratgur/ordinus#download))
2. **Recreate the 5 agents** — copy each markdown in [`agents/`](agents/) into your Agents screen. The fields map 1:1. (Three of them are general-purpose marketing-intelligence agents you can reuse for product work too.)
3. **Recreate the workflow** — use [`workflows/youtuber-intelligence-pipeline/README.md`](workflows/youtuber-intelligence-pipeline/README.md) as the spec and rebuild the five nodes as a linear chain in the Workflow Designer.
4. **Run it** — start the workflow, give it a creator name or channel URL when it asks, and let the relay run. Open the resulting `youtuber-report.html` when it lands.

## License

This use-case page and the workflow / agent definitions are MIT-licensed alongside Ordinus.
