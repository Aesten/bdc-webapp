import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { sessionsApi, type SessionDetail, type AuctionSession } from '@/api/sessions'
import { useWs } from '@/hooks/useWs'
import { cn } from '@/lib/utils'
import { Loader2, Pause, Check, Sword, Users } from 'lucide-react'
import CurrentPlayerCard from '@/components/auction/CurrentPlayerCard'
import BidChat from '@/components/auction/BidChat'
import FreeChat from '@/components/auction/FreeChat'
import { TeamGrid } from '@/components/auction/TeamRoster'
import ProgressCard from '@/components/auction/ProgressCard'
import PlayerPoolModal from '@/components/auction/PlayerPoolModal'

type Tab = 'bid' | 'teams'

function StatusBadge({ status }: { status: AuctionSession['status'] }) {
  if (status === 'live') return (
    <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-red-500/15 border border-red-500/30 text-red-400">
      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> Live
    </span>
  )
  if (status === 'paused') return (
    <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400">
      <Pause className="w-2.5 h-2.5" /> Paused
    </span>
  )
  if (status === 'finished') return (
    <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-zinc-700/50 border border-zinc-600 text-zinc-400">
      <Check className="w-2.5 h-2.5" /> Finished
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-500">
      Pending
    </span>
  )
}

export default function MobileAuctionPage() {
  const { slug, sessionId } = useParams<{ slug: string; sessionId: string }>()
  const { user } = useAuth()

  const [detail,    setDetail]    = useState<SessionDetail | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  const [tab,       setTab]       = useState<Tab>('bid')
  const [showPool,  setShowPool]  = useState(false)
  const [starting,  setStarting]  = useState(false)

  const loadSeqRef = useRef(0)
  const id = Number(sessionId)

  const load = useCallback(async () => {
    const seq = ++loadSeqRef.current
    try {
      const d = await sessionsApi.get(id)
      if (seq !== loadSeqRef.current) return
      setDetail(d)
      setError('')
    } catch (e: unknown) {
      if (seq !== loadSeqRef.current) return
      setError(e instanceof Error ? e.message : 'Failed to load session')
    }
  }, [id])

  useEffect(() => { load().finally(() => setLoading(false)) }, [load])

  useWs({
    sessionId: id,
    token: null,
    onMessage: load,
    onOpen:    load,
    enabled: detail?.session.status !== 'finished',
  })

  async function handleStart() {
    if (!detail) return
    setStarting(true)
    try { await sessionsApi.start(detail.session.id); await load() }
    catch { /* ignore */ } finally { setStarting(false) }
  }

  const role        = user?.role
  const isCaptain   = role === 'captain'
  const canControl  = role === 'auctioneer' || role === 'admin'
  const myCaptainId = isCaptain ? user?.captainId : undefined

  if (loading) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <Loader2 className="w-6 h-6 text-zinc-600 animate-spin" />
    </div>
  )

  if (error || !detail) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <p className="text-zinc-500 text-sm">{error || 'Session not found.'}</p>
    </div>
  )

  const { session, activePlayer, upcoming, purchases, captains, progress,
          auctionName, minIncrement, bidCooldown, currentBid, bidHistory, chatMessages } = detail
  const isLive     = session.status === 'live'
  const isPaused   = session.status === 'paused'
  const isFinished = session.status === 'finished'
  const halfBudget = session.half_budget === 1
  const myPlayers  = purchases.filter(p => p.captain_id === myCaptainId)
  const isMyTeamFull = myPlayers.length >= progress.playersPerTeam

  const TABS: { id: Tab; label: string; Icon: typeof Sword }[] = [
    { id: 'bid',   label: 'Bid',   Icon: Sword },
    { id: 'teams', label: 'Teams', Icon: Users },
  ]

  return (
    <div className="bg-zinc-950 flex flex-col" style={{ height: '100dvh' }}>
      {/* Header */}
      <div className="flex-shrink-0 border-b border-zinc-800 px-4 py-2.5 flex items-center justify-between">
        <div className="flex flex-col min-w-0">
          <span className="text-xs font-bold text-zinc-100 truncate">{auctionName}</span>
          {slug && (
            <Link to={`/t/${slug}`} className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors">
              ← {slug}
            </Link>
          )}
        </div>
        <StatusBadge status={session.status} />
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {isFinished ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-4">
            <p className="text-xl font-black text-zinc-100">Auction complete</p>
            <p className="text-sm text-zinc-500">{progress.sold} drafted · {progress.cycled} skipped</p>
          </div>
        ) : tab === 'bid' ? (
          <div className="h-full flex flex-col gap-3 p-3">
            <div className="flex-shrink-0 space-y-3">
              <CurrentPlayerCard
                detail={detail}
                isLive={isLive}
                isPaused={isPaused}
                onStart={canControl ? handleStart : undefined}
                starting={starting}
                currentBid={currentBid}
              />
              <ProgressCard
                progress={progress}
                captainCount={captains.length}
                onOpenPool={isLive ? () => setShowPool(true) : undefined}
              />
              <BidChat
                sessionId={id}
                bidHistory={bidHistory}
                currentBid={currentBid}
                minIncrement={minIncrement}
                isLive={isLive}
                canBid={isCaptain}
                captainId={myCaptainId}
                teamFull={isMyTeamFull}
                onLoad={load}
              />
            </div>
            <FreeChat
              sessionId={id}
              messages={chatMessages}
              onLoad={load}
              className="flex-1 min-h-0"
            />
          </div>
        ) : (
          <div className="h-full overflow-y-auto p-3">
            <TeamGrid
              captains={captains}
              purchases={purchases}
              myCaptainId={myCaptainId}
              halfBudget={halfBudget}
              playersPerTeam={progress.playersPerTeam}
              cols={1}
            />
          </div>
        )}
      </div>

      {/* Bottom tab bar */}
      {!isFinished && (
        <div className="flex-shrink-0 border-t border-zinc-800 bg-zinc-900 flex">
          {TABS.map(({ id: tabId, label, Icon }) => (
            <button key={tabId} onClick={() => setTab(tabId)}
              className={cn(
                'flex-1 flex flex-col items-center gap-1 py-3 text-[10px] font-semibold uppercase tracking-widest transition-colors',
                tab === tabId ? 'text-amber-400' : 'text-zinc-600 hover:text-zinc-400'
              )}>
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      )}

      {showPool && (
        <PlayerPoolModal
          sessionId={id}
          canPromote={canControl}
          onSetActive={load}
          onClose={() => setShowPool(false)}
        />
      )}
    </div>
  )
}
