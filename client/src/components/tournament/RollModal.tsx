import { useRef, useState } from 'react'
import { Check, X, Dices, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { bracketsApi, type Matchup } from '@/api/brackets'
import { type GameMap, type Faction } from '@/api/maps'
import { useToast } from '@/context/ToastContext'

import Aserai  from '@/assets/factions/Aserai.webp'
import Battania from '@/assets/factions/Battania.webp'
import Empire  from '@/assets/factions/Empire.webp'
import Khuzait from '@/assets/factions/Khuzait.webp'
import Sturgia from '@/assets/factions/Sturgia.webp'
import Vlandia from '@/assets/factions/Vlandia.webp'

const FACTION_ICONS: Record<string, string> = { Aserai, Battania, Empire, Khuzait, Sturgia, Vlandia }

function FactionCircle({ name }: { name: string | null | undefined }) {
  const src = name ? FACTION_ICONS[name] : undefined
  if (!src) return (
    <div className="w-8 h-8 rounded-full bg-white/10 border-2 border-white/15 flex items-center justify-center flex-shrink-0">
      <span className="text-[9px] text-white/30">?</span>
    </div>
  )
  return <img src={src} alt={name ?? ''} className="w-8 h-8 rounded-full object-cover border-2 border-white/20 flex-shrink-0" />
}

export default function RollModal({ round, slug, maps, usedMapIds, hardExcluded, factions, onRolled, onClose }: {
  round:        number
  slug:         string
  maps:         GameMap[]
  usedMapIds:   number[]
  hardExcluded: number[]
  factions:     Faction[]
  onRolled:     (m: Matchup) => void
  onClose:      () => void
}) {
  const { toast } = useToast()
  const [excluded,  setExcluded]  = useState<Set<number>>(new Set())
  const [rolling,   setRolling]   = useState(false)
  const [result,    setResult]    = useState<Matchup | null>(null)
  const mouseDownOnBackdrop = useRef(false)

  const available = maps.filter(m => !excluded.has(m.id))

  function toggle(id: number) {
    setExcluded(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  async function roll() {
    if (available.length === 0 || rolling) return
    setRolling(true)
    try {
      const m = await bracketsApi.rollMatchup(slug, round, [...hardExcluded, ...excluded])
      setResult(m)
      onRolled(m)
      toast(`Round ${round} rolled`)
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Failed to roll', 'error')
    } finally { setRolling(false) }
  }

  const fa = result ? factions.find(f => f.id === result.faction_a_id) : null
  const fb = result ? factions.find(f => f.id === result.faction_b_id) : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onMouseDown={e => { mouseDownOnBackdrop.current = e.target === e.currentTarget }}
      onClick={e => { if (mouseDownOnBackdrop.current && !rolling && e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 w-full max-w-md mx-4 space-y-4 max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono uppercase tracking-widest text-zinc-600">Randomize</span>
            <span className="text-xl font-black text-zinc-100">Round {round}</span>
          </div>
          {!rolling && (
            <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300 transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Result */}
        {result && (
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-zinc-950 border border-amber-500/25">
            <FactionCircle name={fa?.name} />
            <div className="flex-1 min-w-0 text-center">
              <p className="text-sm font-black text-amber-400">{result.map_name}</p>
              <p className="text-[10px] font-mono text-zinc-600">
                {fa?.name ?? '?'} vs {fb?.name ?? '?'}
              </p>
            </div>
            <FactionCircle name={fb?.name} />
          </div>
        )}

        {/* Map pool selector */}
        {!result && (
          <div className="space-y-2 flex-1 overflow-y-auto min-h-0">
            <div className="flex items-center justify-between">
              <p className="text-xs font-mono text-zinc-500 uppercase tracking-widest">Map pool</p>
              <span className="text-xs font-mono text-zinc-600">{available.length}/{maps.length}</span>
            </div>
            {maps.length === 0 ? (
              <p className="text-sm text-zinc-600 italic text-center py-4">
                No maps in tournament pool.
              </p>
            ) : (
              <div className="space-y-1">
                {maps.map(m => {
                  const excl = excluded.has(m.id)
                  const used = usedMapIds.includes(m.id)
                  return (
                    <button key={m.id} onClick={() => toggle(m.id)}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-left border transition-all',
                        excl
                          ? 'bg-zinc-950 border-zinc-800 text-zinc-600 opacity-50'
                          : 'bg-zinc-800 border-zinc-700 text-zinc-200 hover:border-zinc-600',
                      )}>
                      <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
                        {excl
                          ? <X className="w-3 h-3 text-zinc-600" />
                          : <Check className="w-3 h-3 text-amber-500" />
                        }
                      </div>
                      <span className="flex-1 truncate font-medium">{m.name}</span>
                      {used && !excl && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-400 flex-shrink-0">
                          used
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        {!result ? (
          <button onClick={roll} disabled={available.length === 0 || rolling}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500 text-black text-sm font-semibold hover:bg-amber-400 transition-colors disabled:opacity-40 flex-shrink-0">
            {rolling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Dices className="w-4 h-4" />}
            Roll round {round}
          </button>
        ) : (
          <button onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium transition-colors flex-shrink-0">
            Done
          </button>
        )}
      </div>
    </div>
  )
}
