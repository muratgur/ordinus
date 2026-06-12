# ADR-040: Agent skills system — native discovery, shared library, guided creation

## Status
Accepted

## Date
2026-06-12

## Context

Agent skills today are folders under `<userData>/agents/<agent-id>/skills/<skill-id>/SKILL.md`
(filesystem-owned per ADR-001), managed through a bare CRUD editor in the agent's
Skills tab. At runtime, `buildAgentPrivateFolderInstructions` (runtime/prompts/workspace.ts)
injects a system-prompt instruction telling the CLI to scan the skills folder and
read every SKILL.md frontmatter **on every turn**.

Problems observed by the owner:

1. **Token and time waste** — the forced per-turn scan reads N frontmatter files
   whether or not any skill is relevant. The agent never decides for itself.
2. **No visibility** — whether a skill was actually used is invisible outside raw
   logs, so there is no way to tell if skills work at all.
3. **No guidance** — users cannot write effective skills from a blank three-field
   form; even Claude/Codex ship dedicated skill-creation commands.
4. **No way to validate** a new skill's usefulness.
5. **No defaults, no import** — every agent starts empty; skills cannot be shared
   across agents or brought in from outside.

Meanwhile all three provider CLIs now have **native progressive-disclosure skill
discovery** (frontmatter loaded at startup, body read only when the model judges
it relevant) — exactly the behavior we were imitating badly via prompt text:

- **Claude Code**: scans `.claude/skills/` inside the starting dir, `~/.claude/skills`,
  and — documented exception — **inside every `--add-dir` directory**.
- **Codex**: scans `$CWD/.agents/skills` (+ parents to repo root), `$HOME/.agents/skills`,
  `/etc/codex/skills`. Symlinked skill *folders* are followed. `--add-dir` is **not** scanned.
- **Gemini CLI**: workspace `.gemini/skills` (alias `.agents/skills`) and user
  `~/.gemini/skills` under `GEMINI_CLI_HOME`.

Hard constraints set during design review:

- **Never write into the working folder.** Workboard runs multiple agents against
  the same project folder; anything placed there mixes agents' skills and pollutes
  user workspaces.
- **Do not split or relocate provider homes per agent.** `CODEX_HOME` stays the
  single shared `runtime/codex`. (Gemini's existing *turn-private* home from the
  connector materializer is the accepted exception — it already exists and works.)

### Empirical results (Codex 0.138.0, tested 2026-06-12)

- `-c 'skills.config=[{path=<external>, enabled=true}]'` does **not** register a
  skill outside the discovery roots (tested with both `SKILL.md` path and folder path).
- The flag itself **is** parsed: disabling a discovered skill by full path with
  `enabled=false` works. So `skills.config` is enable/disable only.
- A symlinked skill folder inside `$CWD/.agents/skills/` **is** discovered — but
  the working-folder constraint above rules this out.

## Decision

### 1. Native discovery per provider; delete the scan instruction

Canonical store is unchanged: `<agentHome>/skills/<skill-id>/SKILL.md`, UI and
IPC contract untouched.

- **Claude** — create a one-time symlink `<agentHome>/.claude/skills → ../skills`.
  The existing `--add-dir <agentHomePath>` already makes Claude discover it
  natively. No CLI/env changes.
- **Gemini** — extend `materializeGeminiConnectors`' turn-private home with one
  symlink: `<turnHome>/.gemini/skills → <agentHome>/skills`. The private home is
  now built whenever the agent has connectors **or** skills (today: connectors only).
- **Codex** — no native path exists under our constraints (see empirical results),
  so Codex gets **softened prompt injection**: the main process already reads the
  skill list, so the turn prompt embeds the frontmatter inventory —
  name, description, and absolute SKILL.md path per skill — with the instruction
  to read a body only when it matches the task. Zero scan tool-calls; the agent
  home stays readable via `--add-dir`. Revisit if Codex adds external skill roots.

The per-turn "check the skills folder, read each frontmatter" lines are removed
from `buildAgentPrivateFolderInstructions` for **all** providers; the
"private folder is not a workspace artifact" rule remains.

#### Stale-session fix: announced-skills delta (Codex)

Because Codex receives skills only in the first-turn prompt, an open session
never learns about skills added, updated, or removed afterwards (observed in
practice: a skill added mid-conversation was invisible for that conversation's
entire life). Fix:

