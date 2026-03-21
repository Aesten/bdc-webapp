import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useWs } from '@/hooks/useWs'
import { bracketsApi, type PickBanSession, type PickBanBan, type PickBanMapDetail, type PickBanCaptainDetail } from '@/api/brackets'
import { factionsApi, type Faction } from '@/api/maps'
import { useAuth } from '@/context/AuthContext'
import { cn, imgSrc } from '@/lib/utils'
import { Loader2, Shield, Swords, RotateCcw } from 'lucide-react'
import FinalsMatchupCard from '@/components/FinalsMatchupCard'

import Aserai   from '@/assets/factions/Aserai.webp'
import Battania from '@/assets/factions/Battania.webp'
import Empire   from '@/assets/factions/Empire.webp'
import Khuzait  from '@/assets/factions/Khuzait.webp'
import Sturgia  from '@/assets/factions/Sturgia.webp'
import Vlandia  from '@/assets/factions/Vlandia.webp'

const FACTION_IMG: Record<string, string> = { Aserai, Battania, Empire, Khuzait, Sturgia, Vlandia }

// ─── Side colours ─────────────────────────────────────────────────────────────

const SIDE = {
  a: { text: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/25',   label: 'Side A' },
  b: { text: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/25', label: 'Side B' },
}

// ─── Map card ─────────────────────────────────────────────────────────────────

function MapCard({
  map, banned, bannedBy, selected, clickable, onClick,
}: {
  map:       PickBanMapDetail
  banned?:   boolean
  bannedBy?: 'a' | 'b'
  selected?: boolean
  clickable?: boolean
  onClick?:  () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={!clickable}
      className={cn(
        'relative rounded-xl overflow-hidden border transition-all duration-200 text-left',
        'aspect-[4/3] w-full flex flex-col justify-end',
        banned   && 'opacity-40 cursor-default border-zinc-800',
        selected && 'border-amber-500/60 shadow-lg shadow-amber-500/10',
        clickable && !banned && 'border-zinc-700 hover:border-red-400/60 hover:shadow-lg hover:shadow-red-500/10 cursor-pointer',
        !clickable && !banned && !selected && 'border-zinc-800 cursor-default',
      )}
    >
      {/* Map image / placeholder */}
      {map.image_path ? (
        <img src={imgSrc(map.image_path)} alt={map.name} className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 to-zinc-900" />
      )}

      {/* Dark gradient overlay for text */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

      {/* Banned overlay */}
      {banned && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 gap-1">
          <span className="text-lg font-black text-zinc-400 line-through">{map.name}</span>
          {bannedBy && (
            <span className={cn('text-[10px] font-mono px-2 py-0.5 rounded-full border',
              bannedBy === 'a' ? 'text-blue-400 bg-blue-400/10 border-blue-400/20' : 'text-violet-400 bg-violet-400/10 border-violet-400/20'
            )}>
              BANNED BY {SIDE[bannedBy].label.toUpperCase()}
            </span>
          )}
        </div>
      )}

      {/* Hover ban hint */}
      {clickable && !banned && (
        <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-red-500/10">
          <span className="text-xs font-bold text-red-400 bg-black/60 px-2 py-1 rounded-lg">Click to ban</span>
        </div>
      )}

      {/* Map name bottom strip */}
      {!banned && (
        <div className="relative px-2 pb-2 pt-6">
          <p className={cn('text-xs font-bold truncate', selected ? 'text-amber-400' : 'text-zinc-200')}>
            {map.name}
          </p>
          {selected && (
            <span className="text-[10px] font-mono text-amber-400/80">SELECTED</span>
          )}
        </div>
      )}
    </button>
  )
}

// ─── Faction card ─────────────────────────────────────────────────────────────

function FactionCard({ faction, selected, onSelect, disabled }: {
  faction:  Faction
  selected: boolean
  onSelect: () => void
  disabled: boolean
}) {
  const img = FACTION_IMG[faction.name]
  return (
    <button
      onClick={onSelect}
      disabled={disabled || selected}
      className={cn(
        'flex flex-col items-center gap-1.5 transition-all duration-200 group',
        disabled && !selected && 'opacity-40 cursor-not-allowed',
      )}
    >
      <div className={cn(
        'w-14 h-14 rounded-full overflow-hidden border-2 transition-all duration-200',
        selected
          ? 'border-amber-500 shadow-lg shadow-amber-500/20 scale-110'
          : 'border-zinc-700 group-hover:border-zinc-500 group-disabled:border-zinc-800',
      )}>
        {img ? (
          <img src={img} alt={faction.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-zinc-800" />
        )}
      </div>
      <span className={cn('text-[10px] font-bold', selected ? 'text-amber-400' : 'text-zinc-400')}>
        {faction.name}
      </span>
      {selected && (
        <span className="text-[9px] text-amber-400/70 font-mono -mt-1">LOCKED</span>
      )}
    </button>
  )
}

// ─── Captain ready card ───────────────────────────────────────────────────────

function CaptainReadyCard({ side, captain, joined }: {
  side:    'a' | 'b'
  captain: PickBanCaptainDetail | null
  joined:  boolean
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

// ─── Ban sequence stepper ─────────────────────────────────────────────────────

function BanStepper({ sequence, currentTurn }: { sequence: ('a' | 'b')[]; currentTurn: number }) {
  return (
    <div className="flex items-center gap-1.5 justify-center">
      {sequence.map((side, i) => (
        <div key={i} className={cn(
          'flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold border transition-all',
          i < currentTurn
            ? 'bg-zinc-700 border-zinc-600 text-zinc-500'          // done
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PickBanPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const { user } = useAuth()

  const [session,   setSession]   = useState<PickBanSession | null>(null)
  const [bans,      setBans]      = useState<PickBanBan[]>([])
  const [factions,  setFactions]  = useState<Faction[]>([])
  const [mapPool,   setMapPool]   = useState<PickBanMapDetail[]>([])
  const [captainA,  setCaptainA]  = useState<PickBanCaptainDetail | null>(null)
  const [captainB,  setCaptainB]  = useState<PickBanCaptainDetail | null>(null)
  const [chosenMap, setChosenMap] = useState<PickBanMapDetail | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [acting,    setActing]    = useState(false)
  const [myPick,    setMyPick]    = useState<number | null>(null)
  const [resetting, setResetting] = useState(false)

  const isCaptain = user?.role === 'captain'
  const isHost    = user?.role === 'host' || user?.role === 'admin'

  const load = useCallback(async () => {
    if (!sessionId) return
    const [data, factionList] = await Promise.all([
      bracketsApi.getPickBan(Number(sessionId)),
      factionsApi.list(),
    ])
    setSession(data.session)
    setBans(data.bans)
    setFactions(factionList)
    setMapPool(data.mapPool)
    setCaptainA(data.captainA)
    setCaptainB(data.captainB)
    setChosenMap(data.chosenMap)
    setLoading(false)
  }, [sessionId])

  useEffect(() => { load() }, [load])

  useWs({
    sessionId: Number(sessionId),
    token:     null,
    path:      'pickban',
    onMessage: load,
    onOpen:    load,
    enabled:   session?.status !== 'complete',
  })

  if (loading || !session) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <Loader2 className="w-6 h-6 text-zinc-600 animate-spin" />
    </div>
  )

  const mySide = user?.captainId === session.captain_a_id ? 'a'
    : user?.captainId === session.captain_b_id ? 'b'
    : null

  const banSeq: ('a' | 'b')[] = JSON.parse(session.ban_sequence)
  const pool: number[]         = JSON.parse(session.map_pool)
  const myTurn     = session.status === 'banning' && banSeq[session.ban_turn] === mySide
  const bannedIds  = new Set(bans.map(b => b.map_id))
  const remaining  = pool.filter(id => !bannedIds.has(id))
  const hasJoined  = mySide === 'a' ? !!session.a_joined : mySide === 'b' ? !!session.b_joined : false
  const myPickDone = myPick !== null || (mySide === 'a' ? session.a_pick !== null : mySide === 'b' ? session.b_pick !== null : false)

  async function joinSession() {
    setActing(true)
    try { await bracketsApi.joinPickBan(session!.id); await load() }
    finally { setActing(false) }
  }

  async function submitBan(mapId: number) {
    if (!myTurn || acting) return
    setActing(true)
    try { await bracketsApi.ban(session!.id, mapId); await load() }
    finally { setActing(false) }
  }

  async function submitPick(factionId: number) {
    if (acting || myPickDone) return
    setActing(true)
    setMyPick(factionId)
    try {
      const res = await bracketsApi.pick(session!.id, factionId)
      if (res.revealed) await load()
    } finally { setActing(false) }
  }

  async function resetSession() {
    setResetting(true)
    try { await bracketsApi.deletePickBan(session!.id); window.history.back() }
    catch { /* ignore */ } finally { setResetting(false) }
  }

  const statusLabel: Record<string, string> = {
    waiting: 'Waiting for players',
    banning: 'Ban phase',
    picking:  'Pick phase',
    complete: 'Complete',
  }

  const factionA = factions.find(f => f.id === (session.a_pick as number))
  const factionB = factions.find(f => f.id === (session.b_pick as number))

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">

      {/* ── Header ── */}
      <div className="border-b border-zinc-800 px-6 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <Swords className="w-5 h-5 text-amber-500/70" />
          <span className="text-lg font-black tracking-tight text-zinc-100"
            style={{ fontFamily: '"Barlow Condensed", sans-serif' }}>
            FINALS PICK-BAN
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className={cn(
            'text-[10px] font-mono px-2.5 py-1 rounded-full border',
            session.status === 'complete'
              ? 'text-green-400 bg-green-400/10 border-green-400/20'
              : 'text-amber-400 bg-amber-400/10 border-amber-400/20 animate-pulse'
          )}>
            {statusLabel[session.status] ?? session.status}
          </span>
          {isHost && session.status !== 'complete' && (
            <button onClick={resetSession} disabled={resetting}
              title="Reset pick-ban session"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs hover:bg-red-500/20 transition-colors disabled:opacity-40">
              {resetting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
              Reset
            </button>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 flex flex-col items-center px-6 py-6 gap-6 max-w-3xl mx-auto w-full">

        {/* Captain headers — always visible */}
        <div className="w-full grid grid-cols-2 gap-3">
          <CaptainReadyCard side="a" captain={captainA} joined={!!session.a_joined} />
          <CaptainReadyCard side="b" captain={captainB} joined={!!session.b_joined} />
        </div>

        {/* ── WAITING ── */}
        {session.status === 'waiting' && (
          <>
            {/* Map pool preview */}
            <div className="w-full space-y-2">
              <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-600">Map Pool</p>
              <div className="grid grid-cols-5 gap-2">
                {mapPool.map(m => <MapCard key={m.id} map={m} />)}
              </div>
            </div>

            {isCaptain && mySide && !hasJoined && (
              <button onClick={joinSession} disabled={acting}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-500 text-black font-bold hover:bg-amber-400 transition-colors disabled:opacity-40">
                {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Swords className="w-4 h-4" />}
                Join as {SIDE[mySide].label}
              </button>
            )}
            {isCaptain && mySide && hasJoined && (
              <p className="text-sm text-zinc-500">Joined ✓ — waiting for opponent…</p>
            )}
            {isHost && (
              <p className="text-xs text-zinc-700 font-mono">Watching — captains are joining</p>
            )}
          </>
        )}

        {/* ── BANNING ── */}
        {session.status === 'banning' && (
          <>
            <div className="w-full space-y-3 text-center">
              <BanStepper sequence={banSeq} currentTurn={session.ban_turn} />
              <p className={cn('text-sm font-bold',
                myTurn ? 'text-red-400' : 'text-zinc-400')}>
                {myTurn
                  ? '⚔ Your turn — select a map to ban'
                  : `Waiting for ${SIDE[banSeq[session.ban_turn] ?? 'a'].label} to ban…`}
              </p>
              <p className="text-[10px] font-mono text-zinc-700">
                Ban {session.ban_turn + 1} of {banSeq.length}
              </p>
            </div>

            <div className="w-full grid grid-cols-5 gap-2">
              {mapPool.map(m => {
                const ban = bans.find(b => b.map_id === m.id)
                return (
                  <MapCard
                    key={m.id}
                    map={m}
                    banned={!!ban}
                    bannedBy={ban?.captain_side}
                    clickable={myTurn && !ban && !acting}
                    onClick={() => submitBan(m.id)}
                  />
                )
              })}
            </div>
          </>
        )}

        {/* ── PICKING ── */}
        {session.status === 'picking' && (
          <>
            {/* Chosen map (the survivor) */}
            {remaining.length === 1 && mapPool.find(m => m.id === remaining[0]) && (
              <div className="w-full space-y-2">
                <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 text-center">Finals Map</p>
                <div className="max-w-xs mx-auto">
                  <MapCard map={mapPool.find(m => m.id === remaining[0])!} selected />
                </div>
              </div>
            )}

            {/* Faction picker */}
            {isCaptain && mySide && !myPickDone && (
              <div className="w-full space-y-2">
                <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 text-center">
                  Pick your faction — reveals simultaneously
                </p>
                <div className="flex flex-wrap justify-center gap-4">
                  {factions.map(f => (
                    <FactionCard
                      key={f.id}
                      faction={f}
                      selected={myPick === f.id}
                      onSelect={() => submitPick(f.id)}
                      disabled={acting}
                    />
                  ))}
                </div>
              </div>
            )}

            {myPickDone && !session.revealed && (
              <div className="text-center py-4 space-y-2">
                <Shield className="w-8 h-8 text-amber-500/60 mx-auto animate-pulse" />
                <p className="text-sm font-bold text-zinc-300">Faction locked in</p>
                <p className="text-xs text-zinc-600">Waiting for opponent to pick…</p>
              </div>
            )}

            {isHost && (
              <p className="text-xs text-zinc-700 font-mono">Watching — captains are picking factions</p>
            )}
          </>
        )}

        {/* ── COMPLETE ── */}
        {session.status === 'complete' && session.revealed && (
          <div className="w-full space-y-4 animate-in fade-in duration-700">
            <FinalsMatchupCard
              mapImage={chosenMap?.image_path}
              mapName={chosenMap?.name}
              mapGameId={chosenMap?.game_id}
              factionAName={factionA?.name}
              factionBName={factionB?.name}
            />
            <Link to="/captain"
              className="w-full flex items-center justify-center py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-sm font-medium transition-colors">
              ← Back to dashboard
            </Link>
          </div>
        )}

      </div>
    </div>
  )
}
