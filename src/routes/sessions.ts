import { Hono } from 'hono'
import { queryAll, queryOne, execute, transaction, getDb } from '../db/database'
import { requireAuth, type AuthEnv } from '../middleware/auth'
import type { Auction, AuctionSession, Captain, Player, SessionQueueEntry, SessionPurchase, SessionBid, SessionChatMessage, HostJwtPayload, CaptainJwtPayload } from '../types'
import { broadcastSessionUpdate } from '../ws/auctionRoom'

function notify(sessionId: number) {
  broadcastSessionUpdate(sessionId, 'session_updated', null)
}

const sessions = new Hono<AuthEnv>()

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

type AuctionVerifyResult =
  | { auction: Auction }
  | { error: string; status: number }

function getAuctionAndVerify(
  auctionId: number,
  auth: AuthEnv['Variables']['auth']
): AuctionVerifyResult {
  const auction = queryOne<Auction>('SELECT * FROM auctions WHERE id = ?', [auctionId])
  if (!auction) return { error: 'Auction not found', status: 404 }

  if (auth.role === 'host') {
    const row = queryOne<{ tournament_id: number }>(
      'SELECT tournament_id FROM auctions WHERE id = ?', [auctionId]
    )
    const tournament = queryOne<{ id: number }>(
      'SELECT id FROM tournaments WHERE id = ?', [row?.tournament_id ?? 0]
    )
    if (!tournament || tournament.id !== (auth as HostJwtPayload).tournamentId) {
      return { error: 'Forbidden', status: 403 }
    }
  }

  if (auth.role === 'auctioneer') {
    const row = queryOne<{ tournament_id: number }>(
      'SELECT tournament_id FROM auctions WHERE id = ?', [auctionId]
    )
    if (!row || row.tournament_id !== auth.projectId) {
      return { error: 'Forbidden', status: 403 }
    }
  }

  if (auth.role === 'captain') {
    if ((auth as CaptainJwtPayload).auctionId !== auctionId) {
      return { error: 'Forbidden', status: 403 }
    }
  }

  return { auction }
}

function getUpcoming(sessionId: number): (SessionQueueEntry & { player_classes: string })[] {
  return queryAll<SessionQueueEntry & { player_classes: string }>(
    `SELECT sq.*, COALESCE(p.classes, '') as player_classes
     FROM session_queue sq
     LEFT JOIN players p ON p.id = sq.player_id
     WHERE sq.session_id = ? AND sq.status = 'pending'
     ORDER BY sq.queue_position ASC LIMIT 3`,
    [sessionId]
  )
}

// ─── List Sessions for an Auction ─────────────────────────────────────────────

sessions.get('/auction/:auctionId', requireAuth('admin', 'host', 'auctioneer', 'captain'), async (c) => {
  const auth = c.get('auth')
  const auctionId = Number(c.req.param('auctionId'))

  const result = getAuctionAndVerify(auctionId, auth)
  if ('error' in result) return c.json({ error: result.error }, result.status as any)

  return c.json(queryAll<AuctionSession>(
    'SELECT * FROM auction_sessions WHERE auction_id = ? ORDER BY created_at DESC',
    [auctionId]
  ))
})

// ─── Get Session Detail ───────────────────────────────────────────────────────

