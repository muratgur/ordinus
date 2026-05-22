export type DocumentFrontmatter = {
  title: string
  summary: string
  createdBy: string
  createdAt: string
  project: string
  upstream: string[]
  tags: string[]
  extra: Array<{ key: string; value: string }>
}

export type ParsedMarkdownDocument = {
  frontmatter: DocumentFrontmatter | null
  body: string
}

const knownScalarKeys: Record<string, keyof DocumentFrontmatter> = {
  title: 'title',
  summary: 'summary',
  created_by: 'createdBy',
  created_at: 'createdAt',
  project: 'project'
}

const knownListKeys = new Set(['upstream', 'tags'])

/**
 * Splits an agent-produced Markdown document into its YAML frontmatter and body.
 * A malformed or absent frontmatter block degrades to `{ frontmatter: null, body }`
 * so the viewer can still render the document.
 */
export function parseMarkdownDocument(raw: string): ParsedMarkdownDocument {
  const text = raw.replace(/^\uFEFF/, '')
  if (!/^---\r?\n/.test(text)) {
    return { frontmatter: null, body: text }
  }

  const closing = text.match(/\r?\n---[ \t]*(\r?\n|$)/)
  if (!closing || closing.index === undefined) {
    return { frontmatter: null, body: text }
  }

  const blockStart = text.indexOf('\n') + 1
  const block = text.slice(blockStart, closing.index)
  const body = text.slice(closing.index + closing[0].length)

  const frontmatter = parseFrontmatterBlock(block)
  return { frontmatter, body }
}

function parseFrontmatterBlock(block: string): DocumentFrontmatter | null {
  const lines = block.split(/\r?\n/)
  const scalars = new Map<string, string>()
  const lists = new Map<string, string[]>()

  let activeListKey = ''
  let parsedAny = false

  for (const line of lines) {
    if (!line.trim()) continue

    const listItem = line.match(/^[ \t]+-[ \t]*(.*)$/)
    if (listItem && activeListKey) {
      lists.get(activeListKey)?.push(stripScalar(listItem[1]))
      parsedAny = true
      continue
    }

    const entry = line.match(/^([A-Za-z0-9_-]+):[ \t]*(.*)$/)
    if (!entry) {
      return null
    }

    const key = entry[1].toLowerCase()
    const value = entry[2]
    parsedAny = true

    if (value.trim()) {
      scalars.set(key, stripScalar(value))
      activeListKey = ''
    } else {
      lists.set(key, [])
      activeListKey = key
    }
  }

  if (!parsedAny) {
    return null
  }

  const extra: Array<{ key: string; value: string }> = []
  for (const [key, value] of scalars) {
    if (!knownScalarKeys[key]) {
      extra.push({ key, value })
    }
  }

  return {
    title: scalars.get('title') ?? '',
    summary: scalars.get('summary') ?? '',
    createdBy: scalars.get('created_by') ?? '',
    createdAt: scalars.get('created_at') ?? '',
    project: scalars.get('project') ?? '',
    upstream: knownListKeys.has('upstream') ? (lists.get('upstream') ?? []) : [],
    tags: lists.get('tags') ?? [],
    extra
  }
}

function stripScalar(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length > 1) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length > 1)
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}
