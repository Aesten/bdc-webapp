import { List } from 'lucide-react'
import { cn } from '@/lib/utils'
import { type SessionDetail } from '@/api/sessions'

export default function ProgressCard({ progress, captainCount, onOpenPool, className }: {
  progress:     SessionDetail['progress']
  captainCount: number
  onOpenPool?:  () => void
  className?:   string
}) {
  const needed = progress.playersPerTeam * captainCount
  const pct    = needed > 0 ? Math.min(100, (progress.sold / needed) * 100) : 0

  return (
    <div className={cn('bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 flex flex-col justify-center', className)}>
      <div className="flex items-center justify-between text-[10px] font-mono mb-1.5">
        <span className="text-zinc-500 uppercase tracking-widest">Progress</span>
        <span className="text-zinc-300 tabular-nums font-bold">{progress.sold} / {needed}</span>
      </div>
      <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className="h-full bg-amber-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center justify-between text-[10px] font-mono text-zinc-600 mt-1">
        <span>{progress.cycled} skipped</span>
        {onOpenPool ? (
          <button onClick={onOpenPool}
            className="flex items-center gap-1 text-zinc-500 hover:text-amber-400 transition-colors">
            <List className="w-2.5 h-2.5" />
            {progress.poolRemaining} left
          </button>
        ) : (
          <span>{progress.poolRemaining} left</span>
        )}
      </div>
    </div>
  )
}
