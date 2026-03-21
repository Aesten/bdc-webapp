import { useState } from 'react'
import { useTitle } from '@/hooks/useTitle'
import { Link } from 'react-router-dom'
import { authApi } from '@/api/auth'
import { ApiError } from '@/api/client'
import { cn } from '@/lib/utils'
import { Loader2, AlertCircle } from 'lucide-react'
import logo from '@/assets/logos/bdc_logo_nobg.png'

type LoginTab = 'host' | 'auctioneer' | 'captain'
const TABS: { id: LoginTab; label: string }[] = [
  { id: 'host',       label: 'Host'       },
  { id: 'auctioneer', label: 'Auctioneer' },
  { id: 'captain',    label: 'Captain'    },
]


function TokenForm({ label, onSubmit, submitLabel }: {
  label: string; onSubmit: (code: string) => Promise<void>; submitLabel: string
}) {
  const [suffix, setSuffix] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]    = useState('')
  const clean = suffix.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 6)

  async function submit() {
    if (clean.length < 6) return
    setLoading(true); setError('')
    try { await onSubmit(`DRAFT-${clean}`) }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Invalid code') }
    finally { setLoading(false) }
  }

  return (
    <form onSubmit={e => { e.preventDefault(); submit() }} autoComplete="off" className="space-y-3">
      <Field label={label}>
        <div className="flex items-center rounded-xl overflow-hidden border border-zinc-800 focus-within:border-amber-500/50 focus-within:ring-1 focus-within:ring-amber-500/20 transition-colors bg-zinc-900">
          <span className="pl-3.5 pr-1 text-sm font-mono text-zinc-500 select-none flex-shrink-0">DRAFT-</span>
          <input value={clean} onChange={e => setSuffix(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder="XXXXXX" maxLength={6} spellCheck={false} autoComplete="off"
            className="flex-1 py-2.5 bg-transparent text-sm font-mono tracking-widest text-zinc-100 placeholder:text-zinc-600 focus:outline-none" />
          <span className={cn('pr-3 text-xs font-mono tabular-nums transition-colors', clean.length === 6 ? 'text-amber-500' : 'text-zinc-700')}>
            {clean.length}/6
          </span>
        </div>
      </Field>
      {error && <ErrorMsg msg={error} />}
      <SubmitBtn loading={loading} disabled={clean.length < 6}>{submitLabel}</SubmitBtn>
    </form>
  )
}


function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[10px] font-mono uppercase tracking-widest text-zinc-500">{label}</label>
      {children}
    </div>
  )
}

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-red-400 bg-red-400/8 border border-red-400/20 rounded-xl px-3.5 py-2.5">
      <AlertCircle className="w-4 h-4 flex-shrink-0" />{msg}
    </div>
  )
}

function SubmitBtn({ children, loading, disabled }: { children: React.ReactNode; loading: boolean; disabled: boolean }) {
  return (
    <button type="submit" disabled={loading || disabled}
      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 text-black text-sm font-semibold hover:bg-amber-400 active:scale-[.98] transition-all disabled:opacity-40 disabled:pointer-events-none">
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}{children}
    </button>
  )
}

export default function Login({ onSuccess }: { onSuccess: () => void }) {
  useTitle('Sign In')
  const [tab, setTab] = useState<LoginTab>('host')

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full bg-amber-500/5 blur-3xl" />
      </div>

      <div className="w-full max-w-sm relative">
        {/* Logo — clickable to home */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-block mb-3">
            <img src={logo} alt="BDC" className="h-12 w-auto" />
          </Link>
          <p className="text-xs font-mono uppercase tracking-widest text-zinc-600">Tournament Platform</p>
        </div>

        <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 shadow-2xl backdrop-blur-sm">
          <div className="flex rounded-xl bg-zinc-950 p-1 gap-0.5 mb-5">
            {TABS.map(t => (
              <button key={t.id} type="button" onClick={() => setTab(t.id)}
                className={cn('flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all',
                  tab === t.id ? 'bg-zinc-800 text-zinc-100 shadow-sm' : 'text-zinc-600 hover:text-zinc-400')}>
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'host'       && <TokenForm label="Host Code"     submitLabel="Sign in"          onSubmit={c => authApi.loginHost(c).then(onSuccess)} />}
          {tab === 'auctioneer' && <TokenForm label="Project Code"  submitLabel="Enter session"    onSubmit={c => authApi.loginAuctioneer(c).then(onSuccess)} />}
          {tab === 'captain'    && <TokenForm label="Captain Code"  submitLabel="Join tournament"  onSubmit={c => authApi.loginCaptain(c).then(onSuccess)} />}
        </div>

        {/* Below-card links */}
        <div className="flex items-center justify-between mt-4 px-1">
          <Link to="/" className="text-xs text-zinc-700 hover:text-zinc-500 transition-colors font-mono">← home</Link>
          <a href="/admin-login" className="text-xs text-zinc-700 hover:text-zinc-500 transition-colors font-mono">admin →</a>
        </div>
      </div>
    </div>
  )
}