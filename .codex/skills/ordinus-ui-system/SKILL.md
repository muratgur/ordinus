---
name: ordinus-ui-system
description: Build Ordinus renderer UI in the intended product style. Use when changing React UI, layout, Tailwind styling, shadcn-style components, status panels, navigation, empty states, forms, tables, task views, or user-facing product text.
---

# Ordinus UI System

## Objective

Make Ordinus feel like a calm, practical command center for AI-assisted work.

## Product Feel

- Work-focused, not marketing-focused.
- Clear status over decorative flourish.
- Dense enough for repeated use, but not crowded.
- User-facing text should describe product state and next actions, not internal implementation.
- Avoid turning the app into a generic chat page.
- Distinctive but calm. Ordinus should feel intentionally designed without becoming loud or theatrical.

## Avoid Generic AI UI

- Do not default to generic assistant layouts, oversized prompt boxes, purple gradients, vague glowing panels, or decorative AI-themed backgrounds.
- Choose a clear product direction before styling: desktop command center, operational workspace, project cockpit, or agent control surface.
- Let the product context drive visual choices. Agent status, work progress, outputs, and attention states matter more than visual novelty.
- Use typography, spacing, color, and motion deliberately. The interface should feel polished because details are consistent, not because effects are abundant.
- Prefer subtle useful motion for state transitions, loading, reveal, and feedback. Avoid animations that distract from work.
- Make empty states, status labels, and action hierarchy feel designed, not placeholder-like.

## UI Rules

- Use shadcn-style components and local reusable primitives.
- Prefer restrained cards for individual panels, not nested card-heavy layouts.
- Use lucide icons for recognizable actions.
- Keep typography readable and proportional to the UI surface.
- Avoid decorative gradients, orbs, bokeh, and oversized hero sections.
- Make status visible: planned, running, blocked, completed, needs attention.
- Avoid one-note palettes. Use a restrained base with purposeful accent colors for state and hierarchy.
- Match component density to the workflow: dashboards and work boards should be scan-friendly, not spacious landing pages.

## Workflow

1. Identify the workflow the UI supports.
2. Choose a calm design direction that fits that workflow.
3. Put the primary state and next action above secondary details.
4. Use existing components before creating new primitives.
5. Keep labels concise and user-centered.
6. Check mobile/narrow and desktop layouts for overflow.
7. Run typecheck, lint, and build.

## Copy Guidelines

- Say what the user can understand now.
- Avoid references to browser/session/localStorage/Electron internals unless the screen is explicitly diagnostic.
- Prefer "Workspace ready" over "IPC bridge initialized".
- Prefer "No work items yet" over "No database rows".
