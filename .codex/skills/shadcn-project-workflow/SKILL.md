---
name: shadcn-project-workflow
description: Work with shadcn/ui in Ordinus. Use when adding, updating, composing, debugging, or styling shadcn-style components; touching components.json; using npx shadcn; changing src/renderer/src/components/ui; applying registry items or presets; or deciding whether to install a UI primitive.
---

# shadcn Project Workflow

## Objective

Use shadcn/ui as the standard path for reusable UI primitives while preserving Ordinus product direction.

Use this with `ordinus-ui-system`: this skill governs shadcn mechanics; `ordinus-ui-system` governs product feel.

## Required Workflow

1. Run or inspect project context before making component decisions:
   `npm run ui:info`
2. Check existing installed components before adding new ones.
3. Prefer shadcn CLI for registry components:
   `npm run ui:add -- <component>`
4. For unfamiliar components, get docs first:
   `npx shadcn@latest docs <component>`
5. For updates, preview before changing:
   `npm run ui:add -- <component> --dry-run`
   `npm run ui:add -- <component> --diff <file>`
6. Read files added by the CLI and fix imports, aliases, composition, and lint issues.
7. Run `npm run ui:check`, `npm run typecheck`, `npm run lint`, and `npm run build`.

## Ordinus Defaults

- Package manager: npm.
- Electron app directory: `app`.
- Renderer alias: `@renderer/*`.
- Run shadcn and npm commands from `app` unless the user explicitly changes the project layout.
- UI components path: `app/src/renderer/src/components/ui`.
- Utility path: `app/src/renderer/src/lib/utils.ts`.
- Tailwind version: v3.
- Icon library: `lucide-react`.
- Product style: calm, operational, work-focused.

## Critical Rules

- Compose existing components before writing custom styled markup.
- Use built-in variants before custom class overrides.
- Use semantic tokens such as `bg-background`, `text-muted-foreground`, `border`, and `bg-primary`.
- Avoid raw Tailwind colors for product UI unless adding an intentional semantic token or variant.
- Use `gap-*` for spacing, not `space-x-*` or `space-y-*`.
- Use `size-*` for equal width and height.
- Use `cn()` for conditional class composition.
- Do not apply presets, overwrite components, or change global theme without explicit user approval.

## Detailed References

Read only the relevant reference when needed:

- [rules/styling.md](rules/styling.md) for Tailwind and token rules.
- [rules/composition.md](rules/composition.md) for component composition and accessibility.
- [rules/forms.md](rules/forms.md) for forms and validation layouts.
- [rules/icons.md](rules/icons.md) for lucide icon usage.
- [rules/base-vs-radix.md](rules/base-vs-radix.md) for primitive API differences.
- [references/cli.md](references/cli.md) for shadcn CLI commands.
- [references/customization.md](references/customization.md) for theming and CSS variables.

## Notes

The official shadcn skill includes broader registry, MCP, asset, and eval infrastructure. Ordinus keeps a smaller adapted version focused on this Electron/Vite app.
