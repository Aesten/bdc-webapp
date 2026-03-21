import { useEffect, useRef, useState } from 'react'
import { Loader2, ArrowUp, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { sessionsApi, type SessionQueueEntry } from '@/api/sessions'
import { CLASS_COLOR, CLASS_ICON, parseClasses, type ClassKey } from '@/components/tournament/shared'

const CLASSES: ClassKey[] = ['inf', 'arc', 'cav']
const ROW_COLS = '1fr 1.5rem 1.5rem 1.5rem auto'

export default function PlayerPoolModal({ sessionId, canPromote, onSetActive, onClose }: {
  sessionId:   number
  canPromote:  boolean
  onSetActive: () => void
  onClose:     () => void
}) {
  const [players,   setPlayers]   = useState<(SessionQueueEntry & { player_classes: string })[]>([])
  const [loading,   setLoading]   = useState(true)
  const [promoting, setPromoting] = useState<number | null>(null)
  const mouseDownOnBackdrop = useRef(false)

  useEffect(() => {
    sessionsApi.getPendingPlayers(sessionId)
      .then(setPlayers)
      .finally(() => setLoading(false))
  }, [sessionId])

  async function handleSetActive(entryId: number) {
    setPromoting(entryId)
    try {
      await sessionsApi.setActive(sessionId, entryId)
      onSetActive()
      onClose()
    } catch { /* ignore */ }
    finally { setPromoting(null) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onMouseDown={e => { mouseDownOnBackdrop.current = e.target === e.currentTarget }}
      onClick={e => { if (mouseDownOnBackdrop.current && e.target === e.currentTarget) onClose() }}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md flex flex-col max-h-[70vh] shadow-2xl">
        {/* Header */}
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between flex-shrink-0">
          <span className="text-sm font-semibold text-zinc-200">Player Pool</span>
          <button onClick={onClose} className="p-1 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1 min-h-0 divide-y divide-zinc-800/40">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 text-zinc-600 animate-spin" />
            </div>
          ) : players.length === 0 ? (
            <p className="text-sm text-zinc-600 italic text-center py-10">No players remaining in pool</p>
          ) : players.map(p => {
            const active = parseClasses(p.player_classes)
            return (
              <div key={p.id} className="grid items-center px-4 py-2 gap-x-2 hover:bg-zinc-800/40 transition-colors"
                style={{ gridTemplateColumns: ROW_COLS }}>
                <span className="text-sm text-zinc-200 truncate">{p.player_name}</span>
                {CLASSES.map(cls => {
                  const Icon = CLASS_ICON[cls]
                  return (
                    <div key={cls} className="flex items-center justify-center">
                      {active.includes(cls) && (
                        <span className={cn('inline-flex items-center justify-center w-5 h-5 rounded-md border', CLASS_COLOR[cls])}>
                          <Icon className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                  )
                })}
                {canPromote ? (
                  <button
                    onClick={() => handleSetActive(p.id)}
                    disabled={promoting === p.id}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs hover:bg-amber-500/20 transition-colors disabled:opacity-40 whitespace-nowrap"
                  >
                    {promoting === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowUp className="w-3 h-3" />}
                    Send to Top
                  </button>
                ) : <span />}
              </div>
            )
          })}
        </div>
        <div className="px-4 py-2.5 border-t border-zinc-800 flex-shrink-0">
          <p className="text-[10px] text-zinc-600 italic">Queue order is hidden. This list is alphabetical.</p>
        </div>
      </div>
    </div>
  )
}
