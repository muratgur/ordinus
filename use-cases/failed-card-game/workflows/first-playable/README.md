# First Playable Workflow (Godot Combat Micro-Slice)

_Reconstructed from the saved Ordinus Workflow Design (canvas) for the Intern Inferno run._

**16 nodes · 24 dependency edges**

## Nodes

### Source Sync and Prototype Charter
- **Agent:** Game Director
- **Depends on:** — (root node)
- **Instruction:** Read starting-point-concept-package-report.html and produce a one-page Combat Micro-Slice charter. Preserve locked decisions exactly: intern protagonist, Workplace Challenges, checklist Objectives, Burnout as option narrowing, two encounters only, ten starter/basic cards, Rework and Self-Doubt only, debug tools and combat logs in scope, no rewards/upgrades/perks/map/boss/final art. Define player promise, tone, vocabulary guardrails, non-goals, and first-playable acceptance criteria.
- **Expected output:** Prototype charter, vocabulary rules, out-of-scope list, and first-playable acceptance criteria.

### Systems Micro-Slice Rules
- **Agent:** Systems Designer
- **Depends on:** Source Sync and Prototype Charter
- **Instruction:** Turn the locked micro-slice decisions into a precise implementation-ready systems spec. Define turn flow, Focus, draw, hand, discard, resolved zone, Block, Pressure, Stress, Burnout thresholds, Objective completion, Status Card behavior, intents, loss condition, encounter transition, deterministic behavior, and simulation test cases. Keep the starter deck exactly as specified and do not add new systems.
- **Expected output:** Rules spec, card effect table, status behavior table, objective table, intent table, balance assumptions, and simulation tests.

### Godot Architecture Plan
- **Agent:** Godot Technical Lead
- **Depends on:** Source Sync and Prototype Charter
- **Instruction:** Create the Godot 4.x implementation plan for a desktop 2D UI-first combat sandbox. Define scene structure, Resource/data definitions, stable IDs, card instances, zones, EffectResolver, TurnSequencer, encounter loading, debug controls, combat log, tests, and naming conventions. Keep simulation logic separate from UI nodes.
- **Expected output:** Godot project structure, scene/resource plan, data model, TurnSequencer design, EffectResolver design, debug tooling plan, and test strategy.

### Art Direction and Asset Kit
- **Agent:** Prototype Art Direction Lead
- **Depends on:** Source Sync and Prototype Charter
- **Instruction:** Define a feasible prototype art direction and convert it into a minimum asset kit. The mood is dry satirical workplace survival with emotional stakes. Produce palette, shape language, drawing rules, card frame direction, Workplace Challenge presentation, objective/status/resource icon language, background and ambient treatment, asset dimensions, export names, usage notes, and Godot import guidance. Avoid sterile dashboards, generic rectangles, stock-looking placeholders, and final-art overproduction.
- **Expected output:** Art direction brief, palette, style rules, card frame specs, challenge presentation rules, icon direction, minimum asset list, naming/export conventions, and placeholder drawing rules.

### Combat UI/UX Plan
- **Agent:** Prototype UI/UX Designer
- **Depends on:** Source Sync and Prototype Charter
- **Instruction:** Design the playable combat screen for desktop Godot. Prioritize card readability, Objective clarity, Intent preview, Stress/Burnout visibility, status explanation, zone counts, disabled states, feedback, tooltips, and combat log placement. Coordinate with art direction so the screen has an intentional workplace mood rather than a generic deckbuilder layout.
- **Expected output:** Combat layout spec, card component spec, objective checklist presentation, intent/pressure display, resource/status displays, tooltip rules, disabled states, combat log placement, and debug panel placement.

### Content and Copy Lock
- **Agent:** Prototype Content Designer
- **Depends on:** Source Sync and Prototype Charter
- **Instruction:** Produce and lock implementation-ready player-facing wording for the two Workplace Challenges, ten starter/basic cards, two Status Cards, intents, objectives, tooltips, debug labels, combat log lines, and small tutorial prompts. Keep satire specific, dry, and workplace-readable. Organize strings by stable IDs. Do not add cards, rewards, perks, events, or broader lore.
- **Expected output:** Implementation-ready string table, card wording, objective descriptions, challenge descriptions, intent copy, status wording, tooltip glossary, combat log templates, and debug labels.

### Critic Gate 1: Build Readiness
- **Agent:** Game Critic and Evaluation Lead
- **Depends on:** Systems Micro-Slice Rules, Godot Architecture Plan, Art Direction and Asset Kit, Combat UI/UX Plan, Content and Copy Lock
- **Instruction:** Review the first-pass systems, technical, art, UI, and content outputs for build readiness. Identify scope creep, contradictory rules, terminology drift, insufficient art direction, sterile UI risk, Slay the Spire clone risk, untestable systems, unclear Burnout behavior, and missing acceptance criteria. Give a go/no-go recommendation and critical fixes.
- **Expected output:** Go/no-go recommendation, critical fixes before implementation, risks that can wait for playtesting, and specific revisions by lane.

