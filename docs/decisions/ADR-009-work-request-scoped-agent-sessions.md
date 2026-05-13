# ADR-009: Scope Workboard Agent Sessions To A Work Request

## Status

Accepted

## Date

2026-05-13

## Context

Workboard executes a Work Request by splitting the user's request into Work Items assigned to
agents. The previous runtime model could start provider sessions per Work Run unless a follow-up was
explicitly anchored to an existing run. That made continuation behavior inconsistent:

- Sequential work assigned to the same agent did not reliably share provider context.
- Request-level continuation work could accidentally become a fresh provider session.
- Reusing broad request history in every prompt would grow quickly across multiple follow-ups.
- Letting one agent run multiple Work Items concurrently in the same request could corrupt the
  provider session context.

At the same time, Ordinus should avoid global long-lived agent memory. A Work Request is the natural
product boundary: it is visible to the user, has a shared working folder, and represents one coherent
piece of coordinated work.

## Decision

Each Work Request owns one provider session per assigned agent.

Ordinus stores this in `work_request_agent_sessions`, keyed by `(request_id, agent_id)`. When a Work
Run starts, the main process resolves the provider session from that row. If it exists, the provider
adapter resumes it. If it does not exist, the run starts a fresh provider session and the returned
session reference is written back to both the Work Run and the Work Request agent session row.

The Workboard scheduler preserves the request-level concurrency limit, but adds a per-request-agent
lock. Within one Work Request, a given agent may only have one running Work Run at a time. Different
agents may still run in parallel.

When a Work Run has received user input but cannot resume immediately because its agent is busy,
the input request is queued for resume. Queued resumes are prioritized ahead of ordinary queued
Work Runs across the Work Request, not only within the same agent's queue, because they represent
continuation of already-started user interaction rather than new work.

Work Run prompts remain artifact-first. A provider session may contain useful same-agent context, but
workspace files, artifacts, upstream summaries, and explicit user instructions are authoritative.

## Consequences

- Sequential same-agent Work Items within a Work Request can continue naturally through one provider
  session.
- Request-level follow-ups can reuse the agent's request-local session without copying session refs
  through anchor runs.
- User answers to paused Work Runs are resumed before ordinary queued work when scheduler slots are
  available.
- Context does not bleed across unrelated Work Requests.
- Scheduler behavior is easier to reason about: parallelism is between agents, not within one agent's
  session.
- Existing Work Runs without session rows are migrated lazily. The database can seed a new
  request-agent session from the latest stored `work_runs.provider_session_ref` for that request and
  agent.
