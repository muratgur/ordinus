const markdownDocumentPolicy = [
  'Markdown document policy:',
  '- For new user-facing Markdown documents you create, start the file with short, human-readable YAML frontmatter.',
  '- Use these fields when they fit: title, summary, created_by, created_at, project, upstream, tags.',
  '- Keep frontmatter concise and avoid internal run IDs unless the user specifically needs them.',
  '- If the new Markdown document uses upstream sources, add a final "## References" section.',
  '- In References, use Obsidian wikilinks for Markdown sources, such as [[source-note]], and workspace-relative paths in backticks for non-Markdown sources.',
  '- Apply this only to new Markdown outputs such as notes, reports, plans, handoff docs, or analyses.',
  '- Do not add Ordinus frontmatter to existing project Markdown files, source files, logs, generated exports, binary artifacts, or non-Markdown files unless requested.',
  '- When inspecting Markdown files, read frontmatter and headings first to decide whether the full body is relevant.'
]

export function buildWorkspaceWorkingFolderInstructions(workingRoot: string): string {
  return [
    // ADR-031: the working folder is a hard boundary, not a suggestion. The CLI
    // runs with this folder as its current directory; the agent must stay inside
    // it and must not reach into neighbouring projects elsewhere in the workspace.
    'Workspace file policy:',
    `- You are working inside this folder, which is your current working directory: ${workingRoot}`,
    '- Stay within this folder. Do not read, write, or modify files outside it.',
    '- Create all new files, notes, reports, drafts, handoff files, and generated artifacts inside this folder.',
    '- The only exceptions are your agent private folder and any external directories explicitly listed below.',
    '- Report created or modified files as paths relative to this folder.',
    '- Do not report absolute paths or paths with "..".',
    ...markdownDocumentPolicy
  ].join('\n')
}

// ADR-040: skill discovery is no longer prompted here. Claude and Gemini
// discover skills natively (symlinks into their discovery roots); Codex gets an
// explicit frontmatter inventory via buildSkillInventoryInstructions.
export function buildAgentPrivateFolderInstructions(agentHomePath: string): string {
  return [
    'Agent private folder policy:',
    `- Agent private folder: ${agentHomePath}`,
    '- Files in the agent private folder are not workspace artifacts. Do not report them as created or modified workspace files.'
  ].join('\n')
}

export type PromptSkill = {
  name: string
  description: string
  skillPath: string
}

// ADR-040: stale-session fix — an open session learns only what CHANGED since
// its inventory was announced. Empty diff → empty string → zero prompt cost.
export function buildSkillDeltaInstructions(input: {
  added: PromptSkill[]
  updated: PromptSkill[]
  removedIds: string[]
}): string {
  if (input.added.length + input.updated.length + input.removedIds.length === 0) {
    return ''
  }
  return [
    'Skill changes since this conversation started:',
    ...input.added.map(
      (skill) => `- New skill: ${skill.name}: ${skill.description} (file: ${skill.skillPath})`
    ),
    ...input.updated.map(
      (skill) =>
        `- Updated skill: ${skill.name}: ${skill.description} (file: ${skill.skillPath}) — re-read it before applying.`
    ),
    ...input.removedIds.map((id) => `- Removed skill: ${id} — it is no longer available.`),
    '- Apply the usual rule: read a skill file only when it matches the current task.'
  ].join('\n')
}

// ADR-040: Codex cannot discover skills outside its fixed roots, so the prompt
// carries the frontmatter inventory instead. Mirrors the CLIs' progressive
// disclosure: bodies are read only when a skill matches the task.
export function buildSkillInventoryInstructions(skills: PromptSkill[]): string {
  if (skills.length === 0) {
    return ''
  }
  return [
    'Agent skills available this conversation:',
    ...skills.map((skill) => `- ${skill.name}: ${skill.description} (file: ${skill.skillPath})`),
    '- If a skill matches the current request, read its file and follow it before answering.',
    '- Do not read skill files that do not match the current task.',
    '- Do not ask the user for information that a matching skill already provides.'
  ].join('\n')
}

export function buildExtraDirectoriesInstructions(extraDirectories: string[]): string {
  if (extraDirectories.length === 0) {
    return ''
  }
  return [
    'External directories policy:',
    '- The following directories are outside the workspace but you have read and write access to them:',
    ...extraDirectories.map((dir) => `  - ${dir}`),
    '- Use these directories only when the user references them or when the task requires the files there.',
    '- Files in these directories are not workspace artifacts. Do not report them as created or modified workspace files, and do not include them in artifact references.',
    '- Do not assume these paths are part of the workspace. Always refer to them by their absolute paths.'
  ].join('\n')
}
