import { useState, useEffect, useRef } from 'react'
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
  const [showExport, setShowExport] = useState(false)

  // Derived state — must be before hooks that reference them
  const active = results.find(r => r.id === activeId) ?? results.find(r => r.status === 'done')
  const isProcessing = active?.status === 'pending' || active?.status === 'processing'
  const isError = active?.status === 'error'

  // Mobile draggable sheet — 0 = content fills screen, 1 = image fully visible
  const [sheetOffset, setSheetOffset] = useState(1.0)
  const [sheetAnimating, setSheetAnimating] = useState(true)
  const sheetRef = useRef(null)
  const drag = useRef({ active: false, startY: 0, startOffset: 0, containerH: 0 })

  // Flip-in: image visible briefly, sheet slides up to fully cover it
  useEffect(() => {
    if (isProcessing || isError) return
    const t = setTimeout(() => setSheetOffset(0), 160)
    return () => clearTimeout(t)
  }, [isProcessing, isError])

  const onDragStart = (e) => {
    drag.current = {
      active: true,
      startY: e.touches[0].clientY,
      startOffset: sheetOffset,
      containerH: sheetRef.current?.parentElement?.clientHeight || 600,
    }
    setSheetAnimating(false)
  }

  const onDragMove = (e) => {
    if (!drag.current.active) return
    const dy = e.touches[0].clientY - drag.current.startY
    const next = Math.max(0, Math.min(0.82, drag.current.startOffset + dy / drag.current.containerH))
    setSheetOffset(next)
  }

  const onDragEnd = () => {
    drag.current.active = false
    setSheetAnimating(true)
    // Two positions: fully covering (0) or pulled down to see image (0.75)
    setSheetOffset(sheetOffset > 0.35 ? 0.75 : 0)
  }
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

  const downloadAs = (type) => {
    const isHtml = type === 'html'
    const content = isHtml ? rawHtml : markdown
    const ext = isHtml ? '.html' : '.md'
    const mime = isHtml ? 'text/html' : 'text/markdown'
    const url = URL.createObjectURL(new Blob([content], { type: mime }))
    Object.assign(document.createElement('a'), { href: url, download: filename.replace(/\.[^/.]+$/, '') + ext }).click()
    URL.revokeObjectURL(url)
  }

  const download = () => downloadAs(tab === 'html' ? 'html' : 'md')

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
      <header className="shrink-0 flex items-center justify-between px-5 safe-top border-b border-base-content/8">
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

      {/* File tabs — desktop only */}
      <div className="hidden md:block"><FileTabs
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
      /></div>

      {/* ── Mobile: full-screen image + draggable sheet ── */}
      <div className="md:hidden flex-1 relative overflow-hidden">
        {/* Image behind */}
        <div className="absolute inset-0 bg-base-200">
          <FilePreview file={file} scanning={isProcessing} />
        </div>

        {/* Draggable content sheet */}
        <div
          ref={sheetRef}
          className="absolute inset-x-0 bottom-0 bg-base-100 flex flex-col overflow-hidden"
          style={{
            top: 0,
            transform: `translateY(${sheetOffset * 100}%)`,
            transition: sheetAnimating ? 'transform 0.55s cubic-bezier(0.34, 1.56, 0.64, 1)' : 'none',
            borderTopLeftRadius: `${Math.round(sheetOffset * 32)}px`,
            borderTopRightRadius: `${Math.round(sheetOffset * 32)}px`,
            boxShadow: sheetOffset > 0 ? '0 -6px 40px rgba(0,0,0,0.18)' : 'none',
          }}
        >
          {/* Drag handle — full-width grab zone */}
          <div
            className="shrink-0 flex justify-center items-center h-9 cursor-grab active:cursor-grabbing"
            onTouchStart={onDragStart}
            onTouchMove={onDragMove}
            onTouchEnd={onDragEnd}
            style={{ touchAction: 'none' }}
          >
            <div className="w-12 h-1 rounded-full bg-base-content/18" />
          </div>

          {/* Content — fills available space */}
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            {isError ? (
              <div className="flex-1 flex items-center justify-center px-8">
                <p className="text-sm text-error/80 text-center">{active?.error}</p>
              </div>
            ) : isProcessing ? (
              <div className="flex-1 overflow-auto px-5 py-4">
                {active?.streamingText
                  ? <pre className="text-xs font-mono leading-relaxed text-base-content/65 whitespace-pre-wrap break-words">{active.streamingText}<span className="typing-cursor" /></pre>
                  : <div className="flex flex-col gap-3">{[100,85,92,70,88,60].map((w,i)=><div key={i} className="h-3 rounded bg-base-content/6 animate-pulse" style={{width:`${w}%`,animationDelay:`${i*0.1}s`}}/>)}</div>
                }
              </div>
            ) : (
              <>
                {tab === 'markdown' && <MarkdownPreview markdown={markdown} />}
                {tab === 'edit' && <textarea className="flex-1 resize-none px-5 py-4 font-mono text-sm leading-relaxed bg-transparent text-base-content/75 focus:outline-none" value={markdown} onChange={(e)=>onMarkdownChange(activeId,e.target.value)} spellCheck={false}/>}
                {tab === 'pdf' && <PDFPreview markdown={markdown} />}
                {tab === 'html' && <iframe className="flex-1 w-full border-0" srcDoc={buildHtmlDoc(meta,rawHtml)} title="HTML Preview" sandbox="allow-same-origin allow-scripts"/>}
              </>
            )}
          </div>

          {/* ── Bottom thumb zone: tabs + export ── */}
          {!(isProcessing || isError) && (
            <div
              className="shrink-0 border-t border-base-content/8"
              style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
            >
              <div className="flex items-center px-3 pt-2 gap-1">
                {[...VIEW_TABS, ['edit', 'Edit']].map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setTab(key)}
                    className={`flex-1 py-4 text-sm font-medium rounded-2xl transition-all ${
                      tab === key
                        ? 'bg-base-200 text-base-content'
                        : 'text-base-content/35 active:bg-base-200/60'
                    }`}
                  >
                    {label}
                  </button>
                ))}
                <button
                  onClick={() => setShowExport(true)}
                  className="w-14 py-4 flex items-center justify-center rounded-2xl text-base-content/35 active:bg-base-200/60 transition-all"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/>
                  </svg>
                </button>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ── Desktop: two-column split ── */}
      <div className="hidden md:flex flex-1 flex-row overflow-hidden">

        {/* Left — file preview */}
        <div className="md:w-1/2 shrink-0 bg-base-200/50 border-r border-base-content/8">
          <FilePreview file={file} scanning={isProcessing} />
        </div>

        {/* Right — content panel */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Sub-header: desktop only */}
          {!(isProcessing || isError) && (
            <div className="hidden md:flex shrink-0 items-center px-3 py-2 border-b border-base-content/8 gap-1.5">

              <div className="flex gap-0.5 bg-base-200 rounded-lg p-0.5 shrink-0">
                {VIEW_TABS.map(([key, label]) => (
                  <button key={key}
                    className={`px-2.5 py-1 text-xs rounded-md transition-all ${tab === key ? 'bg-base-100 text-base-content shadow-sm font-medium' : 'text-base-content/40 hover:text-base-content/70'}`}
                    onClick={() => setTab(key)}>{label}</button>
                ))}
              </div>

              <Divider />
              <button
                className={`px-2.5 py-1 text-xs rounded-md transition-all border ${tab === 'edit' ? 'border-base-content/20 bg-base-200 text-base-content font-medium' : 'border-transparent text-base-content/35 hover:text-base-content/65'}`}
                onClick={() => setTab('edit')}>Edit</button>

              <div className="flex-1" />
              <Divider />

              <ActionBtn onClick={copy} title="Copy">
                {copied
                  ? <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                  : <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </ActionBtn>
              <ActionBtn onClick={download} title="Download">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                <span>Download</span>
              </ActionBtn>
              <ActionBtn onClick={openInNotes} title="Notes">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                <span>Notes</span>
              </ActionBtn>
            </div>
          )}

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
      {/* Export action sheet — mobile */}
      {showExport && (
        <dialog className="modal modal-open modal-bottom sm:modal-middle md:hidden">
          <div className="modal-box rounded-t-3xl rounded-b-none sm:rounded-2xl px-4 pt-5 pb-2"
            style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>

            {/* Handle */}
            <div className="w-10 h-1 rounded-full bg-base-content/15 mx-auto mb-5" />

            <p className="text-xs text-base-content/40 font-medium uppercase tracking-wider px-1 mb-3">Export</p>

            <ul className="space-y-1">
              {[
                {
                  label: 'Copy Markdown',
                  sub: 'Copy raw .md to clipboard',
                  icon: <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />,
                  action: () => { copy(); setShowExport(false) },
                },
                {
                  label: 'Download .md',
                  sub: 'Save as Markdown file',
                  icon: <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />,
                  action: () => { downloadAs('md'); setShowExport(false) },
                },
                {
                  label: 'Download .html',
                  sub: 'Save as rendered HTML file',
                  icon: <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />,
                  action: () => { downloadAs('html'); setShowExport(false) },
                },
                {
                  label: 'Open in Apple Notes',
                  sub: 'Share content to Notes app',
                  icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />,
                  action: () => { openInNotes(); setShowExport(false) },
                },
              ].map(({ label, sub, icon, action }) => (
                <li key={label}>
                  <button
                    onClick={action}
                    className="w-full flex items-center gap-4 px-3 py-3.5 rounded-2xl active:bg-base-200 transition-colors text-left"
                  >
                    <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-base-200 text-base-content/60 shrink-0">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                        {icon}
                      </svg>
                    </span>
                    <span>
                      <p className="text-sm font-medium text-base-content leading-tight">{label}</p>
                      <p className="text-xs text-base-content/40 mt-0.5">{sub}</p>
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            <button
              onClick={() => setShowExport(false)}
              className="mt-3 w-full py-3.5 rounded-2xl bg-base-200 text-base-content/60 text-sm font-medium active:bg-base-300 transition-colors"
            >
              Cancel
            </button>
          </div>
          <div className="modal-backdrop" onClick={() => setShowExport(false)} />
        </dialog>
      )}
    </div>
  )
}
