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

Built-in profiles are not agents. They are read-only templates that can produce an editable agent
draft. A profile has a stable catalog identity such as `corporate/project-steward`, while a
user-created agent has an opaque runtime identity such as `agt-<uuid>`. The two identity namespaces
must remain separate:

- `profile.id` identifies a bundled profile in the catalog.
- `agent.id` identifies a durable user-created agent in SQLite, app-owned folders, conversations,
  work runs, and future runtime state.
- Selecting or inspecting a profile must not create an agent, reserve an agent id, create an
  agent-owned folder, or write to SQLite.
- Creating an agent from a profile must call the same create path as all other agent creation flows,
  and that path must generate a new `agt-<uuid>` id in the main process.
- `profile.id` must never be copied into `agent.id`.

The agent creation flow must remain compatible with agents that already exist in the local database.
Existing agents continue to be listed and managed from SQLite. The profile catalog is an additional
starting surface, not a replacement for the user's saved agents.

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

Creating an agent happens only from the review step. If the review step exposes enabled state, the
create contract must persist the reviewed value. New creation paths should default enabled to `true`
only when the user has not been offered an enabled-state control.

Agent names are user-facing labels, not identifiers. The create path should reject duplicate active
or disabled agent names using the same normalized-name rule used when updating agent settings, or
the review step should require the user to choose a distinct name before creation. Duplicate names do
not break the opaque id model, but they make the agent list and assignment surfaces harder to scan.

## Alternatives Considered

### Store Built-In Profiles In SQLite

- Pros: Querying, sorting, and filtering can use the existing local database.
- Cons: Profile content changes would require seed data, migrations, update logic, or reset behavior
  for data that is not user-owned state. Long Markdown instructions are harder to review and maintain
  when embedded in database bootstrap code.
- Rejected: Built-in profiles are versioned application resources, not durable user data.

### Use Profile Ids As Agent Ids

- Pros: Makes it easy to see which built-in profile an agent originally came from.
- Cons: Couples bundled product content to durable user state, prevents multiple agents from the
  same profile, breaks the opaque `agt-<uuid>` identity model, and makes profile catalog changes
  risky for saved agents, folders, conversations, and work runs.
- Rejected: Profile identity and agent identity must remain separate namespaces.

### Seed Built-In Profiles As Preinstalled Agents

- Pros: Users would see useful agents immediately after install.
- Cons: Confuses read-only product templates with user-created durable state, creates migration and
  deletion questions when bundled profiles change, and risks cluttering agent management with agents
  the user did not explicitly create.
- Rejected: Built-in profiles remain catalog entries until the user creates an agent from one.

### Allow Duplicate Agent Names On Create

- Pros: Simple persistence behavior because `agent.id` already guarantees technical uniqueness.
- Cons: Agent pickers, work assignment, conversations, and settings become ambiguous when two saved
  agents have the same display name.
- Rejected: Agent creation should use the same duplicate-name protection as settings updates.

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
- Existing saved agents continue to work because profile catalog data is not seeded into or merged
  with the `agents` table.
- Multiple agents may be created from the same built-in profile over time, but each created agent
  receives its own opaque `agt-<uuid>` id and durable state.
- Duplicate display names are treated as a user-experience problem even though opaque ids prevent
  technical collisions.

## Implementation Notes

- Built-in profile data lives under `app/resources/profiles`, grouped by category folders.
- Existing profile drafts under `docs/profiles` are source material for product content, but the
  runtime catalog should be packaged from `app/resources/profiles`.
- Profile catalog discovery is directory-based. Adding a category folder or Markdown profile under
  `app/resources/profiles` should make it available after app restart or rebuild as long as the file
  passes validation. No database migration or hardcoded registry update should be required.
- Profile Markdown files should include frontmatter for stable ids, category, tags, role,
  capabilities, and optional recommendation metadata. The Markdown body is the long instruction text.
- Profile ids should use a catalog namespace such as `<category>/<profile-slug>` and remain stable
  across copy edits. They should not use the `agt-` prefix.
- The main process should load and validate the read-only catalog, then expose it to the renderer
  through typed IPC. Renderer code should not read the filesystem directly.
- Instructions should be formatted for drawer readability, preferably with clear Markdown sections.
- Profile selection should not persist anything until the user confirms from `Review agent`.
- Creating from a profile should transform profile metadata into an `AgentDraft`; persistence starts
  only when the reviewed draft is submitted through the agent create IPC handler.
- The main-process create path should generate the agent id and enforce duplicate-name validation.
- The creation surface should remain one consistent large dialog or creation workspace; it should not
  mix small popups, full-screen routes, and nested modal flows for different starting paths.
- The renderer should keep profile selection UI focused on catalog browsing. Provider, model,
  sandbox, and enabled controls remain in the shared review form.
- SQLite may later store user-specific profile state such as favorites, recently used profiles, or
  custom user-defined templates, but the shipped built-in profile catalog should remain resource
  backed.
