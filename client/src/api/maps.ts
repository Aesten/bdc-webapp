import { api } from './client'

export interface GameMap {
  id:         number
  name:       string
  game_id:    string | null
  tags:       string | null
  image_path: string | null
  is_active:  number
}

export interface Faction {
  id:   number
  name: string
}

export const mapsApi = {
  list: () => api.get<GameMap[]>('/api/maps'),

  create: (name: string, tags?: string, game_id?: string) =>
    api.post<GameMap>('/api/maps', { name, tags, game_id }),

  update: (id: number, data: { name?: string; game_id?: string | null; tags?: string; is_active?: number }) =>
    api.patch<GameMap>(`/api/maps/${id}`, data),

  uploadImage: (id: number, file: File) => {
    const form = new FormData()
    form.append('image', file)
    return api.upload<{ ok: boolean; image_path: string }>(`/api/maps/${id}/image`, form)
  },

  delete: (id: number) => api.delete<{ ok: boolean }>(`/api/maps/${id}`),
}

export const factionsApi = {
  list: () => api.get<Faction[]>('/api/factions'),
}
