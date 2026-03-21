import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useTitle } from '@/hooks/useTitle'
import { authApi } from '@/api/auth'
import { useAuth } from '@/context/AuthContext'
import { Loader2, AlertCircle } from 'lucide-react'
import logo from '@/assets/logos/bdc_logo_nobg.png'

export default function TokenLogin() {
  useTitle('Join')
  const [searchParams]  = useSearchParams()
  const navigate        = useNavigate()
  const { refresh }     = useAuth()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const token = searchParams.get('t')
    if (!token) { setError('No token provided.'); return }

    async function tryLogin() {
      // Try captain first, then auctioneer
      try {
        await authApi.loginCaptain(token!)
        await refresh()
        navigate('/captain', { replace: true })
        return
      } catch { /* not a captain token */ }

      try {
        await authApi.loginAuctioneer(token!)
        await refresh()
        navigate('/auctioneer', { replace: true })
        return
      } catch { /* not an auctioneer token either */ }

      setError('Invalid or expired token.')
    }

    tryLogin()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-6">
      <img src={logo} alt="BDC" className="h-14 w-auto opacity-80" />
      {error ? (
        <div className="flex items-center gap-2 text-sm text-red-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          Signing in…
        </div>
      )}
    </div>
  )
}
