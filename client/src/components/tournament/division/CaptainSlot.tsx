import { useState } from 'react'
import { Loader2, Plus, Trash2, Eye, EyeOff, Pencil, Check, X, RefreshCw, Link2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { type Captain } from '@/api/auctions'
import { CLASSES, CLASS_ICON, CLASS_COLOR, type ClassKey } from '@/components/tournament/shared'

// ─── Captain class picker ─────────────────────────────────────────────────────

function ClassPicker({ value, onChange }: {
  value: ClassKey | null
  onChange: (v: ClassKey | null) => void
}) {
  const colorMap = CLASS_COLOR
  return (
    <div className="flex gap-1">
      {CLASSES.map(c => {
        const Icon = CLASS_ICON[c]
        const active = value === c
        return (
          <button key={c} onClick={() => onChange(active ? null : c)} title={c}
            className={cn('w-8 h-8 flex items-center justify-center rounded-lg border transition-all',
              active ? colorMap[c] : 'text-zinc-600 border-zinc-800 hover:border-zinc-600')}>
            <Icon className="w-5 h-5" />
          </button>
        )
      })}
    </div>
  )
}

// ─── Captain slot ─────────────────────────────────────────────────────────────

export default function CaptainSlot({ index, captain, canManage, isAuctioneer, showToken, onToggleShow, onAdd, onUpdate, onRemove, onGenToken, onRevokeToken }: {
  index: number
  captain: Captain | undefined
  canManage: boolean
  isAuctioneer: boolean
  showToken: boolean
  onToggleShow: () => void
  onAdd: (data: { display_name: string; team_name?: string; budget: number; class: ClassKey | null }) => Promise<void>
  onUpdate: (id: number, data: { display_name?: string; team_name?: string | null; budget?: number; class?: ClassKey | null }) => Promise<void>
  onRemove: (id: number) => Promise<void>
  onGenToken: (id: number) => Promise<void>
  onRevokeToken: (id: number) => Promise<void>
}) {
  const [editing,      setEditing]      = useState(false)
  const [editName,     setEditName]     = useState('')
  const [editTeamName, setEditTeamName] = useState('')
  const [editBudget,   setEditBudget]   = useState('')
  const [fillName,     setFillName]     = useState('')
  const [fillTeamName, setFillTeamName] = useState('')
  const [fillBudget,   setFillBudget]   = useState('20')
  const [fillClass,    setFillClass]    = useState<ClassKey | null>(null)
  const [saving,       setSaving]       = useState(false)
  const [tokenBusy,    setTokenBusy]    = useState(false)
  const [urlCopied,    setUrlCopied]    = useState(false)

  function copyLoginUrl() {
    if (!captain?.token) return
    navigator.clipboard.writeText(`${window.location.origin}/join?t=${captain.token}`)
    setUrlCopied(true)
    setTimeout(() => setUrlCopied(false), 2000)
  }
  const num = index + 1

  async function handleAdd() {
    if (!fillName.trim() || saving) return
    setSaving(true)
    try {
      await onAdd({
        display_name: fillName.trim(),
        team_name: fillTeamName.trim() || undefined,
        budget: Number(fillBudget) || 20,
        class: fillClass,
      })
      setFillName(''); setFillTeamName(''); setFillBudget('20'); setFillClass(null)
    } finally { setSaving(false) }
  }

  async function handleSaveEdit() {
    if (!captain || saving) return
    setSaving(true)
    try {
      await onUpdate(captain.id, {
        display_name: editName.trim(),
        team_name: editTeamName.trim() || null,
        budget: Number(editBudget) || captain.budget,
      })
      setEditing(false)
    } finally { setSaving(false) }
  }

  async function handleGenToken() {
    if (!captain) return
    setTokenBusy(true)
    try { await onGenToken(captain.id) } finally { setTokenBusy(false) }
  }

  async function handleRevokeToken() {
    if (!captain) return
    setTokenBusy(true)
    try { await onRevokeToken(captain.id) } finally { setTokenBusy(false) }
  }

  const tokenSuffix = captain?.token?.replace(/^DRAFT-/, '')

  const NumCell = () => (
    <div className="w-7 flex-shrink-0 flex items-center justify-center self-stretch border-r border-zinc-800/50">
      <span className="text-xs font-mono text-zinc-700">{num}</span>
    </div>
  )

  // ── Empty slot ──
  if (!captain) {
    return (
      <div className="flex items-stretch border-b border-zinc-800/60 last:border-0">
        <NumCell />
        {canManage ? (
          <div className="flex-1 flex flex-wrap items-center gap-1.5 px-2 py-2">
            <input value={fillName} onChange={e => setFillName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder="Name…"
              className="flex-1 min-w-[8rem] px-2 py-1 rounded-lg bg-zinc-800/50 border border-zinc-800 text-sm text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-amber-500/30 transition-colors" />
            <input value={fillTeamName} onChange={e => setFillTeamName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder="Team name…"
              className="flex-1 min-w-[8rem] px-2 py-1 rounded-lg bg-zinc-800/50 border border-zinc-800 text-sm text-zinc-400 placeholder:text-zinc-700 focus:outline-none focus:border-amber-500/30 transition-colors" />
            <input value={fillBudget} onChange={e => setFillBudget(e.target.value)}
              type="number" step="0.1" min="0"
              className="w-20 px-2 py-1 rounded-lg bg-zinc-800/50 border border-zinc-800 text-sm font-mono text-zinc-500 focus:outline-none focus:border-amber-500/30 transition-colors" />
            <ClassPicker value={fillClass} onChange={setFillClass} />
            <button onClick={handleAdd} disabled={saving || !fillName.trim()}
              className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition-colors disabled:opacity-40">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            </button>
          </div>
        ) : (
          <div className="flex-1 px-3 py-3">
            <span className="text-sm text-zinc-700 italic">Empty</span>
          </div>
        )}
      </div>
    )
  }

  // ── Edit mode ──
  if (editing) {
    return (
      <div className="flex items-stretch border-b border-zinc-800/60 last:border-0">
        <NumCell />
        <div className="flex-1 flex flex-col gap-1.5 px-2 py-2">
          <input value={editName} onChange={e => setEditName(e.target.value)} autoFocus
            onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') setEditing(false) }}
            placeholder="Display name"
            className="px-2 py-1 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-100 focus:outline-none" />
          <input value={editTeamName} onChange={e => setEditTeamName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') setEditing(false) }}
            placeholder="Team name (e.g. Team A)"
            className="px-2 py-1 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-400 focus:outline-none" />
          <input value={editBudget} onChange={e => setEditBudget(e.target.value)}
            type="number" step="0.1" min="0"
            className="w-20 px-2 py-1 rounded-lg bg-zinc-800 border border-zinc-700 text-sm font-mono text-zinc-400 focus:outline-none" />
        </div>
        <div className="flex items-center gap-1 px-2 border-l border-zinc-800/50 flex-shrink-0">
          <button onClick={handleSaveEdit} disabled={saving}
            className="p-1.5 text-green-400 hover:bg-green-400/10 rounded transition-colors">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          </button>
          <button onClick={() => setEditing(false)}
            className="p-1.5 text-zinc-500 hover:bg-zinc-800 rounded transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    )
  }

  // ── Filled slot ──
  return (
    <div className="flex items-stretch border-b border-zinc-800/60 last:border-0 group">
      <NumCell />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 px-2 pt-2 pb-1.5">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-zinc-200 truncate">{captain.display_name}</p>
            <p className="text-xs text-zinc-500 truncate">
              {captain.team_name ?? `${captain.display_name}'s team`}
            </p>
            <p className="text-xs font-mono text-zinc-600">{captain.budget}</p>
          </div>
          {canManage
            ? <ClassPicker value={captain.class} onChange={cls => onUpdate(captain.id, { class: cls })} />
            : captain.class
              ? (() => {
                  const I = CLASS_ICON[captain.class!]
                  const boxCls = CLASS_COLOR[captain.class!]
                  return (
                    <div className={cn('w-8 h-8 flex items-center justify-center rounded-lg border mr-1.5', boxCls)}>
                      <I className="w-5 h-5" />
                    </div>
                  )
                })()
              : null
          }
        </div>
        {!isAuctioneer && (
        <div className="flex items-center gap-1.5 px-2 pb-2 border-t border-zinc-800/40 pt-1">
          {captain.token ? (
            <>
              <code className="text-xs font-mono text-zinc-600">DRAFT-</code>
              <code className="text-xs font-mono text-zinc-400 tracking-widest">
                {showToken ? tokenSuffix : '••••••'}
              </code>
              <button onClick={onToggleShow}
                className="text-zinc-600 hover:text-zinc-300 transition-colors ml-0.5">
                {showToken ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              </button>
              <button onClick={copyLoginUrl} title="Copy login URL"
                className="text-zinc-600 hover:text-zinc-300 transition-colors ml-0.5">
                {urlCopied ? <Check className="w-3 h-3 text-green-400" /> : <Link2 className="w-3 h-3" />}
              </button>
            </>
          ) : (
            <span className="text-xs text-zinc-700 italic">No token</span>
          )}
          {canManage && (
            <div className="ml-auto flex items-center gap-1">
              <button onClick={handleGenToken} disabled={tokenBusy}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs transition-colors disabled:opacity-40">
                {tokenBusy ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <RefreshCw className="w-2.5 h-2.5" />}
                {captain.token ? 'Regen' : 'Gen'}
              </button>
              {captain.token && (
                <button onClick={handleRevokeToken} disabled={tokenBusy}
                  className="px-1.5 py-0.5 rounded text-zinc-600 hover:text-red-400 hover:bg-red-400/10 text-xs transition-colors disabled:opacity-40">
                  Revoke
                </button>
              )}
            </div>
          )}
        </div>
        )}
      </div>

      {canManage && (
        <div className="flex flex-col items-center justify-center gap-1 px-1.5 border-l border-transparent group-hover:border-zinc-800/50 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
          <button
            onClick={() => {
              setEditName(captain.display_name)
              setEditTeamName(captain.team_name ?? '')
              setEditBudget(String(captain.budget))
              setEditing(true)
            }}
            className="p-1.5 hover:bg-zinc-700 text-zinc-600 hover:text-zinc-300 rounded transition-colors">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onRemove(captain.id)}
            className="p-1.5 hover:bg-red-400/10 text-zinc-600 hover:text-red-400 rounded transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
