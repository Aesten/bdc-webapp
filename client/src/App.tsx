import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom'
import { Suspense, lazy, useEffect, useState } from 'react'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { ToastProvider } from '@/context/ToastContext'
import type { Role } from '@/api/auth'
import { tournamentsApi } from '@/api/tournaments'
import { Loader2 } from 'lucide-react'
import TournamentDetail from '@/components/tournament/TournamentDetail'

const Login                = lazy(() => import('@/pages/Login'))

const AdminLogin           = lazy(() => import('@/pages/admin/AdminLogin'))
const AdminDashboard       = lazy(() => import('@/pages/admin/AdminDashboard'))
const HostDashboard        = lazy(() => import('@/pages/host/HostDashboard'))

const CaptainDashboard     = lazy(() => import('@/pages/captain/CaptainDashboard'))
const PickBanPage          = lazy(() => import('@/pages/captain/PickBanPage'))
const AuctioneerDashboard  = lazy(() => import('@/pages/auctioneer/AuctioneerDashboard'))
const HomePage             = lazy(() => import('@/pages/public/HomePage'))
const PublicProjectPage    = lazy(() => import('@/pages/public/PublicProjectPage'))
const PublicArchive        = lazy(() => import('@/pages/public/PublicArchive'))
const PublicTeamsPage      = lazy(() => import('@/pages/public/PublicTeamsPage'))
const AuctionSessionPage   = lazy(() => import('@/pages/auction/AuctionSessionPage'))

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950">
      <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
    </div>
  )
}

// Redirect everyone to the featured tournament; show homepage if none
function RootPage() {
  const { loading } = useAuth()
  const navigate = useNavigate()
  const [featuredSlug, setFeaturedSlug] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    if (loading) return
    tournamentsApi.getFeatured()
      .then(t => setFeaturedSlug(t?.slug ?? null))
      .catch(() => setFeaturedSlug(null))
  }, [loading, navigate])

  useEffect(() => {
    if (featuredSlug) navigate(`/t/${featuredSlug}`, { replace: true })
  }, [featuredSlug, navigate])

  if (loading || featuredSlug === undefined || featuredSlug) return <PageLoader />

  return <HomePage />
}

// Logged-in users going to /login get sent to their dashboard.
// refresh() + navigate() happen here so Login.tsx needs no auth context.
function LoginPage() {
  const { user, loading, refresh } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (loading) return
    if (user) {
      const dest: Record<Role, string> = {
        admin: '/admin', host: '/host', auctioneer: '/auctioneer', captain: '/captain',
      }
      navigate(dest[user.role] ?? '/', { replace: true })
    }
  }, [user, loading, navigate])

  async function handleSuccess() {
    await refresh()
    navigate('/', { replace: true })
  }

  if (loading || user) return <PageLoader />
  return <Login onSuccess={handleSuccess} />
}

function AdminLoginPage() {
  const { refresh } = useAuth()
  const navigate = useNavigate()

  async function handleSuccess() {
    await refresh()
    navigate('/admin', { replace: true })
  }

  return <AdminLogin onSuccess={handleSuccess} />
}

function RequireAuth({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  useEffect(() => {
    if (loading) return
    if (!user || !roles.includes(user.role)) navigate('/login', { replace: true })
  }, [user, loading, navigate, roles])
  if (loading) return <PageLoader />
  if (!user || !roles.includes(user.role)) return null
  return <>{children}</>
}

function HostProjectPage() {
  const { slug } = useParams<{ slug: string }>()
  if (!slug) return null
  return <TournamentDetail slug={slug} />
}

function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Root — redirect to role dashboard or featured tournament */}
        <Route path="/" element={<RootPage />} />

        {/* Public — no auth required */}
        <Route path="/t/:slug/auction/:sessionId" element={<AuctionSessionPage />} />
        <Route path="/t/:slug/teams/:auctionId"   element={<PublicTeamsPage />} />
        <Route path="/t/:slug"                    element={<PublicProjectPage />} />
        <Route path="/archive"                    element={<PublicArchive />} />

        {/* Auth */}
        <Route path="/login"       element={<LoginPage />} />
        <Route path="/admin-login" element={<AdminLoginPage />} />

        {/* Protected */}
        <Route path="/admin/*" element={<RequireAuth roles={['admin']}><AdminDashboard /></RequireAuth>} />

        <Route path="/host" element={<RequireAuth roles={['host', 'admin']}><HostDashboard /></RequireAuth>}>
          <Route path="tournaments/:slug" element={<HostProjectPage />} />
        </Route>

        <Route path="/auctioneer/*" element={<RequireAuth roles={['auctioneer', 'admin']}><AuctioneerDashboard /></RequireAuth>} />
        <Route path="/captain"      element={<RequireAuth roles={['captain']}><CaptainDashboard /></RequireAuth>} />
        <Route path="/pickban/:sessionId" element={<RequireAuth roles={['captain', 'host', 'admin']}><PickBanPage /></RequireAuth>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}