import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { cn, imgSrc } from '@/lib/utils'

import Aserai   from '@/assets/factions/Aserai.webp'
import Battania from '@/assets/factions/Battania.webp'
import Empire   from '@/assets/factions/Empire.webp'
import Khuzait  from '@/assets/factions/Khuzait.webp'
import Sturgia  from '@/assets/factions/Sturgia.webp'
import Vlandia  from '@/assets/factions/Vlandia.webp'

const FACTION_ICONS: Record<string, string> = { Aserai, Battania, Empire, Khuzait, Sturgia, Vlandia }

function FactionIcon({ name }: { name: string | null | undefined }) {
  const src = name ? FACTION_ICONS[name] : undefined
  if (!src) return (
    <div className="w-10 h-10 rounded-full bg-white/10 border-2 border-white/10 flex items-center justify-center flex-shrink-0">
      <span className="text-xs text-white/30">?</span>
    </div>
  )
  return <img src={src} alt={name ?? ''} className="w-10 h-10 rounded-full object-cover border-2 border-white/20 flex-shrink-0 drop-shadow-lg" />
}

export default function FinalsMatchupCard({ mapImage, mapName, mapGameId, factionAName, factionBName }: {
  mapImage:    string | null | undefined
  mapName:     string | null | undefined
  mapGameId:   string | null | undefined
  factionAName: string | null | undefined
  factionBName: string | null | undefined
}) {
  const [copied, setCopied] = useState(false)
  const ready = !!(mapName && factionAName && factionBName)
  const command = ready
    ? `!setmap ${mapGameId ?? mapName} ${factionAName!.toLowerCase()} ${factionBName!.toLowerCase()}`
    : '!setmap <map> <fac1> <fac2>'

  function handleCopy() {
    if (!ready) return
    navigator.clipboard.writeText(command)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="relative overflow-hidden" style={{ aspectRatio: '1920/855' }}>
        {mapImage
          ? <img src={imgSrc(mapImage)} className="absolute inset-0 w-full h-full object-cover" alt="" />
          : <div className="absolute inset-0 bg-zinc-800/60" />
        }
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/10 to-black/60" />

        {/* Label — top left */}
        <div className="absolute top-1.5 left-2.5">
          <span className="text-[9px] font-mono uppercase tracking-widest text-white/60">Finals Matchup</span>
        </div>

        {/* Map name — top right */}
        {mapName && (
          <div className="absolute top-1.5 right-2.5">
            <span className="text-[10px] font-black text-amber-400"
              style={{ fontFamily: '"Barlow Condensed", sans-serif' }}>
              {mapName}
            </span>
          </div>
        )}

        {/* Faction icons VS row — centered */}
        <div className="absolute inset-0 flex items-center justify-center gap-3">
          <FactionIcon name={factionAName} />
          <span className="text-lg font-black text-white/70 tracking-widest"
            style={{ fontFamily: '"Barlow Condensed", sans-serif' }}>
            VS
          </span>
          <FactionIcon name={factionBName} />
        </div>

        {/* Command bar — bottom overlay */}
        <div className="absolute bottom-0 inset-x-0 flex items-center gap-1.5 px-2.5 py-1 bg-black/50">
          <p className={cn('text-[10px] font-mono truncate flex-1 select-all', ready ? 'text-zinc-300' : 'text-zinc-600')}>
            {command}
          </p>
          {ready && (
            <button onClick={handleCopy} title="Copy"
              className="flex-shrink-0 text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer">
              {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
