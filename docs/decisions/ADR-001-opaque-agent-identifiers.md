# ADR-001: Use Opaque Stable Agent Identifiers

## Status

Accepted

## Date

2026-05-08

## Context

Ordinus creates local agents that need durable identity across database records, filesystem storage, runtime state, and future provider sessions. Agents also have user-facing names that can be written in any language, including Turkish, Russian, Chinese, Arabic, and other scripts.

The first implementation derived `agent.id` from the generated agent name by slugifying it. That made the ID readable for English names, but it caused problems for non-ASCII names because characters could be dropped or transliterated inconsistently. For example, Turkish, Russian, Chinese, or Arabic names can produce lossy or misleading folder names.

Agent names are also editable product text. If a filesystem path is tied to a display name, renaming an agent can accidentally imply a folder migration or break references.

## Decision

Use opaque, stable, ASCII-safe IDs for agents.

New agent IDs use this shape:

```text
agt-<uuid>
```

The agent ID is the source for technical identity and filesystem location:

```text
<userData>/agents/<agent-id>/skills/
```

The user-facing `name` remains separate and can contain any language or script. Renaming an agent changes only the display name, not the ID or folder path.

We do not need backward compatibility for the current prototype data. Existing local agent rows may be deleted during this early development phase.

## Alternatives Considered

### Slug From Agent Name

- Pros: Human-readable folders for English names.
- Cons: Loses or distorts non-ASCII characters, requires language-specific transliteration, can collide, and couples display text to technical identity.
- Rejected: Ordinus should support international users without making identity depend on user language.

### Slug With Transliteration

- Pros: More readable than opaque IDs for some languages.
- Cons: Transliteration quality varies by language, can still collide, and adds complexity that does not improve product behavior.
- Rejected: Folder names do not need to be human-readable because the UI shows the agent name.

### Hybrid ID Plus Slug

Example:

```text
agt-<uuid>-ceo
```

- Pros: Keeps uniqueness while adding a readable hint.
- Cons: Still requires deciding what to do when names change and still introduces language-specific slug concerns.
- Rejected for now: The simpler opaque ID is safer and easier to maintain.

## Consequences

- Agent identity is stable across renames.
- Agent folder paths are cross-platform safe.
- Agent names can use any language or script.
- Filesystem storage can be derived from `agent.id` without storing extra path fields in the database.
- The UI must show display names from the database instead of relying on folder names for readability.
- Debugging by folder name is less human-readable, but the ID can be searched in the database and logs.

## Implementation Notes

- `agent.id` is generated independently from `agent.name`.
- Agent folders are resolved under Electron `userData`, not under the app install directory or project workspace.
- Skill content remains filesystem-owned under the agent folder.
- The database stores durable product state, not skill file contents or derived filesystem paths.
