import { type ReactNode, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import type { Role } from '@/api/auth'
import { Loader2, LogOut } from 'lucide-react'
import logo from '@/assets/logos/bdc_logo_nobg.png'
import { tournamentsApi } from '@/api/tournaments'

let cachedFeaturedHref: string | null = null

const DASHBOARD: Record<Role, string> = {
  admin:      '/admin',
  host:       '/host',
  auctioneer: '/auctioneer',
  captain:    '/captain',
}

const DASHBOARD_LABEL: Record<Role, string> = {
  admin:      'Dashboard',
  host:       'Dashboard',
  auctioneer: 'Dashboard',
  captain:    'Captain Controls',
}

interface Props {
  extra?: ReactNode
  center?: ReactNode
}

export default function PublicNav({ extra, center }: Props) {
  const { user, loading, logout } = useAuth()
  const navigate = useNavigate()
  const [logoHref, setLogoHref] = useState<string>(cachedFeaturedHref ?? '/')

  async function handleLogout() {
    await logout()
    navigate('/', { replace: true })
  }

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
      <div className="w-full px-[5%] py-3 flex items-center justify-between">
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
            <>
              <Link
                to={DASHBOARD[user.role]}
                className="px-3.5 py-1.5 rounded-lg bg-amber-500 text-black text-xs font-semibold hover:bg-amber-400 transition-colors"
              >
                {DASHBOARD_LABEL[user.role]}
              </Link>
              <button onClick={handleLogout}
                className="flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-300 transition-colors">
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </>
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