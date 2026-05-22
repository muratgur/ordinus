import type { JSX } from 'react'
import { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { FrontmatterCard } from './frontmatter-card'
import { parseMarkdownDocument } from './markdown-frontmatter'

const wikilinkScheme = 'wikilink:'

const documentProseClassName = [
  'min-w-0 max-w-full text-[15px] leading-7 text-foreground [overflow-wrap:anywhere]',
  '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
  '[&_p]:my-4 [&_strong]:font-semibold',
  '[&_h1]:mb-4 [&_h1]:mt-8 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:tracking-tight',
  '[&_h2]:mb-3 [&_h2]:mt-7 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight',
  '[&_h3]:mb-2 [&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-semibold',
  '[&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1.5',
  '[&_blockquote]:my-4 [&_blockquote]:border-l-4 [&_blockquote]:border-primary/30 [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground',
  '[&_code]:break-words [&_code]:rounded-sm [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px]',
  '[&_pre]:my-4 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:bg-muted [&_pre]:p-4',
  '[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[13px]',
  '[&_table]:my-4 [&_table]:max-w-full [&_table]:border-collapse [&_th]:border [&_th]:bg-muted [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_td]:border [&_td]:px-3 [&_td]:py-2 [&_td]:align-top',
  '[&_hr]:my-7 [&_hr]:border-border',
  '[&_a]:font-medium [&_a]:text-primary [&_a]:underline-offset-2 hover:[&_a]:underline'
].join(' ')

type MdastNode = {
  type: string
  value?: string
  url?: string
  children?: MdastNode[]
}

/**
 * Rewrites `[[wikilink]]` references into link nodes carrying a `wikilink:` URL.
 * The `a` renderer below shows them as visually distinct but inert text — in-viewer
 * navigation between documents is intentionally out of scope (ADR-022).
 */
function remarkWikilinks() {
  return (tree: MdastNode): void => {
    walk(tree)
  }

  function walk(node: MdastNode): void {
    if (!node.children) return

    const next: MdastNode[] = []
    for (const child of node.children) {
      if (child.type === 'text' && child.value && child.value.includes('[[')) {
        next.push(...splitWikilinks(child.value))
        continue
      }
      walk(child)
      next.push(child)
    }
    node.children = next
  }

  function splitWikilinks(value: string): MdastNode[] {
    const nodes: MdastNode[] = []
    const pattern = /\[\[([^\]]+)\]\]/g
    let lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = pattern.exec(value)) !== null) {
      if (match.index > lastIndex) {
        nodes.push({ type: 'text', value: value.slice(lastIndex, match.index) })
      }
      const label = match[1].trim()
      nodes.push({
        type: 'link',
        url: `${wikilinkScheme}${label}`,
        children: [{ type: 'text', value: label }]
      })
      lastIndex = pattern.lastIndex
    }

    if (lastIndex < value.length) {
      nodes.push({ type: 'text', value: value.slice(lastIndex) })
    }
    return nodes
  }
}

export function MarkdownDocument({ content }: { content: string }): JSX.Element {
  const { frontmatter, body } = useMemo(() => parseMarkdownDocument(content), [content])

  return (
    <div className="mx-auto w-full max-w-[54rem] rounded-lg border bg-card px-8 py-10 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(0,0,0,0.18)] sm:px-14 sm:py-14">
      {frontmatter ? <FrontmatterCard frontmatter={frontmatter} /> : null}
      <div className={documentProseClassName}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkWikilinks]}
          components={{
            a: ({ children, href }) => {
              if (href && href.startsWith(wikilinkScheme)) {
                return (
                  <span
                    className="rounded-sm bg-primary/10 px-1 font-medium text-primary/80"
                    title="Linked document — opening it from here is not yet supported"
                  >
                    {children}
                  </span>
                )
              }
              if (isHttpsHref(href)) {
                return (
                  <a href={href} target="_blank" rel="noreferrer">
                    {children}
                  </a>
                )
              }
              return (
                <span className="font-medium text-primary/80" title={href}>
                  {children}
                </span>
              )
            }
          }}
        >
          {body}
        </ReactMarkdown>
      </div>
    </div>
  )
}

function isHttpsHref(value: string | undefined): value is string {
  if (!value) return false
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}
