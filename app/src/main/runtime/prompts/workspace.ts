import { join } from 'node:path'

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

export function buildAgentPrivateFolderInstructions(agentHomePath: string): string {
  const skillsPath = join(agentHomePath, 'skills')

  return [
    'Agent private folder policy:',
    `- Agent private folder: ${agentHomePath}`,
    `- Agent skills folder: ${skillsPath}`,
    '- Before answering each turn, check whether the skills folder exists.',
    '- If it exists, inspect immediate child skill folders and read each SKILL.md frontmatter.',
    '- Do not assume no skill applies until you have checked the available skill frontmatter.',
    '- If a skill description matches the current user request or needed context, read that full SKILL.md before answering.',
    '- Use only skills that match the current task.',
    '- Do not ask the user to provide information that is already available in a matching skill.',
    '- Files in the agent private folder are not workspace artifacts. Do not report them as created or modified workspace files.'
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
