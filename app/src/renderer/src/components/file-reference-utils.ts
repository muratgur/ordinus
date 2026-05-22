import type { WorkboardRun } from '@shared/contracts'

export type FileReference = {
  path: string
  artifact: boolean
  changed: boolean
}

export type FileProvenanceKind = 'produced' | 'changed'

export type FileAgentAttribution = {
  agentName: string
  kind: FileProvenanceKind
  runCount: number
  latestRunId: string
  latestAt: string | null
}

export type RequestFileProvenance = {
  path: string
  inWorkFolder: boolean
  attributions: FileAgentAttribution[]
  lastTouchedAt: string | null
}

type AgentAccumulator = {
  agentName: string
  produced: boolean
  runIds: Set<string>
  latestRunId: string
  latestAt: string | null
}

type FileAccumulator = {
  path: string
  inWorkFolder: boolean
  byAgent: Map<string, AgentAccumulator>
}

export function getRequestFileProvenance(
  runs: WorkboardRun[],
  workingRoot: string
): RequestFileProvenance[] {
  const byPath = new Map<string, FileAccumulator>()
  const folderPrefix = `${normalizeFileReferenceKey(workingRoot).replace(/\/+$/, '')}/`

  function record(run: WorkboardRun, path: string, kind: FileProvenanceKind): void {
    const key = normalizeFileReferenceKey(path)
    const file: FileAccumulator = byPath.get(key) ?? {
      path,
      inWorkFolder: key.startsWith(folderPrefix),
      byAgent: new Map()
    }
    byPath.set(key, file)

    const agent: AgentAccumulator = file.byAgent.get(run.agentName) ?? {
      agentName: run.agentName,
      produced: false,
      runIds: new Set(),
      latestRunId: run.id,
      latestAt: run.completedAt
    }
    file.byAgent.set(run.agentName, agent)

    agent.produced = agent.produced || kind === 'produced'
    agent.runIds.add(run.id)
    if ((run.completedAt ?? '') >= (agent.latestAt ?? '')) {
      agent.latestRunId = run.id
      agent.latestAt = run.completedAt
    }
  }

  for (const run of runs) {
    for (const path of run.artifactRefs) {
      record(run, path, 'produced')
    }
    for (const path of run.changedFiles) {
      record(run, path, 'changed')
    }
  }

  const files: RequestFileProvenance[] = Array.from(byPath.values()).map((file) => {
    const attributions = Array.from(file.byAgent.values())
      .map(
        (agent): FileAgentAttribution => ({
          agentName: agent.agentName,
          kind: agent.produced ? 'produced' : 'changed',
          runCount: agent.runIds.size,
          latestRunId: agent.latestRunId,
          latestAt: agent.latestAt
        })
      )
      .sort(compareRecency)

    return {
      path: file.path,
      inWorkFolder: file.inWorkFolder,
      attributions,
      lastTouchedAt: attributions[0]?.latestAt ?? null
    }
  })

  return files.sort((left, right) =>
    (right.lastTouchedAt ?? '').localeCompare(left.lastTouchedAt ?? '')
  )
}

function compareRecency(
  left: { latestAt: string | null },
  right: { latestAt: string | null }
): number {
  return (right.latestAt ?? '').localeCompare(left.latestAt ?? '')
}

export function formatRelativeTime(value: string | null): string {
  if (!value) return ''
  const then = new Date(value).getTime()
  if (Number.isNaN(then)) return ''

  const diffMs = Date.now() - then
  if (diffMs < 60_000) return 'just now'

  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`

  return new Date(value).toLocaleDateString()
}

export function getFileReferences(artifactRefs: string[], changedFiles: string[]): FileReference[] {
  const files = new Map<string, FileReference>()

  for (const path of artifactRefs) {
    upsertFileReference(files, path, 'artifact')
  }

  for (const path of changedFiles) {
    upsertFileReference(files, path, 'changed')
  }

  return Array.from(files.values())
}

function upsertFileReference(
  files: Map<string, FileReference>,
  path: string,
  kind: 'artifact' | 'changed'
): void {
  const key = normalizeFileReferenceKey(path)
  const current = files.get(key) ?? { path, artifact: false, changed: false }

  files.set(key, {
    ...current,
    artifact: current.artifact || kind === 'artifact',
    changed: current.changed || kind === 'changed'
  })
}

function normalizeFileReferenceKey(path: string): string {
  return path.replaceAll('\\', '/')
}
