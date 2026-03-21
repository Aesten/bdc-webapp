import { type SessionDetail } from '@/api/sessions'
import { ClassBadge, parseClasses } from '@/components/tournament/shared'

// ─── Class badges helper (local to this file) ─────────────────────────────────

function ClassBadges({ classes }: { classes: string }) {
  const list = parseClasses(classes)
  if (!list.length) return null
  return <span className="inline-flex items-center gap-0.5">{list.map(c => <ClassBadge key={c} cls={c} />)}</span>
}

// ─── Upcoming Panel ───────────────────────────────────────────────────────────

export default function UpcomingPanel({ upcoming }: { upcoming: SessionDetail['upcoming'] }) {
  if (!upcoming.length) return null
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      <div className="px-4 py-2 border-b border-zinc-800">
        <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Up next</span>
      </div>
      <div className="divide-y divide-zinc-800/40">
        {upcoming.map((p, i) => (
          <div key={p.id} className="flex items-center gap-2 px-4 py-2">
            <span className="text-[10px] font-mono text-zinc-700 w-3 flex-shrink-0">{i + 1}</span>
            <span className="text-xs text-zinc-400 truncate flex-1">{p.player_name}</span>
            {p.player_classes && <ClassBadges classes={p.player_classes} />}
          </div>
        ))}
      </div>
    </div>
  )
}
