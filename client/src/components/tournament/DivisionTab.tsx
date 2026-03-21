import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useNavigate, Link } from 'react-router-dom'
import { auctionsApi, type Auction, type Captain } from '@/api/auctions'
import { type Tournament } from '@/api/tournaments'
import { bracketsApi, type Bracket, type Match, type PickBanSession } from '@/api/brackets'
import { sessionsApi, type AuctionSession } from '@/api/sessions'
import { authApi } from '@/api/auth'
import {
  Loader2, Trash2, Radio, AlertCircle,
  Shuffle, Check, Lock, BarChart2, Swords,
} from 'lucide-react'
import { Tooltip, type ClassKey, type ViewRole } from './shared'
import BracketView from './BracketView'
import GroupStageView from './GroupStageView'
import { useToast } from '@/context/ToastContext'
import CaptainList from './division/CaptainList'
import { BracketSection, KnockoutScoreRow } from './division/KnockoutSection'
import AuctionResultsModal from './division/AuctionResultsModal'
import PickBanModal from './division/PickBanModal'

const MAX_CAPTAINS = 8

// ─── Placeholder knockout matches (shown before bracket is generated) ─────────

const PLACEHOLDER_KNOCKOUT: Match[] = [
  { id: -100, bracket_id: -1, round: 4, match_order: 0, match_label: 'Semi-Final 1', group_label: null, captain_a_id: null, captain_b_id: null, matchup_id: null, score_a: null, score_b: null, winner_captain_id: null, status: 'pending', is_finals: 0 },
  { id: -101, bracket_id: -1, round: 4, match_order: 1, match_label: 'Semi-Final 2', group_label: null, captain_a_id: null, captain_b_id: null, matchup_id: null, score_a: null, score_b: null, winner_captain_id: null, status: 'pending', is_finals: 0 },
  { id: -102, bracket_id: -1, round: 5, match_order: 0, match_label: 'Final',        group_label: null, captain_a_id: null, captain_b_id: null, matchup_id: null, score_a: null, score_b: null, winner_captain_id: null, status: 'pending', is_finals: 1 },
]

// ─── Division tab ─────────────────────────────────────────────────────────────

