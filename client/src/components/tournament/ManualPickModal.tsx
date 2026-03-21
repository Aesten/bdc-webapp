import { useRef, useState } from 'react'
import { X, Check, Loader2, ChevronDown } from 'lucide-react'
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

// ─── Faction circle selector ──────────────────────────────────────────────────

function FactionSelector({ side, factions, selected, onSelect }: {
  side:     'a' | 'b'
  factions: Faction[]
  selected: Faction | null
  onSelect: (f: Faction) => void
}) {
  const color = side === 'a' ? 'text-blue-400' : 'text-violet-400'
  const label = side === 'a' ? 'Side A' : 'Side B'

  return (
    <div className="flex flex-col items-center gap-3">
      <p className={cn('text-[10px] font-mono uppercase tracking-widest', color)}>{label}</p>
      <div className="flex flex-col gap-2">
        {factions.map(f => {
          const img  = FACTION_ICONS[f.name]
          const sel  = selected?.id === f.id
          return (
            <button
              key={f.id}
              onClick={() => onSelect(f)}
              className={cn(
                'flex flex-col items-center gap-1 transition-all group',
              )}
            >
              <div className={cn(
                'w-12 h-12 rounded-full overflow-hidden border-2 transition-all',
                sel
                  ? side === 'a'
                    ? 'border-blue-400 shadow-lg shadow-blue-500/30 scale-110'
                    : 'border-violet-400 shadow-lg shadow-violet-500/30 scale-110'
                  : 'border-zinc-700 group-hover:border-zinc-500',
              )}>
                {img
                  ? <img src={img} alt={f.name} className="w-full h-full object-cover" />
                  : <div className="w-full h-full bg-zinc-700 flex items-center justify-center">
                      <span className="text-[9px] text-zinc-500">{f.name[0]}</span>
                    </div>
                }
              </div>
              <span className={cn(
                'text-[9px] font-mono leading-none',
                sel
                  ? side === 'a' ? 'text-blue-300' : 'text-violet-300'
                  : 'text-zinc-600 group-hover:text-zinc-400',
              )}>
                {f.name}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export default function ManualPickModal({ round, slug, maps, factions, onSaved, onClose }: {
  round:    number
  slug:     string
  maps:     GameMap[]
  factions: Faction[]
  onSaved:  (m: Matchup) => void
  onClose:  () => void
}) {
  const { toast } = useToast()
  const [selectedMap, setSelectedMap] = useState<GameMap | null>(null)
  const [factionA,    setFactionA]    = useState<Faction | null>(null)
  const [factionB,    setFactionB]    = useState<Faction | null>(null)
  const [saving,      setSaving]      = useState(false)
  const mouseDownOnBackdrop = useRef(false)

  const canSave = !!selectedMap && !!factionA && !!factionB

  async function save() {
    if (!canSave) return
    setSaving(true)
    try {
      const m = await bracketsApi.setMatchup(slug, round, selectedMap.id, factionA.id, factionB.id)
      onSaved(m)
      toast(`Round ${round} set`)
      onClose()
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Failed to save', 'error')
    } finally { setSaving(false) }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onMouseDown={e => { mouseDownOnBackdrop.current = e.target === e.currentTarget }}
      onClick={e => { if (mouseDownOnBackdrop.current && !saving && e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 w-full max-w-lg mx-4 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono uppercase tracking-widest text-zinc-600">Manual pick</span>
            <span className="text-xl font-black text-zinc-100">Round {round}</span>
          </div>
          {!saving && (
            <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300 transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* 3-column layout */}
        <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
          {/* Side A */}
          <FactionSelector side="a" factions={factions} selected={factionA} onSelect={setFactionA} />

          {/* Map dropdown — center */}
          <div className="flex flex-col items-center gap-2 min-w-[130px]">
            <div className="relative w-full">
              <select
                value={selectedMap?.id ?? ''}
                onChange={e => {
                  const m = maps.find(m => m.id === Number(e.target.value))
                  setSelectedMap(m ?? null)
                }}
                className={cn(
                  'w-full appearance-none text-center px-3 py-2 pr-7 rounded-xl border text-sm font-medium',
                  'bg-zinc-800 border-zinc-700 text-zinc-200 focus:outline-none focus:border-amber-500/50',
                  'cursor-pointer transition-colors hover:border-zinc-600',
                )}
              >
                <option value="" disabled>Pick a map…</option>
                {maps.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
            </div>

            {selectedMap && (
              <span className="text-[10px] font-mono text-amber-400 text-center">{selectedMap.name}</span>
            )}

            {/* VS divider */}
            <div className="mt-2 flex items-center gap-2 w-full">
              <div className="flex-1 h-px bg-zinc-800" />
              <span className="text-[10px] font-black text-zinc-600 tracking-widest" style={{ fontFamily: '"Barlow Condensed", sans-serif' }}>VS</span>
              <div className="flex-1 h-px bg-zinc-800" />
            </div>
          </div>

          {/* Side B */}
          <FactionSelector side="b" factions={factions} selected={factionB} onSelect={setFactionB} />
        </div>

        {/* Save */}
        <button onClick={save} disabled={!canSave || saving}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500 text-black text-sm font-semibold hover:bg-amber-400 transition-colors disabled:opacity-40">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Save matchup
        </button>
      </div>
    </div>
  )
}
