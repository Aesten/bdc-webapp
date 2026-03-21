import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { authApi, type MeResponse, type Role } from '@/api/auth'
import { ApiError } from '@/api/client'

interface AuthState {
  user:    MeResponse | null
  loading: boolean
  error:   string | null
}

interface AuthContextValue extends AuthState {
  refresh: () => Promise<void>
  logout:  () => Promise<void>
  isRole:  (...roles: Role[]) => boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true, error: null })

  const refresh = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const user = await authApi.me()
      setState({ user, loading: false, error: null })
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setState({ user: null, loading: false, error: null })
      } else {
        setState({ user: null, loading: false, error: 'Failed to load session' })
      }
    }
  }, [])

  const logout = useCallback(async () => {
    try { await authApi.logout() } catch { /* ignore */ }
    setState({ user: null, loading: false, error: null })
  }, [])

  const isRole = useCallback(
    (...roles: Role[]) => !!state.user && roles.includes(state.user.role),
    [state.user]
  )

  useEffect(() => { refresh() }, [refresh])

  return (
    <AuthContext.Provider value={{ ...state, refresh, logout, isRole }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}