import { api } from './client'
import type { Captain } from './auctions'

export interface AuctionSession {
  id: number
  auction_id: number
  status: 'pending' | 'live' | 'paused' | 'finished'
  sold_count: number
  skipped_count: number
  half_budget: number   // 0|1
  created_at: string
  started_at: string | null
  finished_at: string | null
}

export interface SessionQueueEntry {
  id: number
  session_id: number
  player_id: number | null
  player_name: string
  queue_position: number
  status: 'pending' | 'active' | 'sold'
  player_classes?: string   // comma-separated, present on activePlayer
}

export interface SessionPurchase {
  id: number
  session_id: number
  captain_id: number
  player_id: number | null
  player_name: string
  price: number
  purchased_at: string
  player_classes: string  // comma-separated: inf,arc,cav
}

export interface SessionBid {
  id: number
  session_id: number
  queue_entry_id: number
  captain_id: number
  captain_name: string
  amount: number
  placed_at: string
}

export interface SessionChatMessage {
  id: number
  session_id: number
  author_role: string
  author_name: string
  content: string
  sent_at: string
}

export interface SessionDetail {
  session:      AuctionSession
  activePlayer: SessionQueueEntry | null
  upcoming:     SessionQueueEntry[]
  purchases:    SessionPurchase[]
  captains:     Array<Captain & { spent: number; remaining: number }>
  progress:     { total: number; sold: number; cycled: number; done: number; playersPerTeam: number; poolRemaining: number }
  auctionName:  string
  minIncrement: number
  bidCooldown:  number
  currentBid:   SessionBid | null
  bidHistory:   SessionBid[]
  chatMessages: SessionChatMessage[]
}

export const sessionsApi = {
  listForAuction: (auctionId: number) =>
    api.get<AuctionSession[]>(`/api/sessions/auction/${auctionId}`),
  get: (id: number) =>
    api.get<SessionDetail>(`/api/sessions/${id}`),
  create: (auctionId: number) =>
    api.post<{ session: AuctionSession; queue: SessionQueueEntry[] }>(`/api/sessions/auction/${auctionId}`),
  goLive: (id: number) =>
    api.post<{ ok: boolean; status: string }>(`/api/sessions/${id}/live`),
  pause: (id: number) =>
    api.post<{ ok: boolean; status: string }>(`/api/sessions/${id}/pause`),
  start: (id: number) =>
    api.post<{ activePlayer: SessionQueueEntry }>(`/api/sessions/${id}/start`),
  advance: (id: number, data: { action: 'sold' | 'skipped'; captain_id?: number; price?: number }) =>
    api.post<{ session: AuctionSession; activePlayer: SessionQueueEntry | null; upcoming: SessionQueueEntry[] }>(`/api/sessions/${id}/advance`, data),
  bid: (id: number, data: { amount: number; captain_id?: number }) =>
    api.post<{ bid: SessionBid }>(`/api/sessions/${id}/bid`, data),
  revokeBid: (id: number, bidId: number) =>
    api.delete<{ ok: boolean }>(`/api/sessions/${id}/bids/${bidId}`),
  chat: (id: number, content: string) =>
    api.post<{ ok: boolean }>(`/api/sessions/${id}/chat`, { content }),
  toggleHalfBudget: (id: number) =>
    api.post<{ ok: boolean; half_budget: number }>(`/api/sessions/${id}/half-budget`),
  assign: (id: number, data: { captain_id: number; player_queue_id: number }) =>
    api.post(`/api/sessions/${id}/assign`, data),
  refund: (id: number, purchaseId: number) =>
    api.post<{ ok: boolean }>(`/api/sessions/${id}/refund`, { purchase_id: purchaseId }),
  getPendingPlayers: (id: number) =>
    api.get<(SessionQueueEntry & { player_classes: string })[]>(`/api/sessions/${id}/pending-players`),
  setActive: (id: number, queueEntryId: number) =>
    api.post<{ ok: boolean }>(`/api/sessions/${id}/set-active`, { queue_entry_id: queueEntryId }),
  finish: (id: number) =>
    api.post<{ ok: boolean }>(`/api/sessions/${id}/finish`),
}