sessions.get('/:id', requireAuth('admin', 'host', 'auctioneer', 'captain'), async (c) => {
  const auth = c.get('auth')
  const id = Number(c.req.param('id'))

  const session = queryOne<AuctionSession>(
    'SELECT * FROM auction_sessions WHERE id = ?', [id]
  )
  if (!session) return c.json({ error: 'Session not found' }, 404)

  if (auth.role === 'captain' && session.auction_id !== auth.auctionId) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const activePlayer = queryOne<SessionQueueEntry & { player_classes: string }>(
    `SELECT sq.*, COALESCE(p.classes, '') as player_classes
     FROM session_queue sq
     LEFT JOIN players p ON p.id = sq.player_id
     WHERE sq.session_id = ? AND sq.status = 'active'`,
    [id]
  )
  const upcoming = getUpcoming(id)
  const captains = queryAll<Captain & { spent: number; remaining: number }>(
    `SELECT c.*,
       COALESCE(SUM(sp.price), 0) as spent,
       c.budget - COALESCE(SUM(sp.price), 0) as remaining
     FROM captains c
     LEFT JOIN session_purchases sp ON sp.captain_id = c.id AND sp.session_id = ?
     WHERE c.auction_id = ?
     GROUP BY c.id`,
    [id, session.auction_id]
  )

  const totalInQueue = queryOne<{ count: number }>(
    'SELECT COUNT(*) as count FROM session_queue WHERE session_id = ?', [id]
  )

  const auctionMeta = queryOne<{ min_increment: number; bid_cooldown_seconds: number; name: string }>(
    'SELECT min_increment, bid_cooldown_seconds, name FROM auctions WHERE id = ?', [session.auction_id]
  )

  const tournament = queryOne<{ players_per_team: number }>(
    `SELECT t.players_per_team FROM tournaments t
     JOIN auctions a ON a.tournament_id = t.id WHERE a.id = ?`,
    [session.auction_id]
  )

  // Enrich purchases with player_classes via join
  const richPurchases = queryAll<SessionPurchase & { player_classes: string }>(
    `SELECT sp.*, COALESCE(p.classes, '') as player_classes
     FROM session_purchases sp
     LEFT JOIN players p ON p.id = sp.player_id
     WHERE sp.session_id = ? ORDER BY sp.purchased_at ASC`,
    [id]
  )

  const poolRemaining = queryOne<{ count: number }>(
    "SELECT COUNT(*) as count FROM session_queue WHERE session_id = ? AND status IN ('pending', 'active')",
    [id]
  )

  // Bid state for active player
  const topBid = activePlayer
    ? queryOne<SessionBid>(
        `SELECT * FROM session_bids
         WHERE session_id = ? AND queue_entry_id = ?
         ORDER BY placed_at DESC LIMIT 1`,
        [id, activePlayer.id]
      )
    : null

  const bidHistory = activePlayer
    ? queryAll<SessionBid>(
        `SELECT * FROM session_bids
         WHERE session_id = ? AND queue_entry_id = ?
         ORDER BY placed_at ASC`,
        [id, activePlayer.id]
      )
    : []

  const chatMessages = queryAll<SessionChatMessage>(
    `SELECT * FROM session_chat WHERE session_id = ? ORDER BY sent_at ASC LIMIT 100`,
    [id]
  )

  return c.json({
    session,
    activePlayer: activePlayer ?? null,
    upcoming,
    purchases: richPurchases,
    captains,
    progress: {
      total:          totalInQueue?.count ?? 0,
      sold:           session.sold_count,
      cycled:         session.skipped_count,
      done:           session.sold_count + session.skipped_count,
      playersPerTeam: tournament?.players_per_team ?? 0,
      poolRemaining:  poolRemaining?.count ?? 0,
    },
    auctionName:   auctionMeta?.name ?? '',
    minIncrement:  auctionMeta?.min_increment ?? 0.1,
    bidCooldown:   auctionMeta?.bid_cooldown_seconds ?? 3,
    currentBid:    topBid ?? null,
    bidHistory,
    chatMessages,
  })
})

// ─── Create Session ───────────────────────────────────────────────────────────

sessions.post('/auction/:auctionId', requireAuth('admin', 'host', 'auctioneer'), async (c) => {
  const auth = c.get('auth')
  const auctionId = Number(c.req.param('auctionId'))

  const result = getAuctionAndVerify(auctionId, auth)
  if ('error' in result) return c.json({ error: result.error }, result.status as any)

  const { auction } = result

  if (auction.status === 'setup') {
    return c.json({ error: 'Auction must be marked ready before starting a session' }, 409)
  }

  const activeSession = queryOne<{ id: number }>(
    `SELECT s.id FROM auction_sessions s
     JOIN auctions a ON a.id = s.auction_id
     WHERE a.tournament_id = ? AND s.status IN ('pending', 'live', 'paused')
     LIMIT 1`,
    [auction.tournament_id]
  )
  if (activeSession) {
    return c.json({ error: 'Another auction session is already active for this tournament' }, 409)
  }

  const available = queryAll<Player>(
    'SELECT * FROM players WHERE tournament_id = ? AND is_available = 1',
    [auction.tournament_id]
  )
  if (available.length === 0) {
    return c.json({ error: 'No available players in the pool' }, 409)
  }

  const shuffled = shuffle(available)

  const sessionId = transaction(() => {
    execute('INSERT INTO auction_sessions (auction_id) VALUES (?)', [auctionId])

    const session = queryOne<AuctionSession>(
      'SELECT * FROM auction_sessions WHERE auction_id = ? ORDER BY id DESC LIMIT 1',
      [auctionId]
    )!

    const insertQueue = getDb().prepare(
      `INSERT INTO session_queue (session_id, player_id, player_name, queue_position)
       VALUES (?, ?, ?, ?)`
    )
    shuffled.forEach((player, i) => {
      insertQueue.run(session.id, player.id, player.name, i)
    })

    return session.id
  })

  const session = queryOne<AuctionSession>(
    'SELECT * FROM auction_sessions WHERE id = ?', [sessionId]
  )
  const upcoming = getUpcoming(sessionId)

  return c.json({ session, upcoming }, 201)
})

// ─── Go Live ──────────────────────────────────────────────────────────────────

