# Styling Rules

Use these rules when changing Tailwind classes, variants, tokens, or component styling.

## Semantic Tokens

- Prefer semantic tokens: `bg-background`, `text-foreground`, `text-muted-foreground`, `border`, `bg-primary`, `text-primary-foreground`.
- Avoid raw colors such as `bg-blue-500`, `text-green-600`, or `dark:bg-slate-900` for core UI.
- If a new status color is needed, add a named variant or semantic CSS variable instead of scattering raw colors.

## Layout Classes

- Use `gap-*` for spacing in flex/grid layouts.
- Avoid `space-x-*` and `space-y-*`; they are less flexible when layout changes.
- Use `size-*` when width and height are equal.
- Use `truncate` instead of manually combining overflow/text-overflow/whitespace classes.

## Component Styling

- Use built-in component variants first.
- Use `className` primarily for layout and local sizing.
- Use `cn()` for conditional classes.
- Avoid manual `z-index` on overlay components; let Dialog, Sheet, Popover, and Tooltip manage stacking.
- Avoid broad global CSS changes unless the work is explicitly about theming.

## Ordinus Fit

- Keep styling calm and operational.
- Prefer clear state hierarchy over decorative effects.
- Do not add gradients, glow, or texture just because the screen feels empty.
