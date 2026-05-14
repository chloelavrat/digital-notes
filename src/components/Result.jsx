import { useState } from 'react'
import { marked } from 'marked'
import ThemeToggle from './ThemeToggle'
import FilePreview from './FilePreview'
import FileTabs from './FileTabs'
import MarkdownPreview from './MarkdownPreview'
import PDFPreview from './PDFPreview'
import { parseFrontmatter } from '../lib/frontmatter'
import { toAppleNotesText } from '../lib/appleNotesExport'

const VIEW_TABS = [
  ['markdown', 'Markdown'],
  ['pdf',      'PDF'],
  ['html',     'HTML'],
]

function buildMetaCardHtml(meta) {
  if (!meta) return ''
  const tags = meta.tags ? meta.tags.split(/\s+/).filter(Boolean) : []
  const tagHtml = tags.map(t =>
    `<span style="display:inline-block;font-size:10px;font-family:monospace;padding:2px 8px;border-radius:999px;background:rgba(0,0,0,.05);border:1px solid rgba(0,0,0,.1);color:#57606a;margin:0 3px 3px 0">${t}</span>`
  ).join('')
  return `
<div style="border:1px solid #d0d7de;border-radius:10px;background:#f6f8fa;padding:16px 20px;margin-bottom:24px">
  ${meta.title ? `<div style="font-size:15px;font-weight:600;color:#24292f;margin-bottom:4px">${meta.title}</div>` : ''}
  ${meta.description ? `<div style="font-size:13px;color:#57606a;margin-bottom:8px">${meta.description}</div>` : ''}
  <div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-top:4px">
    ${meta.date ? `<span style="font-size:11px;font-family:monospace;color:#8b949e">${meta.date}</span>` : ''}
    ${tagHtml}
  </div>
</div>`
}

