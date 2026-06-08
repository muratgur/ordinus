# Recipes

Short patterns for "how would I do X in Ordinus". Use these when the user
describes a goal and you want to suggest a concrete shape. These are starting
points — the user always shapes the final design. Pick the closest match,
adapt to what they actually asked for, and confirm before calling any
action tool.

## "I want a report every Monday at 9am"

→ One agent (research/writing-capable), one schedule.
1. `list_agents` to find a suitable colleague. If none fits, suggest creating
   one (point them to the Agents screen — you do not create agents yourself).
2. Draft the Work Request body (title, instruction, expected output) in chat.
3. `/schedule` (or `create_schedule` directly) to commit a cron schedule
   (`0 9 * * 1` for weekly Mon 09:00).

## "I want to summarize what happened in WR-X"

→ Read tools, no new work needed.
1. `get_run` for context (status, summary, error).
2. `get_run_log` to read the tail of stdout/stderr.
3. Summarize in chat. Offer to write a memory if the user wants to remember
   ("Want me to remember this run's pattern for next time?").

## "Last run errored and I don't know why"

→ Triage in chat, then decide.
1. `get_run` for status + error field.
2. `get_run_log` (stderr first) for the actual failure.
3. If the run is wedged, suggest `cancel_work_run` (destructive — confirmed).
4. If the WR itself is the wrong shape, suggest `archive_work_request`
   (destructive — confirmed) and creating a fresh one via `/workboard`.

## "I keep doing the same multi-step thing"

→ Workflow candidate.
1. Walk through the steps with the user in chat (2–4 short sentences).
2. Identify which agents handle each step (`list_agents`).
3. `/workflow` (or `create_workflow` directly) to commit a node+edge spec.
   Use empty titles/instructions for nodes the user hasn't filled in — the
   designer accepts lenient designs and the user refines them there.

## "Turn this idea into actual work"

→ Plan via Workboard.
1. Confirm the goal in one sentence in chat.
2. `/workboard` (or `propose_work_request`) to run the request through the
   existing Planner. The Workboard plan-review surface opens; the user
   approves there, not in your transcript.
3. Use the user's earlier conversation context to build a self-contained
   `request` string — the Planner cannot see your transcript.

## "Remember that I prefer X" / "Don't ask me about Y again"

→ `memory_write` with the right type:
- `preference` — how the user likes things done ("concise replies",
  "always include a TL;DR")
- `user` — facts about the person ("name is Murat", "TZ is Europe/Istanbul")
- `project` — a thing they're working on ("ordinus refactor sprint", with
  scope notes)
- `decision` — a choice they made that future you should respect

Confirm the entry's name + body back to them in chat before calling, so
they can correct it. They can also audit/edit later from the Memory panel.

## "What do you remember about me?"

→ `memory_search` with no filters, then render as a short list grouped by
type. Tell them they can edit/delete from the Memory panel (top-right
brain icon on Home).

## "Stop / pause that schedule"

→ Distinguish the two intents:
- "Stop running for a while" / "pause" → tell the user to disable from
  the Schedules screen (one-click toggle). You do NOT have a disable tool
  — only delete, which is irreversible.
- "Delete it entirely" / "remove permanently" → `delete_schedule`
  (destructive — confirmed).

When in doubt, ask once: "pause for now, or delete entirely?"

## "Show me my recent work"

→ `list_recent_work_requests`. Render as a short markdown table with
title, status, and a relative timestamp. Offer to drill into any one via
`get_run` if the user references it.

## "I'm stuck on how Ordinus works"

→ This is the `/help` case. Answer from the knowledge pack:
- Workflows (visual node-based reusable designs)
- Agents (the user's hired colleagues; you don't create or modify them)
- Schedules (cron-driven triggers on a Work Request template)
- Workboard (where work runs happen; you can plan WRs but not run them)
- Connectors (external MCP services agents can use)
- Memory + actions (your own toolset)

Keep answers concrete and link to the right screen for actions you can't
take yourself ("Open Settings → Providers to connect Claude").
