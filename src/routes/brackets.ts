import { Hono } from 'hono'
import { queryAll, queryOne, execute, transaction } from '../db/database'
import { requireAuth, type AuthEnv } from '../middleware/auth'
import type { Bracket, Match, GameMap, Faction, Matchup, Tournament, PickBanSession, Auction, Captain, CaptainJwtPayload, HostJwtPayload } from '../types'
import { broadcastPickBanUpdate } from '../ws/pickBanRoom'

const brackets = new Hono<AuthEnv>()

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function hostOwns(tournament: Tournament, auth: AuthEnv['Variables']['auth']): boolean {
  if (auth.role === 'admin') return true
  if (auth.role === 'host') return tournament.id === (auth as HostJwtPayload).tournamentId
  return false
}

function getTournamentForBracket(bracketId: number): Tournament | null {
  return queryOne<Tournament>(
    `SELECT t.* FROM tournaments t JOIN brackets b ON b.tournament_id = t.id WHERE b.id = ?`,
    [bracketId]
  )
}

// ─── Bracket CRUD ─────────────────────────────────────────────────────────────

brackets.get('/tournament/:slug', requireAuth('admin', 'host', 'auctioneer', 'captain'), (c) => {
  const auth       = c.get('auth')
  const tournament = queryOne<Tournament>('SELECT * FROM tournaments WHERE slug = ?', [c.req.param('slug')])
  if (!tournament) return c.json({ error: 'Tournament not found' }, 404)

  if (auth.role === 'host'       && !hostOwns(tournament, auth))         return c.json({ error: 'Forbidden' }, 403)
  if (auth.role === 'auctioneer' && tournament.id !== auth.projectId)    return c.json({ error: 'Forbidden' }, 403)
  if (auth.role === 'captain') {
    const row = queryOne<{ tournament_id: number }>(
      'SELECT tournament_id FROM auctions WHERE id = ?', [(auth as CaptainJwtPayload).auctionId]
    )
    if (row?.tournament_id !== tournament.id) return c.json({ error: 'Forbidden' }, 403)
  }

  return c.json(queryAll<Bracket>(
    'SELECT * FROM brackets WHERE tournament_id = ? ORDER BY created_at ASC', [tournament.id]
  ))
})

brackets.get('/tournament/:slug/public', (c) => {
  const tournament = queryOne<Tournament>('SELECT * FROM tournaments WHERE slug = ?', [c.req.param('slug')])
  if (!tournament) return c.json({ error: 'Tournament not found' }, 404)
  return c.json(queryAll<Bracket>(
    'SELECT * FROM brackets WHERE tournament_id = ? AND is_public = 1 ORDER BY created_at ASC',
    [tournament.id]
  ))
})

brackets.get('/:id', async (c) => {
  const id      = Number(c.req.param('id'))
  const bracket = queryOne<Bracket>('SELECT * FROM brackets WHERE id = ?', [id])
  if (!bracket) return c.json({ error: 'Bracket not found' }, 404)

  const matches = queryAll(
    `SELECT m.*,
       ca.display_name as captain_a_name, ca.team_name as team_a_name,
       cb.display_name as captain_b_name, cb.team_name as team_b_name,
       mp.name         as map_name,       mp.image_path as map_image,
       fa.name         as faction_a_name, fb.name       as faction_b_name
     FROM matches m
     LEFT JOIN captains  ca ON ca.id = m.captain_a_id
     LEFT JOIN captains  cb ON cb.id = m.captain_b_id
     LEFT JOIN matchups  mu ON mu.id = m.matchup_id
     LEFT JOIN maps      mp ON mp.id = mu.map_id
     LEFT JOIN factions  fa ON fa.id = mu.faction_a_id
     LEFT JOIN factions  fb ON fb.id = mu.faction_b_id
     WHERE m.bracket_id = ?
     ORDER BY m.round ASC, m.match_order ASC`,
    [id]
  )

  return c.json({ bracket, matches })
})

brackets.post('/tournament/:slug', requireAuth('admin', 'host'), async (c) => {
  const auth       = c.get('auth')
  const tournament = queryOne<Tournament>('SELECT * FROM tournaments WHERE slug = ?', [c.req.param('slug')])
  if (!tournament) return c.json({ error: 'Tournament not found' }, 404)

  if (!hostOwns(tournament, auth)) return c.json({ error: 'Forbidden' }, 403)

  const data = await c.req.json<{ name: string; auction_id?: number }>()

  if (data.auction_id) {
    const auction = queryOne<Auction>(
      'SELECT id, status FROM auctions WHERE id = ? AND tournament_id = ?',
      [data.auction_id, tournament.id]
    )
    if (!auction) return c.json({ error: 'Auction not found in this tournament' }, 404)
  }

  execute(
    'INSERT INTO brackets (tournament_id, auction_id, name) VALUES (?, ?, ?)',
    [tournament.id, data.auction_id ?? null, data.name]
  )
  return c.json(queryOne<Bracket>(
    'SELECT * FROM brackets WHERE tournament_id = ? ORDER BY id DESC LIMIT 1', [tournament.id]
  )!, 201)
})

brackets.patch('/:id', requireAuth('admin', 'host'), async (c) => {
  const auth    = c.get('auth')
  const id      = Number(c.req.param('id'))
  const bracket = queryOne<Bracket>('SELECT * FROM brackets WHERE id = ?', [id])
  if (!bracket) return c.json({ error: 'Bracket not found' }, 404)
  const tournament = getTournamentForBracket(id)!
  if (!hostOwns(tournament, auth)) return c.json({ error: 'Forbidden' }, 403)

  const data = await c.req.json<{ name?: string; auction_id?: number | null }>()
  if (data.name       !== undefined) execute('UPDATE brackets SET name = ? WHERE id = ?',       [data.name, id])
  if (data.auction_id !== undefined) execute('UPDATE brackets SET auction_id = ? WHERE id = ?', [data.auction_id, id])
  return c.json(queryOne<Bracket>('SELECT * FROM brackets WHERE id = ?', [id]))
})

