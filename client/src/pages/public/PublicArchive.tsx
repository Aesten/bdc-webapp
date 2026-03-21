import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { tournamentsApi } from '@/api/tournaments'
import PublicNav from '@/components/PublicNav'
import { Loader2, FolderOpen, ChevronRight } from 'lucide-react'
import { useTitle } from '@/hooks/useTitle'

type TournamentSummary = {
  id: number; name: string; slug: string
  description: string | null; status: string; created_at: string
}

export default function PublicArchive() {
  useTitle('Tournament Archive')
  const [tournaments, setTournaments] = useState<TournamentSummary[]>([])
  const [loading,     setLoading]     = useState(true)

  useEffect(() => {
    tournamentsApi.listPublic()
      .then(setTournaments)
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-zinc-950">
      <PublicNav />

      <main className="max-w-3xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-black text-zinc-100 mb-1"
            style={{ fontFamily: '"Barlow Condensed", sans-serif' }}>
            All Tournaments
          </h1>
          <p className="text-sm text-zinc-600">Browse past and active tournaments.</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 text-zinc-600 animate-spin" />
          </div>
        ) : tournaments.length === 0 ? (
          <div className="text-center py-24 space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto">
              <FolderOpen className="w-7 h-7 text-zinc-700" />
            </div>
            <p className="text-sm text-zinc-700">No tournaments yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {tournaments.map(t => (
              <Link key={t.id} to={`/t/${t.slug}`}
                className="flex items-center gap-4 p-4 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors group">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-zinc-100 truncate">{t.name}</p>
                    {t.status === 'archived' && (
                      <span className="text-[10px] font-mono text-zinc-600 bg-zinc-800 px-1.5 py-0.5 rounded flex-shrink-0">archived</span>
                    )}
                  </div>
                  {t.description && (
                    <p className="text-xs text-zinc-500 mt-0.5 truncate">{t.description}</p>
                  )}
                  <p className="text-[10px] font-mono text-zinc-700 mt-1">
                    {new Date(t.created_at).toLocaleDateString()}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-700 group-hover:text-zinc-400 transition-colors flex-shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
