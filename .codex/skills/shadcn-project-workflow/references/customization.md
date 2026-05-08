# Customization Reference

Use this when changing Ordinus theme tokens or component variants.

## Theme Tokens

- `DESIGN.md` is the canonical source for token intent and naming.
- Global CSS variables live in `app/src/renderer/src/assets/main.css`.
- Tailwind token mapping lives in `app/tailwind.config.ts`.
- Prefer semantic tokens over raw Tailwind colors.
- When changing colors, radii, spacing, typography, or status variants, update implementation tokens to preserve the roles defined in `DESIGN.md`.

## Component Variants

- Add variants when a state or action repeats across the app.
- Keep variants named by product meaning and align them with `DESIGN.md` status language where relevant: `planned`, `running`, `blocked`, `attention`, `completed`, `failed`, `success`, `warning`, `destructive`, `secondary`.
- Avoid one-off style overrides that should be reusable.

## Local Ownership

shadcn components are copied source. Once added, they are part of the Ordinus codebase.

When modifying them:

- Keep the public API simple.
- Preserve accessibility behavior.
- Avoid breaking existing usages.
- Run typecheck, lint, and build.
