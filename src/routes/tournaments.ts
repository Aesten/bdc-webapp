import { Hono } from 'hono'
import { queryAll, queryOne, execute } from '../db/database'
import { requireAuth, type AuthEnv } from '../middleware/auth'
import { slugify } from '../types'
import type { Tournament, HostJwtPayload, CaptainJwtPayload } from '../types'

const tournaments = new Hono<AuthEnv>()

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uniqueSlug(base: string): string {
  let slug = base
  let counter = 2
  while (queryOne('SELECT id FROM tournaments WHERE slug = ?', [slug])) {
    slug = `${base}-${counter++}`
  }
  return slug
}

function canAccess(auth: AuthEnv['Variables']['auth'], tournament: Tournament): boolean {
  if (auth.role === 'admin') return true
  if (auth.role === 'host')  return tournament.id === (auth as HostJwtPayload).tournamentId
  if (auth.role === 'auctioneer') return tournament.id === auth.projectId
  if (auth.role === 'captain') {
    const row = queryOne<{ tournament_id: number }>(
      'SELECT tournament_id FROM auctions WHERE id = ?', [(auth as CaptainJwtPayload).auctionId]
    )
    return row?.tournament_id === tournament.id
  }
  return false
}

// ─── List Tournaments ─────────────────────────────────────────────────────────
// Admin: all tournaments. Host: their single tournament (array of 1).

tournaments.get('/', requireAuth('admin', 'host'), (c) => {
  const auth = c.get('auth')

  if (auth.role === 'admin') {
    return c.json(queryAll<Tournament>(
      `SELECT * FROM tournaments ORDER BY created_at DESC`
    ))
  }

  const tournament = queryOne<Tournament>(
    'SELECT * FROM tournaments WHERE id = ?',
    [(auth as HostJwtPayload).tournamentId]
  )
  return c.json(tournament ? [tournament] : [])
})

// ─── Get Tournament ───────────────────────────────────────────────────────────

tournaments.get('/:slug', requireAuth('admin', 'host', 'auctioneer', 'captain'), (c) => {
  const auth = c.get('auth')
  const slug = c.req.param('slug')
  const tournament = queryOne<Tournament>('SELECT * FROM tournaments WHERE slug = ?', [slug])
  if (!tournament) return c.json({ error: 'Tournament not found' }, 404)

  if (!canAccess(auth, tournament)) return c.json({ error: 'Forbidden' }, 403)

  return c.json(tournament)
})

// ─── Create Tournament (admin only) ───────────────────────────────────────────

tournaments.post('/', requireAuth('admin'), async (c) => {
  const data = await c.req.json<{ name: string; description?: string }>()

  const slug = uniqueSlug(slugify(data.name))
  execute(
    'INSERT INTO tournaments (name, slug, description) VALUES (?, ?, ?)',
    [data.name, slug, data.description ?? null]
  )

  return c.json(queryOne<Tournament>('SELECT * FROM tournaments WHERE slug = ?', [slug])!, 201)
})

// ─── Update Tournament ────────────────────────────────────────────────────────

tournaments.patch('/:slug', requireAuth('admin', 'host'), async (c) => {
  const auth = c.get('auth')
  const slug = c.req.param('slug')
  const tournament = queryOne<Tournament>('SELECT * FROM tournaments WHERE slug = ?', [slug])
  if (!tournament) return c.json({ error: 'Tournament not found' }, 404)

  if (auth.role === 'host' && tournament.id !== (auth as HostJwtPayload).tournamentId) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const data = await c.req.json<{
    name?:             string
    description?:      string
    status?:           'active' | 'archived'
    map_pool?:         number[]
    finals_map_pool?:  number[]
    players_per_team?: number
  }>()

  const newSlug = data.name && data.name !== tournament.name
    ? uniqueSlug(slugify(data.name))
    : tournament.slug

  // Validate map_pool if provided
  if (data.map_pool !== undefined) {
    if (!Array.isArray(data.map_pool)) {
      return c.json({ error: 'map_pool must be an array of map IDs' }, 400)
    }
    for (const mid of data.map_pool) {
      if (!queryOne('SELECT id FROM maps WHERE id = ? AND is_active = 1', [mid])) {
        return c.json({ error: `Map ${mid} not found or inactive` }, 400)
      }
    }
  }

  // Validate finals_map_pool if provided
  if (data.finals_map_pool !== undefined) {
    if (!Array.isArray(data.finals_map_pool)) {
      return c.json({ error: 'finals_map_pool must be an array of map IDs' }, 400)
    }
    for (const mid of data.finals_map_pool) {
      if (!queryOne('SELECT id FROM maps WHERE id = ? AND is_active = 1', [mid])) {
        return c.json({ error: `Map ${mid} not found or inactive` }, 400)
      }
    }
  }

  execute(
    `UPDATE tournaments SET name=?, slug=?, description=?, status=?, map_pool=?, finals_map_pool=?, players_per_team=? WHERE id=?`,
    [
      data.name            ?? tournament.name,
      newSlug,
      data.description     ?? tournament.description,
      data.status          ?? tournament.status,
      data.map_pool !== undefined
        ? JSON.stringify(data.map_pool)
        : tournament.map_pool,
      data.finals_map_pool !== undefined
        ? JSON.stringify(data.finals_map_pool)
        : tournament.finals_map_pool,
      data.players_per_team ?? tournament.players_per_team,
      tournament.id,
    ]
  )

  return c.json(queryOne<Tournament>('SELECT * FROM tournaments WHERE id = ?', [tournament.id]))
})

