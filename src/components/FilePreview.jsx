import { useEffect, useState } from 'react'

function FileIcon({ type }) {
  const label =
    type === 'application/pdf' ? 'PDF'
    : type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ? 'DOCX'
    : type?.startsWith('text/') ? 'TXT'
    : 'FILE'

  return (
    <div className="flex flex-col items-center gap-2">
      <svg xmlns="http://www.w3.org/2000/svg" className="w-14 h-18 text-base-content/15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={0.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6M9 17h4" />
      </svg>
      <span className="font-mono text-[10px] text-base-content/25 font-bold tracking-widest">{label}</span>
    </div>
  )
}

function ScanOverlay({ scanning }) {
  if (!scanning) return null
  return (
    <>
      <div className="scan-line" />
      <div className="pointer-events-none absolute inset-0 scan-glow" />
      <span className="absolute bottom-3 left-3 text-[10px] font-mono text-base-content/20 uppercase tracking-widest">
        Scanning
      </span>
    </>
  )
}

export default function FilePreview({ file, scanning = false }) {
  const [objectURL, setObjectURL] = useState(null)
  const [textContent, setTextContent] = useState(null)

  const isImage = file?.type?.startsWith('image/')
  const isPDF   = file?.type === 'application/pdf'
  const isText  = file?.type?.startsWith('text/')

  useEffect(() => {
    if (!file) return
    setObjectURL(null)
    setTextContent(null)

    if (isImage || isPDF) {
      const url = URL.createObjectURL(file)
      setObjectURL(url)
      return () => URL.revokeObjectURL(url)
    }

    if (isText) {
      file.text().then(setTextContent)
    }
  }, [file, isImage, isPDF, isText])

  // ── Image ──────────────────────────────────────────────────────
  if (isImage && objectURL) {
    return (
      <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
        <img
          src={objectURL}
          className="max-w-full max-h-full object-contain p-6"
          alt={file?.name}
        />
        <ScanOverlay scanning={scanning} />
      </div>
    )
  }

  // ── PDF ────────────────────────────────────────────────────────
  if (isPDF && objectURL) {
    return (
      <div className="relative w-full h-full overflow-hidden">
        <iframe
          src={objectURL}
          className="w-full h-full border-0"
          title={file?.name}
        />
        <ScanOverlay scanning={scanning} />
      </div>
    )
  }

  // ── Plain text / CSV ───────────────────────────────────────────
  if (isText && textContent !== null) {
    return (
      <div className="relative w-full h-full overflow-hidden flex flex-col">
        <div className="flex-1 overflow-auto px-4 py-4">
          <pre className="text-[11px] font-mono leading-relaxed text-base-content/60 whitespace-pre-wrap break-words">
            {textContent}
          </pre>
        </div>
        {scanning && (
          <div className="shrink-0 px-4 pb-3">
            <div className="w-full h-px bg-base-content/8 rounded-full overflow-hidden">
              <div className="scan-bar" />
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Fallback: icon (DOCX, loading states) ─────────────────────
  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
      <div className="flex flex-col items-center gap-3 py-6">
        <FileIcon type={file?.type} />
        <p className="text-base-content/25 text-xs font-mono truncate max-w-[180px] text-center">
          {file?.name}
        </p>
        {scanning && (
          <div className="w-28 h-px bg-base-content/8 rounded-full overflow-hidden mt-2">
            <div className="scan-bar" />
          </div>
        )}
      </div>
      {scanning && (
        <span className="absolute bottom-3 left-3 text-[10px] font-mono text-base-content/20 uppercase tracking-widest">
          Scanning
        </span>
      )}
    </div>
  )
}
