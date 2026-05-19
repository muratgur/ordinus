---
version: alpha
name: Ordinus Desktop Design System
description: A calm, local-first desktop application design system for coordinating AI agents around real software work. The system favors observable status, compact work surfaces, clear next actions, restrained color, hairline structure, and code-aware typography over marketing layouts or decorative AI visuals.

colors:
  primary: "#e65a1f"
  primary-active: "#c74712"
  primary-soft: "#ffe2d2"
  on-primary: "#ffffff"

  ink: "#24231f"
  body: "#57534e"
  body-strong: "#24231f"
  muted: "#7c766d"
  muted-soft: "#a29c92"

  canvas: "#f6f6f2"
  canvas-soft: "#fbfaf6"
  surface-card: "#ffffff"
  surface-subtle: "#efeee8"
  surface-strong: "#e4e1d8"

  hairline: "#e1ded5"
  hairline-soft: "#eeebe3"
  hairline-strong: "#c9c4b8"

  status-planned: "#8b8792"
  status-running: "#2f6fed"
  status-reading: "#4c7dbf"
  status-editing: "#8a63b8"
  status-blocked: "#b45309"
  status-attention: "#c2410c"
  status-completed: "#1f8a65"
  status-failed: "#cf2d56"

typography:
  app-title:
    fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: 32px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: 0
  page-title:
    fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: 26px
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: 0
  section-title:
    fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: 0
  component-title:
    fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0
  body:
    fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  body-strong:
    fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: 0
  caption:
    fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0
  button:
    fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1
    letterSpacing: 0
  code:
    fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: 0

rounded:
  none: 0px
  xs: 4px
  sm: 6px
  md: 8px
  lg: 12px
  xl: 16px
  pill: 9999px
  full: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  base: 16px
  md: 20px
  lg: 24px
  xl: 32px
  xxl: 48px
  section: 32px

components:
  app-shell:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
  workspace-header:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.page-title}"
    padding: 24px
  command-bar:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: 12px
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 10px 16px
    height: 40px
  button-secondary:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 9px 15px
    height: 40px
  icon-button:
    backgroundColor: transparent
    textColor: "{colors.body}"
    rounded: "{rounded.md}"
    height: 40px
    width: 40px
  text-input:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: 10px 12px
    height: 40px
  status-pill:
    backgroundColor: "{colors.surface-strong}"
    textColor: "{colors.ink}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: 4px 10px
  workspace-card:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: 20px
  provider-card:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: 20px
  agent-run-card:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: 20px
  task-row:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: 12px 14px
  activity-timeline:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.body}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: 16px
  code-surface:
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink}"
    typography: "{typography.code}"
    rounded: "{rounded.md}"
    padding: 12px
  attention-banner:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: 14px 16px
  setup-panel:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: 24px
---

# Ordinus Desktop Design System

## Purpose

Ordinus is a desktop command center for coordinating AI agents around real software work. The interface should make work observable: what is planned, what is running, what is blocked, what completed, and what needs the user's decision.

This document is the canonical visual and interaction reference for renderer UI. Use it for React layout, Tailwind tokens, shadcn-style components, status surfaces, empty states, forms, task views, provider views, and user-facing product copy.

If this document conflicts with `AGENTS.md` or a project skill, the secure Electron boundary and product principles in `AGENTS.md` win.

## Product Feel

- Calm, practical, and work-focused.
- Desktop application first, not marketing site first.
- Dense enough for repeated daily use, but never crowded.
- Status should be visible before decoration.
- Primary actions should be obvious, but scarce.
- Code, logs, paths, commands, and provider details should feel native to the interface.
- Empty states should explain the product state and the next useful action.

## Design Direction

Ordinus uses a warm neutral application canvas, white work surfaces, hairline structure, restrained color, and compact typography. The system should feel closer to a developer tool, operations cockpit, or project workspace than a chat app or landing page.

The main accent is reserved for decisive actions and important attention states. Agent activity uses semantic status colors so users can scan work progress without reading every row.

## Color System

### Core Roles

