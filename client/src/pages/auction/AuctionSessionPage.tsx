import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import {
  sessionsApi,
  type SessionDetail,
  type AuctionSession,
} from '@/api/sessions'
import PublicNav from '@/components/PublicNav'
import {
  Loader2, Radio, Pause, Check, RefreshCw,
  ChevronRight, Trophy, Flag,
} from 'lucide-react'
import { useWs } from '@/hooks/useWs'
import { useTitle } from '@/hooks/useTitle'
import CurrentPlayerCard from '@/components/auction/CurrentPlayerCard'
import AuctioneerControls from '@/components/auction/AuctioneerControls'
import BidChat from '@/components/auction/BidChat'
import FreeChat from '@/components/auction/FreeChat'
import { TeamGrid, MyStatsPanel } from '@/components/auction/TeamRoster'
import UpcomingPanel from '@/components/auction/UpcomingPanel'
import ProgressCard from '@/components/auction/ProgressCard'
import PlayerPoolModal from '@/components/auction/PlayerPoolModal'

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: AuctionSession['status'] }) {
  if (status === 'live') return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-widest px-2.5 py-1 rounded-full bg-red-500/15 border border-red-500/30 text-red-400">
      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> Live
    </span>
  )
  if (status === 'paused') return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-widest px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400">
      <Pause className="w-2.5 h-2.5" /> Paused
    </span>
  )
  if (status === 'finished') return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-widest px-2.5 py-1 rounded-full bg-zinc-700/50 border border-zinc-600 text-zinc-400">
      <Check className="w-2.5 h-2.5" /> Finished
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-widest px-2.5 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-500">
      Pending
    </span>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AuctionSessionPage() {
  const { slug, sessionId } = useParams<{ slug: string; sessionId: string }>()
  const { user }            = useAuth()
  const navigate            = useNavigate()

  useEffect(() => {
    if (window.innerWidth < 768) navigate(`/t/${slug}/auction/${sessionId}/mobile`, { replace: true })
  }, [])

  const [detail,      setDetail]      = useState<SessionDetail | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')
  const [halting,     setHalting]     = useState(false)
  const [syncing,     setSyncing]     = useState(false)
  const [starting,    setStarting]    = useState(false)
  const [finishing,   setFinishing]   = useState(false)
  const [showPool,    setShowPool]    = useState(false)

  const loadSeqRef = useRef(0)
  const id         = Number(sessionId)

  // Scale the entire page so it looks proportionally the same across monitor widths.
  // 1920px is the design baseline. On wider viewports every rem/px visually grows.
  // transform:scale is used (not zoom) so that compensated width/height prevent overflow.
  const [scale, setScale] = useState(() => Math.max(1, window.innerWidth / 1920))

  useTitle(detail ? `${detail.auctionName} · Auction` : 'Auction')
  useLayoutEffect(() => {
    const apply = () => setScale(Math.max(1, window.innerWidth / 1920))
    window.addEventListener('resize', apply)
    return () => window.removeEventListener('resize', apply)
  }, [])

  const load = useCallback(async () => {
    const seq = ++loadSeqRef.current
    try {
      const d = await sessionsApi.get(id)
      if (seq !== loadSeqRef.current) return   // stale response — newer load already resolved
      setDetail(d)
      setError('')
    } catch (e: unknown) {
      if (seq !== loadSeqRef.current) return
      setError(e instanceof Error ? e.message : 'Failed to load session')
    }
  }, [id])

  // Initial load
  useEffect(() => { load().finally(() => setLoading(false)) }, [load])

  // WebSocket: load() on every server push, and resync on reconnect
  useWs({
    sessionId: id,
    token: null,
    onMessage: load,   // server broadcasts after every mutation — each push = one fresh fetch
    onOpen:    load,   // reconnect: resync any state missed during the gap
    enabled: detail?.session.status !== 'finished',
  })

  async function handleHalt() {
    setHalting(true)
    try { await sessionsApi.pause(id); await load() }
    catch { /* ignore */ } finally { setHalting(false) }
  }

  async function handleResume() {
    setHalting(true)
    try { await sessionsApi.goLive(id); await load() }
    catch { /* ignore */ } finally { setHalting(false) }
  }

  async function handleSyncPool() {
    if (!detail) return
    setSyncing(true)
    try { await sessionsApi.syncPool(detail.session.id); await load() }
    catch { /* ignore */ } finally { setSyncing(false) }
  }

  async function handleStart() {
    if (!detail) return
    setStarting(true)
    try { await sessionsApi.start(detail.session.id); await load() }
    catch { /* ignore */ } finally { setStarting(false) }
  }

  async function handleRefund(purchaseId: number) {
    try { await sessionsApi.refund(id, purchaseId); await load() }
    catch { /* ignore */ }
  }

  async function handleFinish() {
    setFinishing(true)
    try { await sessionsApi.finish(id); await load() }
    catch { /* ignore */ } finally { setFinishing(false) }
  }

  const role        = user?.role
  const canControl  = role === 'auctioneer' || role === 'admin'
  const canHalt     = role === 'auctioneer' || role === 'host' || role === 'admin'
  const canResume   = role === 'auctioneer' || role === 'admin'
  const canRevoke   = role === 'auctioneer' || role === 'host' || role === 'admin'
  const isCaptain   = role === 'captain'
  const myCaptainId = isCaptain ? user?.captainId : undefined

  if (loading) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <Loader2 className="w-6 h-6 text-zinc-600 animate-spin" />
    </div>
  )

  if (error || !detail) return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      <PublicNav />
      <div className="flex-1 flex items-center justify-center">
        <p className="text-zinc-500 text-sm">{error || 'Session not found.'}</p>
      </div>
    </div>
  )

  const { session, activePlayer, upcoming, purchases, captains, progress, auctionName, minIncrement, bidCooldown, currentBid, bidHistory, chatMessages } = detail
  const isPending  = session.status === 'pending'
  const isPaused   = session.status === 'paused'
  const isLive     = session.status === 'live'
  const isFinished = session.status === 'finished'
  const halfBudget = session.half_budget === 1

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
    <div className="bg-zinc-950 flex flex-col overflow-hidden"
      style={{
        transformOrigin: 'top left',
        transform: `scale(${scale})`,
        width:  `${100 / scale}vw`,
        height: `${100 / scale}vh`,
      }}
    >
      {/* Nav */}
      <PublicNav extra={
        <div className="flex items-center gap-2">
          <StatusBadge status={session.status} />
          {canControl && isPending && (
            <button onClick={handleSyncPool} disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-zinc-800 border-zinc-700 text-zinc-300 text-xs font-semibold hover:bg-zinc-700 transition-colors disabled:opacity-40">
              {syncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Sync Pool
            </button>
          )}
          {canHalt && isLive && (
            <button onClick={handleHalt} disabled={halting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-orange-500/15 border-orange-500/30 text-orange-400 text-xs font-semibold hover:bg-orange-500/25 transition-colors disabled:opacity-40">
              {halting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Pause className="w-3 h-3" />} Halt
            </button>
          )}
          {canResume && isPaused && (
            <button onClick={handleResume} disabled={halting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-green-500/15 border-green-500/30 text-green-400 text-xs font-semibold hover:bg-green-500/25 transition-colors disabled:opacity-40">
              {halting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Radio className="w-3 h-3" />} Resume
            </button>
          )}
          {canControl && (isLive || isPaused) && (() => {
            const incomplete = captains.filter(c => purchases.filter(p => p.captain_id === c.id).length < progress.playersPerTeam)
            const locked = incomplete.length > 0
            const tooltip = locked ? `Incomplete teams: ${incomplete.map(c => c.team_name || c.display_name).join(', ')}` : undefined
            return (
              <button onClick={handleFinish} disabled={finishing || locked} title={tooltip}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-red-500/10 border-red-500/25 text-red-400 text-xs font-semibold hover:bg-red-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                {finishing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Flag className="w-3 h-3" />} End
              </button>
            )
          })()}
          {slug && (
            <Link to={`/t/${slug}`} className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors ml-1">← Back</Link>
          )}
        </div>
      } />

      {/* Breadcrumb */}
      <div className="border-b border-zinc-800/60 bg-zinc-900/40 flex-shrink-0">
        <div className="w-full px-[5%] py-2 flex items-center gap-1.5 text-xs text-zinc-600">
          <span>{slug}</span>
          <ChevronRight className="w-3 h-3" />
          <span className="text-zinc-400">{auctionName}</span>
        </div>
      </div>

      {/* Content — fills remaining viewport, no page scroll */}
      <div className="flex-1 overflow-hidden w-full px-[5%] py-3">

        {/* Finished */}
        {isFinished && (
          <div className="h-full flex flex-col items-center justify-center gap-4">
            <Trophy className="w-12 h-12 text-amber-500" />
            <p className="text-2xl font-black text-zinc-100" style={{ fontFamily: '"Barlow Condensed", sans-serif' }}>
              Auction complete
            </p>
            <p className="text-sm text-zinc-500">{progress.sold} drafted · {progress.cycled} skipped</p>
            <Link to={`/t/${slug}?div=${session.auction_id}&view=teams`}
              className="mt-2 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm transition-colors">
              View Team Compositions <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        {/* ── Non-captain layout ──────────────────────────────────────────────────
            Left  : free chat (flex-1)
            Center: main box → controls/progress row → team grid (flex-3)
            Right : upcoming → bid chat (flex-1)
        */}
        {!isFinished && !isCaptain && (
          <div className="h-full flex gap-3">

            {/* Left: chat only */}
            <div style={{ flex: 4 }} className="min-h-0 flex flex-col">
              <FreeChat
                sessionId={id}
                messages={chatMessages}
                onLoad={load}
                className="flex-1 min-h-0"
              />
            </div>

            {/* Center: player box + controls + team grid */}
            <div className="min-w-0 flex flex-col gap-3" style={{ flex: 13 }}>
              <CurrentPlayerCard
                detail={detail}
                isLive={isLive}
                isPaused={isPaused}
                onStart={canControl ? handleStart : undefined}
                starting={starting}
                currentBid={currentBid}
                className="flex-none"
              />
              {canControl && isLive && (
                <div className="flex-none flex gap-3">
                  <div className="flex-1 min-w-0">
                    <AuctioneerControls
                      sessionId={id}
                      captains={captains}
                      minIncrement={minIncrement}
                      bidCooldown={bidCooldown}
                      currentBid={currentBid}
                      activePlayer={activePlayer}
                      halfBudget={halfBudget}
                      onRefresh={load}
                      onToggleHalfBudget={load}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <ProgressCard progress={progress} captainCount={captains.length}
                      onOpenPool={canControl && isLive ? () => setShowPool(true) : undefined}
                      className="h-full" />
                  </div>
                </div>
              )}
              {canControl && isPaused && (
                <div className="flex-none flex gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="bg-zinc-900 border border-amber-500/25 rounded-2xl px-4 py-3 flex items-center gap-2.5 flex-shrink-0">
                      <Pause className="w-4 h-4 text-amber-400 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-amber-300">Session paused</p>
                        <p className="text-xs text-zinc-500">Use <span className="text-zinc-400 font-medium">Resume</span> in the nav bar to continue bidding</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <ProgressCard progress={progress} captainCount={captains.length}
                      onOpenPool={canControl && isLive ? () => setShowPool(true) : undefined}
                      className="h-full" />
                  </div>
                </div>
              )}
              {!canControl && (
                <ProgressCard progress={progress} captainCount={captains.length}
                  onOpenPool={undefined}
                  className="flex-none" />
              )}
              {/* Team grid: 2 rows × 4 cols */}
              <TeamGrid
                captains={captains}
                purchases={purchases}
                myCaptainId={myCaptainId}
                halfBudget={halfBudget}
                playersPerTeam={progress.playersPerTeam}
                onRefund={canControl && isLive ? handleRefund : undefined}
                className="flex-1 min-h-0"
              />
            </div>

            {/* Right: upcoming → bid chat */}
            <div style={{ flex: 3 }} className="min-w-0 flex flex-col gap-3">
              <UpcomingPanel upcoming={upcoming} />
              <BidChat
                sessionId={id}
                bidHistory={bidHistory}
                currentBid={currentBid}
                minIncrement={minIncrement}
                isLive={isLive}
                canBid={false}
                canRevoke={canRevoke}
                onLoad={load}
                className="flex-1 min-h-0"
              />
            </div>
          </div>
        )}

        {/* ── Captain layout ────────────────────────────────────────────────────
            4 columns: teams[0..3] (flex-1) | center (flex-2) | upcoming+bid (flex-1) | teams[4..7] (flex-1)
            Center: CurrentPlayerCard → [MyStatsPanel | ProgressCard] → FreeChat
        */}
        {!isFinished && isCaptain && (() => {
          const myCapData    = myCaptainId != null ? captains.find(c => c.id === myCaptainId) ?? null : null
          const myPlayers    = purchases.filter(p => p.captain_id === myCaptainId)
          const isMyTeamFull = myPlayers.length >= progress.playersPerTeam
          const half         = Math.ceil(captains.length / 2)
          const leftCaps     = captains.slice(0, half)
          const rightCaps    = captains.slice(half)
          return (
            <div className="h-full flex gap-3">

              {/* Left team list — first half */}
              <div style={{ flex: 1 }} className="min-w-0 min-h-0">
                <TeamGrid
                  captains={leftCaps}
                  purchases={purchases}
                  myCaptainId={myCaptainId}
                  halfBudget={halfBudget}
                  playersPerTeam={progress.playersPerTeam}
                  cols={1}
                  className="h-full"
                />
              </div>

              <div className="w-px bg-zinc-700/40 flex-shrink-0 self-stretch" />

              {/* Center — flex-2: player card → stats+progress → free chat */}
              <div style={{ flex: 2 }} className="min-w-0 min-h-0 flex flex-col gap-3">
                <CurrentPlayerCard
                  detail={detail}
                  isLive={isLive}
                  isPaused={isPaused}
                  onStart={canControl ? handleStart : undefined}
                  starting={starting}
                  currentBid={currentBid}
                  className="flex-none"
                />
                <div className="flex-none flex gap-3">
                  {myCapData && (
                    <div className="flex-1 min-w-0">
                      <MyStatsPanel captain={myCapData} players={myPlayers} halfBudget={halfBudget} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <ProgressCard progress={progress} captainCount={captains.length}
                      onOpenPool={isLive ? () => setShowPool(true) : undefined}
                      className="h-full" />
                  </div>
                </div>
                <FreeChat
                  sessionId={id}
                  messages={chatMessages}
                  onLoad={load}
                  className="flex-1 min-h-0"
                />
              </div>

              {/* Bid column — flex-1: upcoming → bid chat */}
              <div style={{ flex: 1 }} className="min-w-0 min-h-0 flex flex-col gap-3">
                <UpcomingPanel upcoming={upcoming} />
                <BidChat
                  sessionId={id}
                  bidHistory={bidHistory}
                  currentBid={currentBid}
                  minIncrement={minIncrement}
                  isLive={isLive}
                  canBid={true}
                  captainId={myCaptainId}
                  teamFull={isMyTeamFull}
                  onLoad={load}
                  className="flex-1 min-h-0"
                />
              </div>

              <div className="w-px bg-zinc-700/40 flex-shrink-0 self-stretch" />

              {/* Right team list — second half */}
              <div style={{ flex: 1 }} className="min-w-0 min-h-0">
                <TeamGrid
                  captains={rightCaps}
                  purchases={purchases}
                  myCaptainId={myCaptainId}
                  halfBudget={halfBudget}
                  playersPerTeam={progress.playersPerTeam}
                  cols={1}
                  className="h-full"
                />
              </div>
            </div>
          )
        })()}
      </div>

      {showPool && (
        <PlayerPoolModal
          sessionId={id}
          canPromote={canControl}
          onSetActive={load}
          onClose={() => setShowPool(false)}
        />
      )}
    </div>
    </div>
  )
}