sessions.post('/:id/live', requireAuth('admin', 'auctioneer'), async (c) => {
  const auth = c.get('auth')
  const id = Number(c.req.param('id'))

  const session = queryOne<AuctionSession>(
    'SELECT * FROM auction_sessions WHERE id = ?', [id]
  )
  if (!session) return c.json({ error: 'Session not found' }, 404)

  if (!['pending', 'paused'].includes(session.status)) {
    return c.json({ error: `Cannot go live from status: ${session.status}` }, 409)
  }

  const tournamentRow = queryOne<{ tournament_id: number }>(
    'SELECT tournament_id FROM auctions WHERE id = ?', [session.auction_id]
  )
  const conflicting = tournamentRow ? queryOne<{ id: number }>(
    `SELECT s.id FROM auction_sessions s
     JOIN auctions a ON a.id = s.auction_id
     WHERE a.tournament_id = ? AND s.status = 'live' AND s.id != ?
     LIMIT 1`,
    [tournamentRow.tournament_id, id]
  ) : null
  if (conflicting) {
    return c.json({ error: 'Another auction session is already live for this tournament' }, 409)
  }

  if (auth.role === 'auctioneer') {
    const row = queryOne<{ tournament_id: number }>(
      'SELECT tournament_id FROM auctions WHERE id = ?', [session.auction_id]
    )
    if (!row || row.tournament_id !== auth.projectId) {
      return c.json({ error: 'Forbidden' }, 403)
    }
  }

  execute(
    `UPDATE auction_sessions SET
      status     = 'live',
      started_at = COALESCE(started_at, ?)
     WHERE id = ?`,
    [new Date().toISOString(), id]
  )
  notify(id)
  return c.json({ ok: true, status: 'live' })
})

// ─── Pause Session ────────────────────────────────────────────────────────────

sessions.post('/:id/pause', requireAuth('admin', 'host', 'auctioneer'), async (c) => {
  const auth = c.get('auth')
  const id = Number(c.req.param('id'))

  const session = queryOne<AuctionSession>(
    'SELECT * FROM auction_sessions WHERE id = ?', [id]
  )
  if (!session) return c.json({ error: 'Session not found' }, 404)
  if (session.status !== 'live') return c.json({ error: 'Session is not live' }, 409)

  if (auth.role === 'host' || auth.role === 'auctioneer') {
    const row = queryOne<{ tournament_id: number }>(
      'SELECT tournament_id FROM auctions WHERE id = ?', [session.auction_id]
    )
    const tournamentId = auth.role === 'host'
      ? (auth as HostJwtPayload).tournamentId
      : auth.projectId
    if (!row || row.tournament_id !== tournamentId) {
      return c.json({ error: 'Forbidden' }, 403)
    }
  }

  execute("UPDATE auction_sessions SET status = 'paused' WHERE id = ?", [id])
  notify(id)
  return c.json({ ok: true, status: 'paused' })
})

// ─── Advance Queue ────────────────────────────────────────────────────────────

