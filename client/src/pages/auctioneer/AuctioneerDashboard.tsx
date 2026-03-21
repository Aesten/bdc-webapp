import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { LogOut } from 'lucide-react'
import TournamentDetail from '@/components/tournament/TournamentDetail'
import logo from '@/assets/logos/bdc_logo_nobg.png'
import { useTitle } from '@/hooks/useTitle'

export default function AuctioneerShell() {
  useTitle('Auctioneer Dashboard')
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex flex-col h-screen bg-zinc-950 overflow-hidden">
      {/* Top bar */}
      <div className="flex-shrink-0 border-b border-zinc-800 px-[5%] py-3 flex items-center justify-between" style={{ backgroundColor: '#212022' }}>
        <Link to="/" className="flex items-center">
          <img src={logo} alt="BDC" className="h-12 w-auto" />
        </Link>
        <div className="flex items-center gap-4">
          <span className="text-xs font-mono text-zinc-600">{user?.projectSlug}</span>
          <span className="text-[10px] font-mono text-zinc-700 bg-zinc-800 px-2 py-0.5 rounded">auctioneer</span>
          <button onClick={handleLogout}
            className="flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-300 transition-colors">
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {user?.projectSlug
          ? <TournamentDetail slug={user.projectSlug} roleOverride="auctioneer" />
          : (
            <div className="flex items-center justify-center h-full text-zinc-700">
              <p className="text-sm">No project assigned to this token.</p>
            </div>
          )
        }
      </div>
    </div>
  )
}
