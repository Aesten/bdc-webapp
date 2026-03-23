import { Hono } from 'hono'
import { queryAll, queryOne, execute } from '../db/database'
import { requireAuth, type AuthEnv } from '../middleware/auth'
import { slugify } from '../types'
import type { Tournament, HostJwtPayload, CaptainJwtPayload } from '../types'
import { resolve, join } from 'path'
import { mkdirSync, existsSync, unlinkSync, readdirSync } from 'fs'

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

// ─── Stats: list uploaded (admin/host) — must be before /:slug ───────────────

tournaments.get('/stats', requireAuth('admin', 'host'), (c) => {
  const dir = resolve(process.cwd(), 'uploads', 'stats')
  if (!existsSync(dir)) return c.json([])
  const files = readdirSync(dir).filter(f => f.endsWith('.json') && !f.endsWith('.config.json'))
  const ids   = files.map(f => Number(f.replace('.json', ''))).filter(n => !isNaN(n))
  return c.json(ids)
})

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
    `SELECT mu.id, mu.bracket_id, mu.round, mu.label,
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

// ─── Stats: public read ───────────────────────────────────────────────────────

tournaments.get('/public/:slug/stats/:auctionId', async (c) => {
  const auctionId  = Number(c.req.param('auctionId'))
  const statsPath  = resolve(process.cwd(), 'uploads', 'stats', `${auctionId}.json`)
  const configPath = resolve(process.cwd(), 'uploads', 'stats', `${auctionId}.config.json`)
  if (!existsSync(statsPath)) return c.json(null)
  try {
    const rows   = JSON.parse(await Bun.file(statsPath).text())
    const config = existsSync(configPath) ? JSON.parse(await Bun.file(configPath).text()) : null
    return c.json({ rows, config })
  } catch {
    return c.json(null)
  }
})

// ─── Stats CSV parser ─────────────────────────────────────────────────────────

const CSV_COL_MAP: Record<string, string> = {
  '#':          'rank',
  'Name':       'name',
  'Played':     'played',
  'Won':        'won',
  'WR%':        'wr',
  'Score':      'score',
  'S/R':        'score_per_round',
  'K':          'kills',
  'D':          'deaths',
  'A':          'assists',
  'K/R':        'kpr',
  'D/R':        'dpr',
  'A/R':        'apr',
  'K+A/R':      'kapr',
  'Spawns':     'spawns',
  'Survival%':  'survival',
  'MVP':        'mvp',
  'MVP%':       'mvp_rate',
  'FirstK':     'first_kills',
  'FirstD':     'first_deaths',
  'Bonks':      'bonks',
  'Couches':    'couches',
  'Kicks':      'kicks',
  'HorseDmg':   'horse_dmg',
  'HorseKills': 'horse_kills',
  'Shots':      'shots',
  'Hits':       'hits',
  'Hit%':       'hit_rate',
  'HS':         'hs',
  'HS%':        'hs_rate',
  'TK':         'tk',
  'TH':         'th',
  'TD':         'td',
  'THTaken':    'th_taken',
  'Suicides':   'suicides',
  'MeleeDmg':   'melee_dmg',
  'MountedDmg': 'mounted_dmg',
  'RangedDmg':  'ranged_dmg',
  'Melee%':     'melee_pct',
  'Mounted%':   'mounted_pct',
  'Ranged%':    'ranged_pct',
}

function parseStatsCsv(text: string): Record<string, unknown>[] {
  const lines   = text.trim().split(/\r?\n/)
  const headers = lines[0].split(';')
  const rows: Record<string, unknown>[] = []
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const cols   = lines[i].split(';')
    const row: Record<string, unknown> = {}
    headers.forEach((h, idx) => {
      const key = CSV_COL_MAP[h]
      if (!key) return // skip unmapped (e.g. HorseKills)
      const raw = cols[idx] ?? ''
      row[key]  = key === 'name' ? raw : (raw === '' ? null : Number(raw))
    })
    rows.push(row)
  }
  return rows
}

// ─── Stats: upload (admin/host) ───────────────────────────────────────────────

tournaments.post('/stats/:auctionId', requireAuth('admin', 'host'), async (c) => {
  const auth      = c.get('auth')
  const auctionId = Number(c.req.param('auctionId'))
  const auction   = queryOne<{ tournament_id: number }>('SELECT tournament_id FROM auctions WHERE id = ?', [auctionId])
  if (!auction) return c.json({ error: 'Auction not found' }, 404)
  const tournament = queryOne<Tournament>('SELECT * FROM tournaments WHERE id = ?', [auction.tournament_id])
  if (!tournament || !canAccess(auth, tournament)) return c.json({ error: 'Forbidden' }, 403)

  const body = await c.req.formData()
  const file = body.get('file')
  if (!file || typeof file === 'string') return c.json({ error: 'No file uploaded' }, 400)

  const f    = file as File
  const text = await f.text()
  let json: string

  if (f.name.endsWith('.csv')) {
    try {
      const rows = parseStatsCsv(text)
      if (!rows.length) return c.json({ error: 'CSV appears empty' }, 400)
      json = JSON.stringify(rows)
    } catch {
      return c.json({ error: 'Failed to parse CSV' }, 400)
    }
  } else {
    try { JSON.parse(text) } catch { return c.json({ error: 'Invalid JSON' }, 400) }
    json = text
  }

  const dir = resolve(process.cwd(), 'uploads', 'stats')
  mkdirSync(dir, { recursive: true })
  await Bun.write(join(dir, `${auctionId}.json`), json)

  return c.json({ ok: true })
})

// ─── Stats: save config (admin/host) ─────────────────────────────────────────

tournaments.post('/stats/:auctionId/config', requireAuth('admin', 'host'), async (c) => {
  const auth      = c.get('auth')
  const auctionId = Number(c.req.param('auctionId'))
  const auction   = queryOne<{ tournament_id: number }>('SELECT tournament_id FROM auctions WHERE id = ?', [auctionId])
  if (!auction) return c.json({ error: 'Auction not found' }, 404)
  const tournament = queryOne<Tournament>('SELECT * FROM tournaments WHERE id = ?', [auction.tournament_id])
  if (!tournament || !canAccess(auth, tournament)) return c.json({ error: 'Forbidden' }, 403)

  const body = await c.req.json()
  const dir  = resolve(process.cwd(), 'uploads', 'stats')
  mkdirSync(dir, { recursive: true })
  await Bun.write(join(dir, `${auctionId}.config.json`), JSON.stringify(body))
  return c.json({ ok: true })
})

// ─── Stats: delete (admin/host) ───────────────────────────────────────────────

tournaments.delete('/stats/:auctionId', requireAuth('admin', 'host'), (c) => {
  const auth      = c.get('auth')
  const auctionId = Number(c.req.param('auctionId'))
  const auction   = queryOne<{ tournament_id: number }>('SELECT tournament_id FROM auctions WHERE id = ?', [auctionId])
  if (!auction) return c.json({ error: 'Auction not found' }, 404)
  const tournament = queryOne<Tournament>('SELECT * FROM tournaments WHERE id = ?', [auction.tournament_id])
  if (!tournament || !canAccess(auth, tournament)) return c.json({ error: 'Forbidden' }, 403)

  const statsPath  = resolve(process.cwd(), 'uploads', 'stats', `${auctionId}.json`)
  const configPath = resolve(process.cwd(), 'uploads', 'stats', `${auctionId}.config.json`)
  if (existsSync(statsPath))  unlinkSync(statsPath)
  if (existsSync(configPath)) unlinkSync(configPath)
  return c.json({ ok: true })
})

export default tournaments
