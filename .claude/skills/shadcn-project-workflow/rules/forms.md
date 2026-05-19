# Forms Rules

Use these rules when adding settings, onboarding, provider setup, agent creation, or configuration forms.

## Layout

- Prefer installed shadcn form primitives when available.
- Group related controls clearly.
- Use labels for every input.
- Use descriptions for non-obvious fields.
- Use `gap-*` for form spacing.

## Controls

- Use `Input`, `Textarea`, `Select`, `Switch`, `Checkbox`, `RadioGroup`, `Slider`, or `ToggleGroup` when installed and appropriate.
- For 2-5 mutually exclusive visual choices, prefer `ToggleGroup` over manually styled buttons.
- For independent on/off choices, use `Switch` or `Checkbox`, not toggle buttons.

## Validation

- Use `aria-invalid` on invalid controls.
- Keep validation messages close to the field.
- Do not rely on color alone to show an invalid state.

## Ordinus Fit

- Forms should be short and operational.
- Avoid asking for configuration before the user needs it.
- Use progressive setup for provider/runtime screens.
