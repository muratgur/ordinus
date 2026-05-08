# Customization Reference

Use this when changing Ordinus theme tokens or component variants.

## Theme Tokens

- Global CSS variables live in `app/src/renderer/src/assets/main.css`.
- Tailwind token mapping lives in `app/tailwind.config.ts`.
- Prefer semantic tokens over raw Tailwind colors.

## Component Variants

- Add variants when a state or action repeats across the app.
- Keep variants named by product meaning: `success`, `warning`, `destructive`, `secondary`.
- Avoid one-off style overrides that should be reusable.

## Local Ownership

shadcn components are copied source. Once added, they are part of the Ordinus codebase.

When modifying them:

- Keep the public API simple.
- Preserve accessibility behavior.
- Avoid breaking existing usages.
- Run typecheck, lint, and build.