- Session rows (`conversation_participants.announced_skills`,
  `work_request_agent_sessions.announced_skills`, migration 0043 / schema v38)
  store the JSON map `skillId → SKILL.md mtime` that the session has been told
  about. **The field lives and dies with `providerSessionRef`** — written in
  the same update, reset whenever the ref resets (provider switch, ADR-013
  fresh start) — so announced state can never leak across sessions or
  providers.
- On a Codex **resume**, the adapter diffs the current fingerprints against
  the stored map and appends only the delta (new / updated — "re-read it" /
  removed) to the resume prompt. No change → not a single extra token
  (deliberately NOT the full inventory each turn; rejected for token cost).
- The turn result carries the now-announced set; it is persisted only on a
  successful turn, so a failed delivery re-announces next time.
- Claude needs none of this (live-watches `--add-dir` skill dirs). Gemini
  **verified by CLI spike** (gemini 0.45.2, 2026-06-12): a skill added after
  session start IS discovered on `--resume` (YES), with a negative control
  (nonexistent skill → NO) — each turn is a new process and skills are
  rescanned at process start, so Gemini needs no delta either.
- **Workboard is wired the same way**: `prepareWorkRunProviderSession` returns
  the announced map alongside the ref (clearing it in the same update whenever
  the ref resets), the run input carries it into the shared adapter path, and
  `completeWorkRun` / `waitForWorkRunInput` persist the result's announced set
  next to the ref. Completion paths that record a ref without an announced set
  (e.g. non-adapter callers) reset the map to null — the safe direction: the
  next resume over-announces once rather than ever staying stale.

Codex `allow_implicit_invocation` (frontmatter flag, default `true`) is left at
its default; a per-skill "auto / explicit-only" toggle is noted as a possible
future UI affordance, out of scope here.

### 2. Skill-usage observability

