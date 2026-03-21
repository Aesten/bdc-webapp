// ─── Draft Cup DB Schema ──────────────────────────────────────────────────────

export const SCHEMA = /* sql */`

-- ─── Tournaments ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tournaments (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  name               TEXT    NOT NULL,
  slug               TEXT    NOT NULL UNIQUE,
  description        TEXT,
  host_token         TEXT    UNIQUE,
  auctioneer_token   TEXT    UNIQUE,
  map_pool           TEXT    NOT NULL DEFAULT '[]',
  finals_map_pool    TEXT    NOT NULL DEFAULT '[]',
  players_per_team   INTEGER NOT NULL DEFAULT 6,
  status             TEXT    NOT NULL DEFAULT 'active'
                     CHECK(status IN ('active', 'archived')),
  is_featured        INTEGER NOT NULL DEFAULT 0
                     CHECK(is_featured IN (0, 1)),
  created_at         TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ─── Players ────────────────────────────────────────────────────────────────
-- classes: comma-separated list of inf/arc/cav. Empty string = no class.

CREATE TABLE IF NOT EXISTS players (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id   INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  name            TEXT    NOT NULL,
  classes         TEXT    NOT NULL DEFAULT '',
  is_available    INTEGER NOT NULL DEFAULT 1 CHECK(is_available IN (0,1)),
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ─── Auctions ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS auctions (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id        INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  name                 TEXT    NOT NULL,
  min_increment        REAL    NOT NULL DEFAULT 0.1,
  bid_cooldown_seconds INTEGER NOT NULL DEFAULT 3,
  is_public            INTEGER NOT NULL DEFAULT 1 CHECK(is_public IN (0,1)),
  status               TEXT    NOT NULL DEFAULT 'setup'
                       CHECK(status IN ('setup','ready','finished')),
  created_at           TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ─── Captains ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS captains (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  auction_id   INTEGER NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  display_name TEXT    NOT NULL,
  team_name    TEXT,
  token        TEXT    UNIQUE,
  budget       REAL    NOT NULL DEFAULT 20.0,
  class        TEXT    CHECK(class IN ('inf', 'arc', 'cav'))
);

-- ─── Auction Sessions ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS auction_sessions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  auction_id    INTEGER NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  status        TEXT    NOT NULL DEFAULT 'pending'
                CHECK(status IN ('pending','live','paused','finished')),
  sold_count    INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  half_budget   INTEGER NOT NULL DEFAULT 1 CHECK(half_budget IN (0,1)),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  started_at    TEXT,
  finished_at   TEXT
);

-- ─── Session Queue ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS session_queue (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id     INTEGER NOT NULL REFERENCES auction_sessions(id) ON DELETE CASCADE,
  player_id      INTEGER REFERENCES players(id) ON DELETE SET NULL,
  player_name    TEXT    NOT NULL,
  queue_position INTEGER NOT NULL,
  status         TEXT    NOT NULL DEFAULT 'pending'
                 CHECK(status IN ('pending','active','sold')),
  UNIQUE(session_id, queue_position)
);

-- ─── Session Purchases ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS session_purchases (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id   INTEGER NOT NULL REFERENCES auction_sessions(id) ON DELETE CASCADE,
  captain_id   INTEGER NOT NULL REFERENCES captains(id) ON DELETE RESTRICT,
  player_id    INTEGER REFERENCES players(id) ON DELETE SET NULL,
  player_name  TEXT    NOT NULL,
  price        REAL    NOT NULL,
  purchased_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ─── Session Bids ───────────────────────────────────────────────────────────
-- One row per bid placed; most-recent row per queue_entry_id is the current top bid.

CREATE TABLE IF NOT EXISTS session_bids (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id     INTEGER NOT NULL REFERENCES auction_sessions(id) ON DELETE CASCADE,
  queue_entry_id INTEGER NOT NULL REFERENCES session_queue(id) ON DELETE CASCADE,
  captain_id     INTEGER NOT NULL REFERENCES captains(id) ON DELETE CASCADE,
  captain_name   TEXT    NOT NULL,
  amount         REAL    NOT NULL,
  placed_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ─── Session Chat ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS session_chat (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  INTEGER NOT NULL REFERENCES auction_sessions(id) ON DELETE CASCADE,
  author_role TEXT    NOT NULL,
  author_name TEXT    NOT NULL,
  content     TEXT    NOT NULL,
  sent_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ─── Factions ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS factions (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT    NOT NULL UNIQUE
);

-- ─── Maps ───────────────────────────────────────────────────────────────────
-- Global: not per-tournament. Admin manages the map pool centrally.

CREATE TABLE IF NOT EXISTS maps (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  tags       TEXT,
  game_id    TEXT,
  image_path TEXT,
  is_active  INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1))
);

-- ─── Matchups ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS matchups (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id   INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  bracket_id      INTEGER REFERENCES brackets(id) ON DELETE CASCADE,
  round           INTEGER NOT NULL,
  label           TEXT,
  map_id          INTEGER REFERENCES maps(id) ON DELETE SET NULL,
  faction_a_id    INTEGER REFERENCES factions(id) ON DELETE SET NULL,
  faction_b_id    INTEGER REFERENCES factions(id) ON DELETE SET NULL,
  is_public       INTEGER NOT NULL DEFAULT 0 CHECK(is_public IN (0,1)),
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ─── Brackets ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS brackets (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id   INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  auction_id      INTEGER REFERENCES auctions(id) ON DELETE SET NULL,
  name            TEXT    NOT NULL,
  slots           TEXT    NOT NULL DEFAULT '[]',
  locked          INTEGER NOT NULL DEFAULT 0 CHECK(locked IN (0,1)),
  is_public       INTEGER NOT NULL DEFAULT 0 CHECK(is_public IN (0,1)),
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ─── Matches ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS matches (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  bracket_id        INTEGER NOT NULL REFERENCES brackets(id) ON DELETE CASCADE,
  round             INTEGER NOT NULL,
  match_order       INTEGER NOT NULL,
  match_label       TEXT,
  group_label       TEXT,
  captain_a_id      INTEGER REFERENCES captains(id) ON DELETE SET NULL,
  captain_b_id      INTEGER REFERENCES captains(id) ON DELETE SET NULL,
  matchup_id        INTEGER REFERENCES matchups(id) ON DELETE SET NULL,
  score_a           INTEGER,
  score_b           INTEGER,
  winner_captain_id INTEGER REFERENCES captains(id) ON DELETE SET NULL,
  status            TEXT    NOT NULL DEFAULT 'pending'
                    CHECK(status IN ('pending','played')),
  is_finals         INTEGER NOT NULL DEFAULT 0 CHECK(is_finals IN (0,1))
);

-- ─── Pick-Ban Sessions ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pick_ban_sessions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  bracket_id    INTEGER NOT NULL REFERENCES brackets(id) ON DELETE CASCADE,
  match_id      INTEGER NOT NULL UNIQUE REFERENCES matches(id) ON DELETE CASCADE,
  status        TEXT    NOT NULL DEFAULT 'waiting'
                CHECK(status IN ('waiting','banning','picking','complete')),
  captain_a_id  INTEGER NOT NULL REFERENCES captains(id) ON DELETE RESTRICT,
  captain_b_id  INTEGER NOT NULL REFERENCES captains(id) ON DELETE RESTRICT,
  map_pool      TEXT    NOT NULL DEFAULT '[]',
  ban_sequence  TEXT    NOT NULL DEFAULT '["a","b","b","a"]',
  ban_turn      INTEGER NOT NULL DEFAULT 0,
  bans          TEXT    NOT NULL DEFAULT '[]',
  a_joined      INTEGER NOT NULL DEFAULT 0 CHECK(a_joined IN (0,1)),
  b_joined      INTEGER NOT NULL DEFAULT 0 CHECK(b_joined IN (0,1)),
  chosen_map_id INTEGER REFERENCES maps(id) ON DELETE SET NULL,
  a_pick        INTEGER REFERENCES factions(id) ON DELETE SET NULL,
  b_pick        INTEGER REFERENCES factions(id) ON DELETE SET NULL,
  revealed      INTEGER NOT NULL DEFAULT 0 CHECK(revealed IN (0,1)),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  completed_at  TEXT
);

-- ─── Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_tournaments_slug     ON tournaments(slug);
CREATE INDEX IF NOT EXISTS idx_tournaments_featured ON tournaments(is_featured);
CREATE INDEX IF NOT EXISTS idx_players_tournament   ON players(tournament_id);
CREATE INDEX IF NOT EXISTS idx_auctions_tournament  ON auctions(tournament_id);
CREATE INDEX IF NOT EXISTS idx_captains_auction     ON captains(auction_id);
CREATE INDEX IF NOT EXISTS idx_captains_token       ON captains(token);
CREATE INDEX IF NOT EXISTS idx_sessions_auction     ON auction_sessions(auction_id);
CREATE INDEX IF NOT EXISTS idx_queue_session        ON session_queue(session_id);
CREATE INDEX IF NOT EXISTS idx_purchases_session    ON session_purchases(session_id);
CREATE INDEX IF NOT EXISTS idx_purchases_captain    ON session_purchases(captain_id);
CREATE INDEX IF NOT EXISTS idx_bids_session_entry   ON session_bids(session_id, queue_entry_id);
CREATE INDEX IF NOT EXISTS idx_chat_session         ON session_chat(session_id);
CREATE INDEX IF NOT EXISTS idx_matchups_tournament  ON matchups(tournament_id);
CREATE INDEX IF NOT EXISTS idx_brackets_tournament  ON brackets(tournament_id);
CREATE INDEX IF NOT EXISTS idx_brackets_auction     ON brackets(auction_id);
CREATE INDEX IF NOT EXISTS idx_matches_bracket      ON matches(bracket_id);
CREATE INDEX IF NOT EXISTS idx_matches_matchup      ON matches(matchup_id);
CREATE INDEX IF NOT EXISTS idx_pickban_match        ON pick_ban_sessions(match_id);
`


// ─── Static faction seed ─────────────────────────────────────────────────────

export const FACTION_SEED = [
  'Vlandia',
  'Battania',
  'Sturgia',
  'Aserai',
  'Khuzait',
  'Empire',
]
