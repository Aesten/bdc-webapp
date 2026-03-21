import { useEffect, useState } from 'react'
import { type Match } from '@/api/brackets'
import { type Captain } from '@/api/auctions'
import { cn } from '@/lib/utils'
import { Loader2, Check, Crown } from 'lucide-react'

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function resolveTeam(captainId: number | null | undefined, captains: Captain[]): string | null {
  if (!captainId) return null
  const cap = captains.find(c => c.id === captainId)
  if (!cap) return null
  return cap.team_name ?? `${cap.display_name}'s team`
}

function buildPlaceholder(group: 'A' | 'B', captains: Captain[]): Match[] {
  const offset  = group === 'A' ? 0 : 4
  const sorted  = [...captains].sort((a, b) => a.id - b.id)
  const names   = Array.from({ length: 4 }, (_, i) => {
    const cap = sorted[offset + i]
    return cap ? (cap.team_name ?? `${cap.display_name}'s team`) : `Slot ${offset + i + 1}`
  })
  const pairings: [[number, number], [number, number]][] = [
    [[0, 1], [2, 3]],
    [[0, 2], [1, 3]],
    [[0, 3], [1, 2]],
  ]
  const result: Match[] = []
  let id = group === 'A' ? -1 : -7
  for (let r = 0; r < 3; r++) {
    for (let m = 0; m < 2; m++) {
      const [a, b] = pairings[r][m]
      result.push({
        id: id--, bracket_id: -1, round: r + 1, match_order: m,
        match_label: `Group ${group}`, group_label: group,
        captain_a_id: null, captain_b_id: null, matchup_id: null,
        score_a: null, score_b: null, winner_captain_id: null,
        status: 'pending', is_finals: 0,
        team_a_name: names[a], team_b_name: names[b],
      })
    }
  }
  return result
}

// ─── Match row ────────────────────────────────────────────────────────────────

