import { api } from './client'

export type PlayerClass = 'inf' | 'arc' | 'cav'

export interface Player {
  id:           number
  tournament_id: number
  name:         string
  classes:      string   // comma-separated: inf,arc,cav
  is_available: number
  created_at:   string
}

export const playersApi = {
  listForTournament: (slug: string) =>
    api.get<Player[]>(`/api/players/tournament/${slug}`),
  add: (slug: string, data: { name: string; classes?: string }) =>
    api.post<Player>(`/api/players/tournament/${slug}`, data),
  bulkAdd: (slug: string, players: Array<{ name: string; classes?: string[] | string }>) =>
    api.post<{ ok: boolean; count: number; players: Player[] }>(`/api/players/tournament/${slug}/bulk`, players),
  update: (id: number, data: Partial<Pick<Player, 'name' | 'classes' | 'is_available'>>) =>
    api.patch<Player>(`/api/players/${id}`, data),
  delete: (id: number) =>
    api.delete<{ ok: boolean }>(`/api/players/${id}`),
}
