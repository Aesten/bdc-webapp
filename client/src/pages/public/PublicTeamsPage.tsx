import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { auctionsApi, type AuctionResultTeam } from '@/api/auctions'
import PublicNav from '@/components/PublicNav'
import { Loader2, Trophy, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTitle } from '@/hooks/useTitle'

// ─── Team card ────────────────────────────────────────────────────────────────

function TeamCard({ team, index }: { team: AuctionResultTeam; index: number }) {
  const { captain, players } = team
  const label = String.fromCharCode(65 + index)
  const total  = players.reduce((s, p) => s + p.price, 0)
  const budget = captain.budget

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-5 py-4 border-b border-zinc-800/60 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-black text-zinc-100 truncate"
            style={{ fontFamily: '"Barlow Condensed", sans-serif' }}>
            {captain.team_name ?? `Team ${label}`}
          </p>
          <p className="text-xs text-zinc-500 truncate mt-0.5">{captain.display_name}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-mono font-bold text-zinc-300 tabular-nums">
            {(budget - total).toFixed(1)} <span className="text-zinc-600 font-normal">left</span>
          </p>
          <p className="text-[10px] font-mono text-zinc-600">{players.length} players · {total.toFixed(1)} spent</p>
        </div>
      </div>

      {/* Spent bar */}
      <div className="px-5 pt-3 pb-1">
        <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full',
              total / budget > 0.8 ? 'bg-red-500' : total / budget > 0.5 ? 'bg-amber-500' : 'bg-green-500'
            )}
            style={{ width: `${budget > 0 ? Math.min(100, (total / budget) * 100) : 0}%` }}
          />
        </div>
      </div>

      {/* Player list */}
      {players.length > 0 ? (
        <ul className="flex-1 divide-y divide-zinc-800/40 px-1 pb-1">
          {players.map((p, i) => (
            <li key={i} className="flex items-center justify-between px-4 py-2">
              <span className="text-sm text-zinc-300 truncate">{p.player_name}</span>
              <span className="text-xs font-mono text-zinc-500 tabular-nums flex-shrink-0 ml-3">
                {p.price.toFixed(1)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex-1 px-5 py-4 text-sm text-zinc-700 italic">No players drafted</p>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PublicTeamsPage() {
  const { slug, auctionId } = useParams<{ slug: string; auctionId: string }>()

  const [teams,       setTeams]       = useState<AuctionResultTeam[]>([])
  const [auctionName, setAuctionName] = useState('')
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')

  useTitle(auctionName ? `${auctionName} · Teams` : 'Teams')

  useEffect(() => {
    const id = Number(auctionId)
    if (!id) { setError('Invalid auction'); setLoading(false); return }

    auctionsApi.getPublicResults(id)
      .then(r => {
        setTeams(r.teams)
        setAuctionName(r.auction.name)
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Results not available yet'))
      .finally(() => setLoading(false))
  }, [auctionId])

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      <PublicNav extra={
        slug ? (
          <Link to={`/t/${slug}`} className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors">
            ← Tournament
          </Link>
        ) : undefined
      } />

      {/* Header */}
      <div className="border-b border-zinc-800 bg-zinc-900/40">
        <div className="w-full px-[5%] py-6">
          {slug && (
            <div className="flex items-center gap-1.5 text-xs text-zinc-600 mb-2">
              <Link to={`/t/${slug}`} className="hover:text-zinc-400 transition-colors">{slug}</Link>
              <ChevronRight className="w-3 h-3" />
              <span className="text-zinc-400">{auctionName || 'Auction'}</span>
            </div>
          )}
          <div className="flex items-center gap-3">
            <Trophy className="w-6 h-6 text-amber-500 flex-shrink-0" />
            <h1 className="text-2xl font-black text-zinc-100"
              style={{ fontFamily: '"Barlow Condensed", sans-serif' }}>
              {auctionName ? `${auctionName} — Team Compositions` : 'Team Compositions'}
            </h1>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 max-w-5xl mx-auto w-full px-6 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-5 h-5 text-zinc-600 animate-spin" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
            <p className="text-zinc-500 text-sm">{error}</p>
            {slug && (
              <Link to={`/t/${slug}`} className="text-xs text-zinc-600 hover:text-zinc-400 underline underline-offset-2">
                Back to tournament
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {teams.map((t, i) => (
              <TeamCard key={t.captain.id} team={t} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
