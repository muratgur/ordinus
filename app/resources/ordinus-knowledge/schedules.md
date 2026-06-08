# Scheduled tasks

A **Schedule** (ADR-023) is a cron-driven or one-shot trigger that fires an
agent against a pre-defined Work Request template. Each schedule belongs to
one agent; when it fires, it queues a Work Request scoped to that agent's
sandbox.

## Anatomy

- `cron` — standard cron expression, evaluated in the workspace timezone
- `agentId` — the agent that runs when the schedule fires
- `enabled` — paused or active
- `lastFiredAt`, `nextFireAt` — observable cadence
- The schedule carries the *template* of the Work Request (title, instruction,
  expected output); each firing creates a fresh run

## When to suggest a schedule

- "Every morning / every Monday / every hour" patterns
- Reports, summaries, or maintenance tasks the user wants to forget about

## How to drive schedule creation

The slash command `/schedule` takes the conversation context and offers to
turn it into a recurring schedule, asking for cron details and which agent
should run it. You confirm the cron expression in plain English back to the
user ("every weekday at 9am, in your local timezone") before committing.

You can list schedules via `list_schedules` (read), and cancel them via
`cancelSchedule` (destructive — always confirmed).