- `{colors.canvas}`: App background and page floor.
- `{colors.canvas-soft}`: Code panes, log surfaces, nested read-only details.
- `{colors.surface-card}`: Cards, panels, setup surfaces, provider cards.
- `{colors.surface-subtle}`: Subtle grouped regions and inactive rows.
- `{colors.surface-strong}`: Neutral badges, selected chips, compact metadata.
- `{colors.ink}`: Primary text and headings.
- `{colors.body}`: Default body text.
- `{colors.muted}`: Secondary descriptions and metadata.
- `{colors.hairline}`: Default 1px dividers and card borders.
- `{colors.hairline-strong}`: Focused or selected boundaries.
- `{colors.primary}`: Primary action and rare high-emphasis signal.

### Primary Accent

Use `{colors.primary}` sparingly. It is for one primary action in a local surface, a focused action state, or a rare attention marker. Do not use it as a large section background, decorative wash, gradient, or repeated row accent.

Preferred primary action examples:

- Enter Ordinus
- Start run
- Connect provider
- Save workspace
- Review output
- Resolve blocker

### Status Colors

Use status color to explain agent and task state, not to decorate cards.

| Token | State | Use |
|---|---|---|
| `{colors.status-planned}` | Planned | Queued or intentionally waiting work |
| `{colors.status-running}` | Running | Active execution or provider process |
| `{colors.status-reading}` | Reading | Inspecting files, docs, logs, or context |
| `{colors.status-editing}` | Editing | Applying changes to workspace files |
| `{colors.status-blocked}` | Blocked | Waiting on user input, missing dependency, or external condition |
| `{colors.status-attention}` | Needs attention | User review or risky decision required |
| `{colors.status-completed}` | Completed | Successful finished work |
| `{colors.status-failed}` | Failed | Error, failed check, or unrecoverable run |

Status colors belong in compact pills, icons, left row rails, progress markers, and timeline nodes. Avoid filling full cards with strong status color.

## Typography

Use Inter or the platform sans stack for product UI. Use JetBrains Mono, Fira Code, Consolas, or monospace fallback for code, logs, paths, command output, commit SHAs, and provider runtime details.

The application should not use oversized hero typography. Display sizes are for app titles and top-level page headings, not decorative marketing headlines.

| Token | Size | Weight | Use |
|---|---:|---:|---|
| `{typography.app-title}` | 32px | 600 | App-level title or major onboarding title |
| `{typography.page-title}` | 26px | 600 | Workspace page title |
| `{typography.section-title}` | 20px | 600 | Major panel group title |
| `{typography.component-title}` | 16px | 600 | Card title, provider title, task title |
| `{typography.body}` | 14px | 400 | Default interface copy |
| `{typography.body-strong}` | 14px | 600 | Emphasis inside rows and panels |
| `{typography.caption}` | 12px | 500 | Metadata, status labels, timestamps |
| `{typography.button}` | 14px | 500 | Button labels |
| `{typography.code}` | 12px | 400 | Code, logs, paths, command output |

Rules:

- Keep letter spacing at `0`.
- Use uppercase only for compact metadata labels when the existing component pattern calls for it.
- Do not use viewport-scaled font sizes.
- Keep text proportional to the surface. Cards, sidebars, and rows should not use page-title scale.

## Layout

### Desktop App Structure

The default Ordinus screen should be an application workspace, not a landing page.

Preferred layout structure:

1. Workspace header with current project, readiness, and primary action.
2. Command bar or action row for common operations.
3. Main work area with agent runs, tasks, activity, or setup state.
4. Secondary inspector or details panel when useful.
5. Compact status or diagnostics surfaces where needed.

### Screen Height

Screens render inside the app shell outlet, below a fixed `3rem` header. The canonical usable height is `calc(100vh - 3rem)`.

At the desktop breakpoint (`xl` and up), a screen's root container should lock to this height with internal scroll, so the page itself never scrolls and the work surface fills the viewport like a desktop application:

