import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { tournamentsApi, type Tournament } from '@/api/tournaments'
import { authApi } from '@/api/auth'
import { useAuth } from '@/context/AuthContext'
import { Loader2, Eye, EyeOff, Key, ShieldOff, RefreshCw, LogIn, Users } from 'lucide-react'
import { SectionLabel, inputCls, type ViewRole } from './shared'
import { useToast } from '@/context/ToastContext'

// ─── Token row ────────────────────────────────────────────────────────────────

function TokenRow({ token, busy, onGenerate, onRevoke, loginLabel, onLoginAs }: {
  token: string | null
  busy: boolean
  onGenerate: () => Promise<void>
  onRevoke: () => Promise<void>
  loginLabel?: string
  onLoginAs?: () => Promise<void>
}) {
  const [show,        setShow]        = useState(false)
  const [loginBusy,   setLoginBusy]   = useState(false)

  async function handleLoginAs() {
    if (!onLoginAs) return
    setLoginBusy(true)
    try { await onLoginAs() }
    finally { setLoginBusy(false) }
  }

  // Tokens are in the format DRAFT-XXXXXX — show prefix, hide/reveal the 6-char suffix
  const suffix = token ? token.replace(/^DRAFT-/, '') : null

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 p-3 rounded-xl bg-zinc-900 border border-zinc-800">
        {/* Token value */}
        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          {token ? (
            <>
              <code className="text-xs font-mono text-zinc-500">DRAFT-</code>
              <code className="text-xs font-mono text-zinc-300 tracking-widest">
                {show ? suffix : '••••••'}
              </code>
              <button onClick={() => setShow(s => !s)} className="text-zinc-600 hover:text-zinc-300 transition-colors flex-shrink-0 ml-1">
                {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </>
          ) : (
            <p className="text-xs text-zinc-700 italic">No token</p>
          )}
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button onClick={onGenerate} disabled={busy}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors disabled:opacity-40">
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : token ? <RefreshCw className="w-3 h-3" /> : <Key className="w-3 h-3" />}
            {token ? 'Regenerate' : 'Generate'}
          </button>
          {token && (
            <button onClick={onRevoke} disabled={busy}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-red-400/10 text-zinc-600 hover:text-red-400 text-xs font-medium transition-colors">
              <ShieldOff className="w-3 h-3" /> Revoke
            </button>
          )}
        </div>
      </div>

      {/* Login as */}
      {token && onLoginAs && (
        <button onClick={handleLoginAs} disabled={loginBusy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700 text-xs transition-colors disabled:opacity-40">
          {loginBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <LogIn className="w-3 h-3" />}
          {loginLabel ?? 'Sign in as this role'}
        </button>
      )}
    </div>
  )
}

// ─── Description editor ───────────────────────────────────────────────────────

function DescriptionEditor({ project, onSave, saving, setSaving }: {
  project: Tournament; onSave: (p: Tournament) => void; saving: boolean; setSaving: (v: boolean) => void
}) {
  const [desc, setDesc] = useState(project.description ?? '')
  const dirty = desc !== (project.description ?? '')

  async function save() {
    setSaving(true)
    try { const updated = await tournamentsApi.update(project.slug, { description: desc }); onSave(updated) }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-2">
      <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3}
        placeholder="Short description shown on the public page…"
        className={inputCls + ' resize-none'} />
      {dirty && (
        <button onClick={save} disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition-colors disabled:opacity-40">
          {saving && <Loader2 className="w-3 h-3 animate-spin" />} Save
        </button>
      )}
    </div>
  )
}

// ─── Config tab ───────────────────────────────────────────────────────────────

