import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { tournamentsApi, type PublicTournamentOverview, type PublicDivision, type PublicMatchup, type PublicTeam } from '@/api/tournaments'
import { useTitle } from '@/hooks/useTitle'
import type { Captain } from '@/api/auctions'
import type { Match } from '@/api/brackets'
import PublicNav from '@/components/PublicNav'
import GroupStageView from '@/components/tournament/GroupStageView'
import BracketView from '@/components/tournament/BracketView'
import { KnockoutScoreRow } from '@/components/tournament/division/KnockoutSection'
import { cn, imgSrc } from '@/lib/utils'
import { parseClasses, CLASS_ICON, CLASS_COLOR, CLASSES } from '@/components/tournament/shared'
import { Loader2, Trophy, Copy, Check } from 'lucide-react'

import Aserai   from '@/assets/factions/Aserai.webp'
import Battania from '@/assets/factions/Battania.webp'
import Empire   from '@/assets/factions/Empire.webp'
import Khuzait  from '@/assets/factions/Khuzait.webp'
import Sturgia  from '@/assets/factions/Sturgia.webp'
import Vlandia  from '@/assets/factions/Vlandia.webp'

const FACTION_ICONS: Record<string, string> = { Aserai, Battania, Empire, Khuzait, Sturgia, Vlandia }

// ─── Helpers ──────────────────────────────────────────────────────────────────


function FactionIcon({ name, size = 'sm' }: { name: string | null | undefined; size?: 'sm' | 'lg' }) {
  const src = name ? FACTION_ICONS[name] : undefined
  const cls = size === 'lg'
    ? 'w-10 h-10 rounded-full object-cover border-2 border-white/20 flex-shrink-0 drop-shadow-lg'
    : 'w-6 h-6 rounded-full object-cover border border-zinc-700 flex-shrink-0'
  const placeholder = size === 'lg'
    ? 'w-10 h-10 rounded-full bg-white/10 border-2 border-white/10 flex items-center justify-center flex-shrink-0'
    : 'w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0'

  if (!src) return (
    <div className={placeholder}>
      <span className={size === 'lg' ? 'text-xs text-white/30' : 'text-[9px] text-zinc-600'}>?</span>
    </div>
  )
  return <img src={src} alt={name ?? ''} className={cls} />
}

function teamsAsCaptains(division: PublicDivision): Captain[] {
  return division.teams.map(t => ({
    id: t.id, auction_id: division.auction.id,
    display_name: t.display_name, team_name: t.team_name,
    budget: 0, class: null, token: null, token_expires_at: null,
  }))
}

// ─── Scale-to-fit container ───────────────────────────────────────────────────
// Uses CSS `zoom` (unlike transform:scale, zoom rescales the layout box too,
// so content fills its container exactly — same effect as SVG viewBox scaling).
//
// Bug avoided: inner is a block div so nW always equals aW, making aW/nW=1
// and capping scale at 1. Fix: for scale-up, pre-constrain inner width to
// aW/scale so that after zoom=scale the layout width equals aW exactly.

function ScaleToFit({ children, onScale }: { children: React.ReactNode; onScale?: (s: number) => void }) {
  const outerRef    = useRef<HTMLDivElement>(null)
  const innerRef    = useRef<HTMLDivElement>(null)
  const lastEmitted = useRef<number>(0)

  function recalc(outer: HTMLDivElement, inner: HTMLDivElement) {
    inner.style.zoom  = '1'
    inner.style.width = ''
    const aH = outer.clientHeight
    const aW = outer.clientWidth
    if (!aH || !aW) return
    const nH = inner.scrollHeight
    if (!nH) return
    let s = aH / nH
    if (s > 1) {
      inner.style.width = `${aW / s}px`
      const nH2 = inner.scrollHeight
      if (nH2 > 0) s = aH / nH2
      inner.style.width = `${aW / s}px`
    }
    inner.style.zoom = String(s)
    if (onScale && Math.abs(s - lastEmitted.current) > 0.005) {
      lastEmitted.current = s
      onScale(s)
    }
  }

  useLayoutEffect(() => {
    const outer = outerRef.current
    const inner = innerRef.current
    if (!outer || !inner) return
    recalc(outer, inner)
    const ro = new ResizeObserver(() => recalc(outer, inner))
    ro.observe(outer)
    return () => ro.disconnect()
  })

  return (
    <div ref={outerRef} className="w-full h-full overflow-hidden">
      <div ref={innerRef}>{children}</div>
    </div>
  )
}

// ─── Matchup card ─────────────────────────────────────────────────────────────