### Godot Scaffold and Data Model
- **Agent:** Gameplay Programmer
- **Depends on:** Critic Gate 1: Build Readiness
- **Instruction:** Create or update the Godot project scaffold for the Combat Micro-Slice. Implement base scenes, Resource/data definitions, card instance model, zones, encounter loader, and a minimal boot path into a combat sandbox. Do not implement rewards, map, boss, upgrades, perks, or meta-progression.
- **Expected output:** Launchable Godot combat sandbox scaffold with inspectable content definitions and stable IDs.

### Core Combat Simulation
- **Agent:** Gameplay Programmer
- **Depends on:** Godot Scaffold and Data Model, Systems Micro-Slice Rules
- **Instruction:** Implement the complete playable combat simulation. Include turn start, draw, Focus refresh, card play validation, effect resolution, Block, Pressure, Stress gain, Objective Progress, Status Cards, discard/resolved behavior, Burnout persistence, encounter resolution, loss condition, and deterministic debug/test hooks.
- **Expected output:** Playable rules loop with EffectResolver, TurnSequencer, zone operations, Burnout persistence, and repeatable simulation checks.

### UI and Content Integration
- **Agent:** Gameplay Programmer
- **Depends on:** Core Combat Simulation, Combat UI/UX Plan, Art Direction and Asset Kit, Content and Copy Lock
- **Instruction:** Implement the combat screen and integrate playable content using the UI/UX spec, art direction, asset kit, and locked copy. Show current Workplace Challenge, Objectives, Intent, Pressure, Focus, Stress, Burnout, Block, zones, hand, statuses, tooltips, disabled states, and combat log access. Integrate Unclear Starter Ticket, Hostile Code Review, the exact starter deck, debug-only cards, Rework, Self-Doubt, objectives, intents, and string table.
- **Expected output:** Functional combat UI with clickable cards, exact content, objective checklist, resource/status displays, tooltips, disabled states, and coherent prototype visual theme.

### Debug Tools and Combat Log
- **Agent:** Gameplay Programmer
- **Depends on:** UI and Content Integration, Godot Architecture Plan
- **Instruction:** Add debug controls and combat log support. Include controls to start each encounter, inspect zones, spawn cards/statuses, change Stress, change Burnout, end turn, reset run, and review state changes. The combat log must explain Stress gain, Burnout increase, Status Card effects, Objective Progress, and encounter resolution.
- **Expected output:** Debug panel, state inspection, spawn controls, Stress/Burnout controls, encounter selector, and combat log.

### Internal Playable Build
- **Agent:** Gameplay Programmer
- **Depends on:** Debug Tools and Combat Log
- **Instruction:** Produce the first internal playable build of the Combat Micro-Slice. Verify launch, both encounters, win/loss, Burnout carryover, card play, disabled states, statuses, logs, debug controls, and UI readability.
- **Expected output:** Internal playable Godot prototype, known issues list, build/run instructions, and verification notes.

### Critic Gate 2: Differentiation Test
- **Agent:** Game Critic and Evaluation Lead
- **Depends on:** Internal Playable Build
- **Instruction:** Evaluate whether the playable prototype reads as workplace pressure resolution rather than renamed fantasy combat. Test whether Progress feels like resolution, Burnout feels like narrowed options, Boundary/Craft actions prevent future problems, Rework/Self-Doubt are understandable, and the office theme changes decisions.
- **Expected output:** Differentiation evaluation, severity-ranked issues, recommended fix pass, and go/no-go for first playable candidate.

### Fix Pass
- **Agent:** Gameplay Programmer
- **Depends on:** Critic Gate 2: Differentiation Test
- **Instruction:** Address only the highest-value issues found in Critic Gate 2. Fix unclear feedback, broken rules, unreadable copy, confusing UI states, insufficient workplace framing, and visual theme gaps. Coordinate with Systems, UI/UX, Art Direction, and Content if their specs need small corrections. Do not add new systems or content.
- **Expected output:** Fixed playable prototype, change notes, and remaining risk list.

### First Playable Candidate
- **Agent:** Gameplay Programmer
- **Depends on:** Fix Pass
- **Instruction:** Package the prototype as the first playable candidate. Confirm that the build runs, the two encounters are playable, the starter deck is correct, the UI is legible, debug controls exist, and known issues are documented.
- **Expected output:** First playable candidate, run instructions, known issues, and what to test first.

### Documentation and Playtest Kit
- **Agent:** Documentation Publisher
- **Depends on:** First Playable Candidate
- **Instruction:** Publish a clean human-readable prototype handoff and playtest kit. Do not invent new design decisions. Include mission, controls, included content, known issues, playtest questions, feedback prompts, and next-step decision tree.
- **Expected output:** HTML or Markdown playable handoff, playtest checklist, feedback questions, and decision log update template.
