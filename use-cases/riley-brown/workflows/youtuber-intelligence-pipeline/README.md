# Workflow — YouTuber Intelligence Pipeline

**5 nodes**, **4 connections.** A single linear chain — each node consumes the workspace artifacts written by the one before it.

> Recreate these nodes in your Workflow Designer to reproduce this workflow.

```
research → intel → strategy → report → outreach
```

| # | Node | Agent | Depends on | Writes |
| --- | --- | --- | --- | --- |
| 1 | YouTuber Research | YouTuber Research Agent | — | research dossier (`.md`) |
| 2 | Web Presence Analysis | Product Intelligence Analyst | #1 | web-presence analysis (`.md`) |
| 3 | Channel Growth Analysis | Chief Marketing Strategist | #2 | channel-growth analysis (`.md`) |
| 4 | Intelligence Report | Marketing Report Builder | #3 | `youtuber-report.html` |
| 5 | Outreach Draft | Aria | #4 | outreach draft (`.md`) — **not sent** |

The chain is deliberately strict: every step reads what is already on disk and adds one more artifact. By the time the Report Builder runs, three Markdown documents exist in the workspace; by the time Aria runs, the finished HTML report exists too.

---

### #1 — YouTuber Research

**Agent:** YouTuber Research Agent
**Feeds into:** #2

**Instruction:**

> Start by asking the user for the YouTube channel they want to investigate — either a channel URL or creator name. Once provided, research everything publicly available about this creator: channel stats, video cadence, top-performing content, content patterns, audience signals from comments, cross-platform presence (Instagram, TikTok, X, LinkedIn, Twitch, newsletters, Discord, Patreon, personal website), brand and monetization signals (sponsors, merch, courses, memberships), competitive landscape (3–5 peer creators), and their overall internet footprint (press, podcasts, interviews, search presence). Save a structured Markdown research dossier to the workspace. Label every claim with its source URL. Clearly mark inferences vs confirmed facts.

**Expected output:**

> A structured Markdown research dossier covering channel stats, content patterns, audience signals, cross-platform presence, monetization, competitive landscape, and internet footprint. Saved to the workspace.

---

### #2 — Web Presence Analysis

**Agent:** Product Intelligence Analyst
**Depends on:** #1
**Feeds into:** #3

**Instruction:**

> Read the YouTuber research dossier produced in the previous step. Using it as your primary input, produce a structured intelligence analysis focused on: (1) how strong and consistent this creator's brand is across the web, (2) gaps in their online presence compared to peers in their niche, (3) what opportunities exist that they are clearly missing, and (4) what a first-time visitor finding them through search would experience. This is not a marketing strategy — it is a factual intelligence layer. Save your output as a Markdown document to the workspace.

**Expected output:**

> A structured Markdown intelligence document covering brand consistency, web presence gaps, opportunity signals, and search/discovery experience. Saved to the workspace.

---

### #3 — Channel Growth Analysis

**Agent:** Chief Marketing Strategist
**Depends on:** #2
**Feeds into:** #4

**Instruction:**

> Read the YouTuber research dossier and web presence analysis documents from the workspace. Produce a channel growth strategy analysis for this creator — not as advice to give them directly, but as intelligence for our report: (1) where is their audience growth stalling and why, (2) what channel or content strategy shifts could unlock the next growth phase, (3) what is their current positioning and how could it be sharpened, (4) what are the 3 most actionable growth moves available to them right now. Frame this as an analyst's assessment. Save your output as a Markdown document to the workspace.

**Expected output:**

> A Markdown channel growth analysis covering growth blockers, strategic opportunities, positioning assessment, and top 3 actionable growth moves. Saved to the workspace.

---

### #4 — Intelligence Report

**Agent:** Marketing Report Builder
**Depends on:** #3
**Feeds into:** #5

**Instruction:**

> Read all workspace Markdown documents produced by the previous agents: the YouTuber research dossier, web presence analysis, and channel growth analysis. Synthesize them into a single polished HTML report designed to impress the YouTuber when they read it about themselves. The report should feel like a senior analyst spent serious time studying them — not a data dump, but a genuine, insightful portrait of who they are online, what they're doing well, where they have blind spots, and what their next growth chapter could look like. Follow all design standards: clean minimal layout, white background, dark text, system font, max 740px width, no decorative AI flourishes. Report structure: (1) Creator Profile — who they are, their niche, their reach, (2) What You're Doing Right — genuine strengths backed by data, (3) Where the Gaps Are — honest blind spots and missed opportunities, (4) Your Audience Is Telling You Something — key signals from comments and community, (5) Cross-Platform Picture — where you're strong and where you're invisible, (6) Your Next Chapter — the 3 growth moves that would make the biggest difference. Save as youtuber-report.html to the workspace.

**Expected output:**

> A single polished self-contained HTML file (youtuber-report.html) that reads as a personalized intelligence report about the creator. Clean design, synthesized insights, no data dumps.

---

### #5 — Outreach Draft

**Agent:** Aria
**Depends on:** #4

**Instruction:**

> Read the YouTuber research dossier and the finished HTML report from the workspace to understand who this creator is. Draft a short, personalized outreach message the user (Murat) can send to this YouTuber — via email or LinkedIn DM depending on what contact info is available. The message should: (1) be under 120 words, (2) reference something specific about the creator that shows this is not a generic pitch, (3) mention that a detailed intelligence report was created about them using Ordinus and its agents, (4) invite them to read it and have a conversation. Tone: direct, respectful, a little intriguing — not salesy. Do NOT send anything. Save the draft as outreach-draft.md to the workspace and present it to the user for review.

**Expected output:**

> A short personalized outreach message draft saved as outreach-draft.md. Under 120 words, specific to this creator, mentioning Ordinus. Ready for the user to review and send manually.

---

## Design notes

- **The instruction is the steering wheel.** Three of the five agents (Product Intelligence Analyst, Chief Marketing Strategist, Marketing Report Builder) were written for a *solo-developer product marketing* pipeline. Their built-in briefs talk about product pages, ICPs, and 30-day SEO plans. None of that matched a YouTube creator — but each workflow node's instruction retargeted the agent onto the creator's dossier and asked for a creator-shaped output. The agents' *thinking discipline* transferred; only the subject changed.
- **Pure handoff chain, no fan-out.** Unlike a parallel-then-converge workflow, this one is a straight relay. It works because each stage genuinely needs the full prior artifact: you cannot analyze web-presence gaps without the dossier, and you cannot synthesize a report without all three analyses.
- **The chain stops one step short of acting.** The last node drafts outreach but explicitly does not send. The terminal human action — actually contacting the creator — stays with Murat.
