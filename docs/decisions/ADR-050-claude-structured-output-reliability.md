# ADR-050: Claude Structured-Output Reliability Under Deferred Tools

## Status

Accepted

Builds on ADR-037 (token efficiency / Claude relaxed StructuredOutput schema) and ADR-049
(surface-aware turn outcome). Does not supersede either. Scope is the **Claude adapter only** —
Codex/Gemini constrain the text channel with `--output-schema` and do not exhibit this failure.

## Date

2026-06-15

## Context

A live Ordinus assistant turn failed with `CLI output did not contain a valid JSON object` after the
assistant used an MCP tool (`propose_agent`) and opened the agent-creation flow. The work itself
succeeded; only the outcome parse failed, marking the whole turn red.

### What the logs and experiments proved

Ordinus runs Claude as the Claude Code CLI (`claude -p --json-schema ...`). The schema is enforced
through a forced **StructuredOutput tool** call, not a text-channel grammar. Reading the real event
stream plus a series of controlled CLI experiments (representative stub MCP server, the user's own
config dir so the account feature flags matched) established the following with evidence:

1. **The failure is a *skip*, not a malformed fill.** On the failing turn Claude produced a long
   natural-language reply and **never called StructuredOutput**; the CLI returned `is_error:false`
   with the text as `result` and no `structured_output`. Our parser then threw. This is mechanically
   distinct from the ADR-037 failure (Claude *calling* StructuredOutput with an empty `{}`).

2. **Deferred tools / ToolSearch are involved but not the sole cause.** The CLI auto-enables a
   "deferred tool" mode (the `ToolSearch` tool, gated by `AutoToolSearchCharThreshold`) once the
   combined tool-schema character count crosses a threshold. Ordinus's Claude subprocess sees a
   bloated catalog (~53 tools): its own ~16 MCP tools **plus** the host account's built-ins
   (`Task`, `Workflow`, `Cron*`, `DesignSync`, `Monitor`, `RemoteTrigger`, `ScheduleWakeup`, …) and
   account-level claude.ai connectors (`mcp__claude_ai_Google_*`), inherited via the shared OAuth
   login (the isolated `CLAUDE_CONFIG_DIR` namespaces config but not the account). The bloat trips
   deferral; using an MCP tool then requires a `ToolSearch` round-trip first.

3. **The skip is intermittent and correlates with long answers on resume turns, NOT with the
   schema.** Controlled trials (opus, deferral on, forced MCP tool use):
   - Simple tool turn, **relaxed** schema (ADR-037): StructuredOutput called **3/3**.
   - Simple tool turn, **strict** schema (pre-ADR-037): **3/3**. → schema strictness made no
     difference; the ADR-037 relaxation neither caused nor masks this skip.
   - **Resume** turn + long, rich text answer, relaxed schema: **2/3** (one skip, on the longest
     ~2.4k-char reply). Claude appears to treat a satisfying prose answer as "done" and omit the
     final structured step.
   - Resume + long answer + a **strong system-prompt nudge** to always finish with StructuredOutput:
     **5/5** called, and the prose answers shrank (the content moved into the structured field).

4. **Catalog levers, measured.** `--strict-mcp-config` drops the foreign claude.ai connectors.
   `--tools "<allowlist>"` restricts the *built-in* set (not MCP tools). With both, the catalog fell
   51→23 and `ToolSearch` disappeared (deferral off). Forcing deferral off via `ENABLE_TOOL_SEARCH=0`
   also works but loads every tool schema upfront — which **does not scale**: a single large
   connector (e.g. Datadog ≈ 250 functions) would blow the context budget every turn. Deferral exists
   for exactly that case and must stay available.

The historical question "did this happen before the ADR-037 relaxation?" could not be verified
(would require running old CLI/code) and is therefore not asserted. What is asserted: the relaxation
is not the cause (schema strictness did not move the skip).

## Decision

Treat StructuredOutput reliability as a **defense-in-depth** problem on the Claude adapter, rather
than betting on any single lever. Five changes, Claude-only:

1. **Prompt nudge.** Add an explicit instruction to the Claude outcome guidance (chat and work):
   *finish every turn by calling StructuredOutput, even after using other tools and after writing a
   text answer.* Measured to take the skip from ~1/3 to 0/5 and to push the answer into the
   structured field. Prompt-only, fully reversible.

