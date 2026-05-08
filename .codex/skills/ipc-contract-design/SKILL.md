---
name: ipc-contract-design
description: Design and maintain Ordinus typed IPC contracts. Use when adding or changing window.ordinus APIs, ipcMain handlers, ipc channel names, shared request/response types, Zod schemas, preload bridge methods, or renderer calls into main process.
---

# IPC Contract Design

## Objective

Keep Ordinus IPC small, typed, explicit, and stable enough for the renderer to act as a safe UI over main-process capabilities.

## Contract Shape

- Define channel names in `src/shared/ipc.ts`.
- Define shared request/response schemas and types in `src/shared/contracts.ts`.
- Register handlers in main process modules, not renderer.
- Expose renderer-facing methods through `window.ordinus` in preload.
- Use feature-shaped methods such as `workspace.selectFolder()` instead of generic transport methods.

## Workflow

1. Name the user-facing capability before creating an IPC method.
2. Add or update shared types and Zod schemas.
3. Add the IPC channel constant.
4. Implement the main handler and validate untrusted input.
5. Add the narrow preload method that invokes that channel.
6. Consume the method in renderer through `window.ordinus`.
7. Run typecheck, lint, and build.

## Guidelines

- Keep method names domain-oriented: `app.getInfo`, `db.getStatus`, `workspace.selectFolder`.
- Prefer one explicit method over a generic catch-all channel.
- Keep renderer errors user-readable and main errors diagnostic enough to debug.
- When IPC responses drive renderer status, empty states, or error copy, align user-visible naming with `DESIGN.md`.
- Do not add IPC for future features until there is an immediate caller.
- Do not return secrets, raw environment details, or unrestricted local paths unless the UI truly needs them.

## Anti-Patterns

- `window.ordinus.invoke(channel, payload)`.
- Passing raw command strings from renderer to main.
- Duplicating response shapes separately in main and renderer.
- Letting renderer decide privileged policy such as workspace boundaries or executable paths.
