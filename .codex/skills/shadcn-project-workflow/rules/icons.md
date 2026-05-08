# Icon Rules

Use these rules when adding or changing icons in Ordinus UI.

## Library

- Use `lucide-react` unless `components.json` says otherwise.
- Import icons directly by name.
- Do not implement common icons by hand.

## Usage

- Icons in buttons should support the action label, not replace clear text unless the action is universally recognizable.
- Icon-only buttons need accessible labels or titles.
- Keep icon sizes consistent with the component API and existing local components.
- Use `size-*` only when local components expect explicit icon sizing.

## Ordinus Fit

- Prefer practical icons for actions: refresh, open, search, play, pause, stop, settings, folder, database.
- Avoid decorative icons that do not clarify state or action.