sessions.post('/:id/advance', requireAuth('admin', 'auctioneer'), async (c) => {
  const id = Number(c.req.param('id'))

  const session = queryOne<AuctionSession>(
    'SELECT * FROM auction_sessions WHERE id = ?', [id]
  )
  if (!session) return c.json({ error: 'Session not found' }, 404)
  if (session.status !== 'live') return c.json({ error: 'Session is not live' }, 409)

  const data = await c.req.json<{
    action: 'sold' | 'skipped'
    captain_id?: number
    price?: number
  }>()

  let captainId: number
  let price: number

  if (data.action === 'sold') {
    if (data.captain_id != null && data.price != null) {
      // Explicit override from auctioneer
      if (data.price < 0) return c.json({ error: 'Price cannot be negative' }, 400)
      // Budget check for override
      const overrideCap = queryOne<Captain>('SELECT * FROM captains WHERE id = ? AND auction_id = ?', [data.captain_id, session.auction_id])
      if (overrideCap) {
        const spentRow = queryOne<{ spent: number }>(
          'SELECT COALESCE(SUM(price), 0) as spent FROM session_purchases WHERE session_id = ? AND captain_id = ?',
          [id, data.captain_id]
        )
        const spent = spentRow?.spent ?? 0
        const effectiveBudget = session.half_budget
          ? Math.floor(overrideCap.budget / 2 * 10) / 10
          : overrideCap.budget
        const remaining = Math.max(0, effectiveBudget - spent)
        if (data.price > remaining + 0.001) {
          return c.json({ error: `Price of ${data.price.toFixed(1)} exceeds captain's remaining budget of ${remaining.toFixed(1)}` }, 400)
        }
      }
      captainId = data.captain_id
      price = data.price
    } else {
      // Use top bid
      const activeEntryForBid = queryOne<SessionQueueEntry>(
        "SELECT * FROM session_queue WHERE session_id = ? AND status = 'active'", [id]
      )
      const topBid = activeEntryForBid
        ? queryOne<SessionBid>(
            `SELECT * FROM session_bids
             WHERE session_id = ? AND queue_entry_id = ?
             ORDER BY placed_at DESC LIMIT 1`,
            [id, activeEntryForBid.id]
          )
        : null
      if (!topBid) return c.json({ error: 'No bid placed — provide captain_id and price for manual sale' }, 409)
      captainId = topBid.captain_id
      price = topBid.amount
    }
  } else {
    captainId = 0
    price = 0
  }

  const activeEntry = queryOne<SessionQueueEntry>(
    "SELECT * FROM session_queue WHERE session_id = ? AND status = 'active'", [id]
  )
  if (!activeEntry) return c.json({ error: 'No player is currently active' }, 409)

  transaction(() => {
    if (data.action === 'sold') {
      execute("UPDATE session_queue SET status = 'sold' WHERE id = ?", [activeEntry.id])
      execute(
        `INSERT INTO session_purchases
          (session_id, captain_id, player_id, player_name, price)
         VALUES (?, ?, ?, ?, ?)`,
        [id, captainId, activeEntry.player_id, activeEntry.player_name, price]
      )
      if (activeEntry.player_id) {
        execute("UPDATE players SET is_available = 0 WHERE id = ?", [activeEntry.player_id])
      }
      execute('UPDATE auction_sessions SET sold_count = sold_count + 1 WHERE id = ?', [id])
    } else {  // skipped
      const maxPos = queryOne<{ max: number }>(
        'SELECT MAX(queue_position) as max FROM session_queue WHERE session_id = ?', [id]
      )!
      execute(
        "UPDATE session_queue SET status = 'pending', queue_position = ? WHERE id = ?",
        [maxPos.max + 1, activeEntry.id]
      )
      execute('UPDATE auction_sessions SET skipped_count = skipped_count + 1 WHERE id = ?', [id])
    }

    const next = queryOne<SessionQueueEntry>(
      `SELECT * FROM session_queue
       WHERE session_id = ? AND status = 'pending'
       ORDER BY queue_position ASC LIMIT 1`,
      [id]
    )

    if (next) {
      execute("UPDATE session_queue SET status = 'active' WHERE id = ?", [next.id])
    }
    // No auto-finish — auctioneer must call POST /:id/finish explicitly
  })

  const updatedSession = queryOne<AuctionSession>(
    'SELECT * FROM auction_sessions WHERE id = ?', [id]
  )
  const activeNow = queryOne<SessionQueueEntry>(
    "SELECT * FROM session_queue WHERE session_id = ? AND status = 'active'", [id]
  )
  const upcoming = getUpcoming(id)

  notify(id)
  return c.json({
    session: updatedSession,
    activePlayer: activeNow ?? null,
    upcoming,
  })
})

// ─── Start First Player ───────────────────────────────────────────────────────

sessions.post('/:id/start', requireAuth('admin', 'auctioneer'), async (c) => {
  const id = Number(c.req.param('id'))

  const session = queryOne<AuctionSession>(
    'SELECT * FROM auction_sessions WHERE id = ?', [id]
  )
  if (!session) return c.json({ error: 'Session not found' }, 404)
  if (session.status !== 'live') return c.json({ error: 'Session is not live' }, 409)

  const alreadyActive = queryOne(
    "SELECT id FROM session_queue WHERE session_id = ? AND status = 'active'", [id]
  )
  if (alreadyActive) return c.json({ error: 'A player is already active' }, 409)

  const first = queryOne<SessionQueueEntry>(
    `SELECT * FROM session_queue
     WHERE session_id = ? AND status = 'pending'
     ORDER BY queue_position ASC LIMIT 1`,
    [id]
  )
  if (!first) return c.json({ error: 'No players in queue' }, 409)

  execute("UPDATE session_queue SET status = 'active' WHERE id = ?", [first.id])
  notify(id)
  return c.json({
    activePlayer: { ...first, status: 'active' },
    upcoming: getUpcoming(id),
  })
})

// ─── Get Purchases for a Session ──────────────────────────────────────────────

sessions.get('/:id/purchases', requireAuth('admin', 'host', 'auctioneer', 'captain'), async (c) => {
  const id = Number(c.req.param('id'))

  const session = queryOne<AuctionSession>(
    'SELECT * FROM auction_sessions WHERE id = ?', [id]
  )
  if (!session) return c.json({ error: 'Session not found' }, 404)

  return c.json(queryAll(
    `SELECT sp.*, c.display_name as captain_name, c.team_name
     FROM session_purchases sp
     JOIN captains c ON c.id = sp.captain_id
     WHERE sp.session_id = ?
     ORDER BY sp.purchased_at ASC`,
    [id]
  ))
})

