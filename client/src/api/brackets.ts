import { api } from './client'

export interface Bracket {
  id:            number
  tournament_id: number
  auction_id:    number | null
  name:          string
  is_public:     number
  created_at:    string
}

export interface Match {
  id:                number
  bracket_id:        number
  round:             number
  match_order:       number
  match_label:       string | null
  captain_a_id:      number | null
  captain_b_id:      number | null
  matchup_id:        number | null
  score_a:           number | null
  score_b:           number | null
  winner_captain_id: number | null
  status:            'pending' | 'played'
  group_label:       string | null
  is_finals:         number
  // Joined fields
  captain_a_name?:   string | null
  team_a_name?:      string | null
  captain_b_name?:   string | null
  team_b_name?:      string | null
  map_name?:         string | null
  map_image?:        string | null
  faction_a_name?:   string | null
  faction_b_name?:   string | null
}

export interface Matchup {
  id:              number
  tournament_id:   number
  bracket_id:      number | null
  round:           number
  label:           string | null
  map_id:          number | null
  faction_a_id:    number | null
  faction_b_id:    number | null
  is_public:       number
  created_at:      string
  // Joined
  map_name?:       string | null
  map_image?:      string | null
  faction_a_name?: string | null
  faction_b_name?: string | null
}

export interface PickBanSession {
  id:             number
  bracket_id:     number
  match_id:       number
  status:         'waiting' | 'banning' | 'picking' | 'complete'
  captain_a_id:   number
  captain_b_id:   number
  map_pool:       string   // JSON number[]
  ban_sequence:   string   // JSON ('a'|'b')[]
  ban_turn:       number
  a_joined:       number
  b_joined:       number
  a_pick:         number | boolean | null   // hidden until revealed
  b_pick:         number | boolean | null
  revealed:       number
  chosen_map_id:  number | null
  created_at:     string
  completed_at:   string | null
}

export interface PickBanMapDetail {
  id:         number
  name:       string
  game_id:    string | null
  image_path: string | null
}

export interface PickBanCaptainDetail {
  id:           number
  display_name: string
  team_name:    string | null
}

export interface PickBanDetail {
  session:   PickBanSession
  bans:      PickBanBan[]
  mapPool:   PickBanMapDetail[]
  captainA:  PickBanCaptainDetail | null
  captainB:  PickBanCaptainDetail | null
  chosenMap: PickBanMapDetail | null
}

export interface PickBanBan {
  id:           number
  session_id:   number
  captain_side: 'a' | 'b'
  map_id:       number
  ban_index:    number
  created_at:   string
  map_name:     string
}

export const bracketsApi = {
  // Brackets
  listForTournament: (slug: string) =>
    api.get<Bracket[]>(`/api/brackets/tournament/${slug}`),

  get: (id: number) =>
    api.get<{ bracket: Bracket; matches: Match[] }>(`/api/brackets/${id}`),

  create: (slug: string, data: { name: string; auction_id?: number }) =>
    api.post<Bracket>(`/api/brackets/tournament/${slug}`, data),

  publish: (id: number)   => api.post<{ ok: boolean }>(`/api/brackets/${id}/publish`),
  unpublish: (id: number) => api.post<{ ok: boolean }>(`/api/brackets/${id}/unpublish`),
  delete: (id: number)    => api.delete<{ ok: boolean }>(`/api/brackets/${id}`),

  reset: (id: number) =>
    api.post<{ ok: boolean }>(`/api/brackets/${id}/reset`),

  generate: (id: number, captainIds: number[], groupSize?: number) =>
    api.post<{ ok: boolean; groups: number[][]; matches: Match[] }>(
      `/api/brackets/${id}/generate`,
      { captain_ids: captainIds, group_size: groupSize }
    ),

  advanceWinner: (matchId: number, winnerCaptainId: number) =>
    api.post<{ ok: boolean }>(`/api/brackets/matches/${matchId}/advance`, { winner_captain_id: winnerCaptainId }),

  confirmResult: (matchId: number) =>
    api.post<{ ok: boolean; status: string }>(`/api/brackets/matches/${matchId}/confirm`),

  overrideResult: (matchId: number, scoreA: number, scoreB: number) =>
    api.patch<Match>(`/api/brackets/matches/${matchId}/result`, { score_a: scoreA, score_b: scoreB }),

  // Matchups
  listMatchups: (slug: string) =>
    api.get<Matchup[]>(`/api/brackets/tournament/${slug}/matchups`),

  rollMatchup: (slug: string, round: number, excludedMapIds: number[], label?: string) =>
    api.post<Matchup>(`/api/brackets/tournament/${slug}/matchups/roll`, {
      round, excluded_map_ids: excludedMapIds, label
    }),

  setMatchup: (slug: string, round: number, mapId: number, factionAId: number, factionBId: number, label?: string) =>
    api.post<Matchup>(`/api/brackets/tournament/${slug}/matchups/manual`, {
      round, map_id: mapId, faction_a_id: factionAId, faction_b_id: factionBId, label
    }),

  publishMatchup: (id: number)   => api.post<{ ok: boolean }>(`/api/brackets/matchups/${id}/publish`),
  unpublishMatchup: (id: number) => api.post<{ ok: boolean }>(`/api/brackets/matchups/${id}/unpublish`),

  patchMatchup: (id: number, data: { map_id?: number | null; faction_a_id?: number | null; faction_b_id?: number | null; label?: string }) =>
    api.patch<Matchup>(`/api/brackets/matchups/${id}`, data),

  // Pick-ban
  getMyPickBan: () =>
    api.get<PickBanDetail | null>('/api/brackets/pickban/mine'),

  createPickBan: (matchId: number, mapPool: number[]) =>
    api.post<PickBanSession>(`/api/brackets/matches/${matchId}/pickban`, { map_pool: mapPool }),

  getPickBan: (id: number) =>
    api.get<PickBanDetail>(`/api/brackets/pickban/${id}`),

  getPickBanByMatch: (matchId: number) =>
    api.get<PickBanDetail>(`/api/brackets/match/${matchId}/pickban`),

  deletePickBan: (id: number) =>
    api.delete<{ ok: boolean }>(`/api/brackets/pickban/${id}`),

  overridePickBan: (id: number, data: { chosen_map_id?: number; a_pick?: number; b_pick?: number }) =>
    api.patch<PickBanDetail>(`/api/brackets/pickban/${id}/override`, data),

  joinPickBan: (id: number) =>
    api.post<{ ok: boolean; status: string }>(`/api/brackets/pickban/${id}/join`),

  ban: (id: number, mapId: number) =>
    api.post<{ ok: boolean; ban_turn: number; status: string; next_side: string | null }>(
      `/api/brackets/pickban/${id}/ban`, { map_id: mapId }
    ),

  pick: (id: number, factionId: number) =>
    api.post<{ ok: boolean; status: string; revealed?: boolean; remaining_map_id?: number; a_faction_id?: number; b_faction_id?: number }>(
      `/api/brackets/pickban/${id}/pick`, { faction_id: factionId }
    ),
}
