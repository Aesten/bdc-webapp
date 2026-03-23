import { useEffect, useState, useRef } from 'react'
import { tournamentsApi } from '@/api/tournaments'
import { Loader2, Upload, Trash2, CheckCircle2, Settings2 } from 'lucide-react'
import { useToast } from '@/context/ToastContext'
import StatsConfigModal from '@/components/tournament/StatsConfigModal'
import type { StatsConfig } from '@/components/tournament/StatsTable'

interface Division { auctionId: number; name: string; tournamentName: string }

const EMPTY_CONFIG: StatsConfig = { hiddenColumns: [], conditions: {}, gradients: {} }

export default function StatsPage() {
  const { toast }                   = useToast()
  const [divisions,  setDivisions]  = useState<Division[]>([])
  const [uploaded,   setUploaded]   = useState<Set<number>>(new Set())
  const [loading,    setLoading]    = useState(true)
  const [uploading,  setUploading]  = useState<number | null>(null)
  const [deleting,   setDeleting]   = useState<number | null>(null)
  const [configFor,  setConfigFor]  = useState<Division | null>(null)
  const [configs,    setConfigs]    = useState<Record<number, StatsConfig>>({})
  const [slugs,      setSlugs]      = useState<Record<number, string>>({})
  const [teamsPerAuction, setTeamsPerAuction] = useState<Record<number, Array<{ name: string; cost: number }>>>({})
  const [statNamesPerAuction, setStatNamesPerAuction] = useState<Record<number, string[]>>({})
  const fileRefs                    = useRef<Record<number, HTMLInputElement | null>>({})

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const [list, ids] = await Promise.all([
        tournamentsApi.list(),
        tournamentsApi.listStats().catch(() => [] as number[]),
      ])
      const divs: Division[] = []
      await Promise.all(list.map(async t => {
        const overview = await tournamentsApi.getPublic(t.slug)
        for (const d of overview.divisions) {
          divs.push({ auctionId: d.auction.id, name: d.auction.name, tournamentName: t.name })
        }
      }))
      setDivisions(divs)
      setUploaded(new Set(ids))
      setSlugs(Object.fromEntries(divs.map(d => [d.auctionId, list.find(l => l.name === d.tournamentName)?.slug ?? ''])))
      // Build teams lookup per auction
      const tpa: Record<number, Array<{ name: string; cost: number }>> = {}
      for (const t of list) {
        try {
          const overview = await tournamentsApi.getPublic(t.slug)
          for (const d of overview.divisions) {
            tpa[d.auction.id] = d.teams.flatMap(team =>
              team.players.map(p => ({ name: p.player_name, cost: p.price }))
            )
          }
        } catch {}
      }
      setTeamsPerAuction(tpa)
      // Pre-fetch configs for all divisions that already have stats uploaded
      const slugMap = Object.fromEntries(divs.map(d => [d.auctionId, list.find(l => l.name === d.tournamentName)?.slug ?? '']))
      const cfgEntries = await Promise.all(
        divs
          .filter(d => ids.includes(d.auctionId))
          .map(async d => {
            const slug = slugMap[d.auctionId]
            if (!slug) return null
            try {
              const res  = await fetch(`/api/tournaments/public/${slug}/stats/${d.auctionId}`, { credentials: 'include' })
              const data = res.ok ? await res.json() : null
              if (data?.rows) {
                setStatNamesPerAuction(prev => ({ ...prev, [d.auctionId]: data.rows.map((r: any) => r.name as string) }))
              }
              return [d.auctionId, data?.config ?? EMPTY_CONFIG] as [number, StatsConfig]
            } catch {
              return [d.auctionId, EMPTY_CONFIG] as [number, StatsConfig]
            }
          })
      )
      setConfigs(Object.fromEntries(cfgEntries.filter(Boolean) as [number, StatsConfig][]))
    } catch (e) {
      console.error('StatsPage load error', e)
    } finally {
      setLoading(false)
    }
  }

  async function handleUpload(auctionId: number, file: File) {
    if (!file.name.endsWith('.json') && !file.name.endsWith('.csv')) { toast('File must be .csv or .json', 'error'); return }
    setUploading(auctionId)
    try {
      await tournamentsApi.uploadStats(auctionId, file)
      setUploaded(prev => new Set([...prev, auctionId]))
      toast('Stats uploaded', 'success')
    } catch (e: any) {
      toast(e.message ?? 'Upload failed', 'error')
    } finally {
      setUploading(null)
    }
  }

  async function openConfig(div: Division) {
    if (!(div.auctionId in configs)) {
      const slug = slugs[div.auctionId]
      if (slug) {
        try {
          const res  = await fetch(`/api/tournaments/public/${slug}/stats/${div.auctionId}`, { credentials: 'include' })
          const data = res.ok ? await res.json() : null
          setConfigs(prev => ({ ...prev, [div.auctionId]: data?.config ?? EMPTY_CONFIG }))
          if (data?.rows) {
            setStatNamesPerAuction(prev => ({ ...prev, [div.auctionId]: data.rows.map((r: any) => r.name as string) }))
          }
        } catch {
          setConfigs(prev => ({ ...prev, [div.auctionId]: EMPTY_CONFIG }))
        }
      } else {
        setConfigs(prev => ({ ...prev, [div.auctionId]: EMPTY_CONFIG }))
      }
    }
    setConfigFor(div)
  }

  async function handleSaveConfig(cfg: StatsConfig) {
    if (!configFor) return
    try {
      await tournamentsApi.saveConfig(configFor.auctionId, cfg)
      setConfigs(prev => ({ ...prev, [configFor.auctionId]: cfg }))
      toast('Config saved', 'success')
    } catch (e: any) {
      toast(e.message ?? 'Save failed', 'error')
    }
    setConfigFor(null)
  }

  async function handleDelete(auctionId: number) {
    setDeleting(auctionId)
    try {
      await tournamentsApi.deleteStats(auctionId)
      setUploaded(prev => { const s = new Set(prev); s.delete(auctionId); return s })
      toast('Stats removed', 'success')
    } catch (e: any) {
      toast(e.message ?? 'Delete failed', 'error')
    } finally {
      setDeleting(null)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-5 h-5 animate-spin text-zinc-600" />
    </div>
  )

  // Group by tournament
  const byTournament = divisions.reduce<Record<string, Division[]>>((acc, d) => {
    ;(acc[d.tournamentName] ??= []).push(d)
    return acc
  }, {})

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-base font-semibold text-zinc-100 mb-1">Division Stats</h2>
      <p className="text-xs text-zinc-500 mb-6">Upload a <span className="font-mono">.csv</span> or <span className="font-mono">.json</span> file per division. CSV is auto-converted to JSON and served on the public stats tab.</p>

      {Object.entries(byTournament).map(([tName, divs]) => (
        <div key={tName} className="mb-6">
          <p className="text-[11px] font-mono uppercase tracking-widest text-zinc-600 mb-2">{tName}</p>
          <div className="flex flex-col gap-2">
            {divs.map(d => {
              const hasFile  = uploaded.has(d.auctionId)
              const busy     = uploading === d.auctionId || deleting === d.auctionId
              return (
                <div key={d.auctionId}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-800">
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-zinc-200 font-medium">{d.name}</span>
                  </div>

                  {hasFile && (
                    <span className="flex items-center gap-1 text-[11px] text-green-500 font-mono">
                      <CheckCircle2 className="w-3 h-3" /> uploaded
                    </span>
                  )}

                  {/* Upload / Replace */}
                  <input
                    ref={el => { fileRefs.current[d.auctionId] = el }}
                    type="file"
                    accept=".csv,.json,text/csv,application/json"
                    className="hidden"
                    onChange={e => {
                      const f = e.target.files?.[0]
                      if (f) handleUpload(d.auctionId, f)
                      e.target.value = ''
                    }}
                  />
                  <button
                    disabled={busy}
                    onClick={() => fileRefs.current[d.auctionId]?.click()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors disabled:opacity-40">
                    {uploading === d.auctionId
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <Upload className="w-3 h-3" />}
                    {hasFile ? 'Replace' : 'Upload'}
                  </button>

                  {/* Configure */}
                  {hasFile && (
                    <button
                      disabled={busy}
                      onClick={() => openConfig(d)}
                      className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40"
                      title="Configure columns & colors">
                      <Settings2 className="w-3 h-3" />
                    </button>
                  )}

                  {/* Delete */}
                  {hasFile && (
                    <button
                      disabled={busy}
                      onClick={() => handleDelete(d.auctionId)}
                      className="p-1.5 rounded-lg bg-zinc-800 hover:bg-red-400/10 text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-40">
                      {deleting === d.auctionId
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <Trash2 className="w-3 h-3" />}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {divisions.length === 0 && (
        <p className="text-sm text-zinc-600">No divisions found.</p>
      )}

      {configFor && (
        <StatsConfigModal
          initial={configs[configFor.auctionId] ?? EMPTY_CONFIG}
          divisionName={configFor.name}
          statNames={statNamesPerAuction[configFor.auctionId] ?? []}
          auctionPlayers={teamsPerAuction[configFor.auctionId] ?? []}
          otherConfigs={Object.entries(configs)
            .filter(([id]) => Number(id) !== configFor.auctionId)
            .map(([id, cfg]) => ({
              name: divisions.find(d => d.auctionId === Number(id))?.name ?? `Division ${id}`,
              config: cfg,
            }))}
          onSave={handleSaveConfig}
          onClose={() => setConfigFor(null)}
        />
      )}
    </div>
  )
}
