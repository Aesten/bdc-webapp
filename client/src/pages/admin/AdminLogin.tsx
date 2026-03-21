import { useState } from 'react'
import { useTitle } from '@/hooks/useTitle'
import { authApi } from '@/api/auth'
import { ApiError } from '@/api/client'
import { Loader2, AlertCircle } from 'lucide-react'
import logo from '@/assets/logos/bdc_logo_nobg.png'

export default function AdminLogin({ onSuccess }: { onSuccess: () => void }) {
  useTitle('Admin Sign In')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  async function submit() {
    if (!password) return
    setLoading(true); setError('')
    try {
      await authApi.loginAdmin(password)
      onSuccess()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Login failed')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-xs">
        <div className="text-center mb-8">
          <div className="inline-block mb-1">
            <img src={logo} alt="BDC" className="h-12 w-auto" />
          </div>
          <p className="text-xs font-mono uppercase tracking-widest text-zinc-600 mt-1">Admin Console</p>
        </div>

        {/* Isolated form with a unique id keeps admin credentials separate from host credentials */}
        <form
          id="admin-console-login"
          onSubmit={e => { e.preventDefault(); submit() }}
          autoComplete="on"
          className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3"
        >
          <input
            name="admin-console-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Admin password"
            autoFocus
            className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
          />
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-400 bg-red-400/8 border border-red-400/20 rounded-xl px-3.5 py-2.5">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
            </div>
          )}
          <button type="submit" disabled={loading || !password}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-700 text-zinc-100 text-sm font-semibold hover:bg-zinc-600 transition-colors disabled:opacity-40">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Enter console
          </button>
        </form>

        <p className="text-center mt-4">
          <a href="/login" className="text-xs text-zinc-700 hover:text-zinc-500 transition-colors font-mono">
            ← back to login
          </a>
        </p>
      </div>
    </div>
  )
}