// ─── Place Bid ────────────────────────────────────────────────────────────────

sessions.post('/:id/bid', requireAuth('admin', 'auctioneer', 'captain'), async (c) => {
  const auth = c.get('auth')
  const id = Number(c.req.param('id'))

  const session = queryOne<AuctionSession>('SELECT * FROM auction_sessions WHERE id = ?', [id])
  if (!session) return c.json({ error: 'Session not found' }, 404)
  if (session.status !== 'live') return c.json({ error: 'Session is not live' }, 409)

  if (auth.role === 'captain' && session.auction_id !== auth.auctionId) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const activeEntry = queryOne<SessionQueueEntry>(
    "SELECT * FROM session_queue WHERE session_id = ? AND status = 'active'", [id]
  )
  if (!activeEntry) return c.json({ error: 'No player is currently up for auction' }, 409)

  const data = await c.req.json<{ captain_id?: number; amount: number }>()

  // Resolve captain
  let bidCaptainId: number
  if (auth.role === 'captain') {
    bidCaptainId = auth.captainId
  } else {
    if (data.captain_id == null) return c.json({ error: 'captain_id required' }, 400)
    bidCaptainId = data.captain_id
  }

  const captain = queryOne<Captain>(
    'SELECT * FROM captains WHERE id = ? AND auction_id = ?', [bidCaptainId, session.auction_id]
  )
  if (!captain) return c.json({ error: 'Captain not found' }, 404)

  const auction = queryOne<{ min_increment: number }>(
    'SELECT min_increment FROM auctions WHERE id = ?', [session.auction_id]
  )
  const minIncrement = auction?.min_increment ?? 0.1

  const { amount } = data

  // Budget check: session_purchases only changes on advance/sell, not during concurrent bids,
  // so this is safe to validate outside the transaction.
  if (auth.role === 'captain') {
    const spentRow = queryOne<{ spent: number }>(
      'SELECT COALESCE(SUM(price), 0) as spent FROM session_purchases WHERE session_id = ? AND captain_id = ?',
      [id, bidCaptainId]
    )
    const spent = spentRow?.spent ?? 0
    const effectiveBudget = session.half_budget
      ? Math.floor(captain.budget / 2 * 10) / 10
      : captain.budget
    const remaining = Math.max(0, effectiveBudget - spent)
    if (amount > remaining + 0.001) {
      return c.json({
        error: `Bid of ${amount.toFixed(1)} exceeds your remaining budget of ${remaining.toFixed(1)}`,
      }, 400)
    }
  } else {
    if (amount < 0) return c.json({ error: 'Bid amount cannot be negative' }, 400)
  }

  // Atomic read-validate-write: re-read topBid, validate the floor, and insert in one transaction.
  // Because the transaction callback is synchronous and JS is single-threaded, two concurrent
  // requests cannot interleave here — the second one will see the first bid already committed
  // and correctly fail the floor check.
  const captainName = captain.display_name
  let bidError: string | null = null
  let newBid: SessionBid | null = null

  transaction(() => {
    const topBid = queryOne<SessionBid>(
      `SELECT * FROM session_bids WHERE session_id = ? AND queue_entry_id = ?
       ORDER BY placed_at DESC LIMIT 1`,
      [id, activeEntry.id]
    )

    if (auth.role === 'captain') {
      const floor = topBid ? topBid.amount + minIncrement : minIncrement
      if (amount < floor - 0.001) {
        bidError = topBid
          ? `Bid must be at least ${floor.toFixed(1)} (current: ${topBid.amount.toFixed(1)})`
          : `Minimum bid is ${minIncrement.toFixed(1)}`
        return   // exit callback without inserting; transaction commits as a no-op
      }
    }

    execute(
      `INSERT INTO session_bids (session_id, queue_entry_id, captain_id, captain_name, amount)
       VALUES (?, ?, ?, ?, ?)`,
      [id, activeEntry.id, bidCaptainId, captainName, amount]
    )

    newBid = queryOne<SessionBid>(
      `SELECT * FROM session_bids WHERE session_id = ? AND queue_entry_id = ?
       ORDER BY placed_at DESC LIMIT 1`,
      [id, activeEntry.id]
    )
  })

  if (bidError) return c.json({ error: bidError }, 400)
  notify(id)
  return c.json({ bid: newBid })
})

// ─── Revoke Bid ───────────────────────────────────────────────────────────────

