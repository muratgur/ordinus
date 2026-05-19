# Composition Rules

Use these rules when composing shadcn-style UI components.

## General

- Use existing components before custom markup.
- Use full component composition: for cards, prefer `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, and `CardFooter` when relevant.
- Use `Badge` for compact statuses and labels.
- Use `Separator` instead of ad hoc border dividers when the component is installed.
- Use `Skeleton` for loading placeholders when installed.
- Use `Alert` for callouts when installed.

## Accessibility

- Dialogs, sheets, and drawers need accessible titles.
- If a title should not be visible, use a screen-reader-only title.
- Avatars need fallback content.
- Interactive controls need visible focus behavior and disabled states.

## Structure

- Keep grouped primitives inside their required container: tabs triggers inside a tabs list, select items inside the appropriate select content/group, command items inside command groups.
- Prefer `asChild` for Radix trigger composition when the installed component supports it.
- Do not dump unrelated concerns into one large component; compose small product panels around primitives.

## Ordinus Fit

- Use the component vocabulary in `DESIGN.md` when composing product panels: workspace header, command bar, provider card, agent run card, task row, activity timeline, code surface, attention banner, and setup panel.
- Prefer panels that reveal work status, activity, outputs, and next actions.
- Avoid nested card-heavy dashboards.
- Do not build marketing sections unless the user explicitly asks for product marketing UI.
