import { useEffect, useRef, useState } from 'react'
import { Loader2, Check, SkipForward, Edit2, AlertCircle, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { sessionsApi, type SessionBid } from '@/api/sessions'
import type { Captain } from '@/api/auctions'
import { getDisplayRemaining } from './BudgetHelpers'

export default function AuctioneerControls({
  sessionId, captains, minIncrement, bidCooldown, currentBid, activePlayer, halfBudget, onRefresh, onToggleHalfBudget,
}: {
  sessionId:          number
  captains:           Array<Captain & { spent: number; remaining: number }>
  minIncrement:       number
  bidCooldown:        number
  currentBid:         SessionBid | null
  activePlayer:       { player_name: string } | null
  halfBudget:         boolean
  onRefresh:          () => void
  onToggleHalfBudget: () => void
}) {
  const [showOverride,   setShowOverride]   = useState(false)
  const [captainId,      setCaptainId]      = useState<string>('')
  const [price,          setPrice]          = useState(String(minIncrement))
  const [busy,           setBusy]           = useState(false)
  const [skipping,       setSkipping]       = useState(false)
  const [toggling,       setToggling]       = useState(false)
  const [error,          setError]          = useState('')
  const [modalError,     setModalError]     = useState('')
  const [cooldownLeft,   setCooldownLeft]   = useState(0)
  const mouseDownOnBackdrop = useRef(false)
  const cooldownInterval    = useRef<ReturnType<typeof setInterval> | null>(null)
  const cooldownEndsAt      = useRef(0)

  // Start cooldown timer whenever a new bid arrives
  useEffect(() => {
    if (!currentBid || bidCooldown <= 0) return
    cooldownEndsAt.current = Date.now() + bidCooldown * 1000
    setCooldownLeft(bidCooldown)
    if (cooldownInterval.current) clearInterval(cooldownInterval.current)
    cooldownInterval.current = setInterval(() => {
      const remaining = Math.ceil((cooldownEndsAt.current - Date.now()) / 1000)
      if (remaining <= 0) {
        setCooldownLeft(0)
        clearInterval(cooldownInterval.current!)
        cooldownInterval.current = null
      } else {
        setCooldownLeft(remaining)
      }
    }, 200)
    return () => {
      if (cooldownInterval.current) clearInterval(cooldownInterval.current)
    }
  }, [currentBid?.id])

  useEffect(() => {
    setShowOverride(false); setCaptainId(''); setPrice(String(minIncrement)); setError('')
  }, [activePlayer?.player_name, minIncrement])

  async function handleConfirm() {
    setBusy(true); setError('')
    try {
      if (!currentBid) { setError('No bid to confirm'); setBusy(false); return }
      await sessionsApi.advance(sessionId, { action: 'sold' })
      onRefresh()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed') }
    finally { setBusy(false) }
  }

  async function handleSkip() {
    setSkipping(true); setError('')
    try { await sessionsApi.advance(sessionId, { action: 'skipped' }); onRefresh() }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed') }
    finally { setSkipping(false) }
  }

  async function handleSetBid() {
    setBusy(true); setModalError('')
    try {
      if (!captainId) { setModalError('Select a captain'); setBusy(false); return }
      await sessionsApi.bid(sessionId, { amount: price === '' ? minIncrement : Number(price), captain_id: Number(captainId) })
      onRefresh(); setShowOverride(false)
    } catch (e: unknown) { setModalError(e instanceof Error ? e.message : 'Failed') }
    finally { setBusy(false) }
  }

  async function handleToggleHalfBudget() {
    setToggling(true)
    try { await sessionsApi.toggleHalfBudget(sessionId); onToggleHalfBudget() }
    catch { /* ignore */ } finally { setToggling(false) }
  }

  function openOverride() {
    setCaptainId(''); setPrice(String(minIncrement)); setModalError(''); setShowOverride(true)
  }

  return (
    <>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Controls</span>
          <button onClick={handleToggleHalfBudget} disabled={toggling}
            className={cn(
              'text-[10px] font-mono px-2.5 py-1 rounded-lg border transition-colors',
              halfBudget
                ? 'text-amber-400 bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/20'
                : 'text-zinc-500 bg-zinc-800 border-zinc-700 hover:text-zinc-300'
            )}
          >
            {halfBudget ? 'Half Budget' : 'Full Budget'}
          </button>
        </div>

        {error && (
          <p className="flex items-center gap-1.5 text-xs text-red-400">
            <AlertCircle className="w-3 h-3 flex-shrink-0" />{error}
          </p>
        )}

        <div className="flex gap-1.5">
          <button onClick={handleConfirm}
            disabled={busy || !activePlayer || !currentBid || cooldownLeft > 0}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-colors disabled:opacity-40">
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
            {cooldownLeft > 0 ? `${cooldownLeft}s` : 'Confirm'}
          </button>
          <button onClick={handleSkip} disabled={skipping || busy || !activePlayer}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-400 text-xs transition-colors disabled:opacity-40">
            {skipping ? <Loader2 className="w-3 h-3 animate-spin" /> : <SkipForward className="w-3 h-3" />}
            Skip
          </button>
          <button onClick={openOverride} disabled={!activePlayer}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-400 text-xs transition-colors disabled:opacity-40">
            <Edit2 className="w-3 h-3" />
            Override
          </button>
        </div>
      </div>

      {/* Override modal */}
      {showOverride && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onMouseDown={e => { mouseDownOnBackdrop.current = e.target === e.currentTarget }}
          onClick={e => { if (mouseDownOnBackdrop.current && e.target === e.currentTarget) setShowOverride(false) }}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-72 shadow-2xl">
            {/* Header */}
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
              <span className="text-sm font-semibold text-zinc-200">Override Bid</span>
              <button onClick={() => setShowOverride(false)}
                className="p-1 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Body */}
            <div className="p-4 space-y-3">
              {modalError && (
                <p className="flex items-center gap-1.5 text-xs text-red-400">
                  <AlertCircle className="w-3 h-3 flex-shrink-0" />{modalError}
                </p>
              )}
              <select value={captainId} onChange={e => setCaptainId(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-xs text-zinc-100 focus:outline-none focus:border-amber-500/50">
                <option value="">Select captain…</option>
                {captains.map(c => (
                  <option key={c.id} value={c.id}>{c.display_name} — {getDisplayRemaining(c, halfBudget).toFixed(1)} left</option>
                ))}
              </select>
              <input value={price} onChange={e => setPrice(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSetBid() }}
                type="number" step={minIncrement} min={0} placeholder="Price"
                className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-xs font-mono text-zinc-100 focus:outline-none focus:border-amber-500/50 [appearance:textfield]"
              />
            </div>
            {/* Footer */}
            <div className="px-4 pb-4 flex gap-2">
              <button onClick={() => setShowOverride(false)}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-400 text-xs transition-colors">
                <X className="w-3 h-3" />
                Cancel
              </button>
              <button onClick={handleSetBid} disabled={busy}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-colors disabled:opacity-40">
                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                Set Bid
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
