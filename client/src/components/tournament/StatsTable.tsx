import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { ChevronUp, ChevronDown, Columns3, RotateCcw, Crown } from 'lucide-react'

export interface StatRow {
  rank: number; name: string; played: number; won: number; wr: number
  score: number; score_per_round: number; kills: number; deaths: number; assists: number
  kpr: number; dpr: number; apr: number; kapr: number; spawns: number; survival: number
  mvp: number; mvp_rate: number; first_kills: number; first_deaths: number
  bonks: number; couches: number; kicks: number; horse_dmg: number; horse_kills: number
  shots: number; hits: number; hit_rate: number; hs: number; hs_rate: number
  tk: number; th: number; td: number; th_taken: number; suicides: number
  melee_dmg: number; mounted_dmg: number; ranged_dmg: number
  melee_pct: number; mounted_pct: number; ranged_pct: number
  // Augmented fields (computed client-side, not from CSV)
  cost?:           number | null
  cost_per_score?: number | null
  auction_name?:   string | null
}

export interface ColumnCondition { dependsOn: string; minValue: number }
export type GradientType = 'green-up' | 'red-up' | 'yellow-up' | 'heatmap'

export interface StatsConfig {
  hiddenColumns: string[]
  conditions:    Record<string, ColumnCondition>
  gradients:     Record<string, GradientType>
  nameMap?:      Record<string, string>   // in-game name → auction player name
  captains?:     string[]                 // auction player names who are captains
}

/** Strip leading clan tags like [TAG1] [TAG2] from a display name */
export function stripClanTag(name: string): string {
  const stripped = name.replace(/^(\[[^\]]*\]\s*)*/u, '').trim()
  return stripped || name
}

export type ColDef = { key: keyof StatRow; label: string; fmt?: 'pct' | 'dec' | 'dec1' }

export const STAT_COLS: ColDef[] = [
  { key: 'rank',            label: '#'          },
  { key: 'name',            label: 'Name'       },
  { key: 'played',          label: 'Played'     },
  { key: 'won',             label: 'Won'        },
  { key: 'wr',              label: 'WR%',       fmt: 'pct' },
  { key: 'score',           label: 'Score'      },
  { key: 'score_per_round', label: 'S/R',       fmt: 'dec' },
  { key: 'cost',            label: 'Cost',      fmt: 'dec1' },
  { key: 'cost_per_score',  label: 'C/kS',      fmt: 'dec' },
  { key: 'kills',           label: 'K'          },
  { key: 'deaths',          label: 'D'          },
  { key: 'assists',         label: 'A'          },
  { key: 'kpr',             label: 'K/R',       fmt: 'dec' },
  { key: 'dpr',             label: 'D/R',       fmt: 'dec' },
  { key: 'apr',             label: 'A/R',       fmt: 'dec' },
  { key: 'kapr',            label: 'K+A/R',     fmt: 'dec' },
  { key: 'spawns',          label: 'Spawns'     },
  { key: 'survival',        label: 'Surv%',     fmt: 'pct' },
  { key: 'mvp',             label: 'MVP'        },
  { key: 'mvp_rate',        label: 'MVP%',      fmt: 'pct' },
  { key: 'first_kills',     label: 'FirstK'     },
  { key: 'first_deaths',    label: 'FirstD'     },
  { key: 'bonks',           label: 'Bonks'      },
  { key: 'couches',         label: 'Couches'    },
  { key: 'kicks',           label: 'Kicks'      },
  { key: 'horse_dmg',       label: 'HorseDmg'   },
  { key: 'horse_kills',     label: 'HorseKills' },
  { key: 'shots',           label: 'Shots'      },
  { key: 'hits',            label: 'Hits'       },
  { key: 'hit_rate',        label: 'Hit%',      fmt: 'pct' },
  { key: 'hs',              label: 'HS'         },
  { key: 'hs_rate',         label: 'HS%',       fmt: 'pct' },
  { key: 'tk',              label: 'TK'         },
  { key: 'th',              label: 'TH'         },
  { key: 'td',              label: 'TD'         },
  { key: 'th_taken',        label: 'THTaken'    },
  { key: 'suicides',        label: 'Suicides'   },
  { key: 'melee_dmg',       label: 'MeleeDmg'   },
  { key: 'mounted_dmg',     label: 'MountedDmg' },
  { key: 'ranged_dmg',      label: 'RangedDmg'  },
  { key: 'melee_pct',       label: 'Melee%',    fmt: 'pct' },
  { key: 'mounted_pct',     label: 'Mounted%',  fmt: 'pct' },
  { key: 'ranged_pct',      label: 'Ranged%',   fmt: 'pct' },
]

