export type AgentProfileInstructionSections = {
  archetypalIdentity: string
  roleAndSocialFunction: string
  personalityTraits: string[]
  communicationTone: string
  strengths: string[]
  boundaries: string
  relationshipWithOtherAgents: string
}

export function renderAgentProfileInstructions({
  name,
  sections
}: {
  name: string
  sections: AgentProfileInstructionSections
}): string {
  return [
    `# ${cleanSectionText(name) || 'Agent'}`,
    '',
    '## Archetypal Identity',
    '',
    cleanSectionText(sections.archetypalIdentity),
    '',
    '## Role and Social Function',
    '',
    cleanSectionText(sections.roleAndSocialFunction),
    '',
    '## Personality Traits',
    '',
    renderList(sections.personalityTraits),
    '',
    '## Communication Tone',
    '',
    cleanSectionText(sections.communicationTone),
    '',
    '## Strengths',
    '',
    renderList(sections.strengths),
    '',
    '## Boundaries',
    '',
    cleanSectionText(sections.boundaries),
    '',
    '## Relationship with Other Agents',
    '',
    cleanSectionText(sections.relationshipWithOtherAgents)
  ].join('\n')
}

function renderList(items: string[]): string {
  return items.map((item) => `- ${cleanSectionText(item)}`).join('\n')
}

function cleanSectionText(value: string): string {
  return value.trim().replace(/\n{3,}/g, '\n\n')
}
