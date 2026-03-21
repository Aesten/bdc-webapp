import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { tournamentsApi, type Tournament } from '@/api/tournaments'
import { mapsApi, factionsApi, type GameMap, type Faction } from '@/api/maps'
import { bracketsApi, type Matchup } from '@/api/brackets'
import { auctionsApi, type Auction } from '@/api/auctions'
import { Loader2, Users, Map, Settings, Layers, Plus, X, Pencil, Trash2 } from 'lucide-react'
import { type ViewRole, inputCls } from './shared'
import PlayersTab  from './PlayersTab'
import MatchupsTab from './MatchupsTab'
import ConfigTab   from './ConfigTab'
import DivisionTab from './DivisionTab'
import { cn } from '@/lib/utils'

type TabId = 'players' | 'matchups' | 'config' | `division:${number}`

export interface TournamentDetailProps {
  slug:          string
  roleOverride?: ViewRole
}

// ─── Setup Division modal ─────────────────────────────────────────────────────

function SetupDivisionModal({ slug, onCreated, onClose }: {
  slug: string
  onCreated: (auction: Auction) => void
  onClose: () => void
}) {
  const [name,  setName]  = useState('')
  const [busy,  setBusy]  = useState(false)
  const [error, setError] = useState('')

  async function create() {
    if (!name.trim()) return
    setBusy(true); setError('')
    try {
      const auction = await auctionsApi.create(slug, {
        name: name.trim(),
      })
      await bracketsApi.create(slug, {
        name:       name.trim(),
        auction_id: auction.id,
      })
      onCreated(auction)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create division')
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-sm mx-4 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-base font-semibold text-zinc-100">Setup Division</p>
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm text-zinc-600">
          A division bundles an auction and bracket together under one tab.
        </p>

        <div>
          <label className="text-xs font-mono uppercase tracking-widest text-zinc-500 mb-1.5 block">Name</label>
          <input value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && create()}
            autoFocus placeholder="e.g. Division A…"
            className={inputCls} />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose}
            className="flex-1 py-2 rounded-xl bg-zinc-800 text-zinc-400 text-sm hover:bg-zinc-700 transition-colors">
            Cancel
          </button>
          <button onClick={create} disabled={busy || !name.trim()}
            className="flex-1 py-2 rounded-xl bg-amber-500 text-black text-sm font-semibold hover:bg-amber-400 transition-colors disabled:opacity-40">
            {busy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Tournament detail ────────────────────────────────────────────────────────

export default function TournamentDetail({ slug, roleOverride }: TournamentDetailProps) {
  const { user } = useAuth()
  const role: ViewRole = roleOverride ?? (
    user?.role === 'auctioneer' ? 'auctioneer' :
    user?.role === 'captain'    ? 'captain'    :
    user?.role === 'admin'      ? 'admin'      : 'host'
  )

  const [project,       setProject]       = useState<Tournament | null>(null)
  const [maps,          setMaps]          = useState<GameMap[]>([])
  const [factions,      setFactions]      = useState<Faction[]>([])
  const [matchups,      setMatchups]      = useState<Matchup[]>([])
  const [auctions,      setAuctions]      = useState<Auction[]>([])
  const [loading,       setLoading]       = useState(true)
  const [loadError,     setLoadError]     = useState(false)
  const [tab,           setTab]           = useState<TabId>('players')
  const [showDivModal,  setShowDivModal]  = useState(false)
  const [ctxMenu,       setCtxMenu]       = useState<{ id: number; name: string; status: Auction['status']; x: number; y: number } | null>(null)
  const [renameTarget,  setRenameTarget]  = useState<{ id: number; name: string } | null>(null)
  const [renameBusy,    setRenameBusy]    = useState(false)
  const [deleteBusy,    setDeleteBusy]    = useState(false)
  const ctxRef                = useRef<HTMLDivElement>(null)
  const renameBackdropRef     = useRef(false)

  // Close context menu on outside click
  useEffect(() => {
    if (!ctxMenu) return
    function onDown(e: MouseEvent) {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) setCtxMenu(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [ctxMenu])

  async function handleRename() {
    if (!renameTarget) return
    setRenameBusy(true)
    try {
      await auctionsApi.update(renameTarget.id, { name: renameTarget.name })
      setAuctions(prev => prev.map(a => a.id === renameTarget.id ? { ...a, name: renameTarget.name } : a))
      setRenameTarget(null)
    } catch { /* ignore */ } finally { setRenameBusy(false) }
  }

  async function handleDelete(id: number) {
    setDeleteBusy(true)
    setCtxMenu(null)
    try {
      await auctionsApi.delete(id)
      setAuctions(prev => prev.filter(a => a.id !== id))
      if (tab === `division:${id}`) setTab('players')
    } catch { /* ignore */ } finally { setDeleteBusy(false) }
  }

  useEffect(() => {
    Promise.all([
      tournamentsApi.get(slug),
      mapsApi.list(),
      factionsApi.list(),
      bracketsApi.listMatchups(slug),
      auctionsApi.listForTournament(slug),
    ]).then(([proj, mapList, facList, matchupList, auctList]) => {
      setProject(proj); setMaps(mapList); setFactions(facList)
      setMatchups(matchupList); setAuctions(auctList)
      if (roleOverride === 'auctioneer' && auctList.length > 0) {
        setTab(`division:${auctList[0].id}`)
      }
      if (roleOverride === 'captain' && user?.auctionId) {
        const myAuction = auctList.find(a => a.id === user.auctionId)
        if (myAuction) setTab(`division:${myAuction.id}`)
        else if (auctList.length > 0) setTab(`division:${auctList[0].id}`)
      }
    }).catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }, [slug, roleOverride])

  if (loading) return (
    <div className="flex items-center justify-center h-full py-24">
      <Loader2 className="w-6 h-6 text-zinc-600 animate-spin" />
    </div>
  )

  if (loadError || !project) return (
    <div className="flex items-center justify-center h-full py-24 text-zinc-600">
      <p className="text-sm">Failed to load tournament.</p>
    </div>
  )

  const canManage = role === 'admin' || role === 'host'

  const staticTabs: { id: TabId; label: string; icon: React.ElementType }[] = (role === 'auctioneer' || role === 'captain')
    ? [{ id: 'players', label: 'Player pool', icon: Users }]
    : [
        { id: 'players',  label: 'Player pool',   icon: Users    },
        { id: 'matchups', label: 'Matchups',       icon: Map      },
        { id: 'config',   label: 'Configuration', icon: Settings },
      ]

  const activeAuction = tab.startsWith('division:')
    ? auctions.find(a => a.id === Number(tab.split(':')[1]))
    : null

  function handleDivisionCreated(auction: Auction) {
    setAuctions(prev => [...prev, auction])
    setTab(`division:${auction.id}`)
    setShowDivModal(false)
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-zinc-800">
        <div className="w-full px-[5%] pt-6 pb-0">
          <h1 className="text-2xl font-black text-zinc-100 mb-0.5" style={{ fontFamily: '"Barlow Condensed", sans-serif' }}>
            {project.name}
          </h1>
          <p className="text-xs text-zinc-600 font-mono mb-4">/{project.slug}</p>

          <div className="flex items-center gap-0.5 -mb-px overflow-x-auto">
            {staticTabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={cn('flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap',
                  tab === t.id ? 'border-amber-500 text-amber-400' : 'border-transparent text-zinc-500 hover:text-zinc-300')}>
                <t.icon className="w-3.5 h-3.5" />{t.label}
              </button>
            ))}

            {/* Division separator + tabs */}
            {(auctions.length > 0 || canManage) && (
              <>
                <div className="w-px h-5 bg-zinc-700 mx-1.5 flex-shrink-0" />
                {auctions
                  .filter(a => role !== 'captain' || a.id === user?.auctionId)
                  .map(a => (
                  <button key={a.id}
                    onClick={() => setTab(`division:${a.id}`)}
                    onContextMenu={canManage ? e => { e.preventDefault(); setCtxMenu({ id: a.id, name: a.name, status: a.status, x: e.clientX, y: e.clientY }) } : undefined}
                    className={cn('flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap',
                      tab === `division:${a.id}` ? 'border-amber-500 text-amber-400' : 'border-transparent text-zinc-500 hover:text-zinc-300')}>
                    <Layers className="w-3.5 h-3.5" />{a.name}
                  </button>
                ))}
                {canManage && (
                  auctions.length === 0
                    ? <button onClick={() => setShowDivModal(true)}
                        className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 border-transparent text-zinc-500 hover:text-zinc-300 transition-colors whitespace-nowrap">
                        <Plus className="w-3.5 h-3.5" /> Setup Division
                      </button>
                    : <button onClick={() => setShowDivModal(true)}
                        className="flex items-center justify-center w-8 py-2.5 text-xs font-semibold border-b-2 border-transparent text-zinc-600 hover:text-zinc-300 transition-colors"
                        title="Add division">
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activeAuction ? (
          <div className="pl-[5%] pr-[5%] py-6 max-w-[80vw]">
            <DivisionTab key={activeAuction.id} auction={activeAuction} slug={slug} role={role} project={project} />
          </div>
        ) : (
          <div className="pl-[5%] py-6">
            {tab === 'players'  && <div className="max-w-[50vw]"><PlayersTab  slug={slug} role={role} /></div>}
            {tab === 'matchups' && <div className="max-w-[70vw]"><MatchupsTab slug={slug} maps={maps} factions={factions} matchups={matchups} setMatchups={setMatchups} role={role} project={project} onProjectUpdate={setProject} /></div>}
            {tab === 'config'   && <div className="max-w-[40vw]"><ConfigTab   project={project} onProjectUpdate={setProject} role={role} /></div>}
          </div>
        )}
      </div>

      {showDivModal && (
        <SetupDivisionModal
          slug={slug}
          onCreated={handleDivisionCreated}
          onClose={() => setShowDivModal(false)}
        />
      )}

      {/* Division context menu */}
      {ctxMenu && (
        <div ref={ctxRef}
          className="fixed z-50 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl py-1 w-44"
          style={{ top: ctxMenu.y, left: ctxMenu.x }}>
          <button
            onClick={() => { setRenameTarget({ id: ctxMenu.id, name: ctxMenu.name }); setCtxMenu(null) }}
            disabled={ctxMenu.status !== 'setup'}
            title={ctxMenu.status !== 'setup' ? 'Cannot rename after auction has started' : undefined}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            <Pencil className="w-3.5 h-3.5" /> Rename
          </button>
          <button
            onClick={() => handleDelete(ctxMenu.id)}
            disabled={ctxMenu.status !== 'setup' || deleteBusy}
            title={ctxMenu.status !== 'setup' ? 'Cannot delete after auction has started' : undefined}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-zinc-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
        </div>
      )}

      {/* Rename modal */}
      {renameTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onMouseDown={e => { renameBackdropRef.current = e.target === e.currentTarget }}
          onClick={e => { if (renameBackdropRef.current && e.target === e.currentTarget) setRenameTarget(null) }}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-72 shadow-2xl">
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
              <span className="text-sm font-semibold text-zinc-200">Rename Division</span>
              <button onClick={() => setRenameTarget(null)} className="p-1 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4">
              <input
                autoFocus
                value={renameTarget.name}
                onChange={e => setRenameTarget(prev => prev ? { ...prev, name: e.target.value } : null)}
                onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setRenameTarget(null) }}
                className="w-full px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-100 focus:outline-none focus:border-amber-500/50"
              />
            </div>
            <div className="px-4 pb-4 flex gap-2">
              <button onClick={() => setRenameTarget(null)}
                className="flex-1 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-400 text-xs transition-colors">
                Cancel
              </button>
              <button onClick={handleRename} disabled={renameBusy || !renameTarget.name.trim()}
                className="flex-1 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-colors disabled:opacity-40">
                {renameBusy ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : 'Rename'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
