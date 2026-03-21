import { useCallback, useEffect, useRef, useState } from 'react'
import { useWs } from '@/hooks/useWs'
import { bracketsApi, type PickBanSession, type PickBanBan, type PickBanMapDetail, type PickBanCaptainDetail } from '@/api/brackets'
import { factionsApi, type Faction } from '@/api/maps'
import { cn } from '@/lib/utils'
import { Loader2, Swords, Check, X, Trash2 } from 'lucide-react'
import { useToast } from '@/context/ToastContext'
import FinalsMatchupCard from '@/components/FinalsMatchupCard'


const SIDE = {
  a: { text: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/25',   label: 'Side A' },
  b: { text: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/25', label: 'Side B' },
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MapCard({ map, banned, bannedBy, selected }: {
  map: PickBanMapDetail; banned?: boolean; bannedBy?: 'a' | 'b'; selected?: boolean
}) {
  return (
    <div className={cn(
      'relative rounded-xl overflow-hidden border aspect-[4/3] flex flex-col justify-end',
      banned   && 'opacity-40 border-zinc-800',
      selected && 'border-amber-500/60 shadow-lg shadow-amber-500/10',
      !banned && !selected && 'border-zinc-800',
    )}>
      {map.image_path
        ? <img src={map.image_path} alt={map.name} className="absolute inset-0 w-full h-full object-cover" />
        : <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 to-zinc-900" />
      }
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
      {banned && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 gap-1">
          <span className="text-sm font-black text-zinc-400 line-through">{map.name}</span>
          {bannedBy && (
            <span className={cn('text-[10px] font-mono px-2 py-0.5 rounded-full border',
              bannedBy === 'a' ? 'text-blue-400 bg-blue-400/10 border-blue-400/20' : 'text-violet-400 bg-violet-400/10 border-violet-400/20'
            )}>
              BANNED BY {SIDE[bannedBy].label.toUpperCase()}
            </span>
          )}
        </div>
      )}
      {!banned && (
        <div className="relative px-2 pb-2 pt-6">
          <p className={cn('text-xs font-bold truncate', selected ? 'text-amber-400' : 'text-zinc-200')}>{map.name}</p>
          {selected && <span className="text-[10px] font-mono text-amber-400/80">SELECTED</span>}
        </div>
      )}
    </div>
  )
}

function CaptainCard({ side, captain, joined }: {
  side: 'a' | 'b'; captain: PickBanCaptainDetail | null; joined: boolean
}) {
  const s = SIDE[side]
  return (
    <div className={cn('flex items-center gap-3 px-4 py-3 rounded-xl border',
      joined ? 'bg-green-500/10 border-green-500/25' : `${s.bg} ${s.border}`)}>
      <div className={cn('w-2 h-2 rounded-full flex-shrink-0', joined ? 'bg-green-400' : 'bg-zinc-600')} />
      <div className="min-w-0">
        <p className={cn('text-sm font-bold truncate', joined ? 'text-green-300' : s.text)}>
          {captain?.team_name || captain?.display_name || s.label}
        </p>
        <p className="text-[10px] font-mono text-zinc-600">{joined ? 'Ready' : 'Waiting…'}</p>
      </div>
    </div>
  )
}

function BanStepper({ sequence, currentTurn }: { sequence: ('a' | 'b')[]; currentTurn: number }) {
  return (
    <div className="flex items-center gap-1.5 justify-center">
      {sequence.map((side, i) => (
        <div key={i} className={cn(
          'flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold border transition-all',
          i < currentTurn
            ? 'bg-zinc-700 border-zinc-600 text-zinc-500'
            : i === currentTurn
              ? side === 'a'
                ? 'bg-blue-500/20 border-blue-500/50 text-blue-300 scale-110'
                : 'bg-violet-500/20 border-violet-500/50 text-violet-300 scale-110'
              : side === 'a'
                ? 'bg-zinc-900 border-blue-500/20 text-blue-500/40'
                : 'bg-zinc-900 border-violet-500/20 text-violet-500/40',
        )}>
          {side.toUpperCase()}
        </div>
      ))}
    </div>
  )
}


const selectCn = 'w-full appearance-none px-3 py-2 rounded-xl border text-sm font-medium bg-zinc-800 border-zinc-700 text-zinc-200 focus:outline-none focus:border-amber-500/50 cursor-pointer transition-colors hover:border-zinc-600'

// ─── Modal ────────────────────────────────────────────────────────────────────

export default function PickBanModal({ sessionId, onDeleted, onClose }: {
  sessionId: number
  onDeleted: () => void
  onClose:   () => void
}) {
  const { toast } = useToast()

  const [session,    setSession]    = useState<PickBanSession | null>(null)
  const [bans,       setBans]       = useState<PickBanBan[]>([])
  const [factions,   setFactions]   = useState<Faction[]>([])
  const [mapPool,    setMapPool]    = useState<PickBanMapDetail[]>([])
  const [captainA,   setCaptainA]   = useState<PickBanCaptainDetail | null>(null)
  const [captainB,   setCaptainB]   = useState<PickBanCaptainDetail | null>(null)
  const [chosenMap,  setChosenMap]  = useState<PickBanMapDetail | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [deleting,   setDeleting]   = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)

  // Override controls
  const [overrideMap, setOverrideMap] = useState<number | ''>('')
  const [overrideA,   setOverrideA]   = useState<number | ''>('')
  const [overrideB,   setOverrideB]   = useState<number | ''>('')
  const [saving,      setSaving]      = useState(false)
  const overrideInit = useRef(false)

  const mouseDownOnBackdrop = useRef(false)

  const load = useCallback(async () => {
    const [data, factionList] = await Promise.all([
      bracketsApi.getPickBan(sessionId),
      factionsApi.list(),
    ])
    setSession(data.session)
    setBans(data.bans)
    setFactions(factionList)
    setMapPool(data.mapPool)
    setCaptainA(data.captainA)
    setCaptainB(data.captainB)
    setChosenMap(data.chosenMap)
    if (!overrideInit.current && data.session.status === 'complete') {
      overrideInit.current = true
      if (data.session.chosen_map_id) setOverrideMap(data.session.chosen_map_id)
      if (typeof data.session.a_pick === 'number') setOverrideA(data.session.a_pick)
      if (typeof data.session.b_pick === 'number') setOverrideB(data.session.b_pick)
    }
    setLoading(false)
  }, [sessionId])

  useEffect(() => { load() }, [load])

  useWs({
    sessionId,
    token:     null,
    path:      'pickban',
    onMessage: load,
    onOpen:    load,
    enabled:   session?.status !== 'complete',
  })

  async function doDelete() {
    setDeleting(true)
    try {
      await bracketsApi.deletePickBan(sessionId)
      onDeleted()
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Failed', 'error')
      setDeleting(false)
    }
  }

  async function saveOverride() {
    if (overrideMap === '' || overrideA === '' || overrideB === '') return
    setSaving(true)
    try {
      const data = await bracketsApi.overridePickBan(sessionId, {
        chosen_map_id: overrideMap as number,
        a_pick:        overrideA as number,
        b_pick:        overrideB as number,
      })
      setSession(data.session)
      setChosenMap(data.chosenMap)
      toast('Result updated', 'success')
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Failed', 'error')
    } finally { setSaving(false) }
  }

  const banSeq: ('a' | 'b')[] = session ? JSON.parse(session.ban_sequence) : []
  const pool:    number[]      = session ? JSON.parse(session.map_pool) : []
  const bannedIds = new Set(bans.map(b => b.map_id))
  const remaining = pool.filter(id => !bannedIds.has(id))

  const factionA = session?.status === 'complete' && session.revealed
    ? factions.find(f => f.id === (session.a_pick as number)) : null
  const factionB = session?.status === 'complete' && session.revealed
    ? factions.find(f => f.id === (session.b_pick as number)) : null


  const statusLabel: Record<string, string> = {
    waiting: 'Waiting for players', banning: 'Ban phase', picking: 'Pick phase', complete: 'Complete',
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onMouseDown={e => { mouseDownOnBackdrop.current = e.target === e.currentTarget }}
      onClick={e => { if (mouseDownOnBackdrop.current && !deleting && e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <Swords className="w-4 h-4 text-amber-500/70" />
            <span className="text-base font-black tracking-tight text-zinc-100"
              style={{ fontFamily: '"Barlow Condensed", sans-serif' }}>
              FINALS PICK-BAN
            </span>
            {session && (
              <span className={cn(
                'text-[10px] font-mono px-2 py-0.5 rounded-full border',
                session.status === 'complete'
                  ? 'text-green-400 bg-green-400/10 border-green-400/20'
                  : 'text-amber-400 bg-amber-400/10 border-amber-400/20 animate-pulse',
              )}>
                {statusLabel[session.status] ?? session.status}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {session && !confirmDel && (
              <button onClick={() => setConfirmDel(true)} disabled={deleting}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs hover:bg-red-500/20 transition-colors disabled:opacity-40">
                <Trash2 className="w-3 h-3" /> Delete
              </button>
            )}
            {confirmDel && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-zinc-500">Delete session?</span>
                <button onClick={doDelete} disabled={deleting}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 text-xs hover:bg-red-500/25 transition-colors disabled:opacity-40">
                  {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  Confirm
                </button>
                <button onClick={() => setConfirmDel(false)}
                  className="px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-400 text-xs hover:bg-zinc-700 transition-colors">
                  Cancel
                </button>
              </div>
            )}
            <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300 transition-colors ml-1">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 text-zinc-600 animate-spin" />
            </div>
          ) : !session ? null : (
            <div className="flex flex-col gap-5 px-5 py-5">

              {/* Captains */}
              <div className="grid grid-cols-2 gap-3">
                <CaptainCard side="a" captain={captainA} joined={!!session.a_joined} />
                <CaptainCard side="b" captain={captainB} joined={!!session.b_joined} />
              </div>

              {/* WAITING */}
              {session.status === 'waiting' && (
                <div className="space-y-2">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-600">Map Pool</p>
                  <div className="grid grid-cols-5 gap-2">
                    {mapPool.map(m => <MapCard key={m.id} map={m} />)}
                  </div>
                  <p className="text-xs text-zinc-700 font-mono text-center pt-1">Watching — captains are joining</p>
                </div>
              )}

              {/* BANNING */}
              {session.status === 'banning' && (
                <div className="space-y-3">
                  <BanStepper sequence={banSeq} currentTurn={session.ban_turn} />
                  <p className="text-sm text-zinc-400 text-center">
                    Waiting for {SIDE[banSeq[session.ban_turn] ?? 'a'].label} to ban…
                  </p>
                  <div className="grid grid-cols-5 gap-2">
                    {mapPool.map(m => {
                      const ban = bans.find(b => b.map_id === m.id)
                      return <MapCard key={m.id} map={m} banned={!!ban} bannedBy={ban?.captain_side} />
                    })}
                  </div>
                </div>
              )}

              {/* PICKING */}
              {session.status === 'picking' && (
                <div className="space-y-3">
                  {remaining.length === 1 && mapPool.find(m => m.id === remaining[0]) && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 text-center">Finals Map</p>
                      <div className="max-w-[140px] mx-auto">
                        <MapCard map={mapPool.find(m => m.id === remaining[0])!} selected />
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-zinc-700 font-mono text-center">Captains are picking factions…</p>
                </div>
              )}

              {/* COMPLETE */}
              {session.status === 'complete' && session.revealed && (() => {
                return (
                  <div className="space-y-4">
                    <FinalsMatchupCard
                      mapImage={chosenMap?.image_path}
                      mapName={chosenMap?.name}
                      mapGameId={chosenMap?.game_id}
                      factionAName={factionA?.name}
                      factionBName={factionB?.name}
                    />

                    {/* Override result */}
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
                      <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Override result</p>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <p className="text-[10px] text-zinc-600">Map</p>
                          <select value={overrideMap} onChange={e => setOverrideMap(Number(e.target.value))} className={selectCn}>
                            {mapPool.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] text-blue-400/70">Side A faction</p>
                          <select value={overrideA} onChange={e => setOverrideA(Number(e.target.value))} className={selectCn}>
                            {factions.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] text-violet-400/70">Side B faction</p>
                          <select value={overrideB} onChange={e => setOverrideB(Number(e.target.value))} className={selectCn}>
                            {factions.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                          </select>
                        </div>
                      </div>
                      <button
                        onClick={saveOverride}
                        disabled={saving || overrideMap === '' || overrideA === '' || overrideB === ''}
                        className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-amber-500 text-black text-sm font-semibold hover:bg-amber-400 transition-colors disabled:opacity-40"
                      >
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        Save override
                      </button>
                    </div>
                  </div>
                )
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