export default function DivisionTab({ auction, slug, role, project }: {
  auction: Auction; slug: string; role: ViewRole; project: Tournament
}) {
  const { toast }    = useToast()
  const { user }     = useAuth()
  const navigate     = useNavigate()
  const [captains,      setCaptains]      = useState<Captain[]>([])
  const [loading,       setLoading]       = useState(true)
  const [goingLive,     setGoingLive]     = useState(false)
  const [bracket,       setBracket]       = useState<Bracket | null>(null)
  const [matches,       setMatches]       = useState<Match[]>([])
  const [shuffling,     setShuffling]     = useState(false)
  const [resetting,     setResetting]     = useState(false)
  const [resetConfirm,  setResetConfirm]  = useState(false)
  const [error,         setError]         = useState('')
  const [shownTokens,   setShownTokens]   = useState<Set<number>>(new Set())
  const [showResults,   setShowResults]   = useState(false)
  const [auctionStatus,  setAuctionStatus]  = useState(auction.status)
  const [readying,       setReadying]       = useState(false)
  const [activeSession,  setActiveSession]  = useState<AuctionSession | null>(null)
  const [teamRenameVal,   setTeamRenameVal]   = useState('')
  const [teamRenameBusy,  setTeamRenameBusy]  = useState(false)
  const [pickBanSession,   setPickBanSession]   = useState<PickBanSession | null>(null)
  const [startingPickBan,  setStartingPickBan]  = useState(false)
  const [showPickBanModal, setShowPickBanModal] = useState(false)
  const canManage = role === 'admin' || role === 'host'
  const isCaptain = role === 'captain'

  // Derive finals match from matches state (stable primitive deps for effect below)
  const finalsMatch = matches.find(m => m.is_finals === 1) ?? null

  useEffect(() => {
    if (!finalsMatch) { setPickBanSession(null); return }
    bracketsApi.getPickBanByMatch(finalsMatch.id)
      .then(({ session }) => setPickBanSession(session))
      .catch(() => setPickBanSession(null))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalsMatch?.id, finalsMatch?.captain_a_id, finalsMatch?.captain_b_id])

  const captainsWithToken = captains.filter(c => c.token)
  const allTokensShown = captainsWithToken.length > 0 && captainsWithToken.every(c => shownTokens.has(c.id))
  function toggleAllTokens() {
    if (allTokensShown) {
      setShownTokens(new Set())
    } else {
      setShownTokens(new Set(captainsWithToken.map(c => c.id)))
    }
  }
  function toggleOneToken(id: number) {
    setShownTokens(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  useEffect(() => {
    async function load() {
      const [c, brackets, sessions] = await Promise.all([
        auctionsApi.listCaptains(auction.id),
        bracketsApi.listForTournament(slug),
        sessionsApi.listForAuction(auction.id),
      ])
      setCaptains(c)
      // Captains can't access the auction detail endpoint — skip for them
      if (role !== 'captain') {
        try {
          const auctionData = await auctionsApi.get(auction.id)
          setAuctionStatus(auctionData.status)
        } catch { /* keep initial prop value */ }
      }
      const active = sessions.find(s => s.status === 'live' || s.status === 'paused')
      setActiveSession(active ?? null)
      const linked = brackets.find(b => b.auction_id === auction.id)
      if (linked) {
        setBracket(linked)
        const { matches: m } = await bracketsApi.get(linked.id)
        setMatches(m)
      }
    }
    load().finally(() => setLoading(false))
  }, [auction.id, slug])

  async function addCaptain(data: { display_name: string; team_name?: string; budget: number; class: ClassKey | null }) {
    if (captains.length >= MAX_CAPTAINS) return
    const c = await auctionsApi.addCaptain(auction.id, {
      display_name: data.display_name,
      team_name: data.team_name,
      budget: data.budget,
      class: data.class,
    })
    setCaptains(prev => [...prev, c])
    toast('Captain added', 'success')
  }

  async function updateCaptain(id: number, data: { display_name?: string; team_name?: string | null; budget?: number; class?: ClassKey | null }) {
    const u = await auctionsApi.updateCaptain(id, data)
    setCaptains(prev => prev.map(c => c.id === id ? u : c))
  }

  async function removeCaptain(id: number) {
    await auctionsApi.deleteCaptain(id)
    setCaptains(prev => prev.filter(c => c.id !== id))
    toast('Captain removed', 'info')
  }

  async function genToken(captainId: number) {
    const r = await authApi.generateCaptainToken(captainId)
    setCaptains(prev => prev.map(c => c.id === captainId ? { ...c, token: r.token } : c))
    toast('Token generated', 'success')
  }

  async function revokeToken(captainId: number) {
    await authApi.revokeCaptainToken(captainId)
    setCaptains(prev => prev.map(c => c.id === captainId ? { ...c, token: null } : c))
    toast('Token revoked', 'info')
  }

  async function handleReady() {
    setReadying(true); setError('')
    try {
      await auctionsApi.markReady(auction.id)
      setAuctionStatus('ready')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to mark ready')
    } finally { setReadying(false) }
  }

  async function handleUnready() {
    setReadying(true); setError('')
    try {
      await auctionsApi.markUnready(auction.id)
      setAuctionStatus('setup')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally { setReadying(false) }
  }

  async function goLive() {
    setGoingLive(true); setError('')
    try {
      const existing = await sessionsApi.listForAuction(auction.id)
      const resumable = existing.find(s => s.status === 'pending' || s.status === 'paused')
      let sessionId: number
      if (resumable) {
        await sessionsApi.goLive(resumable.id)
        setActiveSession({ ...resumable, status: 'live' })
        sessionId = resumable.id
      } else {
        const { session } = await sessionsApi.create(auction.id)
        await sessionsApi.goLive(session.id)
        setActiveSession({ ...session, status: 'live' })
        sessionId = session.id
      }
      navigate(`/t/${slug}/auction/${sessionId}`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally { setGoingLive(false) }
  }

  async function shuffleBracket() {
    if (!bracket) return
    if (captains.length < MAX_CAPTAINS) {
      toast(`Need ${MAX_CAPTAINS} captains to shuffle (have ${captains.length})`, 'error')
      return
    }
    setShuffling(true)
    try {
      await bracketsApi.generate(bracket.id, captains.map(c => c.id))
      const { matches: m } = await bracketsApi.get(bracket.id)
      setMatches(m)
      toast('Bracket shuffled', 'success')
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Failed to generate', 'error')
    } finally { setShuffling(false) }
  }

  function handleResetClick() {
    const hasPlayed = matches.some(m => m.status === 'played')
    if (hasPlayed) {
      setResetConfirm(true)
    } else {
      doReset()
    }
  }

  async function doReset() {
    if (!bracket) return
    setResetting(true)
    try {
      await bracketsApi.reset(bracket.id)
      setMatches([])
      setResetConfirm(false)
      toast('Bracket reset', 'info')
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Failed to reset', 'error')
    } finally { setResetting(false) }
  }

  async function startPickBan() {
    if (!finalsMatch) return
    const mapPool: number[] = (() => { try { return JSON.parse(project.finals_map_pool) } catch { return [] } })()
    setStartingPickBan(true)
    try {
      const session = await bracketsApi.createPickBan(finalsMatch.id, mapPool)
      setPickBanSession(session)
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Failed to start pick-ban', 'error')
    } finally { setStartingPickBan(false) }
  }

  async function handleResult(matchId: number, scoreA: number, scoreB: number) {
    await bracketsApi.overrideResult(matchId, scoreA, scoreB)
    if (bracket) {
      const { matches: m } = await bracketsApi.get(bracket.id)
      setMatches(m)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-5 h-5 text-zinc-600 animate-spin" />
    </div>
  )

  const groupAMatches    = matches.filter(m => m.group_label === 'A')
  const groupBMatches    = matches.filter(m => m.group_label === 'B')
  const knockoutMatches  = matches.filter(m => m.round >= 4)
  const displayKnockout  = knockoutMatches.length > 0 ? knockoutMatches : PLACEHOLDER_KNOCKOUT
  const canShuffle = canManage
  const canReset   = canManage && matches.length > 0

  return (
    <>
    <div className="flex gap-6">

      {/* ── Left column: controls + captains ── */}
      <div className="flex-none w-[28rem] space-y-4">

        {/* Go Live card */}
        <div className="flex items-center justify-between p-4 bg-zinc-900 border border-zinc-800 rounded-2xl">
          <div className="min-w-0 mr-3">
            <p className="text-sm font-semibold text-zinc-100 truncate">{auction.name}</p>
            <p className="text-xs text-zinc-600 font-mono mt-0.5">
              {project.players_per_team} players/team · {captains.length}/{MAX_CAPTAINS} · {auctionStatus}
              {activeSession && <span className="ml-1 text-amber-500/70">· session {activeSession.status}</span>}
            </p>
          </div>
          <div className="flex-shrink-0 flex flex-col items-end gap-1.5">
            {auctionStatus === 'finished' ? (
              <>
                {canManage ? (
                  <button onClick={() => setShowResults(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-semibold hover:bg-amber-500/25 transition-colors">
                    <BarChart2 className="w-3.5 h-3.5" /> Team compositions
                  </button>
                ) : (
                  <button disabled title="Only hosts and admins can edit rosters"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-semibold opacity-40 cursor-not-allowed">
                    <BarChart2 className="w-3.5 h-3.5" /> Team compositions
                  </button>
                )}
                <Link to={`/t/${slug}?div=${auction.id}&view=teams`}
                  className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors underline underline-offset-2">
                  Public view →
                </Link>
              </>
            ) : canManage ? (
              auctionStatus === 'ready' && activeSession?.status === 'live' ? (
                <Tooltip label="Session is running — halt it first">
                  <button disabled
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-500/15 border border-green-500/30 text-green-400 text-xs font-semibold cursor-not-allowed opacity-40">
                    <Check className="w-3.5 h-3.5" /> Ready
                  </button>
                </Tooltip>
              ) : auctionStatus === 'ready' && activeSession?.status === 'paused' ? (
                <Tooltip label="Session is paused — auctioneer can resume">
                  <button disabled
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-500/15 border border-green-500/30 text-green-400 text-xs font-semibold cursor-not-allowed opacity-40">
                    <Check className="w-3.5 h-3.5" /> Ready
                  </button>
                </Tooltip>
              ) : auctionStatus === 'ready' ? (
                <button onClick={handleUnready} disabled={readying}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-500/15 border border-green-500/30 text-green-400 text-xs font-semibold hover:bg-green-500/25 transition-colors disabled:opacity-40">
                  {readying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Ready
                </button>
              ) : captains.length < MAX_CAPTAINS ? (
                <Tooltip label={`Need all ${MAX_CAPTAINS} captains (${captains.length}/${MAX_CAPTAINS})`}>
                  <button disabled
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-600 text-xs font-semibold cursor-not-allowed opacity-40">
                    <Check className="w-3.5 h-3.5" /> Mark Ready
                  </button>
                </Tooltip>
              ) : (
                <button onClick={handleReady} disabled={readying}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-400 text-xs font-semibold hover:bg-zinc-700 transition-colors disabled:opacity-40">
                  {readying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Mark Ready
                </button>
              )
            ) : isCaptain ? (
              activeSession ? (
                <Link to={`/t/${slug}/auction/${activeSession.id}`}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-semibold hover:bg-red-500/25 transition-colors">
                  <Radio className="w-3.5 h-3.5" /> Join Session
                </Link>
              ) : (
                <span className="text-xs text-zinc-600 font-mono">Waiting for session…</span>
              )
            ) : (
              auctionStatus === 'ready' ? (
                activeSession ? (
                  <Link to={`/t/${slug}/auction/${activeSession.id}`}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-semibold hover:bg-red-500/25 transition-colors">
                    <Radio className="w-3.5 h-3.5" /> Join Session
                  </Link>
                ) : (
                  <button onClick={goLive} disabled={goingLive}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-semibold hover:bg-red-500/25 transition-colors disabled:opacity-40">
                    {goingLive ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Radio className="w-3.5 h-3.5" />}
                    Go live
                  </button>
                )
              ) : (
                <Tooltip label="Host must mark the auction as ready first">
                  <button disabled
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-600 text-xs font-semibold cursor-not-allowed opacity-50">
                    <Radio className="w-3.5 h-3.5" /> Go live
                  </button>
                </Tooltip>
              )
            )}
            {canManage && activeSession && (activeSession.status === 'live' || activeSession.status === 'paused') && (
              <Link to={`/t/${slug}/auction/${activeSession.id}`}
                className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors underline underline-offset-2">
                View session →
              </Link>
            )}
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-400 bg-red-400/8 border border-red-400/20 rounded-xl px-3 py-2.5">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
          </div>
        )}

        {/* Captain slots */}
        <CaptainList
          captains={captains}
          canManage={canManage}
          shownTokens={shownTokens}
          allTokensShown={allTokensShown}
          onToggleAllTokens={toggleAllTokens}
          onToggleOneToken={toggleOneToken}
          onAdd={addCaptain}
          onUpdate={updateCaptain}
          onRemove={removeCaptain}
          onGenToken={genToken}
          onRevokeToken={revokeToken}
        />

        {/* ── Captain: rename own team ── */}
        {isCaptain && auction.id === user?.auctionId && (() => {
          const myCaptain = captains.find(c => c.id === user?.captainId)
          if (!myCaptain) return null
          const currentName = myCaptain.team_name ?? `${myCaptain.display_name}'s team`
          async function saveRename() {
            if (!teamRenameVal.trim() || teamRenameBusy) return
            setTeamRenameBusy(true)
            try {
              await auctionsApi.renameOwnTeam(myCaptain!.id, teamRenameVal.trim())
              setCaptains(prev => prev.map(c => c.id === myCaptain!.id ? { ...c, team_name: teamRenameVal.trim() } : c))
              setTeamRenameVal('')
              toast('Team renamed', 'success')
            } catch (e: unknown) {
              toast(e instanceof Error ? e.message : 'Failed', 'error')
            } finally { setTeamRenameBusy(false) }
          }
          return (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-2.5">
              <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Rename your team</p>
              <p className="text-xs text-zinc-500">Current: <span className="text-zinc-300 font-medium">{currentName}</span></p>
              <div className="flex gap-2">
                <input
                  value={teamRenameVal}
                  onChange={e => setTeamRenameVal(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && saveRename()}
                  placeholder="New team name…"
                  className="flex-1 px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50 transition-colors"
                />
                <button
                  onClick={saveRename}
                  disabled={teamRenameBusy || !teamRenameVal.trim()}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-semibold hover:bg-amber-500/25 transition-colors disabled:opacity-40"
                >
                  {teamRenameBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Save
                </button>
              </div>
            </div>
          )
        })()}
      </div>

      {/* ── Right column: bracket ── */}
      <div className="flex-1 min-w-0 flex flex-col gap-4">

        <BracketSection title="Group A">
          <GroupStageView
            matches={groupAMatches}
            group="A"
            captains={captains}
            canManage={canManage}
            onResultUpdate={handleResult}
          />
        </BracketSection>

        <BracketSection title="Group B">
          <GroupStageView
            matches={groupBMatches}
            group="B"
            captains={captains}
            canManage={canManage}
            onResultUpdate={handleResult}
          />
        </BracketSection>

        <BracketSection title="Finals">
          {bracket ? (
            <div className="grid grid-cols-2 gap-4 px-4 py-4">
              {/* Bracket SVG — left half, fills cell */}
              <div className="min-w-0 px-[10%]">
                <BracketView bracket={bracket} matches={displayKnockout} captains={captains} />
              </div>
              {/* Score input / results — right half */}
              <div className="border-l border-zinc-800/60 pl-4 space-y-1.5 self-center">
                {knockoutMatches.length > 0 ? (
                  knockoutMatches
                    .sort((a, b) => a.round - b.round || a.match_order - b.match_order)
                    .map(m => (
                      <KnockoutScoreRow key={m.id} match={m} captains={captains} canManage={canManage} onSave={handleResult} />
                    ))
                ) : (
                  <p className="text-xs text-zinc-700 italic">Scores will appear once bracket is generated.</p>
                )}
                {/* Pick-ban trigger / join */}
                {finalsMatch && (() => {
                  const bothFinalists = !!(finalsMatch.captain_a_id && finalsMatch.captain_b_id)
                  if (canManage) {
                    if (pickBanSession) return (
                      <button onClick={() => setShowPickBanModal(true)}
                        className="mt-1 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold hover:bg-amber-500/20 transition-colors">
                        <Swords className="w-3 h-3" /> View Pick-Ban
                      </button>
                    )
                    return (
                      <button onClick={startPickBan} disabled={startingPickBan || !bothFinalists}
                        title={!bothFinalists ? 'Both finalists must be decided first' : undefined}
                        className="mt-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-400 text-xs font-semibold hover:bg-zinc-700 transition-colors w-full disabled:opacity-40 disabled:cursor-not-allowed">
                        {startingPickBan ? <Loader2 className="w-3 h-3 animate-spin" /> : <Swords className="w-3 h-3" />}
                        Start Pick-Ban
                      </button>
                    )
                  }
                  const myCapId = user?.captainId
                  const imFinalist = isCaptain && myCapId &&
                    (finalsMatch.captain_a_id === myCapId || finalsMatch.captain_b_id === myCapId)
                  if (imFinalist && pickBanSession && pickBanSession.status !== 'complete') return (
                    <Link to={`/pickban/${pickBanSession.id}`}
                      className="mt-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold hover:bg-amber-500/20 transition-colors">
                      <Swords className="w-3 h-3" /> Join Pick-Ban
                    </Link>
                  )
                  return null
                })()}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-10">
              <p className="text-sm text-zinc-700 italic">No bracket linked to this division</p>
            </div>
          )}
        </BracketSection>

        {/* ── Bottom action bar: shuffle / reset ── */}
        {bracket && canManage && (
          <div className="flex items-center justify-end gap-2">
            {canReset && (
              resetConfirm ? (
                <>
                  <span className="text-xs text-zinc-500">Reset all bracket data?</span>
                  <button onClick={doReset} disabled={resetting}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25 transition-colors disabled:opacity-40">
                    {resetting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                    Confirm reset
                  </button>
                  <button onClick={() => setResetConfirm(false)}
                    className="px-3 py-1.5 text-xs rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700 transition-colors">
                    Cancel
                  </button>
                </>
              ) : (
                <button onClick={handleResetClick}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500/60 text-xs font-medium hover:bg-red-500/20 hover:text-red-400 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" /> Reset bracket
                </button>
              )
            )}

            {canShuffle ? (
              <button onClick={shuffleBracket} disabled={shuffling}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors disabled:opacity-40">
                {shuffling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Shuffle className="w-3.5 h-3.5" />}
                Shuffle bracket
              </button>
            ) : (
              <Tooltip label="Reset the bracket to reshuffle">
                <button disabled
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-600 text-xs font-medium cursor-not-allowed opacity-50">
                  <Lock className="w-3.5 h-3.5" /> Locked
                </button>
              </Tooltip>
            )}
          </div>
        )}

      </div>
    </div>

    {showPickBanModal && pickBanSession && (
      <PickBanModal
        sessionId={pickBanSession.id}
        onDeleted={() => { setPickBanSession(null); setShowPickBanModal(false) }}
        onClose={() => setShowPickBanModal(false)}
      />
    )}

    {showResults && (
      <AuctionResultsModal
        auctionId={auction.id}
        auctionName={auction.name}
        canManage={canManage}
        playersPerTeam={project.players_per_team}
        onClose={() => setShowResults(false)}
        onAuctionChange={() => {
          setAuctionStatus('ready')
          setActiveSession(null)
          setShowResults(false)
        }}
      />
    )}
    </>
  )
}
