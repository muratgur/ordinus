# ADR-004: Centralize Agent Disable And Hard Delete

## Status

Accepted

## Date

2026-05-09

## Context

Ordinus needs two different agent removal behaviors:

- Disable an agent so it no longer participates in new product activity.
- Permanently delete an agent so it is removed from the database, conversations, app-owned files,
  and app-owned logs.

The current data model already has an `agents.enabled` boolean. Conversations reference agents
through `conversation_participants.agent_id`, and agent-owned files live under Electron `userData`
with paths derived from the stable `agent.id`.

If disable and delete rules are implemented separately in renderer screens, conversation flows,
future task assignment, and future scheduling code can drift. A disabled agent might still appear
in a picker or receive work if one call site forgets to check it. A deleted agent can also leave
broken conversation references unless cleanup is centralized.

## Decision

Use `agents.enabled` as the product-level disabled state.

- `enabled = true`: the agent is active and may be selected for new conversations or work.
- `enabled = false`: the agent remains visible in management/history surfaces but must not receive
  new work, start new conversations, or be selected by assignment flows.

Centralize agent eligibility in the Electron main process behind domain methods such as:

```text
requireAgent(id)
requireActiveAgent(id)
hasRunningWorkForAgent(id)
assertAgentHasNoRunningWork(id, action)
listAgents()
listActiveAgents()
disableAgent(id)
deleteAgent(id)
```

All privileged workflows that start or continue agent activity must call `requireActiveAgent`.
This includes direct conversation creation, conversation turn preparation, and future task,
schedule, or automation assignment flows. Renderer code may present controls, but it must not be
the source of truth for whether an agent can act.

Disabling or deleting an agent must be refused while that agent has running work. For the current
implementation, running work means a `conversation_turns` row with `status = 'running'` attached to
one of the agent's `conversation_participants` rows. Future task, schedule, or automation runtime
models should extend the same main-process check instead of adding separate UI-only guards.

### Central Running Work Contract

Any module that can make an agent do work must participate in the centralized running-work
contract.

The source of truth for whether an agent is busy is the main-process agent domain layer, currently
represented by `hasRunningWorkForAgent` and `assertAgentHasNoRunningWork`. The renderer and
individual feature screens may display status, but they must not independently decide whether an
agent is safe to disable or delete.

Today, direct conversations contribute to this contract through running conversation turns. Future
features such as planner mode, scheduler mode, task assignment, automation, or multi-agent workflows
must update this same centralized check when they introduce new ways for agents to run. A feature
that starts agent work is incomplete unless disable and hard-delete correctly recognize that work as
running.

If multiple product areas begin tracking agent work independently, Ordinus should introduce an
explicit shared work-run model, such as an `agent_work_runs` table, in a separate ADR. Until then,
the central check may compose the current durable state owned by each implemented module.

Permanent delete is a hard-delete operation owned by main process. The renderer should request one
explicit operation, for example `window.ordinus.agents.delete({ id })`; it must not orchestrate
database and filesystem cleanup itself.

Hard delete removes:

- The `agents` row.
- `conversation_participants` rows for that agent.
- `conversation_turns` rows attached to those participants.
- `conversations` rows that have no remaining participants after cleanup.
- The app-owned agent folder under `userData/agents/<agent-id>`.
- App-owned conversation log folders referenced by deleted turns.

Provider-owned global session stores, such as CLI profile/session directories outside Ordinus
`userData`, are not deleted by this operation. Ordinus deletes its own references and app-owned
logs. Provider-specific session purging requires a separate explicit adapter contract.

## Alternatives Considered

### Add A New Agent Status Enum Now

- Pros: Could model states like `active`, `disabled`, `archived`, and `deleted` explicitly.
- Cons: Adds schema and product complexity before the app needs more than active versus disabled.
- Rejected for now: `enabled` already exists and can express the immediate behavior.

### Let Renderer Filter Disabled Agents

- Pros: Quick to implement in the visible UI.
- Cons: Easy to bypass from another screen, future scheduler, or IPC call. It does not protect
  privileged runtime paths.
- Rejected: Agent eligibility is a domain rule and must live in main process.

### Preserve Conversations When An Agent Is Deleted

- Pros: Users can keep historical text after removing an agent.
- Cons: The current conversation model resolves participant identity through live agent records.
  Preserving conversations safely would require participant-level agent name and role snapshots.
- Rejected for this decision: The requested hard-delete behavior is that the agent disappears from
  conversations and associated local state.

### Soft Delete Instead Of Hard Delete

- Pros: Safer recovery and simpler audit history.
- Cons: Does not satisfy the requirement that a deleted agent be removed everywhere, including
  local files.
- Rejected: Disable covers reversible removal. Delete is intentionally permanent.

## Consequences

- Disabled agents can remain manageable without being eligible for new work.
- Runtime and assignment safety depends on one main-process eligibility check rather than scattered
  UI filtering.
- Hard delete is destructive and should require a clear confirmation in the UI.
- Disable and hard delete are refused while an agent has running work, preventing half-disabled or
  half-deleted runtime state.
- Conversations tied only to the deleted agent are removed with that agent.
- Multi-agent conversations can survive only if they still have remaining participants after the
  deleted agent's participant rows and turns are removed.
- Future features that assign work to agents must use `listActiveAgents` or `requireActiveAgent`.
- Future features that run agents must extend the central running-work contract before they are
  considered complete.
- If Ordinus later needs to preserve conversation history after agent deletion, it should first add
  participant snapshots such as `agent_name_snapshot` and `agent_role_snapshot`.

## Implementation Notes

- Keep all database mutation and filesystem deletion in main process services.
- Use a database transaction for hard-delete database cleanup.
- Check `assertAgentHasNoRunningWork` before disabling or deleting an agent.
- Keep `hasRunningWorkForAgent` as the single composition point for current and future running-work
  sources.
- Collect app-owned log references before deleting turn rows, then remove those log directories
  after the database cleanup succeeds.
- Resolve and validate agent filesystem paths under the known `userData/agents` root before
  deletion.
- Keep `disableAgent` separate from `deleteAgent`; disabling should not remove conversations,
  logs, skills, or agent-owned files.
