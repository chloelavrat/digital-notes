import { useState, useEffect, useCallback } from 'react'
import Uploader from './components/Uploader'
import Processing from './components/Processing'
import Result from './components/Result'

function App() {
  const [step, setStep] = useState('upload')
  const [results, setResults] = useState([])
  const [activeId, setActiveId] = useState(0)
  const [error, setError] = useState(null)
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('dn-theme') || 'light' } catch { return 'light' }
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try { localStorage.setItem('dn-theme', theme) } catch {}
  }, [theme])

  const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light')

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

  const handleFiles = useCallback((uploadedFiles) => {
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

  const shared = { theme, onToggleTheme: toggleTheme }

  if (step === 'upload') {
    return <Uploader onFiles={handleFiles} error={error} {...shared} />
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
