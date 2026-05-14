export default function FileTabs({ results, activeId, onSelect, rightAction }) {
  return (
    <div className="shrink-0 flex items-center border-b border-base-content/8 px-3 gap-2">

      {/* Scrollable file tabs */}
      <div className="flex items-center gap-0.5 overflow-x-auto flex-1 py-2 scrollbar-none">
        {results.map((r) => (
          <button
            key={r.id}
            onClick={() => onSelect(r.id)}
            className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all ${
              activeId === r.id
                ? 'bg-base-200 text-base-content font-medium'
                : 'text-base-content/40 hover:text-base-content/70 hover:bg-base-200/50'
            }`}
          >
            {(r.status === 'pending' || r.status === 'processing') && (
              <span className="loading loading-spinner loading-xs opacity-50" />
            )}
            {r.status === 'done' && (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 text-success shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
            {r.status === 'error' && (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 text-error shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            <span className="truncate max-w-[100px]">
              {r.status === 'done'
                ? r.filename.replace(/\.[^/.]+$/, '')
                : (r.file?.name ?? r.filename).replace(/\.[^/.]+$/, '')}
            </span>
          </button>
        ))}
      </div>

      {/* Right slot — e.g. Download All */}
      {rightAction && <div className="shrink-0">{rightAction}</div>}
    </div>
  )
}
