import ThemeToggle from './ThemeToggle'
import FilePreview from './FilePreview'
import FileTabs from './FileTabs'

export default function Processing({ results, activeId, onSelectFile, theme, onToggleTheme }) {
  const active = results.find(r => r.id === activeId) ?? results[0]
  const isScanning = active?.status === 'processing' || active?.status === 'pending'

  return (
    <div className="h-dvh flex flex-col bg-base-100">

      {/* Header */}
      <header className="shrink-0 flex items-center justify-between px-5 safe-top border-b border-base-content/8">
        <span className="text-base-content text-lg tracking-tight" style={{ fontFamily: '"Sligoil Micro", sans-serif' }}>
          Digital Notes
        </span>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </header>

      {/* File tabs — desktop only (top is unreachable on phone) */}
      <div className="hidden md:block">
        <FileTabs results={results} activeId={activeId} onSelect={onSelectFile} />
      </div>

      {/* ── Mobile: full-screen preview + streaming overlay ── */}
      <div className="md:hidden flex-1 relative overflow-hidden" style={{ viewTransitionName: 'doc-preview' }}>
        <FilePreview file={active?.file} scanning={isScanning} />

        {active?.streamingText ? (
          <div
            className="absolute bottom-0 left-0 right-0 px-4 pb-6 pt-16 pointer-events-none"
            style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.72) 0%, transparent 100%)' }}
          >
            <pre className="text-white/80 text-[10px] font-mono leading-relaxed break-words overflow-hidden"
              style={{ display: '-webkit-box', WebkitLineClamp: 5, WebkitBoxOrient: 'vertical' }}>
              {active.streamingText.slice(-300)}
              <span className="typing-cursor" style={{ backgroundColor: 'rgba(255,255,255,0.7)' }} />
            </pre>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-end justify-center pb-14 pointer-events-none">
            <div className="flex gap-2.5">
              {[0, 1, 2].map(i => (
                <div key={i}
                  className="w-2 h-2 rounded-full bg-white/40 animate-bounce"
                  style={{ animationDelay: `${i * 0.12}s`, animationDuration: '0.85s' }} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Desktop: split view ── */}
      <div className="hidden md:flex flex-1 flex-row overflow-hidden">
        <div className="md:w-1/2 shrink-0 bg-base-200/50 border-r border-base-content/8"
          style={{ viewTransitionName: 'doc-preview' }}>
          <FilePreview file={active?.file} scanning={isScanning} />
        </div>
        <div className="flex-1 overflow-auto px-7 py-5">
          {active?.status === 'error' ? (
            <p className="text-sm text-error/80">{active.error}</p>
          ) : active?.streamingText ? (
            <pre className="text-sm font-mono leading-relaxed text-base-content/65 whitespace-pre-wrap break-words">
              {active.streamingText}
              {isScanning && <span className="typing-cursor" />}
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
      </div>
    </div>
  )
}