sessions.delete('/:id/bids/:bidId', requireAuth('admin', 'host', 'auctioneer'), (c) => {
  const auth   = c.get('auth')
  const id     = Number(c.req.param('id'))
  const bidId  = Number(c.req.param('bidId'))

  const session = queryOne<AuctionSession>('SELECT * FROM auction_sessions WHERE id = ?', [id])
  if (!session) return c.json({ error: 'Session not found' }, 404)
  if (session.status === 'finished') return c.json({ error: 'Session is finished' }, 409)

  if (auth.role === 'host') {
    const row = queryOne<{ tournament_id: number }>(
      'SELECT tournament_id FROM auctions WHERE id = ?', [session.auction_id]
    )
    if (!row || row.tournament_id !== (auth as HostJwtPayload).tournamentId) {
      return c.json({ error: 'Forbidden' }, 403)
    }
  }
  if (auth.role === 'auctioneer') {
    const row = queryOne<{ tournament_id: number }>(
      'SELECT tournament_id FROM auctions WHERE id = ?', [session.auction_id]
    )
    if (!row || row.tournament_id !== auth.projectId) {
      return c.json({ error: 'Forbidden' }, 403)
    }
  }

  const bid = queryOne<SessionBid>('SELECT * FROM session_bids WHERE id = ? AND session_id = ?', [bidId, id])
  if (!bid) return c.json({ error: 'Bid not found' }, 404)

  execute('DELETE FROM session_bids WHERE id = ?', [bidId])
  notify(id)
  return c.json({ ok: true })
})

// ─── Post Chat Message ─────────────────────────────────────────────────────────

sessions.post('/:id/chat', requireAuth('admin', 'host', 'auctioneer', 'captain'), async (c) => {
  const auth = c.get('auth')
  const id = Number(c.req.param('id'))

  const session = queryOne<AuctionSession>('SELECT * FROM auction_sessions WHERE id = ?', [id])
  if (!session) return c.json({ error: 'Session not found' }, 404)

  if (auth.role === 'captain' && session.auction_id !== auth.auctionId) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const { content } = await c.req.json<{ content: string }>()
  if (!content?.trim()) return c.json({ error: 'Message cannot be empty' }, 400)

  let authorName: string
  if (auth.role === 'captain') {
    const cap = queryOne<Captain>('SELECT * FROM captains WHERE id = ?', [auth.captainId])
    authorName = cap ? cap.display_name : 'Captain'
  } else if (auth.role === 'host') {
    authorName = 'Host'
  } else if (auth.role === 'auctioneer') {
    authorName = 'Auctioneer'
  } else {
    authorName = 'Admin'
  }

  execute(
    `INSERT INTO session_chat (session_id, author_role, author_name, content) VALUES (?, ?, ?, ?)`,
    [id, auth.role, authorName, content.trim().slice(0, 500)]
  )
  notify(id)
  return c.json({ ok: true })
})

// ─── Direct Assign ────────────────────────────────────────────────────────────

sessions.post('/:id/assign', requireAuth('admin', 'auctioneer'), async (c) => {
  const auth = c.get('auth')
  const id = Number(c.req.param('id'))

  const session = queryOne<AuctionSession>(
    'SELECT * FROM auction_sessions WHERE id = ?', [id]
  )
  if (!session) return c.json({ error: 'Session not found' }, 404)
  if (session.status !== 'live') return c.json({ error: 'Session is not live' }, 409)

  if (auth.role === 'auctioneer') {
    const row = queryOne<{ tournament_id: number }>(
      'SELECT tournament_id FROM auctions WHERE id = ?', [session.auction_id]
    )
    if (!row || row.tournament_id !== auth.projectId) {
      return c.json({ error: 'Forbidden' }, 403)
    }
  }

  const data = await c.req.json<{
    queue_entry_id: number
    captain_id: number
    price: number
  }>()

  const entry = queryOne<SessionQueueEntry>(
    "SELECT * FROM session_queue WHERE id = ? AND session_id = ? AND status = 'pending'",
    [data.queue_entry_id, id]
  )
  if (!entry) return c.json({ error: 'Queue entry not found or not pending' }, 404)

  transaction(() => {
    execute("UPDATE session_queue SET status = 'sold' WHERE id = ?", [entry.id])
    execute(
      `INSERT INTO session_purchases (session_id, captain_id, player_id, player_name, price)
       VALUES (?, ?, ?, ?, ?)`,
      [id, data.captain_id, entry.player_id, entry.player_name, data.price]
    )
    if (entry.player_id) {
      execute("UPDATE players SET is_available = 0 WHERE id = ?", [entry.player_id])
    }
    execute('UPDATE auction_sessions SET sold_count = sold_count + 1 WHERE id = ?', [id])

    const remaining = queryOne<{ count: number }>(
      "SELECT COUNT(*) as count FROM session_queue WHERE session_id = ? AND status = 'pending'",
      [id]
    )
    const hasActive = queryOne(
      "SELECT id FROM session_queue WHERE session_id = ? AND status = 'active'", [id]
    )
    if (remaining?.count === 0 && !hasActive) {
      execute(
        "UPDATE auction_sessions SET status = 'finished', finished_at = ? WHERE id = ?",
        [new Date().toISOString(), id]
      )
      execute("UPDATE auctions SET status = 'finished' WHERE id = ?", [session.auction_id])
    }
  })

  notify(id)
  return c.json({ ok: true })
})

