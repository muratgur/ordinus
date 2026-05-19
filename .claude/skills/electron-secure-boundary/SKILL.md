---
name: electron-secure-boundary
description: Maintain Ordinus Electron security boundaries. Use when changing BrowserWindow options, main/preload/renderer responsibilities, privileged OS access, filesystem/database/process usage, or anything that could expose Electron or Node capabilities to renderer code.
---

# Electron Secure Boundary

## Objective

Keep Ordinus secure by preserving the separation between privileged desktop code and UI code.

## Rules

- Keep privileged work in Electron main process: filesystem, SQLite, child processes, provider runtimes, secrets, native dialogs, and OS integration.
- Keep renderer as UI-only React code. Do not import or use Node APIs, Electron APIs, SQLite clients, filesystem modules, or child process modules in renderer.
- Keep preload small and typed. Expose only purpose-built `window.ordinus.*` methods.
- Never expose raw `ipcRenderer`, `electron`, filesystem, process, database, or generic command execution APIs to renderer.
- Preserve `nodeIntegration: false`, `contextIsolation: true`, and `sandbox: true` unless the user explicitly asks for a security model redesign.
- Avoid third-party runtime imports in preload. In sandboxed preload, prefer type-only imports plus `ipcRenderer.invoke`.

## Workflow

1. Identify which side of the boundary the change touches: main, preload, renderer, or shared contracts.
2. Move privileged behavior to main process services or IPC handlers.
3. Add the narrowest preload method needed for renderer.
4. Keep validation and trust decisions in main/shared, not renderer.
5. Run `npm run typecheck`, `npm run lint`, and `npm run build`.
6. For boundary changes, smoke test `npm run dev` or the packaged app.

## Red Flags

- Renderer imports from `electron`, `node:*`, `fs`, `path`, `child_process`, `better-sqlite3`, or main-process modules.
- Preload exposes general-purpose methods such as `invoke(channel, payload)` or `runCommand(command)`.
- IPC handlers trust renderer payloads without validation.
- A UI feature requires relaxing sandbox settings before simpler IPC design has been tried.
