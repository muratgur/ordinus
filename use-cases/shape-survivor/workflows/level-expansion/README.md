# Workflow — Level Expansion

**13 nodes**, **16 connections**.

> Recreate these nodes in your Workflow Designer to reproduce this workflow.

![overview](overview.png)

## Nodes (execution order)

### #1 — Collect Current Run Structure

**Agent:** Analyst
**Feeds into:** #5, #6, #2, #3, #4

**Instruction:**

> Collect the current context for expanding the Godot game's run structure.
>
> Inspect:
> - run_note.md
> - docs/creative_direction_shape_survivor.md
> - docs/game_design_shape_survivor.md
> - scripts/main.gd
> - scripts/entities/enemy.gd
> - scripts/entities/player.gd
> - scripts/ui/hud.gd
> - scripts/ui/result_screen.gd

**Expected output:**

> Do not propose a new level yet. Summarize the current wave count, enemy mix, upgrade timing, boss placement, run duration, and progression structure. Write as a text not file.

---

### #2 — Explore Level Fantasy Beats

**Agent:** Creative Director
**Depends on:** #1
**Feeds into:** #7

**Instruction:**

> Create 3 creative directions for extending the run.
>
> Each direction should describe the fantasy of the new level/wave, the visual or emotional beat, how it fits the geometry notebook identity, and what makes the new segment memorable.

**Expected output:**

> Do not define exact stats or code changes. Write as text not file.

---

### #3 — Explore Gameplay Escalation Options

**Agent:** Creative Director
**Depends on:** #1
**Feeds into:** #7

**Instruction:**

> Create 3 gameplay escalation options for extending the game beyond its current 4-part structure.
>
> Focus on enemy mix, spawn pressure, upgrade timing, player decision making, risk/reward, and how the added level changes the run arc.

**Expected output:**

> Avoid technical implementation details.

---

### #4 — Explore Gameplay Escalation Options

**Agent:** Game Designer
**Depends on:** #1

**Instruction:**

> Create 3 gameplay escalation options for extending the game beyond its current 4-part structure.
>
> Focus on enemy mix, spawn pressure, upgrade timing, player decision making, risk/reward, and how the added level changes the run arc.

**Expected output:**

> Avoid technical implementation details. Write as text not file.

---

### #5 — Inspect Wave and Level System

**Agent:** Developer
**Depends on:** #1
**Feeds into:** #7

**Instruction:**

> Inspect how the current Godot project represents waves, level progression, enemy spawning, timers, upgrade drafts, boss transition, HUD labels, and result state.

**Expected output:**

> Do not implement. Produce a technical map of what must change to add one or more new levels safely. Write as text not file.

---

### #6 — Analyze Pacing and Progression Gaps

**Agent:** Analyst
**Depends on:** #1
**Feeds into:** #7

**Instruction:**

> Analyze the current 4-part run structure.
>
> Identify where the run feels too short, too abrupt, too repetitive, too easy, too hard, or underdeveloped. Recommend 2-3 expansion opportunities.

**Expected output:**

> Focus on pacing and player value, not implementation. Write as text not file.

---

### #7 — Synthesize Level Expansion Candidates

**Agent:** Game Designer
**Depends on:** #5, #6, #2, #3
**Feeds into:** #8

**Instruction:**

> Combine the technical map, pacing analysis, creative directions, and gameplay escalation options into 6 concrete level expansion candidates.
>
> Each candidate must include:
> - new level/wave name
> - where it fits in the run
> - enemy mix
> - duration
> - spawn pressure
> - upgrade timing impact
> - player experience goal
> - technical risk
> - expected improvement
>
> Recommend one candidate.

**Expected output:**

> Write as text not file.

---

### #8 — Critic Review and Expansion Choice

**Agent:** Game Critic
**Depends on:** #7
**Feeds into:** #9

**Instruction:**

> Critically evaluate the level expansion candidates.
>
> Reject candidates that only make the game longer without making it better. Watch for pacing bloat, unclear difficulty spikes, repeated enemy pressure, weak player decisions, and scope creep.
>
> You can choose more than one candidate only if it clearly improves the run.

**Expected output:**

> Return APPROVED, REVISION_REQUIRED, or REJECTED.. Write as text not file.

---

### #9 — Improve with critics.

**Agent:** Game Designer
**Depends on:** #8
**Feeds into:** #10, #11

**Instruction:**

> If REVISION_REQUIRED, or REJECTED came from the previous steps, make the necessary revision and pass the new revision to other agents

**Expected output:**

> Revisied  Level Expansion Candidates. Return as APPROVED if necessary improvements meets the criteria. Do not write to a file, send as text

---

### #10 — Technical Implementation Brief

**Agent:** Developer
**Depends on:** #9
**Feeds into:** #12

**Instruction:**

> If the critic decision is not APPROVED, do not continue. Produce a blocked handoff.
>
> If APPROVED, create a small implementation brief.
>
> Specify:
> - files to change
> - wave data changes
> - HUD/result implications
> - enemy spawn changes
> - upgrade draft implications
> - smoke test plan

**Expected output:**

> Write as text not file.

---

### #11 — Final Level Design Spec

**Agent:** Game Designer
**Depends on:** #9
**Feeds into:** #12

**Instruction:**

> If the critic decision is not APPROVED, do not continue. Produce revision notes.
>
> If APPROVED, finalize the selected level expansion into an implementation-ready design spec.

**Expected output:**

> Keep it small enough for one implementation pass. Write as text not file.

---

### #12 — Implement Level Expansion

**Agent:** Developer
**Depends on:** #10, #11
**Feeds into:** #13

**Instruction:**

> Implement the approved level expansion.
>
> Keep the change scoped. Preserve existing run behavior unless the spec explicitly changes it.

**Expected output:**

> Update only necessary Godot files and docs. Validate that the run can progress through the new structure.

---

### #13 — Final Summary

**Agent:** CEO
**Depends on:** #12

**Instruction:**

> Summarize the workflow outcome for the user.
>
> Explain:
> - what level/wave was added
> - why it improves the game
> - what files changed
> - whether the run is ready
> - what the next workflow should improve

**Expected output:**

> Create a report with text not file.

---

