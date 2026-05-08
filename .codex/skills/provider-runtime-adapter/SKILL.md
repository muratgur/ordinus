---
name: provider-runtime-adapter
description: Design Ordinus provider runtime adapters for local AI CLIs. Use when working on Codex, Claude, Gemini, or future provider detection, auth status, run lifecycle, process management, cancellation, event parsing, output capture, or provider-neutral runtime interfaces.
---

# Provider Runtime Adapter

## Objective

Keep local AI CLI integrations provider-neutral, observable, and owned by Electron main process.

## Adapter Boundary

Provider adapters should hide provider-specific CLI details behind a shared runtime shape. Start with only the methods needed by current product behavior.

Preferred concepts:

- `detect`: determine whether the CLI is available.
- `getAuthStatus`: report whether the provider appears ready.
- `startRun`: launch one user-approved run.
- `cancelRun`: stop an active run.
- `parseEvents`: normalize stdout/stderr into observable run events when needed.

Do not implement all concepts until the product flow needs them.

## Runtime Rules

- Run provider processes from Electron main process or a main-owned worker.
- Do not allow renderer to pass arbitrary shell commands.
- Store run state and events durably only after the run model is intentionally designed.
- Normalize provider behavior without erasing useful provider-specific diagnostics.
- Treat Codex, Claude, and Gemini as peers. Do not let the first provider shape the whole architecture.

## Workflow

1. Define the user action that needs provider runtime support.
2. Add the smallest provider-neutral interface needed for that action.
3. Implement detection or process behavior in main process.
4. Validate executable paths, workspace boundaries, and allowed arguments in main.
5. Stream or record events in a way the UI can explain clearly.
6. Support cancellation before adding more automation.
7. Run typecheck, lint, build, and a runtime smoke test.

## Red Flags

- Renderer sends raw command strings or CLI args.
- Provider-specific flags leak into UI state too early.
- Long-running process state exists only in memory when the UI needs to recover it.
- A provider integration assumes a single operating system.
