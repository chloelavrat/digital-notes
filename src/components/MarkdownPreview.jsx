import { useRef } from 'react'
import { marked } from 'marked'
import { prepareMermaid, useMermaid } from '../lib/useMermaid'
import { parseFrontmatter } from '../lib/frontmatter'

function MetaCard({ meta }) {
  const tags = meta.tags ? meta.tags.split(/\s+/).filter(Boolean) : []

  return (
    <div className="mb-6 rounded-xl border border-base-content/10 bg-base-200/40 px-5 py-4">
      <div className="flex flex-col gap-2">
        {meta.title && (
          <h2 className="text-base font-semibold text-base-content leading-snug m-0">
            {meta.title}
          </h2>
        )}
        {meta.description && (
          <p className="text-sm text-base-content/55 leading-snug m-0">{meta.description}</p>
        )}
        <div className="flex items-center gap-3 flex-wrap pt-0.5">
          {meta.date && (
            <span className="text-xs font-mono text-base-content/35">{meta.date}</span>
          )}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-base-content/6 text-base-content/45 border border-base-content/8"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function MarkdownPreview({ markdown }) {
  const ref = useRef(null)
  const { meta, body } = parseFrontmatter(markdown || '')
  const html = prepareMermaid(body ? marked.parse(body) : '')
  useMermaid(ref, [html])

  return (
    <div className="overflow-auto flex-1 px-5 py-5">
      {meta && <MetaCard meta={meta} />}
      <div ref={ref} className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}