brackets.post('/:id/publish', requireAuth('admin', 'host'), (c) => {
  const auth    = c.get('auth')
  const id      = Number(c.req.param('id'))
  const bracket = queryOne<Bracket>('SELECT * FROM brackets WHERE id = ?', [id])
  if (!bracket) return c.json({ error: 'Bracket not found' }, 404)
  const tournament = getTournamentForBracket(id)!
  if (!hostOwns(tournament, auth)) return c.json({ error: 'Forbidden' }, 403)

  const matchCount = queryOne<{ count: number }>(
    'SELECT COUNT(*) as count FROM matches WHERE bracket_id = ?', [id]
  )
  if (!matchCount || matchCount.count === 0) return c.json({ error: 'Generate matches before publishing' }, 400)
  execute('UPDATE brackets SET is_public = 1 WHERE id = ?', [id])
  return c.json({ ok: true })
})

brackets.post('/:id/unpublish', requireAuth('admin', 'host'), (c) => {
  const auth    = c.get('auth')
  const id      = Number(c.req.param('id'))
  const bracket = queryOne<Bracket>('SELECT * FROM brackets WHERE id = ?', [id])
  if (!bracket) return c.json({ error: 'Bracket not found' }, 404)
  const tournament = getTournamentForBracket(id)!
  if (!hostOwns(tournament, auth)) return c.json({ error: 'Forbidden' }, 403)
  execute('UPDATE brackets SET is_public = 0 WHERE id = ?', [id])
  return c.json({ ok: true })
})

