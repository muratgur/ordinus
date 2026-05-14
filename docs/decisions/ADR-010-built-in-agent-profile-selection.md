# ADR-010: Make Built-In Profiles The Default Agent Creation Path

## Status

Accepted

## Date

2026-05-14

## Context

Ordinus agents are roles that users assign to real workspace work. The current agent creation flow
starts from a small dialog where the user describes the desired agent and reviews an AI-generated
draft. That works for a small number of agents, but Ordinus is adding a larger built-in profile
library with roughly 100 initial profiles and room to grow.

Most users should be able to start from a prepared profile instead of writing agent behavior from
scratch. At the same time, Ordinus must preserve user control: selecting a profile should not create
an agent immediately. The user should be able to inspect the profile, turn it into an editable draft,
review the final instructions and runtime choices, and then create the agent.

The profile library also contains long instruction text. Showing category navigation, profile cards,
full instructions, and the final edit form in one fixed three-column dialog would make the surface
too dense and hard to read.

Built-in profiles are product content that will change over time. They need to be easy to edit,
review in pull requests, package with the app, and render as readable text. They should not be
confused with user-created agents, which are durable local app state.

## Decision

Make built-in profiles the default starting point when the user chooses to add an agent.

The agent creation surface opens as one large, consistent creation workspace. It defaults to the
built-in profile catalog rather than asking the user to choose between equal creation modes.

Store built-in profiles as readable Markdown resources under `app/resources/profiles`. The app treats
these files as read-only bundled product content. SQLite stores user-created agents and future
user-specific state, not the built-in catalog itself.

The first screen contains:

- A header for adding an agent.
- Search for profile names, summaries, roles, and tags.
- Secondary actions for `Describe with AI` and `Blank agent`.
- A left category list for browsing the built-in profile library.
- A main profile card grid for the current category and search result.

`Describe with AI` and `Blank agent` are not tabs. They are secondary starting actions from the
profile catalog. The product model is:

```text
Add agent
  default: choose a built-in profile
  alternate: describe with AI
  alternate: start from a blank draft

All paths end in:
Review agent -> Create agent
```

Profile cards stay compact. They should show only enough information to help the user scan the
catalog:

- Profile name.
- Short summary or role.
- Category and tags.
- Optional recommendation or popularity marker.

Profile cards must not show suggested workspace access, sandbox, or other permission-like runtime
choices. Those choices are contextual, can distract from profile selection, and belong in the final
review step where the user is intentionally creating an agent.

When the user selects a profile card, Ordinus opens a wide detail drawer from the right side of the
creation surface. The drawer is for inspection, not editing. It shows:

- Profile name.
- Role or concise purpose.
- Full instructions preview.
- A primary `Use profile` action.

When the user chooses `Use profile`, Ordinus creates an editable draft from the profile and moves to
the shared `Review agent` step. The same `Review agent` step is used for profile-based drafts,
AI-generated drafts, and blank drafts.

The `Review agent` step owns editable fields:

- Name.
- Role.
- Instructions.
- Provider and model.
- Sandbox/access.
- Enabled state.

Creating an agent happens only from the review step.

## Alternatives Considered

### Store Built-In Profiles In SQLite

- Pros: Querying, sorting, and filtering can use the existing local database.
- Cons: Profile content changes would require seed data, migrations, update logic, or reset behavior
  for data that is not user-owned state. Long Markdown instructions are harder to review and maintain
  when embedded in database bootstrap code.
- Rejected: Built-in profiles are versioned application resources, not durable user data.

### Three Equal Creation Tabs

- Pros: Simple structure: profiles, AI description, and blank form are all available at the top.
- Cons: Profiles are a large catalog while AI and blank creation are lightweight actions. Treating
  them as equal tabs makes the information architecture feel uneven.
- Rejected: Built-in profiles should be the default surface, with AI and blank as alternate starting
  actions.

### Permanent Three-Column Catalog With Preview

- Pros: Categories, profile list, and preview are visible at the same time.
- Cons: Long instructions make the preview column cramped. A persistent preview competes with the
  profile grid and reduces scanning space.
- Rejected: Use a wide on-demand detail drawer so the catalog stays readable and long instructions
  have enough room.

### Create Directly From A Profile Card

- Pros: Fastest path for experienced users.
- Cons: Violates the product principle that the user stays in control of important actions. Users
  may need to adjust instructions, runtime, sandbox, or enabled state before creation.
- Rejected: Profile selection creates an editable draft, not a saved agent.

### Show Suggested Access On Profile Cards

- Pros: Communicates that different profiles may imply different levels of local capability.
- Cons: Users cannot know the exact task context at profile browsing time, and permission-like
  labels add cognitive load before the user has chosen an agent role.
- Rejected: Access and sandbox choices belong in the final review step, not in the profile catalog.

## Consequences

- The most common path is fastest: users land directly in the built-in profile catalog.
- The catalog can scale to 100+ profiles through search, categories, and compact cards.
- Long profile instructions are readable without crowding the main catalog.
- Profile content remains easy to edit as text and review in version control.
- AI-assisted and blank creation remain available without making the first screen feel like a mode
  picker.
- All creation paths share one review step, which keeps validation, editing, runtime choices, and
  final creation behavior consistent.
- Profile browsing focuses on role fit rather than workspace access or provider details.
- Future profile metadata should support catalog search and filtering without forcing that metadata
  into every card.
- Database migrations are not needed when the built-in catalog content changes.

## Implementation Notes

- Built-in profile data lives under `app/resources/profiles`, grouped by category folders.
- Profile catalog discovery is directory-based. Adding a category folder or Markdown profile under
  `app/resources/profiles` should make it available after app restart or rebuild as long as the file
  passes validation. No database migration or hardcoded registry update should be required.
- Profile Markdown files should include frontmatter for stable ids, category, tags, summary, role,
  and optional recommendation metadata. The Markdown body is the long instruction/preview text.
- The main process should load and validate the read-only catalog, then expose it to the renderer
  through typed IPC. Renderer code should not read the filesystem directly.
- Instructions should be formatted for drawer readability, preferably with clear Markdown sections.
- Profile selection should not persist anything until the user confirms from `Review agent`.
- The creation surface should remain one consistent large dialog or creation workspace; it should not
  mix small popups, full-screen routes, and nested modal flows for different starting paths.
- The renderer should keep profile selection UI focused on catalog browsing. Provider, model,
  sandbox, and enabled controls remain in the shared review form.
- SQLite may later store user-specific profile state such as favorites, recently used profiles, or
  custom user-defined templates, but the shipped built-in profile catalog should remain resource
  backed.
