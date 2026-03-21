import { Hono } from 'hono'
import { upgradeWebSocket, websocket } from 'hono/bun'
import { serveStatic } from 'hono/bun'
import { initDb } from './db/database'
import { onWsOpen, onWsMessage, onWsClose } from './ws/auctionRoom'
import { onPickBanWsOpen, onPickBanWsClose } from './ws/pickBanRoom'
import auth     from './routes/auth'
import tournaments from './routes/tournaments'
import auctions from './routes/auctions'
import players  from './routes/players'
import sessions from './routes/sessions'
import brackets from './routes/brackets'
import { maps, factions } from './routes/maps'

// ─── Init DB ──────────────────────────────────────────────────────────────────

initDb()

// ─── App ──────────────────────────────────────────────────────────────────────

const app = new Hono()

app.get('/api/health', (c) => c.json({ ok: true, ts: new Date().toISOString() }))

app.route('/api/auth',     auth)
app.route('/api/tournaments', tournaments)
app.route('/api/auctions', auctions)
app.route('/api/players',  players)
app.route('/api/sessions', sessions)
app.route('/api/brackets', brackets)
app.route('/api/maps',     maps)
app.route('/api/factions', factions)

// ─── Static uploads ───────────────────────────────────────────────────────────

app.use('/uploads/*', serveStatic({ root: './' }))

// ─── Serve frontend (production build) ────────────────────────────────────────

app.use('/*', serveStatic({ root: './dist/client' }))
app.get('/*', async (c) => c.html(await Bun.file('./dist/client/index.html').text()))

// ─── WebSocket: Auction room ──────────────────────────────────────────────────
// /ws/auction/:sessionId?token=<jwt>
// Public clients omit token — read-only observer mode.

app.get('/ws/auction/:sessionId', upgradeWebSocket((c) => {
  const sessionId = Number(c.req.param('sessionId'))
  const token     = c.req.query('token') ?? null
  return {
    onOpen(_, ws)     { onWsOpen(ws, sessionId, token) },
    onMessage(ev, ws) { onWsMessage(ws, ev.data.toString()) },
    onClose(_, ws)    { onWsClose(ws) },
  }
}))

app.get('/ws/pickban/:sessionId', upgradeWebSocket((c) => {
  const sessionId = Number(c.req.param('sessionId'))
  return {
    onOpen(_, ws)  { onPickBanWsOpen(ws, sessionId) },
    onClose(_, ws) { onPickBanWsClose(ws) },
  }
}))

// ─── Serve ────────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT ?? 3000)
Bun.serve({ fetch: app.fetch, port: PORT, websocket })
console.log(`[server] Running on http://localhost:${PORT}`)