export default function ConfigTab({ project, onProjectUpdate, role }: {
  project: Tournament; onProjectUpdate: (p: Tournament) => void; role: ViewRole
}) {
  const navigate = useNavigate()
  const { refresh } = useAuth()
  const { toast } = useToast()
  const [saving,   setSaving]   = useState(false)
  const [auctBusy, setAuctBusy] = useState(false)
  const [hostBusy, setHostBusy] = useState(false)
  const [pptEdit,  setPptEdit]  = useState(false)
  const [pptVal,   setPptVal]   = useState(String(project.players_per_team ?? 6))
  const canManage = role === 'admin' || role === 'host'

  async function savePpt() {
    const n = Math.max(1, parseInt(pptVal) || 6)
    const updated = await tournamentsApi.update(project.slug, { players_per_team: n })
    onProjectUpdate(updated)
    setPptEdit(false)
    toast('Players per team updated')
  }

  return (
    <div className="space-y-8">

      {/* Admin-only: host token — highlighted with amber tint */}
      {role === 'admin' && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
          <div className="flex items-center gap-2 mb-1">
            <SectionLabel>Host token</SectionLabel>
            <span className="text-[9px] font-mono uppercase tracking-widest text-amber-600/60 mb-2">admin only</span>
          </div>
          <p className="text-xs text-zinc-600 mb-3">Share with the host to let them sign in</p>
          <TokenRow
            token={project.host_token ?? null}
            busy={hostBusy}
            onGenerate={async () => {
              setHostBusy(true)
              try { const r = await authApi.generateHostToken(project.slug); onProjectUpdate({ ...project, host_token: r.token }) }
              finally { setHostBusy(false) }
            }}
            onRevoke={async () => {
              setHostBusy(true)
              try { await authApi.revokeHostToken(project.slug); onProjectUpdate({ ...project, host_token: null }) }
              finally { setHostBusy(false) }
            }}
            loginLabel="Sign in as host →"
            onLoginAs={async () => {
              if (!project.host_token) return
              await authApi.loginHost(project.host_token)
              await refresh()
              navigate('/host')
            }}
          />
        </div>
      )}

      <div>
        <SectionLabel>Auctioneer token</SectionLabel>
        <p className="text-xs text-zinc-600 mb-3">Shared by all auctioneers for this tournament</p>
        {canManage
          ? <TokenRow
              token={project.auctioneer_token ?? null}
              busy={auctBusy}
              onGenerate={async () => {
                setAuctBusy(true)
                try { const r = await authApi.generateAuctioneerToken(project.slug); onProjectUpdate({ ...project, auctioneer_token: r.token }) }
                finally { setAuctBusy(false) }
              }}
              onRevoke={async () => {
                setAuctBusy(true)
                try { await authApi.revokeAuctioneerToken(project.slug); onProjectUpdate({ ...project, auctioneer_token: null }) }
                finally { setAuctBusy(false) }
              }}
              loginLabel="Sign in as auctioneer →"
              onLoginAs={async () => {
                if (!project.auctioneer_token) return
                await authApi.loginAuctioneer(project.auctioneer_token)
                await refresh()
                navigate('/auctioneer')
              }}
            />
          : <p className="text-sm text-zinc-500">{project.auctioneer_token ? 'Token set' : 'No token — contact host or admin'}</p>
        }
      </div>

      {canManage && (
        <div>
          <SectionLabel>Players per team</SectionLabel>
          <p className="text-xs text-zinc-600 mb-3">Number of players each captain must draft (excludes captain themselves)</p>
          <div className="flex items-center gap-3">
            <Users className="w-4 h-4 text-zinc-600 flex-shrink-0" />
            {pptEdit ? (
              <div className="flex items-center gap-2">
                <input value={pptVal} onChange={e => setPptVal(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') savePpt(); if (e.key === 'Escape') setPptEdit(false) }}
                  type="number" min={1} autoFocus
                  className="w-20 px-2 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-sm font-mono text-zinc-100 focus:outline-none focus:border-amber-500/40" />
                <button onClick={savePpt}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition-colors">
                  Save
                </button>
                <button onClick={() => { setPptEdit(false); setPptVal(String(project.players_per_team ?? 6)) }}
                  className="px-3 py-1.5 rounded-lg text-zinc-600 hover:text-zinc-400 text-xs transition-colors">
                  Cancel
                </button>
              </div>
            ) : (
              <button onClick={() => setPptEdit(true)}
                className="text-sm font-mono text-zinc-300 hover:text-zinc-100 transition-colors">
                {project.players_per_team ?? 6} <span className="text-zinc-600">— click to edit</span>
              </button>
            )}
          </div>
        </div>
      )}

      {canManage && (
        <div>
          <SectionLabel>Tournament description</SectionLabel>
          <DescriptionEditor project={project} onSave={onProjectUpdate} saving={saving} setSaving={setSaving} />
        </div>
      )}
    </div>
  )
}
