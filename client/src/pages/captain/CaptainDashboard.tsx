import { useEffect, useState, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useTitle } from '@/hooks/useTitle'
import { auctionsApi } from '@/api/auctions'
import { sessionsApi, type AuctionSession } from '@/api/sessions'
import { bracketsApi, type PickBanDetail } from '@/api/brackets'
import { LogOut, Loader2, Check } from 'lucide-react'
import logo from '@/assets/logos/bdc_logo_nobg.png'

export default function CaptainDashboard() {
  useTitle('Captain Dashboard')
  const { user, logout, refresh } = useAuth()
  const navigate = useNavigate()

  const [teamName,     setTeamName]     = useState(user?.teamName ?? '')
  const [renameValue,  setRenameValue]  = useState(user?.teamName ?? '')
  const [renameSaving, setRenameSaving] = useState(false)
  const [renameDone,   setRenameDone]   = useState(false)

  const [liveSession, setLiveSession] = useState<AuctionSession | null>(null)
  const [pickBan,     setPickBan]     = useState<PickBanDetail | null | undefined>(undefined)  // undefined = loading
  const [loading,     setLoading]     = useState(true)

  const load = useCallback(async () => {
    if (!user?.auctionId || !user?.captainId) return
    try {
      const [sessions, pb] = await Promise.all([
        sessionsApi.listForAuction(user.auctionId),
        bracketsApi.getMyPickBan(),
      ])
      const live = sessions.find(s => s.status === 'live' || s.status === 'paused') ?? null
      setLiveSession(live)
      setPickBan(pb)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [user?.auctionId, user?.captainId])

  useEffect(() => { load() }, [load])

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  async function handleRename() {
    if (!user?.captainId || !renameValue.trim() || renameSaving) return
    setRenameSaving(true)
    try {
      await auctionsApi.renameOwnTeam(user.captainId, renameValue.trim())
      setTeamName(renameValue.trim())
      await refresh()
      setRenameDone(true)
      setTimeout(() => setRenameDone(false), 2000)
    } catch { /* ignore */ }
    finally { setRenameSaving(false) }
  }

  const pickBanActive = pickBan && pickBan.session.status !== 'complete'

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-zinc-800 px-[5%] py-3 flex items-center justify-between" style={{ backgroundColor: '#212022' }}>
        <Link to="/" className="flex items-center">
          <img src={logo} alt="BDC" className="h-12 w-auto" />
        </Link>
        <div className="flex items-center gap-4">
          <span className="text-xs font-mono text-zinc-500">{user?.displayName}</span>
          <span className="text-[10px] font-mono text-zinc-700 bg-zinc-800 px-2 py-0.5 rounded">captain</span>
          <button onClick={handleLogout}
            className="flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-300 transition-colors">
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-start justify-center px-[5%] py-12">
        {loading ? (
          <Loader2 className="w-5 h-5 text-zinc-600 animate-spin mt-8" />
        ) : (
          <div className="w-full max-w-sm space-y-4">

            {/* Division label */}
            {user?.auctionName && (
              <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-600">
                {user.auctionName}
              </p>
            )}

            {/* Team rename */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
              <p className="text-xs text-zinc-500">
                Your team: <span className="text-zinc-200 font-medium">{teamName || `${user?.displayName}'s team`}</span>
              </p>
              <div className="flex gap-2">
                <input
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleRename()}
                  placeholder="New team name…"
                  className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/40 transition-colors"
                />
                <button
                  onClick={handleRename}
                  disabled={renameSaving || !renameValue.trim() || renameValue.trim() === teamName}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm transition-colors disabled:opacity-40 flex items-center gap-1.5"
                >
                  {renameSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : renameDone ? <Check className="w-3.5 h-3.5 text-green-400" /> : 'Save'}
                </button>
              </div>
            </div>

            {/* Join auction */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <p className="text-xs text-zinc-500 mb-3">Auction</p>
              {liveSession ? (
                <Link
                  to={`/t/${user?.tournamentSlug}/auction/${liveSession.id}`}
                  className="w-full flex items-center justify-center px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold transition-colors"
                >
                  Join Live Auction
                </Link>
              ) : (
                <p className="text-sm text-zinc-600 italic">No live auction at the moment.</p>
              )}
            </div>

            {/* Join finals pick-ban */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <p className="text-xs text-zinc-500 mb-3">Finals</p>
              {pickBanActive ? (
                <Link
                  to={`/pickban/${pickBan!.session.id}`}
                  className="w-full flex items-center justify-center px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors"
                >
                  Join Finals Pick-Ban
                </Link>
              ) : (
                <p className="text-sm text-zinc-600 italic">
                  {pickBan === null ? 'Not a finalist yet.' : 'Pick-ban session complete.'}
                </p>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