Skill activation is captured from provider event streams as a new
`kind: 'skill'` observation (Claude: native Skill tool use or any SKILL.md
read; Codex: any command/tool touching a SKILL.md) and surfaced on two
existing surfaces — no new screens, no new tables (the badge list is derived
from the run's stored events):

- **Live turn activity line** (ADR-034): transient "Applying skill X…" status.
  A skill phrase holds until a *labelled* activity replaces it — sub-second
  command echoes must not flip the line back before it was visible.
- **Run Inspector** (ADR-036): persistent "skills used" badge list on the run.

Gotcha learned in production: detection must match the **untruncated** command
text. Display labels are cut at 180 chars and compound commands routinely push
the SKILL.md path past the cut (first observed miss: skill used, no badge).

Known gap: Gemini emits no stream events in our integration
(`--output-format json`, ADR-034 degradation), so Gemini skill usage is not
observable until that integration gains streaming.

### 3. Conversational skill creation, owned by the agent

Skill creation is **two-step, mirroring the agent creation flow** (revised from
a single long form after owner review): step one is a single describe box —
the user states the recurring need in free text and the **agent that will own
the skill** drafts the SKILL.md via a one-shot generation on its own
provider/model (its role and standing instructions ride in the prompt; the
prompt forces a "Use when…" trigger-style description, since the description
drives discovery). Step two is the review form (also reachable directly via
"Write it yourself"). The draft includes a `sampleRequest`; after saving, an
**A-lite trial** dialog offers to seed that request into the agent's 1:1 chat
composer — the user sends it and the observability signal from (2) shows
whether the skill activated. No separate test harness or eval system.

### 4. Shared skill library (reference model) + default set

A shared library lives outside any agent (app-shipped set + user imports).
Assigning a library skill to an agent is a **record, not a copy**; materialization
(symlinks / Codex prompt list) presents own skills + assigned library skills
together. App updates refresh bundled skills in one place. Editing a library
skill from an agent requires "copy & customize" (the copy becomes that agent's
own skill).

Default set, assigned (removable) to new agents — chosen by the rule
*"only where CLIs produce slop, never what CLIs already do well"*, each skill
bundling concrete template assets and prohibition lists rather than vague
quality instructions:

1. `ordinus-html` — branded HTML deliverables (template.html + report.css,
   typography/spacing rules, anti-slop prohibitions).
2. `ordinus-sunum` — slide/one-pager deliverables (one idea per slide,
   sentence titles, shared asset language with ordinus-html).
3. `ordinus-tablo` — formatted xlsx output conventions (header style, number/date
   formats, summary rows — not bare CSV).
4. `ordinus-grafik` — data-visualization rules (no chartjunk, palette, label
   legibility) for HTML/SVG charts.

Bundled skills cannot be deleted from the library (only unassigned or
copy-customized). Rejected for the default set: generic capabilities (PDF
reading etc. — CLIs are already excellent) and an output-conventions skill
(already covered by our prompt layer).

### 5. Import (v1)

- **Folder import** into the library: validate frontmatter, resolve name
  collisions, then prompt for agent assignment. (Zip import deferred — Node has
  no built-in zip extraction and a dependency was not worth it for v1; users
  can extract and pick the folder.)
- **Local machine scan**: the import dialog also lists skills found in
  `~/.claude/skills`, `~/.codex/skills`, `~/.gemini/skills`, and `~/.agents/skills`
  for one-click import.
- **Security = show-and-confirm**: the full skill body is displayed before
  import with an explicit trust confirmation; bundled executable files are
  called out in the listing. No automated scanning in v1.
- URL/git import and export/sharing are deferred to v2.

### 6. UI placement

- **Agent → Skills tab** (existing): one list of everything assigned; library
  entries carry a "Library" badge; *remove* there means *unassign*. Two entry
  points: "+ New skill" (conversational, §3) and "+ Add from library".
- **Settings → Skill Library** (ADR-033 section nav): library list with origin
  badges, read-only body view, and the import wizard. Library-level
  edit/delete for *imported* skills (with an assignment-count warning on
  delete) is a known follow-up — not yet implemented; builtin skills are
  non-deletable by design either way.

## Alternatives considered

### Per-agent or per-turn CODEX_HOME (Gemini-style ephemeral home for Codex)
- Pros: native discovery via the home skills root; proven pattern in the Gemini
  connector materializer.
- Rejected by owner: unjustified complexity; CODEX_HOME stays shared.

### Symlinks into the working folder (`$CWD/.agents/skills`)
- Pros: empirically works, single mechanism for Codex and Gemini.
- Rejected: Workboard runs multiple agents on one folder — cross-agent skill
  mixing — and it writes app-owned files into user workspaces.

### Registering external paths via `-c skills.config`
- Would have been the cleanest Codex fit (we already talk to Codex via `-c`).
- Rejected: empirically does not register skills (enable/disable only).

### Copy-per-agent default skills
- Pros: trivial to implement.
- Rejected: unmaintainable on app updates (stale copies across N agents,
  user-edit conflicts). The reference model also underpins import/sharing.

## Consequences

- Per-turn skill overhead drops to zero tool-calls on Claude/Gemini (native
  lazy loading) and to a frontmatter list in the prompt on Codex.
- Prompt instructions and native discovery can no longer contradict each other.
- The Gemini turn-private home is now built more often (skills without
  connectors); its cleanup path is unchanged.
- Both provider-behavior assumptions were verified by CLI spikes before
  implementation (2026-06-12, with negative controls): Claude discovers the
  `.claude/skills` symlink inside an added dir, and Gemini discovers the
  user-tier symlink under the turn-private home.
- Skill usage becomes measurable, which is the prerequisite for growing the
  default library beyond the initial four.
- Known follow-ups: zip import (needs a dependency), library-level edit/delete
  for imported skills with assignment-count warning, Gemini skill-usage
  observability (blocked on streaming), per-skill auto/explicit invocation
  toggle, builtin-sync pruning (a builtin removed in an app update currently
  lingers in the library), main-mediated allowlist for import source paths
  (today the renderer round-trips the dialog-picked path).
- ADR-001's "skills are filesystem-owned under the agent folder" still holds —
  and was extended rather than broken: the library adds a second filesystem
  root (`<userData>/skills-library/{builtin,imported}/`), and **the assignment
  record is the symlink itself** in the agent's skills root. No DB table:
  removal of the symlink unassigns, `rmSync` never follows symlinks so the
  library copy is safe, and all three providers' discovery paths see the merged
  view without any extra materialization logic. Verified: `readdirSync`
  `withFileTypes` reports symlinks as non-directories, so listing filters
  accept symlink entries explicitly.
