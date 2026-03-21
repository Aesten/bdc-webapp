import { Hono } from 'hono'
import { queryAll, queryOne, execute } from '../db/database'
import { requireAuth, type AuthEnv } from '../middleware/auth'
import type { Auction, Captain, Tournament, HostJwtPayload, CaptainJwtPayload, AuctioneerJwtPayload } from '../types'

function captainInTournament(auth: CaptainJwtPayload, tournament: Tournament): boolean {
  const row = queryOne<{ tournament_id: number }>(
    'SELECT tournament_id FROM auctions WHERE id = ?', [auth.auctionId]
  )
  return row?.tournament_id === tournament.id
}

const auctions = new Hono<AuthEnv>()

function canAccessAuction(
  auth: AuthEnv['Variables']['auth'],
  tournament: Tournament
): boolean {
  if (auth.role === 'admin') return true
  if (auth.role === 'host') return tournament.id === (auth as HostJwtPayload).tournamentId
  if (auth.role === 'auctioneer') return tournament.id === (auth as AuctioneerJwtPayload).projectId
  if (auth.role === 'captain') return captainInTournament(auth as CaptainJwtPayload, tournament)
  return false
}

function getTournamentForAuction(auctionId: number): Tournament | null {
  return queryOne<Tournament>(
    `SELECT t.* FROM tournaments t JOIN auctions a ON a.tournament_id = t.id WHERE a.id = ?`,
    [auctionId]
  )
}

// ─── List Auctions for a Tournament ───────────────────────────────────────────

auctions.get('/tournament/:slug', requireAuth('admin', 'host', 'auctioneer', 'captain'), (c) => {
  const auth = c.get('auth')
  const slug = c.req.param('slug')
  const tournament = queryOne<Tournament>('SELECT * FROM tournaments WHERE slug = ?', [slug])
  if (!tournament) return c.json({ error: 'Tournament not found' }, 404)
  if (!canAccessAuction(auth, tournament)) return c.json({ error: 'Forbidden' }, 403)
  return c.json(queryAll<Auction>(
    'SELECT * FROM auctions WHERE tournament_id = ? ORDER BY created_at ASC', [tournament.id]
  ))
})

// ─── Get Auction ──────────────────────────────────────────────────────────────

auctions.get('/:id', requireAuth('admin', 'host', 'auctioneer'), (c) => {
  const auth = c.get('auth')
  const id = Number(c.req.param('id'))
  const auction = queryOne<Auction>('SELECT * FROM auctions WHERE id = ?', [id])
  if (!auction) return c.json({ error: 'Auction not found' }, 404)
  const tournament = getTournamentForAuction(id)!
  if (!canAccessAuction(auth, tournament)) return c.json({ error: 'Forbidden' }, 403)
  const captains = queryAll<Captain>('SELECT * FROM captains WHERE auction_id = ? ORDER BY id ASC', [id])
  return c.json({ ...auction, captains })
})

// ─── Create Auction ───────────────────────────────────────────────────────────

auctions.post('/tournament/:slug', requireAuth('admin', 'host'), async (c) => {
  const auth = c.get('auth')
  const slug = c.req.param('slug')
  const tournament = queryOne<Tournament>('SELECT * FROM tournaments WHERE slug = ?', [slug])
  if (!tournament) return c.json({ error: 'Tournament not found' }, 404)
  if (!canAccessAuction(auth, tournament)) return c.json({ error: 'Forbidden' }, 403)

  const data = await c.req.json<{
    name: string
    min_increment?: number
    bid_cooldown_seconds?: number
    is_public?: number
  }>()

  execute(
    `INSERT INTO auctions (tournament_id, name, min_increment, bid_cooldown_seconds, is_public)
     VALUES (?, ?, ?, ?, ?)`,
    [
      tournament.id,
      data.name,
      data.min_increment        ?? 0.1,
      data.bid_cooldown_seconds ?? 3,
      data.is_public            ?? 1,
    ]
  )
  return c.json(queryOne<Auction>(
    'SELECT * FROM auctions WHERE tournament_id = ? ORDER BY id DESC LIMIT 1',
    [tournament.id]
  ), 201)
})

