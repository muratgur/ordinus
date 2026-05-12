# ADR-008: Use One Workspace Root With Module Working Folders

## Status

Accepted

## Date

2026-05-12

## Context

Ordinus coordinates agents around user-visible software work. The workspace folder exists so agent
work, generated files, handoffs, and future module outputs have one clear project boundary.

The earlier Workboard artifact decision placed Workboard outputs under the selected workspace. That
was directionally correct, but the product model still had too many workspace-like concepts:

- The selected workspace root in app setup.
- Agent-level workspace roots.
- Work Request and Work Run workspace snapshots.
- App-owned provider paths under Electron `userData`.
- User-visible artifact paths inside the workspace.

Those concepts are easy to confuse. If each agent or module owns a separate absolute working folder,
Ordinus becomes harder to explain and harder to control. If the user moves the whole workspace
folder and selects its new location later, internal references should not break. That requires all
workspace-owned file references to be relative to one root.

At the same time, agents should not create files randomly across the root. Each product module needs
a natural place for its own work. That place should organize files, not restrict what the agent can
read or modify when the task legitimately needs other workspace files.

## Decision

Use one workspace root and module-specific workspace-relative working folders.

`WorkspaceRoot` is the single absolute filesystem path selected by the user and stored by Ordinus as
application configuration. It is the project boundary for user-visible agent work. Provider runtime
execution receives this absolute path from the Electron main process as the CLI working directory or
provider-specific workspace argument.

Every durable user-visible file reference produced by agents or modules must be stored and reported
as a path relative to `WorkspaceRoot`. Ordinus should not persist absolute artifact paths for
workspace-owned files.

Modules define a `SuggestedModuleWorkingFolder`: a workspace-relative folder that gives the agent a
good default place for new notes, reports, handoff files, generated artifacts, and other supporting
files for that module context. This folder is included in the agent prompt. It is not an access
restriction.

Agents may read or modify other files inside the workspace when the task requires it. Existing
project files should be changed in their natural locations. New supporting files should usually be
placed under the suggested module working folder when that fits the work.

## Module Working Folders

Module folder names should be lowercase and simple:

```text
conversations/<conversation-slug-id>/
workboard/<request-slug-id>/
schedules/<scheduled-job-slug-id>/
```

The module path policy should be centralized behind one main-process helper or service. Callers
should ask that policy for a module working folder instead of assembling these paths inline. If a
future product decision changes `conversations/` to another folder name, implementation should
change in one path policy location rather than across runtime prompts, directory creation, database
records, and UI reveal behavior.

Conversation work should be grouped by conversation, not by every turn. A conversation may have many
turns, but it should still have one natural working folder:

```text
conversations/<conversation-slug-id>/
```

Workboard work should be grouped by Work Request:

```text
workboard/<request-slug-id>/
```

Agents may create subfolders inside the suggested folder when that is useful, but Ordinus should not
force a fixed agent-specific subfolder for every run.

## Provider Runtime Contract

Provider runtime has three different path categories:

### Workspace Root

The Electron main process passes the absolute `WorkspaceRoot` to the provider CLI as the execution
workspace. Depending on the provider, this may be process `cwd`, a workspace flag such as `-C`, or
both. Renderer code must not pass arbitrary shell commands or unchecked absolute paths.

### Suggested Module Working Folder

The suggested folder is passed in the prompt as a workspace-relative path:

```text
Suggested working folder:
workboard/add-login-flow-a1b2c3/
```

Prompt guidance should say:

```text
You are running from the workspace root.
Use the suggested working folder for new notes, reports, drafts, handoff files, or generated
artifacts when it fits the task.
If the task requires changing existing project files, edit them in their natural locations.
Report every created or modified file using workspace-relative paths only.
Do not return absolute paths.
```

The provider CLI should not normally be executed with the suggested module folder as `cwd`, because
agents need the workspace root to discover project files, package manifests, git state, and other
project-level context.

### Internal Provider Paths

Internal provider paths may remain under Electron `userData`. These include:

- SQLite database state.
- Provider auth and config directories.
- Runtime cache directories.
- Event logs and diagnostic logs.
- Transport files such as output schemas, system prompt files, or last-message output files.

Provider adapters may pass these internal paths to CLIs when the provider requires them. These paths
are not workspace artifacts and must not be reported as `artifactRefs` or `changedFiles`.

## Handoffs Between Work Items

Dependent work should receive upstream context as compact summaries plus workspace-relative file
references. The dependent agent can read referenced files from the workspace when it needs full
detail.

The default handoff should include:

- The upstream work title and assigned agent.
- A concise result summary.
- Workspace-relative artifact references.
- Workspace-relative changed file references.

Full upstream text may still be included when the output is short, when the dependent task cannot
reasonably read files, or when a provider limitation requires inline context. That should be the
exception, not the default.

## Alternatives Considered

### Multiple Workspace Profiles

- Pros: Clear separation between projects.
- Cons: Users and agents would need to reason about which agent belongs to which workspace profile.
- Rejected: Ordinus should present one current workspace boundary, not a profile manager.

### Per-Agent Absolute Folders

- Pros: Gives each agent a clear private location.
- Cons: Turns agents into separate filesystem configuration units and makes shared work harder to
  explain.
- Rejected: Agents are roles working inside the current workspace, not owners of separate absolute
  roots.

### Hidden `.ordinus/` Workspace Folder

- Pros: Keeps Ordinus files grouped under one hidden directory.
- Cons: The selected workspace already exists for agent-visible work, and hiding user-visible
  artifacts makes them harder to inspect.
- Rejected: Module folders such as `conversations/` and `workboard/` should live directly under the
  workspace root.

### Execute Provider CLIs From Module Subfolders

- Pros: New files naturally appear under the module folder.
- Cons: Agents lose the project root as their natural context and may need fragile `../..` paths to
  inspect or modify the project.
- Rejected as the default: execute from the workspace root and give the module folder in the prompt.

### Create A Folder For Every Conversation Turn

- Pros: Very granular file ownership.
- Cons: Long conversations would create many low-value folders.
- Rejected: conversation files should be grouped by conversation unless a later module-specific
  workflow needs finer structure.

## Consequences

- The user has one understandable workspace boundary.
- The workspace can be moved as a folder and reselected later without breaking relative references.
- User-visible agent files are inspectable under module folders in the workspace.
- Existing project files can still be changed in their natural locations.
- App-owned state stays in `userData` and remains separate from user-visible workspace artifacts.
- Future modules can add their own suggested working folders through the centralized path policy.
- Runtime prompts and completion contracts must consistently require workspace-relative file
  references.

## Implementation Notes

- This ADR records the target product and architecture policy. It does not require this commit to
  change code, migrations, or runtime behavior.
- Future implementation should simplify or replace agent-level and run-level absolute workspace
  fields such as `agents.workspaceRoot`, `work_requests.workspaceRoot`, and `work_runs.workspaceRoot`
  where they conflict with the single-root model.
- Workspace path generation should move into a central main-process policy/helper before more
  modules add their own folder layouts.
- Renderer code should not create module working folders directly.
- Main process should validate workspace-relative paths before revealing or trusting provider
  reported files.
- Provider logs and internal transport files may stay in AppData, but user-facing artifacts and
  changed-file references should point only to workspace-relative paths.