// ─── Get Pending Players (auctioneer pool view — alphabetical, secret order) ──

sessions.get('/:id/pending-players', requireAuth('admin', 'auctioneer'), async (c) => {
  const id = Number(c.req.param('id'))

  const session = queryOne<AuctionSession>('SELECT * FROM auction_sessions WHERE id = ?', [id])
  if (!session) return c.json({ error: 'Session not found' }, 404)

  const players = queryAll<SessionQueueEntry & { player_classes: string }>(
    `SELECT sq.*, COALESCE(p.classes, '') as player_classes
     FROM session_queue sq
     LEFT JOIN players p ON p.id = sq.player_id
     WHERE sq.session_id = ? AND sq.status = 'pending'
     ORDER BY sq.player_name ASC`,
    [id]
  )
  return c.json(players)
})

// ─── Set Active Player (auctioneer picks from pool) ───────────────────────────

sessions.post('/:id/set-active', requireAuth('admin', 'auctioneer'), async (c) => {
  const auth = c.get('auth')
  const id = Number(c.req.param('id'))

  const session = queryOne<AuctionSession>('SELECT * FROM auction_sessions WHERE id = ?', [id])
  if (!session) return c.json({ error: 'Session not found' }, 404)
  if (session.status !== 'live') return c.json({ error: 'Session is not live' }, 409)

  if (auth.role === 'auctioneer') {
    const row = queryOne<{ tournament_id: number }>(
      'SELECT tournament_id FROM auctions WHERE id = ?', [session.auction_id]
    )
    if (!row || row.tournament_id !== auth.projectId) {
      return c.json({ error: 'Forbidden' }, 403)
    }
  }

  const { queue_entry_id } = await c.req.json<{ queue_entry_id: number }>()

  const entry = queryOne<SessionQueueEntry>(
    "SELECT * FROM session_queue WHERE id = ? AND session_id = ? AND status = 'pending'",
    [queue_entry_id, id]
  )
  if (!entry) return c.json({ error: 'Queue entry not found or not pending' }, 404)

  transaction(() => {
    const currentActive = queryOne<SessionQueueEntry>(
      "SELECT * FROM session_queue WHERE session_id = ? AND status = 'active'", [id]
    )
    if (currentActive) {
      execute('DELETE FROM session_bids WHERE queue_entry_id = ?', [currentActive.id])
      const minPos = queryOne<{ min: number }>(
        'SELECT MIN(queue_position) as min FROM session_queue WHERE session_id = ?',
        [id]
      )
      execute(
        "UPDATE session_queue SET status = 'pending', queue_position = ? WHERE id = ?",
        [(minPos?.min ?? 0) - 1, currentActive.id]
      )
    }
    execute("UPDATE session_queue SET status = 'active' WHERE id = ?", [entry.id])
  })
  notify(id)
  return c.json({ ok: true })
})

// ─── Finish Session (explicit, auctioneer-confirmed) ─────────────────────────

sessions.post('/:id/finish', requireAuth('admin', 'auctioneer'), async (c) => {
  const auth = c.get('auth')
  const id = Number(c.req.param('id'))

  const session = queryOne<AuctionSession>('SELECT * FROM auction_sessions WHERE id = ?', [id])
  if (!session) return c.json({ error: 'Session not found' }, 404)
  if (session.status === 'finished') return c.json({ error: 'Session already finished' }, 409)

  if (auth.role === 'auctioneer') {
    const row = queryOne<{ tournament_id: number }>(
      'SELECT tournament_id FROM auctions WHERE id = ?', [session.auction_id]
    )
    if (!row || row.tournament_id !== auth.projectId) {
      return c.json({ error: 'Forbidden' }, 403)
    }
  }

  // Enforce full rosters before finishing
  const playersPerTeam = queryOne<{ players_per_team: number }>(
    `SELECT t.players_per_team FROM tournaments t
     JOIN auctions a ON a.tournament_id = t.id WHERE a.id = ?`,
    [session.auction_id]
  )?.players_per_team ?? 6

  const captains = queryAll<{ id: number }>(
    'SELECT id FROM captains WHERE auction_id = ?', [session.auction_id]
  )
  const rosterCounts = queryAll<{ captain_id: number; cnt: number }>(
    'SELECT captain_id, COUNT(*) as cnt FROM session_purchases WHERE session_id = ? GROUP BY captain_id',
    [id]
  )
  const countMap = new Map(rosterCounts.map(r => [r.captain_id, r.cnt]))
  const incomplete = captains.filter(c => (countMap.get(c.id) ?? 0) < playersPerTeam)
  if (incomplete.length > 0) {
    return c.json({
      error: `${incomplete.length} team(s) don't have a full roster (${playersPerTeam} players each)`
    }, 409)
  }

  transaction(() => {
    execute(
      "UPDATE auction_sessions SET status = 'finished', finished_at = ? WHERE id = ?",
      [new Date().toISOString(), id]
    )
    execute("UPDATE auctions SET status = 'finished' WHERE id = ?", [session.auction_id])
  })
  notify(id)
  return c.json({ ok: true })
})

