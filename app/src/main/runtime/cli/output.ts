export function firstLine(value: string): string {
  return (
    value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? ''
  )
}

export function extractJsonObject(value: string): string {
  const trimmed = value.trim()
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed
  }

  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('CLI output did not contain a valid JSON object.')
  }

  return trimmed.slice(start, end + 1)
}

export function parseJsonFromCliOutput(value: string): unknown {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error('CLI output was empty.')
  }

  try {
    return JSON.parse(trimmed)
  } catch {
    // Some CLIs wrap the requested JSON in a Markdown code fence.
  }

  const fencedJson = extractFencedJson(trimmed)
  if (fencedJson) {
    try {
      return JSON.parse(fencedJson)
    } catch {
      // Fall back to the more permissive extraction paths below.
    }
  }

  try {
    return JSON.parse(extractJsonObject(trimmed))
  } catch {
    // Some CLIs print JSONL diagnostics. Prefer the last parseable JSON line as a fallback.
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  for (const line of [...lines].reverse()) {
    try {
      return JSON.parse(line)
    } catch {
      continue
    }
  }

  return JSON.parse(extractJsonObject(trimmed))
}

function extractFencedJson(value: string): string {
  const match = value.match(/^```(?:json|JSON)?\s*\r?\n([\s\S]*?)\r?\n```$/)
  return match ? match[1].trim() : ''
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
