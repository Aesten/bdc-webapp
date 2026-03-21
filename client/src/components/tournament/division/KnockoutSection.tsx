import { useEffect, useState } from 'react'
import { Loader2, Check, Crown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { type Captain } from '@/api/auctions'
import { type Match } from '@/api/brackets'
import { resolveTeam } from '@/components/tournament/GroupStageView'

// ─── Bracket section wrapper ──────────────────────────────────────────────────

export function BracketSection({ title, children }: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl">
      <div className="px-4 py-2.5 border-b border-zinc-800">
        <span className="text-xs font-mono uppercase tracking-widest text-zinc-500">{title}</span>
      </div>
      {children}
    </div>
  )
}

// ─── Knockout score row ───────────────────────────────────────────────────────

export function KnockoutScoreRow({ match, captains, canManage, onSave, showLabel = true }: {
  match: Match
  captains: Captain[]
  canManage: boolean
  onSave: (id: number, a: number, b: number) => Promise<void>
  showLabel?: boolean
}) {
  const [localA, setLocalA] = useState(match.score_a !== null ? String(match.score_a) : '')
  const [localB, setLocalB] = useState(match.score_b !== null ? String(match.score_b) : '')
  const [dirty,  setDirty]  = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!dirty) {
      setLocalA(match.score_a !== null ? String(match.score_a) : '')
      setLocalB(match.score_b !== null ? String(match.score_b) : '')
    }
  }, [match.score_a, match.score_b]) // eslint-disable-line react-hooks/exhaustive-deps

  const nameA  = match.team_a_name ?? resolveTeam(match.captain_a_id, captains) ?? 'TBD'
  const nameB  = match.team_b_name ?? resolveTeam(match.captain_b_id, captains) ?? 'TBD'
  const tdA    = !match.captain_a_id
  const tdB    = !match.captain_b_id
  const winA   = match.winner_captain_id === match.captain_a_id && match.captain_a_id !== null
  const winB   = match.winner_captain_id === match.captain_b_id && match.captain_b_id !== null
  const played = match.status === 'played'

  async function confirm() {
    if (!dirty || saving) return
    setSaving(true)
    try {
      await onSave(match.id, Number(localA) || 0, Number(localB) || 0)
      setDirty(false)
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-0.5">
      {showLabel && <p className="text-[10px] font-mono text-zinc-600 truncate">{match.match_label}</p>}
      <div className={cn('flex items-center gap-1 px-2 py-1 rounded-lg border',
        played ? 'border-zinc-700/60 bg-zinc-950/80' : 'border-zinc-800/50 bg-zinc-950/40')}>
        <span className="w-2.5 flex-shrink-0 flex items-center">
          {winA && <Crown className="w-2.5 h-2.5 text-amber-400" />}
        </span>
        <span className={cn('text-xs text-right flex-1 min-w-0 truncate',
          winA ? 'text-amber-400 font-semibold' : tdA ? 'text-zinc-600 italic' : 'text-zinc-300')}>
          {nameA}
        </span>
        {canManage ? (
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <input value={localA} onChange={e => { setLocalA(e.target.value); setDirty(true) }}
              type="number" min="0" disabled={tdA || tdB}
              className="w-7 text-center text-xs font-mono bg-zinc-800 border border-zinc-700 rounded py-0.5 text-zinc-100 focus:outline-none focus:border-amber-500/50 [appearance:textfield] disabled:opacity-30" />
            <span className="text-zinc-600 text-[10px]">-</span>
            <input value={localB} onChange={e => { setLocalB(e.target.value); setDirty(true) }}
              type="number" min="0" disabled={tdA || tdB}
              className="w-7 text-center text-xs font-mono bg-zinc-800 border border-zinc-700 rounded py-0.5 text-zinc-100 focus:outline-none focus:border-amber-500/50 [appearance:textfield] disabled:opacity-30" />
          </div>
        ) : (
          <span className={cn('text-[10px] font-mono flex-shrink-0 tabular-nums w-8 text-center',
            played ? 'text-zinc-400' : 'text-zinc-700')}>
            {played ? `${match.score_a}-${match.score_b}` : '—'}
          </span>
        )}
        <span className={cn('text-xs flex-1 min-w-0 truncate',
          winB ? 'text-amber-400 font-semibold' : tdB ? 'text-zinc-600 italic' : 'text-zinc-300')}>
          {nameB}
        </span>
        <span className="w-2.5 flex-shrink-0 flex items-center">
          {winB && <Crown className="w-2.5 h-2.5 text-amber-400" />}
        </span>
        {canManage && (
          <button onClick={confirm} disabled={saving || !dirty || tdA || tdB}
            className={cn('flex-shrink-0 w-4 h-4 flex items-center justify-center rounded transition-colors',
              saving ? 'text-zinc-500' :
              played && !dirty ? 'text-green-500' :
              dirty && !tdA && !tdB ? 'text-amber-400 hover:bg-amber-400/10' :
              'text-zinc-800 cursor-not-allowed')}>
            {saving ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Check className="w-2.5 h-2.5" />}
          </button>
        )}
        {!canManage && played && <Check className="w-2.5 h-2.5 text-green-500 flex-shrink-0" />}
      </div>
    </div>
  )
}
