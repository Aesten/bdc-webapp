import { Hono } from 'hono'
import { join, resolve } from 'node:path'
import { mkdirSync } from 'node:fs'
import { queryAll, queryOne, execute } from '../db/database'
import { requireAuth, type AuthEnv } from '../middleware/auth'
import type { GameMap, Faction } from '../types'

const maps     = new Hono<AuthEnv>()
const factions = new Hono<AuthEnv>()

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function saveImage(file: File, entityId: number): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const dir = resolve(process.cwd(), 'uploads', 'maps', String(entityId))
  mkdirSync(dir, { recursive: true })
  const name = `${Date.now()}.${ext}`
  await Bun.write(join(dir, name), file)
  return `uploads/maps/${entityId}/${name}`
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAPS — global, admin-managed
// ═══════════════════════════════════════════════════════════════════════════════

// Public: list all maps (used by pick-ban UI, matchup display, etc.)
maps.get('/', (c) => {
  return c.json(queryAll<GameMap>('SELECT * FROM maps ORDER BY name ASC'))
})

maps.post('/', requireAuth('admin'), async (c) => {
  const { name, tags, game_id } = await c.req.json<{ name: string; tags?: string; game_id?: string }>()
  if (!name?.trim()) return c.json({ error: 'Name is required' }, 400)
  const dupe = queryOne<{ id: number }>('SELECT id FROM maps WHERE LOWER(name) = LOWER(?)', [name.trim()])
  if (dupe) return c.json({ error: `A map named "${name.trim()}" already exists` }, 409)
  execute('INSERT INTO maps (name, tags, game_id) VALUES (?, ?, ?)', [name.trim(), tags?.trim() ?? null, game_id?.trim() ?? null])
  return c.json(queryOne<GameMap>(
    'SELECT * FROM maps ORDER BY id DESC LIMIT 1'
  )!, 201)
})

maps.patch('/:id', requireAuth('admin'), async (c) => {
  const id  = Number(c.req.param('id'))
  const map = queryOne<GameMap>('SELECT * FROM maps WHERE id = ?', [id])
  if (!map) return c.json({ error: 'Map not found' }, 404)
  const data = await c.req.json<{ name?: string; tags?: string; game_id?: string | null; is_active?: number }>()
  if (data.name && data.name.trim().toLowerCase() !== map.name.toLowerCase()) {
    const dupe = queryOne<{ id: number }>('SELECT id FROM maps WHERE LOWER(name) = LOWER(?) AND id != ?', [data.name.trim(), id])
    if (dupe) return c.json({ error: `A map named "${data.name.trim()}" already exists` }, 409)
  }
  execute('UPDATE maps SET name = ?, tags = ?, game_id = ?, is_active = ? WHERE id = ?',
    [data.name ?? map.name, data.tags !== undefined ? data.tags : map.tags, data.game_id !== undefined ? (data.game_id?.trim() ?? null) : map.game_id, data.is_active ?? map.is_active, id])
  return c.json(queryOne<GameMap>('SELECT * FROM maps WHERE id = ?', [id]))
})

maps.post('/:id/image', requireAuth('admin'), async (c) => {
  const id  = Number(c.req.param('id'))
  const map = queryOne<GameMap>('SELECT * FROM maps WHERE id = ?', [id])
  if (!map) return c.json({ error: 'Map not found' }, 404)
  const body = await c.req.parseBody()
  const file = body['image']
  if (!file || typeof file === 'string') return c.json({ error: 'No file uploaded' }, 400)
  const imagePath = await saveImage(file as File, id)
  execute('UPDATE maps SET image_path = ? WHERE id = ?', [imagePath, id])
  return c.json({ ok: true, image_path: imagePath })
})

maps.delete('/:id', requireAuth('admin'), (c) => {
  const id  = Number(c.req.param('id'))
  const map = queryOne<GameMap>('SELECT * FROM maps WHERE id = ?', [id])
  if (!map) return c.json({ error: 'Map not found' }, 404)

  // Block if used in any matchup
  const inMatchup = queryOne<{ count: number }>(
    'SELECT COUNT(*) as count FROM matchups WHERE map_id = ?', [id]
  )
  if (inMatchup && inMatchup.count > 0) {
    return c.json({ error: 'Map is used in a matchup. Set is_active = 0 instead.' }, 409)
  }

  // Block if referenced in any active pick-ban session map pool
  const allPickbans = queryAll<{ map_pool: string }>(
    "SELECT map_pool FROM pick_ban_sessions WHERE status NOT IN ('complete')"
  )
  for (const pb of allPickbans) {
    const pool: number[] = JSON.parse(pb.map_pool ?? '[]')
    if (pool.includes(id)) {
      return c.json({ error: 'Map is in an active pick-ban pool. Cannot delete.' }, 409)
    }
  }

  execute('DELETE FROM maps WHERE id = ?', [id])
  return c.json({ ok: true })
})

// ═══════════════════════════════════════════════════════════════════════════════
// FACTIONS — global static, read-only
// ═══════════════════════════════════════════════════════════════════════════════

factions.get('/', (c) => {
  return c.json(queryAll<Faction>('SELECT * FROM factions ORDER BY id ASC'))
})

export { maps, factions }
