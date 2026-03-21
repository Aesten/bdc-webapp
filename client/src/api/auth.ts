import { api } from './client'

export type Role = 'admin' | 'host' | 'auctioneer' | 'captain'

export interface MeResponse {
  role:             Role
  // host
  tournamentId?:    number
  tournamentSlug?:  string
  tournamentName?:  string
  // auctioneer
  projectId?:       number
  projectSlug?:     string
  // captain
  captainId?:       number
  auctionId?:       number
  displayName?:     string
  teamName?:        string | null
  auctionName?:     string
}

export const authApi = {
  me: () => api.get<MeResponse>('/api/auth/me'),

  loginAdmin: (password: string) =>
    api.post<{ ok: boolean; role: Role }>('/api/auth/admin/login', { password }),

  loginHost: (token: string) =>
    api.post<{ ok: boolean; role: Role; tournamentId: number; tournamentSlug: string; tournamentName: string }>(
      '/api/auth/host/login', { token }
    ),

  loginAuctioneer: (token: string) =>
    api.post<{ ok: boolean; role: Role; projectId: number; projectSlug: string }>(
      '/api/auth/auctioneer/login', { token }
    ),

  loginCaptain: (token: string) =>
    api.post<{ ok: boolean; role: Role; captainId: number; auctionId: number; displayName: string }>(
      '/api/auth/captain/login', { token }
    ),

  logout: () => api.post<{ ok: boolean }>('/api/auth/logout'),

  // Admin: featured tournament
  setFeaturedTournament: (tournamentId: number | null) =>
    api.post<{ ok: boolean }>('/api/auth/admin/featured', { tournament_id: tournamentId }),

  // Token management (admin only)
  generateHostToken: (slug: string) =>
    api.post<{ ok: boolean; token: string }>(`/api/auth/tokens/host/${slug}/generate`),

  revokeHostToken: (slug: string) =>
    api.post<{ ok: boolean }>(`/api/auth/tokens/host/${slug}/revoke`),

  generateAuctioneerToken: (slug: string) =>
    api.post<{ ok: boolean; token: string }>(`/api/auth/tokens/auctioneer/${slug}/generate`),

  revokeAuctioneerToken: (slug: string) =>
    api.post<{ ok: boolean }>(`/api/auth/tokens/auctioneer/${slug}/revoke`),

  generateCaptainToken: (captainId: number) =>
    api.post<{ ok: boolean; token: string }>(`/api/auth/tokens/captain/${captainId}/generate`),

  revokeCaptainToken: (captainId: number) =>
    api.post<{ ok: boolean }>(`/api/auth/tokens/captain/${captainId}/revoke`),
}
