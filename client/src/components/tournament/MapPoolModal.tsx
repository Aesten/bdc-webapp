import { useRef, useState } from 'react'
import { Check, X } from 'lucide-react'
import { cn, imgSrc } from '@/lib/utils'
import { tournamentsApi, type Tournament } from '@/api/tournaments'
import { type GameMap } from '@/api/maps'
import { useToast } from '@/context/ToastContext'

export default function MapPoolModal({ maps, slug, project, onProjectUpdate, onClose }: {
  maps:            GameMap[]
  slug:            string
  project:         Tournament
  onProjectUpdate: (p: Tournament) => void
  onClose:         () => void
}) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const mouseDownOnBackdrop = useRef(false)

  const currentPool: number[] = (() => {
    try { return JSON.parse(project.map_pool ?? '[]') } catch { return [] }
  })()

  const [selected, setSelected] = useState<Set<number>>(new Set(currentPool))

  const activeMaps = maps.filter(m => m.is_active)

  function toggle(id: number) {
    setSelected(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  async function save() {
    setSaving(true)
    try {
      const updated = await tournamentsApi.update(slug, { map_pool: [...selected] })
      onProjectUpdate(updated)
      toast('Tournament map pool saved')
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onMouseDown={e => { mouseDownOnBackdrop.current = e.target === e.currentTarget }}
      onClick={e => { if (mouseDownOnBackdrop.current && !saving && e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 w-full max-w-lg mx-4 space-y-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between flex-shrink-0">
          <div>
            <p className="text-sm font-semibold text-zinc-100">Tournament map pool</p>
            <p className="text-xs text-zinc-500 mt-0.5">Select which maps can be rolled for group stage rounds.</p>
          </div>
          {!saving && (
            <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300 transition-colors ml-4 flex-shrink-0">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Map grid */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {activeMaps.length === 0 ? (
            <p className="text-sm text-zinc-700 italic">No active maps in the global pool.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {activeMaps.map(m => {
                const on = selected.has(m.id)
                return (
                  <button key={m.id} onClick={() => toggle(m.id)}
                    className={cn(
                      'relative rounded-xl overflow-hidden border-2 transition-all duration-150 aspect-video text-left',
                      on
                        ? 'border-amber-500'
                        : 'border-zinc-700 hover:border-zinc-500',
                    )}>
                    {m.image_path
                      ? <img src={imgSrc(m.image_path)} alt={m.name} className="absolute inset-0 w-full h-full object-cover" />
                      : <div className="absolute inset-0 bg-gradient-to-br from-zinc-700 to-zinc-800" />
                    }
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                    <div className="absolute bottom-0 inset-x-0 px-2 pb-1.5">
                      <span className={cn('text-xs font-bold truncate block', on ? 'text-amber-400' : 'text-zinc-100')}>
                        {m.name}
                      </span>
                    </div>

                    {on && (
                      <div className="absolute top-1.5 right-1.5">
                        <div className="w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center">
                          <Check className="w-2.5 h-2.5 text-black" />
                        </div>
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Counter + save */}
        <div className="flex items-center justify-between flex-shrink-0">
          <p className={cn('text-xs font-mono', selected.size === 0 ? 'text-zinc-700' : 'text-zinc-500')}>
            {selected.size} map{selected.size !== 1 ? 's' : ''} selected
          </p>
          <button onClick={save} disabled={saving || selected.size === 0}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold transition-colors disabled:opacity-40">
            {saving ? 'Saving…' : 'Save pool'}
          </button>
        </div>
      </div>
    </div>
  )
}