function injectMermaidDivs(html) {
  return html.replace(
    /<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/gi,
    (_, encoded) => {
      const code = encoded
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
        .replace(/&#39;/g, "'").replace(/&quot;/g, '"')
      return `<div class="mermaid">${code}</div>`
    }
  )
}

function buildHtmlDoc(meta, bodyHtml) {
  const processedHtml = injectMermaidDivs(bodyHtml)
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*,*::before,*::after{box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.65;color:#24292f;background:#fff;padding:28px 36px;max-width:860px;margin:0 auto}
h1,h2,h3,h4,h5,h6{margin:1.4em 0 .5em;font-weight:600;line-height:1.25}
h1{font-size:2em;border-bottom:1px solid #d0d7de;padding-bottom:.3em}
h2{font-size:1.5em;border-bottom:1px solid #d0d7de;padding-bottom:.3em}
h3{font-size:1.25em}h4{font-size:1em}
p{margin:0 0 .9em}
a{color:#0969da;text-decoration:none}a:hover{text-decoration:underline}
ul,ol{padding-left:2em;margin-bottom:.9em}li{margin:.2em 0}
blockquote{margin:0 0 .9em;padding:0 1em;color:#57606a;border-left:.25em solid #d0d7de}
code{font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:.85em;background:rgba(175,184,193,.2);padding:.15em .4em;border-radius:4px}
pre{background:#f6f8fa;border:1px solid #d0d7de;border-radius:6px;padding:16px;overflow-x:auto;margin-bottom:.9em}
pre code{background:none;padding:0;font-size:.85em}
table{border-collapse:collapse;width:100%;margin-bottom:.9em;font-size:.9em}
th,td{border:1px solid #d0d7de;padding:6px 13px;text-align:left}
th{font-weight:600;background:#f6f8fa}
tr:nth-child(even) td{background:#f6f8fa}
img{max-width:100%;border-radius:4px}
hr{border:none;border-top:1px solid #d0d7de;margin:1.5em 0}
strong{font-weight:600}em{font-style:italic}
.mermaid{margin:1em 0;text-align:center}
</style>
<script type="module">
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs'
mermaid.initialize({ startOnLoad: true, theme: 'neutral', securityLevel: 'loose' })
</script>
</head>
<body>${buildMetaCardHtml(meta)}${processedHtml}</body>
</html>`
}

function ActionBtn({ onClick, title, children }) {
  return (
    <button className="btn btn-ghost btn-xs gap-1 text-base-content/40 hover:text-base-content/70" onClick={onClick} title={title}>
      {children}
    </button>
  )
}

function Divider() {
  return <span className="h-4 w-px bg-base-content/12 mx-0.5 shrink-0" />
}

export default function Result({ results, activeId, onSelectFile, onMarkdownChange, onReset, theme, onToggleTheme }) {
  const [tab, setTab] = useState('markdown')
  const [copied, setCopied] = useState(false)

  const active = results.find(r => r.id === activeId) ?? results.find(r => r.status === 'done')
  const isProcessing = active?.status === 'pending' || active?.status === 'processing'
  const isError = active?.status === 'error'
  const markdown = active?.markdown ?? ''
  const file = active?.file
  const filename = active?.filename ?? 'document.md'

  const { meta, body } = parseFrontmatter(markdown)
  const rawHtml = body ? marked.parse(body) : ''

  const copy = async () => {
    await navigator.clipboard.writeText(tab === 'html' ? rawHtml : markdown)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const download = () => {
    const isHtml = tab === 'html'
    const blob = new Blob([isHtml ? rawHtml : markdown], { type: isHtml ? 'text/html' : 'text/markdown' })
    const name = filename.replace(/\.[^/.]+$/, '') + (isHtml ? '.html' : '.md')
    const url = URL.createObjectURL(blob)
    Object.assign(document.createElement('a'), { href: url, download: name }).click()
    URL.revokeObjectURL(url)
  }

  const downloadAll = () => {
    results
      .filter(r => r.status === 'done')
      .forEach((r, i) => {
        setTimeout(() => {
          const url = URL.createObjectURL(new Blob([r.markdown], { type: 'text/markdown' }))
          Object.assign(document.createElement('a'), { href: url, download: r.filename }).click()
          URL.revokeObjectURL(url)
        }, i * 200)
      })
  }

  const openInNotes = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: filename.replace('.md', ''), text: toAppleNotesText(markdown) })
      } catch (e) {
        if (e.name !== 'AbortError') download()
      }
    } else {
      download()
    }
  }

  const doneCount = results.filter(r => r.status === 'done').length

  return (
    <div className="h-dvh flex flex-col bg-base-100">

      {/* Header */}
      <header className="shrink-0 flex items-center justify-between px-5 h-14 border-b border-base-content/8">
        <span className="text-base-content text-lg tracking-tight" style={{ fontFamily: '"Sligoil Micro", sans-serif' }}>
          Digital Notes
        </span>
        <div className="flex items-center gap-1">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <button
            className="btn btn-sm gap-1.5 bg-neutral text-neutral-content hover:bg-neutral/85 border-0 shadow-none"
            onClick={onReset}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6.364 1.636l-.707.707M20 12h-1M17.657 17.657l-.707-.707M12 19v1M6.343 17.657l-.707.707M4 12H3m3.343-5.657l.707.707" />
            </svg>
            New
          </button>
        </div>
      </header>

      {/* File tabs — full width, above the split */}
      <FileTabs
        results={results}
        activeId={activeId}
        onSelect={onSelectFile}
        rightAction={
          doneCount > 1 && (
            <button
              className="btn btn-xs gap-1.5 text-base-content/50 hover:text-base-content border border-base-content/15 hover:border-base-content/30 bg-transparent"
              onClick={downloadAll}
              title={`Download all ${doneCount} files`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download all ({doneCount})
            </button>
          )
        }
      />

      {/* Two-column body */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">

        {/* Left — file preview (scan when still processing) */}
        <div className="h-48 md:h-auto md:w-1/2 shrink-0 bg-base-200/50 border-b border-base-content/8 md:border-b-0 md:border-r md:border-base-content/8">
          <FilePreview file={file} scanning={isProcessing} />
        </div>

        {/* Right — content panel */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Sub-header: view tabs + actions — hidden while file is still processing */}
          <div className={`shrink-0 flex items-center px-3 py-2 border-b border-base-content/8 gap-1.5 ${isProcessing || isError ? 'hidden' : ''}`}>

            {/* View tabs */}
            <div className="flex gap-0.5 bg-base-200 rounded-lg p-0.5 shrink-0">
              {VIEW_TABS.map(([key, label]) => (
                <button
                  key={key}
                  className={`px-2.5 py-1 text-xs rounded-md transition-all ${
                    tab === key
                      ? 'bg-base-100 text-base-content shadow-sm font-medium'
                      : 'text-base-content/40 hover:text-base-content/70'
                  }`}
                  onClick={() => setTab(key)}
                >
                  {label}
                </button>
              ))}
            </div>

            <Divider />

            {/* Edit tab */}
            <button
              className={`px-2.5 py-1 text-xs rounded-md transition-all border ${
                tab === 'edit'
                  ? 'border-base-content/20 bg-base-200 text-base-content font-medium'
                  : 'border-transparent text-base-content/35 hover:text-base-content/65'
              }`}
              onClick={() => setTab('edit')}
            >
              Edit
            </button>

            <div className="flex-1" />
            <Divider />

            {/* Actions */}
            <ActionBtn onClick={copy} title={tab === 'html' ? 'Copy HTML' : 'Copy Markdown'}>
              {copied ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
              <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
            </ActionBtn>

            <ActionBtn onClick={download} title="Download">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span className="hidden sm:inline">Download</span>
            </ActionBtn>

            <ActionBtn onClick={openInNotes} title="Open in Apple Notes">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="hidden sm:inline">Notes</span>
            </ActionBtn>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {isError ? (
              <div className="flex-1 flex items-center justify-center px-8 text-center">
                <p className="text-sm text-error/80">{active?.error}</p>
              </div>
            ) : isProcessing ? (
              /* Still streaming — show raw text with cursor */
              <div className="flex-1 overflow-auto px-6 py-5">
                {active?.streamingText ? (
                  <pre className="text-xs sm:text-sm font-mono leading-relaxed text-base-content/65 whitespace-pre-wrap break-words">
                    {active.streamingText}<span className="typing-cursor" />
                  </pre>
                ) : (
                  <div className="flex flex-col gap-3 pt-1">
                    {[100, 85, 92, 70, 88, 60].map((w, i) => (
                      <div key={i} className="h-3 rounded bg-base-content/6 animate-pulse"
                        style={{ width: `${w}%`, animationDelay: `${i * 0.1}s` }} />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                {tab === 'markdown' && <MarkdownPreview markdown={markdown} />}
                {tab === 'edit' && (
                  <textarea
                    className="flex-1 resize-none px-5 py-5 font-mono text-sm leading-relaxed bg-transparent text-base-content/75 focus:outline-none"
                    value={markdown}
                    onChange={(e) => onMarkdownChange(activeId, e.target.value)}
                    spellCheck={false}
                  />
                )}
                {tab === 'pdf' && <PDFPreview markdown={markdown} />}
                {tab === 'html' && (
                  <iframe
                    className="flex-1 w-full border-0"
                    srcDoc={buildHtmlDoc(meta, rawHtml)}
                    title="HTML Preview"
                    sandbox="allow-same-origin allow-scripts"
                  />
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