// ─── Update Auction ───────────────────────────────────────────────────────────

auctions.patch('/:id', requireAuth('admin', 'host'), async (c) => {
  const auth = c.get('auth')
  const id = Number(c.req.param('id'))
  const auction = queryOne<Auction>('SELECT * FROM auctions WHERE id = ?', [id])
  if (!auction) return c.json({ error: 'Auction not found' }, 404)
  const tournament = getTournamentForAuction(id)!
  if (!canAccessAuction(auth, tournament)) return c.json({ error: 'Forbidden' }, 403)
  if (auction.status !== 'setup')
    return c.json({ error: 'Cannot edit an auction that has already started' }, 409)

  const data = await c.req.json<Partial<Auction>>()
  execute(
    `UPDATE auctions SET name = ?, min_increment = ?, bid_cooldown_seconds = ?, is_public = ? WHERE id = ?`,
    [
      data.name                 ?? auction.name,
      data.min_increment        ?? auction.min_increment,
      data.bid_cooldown_seconds ?? auction.bid_cooldown_seconds,
      data.is_public            ?? auction.is_public,
      id,
    ]
  )
  return c.json(queryOne<Auction>('SELECT * FROM auctions WHERE id = ?', [id]))
})

// ─── Mark Auction Ready ───────────────────────────────────────────────────────

auctions.post('/:id/ready', requireAuth('admin', 'host'), (c) => {
  const auth = c.get('auth')
  const id = Number(c.req.param('id'))
  const auction = queryOne<Auction>('SELECT * FROM auctions WHERE id = ?', [id])
  if (!auction) return c.json({ error: 'Auction not found' }, 404)
  const tournament = getTournamentForAuction(id)!
  if (!canAccessAuction(auth, tournament)) return c.json({ error: 'Forbidden' }, 403)
  if (auction.status !== 'setup') return c.json({ error: 'Auction is already ready or finished' }, 409)

  const captainCount = queryOne<{ count: number }>('SELECT COUNT(*) as count FROM captains WHERE auction_id = ?', [id])
  if (!captainCount || captainCount.count < 8)
    return c.json({ error: `Auction needs all 8 captains (have ${captainCount?.count ?? 0})` }, 409)

  const playerCount = queryOne<{ count: number }>(
    'SELECT COUNT(*) as count FROM players WHERE tournament_id = ? AND is_available = 1',
    [auction.tournament_id]
  )
  const required = captainCount.count * (tournament.players_per_team ?? 6)
  if (!playerCount || playerCount.count < required)
    return c.json({ error: `Not enough available players. Need ${required}, have ${playerCount?.count ?? 0}` }, 409)

  execute('UPDATE auctions SET status = ? WHERE id = ?', ['ready', id])
  return c.json({ ok: true, status: 'ready' })
})

// ─── Mark Auction Un-ready ────────────────────────────────────────────────────

auctions.post('/:id/unready', requireAuth('admin', 'host'), (c) => {
  const auth = c.get('auth')
  const id = Number(c.req.param('id'))
  const auction = queryOne<Auction>('SELECT * FROM auctions WHERE id = ?', [id])
  if (!auction) return c.json({ error: 'Auction not found' }, 404)
  const tournament = getTournamentForAuction(id)!
  if (!canAccessAuction(auth, tournament)) return c.json({ error: 'Forbidden' }, 403)
  if (auction.status !== 'ready') return c.json({ error: 'Auction is not in ready state' }, 409)
  execute('UPDATE auctions SET status = ? WHERE id = ?', ['setup', id])
  return c.json({ ok: true, status: 'setup' })
})

// ─── Delete Auction ───────────────────────────────────────────────────────────

auctions.delete('/:id', requireAuth('admin', 'host'), (c) => {
  const auth = c.get('auth')
  const id = Number(c.req.param('id'))
  const auction = queryOne<Auction>('SELECT * FROM auctions WHERE id = ?', [id])
  if (!auction) return c.json({ error: 'Auction not found' }, 404)
  const tournament = getTournamentForAuction(id)!
  if (!canAccessAuction(auth, tournament)) return c.json({ error: 'Forbidden' }, 403)
  if (auction.status !== 'setup')
    return c.json({ error: 'Cannot delete an auction that has already started' }, 409)
  execute('DELETE FROM auctions WHERE id = ?', [id])
  return c.json({ ok: true })
})