- Use `xl:h-[calc(100vh-3rem)] xl:min-h-0 xl:overflow-hidden` on the screen root.
- Manage the screen's own padding (e.g. `py-4`) inside that border-box height — do not add it on top.
- Below `xl`, fall back to normal page scroll: keep `min-h-[calc(100vh-3rem)]` and do not force a fixed height or `overflow-hidden`, so narrow or short windows are not cramped into tiny nested scroll regions.
- Scroll lives in inner regions (lists, panels, boards) via `min-h-0` + `overflow-y-auto` / `ScrollArea`, not on the page.
- If an inner scroll region has no natural minimum height (e.g. a chat message list or empty board), give its card a sub-`xl` `min-h-[...]` paired with `xl:min-h-0`, so it does not collapse to zero in the page-scroll fallback.

Do not invent per-screen height constants (e.g. `100vh-7rem`). All screens use the same `100vh-3rem` baseline so they align.

### Spacing

Use a compact 4px-based scale. Most app UI should live between `{spacing.xs}` and `{spacing.xl}`.

- Row gap: 8px to 12px.
- Card padding: 16px to 24px.
- Panel gap: 16px to 24px.
- Page padding: 24px to 32px.
- Major section spacing: 32px.

Avoid 80px marketing-section rhythm inside the app.

### Density

Dashboards, agent boards, provider status lists, and task histories should be scan-friendly. Prefer organized density over spacious promotional composition.

Use repeated rows and panels for operational information. Do not build hero sections, footer bands, testimonial blocks, pricing cards, or generic marketing grids in the app shell.

## Elevation And Surfaces

Ordinus uses hairline structure instead of heavy shadows.

| Level | Treatment | Use |
|---|---|---|
| Canvas | `{colors.canvas}` | App floor |
| Subtle | `{colors.surface-subtle}` with optional hairline | Grouped inactive areas |
| Card | `{colors.surface-card}` with 1px `{colors.hairline}` | Panels, cards, provider surfaces |
| Focused | Card plus `{colors.hairline-strong}` or ring | Selected rows, active inputs, current run |
| Overlay | Card plus slightly stronger border | Dialogs, sheets, transient inspectors |

Avoid decorative gradients, glow effects, bokeh, or large soft shadows. Motion should clarify state transitions, loading, and reveal; it should not compete with the work.

## Shapes

| Token | Value | Use |
|---|---:|---|
| `{rounded.xs}` | 4px | Inline tags, small code chips |
| `{rounded.sm}` | 6px | Compact rows and small controls |
| `{rounded.md}` | 8px | Buttons, inputs, status pills |
| `{rounded.lg}` | 12px | Cards, panels, setup surfaces |
| `{rounded.xl}` | 16px | Larger modal or onboarding surfaces |
| `{rounded.pill}` | 9999px | Status pills and compact badges |

Cards should generally use `{rounded.lg}` or less. Avoid nested cards unless the inner surface is a real repeated item, code pane, modal body, or inspector region.

## Component Vocabulary

### App Shell

`app-shell` is the full renderer surface. It uses `{colors.canvas}`, `{colors.ink}`, and compact page padding. It should expose current workspace state quickly.

Avoid building a marketing landing page as the first screen. The first screen should be usable.

### Workspace Header

`workspace-header` identifies the current workspace and readiness. It may include:

- Workspace name.
- Provider readiness summary.
- Current active run summary.
- One primary action.
- One or two secondary actions.

Keep implementation details secondary. Prefer "Workspace ready" over "IPC bridge initialized" unless the screen is diagnostic.

### Command Bar

`command-bar` holds common actions such as choosing a folder, starting a run, refreshing provider status, reviewing output, or opening settings.

Use lucide icons for familiar actions. Use icon-only buttons when the action is recognizable, with accessible labels or tooltips.

### Buttons

`button-primary` is for the local primary action. There should usually be only one primary button in a panel.

`button-secondary` is for neutral alternatives.

`icon-button` is for tool actions such as refresh, open folder, settings, copy, collapse, expand, retry, cancel, or inspect.

Buttons should be 40px tall by default. Use 44px only for onboarding or touch-heavy surfaces.

### Inputs

`text-input` is used for workspace names, paths, search, filters, and provider configuration. Use mono typography only when the value is code-like, path-like, or command-like.

Validation text should say what the user can do next.

