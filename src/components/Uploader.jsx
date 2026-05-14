import { useState, useRef, useEffect, useCallback } from 'react'
import ThemeToggle from './ThemeToggle'

const ACCEPT = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'text/plain', 'text/csv', 'text/html',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
].join(',')

const MAX = 10


function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function MiniCard({ file, index, onRemove }) {
  const [objectUrl, setObjectUrl]   = useState(null)
  const [textPreview, setTextPreview] = useState(null)
  const [pdfDone, setPdfDone]       = useState(false)
  const canvasRef = useRef(null)

  const isImage = file.type.startsWith('image/')
  const isPDF   = file.type === 'application/pdf'
  const isText  = file.type.startsWith('text/')
  const ext = (file.name.split('.').pop() ?? '').toUpperCase().slice(0, 5)

  useEffect(() => {
    if (isImage) {
      const url = URL.createObjectURL(file)
      setObjectUrl(url)
      return () => URL.revokeObjectURL(url)
    }
    if (isText) {
      file.text().then(t => setTextPreview(t.slice(0, 400)))
    }
  }, [file, isImage, isText])

  // PDF → canvas thumbnail (first page only, no iframe/browser controls)
  useEffect(() => {
    if (!isPDF) return
    let canceled = false
    let blobUrl = null

    const render = async () => {
      try {
        const { getDocument, GlobalWorkerOptions, version } = await import('pdfjs-dist')
        GlobalWorkerOptions.workerSrc =
          `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`

        blobUrl = URL.createObjectURL(file)
        const pdf = await getDocument(blobUrl).promise
        if (canceled) return

        const page = await pdf.getPage(1)
        if (canceled) return

        const dpr = window.devicePixelRatio || 1
        const vp = page.getViewport({ scale: 1 })
        const scale = (160 / vp.width) * dpr
        const scaled = page.getViewport({ scale })

        const canvas = canvasRef.current
        if (!canvas) return
        canvas.width  = Math.floor(scaled.width)
        canvas.height = Math.floor(scaled.height)
        // CSS size stays at logical 160px so it looks sharp on retina
        canvas.style.width  = '160px'
        canvas.style.height = 'auto'

        await page.render({ canvasContext: canvas.getContext('2d'), viewport: scaled }).promise
        if (!canceled) setPdfDone(true)
      } catch {
        // fall back to type badge silently
      } finally {
        if (blobUrl) URL.revokeObjectURL(blobUrl)
      }
    }

    render()
    return () => { canceled = true }
  }, [file, isPDF])

  return (
    <div
      className="mini-card"
      style={{ '--card-r': '0deg', animationDelay: `${index * 55}ms` }}
    >
      <button className="mini-card-remove" onClick={onRemove} title="Remove">
        <svg xmlns="http://www.w3.org/2000/svg" className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <div className="mini-card-inner">
        <div className="mini-card-preview">
          {isImage && objectUrl ? (
            <img src={objectUrl} alt={file.name} />
          ) : isPDF ? (
            <div style={{ width: '160px', height: '190px', overflow: 'hidden', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', background: '#f9f9f9' }}>
              <canvas ref={canvasRef} style={{ width: '160px', display: pdfDone ? 'block' : 'none' }} />
              {!pdfDone && <span className="mini-card-type-badge" style={{ alignSelf: 'center' }}>PDF</span>}
            </div>
          ) : isText && textPreview ? (
            <pre>{textPreview}</pre>
          ) : (
            <span className="mini-card-type-badge">{ext}</span>
          )}
        </div>

        <div className="mini-card-footer">
          <p className="mini-card-name">{file.name}</p>
          <p className="mini-card-meta">{fmtSize(file.size)}</p>
        </div>
      </div>
    </div>
  )
}

export default function Uploader({ onFiles, error, theme, onToggleTheme }) {
  const [dragging, setDragging] = useState(false)
  const [queued, setQueued] = useState([])
  const inputRef       = useRef(null)
  const cameraRef      = useRef(null)
  const queueCameraRef = useRef(null)

  const stage = (fileList) => {
    const incoming = Array.from(fileList)
    setQueued(prev => {
      const merged = [...prev, ...incoming].slice(0, MAX)
      return merged
    })
  }

  const remove = (index) => setQueued(prev => prev.filter((_, i) => i !== index))
  const clear  = () => { setQueued([]); if (inputRef.current) inputRef.current.value = '' }
  const submit = () => { if (queued.length) onFiles(queued) }

  return (
    <div className="fixed inset-0 bg-base-100 flex flex-col items-center justify-center px-6 select-none">
      <ThemeToggle theme={theme} onToggle={onToggleTheme} className="absolute top-4 right-4" />

      <h1
        className="text-base-content text-5xl sm:text-7xl mb-4 text-center tracking-tight"
        style={{ fontFamily: '"Sligoil Micro", sans-serif' }}
      >
        Digital Notes
      </h1>
      <p className="text-base-content/40 text-sm mb-10 text-center">
        Transform any document or image into Markdown — up to {MAX} files at once
      </p>

      {queued.length === 0 ? (
        <>
          {/* Drop zone */}
          <label
            className="w-full max-w-md rounded-2xl p-10 flex flex-col items-center gap-5 cursor-pointer transition-all duration-200"
            style={{
              border: `2px dashed ${dragging
                ? 'color-mix(in oklch, var(--color-base-content) 35%, transparent)'
                : 'color-mix(in oklch, var(--color-base-content) 12%, transparent)'}`,
              backgroundColor: dragging ? 'color-mix(in oklch, var(--color-base-content) 4%, transparent)' : 'transparent',
              transform: dragging ? 'scale(1.01)' : 'scale(1)',
            }}
            onDragEnter={(e) => { e.preventDefault(); setDragging(true) }}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false) }}
            onDrop={(e) => { e.preventDefault(); setDragging(false); stage(e.dataTransfer.files) }}
          >
            <input ref={inputRef} type="file" accept={ACCEPT} multiple className="hidden" onChange={(e) => stage(e.target.files)} />
            <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 text-base-content/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <p className="text-sm text-base-content/45">
              {dragging ? 'Release to select' : 'Drop files here or click to browse'}
            </p>
            <div className="flex flex-wrap gap-1.5 justify-center">
              {['PDF', 'DOCX', 'PNG', 'JPEG', 'WEBP', 'TXT', 'CSV'].map((f) => (
                <span key={f} className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-base-content/10 text-base-content/25">{f}</span>
              ))}
            </div>
          </label>

          <div className="flex items-center gap-3 mt-5 mb-3">
            <span className="h-px w-10 bg-base-content/10" />
            <span className="text-xs text-base-content/25">or</span>
            <span className="h-px w-10 bg-base-content/10" />
          </div>

          <button
            className="btn btn-ghost btn-sm gap-2 text-base-content/40 hover:text-base-content/70"
            onClick={() => cameraRef.current?.click()}
          >
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={(e) => { const f = e.target.files[0]; if (f) onFiles([f]) }} />
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Take a photo
          </button>
        </>
      ) : (
        /* ── Card deck queue ─────────────────────────── */
        <div className="flex flex-col items-center gap-6 w-full max-w-3xl">

          {/* Cards — spread freely, no container */}
          <div className="flex flex-wrap gap-8 justify-center w-full py-4 px-6">
            {queued.map((file, i) => (
              <MiniCard key={`${file.name}-${i}`} file={file} index={i} onRemove={() => remove(i)} />
            ))}
          </div>

          {/* Actions — flow below cards */}
          <div className="flex items-center gap-2 w-full max-w-xs">
            {/* Camera — always shown, goes straight to camera on mobile */}
            <button
              className="btn btn-ghost btn-sm btn-square text-base-content/45 hover:text-base-content/70"
              onClick={() => { if (queueCameraRef.current) { queueCameraRef.current.value = ''; queueCameraRef.current.click() } }}
              title="Take a photo"
            >
              <input
                ref={queueCameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => { if (e.target.files[0]) stage(e.target.files) }}
              />
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>

            {/* Add files */}
            {queued.length < MAX && (
              <label className="btn btn-ghost btn-sm gap-1.5 text-base-content/45 hover:text-base-content/70 cursor-pointer flex-1">
                <input type="file" accept={ACCEPT} multiple className="hidden" onChange={(e) => stage(e.target.files)} />
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add
              </label>
            )}

            {/* Process */}
            <button
              className="btn btn-sm bg-neutral text-neutral-content hover:bg-neutral/85 border-0 gap-2 flex-[2]"
              onClick={submit}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6.364 1.636l-.707.707M20 12h-1M17.657 17.657l-.707-.707M12 19v1M6.343 17.657l-.707.707M4 12H3m3.343-5.657l.707.707" />
              </svg>
              Process {queued.length}
            </button>
          </div>

          {/* Count + clear — below buttons */}
          <div className="flex items-center justify-between w-full max-w-xs">
            <span className="text-xs text-base-content/30">
              {queued.length} file{queued.length > 1 ? 's' : ''} selected
            </span>
            <button
              className="text-xs text-base-content/25 hover:text-base-content/50 transition-colors"
              onClick={clear}
            >
              Clear all
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-6 max-w-md w-full px-4 py-3 rounded-xl text-sm text-error border border-error/20 bg-error/5">
          {error}
        </div>
      )}
    </div>
  )
}