// ─── Public Auction Results (no auth — finished auctions only) ───────────────

auctions.get('/:id/results/public', (c) => {
  const id = Number(c.req.param('id'))
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400)
  const auction = queryOne<Auction>('SELECT * FROM auctions WHERE id = ?', [id])
  if (!auction || auction.status !== 'finished')
    return c.json({ error: 'Results not available yet' }, 404)

  const tournament = queryOne<{ name: string; slug: string }>(
    'SELECT name, slug FROM tournaments WHERE id = ?', [auction.tournament_id]
  )
  const captains = queryAll<Captain>('SELECT * FROM captains WHERE auction_id = ? ORDER BY id ASC', [id])
  const session = queryOne<{ id: number }>(
    'SELECT id FROM auction_sessions WHERE auction_id = ? ORDER BY id DESC LIMIT 1', [id]
  )
  const purchases = session ? queryAll<{ captain_id: number; player_name: string; price: number }>(
    'SELECT captain_id, player_name, price FROM session_purchases WHERE session_id = ? ORDER BY purchased_at ASC',
    [session.id]
  ) : []

  return c.json({
    auction:    { id: auction.id, name: auction.name },
    tournament: tournament ?? { name: '', slug: '' },
    teams: captains.map(cap => ({
      captain: cap,
      players: purchases.filter(p => p.captain_id === cap.id),
    })),
  })
})

// ─── Auction Results ──────────────────────────────────────────────────────────

auctions.get('/:id/results', requireAuth('admin', 'host', 'auctioneer'), (c) => {
  const auth = c.get('auth')
  const id = Number(c.req.param('id'))
  const auction = queryOne<Auction>('SELECT * FROM auctions WHERE id = ?', [id])
  if (!auction) return c.json({ error: 'Auction not found' }, 404)
  const tournament = getTournamentForAuction(id)!
  if (!canAccessAuction(auth, tournament)) return c.json({ error: 'Forbidden' }, 403)

  const captains = queryAll<Captain>('SELECT * FROM captains WHERE auction_id = ? ORDER BY id ASC', [id])
  const session = queryOne<{ id: number }>(
    'SELECT id FROM auction_sessions WHERE auction_id = ? ORDER BY id DESC LIMIT 1', [id]
  )
  const purchases = session ? queryAll<{ id: number; captain_id: number; player_name: string; price: number }>(
    'SELECT id, captain_id, player_name, price FROM session_purchases WHERE session_id = ? ORDER BY purchased_at ASC',
    [session.id]
  ) : []

  return c.json({
    teams: captains.map(cap => ({
      captain: cap,
      players: purchases.filter(p => p.captain_id === cap.id),
    }))
  })
})

// ─── List Captains ────────────────────────────────────────────────────────────

auctions.get('/:id/captains', requireAuth('admin', 'host', 'auctioneer', 'captain'), (c) => {
  const auth = c.get('auth')
  const id = Number(c.req.param('id'))
  const auction = queryOne<Auction>('SELECT * FROM auctions WHERE id = ?', [id])
  if (!auction) return c.json({ error: 'Auction not found' }, 404)
  const tournament = getTournamentForAuction(id)!
  if (!canAccessAuction(auth, tournament)) return c.json({ error: 'Forbidden' }, 403)
  return c.json(queryAll<Captain>('SELECT * FROM captains WHERE auction_id = ? ORDER BY id ASC', [id]))
})

// ─── Add Captain ──────────────────────────────────────────────────────────────

