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
    'Workspace file policy:',
    '- You are running from the workspace root.',
    `- Suggested working folder: ${workingRoot}`,
    '- Use the suggested folder for new notes, reports, drafts, handoff files, or generated artifacts when it fits.',
    '- Edit existing project files in their natural locations.',
    '- Report created or modified files as workspace-relative paths only.',
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
