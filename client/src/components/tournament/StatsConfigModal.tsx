import { useEffect, useRef, useState } from 'react'
import { X, Plus, Trash2, Crown, Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import { STAT_COLS, stripClanTag, type StatsConfig, type GradientType } from './StatsTable'

const NUMERIC_COLS = STAT_COLS.filter(c => c.key !== 'rank' && c.key !== 'name')
const GRADIENT_OPTIONS: { value: GradientType | ''; label: string }[] = [
  { value: '',          label: '—'              },
  { value: 'green-up',  label: 'Green up (higher = greener)'  },
  { value: 'red-up',    label: 'Red up (higher = redder)'     },
  { value: 'yellow-up', label: 'Yellow up (higher = yellower)' },
  { value: 'heatmap',   label: 'Heatmap (low=red, high=green)' },
]

type Tab = 'visibility' | 'conditions' | 'colors' | 'mapping'

const inputCls = 'px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 focus:outline-none focus:border-amber-500/50 transition-colors'
const selectCls = inputCls + ' cursor-pointer'

function PlayerPicker({ value, options, onChange }: {
  value:    string
  options:  Array<{ name: string; cost: number }>
  onChange: (v: string) => void
}) {
  const [open,   setOpen]   = useState(false)
  const [search, setSearch] = useState('')
  const ref                 = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const filtered = options.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()))
  const selected = options.find(p => p.name === value)

  return (
    <div ref={ref} className="relative w-44 flex-shrink-0">
      <button
        onClick={() => { setOpen(o => !o); setSearch('') }}
        className="w-full flex items-center justify-between px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-left transition-colors hover:border-zinc-500">
        <span className={cn('truncate', selected ? 'text-zinc-200' : 'text-zinc-600')}>
          {selected ? selected.name : '— unset —'}
        </span>
        <span className="text-zinc-600 ml-1">▾</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-56 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl flex flex-col">
          <div className="p-1.5 border-b border-zinc-800">
            <input
              autoFocus
              type="text"
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full px-2 py-1 rounded-lg bg-zinc-800 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
            />
          </div>
          <div className="overflow-y-auto max-h-48">
            <button
              onClick={() => { onChange(''); setOpen(false) }}
              className="w-full text-left px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-800 transition-colors">
              — unset —
            </button>
            {filtered.map(p => (
              <button key={p.name}
                onClick={() => { onChange(p.name); setOpen(false) }}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-1.5 text-xs transition-colors hover:bg-zinc-800',
                  p.name === value ? 'text-amber-400' : 'text-zinc-300'
                )}>
                <span className="truncate">{p.name}</span>
                <span className="text-zinc-600 font-mono ml-2 flex-shrink-0">{p.cost.toFixed(1)}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-xs text-zinc-600 px-3 py-2">No match</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function StatsConfigModal({
  initial,
  divisionName,
  statNames,
  auctionPlayers,
  otherConfigs,
  onSave,
  onClose,
}: {
  initial:        StatsConfig
  divisionName:   string
  statNames:      string[]
  auctionPlayers: Array<{ name: string; cost: number }>
  otherConfigs?:  Array<{ name: string; config: StatsConfig }>
  onSave:         (cfg: StatsConfig) => void
  onClose:        () => void
}) {
  const [tab,        setTab]       = useState<Tab>('visibility')
  const [hidden,     setHidden]    = useState<Set<string>>(new Set(initial.hiddenColumns))
  const [conds,      setConds]     = useState<StatsConfig['conditions']>({ ...initial.conditions })
  const [grads,      setGrads]     = useState<StatsConfig['gradients']>({ ...initial.gradients })
  const [importFrom, setImportFrom] = useState('')

  function applyImport() {
    const src = otherConfigs?.find(c => c.name === importFrom)
    if (!src) return
    setHidden(new Set(src.config.hiddenColumns))
    setConds({ ...src.config.conditions })
    setGrads({ ...src.config.gradients })
    setImportFrom('')
  }
  const [nameMap,   setNameMap]   = useState<Record<string, string>>(initial.nameMap ?? {})
  const [captains,  setCaptains]  = useState<Set<string>>(new Set(initial.captains ?? []))
  const [mapFilter, setMapFilter] = useState('')

  // Conditions editing state
  const [newCondCol,    setNewCondCol]    = useState(NUMERIC_COLS[0].key)
  const [newCondDep,    setNewCondDep]    = useState(NUMERIC_COLS[0].key)
  const [newCondMin,    setNewCondMin]    = useState(10)

  function toggleHidden(key: string) {
    setHidden(prev => {
      const s = new Set(prev)
      s.has(key) ? s.delete(key) : s.add(key)
      return s
    })
  }

  function addCondition() {
    setConds(prev => ({ ...prev, [newCondCol]: { dependsOn: newCondDep, minValue: newCondMin } }))
  }

  function removeCondition(key: string) {
    setConds(prev => { const n = { ...prev }; delete n[key]; return n })
  }

  function setGrad(key: string, val: GradientType | '') {
    setGrads(prev => {
      const n = { ...prev }
      if (val === '') delete n[key]; else n[key] = val
      return n
    })
  }

  function toggleCaptain(inGameName: string) {
    setCaptains(prev => {
      const s = new Set(prev)
      s.has(inGameName) ? s.delete(inGameName) : s.add(inGameName)
      return s
    })
  }

  function save() {
    onSave({
      hiddenColumns: [...hidden],
      conditions:    conds,
      gradients:     grads,
      nameMap,
      captains:      [...captains],
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-zinc-900 border border-zinc-700 rounded-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 flex-shrink-0">
          <div>
            <p className="text-sm font-semibold text-zinc-100">Stats Configuration</p>
            <p className="text-xs text-zinc-500">{divisionName}</p>
          </div>
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-800 flex-shrink-0 px-5">
          {(['visibility', 'conditions', 'colors', 'mapping'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={cn('px-3 py-2.5 text-xs font-semibold border-b-2 -mb-px transition-colors capitalize',
                tab === t ? 'border-amber-500 text-amber-400' : 'border-transparent text-zinc-500 hover:text-zinc-300')}>
              {t}
            </button>
          ))}
        </div>

        {/* Import bar */}
        {otherConfigs && otherConfigs.length > 0 && (
          <div className="flex items-center gap-2 px-5 py-2.5 border-b border-zinc-800 bg-zinc-900/50 flex-shrink-0">
            <Download className="w-3 h-3 text-zinc-500 flex-shrink-0" />
            <span className="text-[11px] text-zinc-500 flex-shrink-0">Import visibility/conditions/colors from</span>
            <select
              value={importFrom}
              onChange={e => setImportFrom(e.target.value)}
              className="flex-1 min-w-0 px-2 py-1 rounded-lg bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 focus:outline-none focus:border-amber-500/50 cursor-pointer">
              <option value="">— choose division —</option>
              {otherConfigs.map(c => (
                <option key={c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
            <button
              disabled={!importFrom}
              onClick={applyImport}
              className="flex-shrink-0 px-3 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs font-medium border border-amber-500/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
              Apply
            </button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">

          {/* ── Visibility ── */}
          {tab === 'visibility' && (
            <div>
              <p className="text-xs text-zinc-500 mb-3">Hidden columns will not appear in the public table.</p>
              <div className="grid grid-cols-2 gap-1.5">
                {STAT_COLS.map(col => (
                  <button key={col.key} onClick={() => toggleHidden(col.key)}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-left transition-colors border',
                      hidden.has(col.key)
                        ? 'bg-zinc-800 border-zinc-700 text-zinc-500 line-through'
                        : 'bg-zinc-800/50 border-zinc-800 text-zinc-200 hover:border-zinc-600'
                    )}>
                    <span className={cn('w-2 h-2 rounded-full flex-shrink-0', hidden.has(col.key) ? 'bg-zinc-600' : 'bg-green-500')} />
                    <span className="font-mono">{col.label}</span>
                    <span className="text-zinc-600 text-[10px]">{col.key}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Conditions ── */}
          {tab === 'conditions' && (
            <div>
              <p className="text-xs text-zinc-500 mb-4">
                If a column's dependency value is below the minimum, the cell shows N/A instead.
                <br />Example: Hit% → depends on Shots ≥ 50
              </p>

              {/* Existing — editable inline */}
              {Object.keys(conds).length > 0 && (
                <div className="flex flex-col gap-2 mb-4">
                  {Object.entries(conds).map(([key, cond]) => {
                    const col = STAT_COLS.find(c => c.key === key)
                    return (
                      <div key={key} className="flex flex-wrap items-center gap-2 px-3 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700">
                        <span className="font-mono text-xs text-zinc-200 w-20 flex-shrink-0">{col?.label ?? key}</span>
                        <span className="text-xs text-zinc-500">if</span>
                        <select
                          value={cond.dependsOn}
                          onChange={e => setConds(prev => ({ ...prev, [key]: { ...prev[key], dependsOn: e.target.value } }))}
                          className={selectCls}>
                          {NUMERIC_COLS.map(c => <option key={c.key} value={c.key}>{c.label} ({c.key})</option>)}
                        </select>
                        <span className="text-xs text-zinc-500">≥</span>
                        <input
                          type="number"
                          value={cond.minValue}
                          onChange={e => setConds(prev => ({ ...prev, [key]: { ...prev[key], minValue: Number(e.target.value) } }))}
                          className={cn(inputCls, 'w-20')} />
                        <span className="text-xs text-zinc-500 flex-1">else N/A</span>
                        <button onClick={() => removeCondition(key)} className="text-zinc-600 hover:text-red-400 transition-colors">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Add new */}
              <div className="flex flex-wrap items-end gap-2 px-3 py-3 rounded-xl bg-zinc-800/50 border border-zinc-700">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Column</label>
                  <select value={newCondCol} onChange={e => setNewCondCol(e.target.value as any)} className={selectCls}>
                    {NUMERIC_COLS.map(c => <option key={c.key} value={c.key}>{c.label} ({c.key})</option>)}
                  </select>
                </div>
                <span className="text-xs text-zinc-500 pb-1.5">if</span>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Depends on</label>
                  <select value={newCondDep} onChange={e => setNewCondDep(e.target.value as any)} className={selectCls}>
                    {NUMERIC_COLS.map(c => <option key={c.key} value={c.key}>{c.label} ({c.key})</option>)}
                  </select>
                </div>
                <span className="text-xs text-zinc-500 pb-1.5">≥</span>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Min value</label>
                  <input type="number" value={newCondMin} onChange={e => setNewCondMin(Number(e.target.value))}
                    className={cn(inputCls, 'w-20')} />
                </div>
                <button onClick={addCondition}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs font-medium transition-colors border border-amber-500/20">
                  <Plus className="w-3 h-3" /> Add
                </button>
              </div>
            </div>
          )}

          {/* ── Colors ── */}
          {tab === 'colors' && (
            <div>
              <p className="text-xs text-zinc-500 mb-4">
                Apply color gradients to columns to highlight high/low values.
              </p>
              <div className="flex flex-col gap-1.5">
                {NUMERIC_COLS.map(col => {
                  const current = grads[col.key] ?? ''
                  return (
                    <div key={col.key} className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-lg transition-colors',
                      current ? 'bg-zinc-800 border border-zinc-700' : 'bg-zinc-800/30 border border-transparent'
                    )}>
                      <span className="font-mono text-xs text-zinc-300 w-24 flex-shrink-0">{col.label}</span>
                      <select value={current} onChange={e => setGrad(col.key, e.target.value as GradientType | '')}
                        className={cn(selectCls, 'flex-1')}>
                        {GRADIENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      {/* Color preview */}
                      {current === 'green-up'  && <div className="w-12 h-3 rounded flex-shrink-0" style={{ background: 'linear-gradient(to right, transparent, rgba(34,197,94,0.5))' }} />}
                      {current === 'red-up'    && <div className="w-12 h-3 rounded flex-shrink-0" style={{ background: 'linear-gradient(to right, transparent, rgba(239,68,68,0.5))' }} />}
                      {current === 'yellow-up' && <div className="w-12 h-3 rounded flex-shrink-0" style={{ background: 'linear-gradient(to right, transparent, rgba(234,179,8,0.5))' }} />}
                      {current === 'heatmap'   && <div className="w-12 h-3 rounded flex-shrink-0" style={{ background: 'linear-gradient(to right, rgba(239,68,68,0.4), rgba(34,197,94,0.4))' }} />}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Mapping ── */}
          {tab === 'mapping' && (
            <div>
              <p className="text-xs text-zinc-500 mb-3">
                Map in-game stat names to auction player names. Cost columns will be populated automatically.
              </p>
              <input
                type="text"
                placeholder="Filter names…"
                value={mapFilter}
                onChange={e => setMapFilter(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50 mb-3"
              />
              <div className="flex flex-col gap-1.5">
                {statNames
                  .filter(n => !mapFilter || n.toLowerCase().includes(mapFilter.toLowerCase()))
                  .map(inGameName => {
                    const mapped      = nameMap[inGameName] ?? ''
                    const player      = auctionPlayers.find(p => p.name === mapped)
                    const isCaptain   = captains.has(inGameName)
                    // Exclude names already selected in other rows
                    const alreadyUsed = new Set(Object.entries(nameMap)
                      .filter(([k]) => k !== inGameName)
                      .map(([, v]) => v))
                    const availableOptions = auctionPlayers.filter(p => !alreadyUsed.has(p.name))
                    return (
                      <div key={inGameName} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700">
                        <button
                          onClick={() => toggleCaptain(inGameName)}
                          title={isCaptain ? 'Remove captain' : 'Mark as captain'}
                          className={cn(
                            'flex-shrink-0 p-1 rounded transition-colors',
                            isCaptain
                              ? 'text-amber-400 hover:text-amber-300'
                              : 'text-zinc-600 hover:text-zinc-400'
                          )}>
                          <Crown className="w-3 h-3" />
                        </button>
                        <span className="font-mono text-xs text-zinc-300 flex-1 truncate min-w-0" title={inGameName}>
                          {stripClanTag(inGameName)}
                        </span>
                        <span className="text-zinc-600 text-xs flex-shrink-0">→</span>
                        <PlayerPicker
                          value={mapped}
                          options={availableOptions}
                          onChange={v => setNameMap(prev => {
                            const n = { ...prev }
                            if (v) n[inGameName] = v; else delete n[inGameName]
                            return n
                          })}
                        />
                        {player && (
                          <span className="text-[10px] font-mono text-amber-400 flex-shrink-0">
                            {player.cost.toFixed(1)}
                          </span>
                        )}
                      </div>
                    )
                  })}
              </div>
              {statNames.length === 0 && (
                <p className="text-xs text-zinc-600 text-center py-4">No stat names available. Upload stats first.</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-zinc-800 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs text-zinc-400 hover:text-zinc-200 transition-colors">
            Cancel
          </button>
          <button onClick={save}
            className="px-4 py-2 rounded-xl text-xs font-medium bg-amber-500 hover:bg-amber-400 text-black transition-colors">
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
