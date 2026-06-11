// ADR-037 — per-request work digest.
//
// A deterministic, engine-written Markdown record of completed Work Items,
// kept at `<request working folder>/digest.md`. It serves two readers at
// once:
//   - the user, as a "what happened in this request" log they can open like
//     any other workspace file, and
//   - agents, as a discovery index: the run ids listed here are the keys the
//     `get_work_run_result` MCP tool accepts for fetching full output of
//     prior work the agent has no dependency edge to.
//
// Entries are appended from the result summary the agent already produced —
// never an extra LLM call — so the cost is zero tokens and the format never
// drifts. Full result content stays database-backed (ADR-030); the digest
// holds summaries and pointers only.

import { appendFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const digestFileName = 'digest.md'

const digestHeader = `# Work digest

A running record of completed Work Items in this Work Request. Each entry
lists the Work Run id, the agent, and the result summary. The full output of
any run can be fetched with the \`get_work_run_result\` tool using the run id.
`

export type RequestDigestEntry = {
  runId: string
  title: string
  agentName: string
  agentRole: string
  resultSummary: string
  artifactRefs: string[]
  changedFiles: string[]
  completedAt: string
}

export function appendRequestDigestEntry(input: {
  workspaceRoot: string
  workingRoot: string
  entry: RequestDigestEntry
}): void {
  const digestPath = join(input.workspaceRoot, input.workingRoot, digestFileName)
  const lines = [
    '',
    `## ${input.entry.title}`,
    '',
    `- Run: \`${input.entry.runId}\``,
    `- Agent: ${input.entry.agentName} (${input.entry.agentRole})`,
    `- Completed: ${input.entry.completedAt}`,
    ...(input.entry.artifactRefs.length > 0
      ? [`- Artifacts: ${input.entry.artifactRefs.join(', ')}`]
      : []),
    ...(input.entry.changedFiles.length > 0
      ? [`- Changed files: ${input.entry.changedFiles.join(', ')}`]
      : []),
    '',
    input.entry.resultSummary.trim() || '(no summary recorded)',
    ''
  ]

  const body = lines.join('\n')
  if (existsSync(digestPath)) {
    appendFileSync(digestPath, body, 'utf8')
  } else {
    appendFileSync(digestPath, `${digestHeader}${body}`, 'utf8')
  }
}
