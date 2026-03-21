import { Hono } from 'hono'
import { queryOne, execute } from '../db/database'
import { issueAuthCookie, clearAuthCookie, requireAuth } from '../middleware/auth'
import type { Captain, Tournament } from '../types'
import type { AuthEnv, } from '../middleware/auth'
import type { HostJwtPayload, CaptainJwtPayload } from '../types'

const auth = new Hono<AuthEnv>()

// ─── Token generator ──────────────────────────────────────────────────────────
// Produces codes like "DRAFT-A3F9K2" — unambiguous chars only.

function generateToken(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let r = 'DRAFT-'
  for (let i = 0; i < 6; i++) r += chars[Math.floor(Math.random() * chars.length)]
  return r
}

// ─── Admin Login ──────────────────────────────────────────────────────────────

auth.post('/admin/login', async (c) => {
  const { password } = await c.req.json<{ password: string }>()
  const adminPassword = process.env.ADMIN_PASSWORD
  if (!adminPassword) return c.json({ error: 'Admin account not configured' }, 500)
  if (password !== adminPassword) return c.json({ error: 'Invalid password' }, 401)
  await issueAuthCookie(c, { role: 'admin' })
  return c.json({ ok: true, role: 'admin' })
})

// ─── Host Login ───────────────────────────────────────────────────────────────
// Token is on the tournament. Multiple concurrent sessions allowed.

auth.post('/host/login', async (c) => {
  const { token } = await c.req.json<{ token: string }>()
  const tournament = queryOne<Tournament>(
    'SELECT * FROM tournaments WHERE host_token = ?', [token.toUpperCase().trim()]
  )
  if (!tournament) return c.json({ error: 'Invalid host token' }, 401)

  await issueAuthCookie(c, { role: 'host', tournamentId: tournament.id })
  return c.json({
    ok: true, role: 'host',
    tournamentId: tournament.id,
    tournamentSlug: tournament.slug,
    tournamentName: tournament.name,
  })
})

// ─── Auctioneer Login ─────────────────────────────────────────────────────────

auth.post('/auctioneer/login', async (c) => {
  const { token } = await c.req.json<{ token: string }>()
  const tournament = queryOne<Tournament>(
    'SELECT * FROM tournaments WHERE auctioneer_token = ?', [token]
  )
  if (!tournament) return c.json({ error: 'Invalid auctioneer token' }, 401)
  await issueAuthCookie(c, { role: 'auctioneer', projectId: tournament.id })
  return c.json({ ok: true, role: 'auctioneer', projectId: tournament.id, projectSlug: tournament.slug })
})

// ─── Captain Login ────────────────────────────────────────────────────────────

auth.post('/captain/login', async (c) => {
  const { token } = await c.req.json<{ token: string }>()
  const captain = queryOne<Captain>(
    'SELECT * FROM captains WHERE token = ?', [token.toUpperCase().trim()]
  )
  if (!captain) return c.json({ error: 'Invalid token' }, 401)

  await issueAuthCookie(c, { role: 'captain', captainId: captain.id, auctionId: captain.auction_id })
  return c.json({
    ok: true, role: 'captain',
    captainId: captain.id, auctionId: captain.auction_id, displayName: captain.display_name,
  })
})

// ─── Logout ───────────────────────────────────────────────────────────────────

auth.post('/logout', requireAuth(), async (c) => {
  await clearAuthCookie(c)
  return c.json({ ok: true })
})

// ─── Me ───────────────────────────────────────────────────────────────────────
// Enriches response with tournament slug for host and auctioneer roles.

auth.get('/me', requireAuth(), (c) => {
  const payload = c.get('auth')

  if (payload.role === 'host') {
    const tournament = queryOne<{ slug: string; name: string }>(
      'SELECT slug, name FROM tournaments WHERE id = ?',
      [(payload as HostJwtPayload).tournamentId]
    )
    return c.json({ ...payload, tournamentSlug: tournament?.slug, tournamentName: tournament?.name })
  }

  if (payload.role === 'auctioneer') {
    const tournament = queryOne<{ slug: string }>(
      'SELECT slug FROM tournaments WHERE id = ?',
      [(payload as { projectId: number }).projectId]
    )
    return c.json({ ...payload, projectSlug: tournament?.slug })
  }

  if (payload.role === 'captain') {
    const captain = queryOne<{ display_name: string; team_name: string | null }>(
      'SELECT display_name, team_name FROM captains WHERE id = ?',
      [(payload as CaptainJwtPayload).captainId]
    )
    const tournament = queryOne<{ slug: string }>(
      `SELECT t.slug FROM tournaments t JOIN auctions a ON a.tournament_id = t.id WHERE a.id = ?`,
      [(payload as CaptainJwtPayload).auctionId]
    )
    const auction = queryOne<{ name: string }>(
      'SELECT name FROM auctions WHERE id = ?',
      [(payload as CaptainJwtPayload).auctionId]
    )
    return c.json({
      ...payload,
      displayName:    captain?.display_name,
      teamName:       captain?.team_name,
      tournamentSlug: tournament?.slug,
      auctionName:    auction?.name,
    })
  }

  return c.json(payload)
})


