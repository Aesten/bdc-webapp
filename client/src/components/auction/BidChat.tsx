import { useEffect, useRef, useState } from 'react'
import { Loader2, TrendingUp, AlertCircle, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { sessionsApi, type SessionBid } from '@/api/sessions'

export default function BidChat({
  sessionId, bidHistory, currentBid, minIncrement, isLive, canBid, canRevoke, captainId, teamFull, onLoad, className,
}: {
  sessionId:    number
  bidHistory:   SessionBid[]
  currentBid:   SessionBid | null
  minIncrement: number
  isLive:       boolean
  canBid:       boolean
  canRevoke?:   boolean
  captainId?:   number
  teamFull?:    boolean
  onLoad?:      () => void
  className?:   string
}) {
  const [amount,     setAmount]     = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [cooldown,   setCooldown]   = useState(false)
  const [error,      setError]      = useState('')
  const bottomRef    = useRef<HTMLDivElement>(null)
  const inFlightRef  = useRef(false)   // synchronous guard — prevents double-fire before re-render
  const cooldownRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Tracks the most recently submitted (or confirmed) bid amount so quick buttons
  // always increment from the correct floor even if React state is still stale.
  const lastBidRef   = useRef(currentBid?.amount ?? 0)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [bidHistory.length])
  useEffect(() => { setError('') }, [bidHistory.length])
  // Keep lastBidRef in sync whenever the confirmed top bid changes
  useEffect(() => { lastBidRef.current = currentBid?.amount ?? 0 }, [currentBid])

  const nextMin = currentBid ? currentBid.amount + minIncrement : minIncrement

  async function submitBid(val: number) {
    if (inFlightRef.current || cooldown) return
    inFlightRef.current = true
    lastBidRef.current = val   // optimistic: next click increments from this
    setCooldown(true)
    if (cooldownRef.current) clearTimeout(cooldownRef.current)
    cooldownRef.current = setTimeout(() => setCooldown(false), 1000)
    setSubmitting(true); setError('')
    try { await sessionsApi.bid(sessionId, { amount: val }); setAmount(''); onLoad?.() }
    catch (e: unknown) {
      lastBidRef.current = currentBid?.amount ?? 0  // revert on failure
      setError(e instanceof Error ? e.message : 'Failed')
    }
    finally { inFlightRef.current = false; setSubmitting(false) }
  }

  async function handleBid() {
    const val = parseFloat(amount)
    if (isNaN(val)) { setError('Enter a valid amount'); return }
    await submitBid(val)
  }

  return (
    <div className={cn('bg-zinc-900 border border-zinc-800 rounded-2xl flex flex-col overflow-hidden', className)}>
      <div className="px-4 py-2 border-b border-zinc-800 flex items-center justify-between flex-shrink-0">
        <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 flex items-center gap-1.5">
          <TrendingUp className="w-3 h-3" /> Bidding
        </span>
        {currentBid && (
          <span className="text-[10px] font-mono text-amber-400 tabular-nums">
            {currentBid.amount.toFixed(1)} — {currentBid.captain_name}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-zinc-800/25">
        {bidHistory.length === 0 ? (
          <div className="flex items-center justify-center py-6">
            <p className="text-[11px] text-zinc-700 italic">No bids yet</p>
          </div>
        ) : bidHistory.map((bid) => {
          const isMe  = bid.captain_id === captainId
          const isTop = currentBid ? bid.id === currentBid.id : false
          return (
            <div key={bid.id} className={cn('group flex items-center justify-between px-3 py-1.5 gap-2', isMe && 'bg-amber-500/5')}>
              <span className={cn('text-xs truncate', isMe ? 'text-amber-400' : 'text-zinc-400')}>
                {bid.captain_name}
              </span>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className={cn('text-xs font-mono font-bold tabular-nums', isTop ? 'text-amber-400' : 'text-zinc-600')}>
                  {bid.amount.toFixed(1)}
                </span>
                {canRevoke && (
                  <button
                    onClick={() => { sessionsApi.revokeBid(sessionId, bid.id).then(() => onLoad?.()).catch(() => {}) }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-zinc-600 hover:text-red-400 hover:bg-red-500/10"
                    title="Revoke bid"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {canBid && isLive && teamFull && (
        <div className="border-t border-emerald-800/40 px-4 py-2.5 flex-shrink-0">
          <p className="text-[10px] text-emerald-400 text-center font-semibold">Team complete — no more bids</p>
        </div>
      )}

      {canBid && isLive && !teamFull && (
        <div className="border-t border-zinc-800 p-2.5 flex-shrink-0 space-y-2">
          {error && (
            <p className="text-[11px] text-red-400 flex items-center gap-1">
              <AlertCircle className="w-3 h-3 flex-shrink-0" />{error}
            </p>
          )}
          <div className="flex gap-1.5">
            {[0.1, 0.2, 0.5, 1.0, 2.0].map(d => (
              <button key={d} onClick={() => submitBid(lastBidRef.current + d)}
                disabled={submitting || cooldown}
                className="flex-1 text-sm font-mono font-semibold px-0 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 active:bg-amber-500/35 border border-amber-500/30 hover:border-amber-500/50 text-amber-400 hover:text-amber-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                +{d.toFixed(1)}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={amount} onChange={e => setAmount(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleBid() }}
              type="number" step={minIncrement} min={nextMin}
              placeholder={`Min ${nextMin.toFixed(1)}`}
              className="flex-1 px-2.5 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-sm font-mono text-zinc-100 focus:outline-none focus:border-amber-500/50 [appearance:textfield] min-w-0"
            />
            <button onClick={handleBid} disabled={submitting || !amount}
              className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm transition-colors disabled:opacity-40">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Bid'}
            </button>
          </div>
        </div>
      )}

      {!canBid && !isLive && (
        <div className="border-t border-zinc-800 px-4 py-2 flex-shrink-0">
          <p className="text-[10px] text-zinc-700 text-center italic">Session not live</p>
        </div>
      )}
    </div>
  )
}
