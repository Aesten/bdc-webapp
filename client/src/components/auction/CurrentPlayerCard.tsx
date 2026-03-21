import { Loader2, Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import { type SessionDetail, type SessionBid } from '@/api/sessions'
import { CLASS_COLOR, CLASS_ICON, parseClasses } from '@/components/tournament/shared'

export default function CurrentPlayerCard({
  detail, isLive, isPaused, onStart, starting, currentBid, className,
}: {
  detail:      SessionDetail
  isLive:      boolean
  isPaused:    boolean
  onStart?:    () => void
  starting?:   boolean
  currentBid:  SessionBid | null
  className?:  string
}) {
  const { activePlayer, session } = detail
  const label = isPaused ? 'Session paused' : isLive ? 'Now up for auction' : 'Waiting to start'
  const classes = parseClasses(activePlayer?.player_classes ?? '')

  return (
    <div className={cn('bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden flex flex-col', className)}>
      <div className="px-4 py-2 border-b border-zinc-800 flex-shrink-0">
        <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{label}</span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-4 min-h-0">
        {activePlayer ? (
          <>
            <p className="text-3xl font-black text-zinc-100 text-center leading-tight"
              style={{ fontFamily: '"Barlow Condensed", sans-serif' }}>
              {activePlayer.player_name}
            </p>
            {classes.length > 0 && (
              <div className="flex items-center gap-2 mt-2">
                {classes.map(cls => {
                  const Icon = CLASS_ICON[cls]
                  return (
                    <span key={cls} className={cn(
                      'inline-flex items-center justify-center w-9 h-9 rounded-lg border',
                      CLASS_COLOR[cls]
                    )}>
                      <Icon className="w-5 h-5" />
                    </span>
                  )
                })}
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-zinc-600 italic">No player active</p>
        )}
      </div>

      {/* Leading bid */}
      {activePlayer && (
        <div className={cn(
          'mx-3 mb-3 px-3 rounded-xl flex-shrink-0 h-9 flex items-center justify-center',
          currentBid
            ? 'bg-amber-500/10 border border-amber-500/25'
            : 'bg-zinc-800/40 border border-zinc-700/30'
        )}>
          {currentBid ? (
            <div className="flex items-center justify-center gap-3">
              <span className="text-sm text-zinc-400">{currentBid.captain_name}</span>
              <span className="text-lg font-black font-mono text-amber-400 tabular-nums">{currentBid.amount.toFixed(1)}</span>
            </div>
          ) : (
            <p className="text-[11px] text-zinc-600 italic text-center">No bids yet</p>
          )}
        </div>
      )}

      {isLive && !activePlayer && (
        <div className="px-3 pb-3 flex-shrink-0">
          {onStart ? (
            <button onClick={onStart} disabled={starting}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm transition-colors disabled:opacity-40">
              {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Start Auction
            </button>
          ) : (
            <p className="w-full flex items-center justify-center py-2 text-xs text-zinc-600 italic text-center">
              Waiting for auctioneer to start the auction…
            </p>
          )}
        </div>
      )}

      {session.status === 'pending' && (
        <p className="px-4 pb-3 text-xs text-center text-zinc-600 flex-shrink-0">Waiting for session to go live</p>
      )}
    </div>
  )
}
