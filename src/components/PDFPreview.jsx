import { useRef } from 'react'
import { marked } from 'marked'
import { prepareMermaid, useMermaid } from '../lib/useMermaid'
import { parseFrontmatter } from '../lib/frontmatter'

function PdfMetaCard({ meta }) {
  const tags = meta.tags ? meta.tags.split(/\s+/).filter(Boolean) : []
  return (
    <div className="pdf-meta-card">
      {meta.title && <div className="pdf-meta-title">{meta.title}</div>}
      {meta.description && <div className="pdf-meta-desc">{meta.description}</div>}
      <div className="pdf-meta-row">
        {meta.date && <span className="pdf-meta-date">{meta.date}</span>}
        {tags.map(tag => (
          <span key={tag} className="pdf-meta-tag">{tag}</span>
        ))}
      </div>
    </div>
  )
}

export default function PDFPreview({ markdown }) {
  const ref = useRef(null)
  const { meta, body } = parseFrontmatter(markdown)
  const html = prepareMermaid(body ? marked.parse(body) : '')
  useMermaid(ref, [html])

  return (
    <div className="pdf-viewer">
      <div className="pdf-page">
        {meta && <PdfMetaCard meta={meta} />}
        <div ref={ref} dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  )
}
