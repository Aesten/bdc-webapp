import { Hono } from 'hono'
import { queryAll, queryOne, execute, getDb } from '../db/database'
import { requireAuth, type AuthEnv } from '../middleware/auth'
import type { Player, Tournament, PlayerClass, HostJwtPayload, CaptainJwtPayload } from '../types'
import { PLAYER_CLASSES } from '../types'

const players = new Hono<AuthEnv>()

function canAccessTournament(
  auth: AuthEnv['Variables']['auth'],
  tournament: Tournament
): boolean {
  if (auth.role === 'admin') return true
  if (auth.role === 'host') return tournament.id === (auth as HostJwtPayload).tournamentId
  if (auth.role === 'auctioneer') return tournament.id === (auth as { projectId: number }).projectId
  if (auth.role === 'captain') {
    const row = queryOne<{ tournament_id: number }>(
      'SELECT tournament_id FROM auctions WHERE id = ?', [(auth as CaptainJwtPayload).auctionId]
    )
    return row?.tournament_id === tournament.id
  }
  return false
}

function parseClassList(raw: unknown): string {
  if (!raw) return ''
  const arr = Array.isArray(raw) ? raw : String(raw).split(',')
  const valid = arr.map(c => String(c).trim().toLowerCase()).filter(c => PLAYER_CLASSES.includes(c as PlayerClass))
  return valid.join(',')
}

// ─── List Players ─────────────────────────────────────────────────────────────

players.get('/tournament/:slug', requireAuth('admin', 'host', 'auctioneer', 'captain'), (c) => {
  const auth = c.get('auth')
  const slug = c.req.param('slug')
  const tournament = queryOne<Tournament>('SELECT * FROM tournaments WHERE slug = ?', [slug])
  if (!tournament) return c.json({ error: 'Tournament not found' }, 404)
  if (!canAccessTournament(auth, tournament)) return c.json({ error: 'Forbidden' }, 403)
  return c.json(queryAll<Player>(
    'SELECT * FROM players WHERE tournament_id = ? ORDER BY name ASC', [tournament.id]
  ))
})

// ─── Add Player ───────────────────────────────────────────────────────────────

players.post('/tournament/:slug', requireAuth('admin', 'host'), async (c) => {
  const auth = c.get('auth')
  const slug = c.req.param('slug')
  const tournament = queryOne<Tournament>('SELECT * FROM tournaments WHERE slug = ?', [slug])
  if (!tournament) return c.json({ error: 'Tournament not found' }, 404)
  if (!canAccessTournament(auth, tournament)) return c.json({ error: 'Forbidden' }, 403)

  const data = await c.req.json<{ name: string; classes?: string[] | string }>()
  if (!data.name?.trim()) return c.json({ error: 'Name is required' }, 400)

  const classes = parseClassList(data.classes)
  execute(
    'INSERT INTO players (tournament_id, name, classes) VALUES (?, ?, ?)',
    [tournament.id, data.name.trim(), classes]
  )
  return c.json(queryOne<Player>(
    'SELECT * FROM players WHERE tournament_id = ? ORDER BY id DESC LIMIT 1',
    [tournament.id]
  ), 201)
})

// ─── Bulk Add Players ─────────────────────────────────────────────────────────

players.post('/tournament/:slug/bulk', requireAuth('admin', 'host'), async (c) => {
  const auth = c.get('auth')
  const slug = c.req.param('slug')
  const tournament = queryOne<Tournament>('SELECT * FROM tournaments WHERE slug = ?', [slug])
  if (!tournament) return c.json({ error: 'Tournament not found' }, 404)
  if (!canAccessTournament(auth, tournament)) return c.json({ error: 'Forbidden' }, 403)

  const items = await c.req.json<Array<{ name: string; classes?: string[] | string }>>()
  if (!Array.isArray(items) || items.length === 0)
    return c.json({ error: 'Expected a non-empty array' }, 400)

  const db = getDb()
  const insert = db.prepare('INSERT INTO players (tournament_id, name, classes) VALUES (?, ?, ?)')
  const insertMany = db.transaction((rows: typeof items) => {
    for (const row of rows) {
      if (!row.name?.trim()) throw new Error(`Missing name in row: ${JSON.stringify(row)}`)
      insert.run(tournament.id, row.name.trim(), parseClassList(row.classes))
    }
  })

  try {
    insertMany(items)
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Insert failed' }, 400)
  }

  const all = queryAll<Player>(
    'SELECT * FROM players WHERE tournament_id = ? ORDER BY name ASC', [tournament.id]
  )
  return c.json({ ok: true, count: items.length, players: all }, 201)
})

// ─── Update Player ────────────────────────────────────────────────────────────

players.patch('/:id', requireAuth('admin', 'host'), async (c) => {
  const auth = c.get('auth')
  const id = Number(c.req.param('id'))
  const player = queryOne<Player>('SELECT * FROM players WHERE id = ?', [id])
  if (!player) return c.json({ error: 'Player not found' }, 404)
  const tournament = queryOne<Tournament>('SELECT * FROM tournaments WHERE id = ?', [player.tournament_id])!
  if (!canAccessTournament(auth, tournament)) return c.json({ error: 'Forbidden' }, 403)

  const data = await c.req.json<Partial<{ name: string; classes: string[] | string; is_available: number }>>()
  execute(
    'UPDATE players SET name = ?, classes = ?, is_available = ? WHERE id = ?',
    [
      data.name         ?? player.name,
      data.classes !== undefined ? parseClassList(data.classes) : player.classes,
      data.is_available ?? player.is_available,
      id,
    ]
  )
  return c.json(queryOne<Player>('SELECT * FROM players WHERE id = ?', [id]))
})

// ─── Delete Player ────────────────────────────────────────────────────────────

players.delete('/:id', requireAuth('admin', 'host'), (c) => {
  const auth = c.get('auth')
  const id = Number(c.req.param('id'))
  const player = queryOne<Player>('SELECT * FROM players WHERE id = ?', [id])
  if (!player) return c.json({ error: 'Player not found' }, 404)
  const tournament = queryOne<Tournament>('SELECT * FROM tournaments WHERE id = ?', [player.tournament_id])!
  if (!canAccessTournament(auth, tournament)) return c.json({ error: 'Forbidden' }, 403)

  const purchased = queryOne<{ count: number }>(
    'SELECT COUNT(*) as count FROM session_purchases WHERE player_id = ?', [id]
  )
  if (purchased && purchased.count > 0)
    return c.json({ error: 'Cannot delete a player who has been purchased' }, 409)

  execute('DELETE FROM players WHERE id = ?', [id])
  return c.json({ ok: true })
})

export default players
