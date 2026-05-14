import { useState } from 'react'
import ThemeToggle from './ThemeToggle'

export default function LoginModal({ onSuccess, theme, onToggleTheme }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState(null)
  const [loading, setLoading]   = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Login failed')
      onSuccess()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-base-100 flex flex-col items-center justify-center px-6 select-none z-50">
      <ThemeToggle theme={theme} onToggle={onToggleTheme} className="absolute top-4 right-4" />

      <h1
        className="text-base-content text-4xl sm:text-5xl mb-3 text-center tracking-tight"
        style={{ fontFamily: '"Sligoil Micro", sans-serif' }}
      >
        Digital Notes
      </h1>
      <p className="text-base-content/35 text-sm mb-12 text-center">
        Sign in to continue
      </p>

      <form onSubmit={submit} className="flex flex-col gap-3 w-full max-w-xs">
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="input input-sm w-full border border-base-content/12 bg-base-200/40 focus:border-base-content/30 focus:outline-none"
          autoComplete="username"
          autoFocus
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input input-sm w-full border border-base-content/12 bg-base-200/40 focus:border-base-content/30 focus:outline-none"
          autoComplete="current-password"
          required
        />

        {error && (
          <p className="text-xs text-error/80 px-0.5">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="btn btn-sm bg-neutral text-neutral-content hover:bg-neutral/85 border-0 gap-2 mt-1"
        >
          {loading && <span className="loading loading-spinner loading-xs" />}
          Sign in
        </button>
      </form>
    </div>
  )
}
