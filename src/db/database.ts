import { Database, type SQLQueryBindings } from 'bun:sqlite'
import { SCHEMA, FACTION_SEED } from './schema'
import path from 'path'

let _db: Database | null = null

export function getDb(): Database {
  if (!_db) throw new Error('Database not initialized. Call initDb() first.')
  return _db
}

export function initDb(dbPath?: string): Database {
  const resolvedPath = dbPath ?? path.resolve(process.cwd(), 'data', 'draftcup.db')
  const dir = path.dirname(resolvedPath)
  const fs = require('fs')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  const db = new Database(resolvedPath, { create: true })
  db.run('PRAGMA journal_mode = WAL')
  db.run('PRAGMA foreign_keys = ON')
  db.run('PRAGMA cache_size = -8000')

  // Apply schema (CREATE TABLE IF NOT EXISTS — safe to re-run)
  db.run(SCHEMA)

  // Seed static factions once
  const count = (db.query('SELECT COUNT(*) as n FROM factions').get() as { n: number }).n
  if (count === 0) {
    const ins = db.prepare('INSERT INTO factions (name) VALUES (?)')
    for (const name of FACTION_SEED) ins.run(name)
    console.log(`[db] Seeded ${FACTION_SEED.length} factions`)
  }

  _db = db
  console.log(`[db] Ready at ${resolvedPath}`)
  return db
}

export function closeDb(): void {
  if (_db) { _db.close(); _db = null; console.log('[db] Closed.') }
}

process.on('SIGINT',  () => { closeDb(); process.exit(0) })
process.on('SIGTERM', () => { closeDb(); process.exit(0) })

export function queryAll<T = Record<string, unknown>>(
  sql: string, params: SQLQueryBindings[] = []
): T[] {
  return getDb().query(sql).all(...params) as T[]
}

export function queryOne<T = Record<string, unknown>>(
  sql: string, params: SQLQueryBindings[] = []
): T | null {
  return (getDb().query(sql).get(...params) as T) ?? null
}

export function execute(sql: string, params: SQLQueryBindings[] = []): void {
  getDb().query(sql).run(...params)
}

export function transaction<T>(fn: () => T): T {
  return getDb().transaction(fn)()
}