import type { JSX } from 'react'
import type { DocumentFrontmatter } from './markdown-frontmatter'

export function FrontmatterCard({
  frontmatter
}: {
  frontmatter: DocumentFrontmatter
}): JSX.Element {
  const meta = [
    frontmatter.createdBy ? { label: 'By', value: frontmatter.createdBy } : null,
    frontmatter.createdAt ? { label: 'Created', value: frontmatter.createdAt } : null,
    frontmatter.project ? { label: 'Project', value: frontmatter.project } : null,
    ...frontmatter.extra.map((entry) => ({ label: entry.key, value: entry.value }))
  ].filter((entry): entry is { label: string; value: string } => entry !== null)

  return (
    <header className="mb-8 border-b pb-6">
      {frontmatter.title ? (
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {frontmatter.title}
        </h1>
      ) : null}
      {frontmatter.summary ? (
        <p className="mt-2 text-[15px] leading-6 text-muted-foreground">{frontmatter.summary}</p>
      ) : null}

      {meta.length > 0 ? (
        <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
          {meta.map((entry) => (
            <div key={`${entry.label}-${entry.value}`} className="flex gap-1.5">
              <dt className="font-medium text-muted-foreground/70">{entry.label}</dt>
              <dd className="text-foreground">{entry.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {frontmatter.tags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {frontmatter.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border bg-background px-2 py-0.5 text-[11px] text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      {frontmatter.upstream.length > 0 ? (
        <div className="mt-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
            Upstream
          </p>
          <ul className="mt-1.5 grid gap-1">
            {frontmatter.upstream.map((source) => (
              <li
                key={source}
                className="truncate font-mono text-xs text-muted-foreground"
                title={source}
              >
                {source}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </header>
  )
}
