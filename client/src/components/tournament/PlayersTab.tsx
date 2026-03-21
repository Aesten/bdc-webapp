import { useEffect, useState } from 'react'
import { playersApi, type Player } from '@/api/players'
import { cn } from '@/lib/utils'
import { Loader2, Plus, Check, X, Trash2, Pencil, Upload, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import {
  CLASSES, type ClassKey, CLASS_COLOR, CLASS_TEXT, CLASS_ICON,
  parseClasses, ClassToggle, type ViewRole,
} from './shared'

import { useToast } from '@/context/ToastContext'
import ImportModal from './ImportModal'

// ─── Players tab ──────────────────────────────────────────────────────────────

export default function PlayersTab({ slug, role }: { slug: string; role: ViewRole }) {
  const { toast } = useToast()
  const [players,     setPlayers]     = useState<Player[]>([])
  const [loading,     setLoading]     = useState(true)
  const [search,      setSearch]      = useState('')
  const [sortBy,      setSortBy]      = useState<'name' | 'inf' | 'arc' | 'cav'>('name')
  const [sortAsc,     setSortAsc]     = useState(true)
  const [filterClass, setFilterClass] = useState<ClassKey | null>(null)
  const [hideUnavail] = useState(false)
  const [editId,      setEditId]      = useState<number | null>(null)
  const [editName,    setEditName]    = useState('')
  const [editClasses, setEditClasses] = useState<Set<ClassKey>>(new Set())
  const [showImport,  setShowImport]  = useState(false)
  const [newName,     setNewName]     = useState('')
  const [newClasses,  setNewClasses]  = useState<Set<ClassKey>>(new Set())
  const [adding,      setAdding]      = useState(false)
  const canManage = role === 'admin' || role === 'host'

  useEffect(() => {
    playersApi.listForTournament(slug).then(setPlayers).finally(() => setLoading(false))
  }, [slug])

  // Duplicate name detection — factors in the active edit so warning appears while typing
  const nameCounts = new Map<string, number>()
  for (const p of players) {
    const k = (editId === p.id ? editName : p.name).toLowerCase().trim()
    if (k) nameCounts.set(k, (nameCounts.get(k) ?? 0) + 1)
  }
  const duplicateNames = new Set([...nameCounts.entries()].filter(([, c]) => c > 1).map(([k]) => k))

  function toggleSort(col: typeof sortBy) {
    if (sortBy === col) setSortAsc(a => !a)
    else { setSortBy(col); setSortAsc(true) }
  }

  const filtered = players
    .filter(p => {
      if (hideUnavail && !p.is_available) return false
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
      if (filterClass && !parseClasses(p.classes).includes(filterClass)) return false
      return true
    })
    .sort((a, b) => {
      let cmp = 0
      if (sortBy === 'name') cmp = a.name.localeCompare(b.name)
      else {
        const ha = parseClasses(a.classes).includes(sortBy) ? 1 : 0
        const hb = parseClasses(b.classes).includes(sortBy) ? 1 : 0
        cmp = hb - ha
      }
      return sortAsc ? cmp : -cmp
    })

  async function add() {
    if (!newName.trim()) return
    setAdding(true)
    try {
      const p = await playersApi.add(slug, { name: newName.trim(), classes: [...newClasses].join(',') })
      setPlayers(prev => [...prev, p])
      setNewName(''); setNewClasses(new Set())
      toast('Player added')
    } finally { setAdding(false) }
  }

  async function saveEdit(id: number) {
    const u = await playersApi.update(id, { name: editName.trim(), classes: [...editClasses].join(',') })
    setEditId(null)
    setPlayers(prev => prev.map(p => p.id === id ? u : p))
    toast('Player updated')
  }

  async function toggleAvailable(p: Player) {
    const u = await playersApi.update(p.id, { is_available: p.is_available ? 0 : 1 })
    setPlayers(prev => prev.map(x => x.id === p.id ? u : x))
    toast(u.is_available ? 'Marked available' : 'Marked unavailable')
  }

  async function remove(id: number) {
    await playersApi.delete(id)
    setPlayers(prev => prev.filter(p => p.id !== id))
    toast('Player removed')
  }

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 text-zinc-600 animate-spin" /></div>

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search players…"
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50 transition-colors" />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 text-base">⌕</span>
        </div>

        {/* Class filter chips */}
        <div className="flex gap-1">
          {CLASSES.map(c => {
            const Icon = CLASS_ICON[c]
            return (
              <button key={c} onClick={() => setFilterClass(filterClass === c ? null : c)}
                title={c}
                className={cn('w-9 h-9 flex items-center justify-center rounded-xl border transition-all',
                  filterClass === c ? CLASS_COLOR[c] : 'text-zinc-600 border-zinc-800 hover:border-zinc-600 hover:text-zinc-400')}>
                <Icon className="w-4 h-4" />
              </button>
            )
          })}
        </div>


        <span className="text-sm text-zinc-700 font-mono">{filtered.length}/{players.length}</span>

        {canManage && (
          <button onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium transition-colors">
            <Upload className="w-3.5 h-3.5" /> Import
          </button>
        )}
      </div>

      {/* Duplicate warning banner */}
      {duplicateNames.size > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-400/8 border border-red-400/20 text-sm text-red-400">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {duplicateNames.size} duplicate name{duplicateNames.size > 1 ? 's' : ''} detected — players should have unique names
        </div>
      )}

      {/* Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">

        {/* Column headers */}
        <div className="flex items-center gap-0 px-4 py-2.5 border-b border-zinc-800">
          {/* Name sort */}
          <button onClick={() => toggleSort('name')}
            className={cn('flex-1 text-left flex items-center gap-1 text-sm font-mono uppercase tracking-wider transition-colors',
              sortBy === 'name' ? 'text-amber-400' : 'text-zinc-600 hover:text-zinc-400')}>
            Name {sortBy === 'name' && <span className="text-[10px]">{sortAsc ? '▲' : '▼'}</span>}
          </button>
          {/* Classes header */}
          <div className="w-32 mr-4 text-center text-xs font-mono uppercase tracking-wider text-zinc-600">Classes</div>
          {/* Avail header */}
          <div className="w-8 mr-2" />
          {canManage && <div className="w-16" />}
        </div>

        {filtered.length === 0 ? (
          <div className="py-12 text-center text-base text-zinc-700">
            {players.length === 0 ? 'No players yet' : 'No players match the filter'}
          </div>
        ) : filtered.map(p => {
          const cls = parseClasses(p.classes)
          const isEditing = editId === p.id
          const isDupe = duplicateNames.has(p.name.toLowerCase())
          const unavailable = !p.is_available

          return (
            <div key={p.id}
              className={cn(
                'flex items-center gap-0 px-4 py-2.5 border-b border-zinc-800/60 last:border-0 group transition-colors hover:bg-zinc-800/20',
                unavailable && 'opacity-40'
              )}>
              {isEditing ? (
                <>
                  <div className="flex-1 flex items-center gap-2 min-w-0 mr-2">
                    <input value={editName} onChange={e => setEditName(e.target.value)} autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') saveEdit(p.id); if (e.key === 'Escape') setEditId(null) }}
                      className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-base text-zinc-100 focus:outline-none" />
                  </div>
                  <div className="flex gap-1 w-32 mr-4 justify-center">
                    {CLASSES.map(c => (
                      <span key={c} className="w-10 flex justify-center">
                        <ClassToggle cls={c} active={editClasses.has(c)}
                          onChange={v => setEditClasses(prev => { const n = new Set(prev); v ? n.add(c) : n.delete(c); return n })} />
                      </span>
                    ))}
                  </div>
                  <div className="w-8 mr-2" />
                  <div className="flex gap-1 w-16 justify-end">
                    <button onClick={() => saveEdit(p.id)} className="p-1.5 text-green-400 hover:bg-green-400/10 rounded transition-colors"><Check className="w-4 h-4" /></button>
                    <button onClick={() => setEditId(null)} className="p-1.5 text-zinc-500 hover:bg-zinc-800 rounded transition-colors"><X className="w-4 h-4" /></button>
                  </div>
                </>
              ) : (
                <>
                  {/* Name */}
                  <div className="flex-1 flex items-center gap-2 min-w-0 mr-2">
                    {isDupe && <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
                    <span className="text-base text-zinc-200 truncate">{p.name}</span>
                  </div>

                  {/* Class icons */}
                  <div className="flex gap-0 w-32 mr-4 justify-center">
                    {CLASSES.map(c => {
                      const Icon = CLASS_ICON[c]
                      const has = cls.includes(c)
                      return (
                        <span key={c} className="w-10 flex justify-center items-center">
                          <Icon className={cn('w-5 h-5 transition-opacity',
                            has ? CLASS_TEXT[c] : 'text-zinc-800'
                          )} />
                        </span>
                      )
                    })}
                  </div>

                  {/* Availability toggle */}
                  <div className="w-8 mr-2 flex justify-center items-center">
                    {canManage ? (
                      <button onClick={() => toggleAvailable(p)} title={unavailable ? 'Mark available' : 'Mark unavailable'}
                        className="transition-colors">
                        {unavailable
                          ? <XCircle className="w-4 h-4 text-red-400/60 hover:text-red-400" />
                          : <CheckCircle2 className="w-4 h-4 text-green-500/40 hover:text-green-400" />
                        }
                      </button>
                    ) : (
                      unavailable && <XCircle className="w-4 h-4 text-red-400/40" />
                    )}
                  </div>

                  {/* Actions */}
                  {canManage && (
                    <div className="flex gap-1 w-16 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                      <button onClick={() => { setEditId(p.id); setEditName(p.name); setEditClasses(new Set(cls)) }}
                        className="p-1.5 hover:bg-zinc-700 text-zinc-600 hover:text-zinc-300 rounded transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => remove(p.id)}
                        className="p-1.5 hover:bg-red-400/10 text-zinc-600 hover:text-red-400 rounded transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}

        {/* Add row */}
        {canManage && (
          <div className="flex items-center gap-0 px-4 py-2.5 border-t border-zinc-800 bg-zinc-900/50">
            <input value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && add()}
              placeholder="Add player…"
              className="flex-1 px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-base text-zinc-100 placeholder:text-zinc-600 focus:outline-none mr-2" />
            <div className="flex gap-1 w-32 mr-4 justify-center">
              {CLASSES.map(c => (
                <span key={c} className="w-10 flex justify-center">
                  <ClassToggle cls={c} active={newClasses.has(c)}
                    onChange={v => setNewClasses(prev => { const n = new Set(prev); v ? n.add(c) : n.delete(c); return n })} />
                </span>
              ))}
            </div>
            <div className="w-8 mr-2" />
            <button onClick={add} disabled={adding || !newName.trim()}
              className="flex items-center gap-1 px-4 py-2 rounded-lg bg-amber-500 text-black text-sm font-semibold hover:bg-amber-400 transition-colors disabled:opacity-40 w-16 justify-center">
              {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            </button>
          </div>
        )}
      </div>

      {showImport && (
        <ImportModal
          slug={slug}
          onImported={p => setPlayers(p)}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  )
}