function MatchRow({ match, canManage, captains, onSave }: {
  match: Match
  canManage: boolean
  captains: Captain[]
  onSave: (id: number, a: number, b: number) => Promise<void>
}) {
  const isPlaceholder = match.id < 0
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
  const tdA    = !match.captain_a_id && !match.team_a_name
  const tdB    = !match.captain_b_id && !match.team_b_name
  const winA   = match.winner_captain_id === match.captain_a_id && match.captain_a_id !== null
  const winB   = match.winner_captain_id === match.captain_b_id && match.captain_b_id !== null
  const played = match.status === 'played'
  const canInput = canManage && !isPlaceholder

  async function confirm() {
    if (!dirty || saving) return
    setSaving(true)
    try {
      await onSave(match.id, Number(localA) || 0, Number(localB) || 0)
      setDirty(false)
    } finally { setSaving(false) }
  }

  return (
    <div className={cn('flex items-center gap-1 px-2 py-1 rounded-lg border',
      played ? 'border-zinc-700/60 bg-zinc-950/80' : 'border-zinc-800/50 bg-zinc-950/40',
      isPlaceholder && 'opacity-40'
    )}>
      <span className="w-2.5 flex-shrink-0 flex items-center">
        {winA && <Crown className="w-2.5 h-2.5 text-amber-400" />}
      </span>
      <span className={cn('text-xs text-right flex-1 min-w-0 truncate',
        winA ? 'text-amber-400 font-semibold' : tdA ? 'text-zinc-600 italic' : 'text-zinc-300')}>
        {nameA}
      </span>
      {canInput ? (
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <input value={localA} onChange={e => { setLocalA(e.target.value); setDirty(true) }}
            type="number" min="0"
            className="w-7 text-center text-xs font-mono bg-zinc-800 border border-zinc-700 rounded py-0.5 text-zinc-100 focus:outline-none focus:border-amber-500/50 [appearance:textfield]" />
          <span className="text-zinc-600 text-[10px]">-</span>
          <input value={localB} onChange={e => { setLocalB(e.target.value); setDirty(true) }}
            type="number" min="0"
            className="w-7 text-center text-xs font-mono bg-zinc-800 border border-zinc-700 rounded py-0.5 text-zinc-100 focus:outline-none focus:border-amber-500/50 [appearance:textfield]" />
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
      {canInput && (
        <button onClick={confirm} disabled={saving || !dirty}
          className={cn('flex-shrink-0 w-4 h-4 flex items-center justify-center rounded transition-colors',
            saving ? 'text-zinc-500' :
            played && !dirty ? 'text-green-500' :
            dirty ? 'text-amber-400 hover:bg-amber-400/10' :
            'text-zinc-800 cursor-not-allowed')}>
          {saving ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Check className="w-2.5 h-2.5" />}
        </button>
      )}
      {!canManage && played && <Check className="w-2.5 h-2.5 text-green-500 flex-shrink-0" />}
    </div>
  )
}

// ─── Standings ────────────────────────────────────────────────────────────────

function Standings({ matches, captains }: { matches: Match[]; captains: Captain[] }) {
  type Row = { id: number; name: string; p: number; w: number; l: number; rw: number; rl: number }
  const rows = new Map<number, Row>()

  for (const m of matches) {
    for (const cid of [m.captain_a_id, m.captain_b_id] as (number | null)[]) {
      if (!cid || rows.has(cid)) continue
      const name = resolveTeam(cid, captains) ?? `#${cid}`
      rows.set(cid, { id: cid, name, p: 0, w: 0, l: 0, rw: 0, rl: 0 })
    }
  }

  for (const m of matches) {
    if (m.status !== 'played') continue
    const sa = m.score_a ?? 0; const sb = m.score_b ?? 0
    if (m.captain_a_id && rows.has(m.captain_a_id)) {
      const r = rows.get(m.captain_a_id)!
      r.p++; r.rw += sa; r.rl += sb
      if (sa > sb) r.w++; else if (sb > sa) r.l++
    }
    if (m.captain_b_id && rows.has(m.captain_b_id)) {
      const r = rows.get(m.captain_b_id)!
      r.p++; r.rw += sb; r.rl += sa
      if (sb > sa) r.w++; else if (sa > sb) r.l++
    }
  }

  if (rows.size === 0) return null

  const sorted = [...rows.values()].sort((a, b) => {
    if (b.w !== a.w) return b.w - a.w
    return (b.rw - b.rl) - (a.rw - a.rl)
  })

  return (
    <table className="w-full table-fixed text-xs">
      <colgroup>
        <col className="w-5" />       {/* # */}
        <col className="w-20" />      {/* Team */}
        <col className="w-8" />       {/* P */}
        <col className="w-8" />       {/* W */}
        <col className="w-8" />       {/* L */}
        <col className="w-8" />       {/* RW */}
        <col className="w-8" />       {/* RL */}
        <col className="w-8" />       {/* RD */}
        <col className="w-8" />       {/* Pts */}
      </colgroup>
      <thead>
        <tr className="border-b border-zinc-800">
          <th className="py-1 text-left font-mono uppercase text-zinc-600">#</th>
          <th className="py-1 pl-1 text-left font-mono uppercase text-zinc-600">Team</th>
          {['P','W','L','RW','RL','RD','Pts'].map(h => (
            <th key={h} className="py-1 text-center font-mono uppercase text-zinc-600 tabular-nums">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map((row, i) => (
          <tr key={row.id} className={cn('border-b border-zinc-800/30 last:border-0', i < 2 && 'bg-amber-500/5')}>
            <td className="py-0.5 text-zinc-600 font-mono">{i + 1}</td>
            <td className="py-0.5 pl-1 text-zinc-300 font-medium truncate">{row.name}</td>
            <td className="py-0.5 text-center text-zinc-500 font-mono tabular-nums">{row.p}</td>
            <td className="py-0.5 text-center text-zinc-400 font-mono tabular-nums">{row.w}</td>
            <td className="py-0.5 text-center text-zinc-600 font-mono tabular-nums">{row.l}</td>
            <td className="py-0.5 text-center text-zinc-400 font-mono tabular-nums">{row.rw}</td>
            <td className="py-0.5 text-center text-zinc-600 font-mono tabular-nums">{row.rl}</td>
            <td className="py-0.5 text-center text-zinc-500 font-mono tabular-nums">
              {row.rw - row.rl >= 0 ? '+' : ''}{row.rw - row.rl}
            </td>
            <td className="py-0.5 text-center text-zinc-200 font-mono font-semibold tabular-nums">{row.w * 3}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ─── Group stage view ─────────────────────────────────────────────────────────

export default function GroupStageView({ matches, group, captains, canManage, onResultUpdate }: {
  matches: Match[]
  group: 'A' | 'B'
  captains: Captain[]
  canManage: boolean
  onResultUpdate: (matchId: number, scoreA: number, scoreB: number) => Promise<void>
}) {
  const display = matches.length > 0 ? matches : buildPlaceholder(group, captains)

  return (
    <div className="p-3 space-y-3">
      {/* Round columns */}
      <div className="grid grid-cols-3 gap-2">
        {[1, 2, 3].map(r => {
          const roundMatches = display.filter(m => m.round === r).sort((a, b) => a.match_order - b.match_order)
          return (
            <div key={r} className="space-y-1.5 min-w-0">
              <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 text-center">Round {r}</p>
              {roundMatches.map(m => (
                <MatchRow key={m.id} match={m} canManage={canManage} captains={captains} onSave={onResultUpdate} />
              ))}
            </div>
          )
        })}
      </div>

      {/* Standings below (only when real matches exist) */}
      {matches.length > 0 && (
        <div className="border-t border-zinc-800/60 pt-2 overflow-x-auto">
          <Standings matches={matches} captains={captains} />
        </div>
      )}
    </div>
  )
}
