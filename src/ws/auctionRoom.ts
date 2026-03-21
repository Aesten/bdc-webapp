import { queryAll, queryOne } from '../db/database'
import { verify } from 'hono/jwt'
import { JWT_SECRET } from '../middleware/auth'
import type { AuctionSession, Captain, SessionQueueEntry, LiveBid, WsMessage, JwtPayload } from '../types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Client {
  ws: { send: (data: string) => void }
  role: JwtPayload['role'] | 'public'
  captainId?: number
  captainName?: string
  sessionId: number
}

// ─── In-Memory State ──────────────────────────────────────────────────────────

interface AuctionRoomState {
  sessionId:       number
  halfBudgetActive: boolean   // auctioneer-controlled; when true, caps spending at budget/2
  currentBids:     LiveBid[]
  currentHighest:  LiveBid | null
  cooldownTimer:   Timer | null
  cooldownEndsAt:  number | null
}

const rooms = new Map<number, AuctionRoomState>()

function getOrCreateRoom(sessionId: number): AuctionRoomState {
  if (!rooms.has(sessionId)) {
    rooms.set(sessionId, {
      sessionId,
      halfBudgetActive: true,   // half-budget is on by default; auctioneer lifts it at halftime
      currentBids:      [],
      currentHighest:   null,
      cooldownTimer:    null,
      cooldownEndsAt:   null,
    })
  }
  return rooms.get(sessionId)!
}

const clientsBySession = new Map<number, Set<Client>>()

function getClients(sessionId: number): Set<Client> {
  if (!clientsBySession.has(sessionId)) {
    clientsBySession.set(sessionId, new Set())
  }
  return clientsBySession.get(sessionId)!
}

// ─── Broadcast ────────────────────────────────────────────────────────────────

function broadcast(sessionId: number, msg: WsMessage): void {
  const data    = JSON.stringify(msg)
  const clients = getClients(sessionId)
  clients.forEach((client) => {
    try { client.ws.send(data) } catch { clients.delete(client) }
  })
}

