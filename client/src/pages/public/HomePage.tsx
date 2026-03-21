import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { tournamentsApi } from '@/api/tournaments'
import PublicNav from '@/components/PublicNav'
import { Loader2, ChevronRight } from 'lucide-react'

type TournamentEntry = { id: number; name: string; slug: string; description: string | null; status: string }

export default function HomePage() {
  const [tournaments, setTournaments] = useState<TournamentEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    tournamentsApi.listPublic()
      .then(setTournaments)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-zinc-950">
      <PublicNav />

      <main className="px-[5%] py-16 max-w-[50vw]">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-5 h-5 text-zinc-600 animate-spin" />
          </div>
        ) : tournaments.length === 0 ? (
          <div className="py-24 text-center space-y-2">
            <p className="text-3xl font-black text-zinc-700"
              style={{ fontFamily: '"Barlow Condensed", sans-serif' }}>
              Coming soon
            </p>
            <p className="text-sm text-zinc-700">No tournaments available yet.</p>
          </div>
        ) : (
          <div className="space-y-6">
            <h1 className="text-2xl font-black text-zinc-200"
              style={{ fontFamily: '"Barlow Condensed", sans-serif' }}>
              Tournaments
            </h1>
            <div className="space-y-2">
              {tournaments.map(t => (
                <Link key={t.id} to={`/t/${t.slug}`}
                  className="flex items-center justify-between p-4 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors group">
                  <div>
                    <p className="text-sm font-semibold text-zinc-100">{t.name}</p>
                    {t.description && (
                      <p className="text-xs text-zinc-600 mt-0.5">{t.description}</p>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors flex-shrink-0" />
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
