# Workflow — New Character

**12 nodes**, **15 connections**.

> Recreate these nodes in your Workflow Designer to reproduce this workflow.

![overview](overview.png)

## Nodes (execution order)

### #1 — Collect Character System Context

**Agent:** Analyst
**Feeds into:** #5, #3, #4, #2

**Instruction:**

> Collect the current context for adding one new playable character to the Godot game.
>
> Inspect:
> - run_note.md
> - docs/creative_direction_shape_survivor.md
> - docs/game_design_shape_survivor.md
> - scripts/main.gd
> - scripts/entities/player.gd
> - any character select UI script or scene
> - scenes/main.tscn
>
> Do not propose a new character yet. Summarize the current selectable characters, their gameplay differences, visual identities, character select flow, and constraints.

**Expected output:**

> Write as text not file

---

### #2 — Explore Gameplay Archetypes

**Agent:** Game Designer
**Depends on:** #1
**Feeds into:** #6

**Instruction:**

> Create 3 gameplay archetypes for a new selectable character.
>
> Focus on:
> - player fantasy
> - stat tradeoffs
> - starting strengths and weaknesses
> - movement/combat feel
> - upgrade synergy
> - what new decision this character adds

**Expected output:**

> Avoid code-level implementation details.Write as text not file.

---

### #3 — Analyze Roster Gap

**Agent:** Analyst
**Depends on:** #1
**Feeds into:** #6

**Instruction:**

> Analyze the current playable character roster.
>
> Identify what kind of player choice is missing. Focus on decision variety, build diversity, risk/reward, movement feel, survivability, weapon synergy, readability, and redundancy.

**Expected output:**

> Recommend 2-3 character opportunity areas, not finished character designs.Write as text not file.

---

### #4 — Explore Character Fantasy Directions

**Agent:** Creative Director
**Depends on:** #1
**Feeds into:** #6

**Instruction:**

> Create 3 creative directions for a new selectable character that fits the primitive shape-comedy identity.
>
> Focus on silhouette, personality, humor, visual readability, menu identity, and how the character should feel before any stats are considered.

**Expected output:**

> Do not define exact implementation details. Write as text not file

---

### #5 — Inspect Player and Character Select System

**Agent:** Developer
**Depends on:** #1
**Feeds into:** #6

**Instruction:**

> Inspect how the current Godot project implements player types and character selection.
>
> Focus on:
> - where character data lives
> - how selected character is passed into the run
> - how player stats and visuals are applied
> - how the character select UI lists choices
> - what files must change to add one new player type safely

**Expected output:**

> Do not implement. Produce a technical implementation map. Write as text not file.

---

### #6 — Synthesize Character Candidates

**Agent:** Game Designer
**Depends on:** #5, #3, #4, #2
**Feeds into:** #7

**Instruction:**

> Combine the technical map, roster gap analysis, creative directions, and gameplay archetypes into 3 concrete playable character candidates.
>
> Each candidate must include:
> - character name
> - character id
> - visual identity
> - gameplay role
> - stat changes
> - starting tradeoff
> - player decision added
> - technical fit
> - risk level

**Expected output:**

> Recommend one candidate. Write as text not file.

---

### #7 — Critic Review and Character Choice

**Agent:** Game Critic
**Depends on:** #6
**Feeds into:** #8

**Instruction:**

> Critically evaluate the character candidates.
>
> Reject candidates that are redundant with existing characters, too hard to read, too hard to balance, too complex for the current prototype, or likely to create an obvious best/worst choice.
>
> Select one character only if it clearly improves roster variety.

**Expected output:**

> Return APPROVED, REVISION_REQUIRED, or REJECTED.

---

### #8 — Improve Character Candidate Revision

**Agent:** Game Designer
**Depends on:** #7
**Feeds into:** #10, #9

**Instruction:**

> If REVISION_REQUIRED, or REJECTED came from the previous steps, make the necessary revision and pass the new revision to other agents

**Expected output:**

> Revisied  Character Candidates. Return as APPROVED if necessary improvements meets the criteria. Do not write to a file, send as text

---

### #9 — Final Character Design Spec

**Agent:** Game Designer
**Depends on:** #8
**Feeds into:** #11

**Instruction:**

> If the critic decision is not APPROVED, do not continue. Produce revision notes.
>
> If APPROVED, finalize the selected character into an implementation-ready design spec.

**Expected output:**

> Keep the scope to one new selectable character. Do not add progression, unlocks, new weapons, enemies, levels, or save data. Write text not file

---

### #10 — Technical Implementation Brief

**Agent:** Developer
**Depends on:** #8
**Feeds into:** #11

**Instruction:**

> If the critic decision is not APPROVED, do not continue. Produce a blocked handoff.
>
> If APPROVED, create a small implementation brief for adding the selected character.
>
> Specify:
> - files to change
> - character data changes
> - character select UI changes
> - player stat/visual changes
> - run/restart implications
> - smoke test plan

**Expected output:**

> Write text not file.

---

### #11 — Implement New Player Type

**Agent:** Developer
**Depends on:** #10, #9
**Feeds into:** #12

**Instruction:**

> Implement exactly one new selectable player type.
>
> Keep the change small and aligned with the existing character selection system. Preserve existing characters and run behavior unless the spec explicitly requires a small adjustment.

**Expected output:**

> Update docs if needed. Validate that character selection and combat still work.

---

### #12 — Final Summary

**Agent:** CEO
**Depends on:** #11

**Instruction:**

> Summarize the workflow outcome for the user.
>
> Explain:
> - what character was added
> - why it improves the roster
> - what files changed
> - whether it is ready
> - what the next character workflow should consider

**Expected output:**

> Write as text not file.

---