// ─── Delete Tournament (admin only) ───────────────────────────────────────────

tournaments.delete('/:slug', requireAuth('admin'), (c) => {
  const slug = c.req.param('slug')
  const tournament = queryOne<Tournament>('SELECT * FROM tournaments WHERE slug = ?', [slug])
  if (!tournament) return c.json({ error: 'Tournament not found' }, 404)
  execute('DELETE FROM tournaments WHERE id = ?', [tournament.id])
  return c.json({ ok: true })
})

// ─── Public: Featured Tournament ──────────────────────────────────────────────

tournaments.get('/public/featured', (c) => {
  const tournament = queryOne<{ id: number; name: string; slug: string; description: string | null }>(
    `SELECT id, name, slug, description FROM tournaments WHERE is_featured = 1 AND status = 'active' LIMIT 1`
  )
  return c.json(tournament ?? null)
})

// ─── Public: List Tournaments ─────────────────────────────────────────────────

tournaments.get('/public/list', (c) => {
  return c.json(queryAll<{
    id: number; name: string; slug: string; description: string | null; status: string; created_at: string
  }>(`SELECT id, name, slug, description, status, created_at FROM tournaments ORDER BY created_at DESC`))
})

// ─── Public: Tournament Overview ──────────────────────────────────────────────

tournaments.get('/public/:slug', (c) => {
  const slug = c.req.param('slug')
  const tournament = queryOne<{
    id: number; name: string; slug: string; description: string | null
  }>(`SELECT id, name, slug, description FROM tournaments WHERE slug = ?`, [slug])
  if (!tournament) return c.json({ error: 'Tournament not found' }, 404)

  // Only surface divisions that are ready or finished (not still in setup)
  const auctions = queryAll<{ id: number; name: string; status: string }>(
    `SELECT id, name, status FROM auctions
     WHERE tournament_id = ? AND status != 'setup'
     ORDER BY id ASC`,
    [tournament.id]
  )

  const divisions = auctions.map(auction => {
    const liveSession = queryOne<{ id: number; status: string }>(
      `SELECT id, status FROM auction_sessions
       WHERE auction_id = ? AND status IN ('live','paused') LIMIT 1`,
      [auction.id]
    ) ?? null

    const captainRows = queryAll<{ id: number; display_name: string; team_name: string | null; total_spent: number; class: string | null }>(
      `SELECT c.id, c.display_name, c.team_name, c.class,
              COALESCE(SUM(sp.price), 0) as total_spent
       FROM captains c
       LEFT JOIN session_purchases sp ON sp.captain_id = c.id
       WHERE c.auction_id = ?
       GROUP BY c.id ORDER BY c.id ASC`,
      [auction.id]
    )

    const playerRows = queryAll<{ captain_id: number; player_name: string; classes: string | null; price: number }>(
      `SELECT sp.captain_id, sp.player_name, COALESCE(p.classes, '') as classes, sp.price
       FROM session_purchases sp
       JOIN auction_sessions s ON s.id = sp.session_id
       LEFT JOIN players p ON p.id = sp.player_id
       WHERE s.auction_id = ?
       ORDER BY sp.captain_id, sp.price DESC`,
      [auction.id]
    )

    const teams = captainRows.map(c => ({
      id: c.id, display_name: c.display_name, team_name: c.team_name,
      total_spent: c.total_spent, class: c.class,
      players: playerRows
        .filter(p => p.captain_id === c.id)
        .map(p => ({ player_name: p.player_name, classes: p.classes, price: p.price })),
    }))

    const matches = queryAll(
      `SELECT m.id, m.bracket_id, m.round, m.match_order, m.match_label,
              m.group_label, m.captain_a_id, m.captain_b_id, m.matchup_id,
              m.score_a, m.score_b, m.winner_captain_id, m.status, m.is_finals,
              ca.team_name as team_a_name, cb.team_name as team_b_name
       FROM matches m
       JOIN brackets b ON b.id = m.bracket_id
       LEFT JOIN captains ca ON ca.id = m.captain_a_id
       LEFT JOIN captains cb ON cb.id = m.captain_b_id
       WHERE b.auction_id = ?
       ORDER BY m.round, m.match_order`,
      [auction.id]
    )

    const winnerRow = queryOne<{ display_name: string; team_name: string | null }>(
      `SELECT c.display_name, c.team_name
       FROM matches m
       JOIN brackets b ON b.id = m.bracket_id
       JOIN captains c ON c.id = m.winner_captain_id
       WHERE b.auction_id = ? AND m.is_finals = 1 AND m.winner_captain_id IS NOT NULL
       LIMIT 1`,
      [auction.id]
    ) ?? null

    const winner = winnerRow ? {
      team_name:    winnerRow.team_name ?? `${winnerRow.display_name}'s team`,
      captain_name: winnerRow.display_name,
    } : null

    return { auction, liveSession, teams, matches, winner }
  })

  const matchups = queryAll(
    `SELECT mu.id, mu.round, mu.label,
            mp.name as map_name, mp.game_id as map_game_id, mp.image_path as map_image,
            fa.name as faction_a_name, fb.name as faction_b_name
     FROM matchups mu
     LEFT JOIN maps     mp ON mp.id = mu.map_id
     LEFT JOIN factions fa ON fa.id = mu.faction_a_id
     LEFT JOIN factions fb ON fb.id = mu.faction_b_id
     WHERE mu.tournament_id = ?
     ORDER BY mu.round ASC`,
    [tournament.id]
  )

  return c.json({ tournament, divisions, matchups })
})

export default tournaments
