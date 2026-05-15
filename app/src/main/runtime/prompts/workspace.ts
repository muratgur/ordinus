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