function sendTo(client: Client, msg: WsMessage): void {
  try { client.ws.send(JSON.stringify(msg)) } catch { /* disconnected */ }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function identifyClient(
  token: string | null,
  sessionId: number
): Promise<Pick<Client, 'role' | 'captainId' | 'captainName'>> {
  if (!token) return { role: 'public' }

  try {
    const payload = await verify(token, JWT_SECRET, 'HS256') as unknown as JwtPayload

    if (payload.role === 'captain') {
      const captain = queryOne<Captain>(
        `SELECT c.* FROM captains c
         JOIN auction_sessions s ON s.auction_id = c.auction_id
         WHERE c.id = ? AND s.id = ?`,
        [payload.captainId, sessionId]
      )
      if (!captain) return { role: 'public' }
      return { role: 'captain', captainId: captain.id, captainName: captain.display_name }
    }

    if (payload.role === 'auctioneer') {
      const belongs = queryOne(
        `SELECT 1 FROM auction_sessions s
         JOIN auctions a ON a.id = s.auction_id
         WHERE s.id = ? AND a.project_id = ?`,
        [sessionId, payload.projectId]
      )
      if (!belongs) return { role: 'public' }
      return { role: 'auctioneer' }
    }

    if (payload.role === 'admin') return { role: 'admin' }
    if (payload.role === 'host')  return { role: 'host' }
  } catch {
    // Invalid or expired token — treat as public
  }

  return { role: 'public' }
}

// ─── Message Handlers ─────────────────────────────────────────────────────────

async function handleBid(client: Client, payload: { amount: number }): Promise<void> {
  const { sessionId } = client

  if (client.role !== 'captain' || !client.captainId) {
    sendTo(client, { type: 'error', payload: 'Only captains can bid' })
    return
  }

  const session = queryOne<AuctionSession>(
    'SELECT * FROM auction_sessions WHERE id = ?', [sessionId]
  )
  if (!session || session.status !== 'live') {
    sendTo(client, { type: 'error', payload: 'Session is not live' })
    return
  }

  const room = getOrCreateRoom(sessionId)
  const { currentHighest } = room

  const auctionSettings = queryOne<{ min_increment: number; bid_cooldown_seconds: number }>(
    'SELECT min_increment, bid_cooldown_seconds FROM auctions WHERE id = ?',
    [session.auction_id]
  )
  if (!auctionSettings) return

  // Validate minimum increment
  const minNextBid = currentHighest
    ? currentHighest.amount + auctionSettings.min_increment
    : auctionSettings.min_increment

  if (payload.amount < minNextBid) {
    sendTo(client, { type: 'error', payload: `Minimum bid is ${minNextBid.toFixed(1)}` })
    return
  }

  // Fetch captain's budget
  const captainRow = queryOne<{ budget: number }>(
    'SELECT budget FROM captains WHERE id = ?',
    [client.captainId]
  )
  if (!captainRow) return

  // Apply half-budget rule: when active, effective budget is budget / 2
  const effectiveBudget = room.halfBudgetActive
    ? Math.ceil((captainRow.budget / 2) * 10) / 10   // round UP to nearest 0.1
    : captainRow.budget

  // Fetch amount already spent this session
  const spentRow = queryOne<{ spent: number }>(
    `SELECT COALESCE(SUM(price), 0) as spent FROM session_purchases
     WHERE session_id = ? AND captain_id = ?`,
    [sessionId, client.captainId]
  )
  const spent  = spentRow?.spent ?? 0
  const remaining = effectiveBudget - spent

  if (payload.amount > remaining) {
    const suffix = room.halfBudgetActive ? ' (half budget active)' : ''
    sendTo(client, {
      type:    'error',
      payload: `You only have ${remaining.toFixed(1)}M remaining${suffix}`,
    })
    return
  }

  const bid: LiveBid = {
    captain_id:   client.captainId,
    captain_name: client.captainName!,
    amount:       payload.amount,
    timestamp:    Date.now(),
  }

  room.currentBids.push(bid)
  room.currentHighest = bid

  // Reset cooldown timer
  if (room.cooldownTimer) clearTimeout(room.cooldownTimer)
  const cooldownMs = auctionSettings.bid_cooldown_seconds * 1000
  room.cooldownEndsAt = Date.now() + cooldownMs

  room.cooldownTimer = setTimeout(() => {
    room.cooldownTimer  = null
    room.cooldownEndsAt = null
    broadcast(sessionId, {
      type:    'bidding_cooldown_expired',
      payload: { highest: room.currentHighest },
    })
  }, cooldownMs)

  broadcast(sessionId, {
    type:    'bid_placed',
    payload: { bid, cooldownEndsAt: room.cooldownEndsAt },
  })
}

function handleChat(client: Client, payload: { message: string }): void {
  if (client.role === 'public') {
    sendTo(client, { type: 'error', payload: 'Must be logged in to chat' })
    return
  }

  const message = payload.message.trim().slice(0, 300)
  if (!message) return

  broadcast(client.sessionId, {
    type:    'chat_message',
    payload: {
      author:    client.captainName ?? client.role,
      message,
      timestamp: Date.now(),
    },
  })
}

function handleClearBids(client: Client): void {
  if (!['auctioneer', 'admin'].includes(client.role)) {
    sendTo(client, { type: 'error', payload: 'Only the auctioneer can clear bids' })
    return
  }

  const room = getOrCreateRoom(client.sessionId)
  if (room.cooldownTimer) clearTimeout(room.cooldownTimer)
  room.currentBids    = []
  room.currentHighest = null
  room.cooldownTimer  = null
  room.cooldownEndsAt = null

  broadcast(client.sessionId, { type: 'bids_cleared', payload: null })
}

// Toggle the half-budget restriction on/off.
// Auctioneer calls this when they decide captains should access their full budget.
function handleToggleHalfBudget(client: Client): void {
  if (!['auctioneer', 'admin'].includes(client.role)) {
    sendTo(client, { type: 'error', payload: 'Only the auctioneer can toggle half-budget mode' })
    return
  }

  const room = getOrCreateRoom(client.sessionId)
  room.halfBudgetActive = !room.halfBudgetActive

  broadcast(client.sessionId, {
    type:    'half_budget_changed',
    payload: { halfBudgetActive: room.halfBudgetActive },
  })
}

// ─── WebSocket Lifecycle ──────────────────────────────────────────────────────

const clientById = new Map<string, Client>()
const WS_ID = Symbol('wsId')

function getRaw(ws: object): object {
  return (ws as any).raw ?? ws
}

export async function onWsOpen(
  ws: { send: (data: string) => void },
  sessionId: number,
  token: string | null
): Promise<void> {
  const raw  = getRaw(ws)
  const wsId = crypto.randomUUID();
  (raw as any)[WS_ID] = wsId

  const identity = await identifyClient(token, sessionId)
  const client: Client = { ws: ws as any, sessionId, ...identity }
  getClients(sessionId).add(client)
  clientById.set(wsId, client)

  const room = getOrCreateRoom(sessionId)

  const upcoming = queryAll<SessionQueueEntry>(
    `SELECT * FROM session_queue
     WHERE session_id = ? AND status = 'pending'
     ORDER BY queue_position ASC LIMIT 3`,
    [sessionId]
  )

  const activePlayer = queryOne<SessionQueueEntry>(
    "SELECT * FROM session_queue WHERE session_id = ? AND status = 'active'",
    [sessionId]
  )

  sendTo(client, {
    type:    'room_state',
    payload: {
      role:             client.role,
      captainId:        client.captainId ?? null,
      halfBudgetActive: room.halfBudgetActive,
      currentBids:      room.currentBids,
      currentHighest:   room.currentHighest,
      cooldownEndsAt:   room.cooldownEndsAt,
      activePlayer:     activePlayer ?? null,
      upcoming,
    },
  })

  broadcast(sessionId, {
    type:    'client_joined',
    payload: { count: getClients(sessionId).size },
  })
}

export async function onWsMessage(
  ws: object,
  raw: string
): Promise<void> {
  const wsId   = (getRaw(ws) as any)[WS_ID] as string | undefined
  const client = wsId ? clientById.get(wsId) : undefined
  if (!client) return

  let msg: WsMessage
  try {
    msg = JSON.parse(raw)
  } catch {
    sendTo(client, { type: 'error', payload: 'Invalid message format' })
    return
  }

  switch (msg.type) {
    case 'bid':                 await handleBid(client, msg.payload as { amount: number }); break
    case 'chat':                handleChat(client, msg.payload as { message: string }); break
    case 'clear_bids':          handleClearBids(client); break
    case 'toggle_half_budget':  handleToggleHalfBudget(client); break
    default:
      sendTo(client, { type: 'error', payload: `Unknown message type: ${msg.type}` })
  }
}

export function onWsClose(ws: object): void {
  const wsId   = (getRaw(ws) as any)[WS_ID] as string | undefined
  const client = wsId ? clientById.get(wsId) : undefined
  if (!client) return

  const { sessionId } = client
  const clients = getClients(sessionId)
  clients.delete(client)
  if (wsId) clientById.delete(wsId)

  broadcast(sessionId, {
    type:    'client_left',
    payload: { count: clients.size },
  })

  if (clients.size === 0) {
    const room = rooms.get(sessionId)
    if (room?.cooldownTimer) clearTimeout(room.cooldownTimer)
    rooms.delete(sessionId)
    clientsBySession.delete(sessionId)
  }
}

// ─── Exported broadcast for use in session routes ─────────────────────────────

export function broadcastSessionUpdate(sessionId: number, type: string, payload: unknown): void {
  broadcast(sessionId, { type, payload } as WsMessage)
}
