# shadcn CLI Reference

Run commands from the Ordinus Electron app directory: `app`.

## Project Context

```bash
npm run ui:info
```

Use this before adding or updating components. Confirm aliases, component paths, Tailwind version, base library, icon library, and installed components.

## Add Components

```bash
npm run ui:add -- button card dialog
```

After adding, read the changed files and verify imports and composition.

## Docs

```bash
npx shadcn@latest docs button dialog select
```

Use docs for unfamiliar or complex components.

## Search and View

```bash
npx shadcn@latest search @shadcn -q "sidebar"
npx shadcn@latest view @shadcn/button
```

Use search before writing custom primitives.

## Update Safely

```bash
npm run ui:add -- button --dry-run
npm run ui:add -- button --diff button.tsx
```

Never overwrite local component changes without explicit user approval.

## Presets

Do not apply or switch presets unless the user explicitly asks. Presets can alter theme, fonts, and component styling broadly.
