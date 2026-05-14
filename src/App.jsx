import { useState, useEffect, useCallback } from 'react'
import Uploader from './components/Uploader'
import Processing from './components/Processing'
import Result from './components/Result'
import LoginModal from './components/LoginModal'

// ── Cookie helpers ────────────────────────────────────────────────
const getCookie = (name) => {
  try {
    const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
    return m ? decodeURIComponent(m[1]) : null
  } catch { return null }
}
const setCookie = (name, value, days = 365) => {
  try {
    const exp = new Date(Date.now() + days * 864e5).toUTCString()
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${exp}; path=/; SameSite=Lax`
  } catch {}
}

function App() {
  const [step, setStep] = useState('upload')
  const [results, setResults] = useState([])
  const [activeId, setActiveId] = useState(0)
  const [error, setError] = useState(null)

  // Theme: cookie wins → else follow system preference
  const [theme, setTheme] = useState(() => {
    const saved = getCookie('dn-theme')
    if (saved) return saved
    try { return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light' }
    catch { return 'light' }
  })

  // Auth
  const [authRequired, setAuthRequired]   = useState(false)
  const [authenticated, setAuthenticated] = useState(false)
  const [showLogin, setShowLogin]         = useState(false)
  const [pendingAction, setPendingAction] = useState(null) // fn to call after login

  useEffect(() => {
    fetch('/api/auth/check')
      .then(r => r.json())
      .then(({ required, authenticated }) => {
        setAuthRequired(required)
        setAuthenticated(authenticated)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // Follow system changes only when user hasn't overridden manually
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e) => {
      if (!getCookie('dn-theme')) setTheme(e.matches ? 'dark' : 'light')
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Manual toggle → persist in cookie
  const toggleTheme = () => setTheme(t => {
    const next = t === 'light' ? 'dark' : 'light'
    setCookie('dn-theme', next)
    return next
  })

  const updateResult = useCallback((id, updates) => {
    setResults(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r))
  }, [])

  const processOneFile = useCallback(async (id, file) => {
    updateResult(id, { status: 'processing' })
    const body = new FormData()
    body.append('file', file)

    try {
      const res = await fetch('/api/process', { method: 'POST', body })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Processing failed')
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = JSON.parse(line.slice(6))
          if (data.error) throw new Error(data.error)
          if (data.done) {
            updateResult(id, {
              markdown: data.markdown ?? accumulated,
              filename: data.filename || file.name.replace(/\.[^/.]+$/, '') + '.md',
              status: 'done',
            })
            return
          }
          if (data.text) {
            accumulated += data.text
            updateResult(id, { streamingText: accumulated })
          }
        }
      }
    } catch (err) {
      updateResult(id, { status: 'error', error: err.message })
    }
  }, [updateResult])

  // Core processing — no auth check, called after login too
  const processFiles = useCallback((uploadedFiles) => {
    setError(null)
    const items = uploadedFiles.map((file, i) => ({
      id: i,
      file,
      filename: file.name,
      markdown: '',
      streamingText: '',
      status: 'pending',
      error: null,
    }))
    setResults(items)
    setActiveId(0)
    setStep('processing')
    items.forEach(item => processOneFile(item.id, item.file))
  }, [processOneFile])

  // Guard any UI action behind auth — call at click time, not at processing time
  const guardAction = useCallback((action) => {
    if (authRequired && !authenticated) {
      setPendingAction(() => action) // store fn (wrap in arrow so useState doesn't call it)
      setShowLogin(true)
      return
    }
    action()
  }, [authRequired, authenticated])

  const handleFiles = useCallback((uploadedFiles) => {
    processFiles(uploadedFiles)
  }, [processFiles])

  // Transition to Result as soon as the first file is done
  useEffect(() => {
    if (step !== 'processing' || results.length === 0) return

    const firstDone = results.find(r => r.status === 'done')
    if (firstDone) {
      setActiveId(firstDone.id)
      setStep('result')
      return
    }

    // If every file errored, go back to upload
    if (results.every(r => r.status === 'error')) {
      setError('All files failed to process. Please try again.')
      setStep('upload')
      setResults([])
    }
  }, [results, step])

  const reset = () => {
    setStep('upload')
    setResults([])
    setActiveId(0)
    setError(null)
  }

  const handleLoginSuccess = useCallback(() => {
    setAuthenticated(true)
    setShowLogin(false)
    if (pendingAction) {
      pendingAction() // re-run the intercepted action (open picker, stage files, etc.)
      setPendingAction(null)
    }
  }, [pendingAction])

  const shared = { theme, onToggleTheme: toggleTheme }

  if (showLogin) {
    return <LoginModal onSuccess={handleLoginSuccess} {...shared} />
  }

  if (step === 'upload') {
    return <Uploader onFiles={handleFiles} onGuard={guardAction} error={error} {...shared} />
  }
  if (step === 'processing') {
    return (
      <Processing
        results={results}
        activeId={activeId}
        onSelectFile={setActiveId}
        {...shared}
      />
    )
  }
  return (
    <Result
      results={results}
      activeId={activeId}
      onSelectFile={setActiveId}
      onMarkdownChange={(id, md) => updateResult(id, { markdown: md })}
      onReset={reset}
      {...shared}
    />
  )
}

export default App