// ─── Admin: Set Featured Tournament ──────────────────────────────────────────

auth.post('/admin/featured', requireAuth('admin'), async (c) => {
  const { tournament_id } = await c.req.json<{ tournament_id: number | null }>()

  execute('UPDATE tournaments SET is_featured = 0 WHERE is_featured = 1')

  if (tournament_id !== null) {
    const t = queryOne('SELECT id FROM tournaments WHERE id = ?', [tournament_id])
    if (!t) return c.json({ error: 'Tournament not found' }, 404)
    execute('UPDATE tournaments SET is_featured = 1 WHERE id = ?', [tournament_id])
  }

  return c.json({ ok: true })
})

// ─── Token management ─────────────────────────────────────────────────────────

// Host token — generate (admin only)
auth.post('/tokens/host/:slug/generate', requireAuth('admin'), (c) => {
  const slug = c.req.param('slug')
  const tournament = queryOne<{ id: number }>('SELECT id FROM tournaments WHERE slug = ?', [slug])
  if (!tournament) return c.json({ error: 'Tournament not found' }, 404)
  const token = generateToken()
  execute('UPDATE tournaments SET host_token = ? WHERE id = ?', [token, tournament.id])
  return c.json({ ok: true, token })
})

// Host token — revoke (admin only)
auth.post('/tokens/host/:slug/revoke', requireAuth('admin'), (c) => {
  const slug = c.req.param('slug')
  const tournament = queryOne<{ id: number }>('SELECT id FROM tournaments WHERE slug = ?', [slug])
  if (!tournament) return c.json({ error: 'Tournament not found' }, 404)
  execute('UPDATE tournaments SET host_token = NULL WHERE id = ?', [tournament.id])
  return c.json({ ok: true })
})

// Auctioneer token — generate (admin or host of this tournament)
auth.post('/tokens/auctioneer/:slug/generate', requireAuth('admin', 'host'), (c) => {
  const auth = c.get('auth')
  const slug = c.req.param('slug')
  const tournament = queryOne<{ id: number }>('SELECT id FROM tournaments WHERE slug = ?', [slug])
  if (!tournament) return c.json({ error: 'Tournament not found' }, 404)
  if (auth.role === 'host' && (auth as HostJwtPayload).tournamentId !== tournament.id)
    return c.json({ error: 'Forbidden' }, 403)
  const token = generateToken()
  execute('UPDATE tournaments SET auctioneer_token = ? WHERE id = ?', [token, tournament.id])
  return c.json({ ok: true, token })
})

// Auctioneer token — revoke (admin or host of this tournament)
auth.post('/tokens/auctioneer/:slug/revoke', requireAuth('admin', 'host'), (c) => {
  const auth = c.get('auth')
  const slug = c.req.param('slug')
  const tournament = queryOne<{ id: number }>('SELECT id FROM tournaments WHERE slug = ?', [slug])
  if (!tournament) return c.json({ error: 'Tournament not found' }, 404)
  if (auth.role === 'host' && (auth as HostJwtPayload).tournamentId !== tournament.id)
    return c.json({ error: 'Forbidden' }, 403)
  execute('UPDATE tournaments SET auctioneer_token = NULL WHERE id = ?', [tournament.id])
  return c.json({ ok: true })
})

// Captain token — generate (admin or host of the captain's tournament)
auth.post('/tokens/captain/:id/generate', requireAuth('admin', 'host'), (c) => {
  const auth = c.get('auth')
  const captainId = Number(c.req.param('id'))
  const row = queryOne<{ id: number; tournament_id: number }>(
    `SELECT c.id, a.tournament_id FROM captains c JOIN auctions a ON a.id = c.auction_id WHERE c.id = ?`,
    [captainId]
  )
  if (!row) return c.json({ error: 'Captain not found' }, 404)
  if (auth.role === 'host' && (auth as HostJwtPayload).tournamentId !== row.tournament_id)
    return c.json({ error: 'Forbidden' }, 403)
  const token = generateToken()
  execute('UPDATE captains SET token = ? WHERE id = ?', [token, captainId])
  return c.json({ ok: true, token })
})

// Captain token — revoke (admin or host of the captain's tournament)
auth.post('/tokens/captain/:id/revoke', requireAuth('admin', 'host'), (c) => {
  const auth = c.get('auth')
  const captainId = Number(c.req.param('id'))
  const row = queryOne<{ id: number; tournament_id: number }>(
    `SELECT c.id, a.tournament_id FROM captains c JOIN auctions a ON a.id = c.auction_id WHERE c.id = ?`,
    [captainId]
  )
  if (!row) return c.json({ error: 'Captain not found' }, 404)
  if (auth.role === 'host' && (auth as HostJwtPayload).tournamentId !== row.tournament_id)
    return c.json({ error: 'Forbidden' }, 403)
  execute('UPDATE captains SET token = NULL WHERE id = ?', [captainId])
  return c.json({ ok: true })
})

export default auth
