import { type ReactNode, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import type { Role } from '@/api/auth'
import { Loader2 } from 'lucide-react'
import logo from '@/assets/logos/bdc_logo_nobg.png'
import { tournamentsApi } from '@/api/tournaments'

let cachedFeaturedHref: string | null = null

const DASHBOARD: Record<Role, string> = {
  admin:      '/admin',
  host:       '/host',
  auctioneer: '/auctioneer',
  captain:    '/captain',
}

interface Props {
  extra?: ReactNode
  center?: ReactNode
}

export default function PublicNav({ extra, center }: Props) {
  const { user, loading } = useAuth()
  const [logoHref, setLogoHref] = useState<string>(cachedFeaturedHref ?? '/')

  useEffect(() => {
    if (cachedFeaturedHref !== null) return
    tournamentsApi.getFeatured()
      .then(t => {
        cachedFeaturedHref = t ? `/t/${t.slug}` : '/'
        setLogoHref(cachedFeaturedHref)
      })
      .catch(() => { cachedFeaturedHref = '/'; setLogoHref('/') })
  }, [])

  return (
    <header className="relative flex-shrink-0 sticky top-0 z-30 border-b border-zinc-800" style={{ backgroundColor: '#212022' }}>
      <div className="w-full px-[5%] h-14 flex items-center justify-between">
        <Link to={logoHref} className="flex items-center">
          <img src={logo} alt="BDC" className="h-12 w-auto" />
        </Link>

        {center && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="pointer-events-auto">{center}</div>
          </div>
        )}

        <div className="flex items-center gap-3">
          {extra}

          {loading ? (
            <Loader2 className="w-4 h-4 text-zinc-600 animate-spin" />
          ) : user ? (
            <Link
              to={DASHBOARD[user.role]}
              className="px-3.5 py-1.5 rounded-lg bg-amber-500 text-black text-xs font-semibold hover:bg-amber-400 transition-colors"
            >
              Dashboard
            </Link>
          ) : (
            <Link
              to="/login"
              className="px-3.5 py-1.5 rounded-lg bg-zinc-800 text-zinc-200 text-xs font-semibold hover:bg-zinc-700 transition-colors border border-zinc-700"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}