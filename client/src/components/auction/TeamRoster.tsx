import { Undo2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { type SessionDetail } from '@/api/sessions'
import { CLASS_COLOR, CLASS_ICON, parseClasses, type ClassKey } from '@/components/tournament/shared'
import { BudgetDisplay, getDisplayRemaining } from './BudgetHelpers'

// ─── Class helpers ────────────────────────────────────────────────────────────

// Tiny circular class icon for the team card grid
function ClassDot({ cls }: { cls: ClassKey }) {
  const Icon = CLASS_ICON[cls]
  return (
    <span className={cn('inline-flex items-center justify-center w-4 h-4 rounded-full border flex-shrink-0', CLASS_COLOR[cls])}>
      <Icon className="w-2.5 h-2.5" />
    </span>
  )
}

// Three class-column cells (inf | arc | cav) — each shows a dot or is empty
function ClassCols({ active }: { active: ClassKey[] }) {
  return (
    <>
      {(['inf', 'arc', 'cav'] as ClassKey[]).map(cls => (
        <div key={cls} className="flex items-center justify-center">
          {active.includes(cls) && <ClassDot cls={cls} />}
        </div>
      ))}
    </>
  )
}

// Player row columns: name | inf | arc | cav | price (price doubles as refund overlay)
const PLAYER_ROW_COLS = '1fr 1.25rem 1.25rem 1.25rem 2.5rem'

// ─── Mini Team Card (used in 2×4 grid for non-captain view) ──────────────────

export function MiniTeamCard({
  cap, players, playersPerTeam, halfBudget, isMe, onRefund,
}: {
  cap:            SessionDetail['captains'][number]
  players:        SessionDetail['purchases']
  playersPerTeam: number
  halfBudget:     boolean
  isMe:           boolean
  onRefund?:      (purchaseId: number) => void
}) {
  const isFull    = players.length >= playersPerTeam
  const teamLabel = cap.team_name || `${cap.display_name}'s team`

  return (
    <div className={cn(
      'border rounded-xl overflow-hidden flex flex-col min-h-0',
      isFull
        ? 'bg-emerald-950/20 border-emerald-500/30'
        : isMe ? 'bg-zinc-900 border-amber-500/40' : 'bg-zinc-900 border-zinc-800',
    )}>
      {/* Header: team name + counter */}
      <div className={cn(
        'px-2.5 pt-1.5 pb-1 border-b border-zinc-800/60 flex-shrink-0',
        isFull ? 'bg-emerald-500/5' : isMe ? 'bg-amber-500/5' : '',
      )}>
        <div className="flex items-center justify-between gap-1">
          <span className={cn('text-sm font-semibold truncate',
            isFull ? 'text-emerald-300' : isMe ? 'text-amber-300' : 'text-zinc-200')}>
            {teamLabel}
          </span>
          <span className={cn('text-xs font-mono font-bold flex-shrink-0',
            isFull ? 'text-emerald-400' : 'text-zinc-500')}>
            {players.length}/{playersPerTeam}
          </span>
        </div>
      </div>

      {/* Body: captain row + player rows sharing same grid columns */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Captain row */}
        <div className="grid items-center px-2 py-1 gap-x-0.5 border-b border-zinc-700/50"
          style={{ gridTemplateColumns: PLAYER_ROW_COLS }}>
          <span className="text-xs font-semibold text-amber-400/90 truncate">{cap.display_name}</span>
          <ClassCols active={cap.class ? [cap.class as ClassKey] : []} />
          <div className="flex justify-end"><BudgetDisplay cap={cap} halfMode={halfBudget} /></div>
        </div>
        {/* Player rows — price cell doubles as refund overlay on hover */}
        {players.length === 0 ? (
          <p className="px-2.5 py-1.5 text-xs text-zinc-800 italic">—</p>
        ) : players.map((p, i) => (
          <div key={i} className="group/row items-center px-2 py-0.5 hover:bg-zinc-800/40 transition-colors grid gap-x-0.5"
            style={{ gridTemplateColumns: PLAYER_ROW_COLS }}>
            <span className="text-xs text-zinc-400 truncate">{p.player_name}</span>
            <ClassCols active={parseClasses(p.player_classes ?? '')} />
            <div className="relative flex items-center justify-end">
              <span className={cn('text-xs font-mono text-zinc-600 tabular-nums', onRefund && 'group-hover/row:opacity-0 transition-opacity')}>
                {p.price.toFixed(1)}
              </span>
              {onRefund && (
                <button onClick={() => onRefund(p.id)} title="Refund player"
                  className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/row:opacity-100 transition-opacity text-zinc-600 hover:text-red-400">
                  <Undo2 className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Team Grid ────────────────────────────────────────────────────────────────

export function TeamGrid({
  captains, purchases, myCaptainId, halfBudget, playersPerTeam, onRefund, cols = 4, className,
}: {
  captains:       SessionDetail['captains']
  purchases:      SessionDetail['purchases']
  myCaptainId?:  number
  halfBudget:     boolean
  playersPerTeam: number
  onRefund?:      (purchaseId: number) => void
  cols?:          1 | 2 | 4
  className?:     string
}) {
  const gridClass = cols === 1 ? 'grid grid-cols-1 grid-rows-4'
    : cols === 2 ? 'grid grid-cols-2 grid-rows-4'
    : 'grid grid-cols-4 grid-rows-2'
  return (
    <div className={cn(gridClass, 'gap-2', className)}>
      {captains.map(cap => (
        <MiniTeamCard
          key={cap.id}
          cap={cap}
          players={purchases.filter(p => p.captain_id === cap.id)}
          playersPerTeam={playersPerTeam}
          halfBudget={halfBudget}
          isMe={cap.id === myCaptainId}
          onRefund={onRefund}
        />
      ))}
    </div>
  )
}

// ─── Class requirement badge ──────────────────────────────────────────────────

function ClassReqBadge({ cls, required, have }: { cls: ClassKey; required: number; have: number }) {
  const ok   = have >= required
  const Icon = CLASS_ICON[cls]
  return (
    <div className="flex items-center gap-2">
      <span className={cn('inline-flex items-center justify-center w-6 h-6 rounded-md border flex-shrink-0', CLASS_COLOR[cls])}>
        <Icon className="w-3.5 h-3.5" />
      </span>
      <div className="flex flex-col leading-none gap-0.5">
        <span className={cn('text-sm font-bold font-mono tabular-nums', ok ? 'text-green-400' : 'text-red-400')}>
          {have}/{required}
        </span>
        <span className="text-[10px] text-zinc-600 uppercase tracking-wider">{cls}</span>
      </div>
    </div>
  )
}

// ─── My Stats Panel (captain view — budget + class requirements) ──────────────

export function MyStatsPanel({
  captain, players, halfBudget,
}: {
  captain:    SessionDetail['captains'][number]
  players:    SessionDetail['purchases']
  halfBudget: boolean
}) {
  const remaining = getDisplayRemaining(captain, halfBudget)
  const fullRemaining = Math.max(0, captain.budget - captain.spent)

  // Count arc and cav across captain + drafted players
  const capClasses = captain.class ? parseClasses(captain.class) : []
  const playerClasses = players.flatMap(p => parseClasses(p.player_classes ?? ''))
  const allClasses = [...capClasses, ...playerClasses]
  const arcHave = allClasses.filter(c => c === 'arc').length
  const cavHave = allClasses.filter(c => c === 'cav').length

  const remainingColor = remaining === 0 ? 'text-red-400' : remaining < 2 ? 'text-amber-400' : 'text-zinc-100'

  return (
    <div className="flex-none bg-zinc-900 border border-zinc-800 rounded-2xl px-5 py-3 flex items-center gap-6">
      {/* Budget */}
      <div className="flex flex-col leading-none">
        <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-1">Remaining</span>
        <div className="flex items-baseline gap-1.5">
          <span className={cn('text-3xl font-black font-mono tabular-nums', remainingColor)}>
            {remaining.toFixed(1)}
          </span>
          {halfBudget && (
            <span className="text-xs font-mono text-zinc-600">({fullRemaining.toFixed(1)})</span>
          )}
        </div>
      </div>

      <div className="w-px h-10 bg-zinc-700/50 flex-shrink-0" />

      {/* Class requirements */}
      <div className="flex items-center gap-5">
        <ClassReqBadge cls="arc" required={1} have={arcHave} />
        <ClassReqBadge cls="cav" required={2} have={cavHave} />
      </div>
    </div>
  )
}

// ─── My Team Panel (captain view only) ───────────────────────────────────────

export function MyTeamPanel({
  captain, players, playersPerTeam, halfBudget,
}: {
  captain:        SessionDetail['captains'][number]
  players:        SessionDetail['purchases']
  playersPerTeam: number
  halfBudget:     boolean
}) {
  const isFull     = players.length >= playersPerTeam
  const teamLabel  = captain.team_name || `${captain.display_name}'s team`
  const emptySlots = Math.max(0, playersPerTeam - players.length)

  return (
    <div className={cn(
      'flex-none border rounded-2xl overflow-hidden',
      isFull ? 'bg-emerald-950/20 border-emerald-500/30' : 'bg-amber-500/5 border-amber-500/20',
    )}>
      {/* Line 1: "My Team" label + team name + counter */}
      <div className={cn(
        'px-3 pt-2 pb-1 border-b flex-shrink-0',
        isFull ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-amber-500/15',
      )}>
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-xs font-mono uppercase tracking-widest text-zinc-600">My Team</span>
            <span className={cn('text-xs font-semibold truncate',
              isFull ? 'text-emerald-300' : 'text-amber-300')}>
              {teamLabel}
            </span>
          </div>
          <span className={cn('text-xs font-mono font-bold flex-shrink-0',
            isFull ? 'text-emerald-400' : 'text-zinc-500')}>
            {players.length}/{playersPerTeam}
          </span>
        </div>
      </div>
      {/* Body: captain row + player rows sharing same grid columns */}
      <div>
        {/* Captain row */}
        <div className="grid items-center px-3 py-0.5 gap-x-0.5 border-b border-zinc-800/30"
          style={{ gridTemplateColumns: PLAYER_ROW_COLS }}>
          <span className="text-sm text-zinc-500 truncate">{captain.display_name}</span>
          <ClassCols active={captain.class ? [captain.class as ClassKey] : []} />
          <div className="flex justify-end"><BudgetDisplay cap={captain} halfMode={halfBudget} /></div>
        </div>
        {/* Player rows — always renders playersPerTeam rows (empty placeholders for unfilled slots) */}
        {players.map((p, i) => (
          <div key={i} className="grid items-center px-3 py-0.5 gap-x-0.5"
            style={{ gridTemplateColumns: PLAYER_ROW_COLS }}>
            <span className="text-sm text-zinc-300 truncate">{p.player_name}</span>
            <ClassCols active={parseClasses(p.player_classes ?? '')} />
            <span className="text-right text-sm font-mono text-zinc-600 tabular-nums">{p.price.toFixed(1)}</span>
          </div>
        ))}
        {Array.from({ length: emptySlots }).map((_, i) => (
          <div key={`empty-${i}`} className="grid items-center px-3 py-0.5 gap-x-0.5"
            style={{ gridTemplateColumns: PLAYER_ROW_COLS }}>
            <span className="text-sm text-zinc-800 italic select-none">—</span>
            <div /><div /><div />
            <div />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Captain team list (left sidebar for captain view) ───────────────────────

export function CaptainTeamList({
  captains, purchases, halfBudget, playersPerTeam, className,
}: {
  captains:       SessionDetail['captains']
  purchases:      SessionDetail['purchases']
  halfBudget:     boolean
  playersPerTeam: number
  className?:     string
}) {
  return (
    <div className={cn('bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden flex flex-col', className)}>
      <div className="px-3 py-2 border-b border-zinc-800 flex-shrink-0">
        <span className="text-xs font-mono uppercase tracking-widest text-zinc-500">Other Teams</span>
      </div>
      <div className="overflow-y-auto flex-1 divide-y divide-zinc-800/30 min-h-0">
        {captains.map(cap => {
          const players = purchases.filter(p => p.captain_id === cap.id)
          const isFull  = players.length >= playersPerTeam
          const teamLabel = cap.team_name || `${cap.display_name}'s team`
          return (
            <div key={cap.id} className={cn('pt-1.5 pb-1', isFull && 'bg-emerald-500/5')}>
              {/* Team name + counter */}
              <div className="flex items-center justify-between gap-1 px-3 mb-0.5">
                <span className={cn('text-xs font-semibold truncate',
                  isFull ? 'text-emerald-300' : 'text-zinc-200')}>
                  {teamLabel}
                </span>
                <span className={cn('text-xs font-mono font-bold flex-shrink-0',
                  isFull ? 'text-emerald-400' : 'text-zinc-500')}>
                  {players.length}/{playersPerTeam}
                </span>
              </div>
              {/* Captain row + player rows sharing same grid */}
              <div className="grid items-center px-3 py-0.5 gap-x-0.5 border-b border-zinc-800/20"
                style={{ gridTemplateColumns: PLAYER_ROW_COLS }}>
                <span className="text-xs text-zinc-500 truncate">{cap.display_name}</span>
                <ClassCols active={cap.class ? [cap.class as ClassKey] : []} />
                <div className="flex justify-end"><BudgetDisplay cap={cap} halfMode={halfBudget} /></div>
              </div>
              {players.map((p, i) => (
                <div key={i} className="grid items-center px-3 py-px gap-x-0.5"
                  style={{ gridTemplateColumns: PLAYER_ROW_COLS }}>
                  <span className="text-xs text-zinc-500 truncate">{p.player_name}</span>
                  <ClassCols active={parseClasses(p.player_classes ?? '')} />
                  <span className="text-right text-xs font-mono text-zinc-700 tabular-nums">{p.price.toFixed(1)}</span>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
