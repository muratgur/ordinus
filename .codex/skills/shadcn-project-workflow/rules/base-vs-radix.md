# Base vs Radix Notes

Use this when shadcn project context reports a primitive base or when examples do not match installed component APIs.

## Rule

Always inspect the installed component before assuming its API.

## Radix-style Components

- Common trigger composition uses `asChild`.
- Components often wrap Radix primitives.
- Accessibility requirements such as dialog titles still apply.

## Base-style Components

- Some examples may use `render` instead of `asChild`.
- Do not mix Base UI examples into Radix components without checking the file.

## Ordinus Guidance

- This project currently uses local shadcn-style components and Radix-compatible patterns.
- If official CLI components are added, read the generated files before using props from external examples.