// ─── Refund Purchase ─────────────────────────────────────────────────────────

sessions.post('/:id/refund', requireAuth('admin', 'auctioneer'), async (c) => {
  const auth = c.get('auth')
  const id = Number(c.req.param('id'))

  const session = queryOne<AuctionSession>('SELECT * FROM auction_sessions WHERE id = ?', [id])
  if (!session) return c.json({ error: 'Session not found' }, 404)
  if (session.status !== 'live') return c.json({ error: 'Session is not live' }, 409)

  if (auth.role === 'auctioneer') {
    const row = queryOne<{ tournament_id: number }>(
      'SELECT tournament_id FROM auctions WHERE id = ?', [session.auction_id]
    )
    if (!row || row.tournament_id !== auth.projectId) {
      return c.json({ error: 'Forbidden' }, 403)
    }
  }

  const { purchase_id } = await c.req.json<{ purchase_id: number }>()

  const purchase = queryOne<SessionPurchase>(
    'SELECT * FROM session_purchases WHERE id = ? AND session_id = ?',
    [purchase_id, id]
  )
  if (!purchase) return c.json({ error: 'Purchase not found' }, 404)

  // Find the sold queue entry for this player
  const soldEntry = purchase.player_id != null
    ? queryOne<SessionQueueEntry>(
        "SELECT * FROM session_queue WHERE session_id = ? AND player_id = ? AND status = 'sold'",
        [id, purchase.player_id]
      )
    : queryOne<SessionQueueEntry>(
        "SELECT * FROM session_queue WHERE session_id = ? AND player_name = ? AND status = 'sold'",
        [id, purchase.player_name]
      )
  if (!soldEntry) return c.json({ error: 'Queue entry for this player not found' }, 404)

  transaction(() => {
    // Move current active player (if any) back to end of pending queue
    const currentActive = queryOne<SessionQueueEntry>(
      "SELECT * FROM session_queue WHERE session_id = ? AND status = 'active'", [id]
    )
    if (currentActive) {
      execute('DELETE FROM session_bids WHERE queue_entry_id = ?', [currentActive.id])
      const minPos = queryOne<{ min: number }>(
        'SELECT MIN(queue_position) as min FROM session_queue WHERE session_id = ?',
        [id]
      )
      execute(
        "UPDATE session_queue SET status = 'pending', queue_position = ? WHERE id = ?",
        [(minPos?.min ?? 0) - 1, currentActive.id]
      )
    }

    // Clear any stale bids on the refunded player's queue entry
    execute('DELETE FROM session_bids WHERE queue_entry_id = ?', [soldEntry.id])

    // Set the refunded player as active
    execute("UPDATE session_queue SET status = 'active' WHERE id = ?", [soldEntry.id])

    // Delete the purchase (captain gets money back automatically via spent recalc)
    execute('DELETE FROM session_purchases WHERE id = ?', [purchase_id])

    // Restore player availability
    if (purchase.player_id) {
      execute("UPDATE players SET is_available = 1 WHERE id = ?", [purchase.player_id])
    }

    // Decrement sold_count
    execute('UPDATE auction_sessions SET sold_count = MAX(0, sold_count - 1) WHERE id = ?', [id])
  })
  notify(id)
  return c.json({ ok: true })
})

// ─── Toggle Half-Budget Mode ──────────────────────────────────────────────────

sessions.post('/:id/half-budget', requireAuth('admin', 'auctioneer'), async (c) => {
  const id = Number(c.req.param('id'))

  const session = queryOne<AuctionSession>('SELECT * FROM auction_sessions WHERE id = ?', [id])
  if (!session) return c.json({ error: 'Session not found' }, 404)

  const newVal = session.half_budget ? 0 : 1
  execute('UPDATE auction_sessions SET half_budget = ? WHERE id = ?', [newVal, id])
  notify(id)
  return c.json({ ok: true, half_budget: newVal })
})

export default sessions
