import { useEffect } from 'react'
import { useNavigate, Outlet, Navigate, Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { LogOut } from 'lucide-react'
import logo from '@/assets/logos/bdc_logo_nobg.png'
import { useTitle } from '@/hooks/useTitle'

export default function HostLayout() {
  useTitle('Host Dashboard')
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (user && user.role === 'host' && !user.tournamentSlug) {
      logout().then(() => navigate('/login', { replace: true }))
    }
  }, [user, logout, navigate])

  if (!user) return null

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  // Admin accessing /host: render outlet without host-specific chrome
  if (user.role === 'admin') return (
    <div className="flex flex-col h-screen bg-zinc-950 overflow-hidden">
      <div className="flex-1 overflow-auto"><Outlet /></div>
    </div>
  )

  if (!user.tournamentSlug) return null

  return (
    <div className="flex flex-col h-screen bg-zinc-950 overflow-hidden">
      {/* Top bar */}
      <div className="flex-shrink-0 border-b border-zinc-800 px-[5%] py-3 flex items-center justify-between" style={{ backgroundColor: '#212022' }}>
        <Link to="/" className="flex items-center">
          <img src={logo} alt="BDC" className="h-12 w-auto" />
        </Link>
        <div className="flex items-center gap-4">
          <span className="text-xs font-mono text-zinc-600">{user.tournamentName ?? user.tournamentSlug}</span>
          <button onClick={handleLogout}
            className="flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-300 transition-colors">
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <Navigate to={`/host/tournaments/${user.tournamentSlug}`} replace />
        <Outlet />
      </div>

    </div>
  )
}
