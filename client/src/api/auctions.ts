import { api } from './client'

export interface Captain {
  id:           number
  auction_id:   number
  display_name: string
  team_name:    string | null
  token:        string | null
  budget:       number
  class:        'inf' | 'arc' | 'cav' | null
}

export interface Auction {
  id:                  number
  tournament_id:       number
  name:                string
  min_increment:       number
  bid_cooldown_seconds: number
  is_public:           number
  status:              'setup' | 'ready' | 'finished'
  created_at:          string
}

export interface AuctionResultPlayer {
  id:          number
  player_name: string
  price:       number
}

export interface AuctionResultTeam {
  captain: Captain
  players: AuctionResultPlayer[]
}

export const auctionsApi = {
  listForTournament: (slug: string) =>
    api.get<Auction[]>(`/api/auctions/tournament/${slug}`),
  get: (id: number) =>
    api.get<Auction & { captains: Captain[] }>(`/api/auctions/${id}`),
  create: (slug: string, data: Partial<Auction> & { name: string }) =>
    api.post<Auction>(`/api/auctions/tournament/${slug}`, data),
  update: (id: number, data: Partial<Auction>) =>
    api.patch<Auction>(`/api/auctions/${id}`, data),
  markReady: (id: number) =>
    api.post<{ ok: boolean; status: string }>(`/api/auctions/${id}/ready`),
  markUnready: (id: number) =>
    api.post<{ ok: boolean; status: string }>(`/api/auctions/${id}/unready`),
  delete: (id: number) =>
    api.delete<{ ok: boolean }>(`/api/auctions/${id}`),

  // Captains
  listCaptains: (auctionId: number) =>
    api.get<Captain[]>(`/api/auctions/${auctionId}/captains`),
  addCaptain: (auctionId: number, data: { display_name: string; team_name?: string; budget?: number; class?: 'inf' | 'arc' | 'cav' | null }) =>
    api.post<Captain>(`/api/auctions/${auctionId}/captains`, data),
  updateCaptain: (captainId: number, data: { display_name?: string; team_name?: string | null; budget?: number | null; class?: 'inf' | 'arc' | 'cav' | null }) =>
    api.patch<Captain>(`/api/auctions/captains/${captainId}`, data),
  deleteCaptain: (captainId: number) =>
    api.delete<{ ok: boolean }>(`/api/auctions/captains/${captainId}`),

  getResults: (auctionId: number) =>
    api.get<{ teams: AuctionResultTeam[] }>(`/api/auctions/${auctionId}/results`),

  reopen: (id: number) =>
    api.post<{ ok: boolean }>(`/api/auctions/${id}/reopen`, {}),
  wipe: (id: number) =>
    api.post<{ ok: boolean }>(`/api/auctions/${id}/wipe`, {}),
  removePurchase: (auctionId: number, purchaseId: number) =>
    api.delete<{ ok: boolean }>(`/api/auctions/${auctionId}/purchases/${purchaseId}`),
  addPurchase: (auctionId: number, data: { captain_id: number; player_id: number; price: number }) =>
    api.post<{ ok: boolean }>(`/api/auctions/${auctionId}/purchases`, data),
  getAvailablePlayers: (auctionId: number) =>
    api.get<Array<{ id: number; name: string; classes: string }>>(`/api/auctions/${auctionId}/available-players`),

  renameOwnTeam: (captainId: number, teamName: string) =>
    api.patch<{ ok: boolean; team_name: string }>(`/api/auctions/captains/${captainId}/team-name`, { team_name: teamName }),

  getPublicResults: (auctionId: number) =>
    api.get<{
      auction:    { id: number; name: string }
      tournament: { name: string; slug: string }
      teams:      AuctionResultTeam[]
    }>(`/api/auctions/${auctionId}/results/public`),
}