brackets.delete('/:id', requireAuth('admin', 'host'), (c) => {
  const auth    = c.get('auth')
  const id      = Number(c.req.param('id'))
  const bracket = queryOne<Bracket>('SELECT * FROM brackets WHERE id = ?', [id])
  if (!bracket) return c.json({ error: 'Bracket not found' }, 404)
  const tournament = getTournamentForBracket(id)!
  if (!hostOwns(tournament, auth)) return c.json({ error: 'Forbidden' }, 403)

  const hasResults = queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM matches WHERE bracket_id = ? AND status = 'played'`, [id]
  )
  if (hasResults && hasResults.count > 0) return c.json({ error: 'Cannot delete a bracket with match results' }, 409)
  execute('DELETE FROM brackets WHERE id = ?', [id])
  return c.json({ ok: true })
})

// ─── Bracket generation ───────────────────────────────────────────────────────

brackets.post('/:id/generate', requireAuth('admin', 'host'), async (c) => {
  const auth    = c.get('auth')
  const id      = Number(c.req.param('id'))
  const bracket = queryOne<Bracket>('SELECT * FROM brackets WHERE id = ?', [id])
  if (!bracket) return c.json({ error: 'Bracket not found' }, 404)
  const tournament = getTournamentForBracket(id)!
  if (!hostOwns(tournament, auth)) return c.json({ error: 'Forbidden' }, 403)

  const existing = queryOne<{ count: number }>(
    'SELECT COUNT(*) as count FROM matches WHERE bracket_id = ?', [id]
  )
  if (existing && existing.count > 0) {
    const hasPlayed = queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM matches WHERE bracket_id = ? AND status = 'played'`, [id]
    )
    if (hasPlayed && hasPlayed.count > 0) {
      return c.json({ error: 'Cannot regenerate after matches have been played' }, 409)
    }
    transaction(() => {
      execute('DELETE FROM matches WHERE bracket_id = ?', [id])
      execute("UPDATE brackets SET slots = '[]', locked = 0 WHERE id = ?", [id])
    })
  }

  if (!bracket.auction_id) return c.json({ error: 'Bracket has no associated auction' }, 400)

  const auction = queryOne<Auction>('SELECT * FROM auctions WHERE id = ?', [bracket.auction_id])
  if (!auction) return c.json({ error: 'Auction not found' }, 404)

  const captains = queryAll<Captain>(
    'SELECT * FROM captains WHERE auction_id = ? ORDER BY id ASC', [bracket.auction_id]
  )
  if (captains.length !== 8) {
    return c.json({ error: `Expected 8 captains, found ${captains.length}` }, 409)
  }

  const shuffled  = shuffle(captains)
  const groupA    = shuffled.slice(0, 4)
  const groupB    = shuffled.slice(4, 8)
  const groups    = [groupA, groupB]
  const groupLabels = ['A', 'B']

  const slots = [
    ...groupA.map((c, i) => ({ captain_id: c.id, group: 'A', seed: i + 1 })),
    ...groupB.map((c, i) => ({ captain_id: c.id, group: 'B', seed: i + 1 })),
  ]

  function roundRobin(group: Captain[]): Array<[Captain, Captain][]> {
    const [a, b, c, d] = group
    return [
      [[a, b], [c, d]],
      [[a, c], [b, d]],
      [[a, d], [b, c]],
    ]
  }

  interface Scheduled {
    round:       number
    match_order: number
    match_label: string
    group_label: string | null
    a:           number | null
    b:           number | null
    is_finals:   number
  }

  const scheduled: Scheduled[] = []

  for (let g = 0; g < groups.length; g++) {
    const label  = groupLabels[g]
    const rounds = roundRobin(groups[g])
    for (let r = 0; r < rounds.length; r++) {
      const round = r + 1
      for (let m = 0; m < rounds[r].length; m++) {
        const [a, b] = rounds[r][m]
        scheduled.push({
          round,
          match_order: m + g * 2,
          match_label: `Group ${label}`,
          group_label: label,
          a: a.id,
          b: b.id,
          is_finals: 0,
        })
      }
    }
  }

  const semiRound   = 4
  const finalsRound = 5
  scheduled.push(
    { round: semiRound,   match_order: 0, match_label: 'Semi-Final 1', group_label: null, a: null, b: null, is_finals: 0 },
    { round: semiRound,   match_order: 1, match_label: 'Semi-Final 2', group_label: null, a: null, b: null, is_finals: 0 },
    { round: finalsRound, match_order: 0, match_label: 'Final',        group_label: null, a: null, b: null, is_finals: 1 },
  )

  const matchRows = transaction(() => {
    const inserted: Match[] = []
    for (const s of scheduled) {
      // Finals matchup is bracket-specific; shared rounds use tournament-wide matchup
      const matchup = s.is_finals
        ? queryOne<{ id: number }>('SELECT id FROM matchups WHERE bracket_id = ? AND round = ?', [id, s.round])
        : queryOne<{ id: number }>('SELECT id FROM matchups WHERE tournament_id = ? AND round = ? AND bracket_id IS NULL', [tournament.id, s.round])
      execute(
        `INSERT INTO matches
           (bracket_id, round, match_order, match_label, group_label, captain_a_id, captain_b_id, matchup_id, is_finals)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, s.round, s.match_order, s.match_label, s.group_label, s.a, s.b, matchup?.id ?? null, s.is_finals]
      )
      inserted.push(queryOne<Match>(
        'SELECT * FROM matches WHERE bracket_id = ? ORDER BY id DESC LIMIT 1', [id]
      )!)
    }
    execute('UPDATE brackets SET slots = ?, locked = 1 WHERE id = ?', [JSON.stringify(slots), id])
    return inserted
  })

  return c.json({ ok: true, slots, matches: matchRows }, 201)
})

// ─── Bracket reset (admin only) ───────────────────────────────────────────────

brackets.post('/:id/reset', requireAuth('admin', 'host'), (c) => {
  const id      = Number(c.req.param('id'))
  const bracket = queryOne<Bracket>('SELECT * FROM brackets WHERE id = ?', [id])
  if (!bracket) return c.json({ error: 'Bracket not found' }, 404)

  transaction(() => {
    execute('DELETE FROM matches WHERE bracket_id = ?', [id])
    execute("UPDATE brackets SET slots = '[]', locked = 0 WHERE id = ?", [id])
  })

  return c.json({ ok: true })
})

// ─── Match participants ───────────────────────────────────────────────────────

brackets.patch('/matches/:matchId/participants', requireAuth('admin', 'host'), async (c) => {
  const auth    = c.get('auth')
  const matchId = Number(c.req.param('matchId'))
  const match   = queryOne<Match>('SELECT * FROM matches WHERE id = ?', [matchId])
  if (!match) return c.json({ error: 'Match not found' }, 404)
  const tournament = getTournamentForBracket(match.bracket_id)!
  if (!hostOwns(tournament, auth)) return c.json({ error: 'Forbidden' }, 403)

  const data = await c.req.json<{ captain_a_id?: number | null; captain_b_id?: number | null }>()
  const fields: string[] = []; const vals: unknown[] = []
  if (data.captain_a_id !== undefined) { fields.push('captain_a_id = ?'); vals.push(data.captain_a_id) }
  if (data.captain_b_id !== undefined) { fields.push('captain_b_id = ?'); vals.push(data.captain_b_id) }
  if (!fields.length) return c.json({ error: 'Nothing to update' }, 400)

  vals.push(matchId)
  execute(`UPDATE matches SET ${fields.join(', ')} WHERE id = ?`, vals as never[])
  return c.json(queryOne<Match>('SELECT * FROM matches WHERE id = ?', [matchId]))
})

// ─── Match results ────────────────────────────────────────────────────────────
// After semi-final results are entered and both finalists are known on the
// finals match, auto-create a pick-ban session if the tournament has a
// finals_map_pool configured (exactly 5 maps).

brackets.patch('/matches/:matchId/result', requireAuth('admin', 'host'), async (c) => {
  const auth    = c.get('auth')
  const matchId = Number(c.req.param('matchId'))
  const match   = queryOne<Match>('SELECT * FROM matches WHERE id = ?', [matchId])
  if (!match) return c.json({ error: 'Match not found' }, 404)

  const tournament = getTournamentForBracket(match.bracket_id)!
  if (!hostOwns(tournament, auth)) return c.json({ error: 'Forbidden' }, 403)

  const data     = await c.req.json<{ score_a: number; score_b: number }>()
  const winnerId = data.score_a > data.score_b ? match.captain_a_id
    : data.score_b > data.score_a ? match.captain_b_id
    : null

  transaction(() => {
    execute(
      `UPDATE matches SET score_a = ?, score_b = ?, winner_captain_id = ?, status = 'played' WHERE id = ?`,
      [data.score_a, data.score_b, winnerId, matchId]
    )

    // For knockout rounds (semi-finals round 4 → finals round 5), auto-propagate the winner
    if (winnerId !== null && match.round >= 4) {
      const nextMatch = queryOne<Match>(
        `SELECT * FROM matches
         WHERE bracket_id = ? AND round = ? AND (captain_a_id IS NULL OR captain_b_id IS NULL)
         ORDER BY match_order ASC LIMIT 1`,
        [match.bracket_id, match.round + 1]
      )
      if (nextMatch) {
        if (nextMatch.captain_a_id === null) {
          execute('UPDATE matches SET captain_a_id = ? WHERE id = ?', [winnerId, nextMatch.id])
        } else {
          execute('UPDATE matches SET captain_b_id = ? WHERE id = ?', [winnerId, nextMatch.id])
        }
      }
    }

    // Group stage → semi-finals auto-advancement
    if (match.round <= 3 && match.group_label) {
      const groupMatches = queryAll<Match>(
        `SELECT * FROM matches WHERE bracket_id = ? AND group_label = ?`,
        [match.bracket_id, match.group_label]
      )
      if (groupMatches.every(gm => gm.status === 'played')) {
        const captainIds = new Set<number>()
        for (const gm of groupMatches) {
          if (gm.captain_a_id) captainIds.add(gm.captain_a_id)
          if (gm.captain_b_id) captainIds.add(gm.captain_b_id)
        }
        const standings = new Map<number, { wins: number; gd: number }>()
        for (const cid of captainIds) standings.set(cid, { wins: 0, gd: 0 })
        for (const gm of groupMatches) {
          if (gm.winner_captain_id && standings.has(gm.winner_captain_id)) {
            standings.get(gm.winner_captain_id)!.wins++
          }
          if (gm.captain_a_id && standings.has(gm.captain_a_id)) {
            standings.get(gm.captain_a_id)!.gd += (gm.score_a ?? 0) - (gm.score_b ?? 0)
          }
          if (gm.captain_b_id && standings.has(gm.captain_b_id)) {
            standings.get(gm.captain_b_id)!.gd += (gm.score_b ?? 0) - (gm.score_a ?? 0)
          }
        }
        const sorted = [...captainIds].sort((a, b) => {
          const sa = standings.get(a)!; const sb = standings.get(b)!
          return sb.wins !== sa.wins ? sb.wins - sa.wins : sb.gd - sa.gd
        })
        const [first, second] = sorted
        const sf1 = queryOne<Match>(
          `SELECT * FROM matches WHERE bracket_id = ? AND round = 4 AND match_order = 0`, [match.bracket_id]
        )
        const sf2 = queryOne<Match>(
          `SELECT * FROM matches WHERE bracket_id = ? AND round = 4 AND match_order = 1`, [match.bracket_id]
        )
        if (match.group_label === 'A') {
          if (sf1) execute('UPDATE matches SET captain_a_id = ? WHERE id = ?', [first, sf1.id])
          if (sf2) execute('UPDATE matches SET captain_b_id = ? WHERE id = ?', [second, sf2.id])
        } else {
          if (sf2) execute('UPDATE matches SET captain_a_id = ? WHERE id = ?', [first, sf2.id])
          if (sf1) execute('UPDATE matches SET captain_b_id = ? WHERE id = ?', [second, sf1.id])
        }
      }
    }
  })

  // After propagation, check if we should auto-trigger a pick-ban session
  const updatedMatch = queryOne<Match>('SELECT * FROM matches WHERE id = ?', [matchId])!
  if (updatedMatch.round >= 4) {
    // Look for the finals match now that the winner has been propagated
    const finalsMatch = queryOne<Match>(
      `SELECT * FROM matches WHERE bracket_id = ? AND is_finals = 1`, [match.bracket_id]
    )
    if (
      finalsMatch &&
      finalsMatch.captain_a_id &&
      finalsMatch.captain_b_id &&
      !queryOne('SELECT id FROM pick_ban_sessions WHERE match_id = ?', [finalsMatch.id])
    ) {
      const mapPool: number[] = JSON.parse(tournament.finals_map_pool ?? '[]')
      if (mapPool.length === 5) {
        execute(
          `INSERT INTO pick_ban_sessions
             (bracket_id, match_id, captain_a_id, captain_b_id, map_pool)
           VALUES (?, ?, ?, ?, ?)`,
          [finalsMatch.bracket_id, finalsMatch.id, finalsMatch.captain_a_id, finalsMatch.captain_b_id, JSON.stringify(mapPool)]
        )
      }
    }
  }

  return c.json(queryOne<Match>('SELECT * FROM matches WHERE id = ?', [matchId]))
})

// ─── Matchups ─────────────────────────────────────────────────────────────────

brackets.get('/tournament/:slug/matchups', requireAuth('admin', 'host', 'auctioneer', 'captain'), (c) => {
  const auth       = c.get('auth')
  const tournament = queryOne<Tournament>('SELECT * FROM tournaments WHERE slug = ?', [c.req.param('slug')])
  if (!tournament) return c.json({ error: 'Tournament not found' }, 404)

  if (auth.role === 'host'       && !hostOwns(tournament, auth))         return c.json({ error: 'Forbidden' }, 403)
  if (auth.role === 'auctioneer' && tournament.id !== auth.projectId)    return c.json({ error: 'Forbidden' }, 403)
  if (auth.role === 'captain') {
    const row = queryOne<{ tournament_id: number }>(
      'SELECT tournament_id FROM auctions WHERE id = ?', [(auth as CaptainJwtPayload).auctionId]
    )
    if (row?.tournament_id !== tournament.id) return c.json({ error: 'Forbidden' }, 403)
  }

  return c.json(queryAll(
    `SELECT mu.*, mp.name as map_name, mp.image_path as map_image,
            fa.name as faction_a_name, fb.name as faction_b_name
     FROM matchups mu
     LEFT JOIN maps     mp ON mp.id = mu.map_id
     LEFT JOIN factions fa ON fa.id = mu.faction_a_id
     LEFT JOIN factions fb ON fb.id = mu.faction_b_id
     WHERE mu.tournament_id = ? AND mu.bracket_id IS NULL
     ORDER BY mu.round ASC`,
    [tournament.id]
  ))
})

brackets.post('/tournament/:slug/matchups/roll', requireAuth('admin', 'host'), async (c) => {
  const auth       = c.get('auth')
  const tournament = queryOne<Tournament>('SELECT * FROM tournaments WHERE slug = ?', [c.req.param('slug')])
  if (!tournament) return c.json({ error: 'Tournament not found' }, 404)
  if (!hostOwns(tournament, auth)) return c.json({ error: 'Forbidden' }, 403)

  const { round, label, excluded_map_ids = [] } =
    await c.req.json<{ round: number; label?: string; excluded_map_ids?: number[] }>()
  if (!round || round < 1) return c.json({ error: 'Invalid round number' }, 400)

  const existing = queryOne<Matchup>(
    'SELECT * FROM matchups WHERE tournament_id = ? AND round = ? AND bracket_id IS NULL', [tournament.id, round]
  )

  // Maps are now global — just filter active ones minus exclusions
  const allMaps   = queryAll<GameMap>('SELECT * FROM maps WHERE is_active = 1')
  const available = allMaps.filter(m => !excluded_map_ids.includes(m.id))
  if (available.length === 0) return c.json({ error: 'No maps available after exclusions' }, 400)

  const factions = queryAll<Faction>('SELECT * FROM factions ORDER BY id ASC')
  if (factions.length < 2) return c.json({ error: 'Not enough factions seeded' }, 500)

  const map      = available[Math.floor(Math.random() * available.length)]
  const shuffled = shuffle(factions)
  const fa       = shuffled[0]
  const fb       = shuffled.find(f => f.id !== fa.id)!

  if (existing) {
    execute(
      'UPDATE matchups SET label=?, map_id=?, faction_a_id=?, faction_b_id=?, is_public=1 WHERE id=?',
      [label ?? existing.label, map.id, fa.id, fb.id, existing.id]
    )
  } else {
    execute(
      'INSERT INTO matchups (tournament_id, round, label, map_id, faction_a_id, faction_b_id, is_public) VALUES (?,?,?,?,?,?,1)',
      [tournament.id, round, label ?? `Round ${round}`, map.id, fa.id, fb.id]
    )
  }

  const matchup = queryOne<Matchup>(
    `SELECT mu.*, mp.name as map_name, mp.image_path as map_image, fa.name as faction_a_name, fb.name as faction_b_name
     FROM matchups mu
     LEFT JOIN maps     mp ON mp.id = mu.map_id
     LEFT JOIN factions fa ON fa.id = mu.faction_a_id
     LEFT JOIN factions fb ON fb.id = mu.faction_b_id
     WHERE mu.tournament_id = ? AND mu.round = ? AND mu.bracket_id IS NULL`, [tournament.id, round]
  )!

  execute(
    `UPDATE matches SET matchup_id = ?
     WHERE matchup_id IS NULL
       AND bracket_id IN (SELECT id FROM brackets WHERE tournament_id = ?)
       AND round = ?`,
    [matchup.id, tournament.id, round]
  )

  return c.json(matchup)
})

brackets.post('/tournament/:slug/matchups/manual', requireAuth('admin', 'host'), async (c) => {
  const auth       = c.get('auth')
  const tournament = queryOne<Tournament>('SELECT * FROM tournaments WHERE slug = ?', [c.req.param('slug')])
  if (!tournament) return c.json({ error: 'Tournament not found' }, 404)
  if (!hostOwns(tournament, auth)) return c.json({ error: 'Forbidden' }, 403)

  const { round, map_id, faction_a_id, faction_b_id, label } =
    await c.req.json<{ round: number; map_id: number; faction_a_id: number; faction_b_id: number; label?: string }>()
  if (!round || round < 1)                         return c.json({ error: 'Invalid round' }, 400)
  if (!map_id || !faction_a_id || !faction_b_id)  return c.json({ error: 'map_id, faction_a_id, faction_b_id required' }, 400)

  const existing = queryOne<Matchup>('SELECT * FROM matchups WHERE tournament_id = ? AND round = ? AND bracket_id IS NULL', [tournament.id, round])

  if (existing) {
    execute('UPDATE matchups SET label=?, map_id=?, faction_a_id=?, faction_b_id=? WHERE id=?',
      [label ?? existing.label, map_id, faction_a_id, faction_b_id, existing.id])
  } else {
    execute('INSERT INTO matchups (tournament_id, round, label, map_id, faction_a_id, faction_b_id, is_public) VALUES (?,?,?,?,?,?,0)',
      [tournament.id, round, label ?? `Round ${round}`, map_id, faction_a_id, faction_b_id])
  }

  const matchup = queryOne<Matchup>(
    `SELECT mu.*, mp.name as map_name, mp.image_path as map_image, fa.name as faction_a_name, fb.name as faction_b_name
     FROM matchups mu
     LEFT JOIN maps     mp ON mp.id = mu.map_id
     LEFT JOIN factions fa ON fa.id = mu.faction_a_id
     LEFT JOIN factions fb ON fb.id = mu.faction_b_id
     WHERE mu.tournament_id = ? AND mu.round = ? AND mu.bracket_id IS NULL`, [tournament.id, round]
  )!

  execute(
    `UPDATE matches SET matchup_id = ?
     WHERE matchup_id IS NULL
       AND bracket_id IN (SELECT id FROM brackets WHERE tournament_id = ?)
       AND round = ?`,
    [matchup.id, tournament.id, round]
  )

  return c.json(matchup)
})

brackets.post('/matchups/:id/publish', requireAuth('admin', 'host'), (c) => {
  const auth    = c.get('auth')
  const id      = Number(c.req.param('id'))
  const matchup = queryOne<Matchup>('SELECT * FROM matchups WHERE id = ?', [id])
  if (!matchup) return c.json({ error: 'Matchup not found' }, 404)
  const tournament = queryOne<Tournament>('SELECT * FROM tournaments WHERE id = ?', [matchup.tournament_id])!
  if (!hostOwns(tournament, auth)) return c.json({ error: 'Forbidden' }, 403)
  if (!matchup.map_id) return c.json({ error: 'Matchup has no map assigned yet' }, 400)
  execute('UPDATE matchups SET is_public = 1 WHERE id = ?', [id])
  return c.json({ ok: true })
})

brackets.post('/matchups/:id/unpublish', requireAuth('admin', 'host'), (c) => {
  const auth    = c.get('auth')
  const id      = Number(c.req.param('id'))
  const matchup = queryOne<Matchup>('SELECT * FROM matchups WHERE id = ?', [id])
  if (!matchup) return c.json({ error: 'Matchup not found' }, 404)
  const tournament = queryOne<Tournament>('SELECT * FROM tournaments WHERE id = ?', [matchup.tournament_id])!
  if (!hostOwns(tournament, auth)) return c.json({ error: 'Forbidden' }, 403)
  execute('UPDATE matchups SET is_public = 0 WHERE id = ?', [id])
  return c.json({ ok: true })
})

brackets.patch('/matchups/:id', requireAuth('admin', 'host'), async (c) => {
  const auth    = c.get('auth')
  const id      = Number(c.req.param('id'))
  const matchup = queryOne<Matchup>('SELECT * FROM matchups WHERE id = ?', [id])
  if (!matchup) return c.json({ error: 'Matchup not found' }, 404)
  const tournament = queryOne<Tournament>('SELECT * FROM tournaments WHERE id = ?', [matchup.tournament_id])!
  if (!hostOwns(tournament, auth)) return c.json({ error: 'Forbidden' }, 403)

  const data = await c.req.json<{ map_id?: number | null; faction_a_id?: number | null; faction_b_id?: number | null; label?: string }>()
  const fields: string[] = []; const vals: unknown[] = []
  if (data.map_id       !== undefined) { fields.push('map_id = ?');       vals.push(data.map_id) }
  if (data.faction_a_id !== undefined) { fields.push('faction_a_id = ?'); vals.push(data.faction_a_id) }
  if (data.faction_b_id !== undefined) { fields.push('faction_b_id = ?'); vals.push(data.faction_b_id) }
  if (data.label        !== undefined) { fields.push('label = ?');        vals.push(data.label) }
  if (!fields.length) return c.json({ error: 'Nothing to update' }, 400)
  vals.push(id)
  execute(`UPDATE matchups SET ${fields.join(', ')} WHERE id = ?`, vals as never[])
  return c.json(queryOne<Matchup>(
    `SELECT mu.*, mp.name as map_name, mp.image_path as map_image, fa.name as faction_a_name, fb.name as faction_b_name
     FROM matchups mu
     LEFT JOIN maps     mp ON mp.id = mu.map_id
     LEFT JOIN factions fa ON fa.id = mu.faction_a_id
     LEFT JOIN factions fb ON fb.id = mu.faction_b_id
     WHERE mu.id = ?`, [id]
  ))
})

// ─── Pick-Ban ─────────────────────────────────────────────────────────────────

interface PickBanBanEntry {
  side:   'a' | 'b'
  map_id: number
}

function safeSession(session: PickBanSession) {
  return {
    ...session,
    a_pick: session.revealed ? session.a_pick : (session.a_pick !== null ? true : null),
    b_pick: session.revealed ? session.b_pick : (session.b_pick !== null ? true : null),
  }
}

function enrichBans(session: PickBanSession) {
  const bans: PickBanBanEntry[] = JSON.parse(session.bans ?? '[]')
  return bans.map(b => {
    const map = queryOne<{ name: string }>('SELECT name FROM maps WHERE id = ?', [b.map_id])
    return { ...b, map_name: map?.name ?? null }
  })
}

interface MapDetail { id: number; name: string; game_id: string | null; image_path: string | null }
interface CaptainDetail { id: number; display_name: string; team_name: string | null }

function getMapDetail(mapId: number): MapDetail {
  return queryOne<MapDetail>('SELECT id, name, game_id, image_path FROM maps WHERE id = ?', [mapId])
    ?? { id: mapId, name: `Map ${mapId}`, game_id: null, image_path: null }
}

function enrichPickBan(session: PickBanSession) {
  const pool: number[] = JSON.parse(session.map_pool ?? '[]')
  return {
    mapPool:   pool.map(getMapDetail),
    captainA:  queryOne<CaptainDetail>('SELECT id, display_name, team_name FROM captains WHERE id = ?', [session.captain_a_id]) ?? null,
    captainB:  queryOne<CaptainDetail>('SELECT id, display_name, team_name FROM captains WHERE id = ?', [session.captain_b_id]) ?? null,
    chosenMap: session.chosen_map_id ? getMapDetail(session.chosen_map_id) : null,
  }
}

// Manual pick-ban creation (host/admin can override auto-trigger).
// Uses the tournament's finals_map_pool unless a custom map_pool is provided.
brackets.post('/matches/:matchId/pickban', requireAuth('admin', 'host'), async (c) => {
  const auth    = c.get('auth')
  const matchId = Number(c.req.param('matchId'))
  const match   = queryOne<Match>('SELECT * FROM matches WHERE id = ?', [matchId])
  if (!match)           return c.json({ error: 'Match not found' }, 404)
  if (!match.is_finals) return c.json({ error: 'Pick-ban only for finals matches' }, 400)
  if (!match.captain_a_id || !match.captain_b_id) return c.json({ error: 'Finalists not yet determined' }, 400)
  if (queryOne('SELECT id FROM pick_ban_sessions WHERE match_id = ?', [matchId])) {
    return c.json({ error: 'Pick-ban session already exists' }, 409)
  }

  const tournament = getTournamentForBracket(match.bracket_id)!
  if (!hostOwns(tournament, auth)) return c.json({ error: 'Forbidden' }, 403)

  // Accept optional override; otherwise use tournament's finals_map_pool
  const body = await c.req.json<{ map_pool?: number[] }>().catch(() => ({} as { map_pool?: number[] }))
  const mapPool: number[] = body.map_pool ?? JSON.parse(tournament.finals_map_pool ?? '[]')

  if (mapPool.length !== 5) return c.json({ error: 'Exactly 5 maps required in the pool' }, 400)

  for (const mid of mapPool) {
    if (!queryOne('SELECT id FROM maps WHERE id = ? AND is_active = 1', [mid])) {
      return c.json({ error: `Map ${mid} not found or inactive` }, 400)
    }
  }

  execute(
    `INSERT INTO pick_ban_sessions
       (bracket_id, match_id, captain_a_id, captain_b_id, map_pool)
     VALUES (?, ?, ?, ?, ?)`,
    [match.bracket_id, matchId, match.captain_a_id, match.captain_b_id, JSON.stringify(mapPool)]
  )

  return c.json(queryOne<PickBanSession>(
    'SELECT * FROM pick_ban_sessions WHERE match_id = ?', [matchId]
  )!, 201)
})

brackets.get('/pickban/mine', requireAuth('captain'), (c) => {
  const auth      = c.get('auth')
  const captainId = (auth as CaptainJwtPayload).captainId
  const session   = queryOne<PickBanSession>(
    `SELECT * FROM pick_ban_sessions
     WHERE (captain_a_id = ? OR captain_b_id = ?) AND status != 'complete'
     ORDER BY id DESC LIMIT 1`,
    [captainId, captainId]
  )
  if (!session) return c.json(null)
  return c.json({ session: safeSession(session), bans: enrichBans(session), ...enrichPickBan(session) })
})

brackets.get('/pickban/:id', async (c) => {
  const id      = Number(c.req.param('id'))
  const session = queryOne<PickBanSession>('SELECT * FROM pick_ban_sessions WHERE id = ?', [id])
  if (!session) return c.json({ error: 'Session not found' }, 404)
  return c.json({ session: safeSession(session), bans: enrichBans(session), ...enrichPickBan(session) })
})

brackets.get('/match/:matchId/pickban', async (c) => {
  const matchId = Number(c.req.param('matchId'))
  const session = queryOne<PickBanSession>(
    'SELECT * FROM pick_ban_sessions WHERE match_id = ?', [matchId]
  )
  if (!session) return c.json({ error: 'No pick-ban session for this match' }, 404)
  return c.json({ session: safeSession(session), bans: enrichBans(session), ...enrichPickBan(session) })
})

brackets.delete('/pickban/:id', requireAuth('admin', 'host'), (c) => {
  const auth    = c.get('auth')
  const id      = Number(c.req.param('id'))
  const session = queryOne<PickBanSession>('SELECT * FROM pick_ban_sessions WHERE id = ?', [id])
  if (!session) return c.json({ error: 'Session not found' }, 404)
  const tournament = getTournamentForBracket(session.bracket_id)
  if (!tournament || !hostOwns(tournament, auth)) return c.json({ error: 'Forbidden' }, 403)
  execute('UPDATE matches SET matchup_id = NULL WHERE id = ?', [session.match_id])
  execute('DELETE FROM pick_ban_sessions WHERE id = ?', [id])
  return c.json({ ok: true })
})

brackets.post('/pickban/:id/join', requireAuth('captain'), (c) => {
  const auth    = c.get('auth')
  const id      = Number(c.req.param('id'))
  const session = queryOne<PickBanSession>('SELECT * FROM pick_ban_sessions WHERE id = ?', [id])
  if (!session) return c.json({ error: 'Session not found' }, 404)
  if (session.status !== 'waiting') return c.json({ error: 'Session is not waiting for players' }, 400)

  const isA = (auth as CaptainJwtPayload).captainId === session.captain_a_id
  const isB = (auth as CaptainJwtPayload).captainId === session.captain_b_id
  if (!isA && !isB) return c.json({ error: 'You are not a finalist in this match' }, 403)

  if (isA) execute('UPDATE pick_ban_sessions SET a_joined = 1 WHERE id = ?', [id])
  if (isB) execute('UPDATE pick_ban_sessions SET b_joined = 1 WHERE id = ?', [id])

  const updated = queryOne<PickBanSession>('SELECT * FROM pick_ban_sessions WHERE id = ?', [id])!
  if (updated.a_joined && updated.b_joined) {
    execute("UPDATE pick_ban_sessions SET status = 'banning' WHERE id = ?", [id])
  }
  broadcastPickBanUpdate(id)
  return c.json({ ok: true, status: updated.a_joined && updated.b_joined ? 'banning' : 'waiting' })
})

brackets.post('/pickban/:id/ban', requireAuth('captain'), async (c) => {
  const auth    = c.get('auth')
  const id      = Number(c.req.param('id'))
  const session = queryOne<PickBanSession>('SELECT * FROM pick_ban_sessions WHERE id = ?', [id])
  if (!session) return c.json({ error: 'Session not found' }, 404)
  if (session.status !== 'banning') return c.json({ error: 'Not in banning phase' }, 400)

  const isA = (auth as CaptainJwtPayload).captainId === session.captain_a_id
  const isB = (auth as CaptainJwtPayload).captainId === session.captain_b_id
  if (!isA && !isB) return c.json({ error: 'Forbidden' }, 403)

  const sequence: ('a' | 'b')[] = JSON.parse(session.ban_sequence)
  const mySide = isA ? 'a' : 'b'
  if (sequence[session.ban_turn] !== mySide) return c.json({ error: 'Not your turn to ban' }, 400)

  const { map_id } = await c.req.json<{ map_id: number }>()
  const pool: number[] = JSON.parse(session.map_pool)
  if (!pool.includes(map_id)) return c.json({ error: 'Map not in pool' }, 400)

  const bans: PickBanBanEntry[] = JSON.parse(session.bans ?? '[]')
  if (bans.some(b => b.map_id === map_id)) return c.json({ error: 'Map already banned' }, 400)

  bans.push({ side: mySide, map_id })
  const nextTurn = session.ban_turn + 1

  if (nextTurn >= sequence.length) {
    execute(
      "UPDATE pick_ban_sessions SET bans = ?, ban_turn = ?, status = 'picking' WHERE id = ?",
      [JSON.stringify(bans), nextTurn, id]
    )
  } else {
    execute(
      'UPDATE pick_ban_sessions SET bans = ?, ban_turn = ? WHERE id = ?',
      [JSON.stringify(bans), nextTurn, id]
    )
  }

  const updatedSession = queryOne<PickBanSession>('SELECT * FROM pick_ban_sessions WHERE id = ?', [id])!
  broadcastPickBanUpdate(id)
  return c.json({
    ok:        true,
    ban_turn:  nextTurn,
    status:    updatedSession.status,
    next_side: nextTurn < sequence.length ? sequence[nextTurn] : null,
    bans:      enrichBans(updatedSession),
  })
})

brackets.post('/pickban/:id/pick', requireAuth('captain'), async (c) => {
  const auth    = c.get('auth')
  const id      = Number(c.req.param('id'))
  const session = queryOne<PickBanSession>('SELECT * FROM pick_ban_sessions WHERE id = ?', [id])
  if (!session) return c.json({ error: 'Session not found' }, 404)
  if (session.status !== 'picking') return c.json({ error: 'Not in picking phase' }, 400)

  const isA = (auth as CaptainJwtPayload).captainId === session.captain_a_id
  const isB = (auth as CaptainJwtPayload).captainId === session.captain_b_id
  if (!isA && !isB) return c.json({ error: 'Forbidden' }, 403)
  if (isA && session.a_pick !== null) return c.json({ error: 'Already picked' }, 400)
  if (isB && session.b_pick !== null) return c.json({ error: 'Already picked' }, 400)

  const { faction_id } = await c.req.json<{ faction_id: number }>()
  if (!queryOne('SELECT id FROM factions WHERE id = ?', [faction_id])) {
    return c.json({ error: 'Invalid faction' }, 400)
  }

  if (isA) execute('UPDATE pick_ban_sessions SET a_pick = ? WHERE id = ?', [faction_id, id])
  if (isB) execute('UPDATE pick_ban_sessions SET b_pick = ? WHERE id = ?', [faction_id, id])

  const updated = queryOne<PickBanSession>('SELECT * FROM pick_ban_sessions WHERE id = ?', [id])!

  if (updated.a_pick !== null && updated.b_pick !== null) {
    const pool:   number[]          = JSON.parse(session.map_pool)
    const bans:   PickBanBanEntry[] = JSON.parse(updated.bans ?? '[]')
    const banned  = new Set(bans.map(b => b.map_id))
    const chosenMap = pool.find(m => !banned.has(m))!

    const bracket     = queryOne<{ tournament_id: number }>('SELECT tournament_id FROM brackets WHERE id = ?', [session.bracket_id])!
    const finalsRow   = queryOne<{ round: number }>('SELECT round FROM matches WHERE id = ?', [session.match_id])!
    const finalsRound = finalsRow.round

    transaction(() => {
      execute(
        `UPDATE pick_ban_sessions
         SET status = 'complete', chosen_map_id = ?, revealed = 1, completed_at = ?
         WHERE id = ?`,
        [chosenMap, new Date().toISOString(), id]
      )

      const existingMatchup = queryOne<Matchup>(
        'SELECT * FROM matchups WHERE bracket_id = ? AND round = ?',
        [session.bracket_id, finalsRound]
      )

      let matchupId: number
      if (existingMatchup) {
        execute(
          'UPDATE matchups SET map_id = ?, faction_a_id = ?, faction_b_id = ?, label = ?, is_public = 1 WHERE id = ?',
          [chosenMap, updated.a_pick, updated.b_pick, 'Final', existingMatchup.id]
        )
        matchupId = existingMatchup.id
      } else {
        execute(
          'INSERT INTO matchups (tournament_id, bracket_id, round, label, map_id, faction_a_id, faction_b_id, is_public) VALUES (?,?,?,?,?,?,?,1)',
          [bracket.tournament_id, session.bracket_id, finalsRound, 'Final', chosenMap, updated.a_pick, updated.b_pick]
        )
        matchupId = queryOne<{ id: number }>(
          'SELECT id FROM matchups WHERE bracket_id = ? AND round = ?',
          [session.bracket_id, finalsRound]
        )!.id
      }

      execute('UPDATE matches SET matchup_id = ? WHERE id = ?', [matchupId, session.match_id])
    })

    broadcastPickBanUpdate(id)
    return c.json({
      ok:            true,
      status:        'complete',
      revealed:      true,
      chosen_map_id: chosenMap,
      a_faction_id:  updated.a_pick,
      b_faction_id:  updated.b_pick,
    })
  }

  broadcastPickBanUpdate(id)
  return c.json({ ok: true, status: 'picking', waiting_for_other: true })
})

// ─── Override pick-ban result (admin/host) ────────────────────────────────────

brackets.patch('/pickban/:id/override', requireAuth('admin', 'host'), async (c) => {
  const id      = Number(c.req.param('id'))
  const session = queryOne<PickBanSession>('SELECT * FROM pick_ban_sessions WHERE id = ?', [id])
  if (!session) return c.json({ error: 'Not found' }, 404)
  if (session.status !== 'complete') return c.json({ error: 'Session not complete' }, 400)

  const { chosen_map_id, a_pick, b_pick } =
    await c.req.json<{ chosen_map_id?: number; a_pick?: number; b_pick?: number }>()

  const newMap = chosen_map_id ?? session.chosen_map_id
  const newA   = a_pick        ?? (session.a_pick as number)
  const newB   = b_pick        ?? (session.b_pick as number)

  transaction(() => {
    execute(
      'UPDATE pick_ban_sessions SET chosen_map_id = ?, a_pick = ?, b_pick = ? WHERE id = ?',
      [newMap, newA, newB, id]
    )
    const matchup = queryOne<{ id: number }>(
      'SELECT mu.id FROM matchups mu JOIN matches m ON m.matchup_id = mu.id WHERE m.id = ?',
      [session.match_id]
    )
    if (matchup) {
      execute(
        'UPDATE matchups SET map_id = ?, faction_a_id = ?, faction_b_id = ? WHERE id = ?',
        [newMap, newA, newB, matchup.id]
      )
    }
  })

  const updated = queryOne<PickBanSession>('SELECT * FROM pick_ban_sessions WHERE id = ?', [id])!
  return c.json({ session: safeSession(updated), bans: enrichBans(updated), ...enrichPickBan(updated) })
})

export default brackets
