# Full Game Development Workflow

_Reconstructed from the saved Ordinus Workflow Design (canvas) for the Intern Inferno run._

**16 nodes · 19 dependency edges**

## Nodes

### Full Game Blueprint
- **Agent:** Game Director
- **Depends on:** — (root node)
- **Instruction:** Create the full-game vision brief for Intern Inferno based on the validated prototype. Define the full player promise, run framing, acts/departments, win/loss framing, version 1 scope, what remains out of scope, and how the validated workplace-pressure metaphor scales into a complete game.
- **Expected output:** Full-game vision brief with locked version 1 scope, run structure, acts/departments, win/loss framing, and non-goals.

### Full Systems Expansion
- **Agent:** Systems Designer
- **Depends on:** — (root node)
- **Instruction:** Expand the validated micro-slice systems into a full-game ruleset. Define rewards, upgrades, perk/passive equivalents, events, recovery nodes, elite-style challenges, boss-style challenges, scaling, build archetypes, status expansion, balance assumptions, and content limits. Preserve Objectives, Burnout, workplace pressure, and locked vocabulary.
- **Expected output:** Full systems brief covering progression, rewards, upgrades, perks/passives, events, recovery, encounter scaling, build archetypes, and balance targets.

### Production Architecture
- **Agent:** Godot Technical Lead
- **Depends on:** — (root node)
- **Instruction:** Convert the validated Godot prototype into a production architecture plan. Define run-state model, save/load, content data pipeline, map/progression framework, reward/event/perk/status frameworks, build/export process, debug tools, test strategy, and what prototype code should be preserved or replaced.
- **Expected output:** Production architecture brief and implementation roadmap for a complete Godot game.

### Full Art Identity
- **Agent:** Prototype Art Direction Lead
- **Depends on:** — (root node)
- **Instruction:** Upgrade the prototype art direction into a full-game visual identity. Define final palette, card frame system, icons, Workplace Challenge illustration style, department backgrounds, event art treatment, UI chrome, asset pipeline, production asset inventory, and priority order. Preserve the dry satirical workplace-survival mood.
- **Expected output:** Full art style guide, asset inventory, production pipeline, and priority list.

### Full UX Flow
- **Agent:** Prototype UI/UX Designer
- **Depends on:** — (root node)
- **Instruction:** Design the full UX flow: main menu, new run, combat, map/run progression, rewards, upgrades, events, recovery, deck view, perks/passives, settings, tutorial/onboarding, win/loss screens, and build/test affordances. Keep card readability and Objective clarity central.
- **Expected output:** Full UX flow spec with screen list, state transitions, interaction rules, and readability requirements.

### Content Bible
- **Agent:** Prototype Content Designer
- **Depends on:** — (root node)
- **Instruction:** Create the full content bible. Define card pool plan, encounter families, department themes, boss-style challenges, events, recovery options, status cards, perks/passives, tutorial content, copy style guide, naming rules, and implementation-ready content batches. Keep satire specific and workplace-readable.
- **Expected output:** Full content bible with scoped card, encounter, event, perk/passive, status, and tutorial plans.

### Gate 1: Production Scope Lock
- **Agent:** Game Critic and Evaluation Lead
- **Depends on:** Full Game Blueprint, Full Systems Expansion, Production Architecture, Full Art Identity, Full UX Flow, Content Bible
- **Instruction:** Review the full-game blueprint, systems expansion, production architecture, art identity, UX flow, and content bible. Identify scope creep, contradictions, derivative deckbuilder risk, weak workplace metaphor, production risk, missing specialists, and unclear acceptance criteria. Recommend go/no-go for production architecture and vertical slice.
- **Expected output:** Production scope review with go/no-go, required fixes, and approved version 1 boundaries.

### Core Full Loop Foundation
- **Agent:** Gameplay Programmer
- **Depends on:** Gate 1: Production Scope Lock
- **Instruction:** Implement the production foundation in Godot: run start, map/progression framework, combat entry/exit, reward flow, upgrade hooks, perk/passive hooks, event framework, recovery framework, deck view, settings basics, debug tools, and content-loading pipeline. Keep it data-driven and testable.
- **Expected output:** Godot full-loop foundation where a player can start a run, enter combat, receive rewards/events/recovery, and continue through the run structure.

