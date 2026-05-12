export function buildWorkspaceWorkingFolderInstructions(workingRoot: string): string {
  return [
    'Workspace file policy:',
    '- You are running from the workspace root.',
    `- Suggested working folder: ${workingRoot}`,
    '- Use the suggested folder for new notes, reports, drafts, handoff files, or generated artifacts when it fits.',
    '- Edit existing project files in their natural locations.',
    '- Report created or modified files as workspace-relative paths only.',
    '- Do not report absolute paths or paths with "..".'
  ].join('\n')
}
