import { api } from './client'

export interface Tournament {
  id:               number
  name:             string
  slug:             string
  description:      string | null
  host_token:       string | null
  auctioneer_token: string | null
  map_pool:         string   // JSON number[] — tournament rolling pool
  finals_map_pool:  string   // JSON number[]
  players_per_team: number
  status:           'active' | 'archived'
  is_featured:      number
  created_at:       string
}

export interface PublicPlayer {
  player_name: string
  classes:     string | null
  price:       number
}

export interface PublicTeam {
  id:          number
  display_name: string
  team_name:   string | null
  total_spent: number
  class:       string | null
  players:     PublicPlayer[]
}

export interface PublicMatchup {
  id:              number
  bracket_id:      number | null
  round:           number
  label:           string | null
  map_name:        string | null
  map_game_id:     string | null
  map_image:       string | null
  faction_a_name:  string | null
  faction_b_name:  string | null
}

export interface PublicMatch {
  id:                number
  bracket_id:        number
  round:             number
  match_order:       number
  match_label:       string | null
  group_label:       string | null
  captain_a_id:      number | null
  captain_b_id:      number | null
  matchup_id:        number | null
  score_a:           number | null
  score_b:           number | null
  winner_captain_id: number | null
  status:            string
  is_finals:         number
  team_a_name:       string | null
  team_b_name:       string | null
}

export interface PublicDivision {
  auction:     { id: number; name: string; status: string }
  liveSession: { id: number; status: string } | null
  teams:       PublicTeam[]
  matches:     PublicMatch[]
  winner:      { team_name: string; captain_name: string } | null
}

export interface PublicTournamentOverview {
  tournament: { id: number; name: string; slug: string; description: string | null }
  divisions:  PublicDivision[]
  matchups:   PublicMatchup[]
}

export const tournamentsApi = {
  list: () => api.get<Tournament[]>('/api/tournaments'),

  get: (slug: string) => api.get<Tournament>(`/api/tournaments/${slug}`),

  create: (data: { name: string; description?: string }) =>
    api.post<Tournament>('/api/tournaments', data),

  update: (slug: string, data: { name?: string; description?: string; status?: 'active' | 'archived'; map_pool?: number[]; finals_map_pool?: number[]; players_per_team?: number }) =>
    api.patch<Tournament>(`/api/tournaments/${slug}`, data),

  delete: (slug: string) => api.delete<{ ok: boolean }>(`/api/tournaments/${slug}`),

  // Public
  getFeatured: () => api.get<{ id: number; name: string; slug: string; description: string | null } | null>('/api/tournaments/public/featured'),

  listPublic: () => api.get<Array<{ id: number; name: string; slug: string; description: string | null; status: string; created_at: string }>>('/api/tournaments/public/list'),

  getPublic: (slug: string) => api.get<PublicTournamentOverview>(`/api/tournaments/public/${slug}`),

  // Stats
  listStats:    () => api.get<number[]>('/api/tournaments/stats'),
  uploadStats:  (auctionId: number, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.upload<{ ok: boolean }>(`/api/tournaments/stats/${auctionId}`, form)
  },
  deleteStats:  (auctionId: number) => api.delete<{ ok: boolean }>(`/api/tournaments/stats/${auctionId}`),
  saveConfig:   (auctionId: number, config: unknown) => api.post<{ ok: boolean }>(`/api/tournaments/stats/${auctionId}/config`, config),
}