function MatchupCard({ label, matchup }: {
  label: string
  matchup: PublicMatchup | undefined
}) {
  const [copied, setCopied] = useState(false)
  const rolled  = !!matchup?.map_name
  const command = rolled
    ? `!setmap ${matchup!.map_game_id ?? matchup!.map_name} ${(matchup!.faction_a_name ?? '?').toLowerCase()} ${(matchup!.faction_b_name ?? '?').toLowerCase()}`
    : '!setmap <map> <fac1> <fac2>'

  function handleCopy() {
    if (!rolled) return
    navigator.clipboard.writeText(command)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      {/* Image area — 1920×855 native aspect ratio */}
      <div className="relative overflow-hidden" style={{ aspectRatio: '1920/855' }}>
        {matchup?.map_image
          ? <img src={imgSrc(matchup.map_image)} className="absolute inset-0 w-full h-full object-cover" alt="" />
          : <div className="absolute inset-0 bg-zinc-800/60" />
        }
        {/* Darkening vignette */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/10 to-black/60" />

        {/* Round label — top left */}
        <div className="absolute top-1.5 left-2.5">
          <span className="text-[10px] font-mono uppercase tracking-widest text-white/60">{label}</span>
        </div>

        {/* Map name — top right (when rolled) */}
        {rolled && (
          <div className="absolute top-1.5 right-2.5">
            <span className="text-[10px] font-black text-amber-400"
              style={{ fontFamily: '"Barlow Condensed", sans-serif' }}>
              {matchup!.map_name}
            </span>
          </div>
        )}

        {/* VS row — centered */}
        <div className="absolute inset-0 flex items-center justify-center gap-3">
          <FactionIcon name={matchup?.faction_a_name} size="lg" />
          <span className="text-lg font-black text-white/70 tracking-widest"
            style={{ fontFamily: '"Barlow Condensed", sans-serif' }}>
            VS
          </span>
          <FactionIcon name={matchup?.faction_b_name} size="lg" />
        </div>

        {/* Command bar — overlaid at bottom */}
        <div className="absolute bottom-0 inset-x-0 flex items-center gap-1.5 px-2.5 py-1.5 bg-black/50">
          <p className={cn('text-xs font-mono truncate flex-1 select-all', rolled ? 'text-zinc-300' : 'text-zinc-600')}>
            {command}
          </p>
          {rolled && (
            <button onClick={handleCopy} title="Copy"
              className="flex-shrink-0 text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer">
              {copied
                ? <Check className="w-3.5 h-3.5 text-green-400" />
                : <Copy className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Matchups panel ───────────────────────────────────────────────────────────

const MATCHUP_SLOTS = [
  { round: 1, label: 'Round 1' },
  { round: 2, label: 'Round 2' },
  { round: 3, label: 'Round 3' },
  { round: 4, label: 'Semi-Finals' },
  { round: 5, label: 'Finals'  },
]

function MatchupsPanel({ matchups }: { matchups: PublicMatchup[] }) {
  return (
    <div className="flex flex-col gap-1.5 h-full py-1 justify-between">
      <p className="text-[9px] font-mono uppercase tracking-widest text-zinc-600 flex-shrink-0 pb-0.5">Matchups</p>
      {MATCHUP_SLOTS.map(s => (
        <MatchupCard
          key={s.round}
          label={s.label}
          matchup={matchups.find(m => m.round === s.round)}
        />
      ))}
    </div>
  )
}

// ─── Bracket section box ──────────────────────────────────────────────────────

function BracketBox({ title, children, className }: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('bg-zinc-900 border border-zinc-800 rounded-2xl flex flex-col overflow-hidden', className)}>
      <div className="flex-shrink-0 px-4 py-2 border-b border-zinc-800">
        <span className="text-xs font-mono uppercase tracking-widest text-zinc-500">{title}</span>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {children}
      </div>
    </div>
  )
}

// ─── Team card ────────────────────────────────────────────────────────────────

function ClassCell({ classes, cls }: { classes: string | null; cls: typeof CLASSES[number] }) {
  const has  = parseClasses(classes ?? '').includes(cls)
  const Icon = CLASS_ICON[cls]
  return (
    <span className="w-7 flex items-center justify-center flex-shrink-0">
      {has && (
        <span className={cn('inline-flex items-center justify-center w-5 h-5 rounded-md border', CLASS_COLOR[cls])}>
          <Icon className="w-3 h-3" />
        </span>
      )}
    </span>
  )
}

function TeamCard({ team }: { team: PublicTeam }) {
  const teamName = team.team_name ?? `${team.display_name}'s team`
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden flex flex-col">
      {/* Team name */}
      <div className="px-4 py-2.5 border-b border-zinc-800/60">
        <p className="text-base font-black text-zinc-100 truncate"
          style={{ fontFamily: '"Barlow Condensed", sans-serif' }}>
          {teamName}
        </p>
      </div>

      <div className="flex-1">
        {/* Captain row */}
        <div className="flex items-center gap-2 px-4 py-2">
          <span className="text-sm font-semibold text-amber-400 flex-1 truncate">{team.display_name}</span>
          <div className="w-px h-4 bg-zinc-700/50 flex-shrink-0" />
          {CLASSES.map(cls => <ClassCell key={cls} classes={team.class} cls={cls} />)}
          <div className="w-px h-4 bg-zinc-700/50 flex-shrink-0" />
          <span className="w-12 flex-shrink-0" />
        </div>

        {/* Separator */}
        <div className="mx-4 border-t border-zinc-700/40" />

        {/* Player rows */}
        {team.players.length > 0 ? team.players.map((p, i) => (
          <div key={i} className="flex items-center gap-2 px-4 py-2">
            <span className="text-sm text-zinc-300 flex-1 truncate">{p.player_name}</span>
            <div className="w-px h-4 bg-zinc-700/50 flex-shrink-0" />
            {CLASSES.map(cls => <ClassCell key={cls} classes={p.classes} cls={cls} />)}
            <div className="w-px h-4 bg-zinc-700/50 flex-shrink-0" />
            <span className="w-12 text-right text-sm font-mono text-zinc-500 tabular-nums flex-shrink-0">
              {p.price.toFixed(1)}
            </span>
          </div>
        )) : (
          <p className="px-4 py-3 text-sm text-zinc-700 italic">No players drafted yet</p>
        )}
      </div>

      {team.players.length > 0 && (
        <div className="px-4 py-2 border-t border-zinc-800/60 flex items-center justify-between">
          <span className="text-xs font-mono text-zinc-600">{team.players.length} players</span>
          <span className="text-sm font-mono font-semibold text-zinc-400 tabular-nums">{team.total_spent.toFixed(1)} spent</span>
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PublicProjectPage() {
  const { slug } = useParams<{ slug: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const [data,     setData]     = useState<PublicTournamentOverview | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(false)
  const [tab,         setTab]         = useState(0)
  const [innerTab,    setInnerTab]    = useState<'bracket' | 'teams'>('bracket')
  const [sharedScale, setSharedScale] = useState(1)
  const finalsRightRef  = useRef<HTMLDivElement>(null)
  const finalsInnerRef  = useRef<HTMLDivElement>(null)

  useTitle(data?.tournament.name ?? 'BDC')

  useLayoutEffect(() => {
    const outer = finalsRightRef.current
    const inner = finalsInnerRef.current
    if (!outer || !inner) return
    const apply = () => { inner.style.width = `${outer.clientWidth / sharedScale}px` }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(outer)
    return () => ro.disconnect()
  })

  useEffect(() => {
    if (!slug) return
    tournamentsApi.getPublic(slug)
      .then(d => {
        setData(d)
        const divParam = searchParams.get('div')
        const tabParam = searchParams.get('tab')
        if (divParam) {
          const idx = d.divisions.findIndex(div => div.auction.id === Number(divParam))
          setTab(idx >= 0 ? idx : 0)
        } else {
          setTab(0)
        }
        if (tabParam === 'teams') setInnerTab('teams')
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [slug])

  if (loading) return (
    <div className="h-screen bg-zinc-950 flex items-center justify-center">
      <Loader2 className="w-6 h-6 text-zinc-600 animate-spin" />
    </div>
  )

  if (error || !data) return (
    <div className="h-screen flex flex-col bg-zinc-950">
      <PublicNav />
      <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm">Tournament not found.</div>
    </div>
  )

  const { tournament, divisions, matchups } = data
  const activeDivision  = divisions[tab] ?? divisions[0] ?? null
  const bracketId       = activeDivision?.matches[0]?.bracket_id ?? null
  // Show shared matchups (bracket_id null) + this division's finals matchup
  const divisionMatchups = matchups.filter(m => m.bracket_id === null || m.bracket_id === bracketId)
  const noop           = async (_id: number, _a: number, _b: number) => {}

  const captains        = activeDivision ? teamsAsCaptains(activeDivision) : []
  const groupAMatches   = (activeDivision?.matches.filter(m => m.group_label === 'A') ?? []) as Match[]
  const groupBMatches   = (activeDivision?.matches.filter(m => m.group_label === 'B') ?? []) as Match[]
  const knockoutMatches = (activeDivision?.matches.filter(m => m.group_label === null) ?? []) as Match[]

  return (
    <div className="h-screen flex flex-col bg-zinc-950 overflow-hidden">
      <PublicNav
        center={
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-700/40 bg-zinc-800/50">
            <span className="text-sm font-black text-zinc-100" style={{ fontFamily: '"Barlow Condensed", sans-serif' }}>
              {tournament.name}
            </span>
          </div>
        }
        extra={
          <Link to="/archive" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors font-mono">
            All tournaments
          </Link>
        }
      />

      {/* ── Combined tab bar: division tabs | divider | view tabs ── */}
      <div className="flex-shrink-0 border-b border-zinc-800/60 px-[5%] flex items-center gap-0.5">
        {divisions.map((d, i) => (
          <button key={d.auction.id} onClick={() => {
            setTab(i)
            setSearchParams(prev => { const p = new URLSearchParams(prev); p.set('div', String(d.auction.id)); return p }, { replace: true })
          }}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 -mb-px transition-colors whitespace-nowrap',
              tab === i ? 'border-amber-500 text-amber-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'
            )}>
            {d.winner && <Trophy className="w-3 h-3" />}
            {d.auction.name}
          </button>
        ))}

        {/* Divider between division and view tabs */}
        {divisions.length > 0 && (
          <div className="w-px h-4 bg-zinc-700 mx-2 self-center flex-shrink-0" />
        )}

        {([['bracket', 'Brackets'], ['teams', 'Teams']] as const).map(([id, label]) => (
          <button key={id} onClick={() => {
            setInnerTab(id)
            setSearchParams(prev => { const p = new URLSearchParams(prev); p.set('tab', id); return p }, { replace: true })
          }}
            className={cn(
              'px-3 py-2.5 text-xs font-semibold border-b-2 -mb-px transition-colors',
              innerTab === id ? 'border-amber-500 text-amber-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'
            )}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 min-h-0 px-[5%] py-3 flex flex-col">

        {!activeDivision && (
          <p className="text-sm text-zinc-700 italic text-center py-16">Nothing public yet.</p>
        )}

        {/* Brackets tab */}
        {innerTab === 'bracket' && activeDivision && (
          <div className="flex-1 min-h-0 flex gap-4">

            {/* Equal-height bracket boxes */}
            <div className="flex-1 min-w-0 flex flex-col gap-3">
              {groupAMatches.length > 0 && (
                <BracketBox title="Group A" className="flex-1 min-h-0">
                  <ScaleToFit onScale={setSharedScale}>
                    <GroupStageView
                      matches={groupAMatches} group="A"
                      captains={captains} canManage={false} onResultUpdate={noop}
                    />
                  </ScaleToFit>
                </BracketBox>
              )}
              {groupBMatches.length > 0 && (
                <BracketBox title="Group B" className="flex-1 min-h-0">
                  <ScaleToFit>
                    <GroupStageView
                      matches={groupBMatches} group="B"
                      captains={captains} canManage={false} onResultUpdate={noop}
                    />
                  </ScaleToFit>
                </BracketBox>
              )}
              {knockoutMatches.length > 0 && (
                <BracketBox title="Finals" className="flex-1 min-h-0">
                  <div className="grid gap-4 px-4 py-3 h-full" style={{ gridTemplateColumns: '40% 60%' }}>
                    <div className="min-w-0 h-full overflow-hidden">
                      <BracketView matches={knockoutMatches} captains={captains} fill />
                    </div>
                    <div ref={finalsRightRef} className="border-l border-zinc-800/60 pl-4 h-full overflow-hidden flex items-center min-w-0 flex-1">
                      <div ref={finalsInnerRef} style={{ zoom: sharedScale }} className="flex gap-2 p-3">
                      {[...new Set(knockoutMatches.map(m => m.round))].sort((a, b) => a - b).map(r => {
                        const label = r === Math.max(...knockoutMatches.map(m => m.round)) ? 'Final' : `Semi-final ${r}`
                        const rows = knockoutMatches.filter(m => m.round === r).sort((a, b) => a.match_order - b.match_order)
                        return (
                          <div key={r} className="flex-1 flex flex-col min-w-0">
                            <p className="flex-shrink-0 text-[10px] font-mono uppercase tracking-widest text-zinc-600 text-center pb-1.5">{label}</p>
                            <div className="flex-1 flex flex-col justify-evenly">
                              {rows.map(m => (
                                <KnockoutScoreRow key={m.id} match={m} captains={captains} canManage={false} onSave={noop} showLabel={false} />
                              ))}
                            </div>
                          </div>
                        )
                      })}
                      </div>
                    </div>
                  </div>
                </BracketBox>
              )}
              {activeDivision.matches.length === 0 && (
                <p className="text-sm text-zinc-700 italic py-8 text-center">Bracket will appear once generated.</p>
              )}
            </div>

            {/* Matchups panel — 20% width */}
            <div className="w-1/5 flex-shrink-0">
              <MatchupsPanel matchups={divisionMatchups} />
            </div>
          </div>
        )}

        {/* Teams tab */}
        {innerTab === 'teams' && activeDivision && (
          <div className="flex-1 min-h-0 overflow-y-auto">

            {activeDivision.teams.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 pb-3">
                {activeDivision.teams.map(t => <TeamCard key={t.id} team={t} />)}
              </div>
            ) : (
              <p className="text-sm text-zinc-700 italic py-8 text-center">Teams will appear once the auction begins.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
