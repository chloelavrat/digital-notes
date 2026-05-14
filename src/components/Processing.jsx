import ThemeToggle from './ThemeToggle'
import FilePreview from './FilePreview'
import FileTabs from './FileTabs'

export default function Processing({ results, activeId, onSelectFile, theme, onToggleTheme }) {
  const active = results.find(r => r.id === activeId) ?? results[0]
  const isScanning = active?.status === 'processing' || active?.status === 'pending'

  return (
    <div className="h-dvh flex flex-col bg-base-100">

      {/* Header */}
      <header className="shrink-0 flex items-center justify-between px-5 h-14 border-b border-base-content/8">
        <span className="text-base-content text-lg tracking-tight" style={{ fontFamily: '"Sligoil Micro", sans-serif' }}>
          Digital Notes
        </span>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </header>

      {/* File tabs */}
      <FileTabs results={results} activeId={activeId} onSelect={onSelectFile} />

      {/* Split pane */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">

        {/* Left — file preview + scan (view-transition target for card zoom) */}
        <div className="h-56 md:h-auto md:w-1/2 shrink-0 bg-base-200/50 border-b border-base-content/8 md:border-b-0 md:border-r md:border-base-content/8"
          style={{ viewTransitionName: 'doc-preview' }}>
          <FilePreview file={active?.file} scanning={isScanning} />
        </div>

        {/* Right — streaming text */}
        <div className="flex-1 overflow-auto px-5 py-5 md:px-7">
          {active?.status === 'error' ? (
            <p className="text-sm text-error/80">{active.error}</p>
          ) : active?.streamingText ? (
            <pre className="text-xs sm:text-sm font-mono leading-relaxed text-base-content/65 whitespace-pre-wrap break-words">
              {active.streamingText}
              {isScanning && <span className="typing-cursor" />}
            </pre>
          ) : (
            <div className="flex flex-col gap-3 pt-1">
              {[100, 85, 92, 70, 88, 60].map((w, i) => (
                <div
                  key={i}
                  className="h-3 rounded bg-base-content/6 animate-pulse"
                  style={{ width: `${w}%`, animationDelay: `${i * 0.1}s` }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
