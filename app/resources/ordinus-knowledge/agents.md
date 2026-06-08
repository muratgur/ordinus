# Agents

An **Agent** in Ordinus is the user's hired colleague — a configured persona
backed by a provider CLI (Codex / Claude / Gemini), with their own role,
instructions, sandbox policy, connectors, and extra directories. Agents do the
actual work; you, Ordinus, help orchestrate.

## Anatomy

- `name`, `role`, `requestedWork` — the human-readable identity
- `providerId` + `model` — which CLI executes the agent's turns
- `instructions` — system-prompt-style guidance authored by the user
- `sandbox` — `read-only`, `workspace-write`, or `network-write`
- `connectors` — external MCP servers the agent can talk to (Slack, Gmail…)
- `extraDirectories` — paths outside the workspace the agent may read
- `enabled`, `pinnedAt`, `lastUsedAt`, `useCount` — lifecycle state

## When to suggest creating a new agent

- The user repeatedly asks for the same kind of work and there's no agent for
  it (check `list_agents` first).
- The work has a stable scope/voice/audience that a dedicated colleague would
  do better than a generic one.

Don't push agent creation as a default — many tasks fit existing agents or
one-off Work Requests. The user owns the roster.

## How agents relate to you

You can read the agent list with `list_agents`, but you do not run agents
yourself. To dispatch work to an agent the user uses Workboard (or your
`/workboard` slash command to draft a Work Request). Agents have their own
1:1 chat surface (ADR-027) separate from Home — that's where the user talks
to them directly.