auctions.post('/:id/captains', requireAuth('admin', 'host'), async (c) => {
  const auth = c.get('auth')
  const id = Number(c.req.param('id'))
  const auction = queryOne<Auction>('SELECT * FROM auctions WHERE id = ?', [id])
  if (!auction) return c.json({ error: 'Auction not found' }, 404)
  const tournament = getTournamentForAuction(id)!
  if (!canAccessAuction(auth, tournament)) return c.json({ error: 'Forbidden' }, 403)
  if (auction.status !== 'setup')
    return c.json({ error: 'Cannot add captains after auction has started' }, 409)

  const data = await c.req.json<{ display_name: string; team_name?: string; budget?: number; class?: string }>()
  const defaultTeamName = `${data.display_name.trim()}'s team`
  execute(
    'INSERT INTO captains (auction_id, display_name, team_name, budget, class) VALUES (?, ?, ?, ?, ?)',
    [id, data.display_name, data.team_name?.trim() || defaultTeamName, data.budget ?? 20.0, data.class ?? null]
  )
  return c.json(queryOne<Captain>(
    'SELECT * FROM captains WHERE auction_id = ? ORDER BY id DESC LIMIT 1', [id]
  ), 201)
})

// ─── Update Captain ───────────────────────────────────────────────────────────

auctions.patch('/captains/:captainId', requireAuth('admin', 'host'), async (c) => {
  const auth = c.get('auth')
  const captainId = Number(c.req.param('captainId'))
  const captain = queryOne<Captain>('SELECT * FROM captains WHERE id = ?', [captainId])
  if (!captain) return c.json({ error: 'Captain not found' }, 404)
  const auction = queryOne<Auction>('SELECT * FROM auctions WHERE id = ?', [captain.auction_id])!
  const tournament = getTournamentForAuction(auction.id)!
  if (!canAccessAuction(auth, tournament)) return c.json({ error: 'Forbidden' }, 403)

  const data = await c.req.json<{ display_name?: string; team_name?: string | null; budget?: number; class?: string | null }>()
  execute(
    'UPDATE captains SET display_name = ?, team_name = ?, budget = ?, class = ? WHERE id = ?',
    [
      data.display_name ?? captain.display_name,
      data.team_name !== undefined ? data.team_name : captain.team_name,
      data.budget ?? captain.budget,
      data.class !== undefined ? data.class : captain.class,
      captainId,
    ]
  )
  return c.json(queryOne<Captain>('SELECT * FROM captains WHERE id = ?', [captainId]))
})

// ─── Captain: Update Own Team Name ────────────────────────────────────────────

auctions.patch('/captains/:captainId/team-name', requireAuth('captain'), async (c) => {
  const auth = c.get('auth')
  const captainId = Number(c.req.param('captainId'))
  if ((auth as CaptainJwtPayload).captainId !== captainId)
    return c.json({ error: 'Forbidden' }, 403)

  const data = await c.req.json<{ team_name: string }>()
  const name = data.team_name.trim()
  if (!name) return c.json({ error: 'Team name cannot be empty' }, 400)
  execute('UPDATE captains SET team_name = ? WHERE id = ?', [name, captainId])
  return c.json({ ok: true, team_name: name })
})

// ─── Remove Captain ───────────────────────────────────────────────────────────

auctions.delete('/captains/:captainId', requireAuth('admin', 'host'), (c) => {
  const auth = c.get('auth')
  const captainId = Number(c.req.param('captainId'))
  const captain = queryOne<Captain>('SELECT * FROM captains WHERE id = ?', [captainId])
  if (!captain) return c.json({ error: 'Captain not found' }, 404)
  const auction = queryOne<Auction>('SELECT * FROM auctions WHERE id = ?', [captain.auction_id])!
  const tournament = getTournamentForAuction(auction.id)!
  if (!canAccessAuction(auth, tournament)) return c.json({ error: 'Forbidden' }, 403)
  if (auction.status !== 'setup')
    return c.json({ error: 'Cannot remove captains after auction has started' }, 409)
  execute('DELETE FROM captains WHERE id = ?', [captainId])
  return c.json({ ok: true })
})

// ─── Reopen Auction (admin) ───────────────────────────────────────────────────

auctions.post('/:id/reopen', requireAuth('admin'), (c) => {
  const id = Number(c.req.param('id'))
  const auction = queryOne<Auction>('SELECT * FROM auctions WHERE id = ?', [id])
  if (!auction) return c.json({ error: 'Auction not found' }, 404)
  if (auction.status !== 'finished') return c.json({ error: 'Auction is not finished' }, 409)

  execute("UPDATE auctions SET status = 'ready' WHERE id = ?", [id])
  execute(
    `UPDATE auction_sessions SET status = 'paused', finished_at = NULL
     WHERE auction_id = ? AND id = (SELECT MAX(id) FROM auction_sessions WHERE auction_id = ?)`,
    [id, id]
  )
  return c.json({ ok: true })
})

