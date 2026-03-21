import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTitle } from '@/hooks/useTitle'
import { useAuth } from '@/context/AuthContext'
import { tournamentsApi, type Tournament } from '@/api/tournaments'
import { authApi } from '@/api/auth'
import { cn } from '@/lib/utils'
import TournamentDetail from '@/components/tournament/TournamentDetail'
import MapsPage from './MapsPage'
import {
  LogOut, FolderOpen, Map,
  Loader2, Plus, Trash2, Star,
  AlertCircle, X, Pencil
} from 'lucide-react'
import logo from '@/assets/logos/bdc_logo_nobg.png'

// ─── Context menu ─────────────────────────────────────────────────────────────

interface CtxMenu {
  x: number; y: number
  items: { label: string; icon: React.ElementType; danger?: boolean; onClick: () => void }[]
}

function ContextMenu({ menu, onClose }: { menu: CtxMenu; onClose: () => void }) {
  useEffect(() => {
    const tid = setTimeout(() => {
      const close = (e: MouseEvent) => {
        const el = document.getElementById('ctx-menu-root')
        if (el && el.contains(e.target as Node)) return
        onClose()
      }
      window.addEventListener('mousedown', close)
      window.addEventListener('contextmenu', close)
      return () => {
        window.removeEventListener('mousedown', close)
        window.removeEventListener('contextmenu', close)
      }
    }, 0)
    return () => clearTimeout(tid)
  }, [onClose])

  const x = Math.min(menu.x, window.innerWidth  - 184)
  const y = Math.min(menu.y, window.innerHeight - menu.items.length * 34 - 8)

  return (
    <div
      id="ctx-menu-root"
      className="fixed z-50 min-w-[176px] bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl py-1 overflow-hidden"
      style={{ left: x, top: y }}
    >
      {menu.items.map((item, i) => (
        <button key={i} onClick={() => { item.onClick(); onClose() }}
          className={cn(
            'flex items-center gap-2.5 w-full px-3 py-2 text-xs font-medium transition-colors text-left',
            item.danger
              ? 'text-red-400 hover:bg-red-400/10'
              : 'text-zinc-300 hover:bg-zinc-800'
          )}>
          <item.icon className="w-3.5 h-3.5 flex-shrink-0" />
          {item.label}
        </button>
      ))}
    </div>
  )
}