function fmtVal(val: number | string | null | undefined, fmt?: 'pct' | 'dec' | 'dec1'): string {
  if (val === null || val === undefined) return '—'
  if (typeof val === 'string') return val
  if (fmt === 'pct')  return `${(val * 100).toFixed(1)}%`
  if (fmt === 'dec')  return val.toFixed(2)
  if (fmt === 'dec1') return val.toFixed(1)
  return String(val)
}

function gradientBg(value: number, min: number, max: number, type: GradientType): string {
  if (max === min) return ''
  if (type === 'green-up' || type === 'red-up' || type === 'yellow-up') {
    if (max === 0) return ''
    const t = Math.max(0, Math.min(1, value / max))
    const color = type === 'green-up' ? '34,197,94' : type === 'red-up' ? '239,68,68' : '234,179,8'
    return `rgba(${color},${(t * 0.35).toFixed(3)})`
  }
  // heatmap: min=red, max=green
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)))
  const r = Math.round(239 + (34  - 239) * t)
  const g = Math.round(68  + (197 - 68)  * t)
  const b = Math.round(68  + (94  - 68)  * t)
  return `rgba(${r},${g},${b},0.25)`
}

export default function StatsTable({ rows, config, teams }: {
  rows:    StatRow[]
  config?: StatsConfig | null
  teams?:  Array<{ players: Array<{ player_name: string; price: number }> }>
}) {
  const [sortKey,      setSortKey]      = useState<keyof StatRow>('rank')
  const [sortAsc,      setSortAsc]      = useState(true)
  const adminHidden                     = useMemo(() => new Set(config?.hiddenColumns ?? []), [config])
  const [localHidden,  setLocalHidden]  = useState<Set<string>>(new Set(config?.hiddenColumns ?? []))
  const [nameFilter,   setNameFilter]   = useState('')
  const [colsOpen,     setColsOpen]     = useState(false)
  const colsBtnRef                      = useRef<HTMLButtonElement>(null)
  const colsPopoverRef                  = useRef<HTMLDivElement>(null)
  const rankThRef                       = useRef<HTMLTableCellElement>(null)
  const [rankWidth,    setRankWidth]    = useState(40)

  useEffect(() => {
    if (rankThRef.current) setRankWidth(rankThRef.current.offsetWidth)
  })

  useEffect(() => {
    if (!colsOpen) return
    function handleClick(e: MouseEvent) {
      if (
        colsBtnRef.current?.contains(e.target as Node) ||
        colsPopoverRef.current?.contains(e.target as Node)
      ) return
      setColsOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [colsOpen])

  const conditions  = config?.conditions ?? {}
  const gradients   = config?.gradients  ?? {}
  const nameMap     = config?.nameMap    ?? {}
  const captainSet  = useMemo(() => new Set(config?.captains ?? []), [config])

  // Build a flat lookup: auction player_name → price
  const priceByAuctionName = useMemo(() => {
    const map: Record<string, number> = {}
    for (const team of teams ?? []) {
      for (const p of team.players) map[p.player_name] = p.price
    }
    return map
  }, [teams])

  // Augment rows: apply nameMap, attach cost/cost_per_score
  const augmentedRows = useMemo(() => rows.map(row => {
    const auctionName = nameMap[row.name] ?? null
    const cost        = auctionName !== null ? (priceByAuctionName[auctionName] ?? null) : null
    return {
      ...row,
      auction_name:   auctionName,
      cost,
      cost_per_score: (cost !== null && cost > 0.1 && row.score > 0)
        ? (cost * 1000) / row.score
        : null,
    }
  }), [rows, nameMap, priceByAuctionName])

  // Sync local hidden when config changes (e.g. division switch)
  const prevAdminHidden = useRef(adminHidden)
  if (prevAdminHidden.current !== adminHidden) {
    prevAdminHidden.current = adminHidden
    setLocalHidden(new Set(adminHidden))
  }

  function toggleLocal(key: string) {
    setLocalHidden(prev => {
      const s = new Set(prev)
      s.has(key) ? s.delete(key) : s.add(key)
      return s
    })
  }

  const visibleCols = STAT_COLS.filter(c => !localHidden.has(c.key))

  // Compute effective values (null if condition not met)
  const effectiveRows = useMemo(() => augmentedRows.map(row => {
    const eff: Record<string, number | string | null> = {}
    for (const col of STAT_COLS) {
      const cond = conditions[col.key]
      if (cond && typeof row[cond.dependsOn as keyof StatRow] === 'number') {
        const dep = row[cond.dependsOn as keyof StatRow] as number
        eff[col.key] = dep < cond.minValue ? null : (row[col.key] as number)
      } else {
        eff[col.key] = row[col.key] as number | string
      }
    }
    eff['auction_name'] = (row as any)['auction_name'] ?? null
    return eff
  }), [augmentedRows, conditions])

  // Per-column min/max for gradient (only non-null numeric values)
  const colRange = useMemo(() => {
    const range: Record<string, { min: number; max: number }> = {}
    for (const col of STAT_COLS) {
      if (!gradients[col.key]) continue
      const vals = effectiveRows.map(r => r[col.key]).filter(v => v !== null && typeof v === 'number') as number[]
      if (vals.length === 0) continue
      range[col.key] = { min: Math.min(...vals), max: Math.max(...vals) }
    }
    return range
  }, [effectiveRows, gradients])

  const sorted = useMemo(() => [...effectiveRows].sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey]
    if (av === null || av === undefined) return 1
    if (bv === null || bv === undefined) return -1
    const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number)
    return sortAsc ? cmp : -cmp
  }), [effectiveRows, sortKey, sortAsc])

  function handleSort(key: keyof StatRow) {
    if (sortKey === key) setSortAsc(a => !a)
    else { setSortKey(key); setSortAsc(false) }
  }

  return (
    <div className="flex flex-col w-full h-full min-h-0">
      {/* Toolbar */}
      <div className="flex-shrink-0 flex items-center justify-between px-1 pb-2">
        <input
          type="text"
          placeholder="Filter by name…"
          value={nameFilter}
          onChange={e => setNameFilter(e.target.value)}
          className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors w-44"
        />

        <div className="relative">
          <button
            ref={colsBtnRef}
            onClick={() => setColsOpen(o => !o)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
              colsOpen
                ? 'bg-zinc-800 border-zinc-600 text-zinc-200'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600'
            )}>
            <Columns3 className="w-3.5 h-3.5" />
            Columns
            {(() => {
              const toggleable = STAT_COLS.filter(c => !adminHidden.has(c.key))
              const userHidden = toggleable.filter(c => localHidden.has(c.key)).length
              return userHidden > 0 ? (
                <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-mono">
                  {toggleable.length - userHidden}/{toggleable.length}
                </span>
              ) : null
            })()}
          </button>

          {colsOpen && (
            <div ref={colsPopoverRef} className="absolute right-0 top-full mt-1 z-30 w-72 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Toggle columns</span>
                <button
                  onClick={() => setLocalHidden(new Set(adminHidden))}
                  className="flex items-center gap-1 text-[10px] text-zinc-600 hover:text-zinc-300 transition-colors">
                  <RotateCcw className="w-2.5 h-2.5" /> Reset
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1 max-h-72 overflow-y-auto">
                {STAT_COLS.filter(col => !adminHidden.has(col.key)).map(col => {
                  const isHidden = localHidden.has(col.key)
                  return (
                    <button key={col.key} onClick={() => toggleLocal(col.key)}
                      className={cn(
                        'flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-left transition-colors',
                        isHidden
                          ? 'text-zinc-600 bg-zinc-800/30'
                          : 'text-zinc-300 bg-zinc-800 hover:bg-zinc-700'
                      )}>
                      <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0',
                        isHidden ? 'bg-zinc-700' : 'bg-green-500')} />
                      <span className="font-mono truncate">{col.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="overflow-auto flex-1 min-h-0">
      <table className="w-max text-xs border-collapse">
        <thead>
          <tr className="sticky top-0 z-10 bg-zinc-950">
            {visibleCols.map(col => {
              const active = sortKey === col.key
              return (
                <th key={col.key}
                  ref={col.key === 'rank' ? rankThRef : undefined}
                  onClick={() => handleSort(col.key)}
                  style={col.key === 'name' ? { left: rankWidth } : undefined}
                  className={cn(
                    'px-3 py-2 text-left font-mono font-semibold cursor-pointer select-none border-b border-zinc-800 whitespace-nowrap',
                    col.key === 'rank' ? 'sticky left-0 bg-zinc-950 z-20' :
                    col.key === 'name' ? 'sticky bg-zinc-950 z-20 min-w-[120px]' : '',
                    active ? 'text-amber-400' : 'text-zinc-500 hover:text-zinc-300'
                  )}>
                  <span className="flex items-center gap-1">
                    {col.label}
                    {active
                      ? sortAsc
                        ? <ChevronUp className="w-2.5 h-2.5 flex-shrink-0" />
                        : <ChevronDown className="w-2.5 h-2.5 flex-shrink-0" />
                      : null}
                  </span>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.filter(r => {
            if (!nameFilter) return true
            const q = nameFilter.toLowerCase()
            const displayName = (r['auction_name'] as string | null) ?? (r['name'] as string) ?? ''
            return stripClanTag(displayName).toLowerCase().includes(q) || displayName.toLowerCase().includes(q)
          }).map((row, i) => (
            <tr key={row['name'] as string} className={cn('border-b border-zinc-800/40', i % 2 === 0 ? 'bg-zinc-900/30' : '')}>
              {visibleCols.map(col => {
                const val     = row[col.key]
                const grad    = gradients[col.key]
                const range   = colRange[col.key]
                const bgColor = (grad && range && typeof val === 'number' && val !== null)
                  ? gradientBg(val, range.min, range.max, grad)
                  : undefined
                return (
                  <td key={col.key}
                    style={{
                      ...(bgColor ? { backgroundColor: bgColor } : {}),
                      ...(col.key === 'name' ? { left: rankWidth } : {}),
                    }}
                    className={cn(
                      'px-3 py-1.5 tabular-nums whitespace-nowrap',
                      col.key === 'rank'
                        ? 'sticky left-0 bg-zinc-900 text-zinc-500 font-mono text-right'
                        : col.key === 'name'
                        ? 'sticky bg-zinc-900 font-medium text-zinc-200 min-w-[120px] max-w-[180px]'
                        : 'text-zinc-400 text-right font-mono',
                      sortKey === col.key ? 'text-zinc-200' : ''
                    )}>
                    {col.key === 'name'
                      ? (() => {
                          const displayName = (row['auction_name'] as string | null) ?? (val as string)
                          const isCaptain   = captainSet.has(row['name'] as string)
                          return (
                            <span className="flex items-center gap-1 max-w-[180px]">
                              {isCaptain && <Crown className="w-2.5 h-2.5 flex-shrink-0 text-amber-400" />}
                              <span className="block truncate">{stripClanTag(displayName ?? '')}</span>
                            </span>
                          )
                        })()
                      : fmtVal(val as any, col.fmt)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  )
}