// ─── Wipe Auction (admin) ─────────────────────────────────────────────────────

auctions.post('/:id/wipe', requireAuth('admin'), (c) => {
  const id = Number(c.req.param('id'))
  const auction = queryOne<Auction>('SELECT * FROM auctions WHERE id = ?', [id])
  if (!auction) return c.json({ error: 'Auction not found' }, 404)

  execute(
    'DELETE FROM session_purchases WHERE session_id IN (SELECT id FROM auction_sessions WHERE auction_id = ?)',
    [id]
  )
  execute('DELETE FROM auction_sessions WHERE auction_id = ?', [id])
  execute("UPDATE auctions SET status = 'ready' WHERE id = ?", [id])
  return c.json({ ok: true })
})

// ─── Remove Purchase (admin) ──────────────────────────────────────────────────

auctions.delete('/:id/purchases/:purchaseId', requireAuth('admin'), (c) => {
  const auctionId  = Number(c.req.param('id'))
  const purchaseId = Number(c.req.param('purchaseId'))

  const purchase = queryOne<{ id: number }>(
    `SELECT sp.id FROM session_purchases sp
     JOIN auction_sessions s ON s.id = sp.session_id
     WHERE sp.id = ? AND s.auction_id = ?`,
    [purchaseId, auctionId]
  )
  if (!purchase) return c.json({ error: 'Purchase not found' }, 404)

  execute('DELETE FROM session_purchases WHERE id = ?', [purchaseId])
  return c.json({ ok: true })
})

// ─── Add Purchase (admin) ─────────────────────────────────────────────────────

auctions.post('/:id/purchases', requireAuth('admin'), async (c) => {
  const auctionId = Number(c.req.param('id'))
  const auction = queryOne<Auction>('SELECT * FROM auctions WHERE id = ?', [auctionId])
  if (!auction) return c.json({ error: 'Auction not found' }, 404)

  const data = await c.req.json<{ captain_id: number; player_id: number; price: number }>()

  const captain = queryOne('SELECT id FROM captains WHERE id = ? AND auction_id = ?', [data.captain_id, auctionId])
  if (!captain) return c.json({ error: 'Captain not in this auction' }, 404)

  const player = queryOne<{ id: number; name: string }>(
    'SELECT id, name FROM players WHERE id = ?', [data.player_id]
  )
  if (!player) return c.json({ error: 'Player not found' }, 404)

  const session = queryOne<{ id: number }>(
    'SELECT id FROM auction_sessions WHERE auction_id = ? ORDER BY id DESC LIMIT 1', [auctionId]
  )
  if (!session) return c.json({ error: 'No session for this auction' }, 404)

  execute(
    'INSERT INTO session_purchases (session_id, captain_id, player_id, player_name, price) VALUES (?,?,?,?,?)',
    [session.id, data.captain_id, data.player_id, player.name, data.price ?? 0]
  )
  return c.json({ ok: true })
})

// ─── Available Players for Manual Assignment (admin) ─────────────────────────

auctions.get('/:id/available-players', requireAuth('admin'), (c) => {
  const auctionId = Number(c.req.param('id'))
  const auction = queryOne<Auction>('SELECT * FROM auctions WHERE id = ?', [auctionId])
  if (!auction) return c.json({ error: 'Auction not found' }, 404)

  const players = queryAll<{ id: number; name: string; classes: string }>(
    `SELECT p.id, p.name, p.classes FROM players p
     WHERE p.tournament_id = ? AND p.is_available = 1
       AND p.id NOT IN (
         SELECT sp.player_id FROM session_purchases sp
         JOIN auction_sessions s ON s.id = sp.session_id
         WHERE s.auction_id = ? AND sp.player_id IS NOT NULL
       )
     ORDER BY p.name ASC`,
    [auction.tournament_id, auctionId]
  )
  return c.json(players)
})

export default auctions