// ─── Modal primitive ──────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: {
  title: string; onClose: () => void; children: React.ReactNode
}) {
  const mouseDownOnBackdrop = useRef(false)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onMouseDown={e => { mouseDownOnBackdrop.current = e.target === e.currentTarget }}
      onClick={e => { if (mouseDownOnBackdrop.current && e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <p className="text-sm font-semibold text-zinc-100">{title}</p>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 transition-colors p-0.5 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

const modalInputCls = 'w-full px-3 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-colors'

function TournamentModal({ initial, onSave, onClose }: {
  initial?: { name: string; description: string; slug: string }
  onSave: (t: Tournament) => void
  onClose: () => void
}) {
  const [name,        setName]    = useState(initial?.name ?? '')
  const [description, setDesc]    = useState(initial?.description ?? '')
  const [loading,     setLoading] = useState(false)
  const [error,       setError]   = useState('')
  const isEdit = !!initial

  async function submit() {
    if (!name.trim()) return
    setLoading(true); setError('')
    try {
      const t = isEdit
        ? await tournamentsApi.update(initial!.slug, { name: name.trim(), description: description.trim() || undefined })
        : await tournamentsApi.create({ name: name.trim(), description: description.trim() || undefined })
      onSave(t)
      onClose()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed') }
    finally { setLoading(false) }
  }

  return (
    <Modal title={isEdit ? 'Rename Tournament' : 'New Tournament'} onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); submit() }} className="space-y-4">
        <div className="space-y-1.5">
          <label className="block text-[10px] font-mono uppercase tracking-widest text-zinc-500">Tournament name</label>
          <input value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Spring Championship 2025" autoFocus className={modalInputCls} />
        </div>
        <div className="space-y-1.5">
          <label className="block text-[10px] font-mono uppercase tracking-widest text-zinc-500">Description (optional)</label>
          <input value={description} onChange={e => setDesc(e.target.value)}
            placeholder="Short description" className={modalInputCls} />
        </div>
        {error && (
          <div className="flex items-center gap-2 text-sm text-red-400 bg-red-400/8 border border-red-400/20 rounded-xl px-3 py-2.5">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={loading || !name.trim()}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500 text-black text-sm font-semibold hover:bg-amber-400 transition-colors disabled:opacity-40">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {isEdit ? 'Save' : 'Create'}
          </button>
          <button type="button" onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-zinc-800 text-zinc-400 text-sm hover:bg-zinc-700 transition-colors">
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Types ────────────────────────────────────────────────────────────────────

type AdminView = { type: 'tournament'; slug: string } | { type: 'maps' } | null

type ModalState =
  | { type: 'create' }
  | { type: 'rename'; tournament: Tournament }
  | null

// ─── Main shell ───────────────────────────────────────────────────────────────

export default function AdminShell() {
  useTitle('Admin Dashboard')
  const { logout } = useAuth()
  const navigate   = useNavigate()

  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [loading,     setLoading]     = useState(true)
  const [view,        setView]        = useState<AdminView>(null)
  const [modal,       setModal]       = useState<ModalState>(null)
  const [ctxMenu,     setCtxMenu]     = useState<CtxMenu | null>(null)

  const load = useCallback(async () => {
    const list = await tournamentsApi.list()
    setTournaments(list)
    setLoading(false)
    const featured = list.find(t => t.is_featured)
    if (featured) setView({ type: 'tournament', slug: featured.slug })
  }, [])

  useEffect(() => { load() }, [load])

  function handleFeaturedChange(id: number | null) {
    setTournaments(prev => prev.map(t => ({ ...t, is_featured: t.id === id ? 1 : 0 })))
  }

  function openCtx(e: React.MouseEvent, t: Tournament) {
    e.preventDefault()
    setCtxMenu({
      x: e.clientX, y: e.clientY,
      items: [
        {
          label: t.is_featured ? 'Remove from featured' : 'Set as featured',
          icon: Star,
          onClick: async () => {
            await authApi.setFeaturedTournament(t.is_featured ? null : t.id)
            handleFeaturedChange(t.is_featured ? null : t.id)
          },
        },
        { label: 'Rename', icon: Pencil, onClick: () => setModal({ type: 'rename', tournament: t }) },
        {
          label: 'Delete tournament', icon: Trash2, danger: true,
          onClick: async () => {
            await tournamentsApi.delete(t.slug)
            setTournaments(prev => prev.filter(x => x.slug !== t.slug))
            if (view?.type === 'tournament' && view.slug === t.slug) setView(null)
          },
        },
      ],
    })
  }

  async function handleLogout() { await logout(); navigate('/admin-login', { replace: true }) }

  const focusedSlug = view?.type === 'tournament' ? view.slug : null

  return (
    <div className="flex h-screen bg-zinc-950 overflow-hidden">
      {/* Modals */}
      {modal?.type === 'create' && (
        <TournamentModal
          onSave={t => { setTournaments(prev => [...prev, t]); setView({ type: 'tournament', slug: t.slug }) }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'rename' && (
        <TournamentModal
          initial={{ name: modal.tournament.name, description: modal.tournament.description ?? '', slug: modal.tournament.slug }}
          onSave={updated => setTournaments(prev => prev.map(t => t.slug === modal.tournament.slug ? { ...t, name: updated.name, description: updated.description } : t))}
          onClose={() => setModal(null)}
        />
      )}

      {ctxMenu && <ContextMenu menu={ctxMenu} onClose={() => setCtxMenu(null)} />}

      {/* Sidebar */}
      <div className="w-56 flex-shrink-0 border-r border-zinc-800 flex flex-col" style={{ backgroundColor: '#212022' }}>
        {/* Logo */}
        <div className="px-4 py-4 border-b border-zinc-800 flex-shrink-0">
          <Link to="/" className="inline-block">
            <img src={logo} alt="BDC" className="h-12 w-auto" />
          </Link>
          <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 mt-0.5">Admin Console</p>
        </div>

        {/* Tournaments section */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden py-3 flex flex-col gap-4">
          <div className="px-3">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-600">Tournaments</p>
              <button onClick={() => setModal({ type: 'create' })}
                title="New tournament"
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-zinc-500 hover:text-amber-400 hover:bg-amber-500/10 transition-colors">
                <Plus className="w-3 h-3" /> New
              </button>
            </div>

            {loading
              ? <div className="flex items-center justify-center py-4"><Loader2 className="w-4 h-4 text-zinc-700 animate-spin" /></div>
              : tournaments.length === 0
                ? <p className="text-xs text-zinc-700 py-2">No tournaments yet</p>
                : tournaments.map(t => (
                    <div
                      key={t.id}
                      onClick={() => setView({ type: 'tournament', slug: t.slug })}
                      onContextMenu={e => openCtx(e, t)}
                      className={cn(
                        'flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer select-none transition-colors text-xs',
                        focusedSlug === t.slug ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
                      )}
                    >
                      <FolderOpen className="w-3.5 h-3.5 flex-shrink-0 text-amber-500/70" />
                      <span className="flex-1 truncate font-medium">{t.name}</span>
                      {!!t.is_featured && <span className="text-amber-400 text-[10px]">★</span>}
                      {t.status === 'archived' && <span className="text-zinc-600 text-[10px] font-mono">arc</span>}
                    </div>
                  ))
            }
          </div>

          {/* Global section */}
          <div className="px-3">
            <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-1.5">Global</p>
            <button
              onClick={() => setView({ type: 'maps' })}
              className={cn(
                'flex items-center gap-2 px-2 py-1.5 rounded-lg w-full text-left text-xs font-medium transition-colors',
                view?.type === 'maps' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
              )}
            >
              <Map className="w-3.5 h-3.5 flex-shrink-0 text-zinc-500" />
              Maps
            </button>
          </div>
        </div>

        {/* Bottom */}
        <div className="p-3 border-t border-zinc-800 flex-shrink-0">
          <button onClick={handleLogout}
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-xs text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
        </div>
      </div>

      {/* Detail panel */}
      <div className="flex-1 overflow-auto">
        {view === null && (
          <div className="flex flex-col items-center justify-center h-full text-center py-20">
            <div className="text-4xl font-black text-zinc-800 mb-2"
              style={{ fontFamily: '"Barlow Condensed", sans-serif' }}>SELECT</div>
            <p className="text-sm text-zinc-700">Choose a tournament or open Maps</p>
          </div>
        )}
        {view?.type === 'tournament' && (
          <TournamentDetail slug={view.slug} roleOverride="admin" />
        )}
        {view?.type === 'maps' && <MapsPage />}
      </div>
    </div>
  )
}