### Status Pill

`status-pill` is the main compact status pattern. Pair it with a small icon when useful.

Use status labels from the product model:

- Planned
- Running
- Reading
- Editing
- Blocked
- Needs attention
- Completed
- Failed

### Workspace Card

`workspace-card` summarizes current workspace state, recent activity, and next action. It should not become a generic feature card.

### Provider Card

`provider-card` reports provider readiness, CLI detection, account state, last check, and available actions. It may show technical details, but the title and primary status should remain user-readable.

### Agent Run Card

`agent-run-card` shows a single run or agent effort. It should include:

- Role or provider.
- Current status.
- Last meaningful activity.
- Scope or workspace path when relevant.
- Primary next action if blocked or reviewable.

### Task Row

`task-row` is for queued, running, completed, or blocked work items. It should be stable in height when status text changes. Use a left status rail, status pill, or compact icon rather than full-row color fills.

### Activity Timeline

`activity-timeline` is the main observable history pattern. It should make agent activity legible without forcing the user to read raw logs first.

Timeline entries can use the status colors for:

- Planning
- Reading
- Editing
- Running commands
- Waiting for user
- Completing
- Failing

### Code Surface

`code-surface` displays logs, code snippets, paths, command output, diffs, and runtime details. It uses mono typography and should support wrapping or horizontal scroll depending on content type.

Do not use code surfaces as decoration. They should contain useful details.

### Attention Banner

`attention-banner` is for decisions, blockers, missing setup, failed checks, or important next steps. Keep it concise and actionable.

Examples:

- "Codex is installed, but no account is connected."
- "This run is blocked until you choose a workspace folder."
- "Build failed. Review the failing check before merging."

### Setup Panel

`setup-panel` is used during first-run and provider setup. It should show what is ready, what is missing, and the next action.

Setup should feel like configuring a local workspace, not signing up for a hosted SaaS.

## Copy Guidelines

Use interface text that explains product state and next action.

Prefer:

- "Workspace ready"
- "No work items yet"
- "Connect Codex"
- "Choose workspace folder"
- "Run needs attention"
- "Provider not detected"

Avoid:

- "IPC bridge initialized"
- "No database rows"
- "AI magic"
- "Unlock productivity"
- "Download now"
- "Try for free"

Use technical language only when the user is in a diagnostic, developer, provider, database, or runtime surface.

## Responsive Behavior

Ordinus is desktop-first, but narrow windows must remain usable.

Breakpoints:

| Name | Width | Behavior |
|---|---:|---|
| Narrow | < 720px | Single-column panels, inspector moves below main content |
| Medium | 720px to 1024px | Two-column where useful, compact command bar |
| Desktop | > 1024px | Main content plus optional right inspector |

Rules:

- Text must not overflow buttons, cards, or status pills.
- Paths and logs may wrap or scroll inside code surfaces.
- Critical actions remain reachable at narrow widths.
- Cards should not resize when status labels change.

## Implementation Rules

- Use shadcn-style components and local reusable primitives.
- Keep Tailwind theme tokens aligned with this document.
- Prefer CSS variables for core color roles.
- Use lucide icons for recognizable actions.
- Do not expose implementation details in renderer copy unless the surface is explicitly diagnostic.
- Do not add decorative AI backgrounds, oversized prompt boxes, gradient orbs, or hero-style promotional sections.
- Keep renderer UI within the secure Electron boundary. Renderer must not directly access Node, filesystem, child processes, secrets, or SQLite.

## Iteration Guide

1. Identify the workflow the UI supports.
2. Choose the smallest component vocabulary that fits the workflow.
3. Put primary state and next action above secondary details.
4. Use existing components before creating new primitives.
5. Keep `{colors.primary}` scarce.
6. Use status colors only for state communication.
7. Check narrow and desktop layouts for overflow.
8. Run typecheck, lint, and build before finishing meaningful UI changes.

## Out Of Scope

- Marketing heroes.
- Pricing tables.
- Testimonials.
- Footer link grids.
- Decorative IDE mockups.
- Logo experiments.
- Cloud account flows.
- Marketplace surfaces.
