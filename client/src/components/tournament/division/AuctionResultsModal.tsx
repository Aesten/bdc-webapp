import { useEffect, useState } from 'react'
import { Loader2, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { auctionsApi, type AuctionResultTeam } from '@/api/auctions'
import { useToast } from '@/context/ToastContext'

export default function AuctionResultsModal({ auctionId, auctionName, canManage, playersPerTeam, onClose, onAuctionChange }: {
  auctionId:       number
  auctionName:     string
  canManage:       boolean
  playersPerTeam:  number
  onClose:         () => void
  onAuctionChange: () => void
}) {
  const { toast } = useToast()
  const [teams,          setTeams]          = useState<AuctionResultTeam[]>([])
  const [loading,        setLoading]        = useState(true)
  const [editMode,       setEditMode]       = useState(false)
  const [availPlayers,   setAvailPlayers]   = useState<{ id: number; name: string; classes: string }[]>([])
  const [addTarget,      setAddTarget]      = useState<{ captainId: number; playerId: number | null; price: string } | null>(null)
  const [busy,           setBusy]           = useState(false)
  const [confirm,        setConfirm]        = useState<'reopen' | 'wipe' | null>(null)

  function reload() {
    auctionsApi.getResults(auctionId).then(r => setTeams(r.teams))
  }

  useEffect(() => {
    auctionsApi.getResults(auctionId)
      .then(r => setTeams(r.teams))
      .finally(() => setLoading(false))
  }, [auctionId])

  useEffect(() => {
    if (editMode) auctionsApi.getAvailablePlayers(auctionId).then(setAvailPlayers)
  }, [editMode, auctionId])

  async function removePurchase(purchaseId: number) {
    await auctionsApi.removePurchase(auctionId, purchaseId)
    reload()
    if (editMode) auctionsApi.getAvailablePlayers(auctionId).then(setAvailPlayers)
  }

  async function addPurchase() {
    if (!addTarget || !addTarget.playerId) return
    setBusy(true)
    try {
      await auctionsApi.addPurchase(auctionId, {
        captain_id: addTarget.captainId,
        player_id:  addTarget.playerId,
        price:      Number(addTarget.price) || 0,
      })
      setAddTarget(null)
      reload()
      auctionsApi.getAvailablePlayers(auctionId).then(setAvailPlayers)
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Failed', 'error')
    } finally { setBusy(false) }
  }

  async function handleReopen() {
    setBusy(true)
    try {
      await auctionsApi.reopen(auctionId)
      toast('Auction reopened', 'success')
      onAuctionChange(); onClose()
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Failed', 'error')
    } finally { setBusy(false); setConfirm(null) }
  }

  async function handleWipe() {
    setBusy(true)
    try {
      await auctionsApi.wipe(auctionId)
      toast('Auction wiped', 'success')
      onAuctionChange(); onClose()
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Failed', 'error')
    } finally { setBusy(false); setConfirm(null) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800 flex-shrink-0">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Auction Results</p>
            <h2 className="text-base font-bold text-zinc-100">{auctionName}</h2>
          </div>
          <div className="flex items-center gap-2">
            {canManage && !confirm && (
              <button onClick={() => setEditMode(e => !e)}
                className={cn('text-xs font-mono px-2.5 py-1 rounded-lg border transition-colors',
                  editMode
                    ? 'border-amber-500/40 text-amber-400 bg-amber-500/10'
                    : 'border-zinc-700 text-zinc-500 hover:text-zinc-300')}>
                {editMode ? 'Done editing' : 'Edit rosters'}
              </button>
            )}
            <button onClick={onClose} className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-lg transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-5">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-5 h-5 text-zinc-600 animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {teams.map(({ captain, players }) => (
                <div key={captain.id} className="bg-zinc-950/60 border border-zinc-800 rounded-xl overflow-hidden">
                  {/* Team header */}
                  <div className="px-4 py-3 border-b border-zinc-800/60 flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-zinc-100 truncate">
                        {captain.team_name ?? `${captain.display_name}'s team`}
                      </p>
                      <p className="text-xs text-zinc-500 truncate">{captain.display_name}</p>
                    </div>
                    <span className={cn('text-xs font-mono flex-shrink-0',
                      players.length < playersPerTeam ? 'text-red-500' : 'text-zinc-600')}>
                      {players.length}/{playersPerTeam}
                    </span>
                  </div>

                  {/* Player list */}
                  <ul className="divide-y divide-zinc-800/40">
                    {players.map(p => (
                      <li key={p.id} className="flex items-center gap-2 px-4 py-1.5">
                        <span className="text-xs text-zinc-300 flex-1 truncate">{p.player_name}</span>
                        <span className="text-xs font-mono text-zinc-500 tabular-nums">{p.price.toFixed(1)}</span>
                        {editMode && (
                          <button onClick={() => removePurchase(p.id)}
                            className="text-zinc-700 hover:text-red-400 transition-colors flex-shrink-0">
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>

                  {/* Add player row (edit mode) */}
                  {editMode && (
                    addTarget?.captainId === captain.id ? (
                      <div className="px-3 py-2 border-t border-zinc-800/60 flex items-center gap-1.5">
                        <select
                          value={addTarget.playerId ?? ''}
                          onChange={e => setAddTarget(t => t && ({ ...t, playerId: Number(e.target.value) || null }))}
                          className="flex-1 text-xs bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-200 focus:outline-none focus:border-amber-500/50">
                          <option value="">Select player…</option>
                          {availPlayers.map(p => (
                            <option key={p.id} value={p.id}>{p.name}{p.classes ? ` (${p.classes})` : ''}</option>
                          ))}
                        </select>
                        <input
                          type="number" min="0" step="0.1" placeholder="0.0"
                          value={addTarget.price}
                          onChange={e => setAddTarget(t => t && ({ ...t, price: e.target.value }))}
                          className="w-14 text-xs text-center bg-zinc-800 border border-zinc-700 rounded px-1 py-1 text-zinc-200 focus:outline-none focus:border-amber-500/50 [appearance:textfield]" />
                        <button onClick={addPurchase} disabled={busy || !addTarget.playerId}
                          className="text-amber-400 hover:text-amber-300 disabled:opacity-40 transition-colors">
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setAddTarget(null)} className="text-zinc-600 hover:text-zinc-300 transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAddTarget({ captainId: captain.id, playerId: null, price: '0' })}
                        className="w-full px-4 py-1.5 text-left text-[10px] font-mono text-zinc-700 hover:text-zinc-400 border-t border-zinc-800/60 transition-colors">
                        + add player
                      </button>
                    )
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Admin footer */}
        {canManage && (
          <div className="flex-shrink-0 border-t border-zinc-800 px-5 py-3 flex items-center justify-between gap-3">
            {confirm === null ? (
              <>
                <div className="flex items-center gap-2">
                  <button onClick={() => setConfirm('reopen')}
                    className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:border-amber-500/40 hover:text-amber-400 transition-colors">
                    Reopen auction
                  </button>
                  <button onClick={() => setConfirm('wipe')}
                    className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:border-red-500/40 hover:text-red-400 transition-colors">
                    Wipe auction
                  </button>
                </div>
                <p className="text-[10px] font-mono text-zinc-700">admin only</p>
              </>
            ) : confirm === 'reopen' ? (
              <div className="flex items-center gap-3 w-full">
                <p className="text-xs text-zinc-400 flex-1">Reopen the auction and set the session to paused?</p>
                <button onClick={handleReopen} disabled={busy}
                  className="text-xs px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 hover:bg-amber-500/25 transition-colors disabled:opacity-40">
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Confirm reopen'}
                </button>
                <button onClick={() => setConfirm(null)} className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors">Cancel</button>
              </div>
            ) : (
              <div className="flex items-center gap-3 w-full">
                <p className="text-xs text-red-400 flex-1">This will delete all purchases and reset the auction. Irreversible.</p>
                <button onClick={handleWipe} disabled={busy}
                  className="text-xs px-3 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25 transition-colors disabled:opacity-40">
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Confirm wipe'}
                </button>
                <button onClick={() => setConfirm(null)} className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors">Cancel</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
