import type { ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CopyButton } from '@renderer/components/copy-button'

const markdownContentClassName = [
  'min-w-0 max-w-full overflow-x-auto select-text text-sm leading-6 text-foreground [overflow-wrap:anywhere]',
  '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
  '[&_p]:my-2 [&_strong]:font-semibold',
  '[&_h1]:mb-3 [&_h1]:mt-4 [&_h1]:text-lg [&_h1]:font-semibold',
  '[&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold',
  '[&_h3]:mb-2 [&_h3]:mt-3 [&_h3]:text-sm [&_h3]:font-semibold',
  '[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1',
  '[&_blockquote]:my-3 [&_blockquote]:border-l-4 [&_blockquote]:border-primary/30 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground',
  '[&_code]:break-words [&_code]:rounded-sm [&_code]:bg-card [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs [&_code]:[overflow-wrap:anywhere]',
  '[&_pre]:my-3 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:bg-card [&_pre]:p-3',
  '[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-xs',
  '[&_table]:my-3 [&_table]:max-w-full [&_table]:border-collapse [&_th]:border [&_th]:bg-card [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_td]:border [&_td]:px-2 [&_td]:py-1.5 [&_td]:align-top',
  '[&_hr]:my-4 [&_hr]:border-border'
].join(' ')

export function MarkdownContent({ content }: { content: string }): React.JSX.Element {
  return (
    <div className={markdownContentClassName}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, href }) =>
            isSafeMarkdownHref(href) ? (
              <a
                className="font-medium text-primary underline-offset-2 hover:underline"
                href={href}
                target="_blank"
                rel="noreferrer"
              >
                {children}
              </a>
            ) : (
              <span className="font-medium text-primary" title={href}>
                {children}
              </span>
            ),
          // Polish pass: every fenced code block gets a hover-revealed copy
          // chip in its top-right corner. `group/code` scopes the reveal to
          // the block, so nested groups in transcripts don't trigger it.
          pre: ({ children }) => (
            <pre className="group/code relative">
              <span className="absolute right-1.5 top-1.5 flex opacity-0 transition-opacity focus-within:opacity-100 group-hover/code:opacity-100">
                <CopyButton
                  text={() => extractNodeText(children)}
                  label="Copy code"
                  className="rounded-md border bg-background/95 p-1.5 shadow-sm hover:bg-accent"
                />
              </span>
              {children}
            </pre>
          )
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

// Flattens the rendered code block back to plain text for the clipboard.
function extractNodeText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractNodeText).join('')
  if (typeof node === 'object' && 'props' in node) {
    return extractNodeText((node.props as { children?: ReactNode }).children)
  }
  return ''
}

function isSafeMarkdownHref(value: string | undefined): value is string {
  if (!value) return false

  try {
    const url = new URL(value)
    return url.protocol === 'https:'
  } catch {
    return false
  }
}
