import { initDb } from '../src/db/database'

const db = initDb()

// Show sessions
const sessions = db.prepare('SELECT id, status, auction_id FROM auction_sessions ORDER BY id DESC LIMIT 5').all()
console.log('Recent sessions:', sessions)

const sessionId = Number(process.argv[2])
if (!sessionId) {
  console.log('\nUsage: bun scripts/sync-pool.ts <session_id>')
  process.exit(0)
}

const session = db.prepare('SELECT * FROM auction_sessions WHERE id = ?').get(sessionId) as any
if (!session) { console.error('Session not found'); process.exit(1) }
if (session.status !== 'pending') { console.error(`Session status is '${session.status}', not pending`); process.exit(1) }

const auction = db.prepare('SELECT tournament_id FROM auctions WHERE id = ?').get(session.auction_id) as any
const players = db.prepare('SELECT * FROM players WHERE tournament_id = ? AND is_available = 1').all(auction.tournament_id) as any[]

console.log(`Found ${players.length} available players`)

// Fisher-Yates shuffle
for (let i = players.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [players[i], players[j]] = [players[j], players[i]]
}

db.transaction(() => {
  const deleted = db.prepare("DELETE FROM session_queue WHERE session_id = ? AND status = 'pending'").run(sessionId)
  console.log(`Deleted ${deleted.changes} pending queue entries`)

  const insert = db.prepare('INSERT INTO session_queue (session_id, player_id, player_name, queue_position) VALUES (?, ?, ?, ?)')
  players.forEach((p, i) => insert.run(sessionId, p.id, p.name, i))
  console.log(`Inserted ${players.length} players into queue`)
})()

console.log('Done.')