### Vertical Slice Content, Art, and UI
- **Agent:** Gameplay Programmer
- **Depends on:** Core Full Loop Foundation, Full Art Identity, Full UX Flow, Content Bible, Full Systems Expansion
- **Instruction:** Build one complete production vertical slice using approved content, art, and UX specs. Include one department or work-cycle segment, several regular Workplace Challenges, one elite-style challenge, one boss-style challenge, rewards, upgrades, events, recovery, representative art, and full UI flow for the slice.
- **Expected output:** Playable production vertical slice showing the real full-game loop, not a sandbox.

### Gate 2: Vertical Slice Review
- **Agent:** Game Critic and Evaluation Lead
- **Depends on:** Vertical Slice Content, Art, and UI
- **Instruction:** Evaluate the vertical slice. Check whether it still feels distinct from renamed fantasy combat, whether Objectives and Burnout scale, whether rewards and upgrades support workplace survival, whether art/UI can support long sessions, and whether content production targets remain realistic.
- **Expected output:** Vertical slice evaluation with alpha go/no-go, scope reductions, and required fixes.

### Alpha Full-Run Production
- **Agent:** Gameplay Programmer
- **Depends on:** Gate 2: Vertical Slice Review
- **Instruction:** Build the rough full game from start to finish. Add all approved acts/departments, regular challenges, elite-style challenges, boss-style challenges, cards, upgrades, perks/passives, statuses, events, recovery options, map flow, UI screens, representative art coverage, and debug/test support. Keep major systems complete before polish.
- **Expected output:** Alpha full-run build playable from start to finish with all major systems and content represented.

### Gate 3: Full-Run Alpha Review
- **Agent:** Game Critic and Evaluation Lead
- **Depends on:** Alpha Full-Run Production
- **Instruction:** Review the full-run alpha. Check full-run completion, readability, build variety, dominant strategies, Burnout fairness, satire consistency, art readability, blocker bugs, and what must be fixed before beta. Freeze scope except for cuts and critical fixes.
- **Expected output:** Alpha review with beta fix list, severity ranking, and scope-freeze recommendation.

### Beta Polish and Balance
- **Agent:** Gameplay Programmer
- **Depends on:** Gate 3: Full-Run Alpha Review
- **Instruction:** Execute beta polish and balance. Fix bugs, tune cards/encounters/rewards/events/perks, improve UI clarity, harden save/load, improve performance, clean wording, replace remaining unacceptable placeholders, refine tutorial/onboarding, and prepare exportable desktop builds.
- **Expected output:** Stable beta build with full run, improved balance, clear UI, reduced placeholder debt, and export-ready project state.

### Gate 4: Release Candidate Review
- **Agent:** Game Critic and Evaluation Lead
- **Depends on:** Beta Polish and Balance
- **Instruction:** Review whether the beta build is ready to become the full playable game build. Check blockers, player promise, first-run comprehension, art/UI/writing consistency, build stability, known issues, and release notes. Approve release candidate or produce a short final blocker list.
- **Expected output:** Release candidate review with approval or final blocker list.

### Final Playable Game Build
- **Agent:** Gameplay Programmer
- **Depends on:** Gate 4: Release Candidate Review
- **Instruction:** Produce the final full playable Godot desktop build. Verify launch, full run, win/loss, combat, rewards, map, events, recovery, upgrades, perks/passives, statuses, deck management, settings, save/load behavior, build export, and known issues. This deliverable should be a complete playable game, not a prototype.
- **Expected output:** Exportable full playable Godot game build, source project, run instructions, verification notes, and known issues.

### Final Handoff Documentation
- **Agent:** Documentation Publisher
- **Depends on:** Final Playable Game Build
- **Instruction:** Publish final handoff documentation for the full playable game. Include what is included, how to run/build/export, controls, known issues, content summary, playtest notes, version decisions, and recommended next production path after the full playable build.
- **Expected output:** Clean final handoff document and playtest/release notes for the full playable game.
