import { cn } from '@/lib/utils'

// ─── Budget helpers ───────────────────────────────────────────────────────────

export function getEffectiveBudget(budget: number, halfMode: boolean): number {
  if (!halfMode) return budget
  return Math.floor(budget / 2 * 10) / 10
}

export function getDisplayRemaining(
  cap: { budget: number; spent: number },
  halfMode: boolean
): number {
  return Math.max(0, getEffectiveBudget(cap.budget, halfMode) - cap.spent)
}

// Budget display — in half-budget mode shows effective on top, full in parenthesis below
export function BudgetDisplay({ cap, halfMode }: { cap: { budget: number; spent: number }; halfMode: boolean }) {
  const eff = getDisplayRemaining(cap, halfMode)
  const colorClass = eff === 0 ? 'text-red-400' : eff < 2 ? 'text-amber-400' : 'text-zinc-400'
  if (!halfMode) {
    return <span className={cn('text-[10px] font-mono font-bold flex-shrink-0 tabular-nums', colorClass)}>{eff.toFixed(1)}</span>
  }
  const full = Math.max(0, cap.budget - cap.spent)
  return (
    <div className="flex flex-col items-end flex-shrink-0">
      <span className={cn('text-[10px] font-mono font-bold tabular-nums leading-none', colorClass)}>{eff.toFixed(1)}</span>
      <span className="text-[9px] font-mono text-zinc-600 tabular-nums leading-none">({full.toFixed(1)})</span>
    </div>
  )
}
