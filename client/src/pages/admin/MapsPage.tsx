import { useEffect, useState, useRef } from 'react'
import { mapsApi, type GameMap } from '@/api/maps'
import { cn } from '@/lib/utils'
import { Loader2, Plus, Trash2, Pencil, Check, X, Upload, ImageIcon, ToggleLeft, ToggleRight } from 'lucide-react'
import { useToast } from '@/context/ToastContext'

const inputCls = 'w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50 transition-colors'

// ─── Map row ──────────────────────────────────────────────────────────────────

function MapRow({ map, onUpdate, onDelete }: {
  map: GameMap
  onUpdate: (m: GameMap) => void
  onDelete: (id: number) => void
}) {
  const { toast } = useToast()
  const [editing,    setEditing]    = useState(false)
  const [editName,   setEditName]   = useState(map.name)
  const [editGameId, setEditGameId] = useState(map.game_id ?? '')
  const [editTags,   setEditTags]   = useState(map.tags ?? '')
  const [uploading,  setUploading]  = useState(false)
  const [deleting,   setDeleting]   = useState(false)
  const [saving,     setSaving]     = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function saveEdit() {
    if (!editName.trim()) return
    setSaving(true)
    try {
      const updated = await mapsApi.update(map.id, {
        name:    editName.trim(),
        game_id: editGameId.trim() || null,
        tags:    editTags.trim() || undefined,
      })
      onUpdate(updated)
      setEditing(false)
      toast('Map updated')
    } finally { setSaving(false) }
  }

  async function toggleActive() {
    const updated = await mapsApi.update(map.id, { is_active: map.is_active ? 0 : 1 })
    onUpdate(updated)
    toast(updated.is_active ? 'Map activated' : 'Map deactivated')
  }

  async function uploadImage(file: File) {
    setUploading(true)
    try {
      const r = await mapsApi.uploadImage(map.id, file)
      onUpdate({ ...map, image_path: r.image_path })
      toast('Image uploaded')
    } finally { setUploading(false) }
  }

  async function handleDelete() {
    setDeleting(true)
    try { await mapsApi.delete(map.id); onDelete(map.id); toast('Map deleted') }
    catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Cannot delete map', 'error')
      setDeleting(false)
    }
  }

  const tagList = map.tags ? map.tags.split(',').map(t => t.trim()).filter(Boolean) : []

  return (
    <div className={cn(
      'flex items-center gap-3 px-4 py-3 group transition-colors',
      !map.is_active && 'opacity-50'
    )}>
      {/* Thumbnail */}
      <div className="w-12 h-9 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0 overflow-hidden cursor-pointer"
        onClick={() => fileRef.current?.click()}>
        {uploading
          ? <Loader2 className="w-4 h-4 text-zinc-600 animate-spin" />
          : map.image_path
            ? <img src={`/${map.image_path}`} alt={map.name} className="w-full h-full object-cover" />
            : <ImageIcon className="w-4 h-4 text-zinc-700" />
        }
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f) }} />
      </div>

      {/* Name + tags */}
      {editing ? (
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <input value={editName} onChange={e => setEditName(e.target.value)} autoFocus
            onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(false) }}
            placeholder="Map name"
            className="flex-1 px-2 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-100 focus:outline-none focus:border-amber-500/40 transition-colors" />
          <input value={editGameId} onChange={e => setEditGameId(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(false) }}
            placeholder="game id (for !setmap)"
            className="w-36 px-2 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-400 font-mono focus:outline-none focus:border-amber-500/40 transition-colors" />
          <input value={editTags} onChange={e => setEditTags(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(false) }}
            placeholder="tags, comma-separated"
            className="w-44 px-2 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-500 focus:outline-none focus:border-amber-500/40 transition-colors" />
          <button onClick={saveEdit} disabled={saving} className="p-1.5 text-green-400 hover:bg-green-400/10 rounded transition-colors">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          </button>
          <button onClick={() => setEditing(false)} className="p-1.5 text-zinc-500 hover:bg-zinc-800 rounded transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <p className="text-sm font-medium text-zinc-200 truncate">{map.name}</p>
            {map.game_id && (
              <span className="text-[10px] font-mono text-amber-500/70 truncate">{map.game_id}</span>
            )}
          </div>
          {tagList.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-0.5">
              {tagList.map(t => (
                <span key={t} className="text-[10px] font-mono text-zinc-600 bg-zinc-800 px-1.5 py-0.5 rounded">{t}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      {!editing && (
        <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={toggleActive} title={map.is_active ? 'Deactivate' : 'Activate'}
            className="p-1.5 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
            {map.is_active ? <ToggleRight className="w-4 h-4 text-green-400" /> : <ToggleLeft className="w-4 h-4" />}
          </button>
          <button onClick={() => { setEditName(map.name); setEditGameId(map.game_id ?? ''); setEditTags(map.tags ?? ''); setEditing(true) }}
            className="p-1.5 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => fileRef.current?.click()}
            className="p-1.5 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
            <Upload className="w-3.5 h-3.5" />
          </button>
          <button onClick={handleDelete} disabled={deleting}
            className="p-1.5 rounded text-zinc-600 hover:text-red-400 hover:bg-red-400/10 transition-colors">
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Maps page ────────────────────────────────────────────────────────────────

export default function MapsPage() {
  const { toast } = useToast()
  const [maps,       setMaps]       = useState<GameMap[]>([])
  const [loading,    setLoading]    = useState(true)
  const [newName,    setNewName]    = useState('')
  const [newGameId,  setNewGameId]  = useState('')
  const [newTags,    setNewTags]    = useState('')
  const [newImage,   setNewImage]   = useState<File | null>(null)
  const [newPreview, setNewPreview] = useState<string | null>(null)
  const [adding,     setAdding]     = useState(false)
  const [error,      setError]      = useState('')
  const newFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    mapsApi.list().then(setMaps).finally(() => setLoading(false))
  }, [])

  function handleNewImage(file: File) {
    setNewImage(file)
    const url = URL.createObjectURL(file)
    setNewPreview(url)
  }

  async function addMap() {
    if (!newName.trim()) return
    setAdding(true); setError('')
    try {
      let m = await mapsApi.create(newName.trim(), newTags.trim() || undefined, newGameId.trim() || undefined)
      if (newImage) {
        const r = await mapsApi.uploadImage(m.id, newImage)
        m = { ...m, image_path: r.image_path }
      }
      setMaps(prev => [...prev, m])
      setNewName(''); setNewGameId(''); setNewTags(''); setNewImage(null)
      if (newPreview) { URL.revokeObjectURL(newPreview); setNewPreview(null) }
      toast('Map added')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create map')
    } finally { setAdding(false) }
  }

  function onUpdate(updated: GameMap) {
    setMaps(prev => prev.map(m => m.id === updated.id ? updated : m))
  }

  function onDelete(id: number) {
    setMaps(prev => prev.filter(m => m.id !== id))
  }

  const activeMaps   = maps.filter(m =>  m.is_active)
  const inactiveMaps = maps.filter(m => !m.is_active)

  return (
    <div className="max-w-2xl mx-auto py-8 px-8 space-y-6">
      <div>
        <h2 className="text-xl font-black text-zinc-100 mb-0.5"
          style={{ fontFamily: '"Barlow Condensed", sans-serif' }}>
          Maps
        </h2>
        <p className="text-xs text-zinc-600">Global map pool. Active maps are available for matchup rolling and pick-ban.</p>
      </div>

      {/* Add new */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
        <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Add map</p>
        <div className="flex gap-2">
          {/* Image thumbnail picker */}
          <div
            className="w-12 h-10 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0 overflow-hidden cursor-pointer hover:border-zinc-600 transition-colors"
            onClick={() => newFileRef.current?.click()}
            title="Upload image">
            {newPreview
              ? <img src={newPreview} alt="preview" className="w-full h-full object-cover" />
              : <ImageIcon className="w-4 h-4 text-zinc-700" />
            }
            <input ref={newFileRef} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleNewImage(f) }} />
          </div>
          <input value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addMap()}
            placeholder="Map name…"
            className={cn(inputCls, 'flex-1')} />
          <input value={newGameId} onChange={e => setNewGameId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addMap()}
            placeholder="game id (for !setmap)"
            className="w-36 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-zinc-400 font-mono placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50 transition-colors" />
          <input value={newTags} onChange={e => setNewTags(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addMap()}
            placeholder="tags (e.g. siege, field)"
            className="w-44 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50 transition-colors" />
          <button onClick={addMap} disabled={adding || !newName.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 text-black text-sm font-semibold hover:bg-amber-400 transition-colors disabled:opacity-40 flex-shrink-0">
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          </button>
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 text-zinc-600 animate-spin" />
        </div>
      ) : (
        <>
          {/* Active maps */}
          {activeMaps.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-zinc-800">
                <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{activeMaps.length} active</p>
              </div>
              <div className="divide-y divide-zinc-800/60">
                {activeMaps.map(m => (
                  <MapRow key={m.id} map={m} onUpdate={onUpdate} onDelete={onDelete} />
                ))}
              </div>
            </div>
          )}

          {/* Inactive maps */}
          {inactiveMaps.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-zinc-800">
                <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{inactiveMaps.length} inactive</p>
              </div>
              <div className="divide-y divide-zinc-800/60">
                {inactiveMaps.map(m => (
                  <MapRow key={m.id} map={m} onUpdate={onUpdate} onDelete={onDelete} />
                ))}
              </div>
            </div>
          )}

          {maps.length === 0 && (
            <div className="text-center py-16 text-zinc-700">
              <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No maps yet. Add the first one above.</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