2. **Recovery turn.** When a Claude turn returns no `structured_output` but has final text, issue one
   lightweight resume turn that asks only for the StructuredOutput (no other tools needed → reliable,
   like the 6/6 no-MCP turns). **Lossless** — preserves `artifactRefs` / `changedFiles` /
   `needs_input`, which matters most for Workboard.

3. **Parse fallback.** If even the recovery turn yields no structured output, accept the final text
   as `final_response.summary` instead of throwing. The floor: a successful turn never hard-fails.
   Lossless for chat (text *is* the answer); on Workboard it degrades that one turn to summary-only
   (file refs / needs_input lost) but the run completes.

4. **`--strict-mcp-config`.** Only use the MCP servers Ordinus passes via `--mcp-config`; drop the
   inherited account claude.ai connectors. Ordinus has its own Google connector (ADR-043), so these
   are foreign and pure pollution.

5. **`--tools "<allowlist>"`.** Restrict the built-in catalog to what Ordinus agents actually use —
   `Bash, Read, Edit, Write, Glob, Grep, Skill, WebSearch, WebFetch, NotebookEdit, ToolSearch`
   (StructuredOutput is added automatically by `--json-schema`). This **closes** the harness
   orchestration tools (`Task`, `Workflow`, `Cron*`, `AskUserQuestion`, `DesignSync`, `Monitor`,
   `RemoteTrigger`, `ScheduleWakeup`, `PushNotification`, `EnterWorktree`) — a safety win (an Ordinus
   agent should not spawn sub-agents, create crons, or bypass the `needs_input` panel via
   `AskUserQuestion`). `ToolSearch` is deliberately **kept** so deferral still works for large
   connectors.

**Explicitly excluded: `ENABLE_TOOL_SEARCH=0`.** It disables deferral globally and would force a
large connector's whole tool catalog into context every turn. Deferral is the correct design at
scale; the fix above makes deferral *safe*, it does not remove it.

## Alternatives Considered

### Disable deferral (`ENABLE_TOOL_SEARCH=0`) as the primary fix

Empirically removes `ToolSearch` and the skip's main trigger. Rejected as the primary fix: it does
not scale — one large connector (Datadog ≈ 250 tools) loads ~250 schemas upfront on every turn.
Deferral must stay available; we fix the skip instead of removing deferral.

### `--tools` to remove `ToolSearch` (kill deferral via the documented flag)

Same scaling problem as above by another route — without `ToolSearch`, large MCP catalogs load
upfront. Rejected for the same reason; we keep `ToolSearch` in the allowlist.

### Prompt nudge alone

Strong (5/5 in tests) but not a *proven* guarantee — ADR-037 already documents that trivial prompt
perturbations flip Claude between 0/6 and 6/6. Rejected as a sole fix; kept as layer 1, backed by the
recovery turn and parse fallback.

### Parse fallback alone (text → summary, no recovery turn)

Simplest, one site. Rejected as the sole fix because it is **lossy on Workboard**: a skipped turn
would drop `artifactRefs` / `changedFiles` and misread a `needs_input` as `final_response`. The
recovery turn recovers those losslessly; the fallback is only the last resort.

## Consequences

- The crash is addressed by three independent layers (nudge → recovery → fallback); a turn that did
  real work never hard-fails on a missing envelope.
- Workboard correctness is preserved in the common skip case (recovery turn returns the real
  structured fields); only the rare double-failure degrades to summary-only.
- Ordinus's Claude agents get a smaller, safer, less polluted tool catalog (no foreign connectors, no
  harness orchestration tools), with a modest token saving from the trimmed catalog.
- Deferral keeps working for large connectors — the fix is scale-independent.
- All changes are Claude-adapter / Claude-prompt only; Codex and Gemini are untouched.
- The recovery turn adds one extra cheap round-trip on the (rare) turns where Claude skips
  StructuredOutput; normal turns are unaffected.
- **Deferred:** if Ordinus later lets users curate which functions a connector exposes (e.g. 10 of
  Datadog's 250), that further reduces deferral pressure and is complementary to this ADR.
