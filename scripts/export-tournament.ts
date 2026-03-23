/**
 * Export a tournament as a self-contained static archive.
 * Usage: bun scripts/export-tournament.ts <slug> [output-dir]
 *
 * Output:
 *   {output-dir}/{slug}/index.html  — standalone page (data embedded)
 *   {output-dir}/{slug}/data.json   — raw data snapshot
 */

import { initDb, queryAll, queryOne } from '../src/db/database'
import { writeFile, mkdir, readFile } from 'fs/promises'
import { existsSync }                  from 'fs'
import { join, resolve } from 'path'

// ─── CLI args ────────────────────────────────────────────────────────────────

const slug      = process.argv[2]
const outputDir = resolve(process.argv[3] ?? 'exports')

if (!slug) {
  console.error('Usage: bun scripts/export-tournament.ts <slug> [output-dir]')
  process.exit(1)
}

// ─── DB ──────────────────────────────────────────────────────────────────────

initDb()

// ─── Queries ─────────────────────────────────────────────────────────────────

const tournament = queryOne<{ id: number; name: string; slug: string; description: string | null }>(
  `SELECT id, name, slug, description FROM tournaments WHERE slug = ?`, [slug]
)
if (!tournament) {
  console.error(`Tournament "${slug}" not found`)
  process.exit(1)
}

// Maps lookup (for pick-ban ban decoding)
const allMaps = queryAll<{ id: number; name: string; game_id: string | null }>(
  `SELECT id, name, game_id FROM maps`
)
const mapById = Object.fromEntries(allMaps.map(m => [m.id, m]))

// Auctions for this tournament
const auctions = queryAll<{ id: number; name: string; status: string }>(
  `SELECT id, name, status FROM auctions WHERE tournament_id = ? AND status != 'setup' ORDER BY id ASC`,
  [tournament.id]
)

// Build divisions
const divisions = await Promise.all(auctions.map(async auction => {
  // Captains + total spent
  const captainRows = queryAll<{
    id: number; display_name: string; team_name: string | null
    class: string | null; budget: number; total_spent: number
  }>(
    `SELECT c.id, c.display_name, c.team_name, c.class, c.budget,
            COALESCE(SUM(sp.price), 0) as total_spent
     FROM captains c
     LEFT JOIN session_purchases sp ON sp.captain_id = c.id
     WHERE c.auction_id = ?
     GROUP BY c.id ORDER BY c.id ASC`,
    [auction.id]
  )

  // Players per captain
  const playerRows = queryAll<{
    captain_id: number; player_name: string; classes: string; price: number
  }>(
    `SELECT sp.captain_id, sp.player_name, COALESCE(p.classes,'') as classes, sp.price
     FROM session_purchases sp
     JOIN auction_sessions s ON s.id = sp.session_id
     LEFT JOIN players p ON p.id = sp.player_id
     WHERE s.auction_id = ?
     ORDER BY sp.captain_id, sp.price DESC`,
    [auction.id]
  )

  const teams = captainRows.map(c => ({
    captainId:    c.id,
    captainName:  c.display_name,
    teamName:     c.team_name,
    captainClass: c.class,
    budget:       c.budget,
    totalSpent:   c.total_spent,
    players:      playerRows
      .filter(p => p.captain_id === c.id)
      .map(p => ({ name: p.player_name, classes: p.classes, price: p.price })),
  }))

  // Matches with joined names
  const matchRows = queryAll<{
    id: number; round: number; match_order: number; match_label: string | null
    group_label: string | null; captain_a_id: number | null; captain_b_id: number | null
    score_a: number | null; score_b: number | null; winner_captain_id: number | null
    status: string; is_finals: number
    captain_a_name: string | null; captain_b_name: string | null
    team_a_name: string | null; team_b_name: string | null
    map_name: string | null; map_game_id: string | null
    faction_a_name: string | null; faction_b_name: string | null
  }>(
    `SELECT m.id, m.round, m.match_order, m.match_label, m.group_label,
            m.captain_a_id, m.captain_b_id, m.score_a, m.score_b,
            m.winner_captain_id, m.status, m.is_finals,
            ca.display_name as captain_a_name, cb.display_name as captain_b_name,
            ca.team_name as team_a_name, cb.team_name as team_b_name,
            mp.name as map_name, mp.game_id as map_game_id,
            fa.name as faction_a_name, fb.name as faction_b_name
     FROM matches m
     JOIN brackets b ON b.id = m.bracket_id
     LEFT JOIN captains ca ON ca.id = m.captain_a_id
     LEFT JOIN captains cb ON cb.id = m.captain_b_id
     LEFT JOIN matchups mu ON mu.id = m.matchup_id
     LEFT JOIN maps mp ON mp.id = mu.map_id
     LEFT JOIN factions fa ON fa.id = mu.faction_a_id
     LEFT JOIN factions fb ON fb.id = mu.faction_b_id
     WHERE b.auction_id = ?
     ORDER BY m.round, m.match_order`,
    [auction.id]
  )

  // Pick-ban sessions for this auction's bracket
  const pickBanRows = queryAll<{
    match_id: number; status: string; bans: string
    chosen_map_id: number | null; a_pick: number | null; b_pick: number | null; revealed: number
    faction_a_name: string | null; faction_b_name: string | null
    captain_a_id: number; captain_b_id: number
  }>(
    `SELECT pbs.match_id, pbs.status, pbs.bans,
            pbs.chosen_map_id, pbs.a_pick, pbs.b_pick, pbs.revealed,
            fa.name as faction_a_name, fb.name as faction_b_name,
            pbs.captain_a_id, pbs.captain_b_id
     FROM pick_ban_sessions pbs
     JOIN matches m ON m.id = pbs.match_id
     JOIN brackets b ON b.id = m.bracket_id
     LEFT JOIN factions fa ON fa.id = pbs.a_pick
     LEFT JOIN factions fb ON fb.id = pbs.b_pick
     WHERE b.auction_id = ? AND pbs.status = 'complete'`,
    [auction.id]
  )
  const pickBanByMatchId = Object.fromEntries(pickBanRows.map(pb => {
    const bansRaw: { map_id: number; side: 'a' | 'b' }[] = JSON.parse(pb.bans ?? '[]')
    const bans = bansRaw.map(b => ({
      map:  mapById[b.map_id]?.name ?? `Map ${b.map_id}`,
      side: b.side,
    }))
    return [pb.match_id, {
      chosenMap:   pb.chosen_map_id ? mapById[pb.chosen_map_id]?.name ?? null : null,
      factionA:    pb.revealed ? pb.faction_a_name : null,
      factionB:    pb.revealed ? pb.faction_b_name : null,
      captainAId:  pb.captain_a_id,
      captainBId:  pb.captain_b_id,
      bans,
    }]
  }))

  const matches = matchRows.map(m => ({
    id:           m.id,
    round:        m.round,
    matchOrder:   m.match_order,
    matchLabel:   m.match_label,
    groupLabel:   m.group_label,
    isFinalsMatch: !!m.is_finals,
    captainA:     m.captain_a_name,
    captainB:     m.captain_b_name,
    teamA:        m.team_a_name ?? m.captain_a_name,
    teamB:        m.team_b_name ?? m.captain_b_name,
    scoreA:       m.score_a,
    scoreB:       m.score_b,
    winner:       m.winner_captain_id === m.captain_a_id
                    ? (m.team_a_name ?? m.captain_a_name)
                    : m.winner_captain_id === m.captain_b_id
                      ? (m.team_b_name ?? m.captain_b_name)
                      : null,
    status:       m.status,
    pickBan:      pickBanByMatchId[m.id] ?? null,
  }))

  const winnerRow = queryOne<{ display_name: string; team_name: string | null }>(
    `SELECT c.display_name, c.team_name
     FROM matches m
     JOIN brackets b ON b.id = m.bracket_id
     JOIN captains c ON c.id = m.winner_captain_id
     WHERE b.auction_id = ? AND m.is_finals = 1 AND m.winner_captain_id IS NOT NULL
     LIMIT 1`,
    [auction.id]
  )
  const winner = winnerRow
    ? { teamName: winnerRow.team_name ?? winnerRow.display_name, captainName: winnerRow.display_name }
    : null

  // Stats (if available)
  let stats: unknown = null
  let statsConfig: unknown = null
  const statsPath  = resolve(process.cwd(), 'uploads', 'stats', `${auction.id}.json`)
  const configPath = resolve(process.cwd(), 'uploads', 'stats', `${auction.id}.config.json`)
  if (existsSync(statsPath)) {
    try { stats = JSON.parse(await readFile(statsPath, 'utf8')) } catch {}
  }
  if (existsSync(configPath)) {
    try { statsConfig = JSON.parse(await readFile(configPath, 'utf8')) } catch {}
  }

  return { auctionId: auction.id, name: auction.name, teams, matches, winner, stats, statsConfig }
}))

// Tournament-wide matchups
const matchups = queryAll<{
  id: number; label: string | null; round: number
  map_name: string | null; map_game_id: string | null
  faction_a_name: string | null; faction_b_name: string | null
}>(
  `SELECT mu.id, mu.label, mu.round,
          mp.name as map_name, mp.game_id as map_game_id,
          fa.name as faction_a_name, fb.name as faction_b_name
   FROM matchups mu
   LEFT JOIN maps mp ON mp.id = mu.map_id
   LEFT JOIN factions fa ON fa.id = mu.faction_a_id
   LEFT JOIN factions fb ON fb.id = mu.faction_b_id
   WHERE mu.tournament_id = ? AND mu.is_public = 1
   ORDER BY mu.round ASC`,
  [tournament.id]
).map(mu => ({
  id:        mu.id,
  label:     mu.label,
  round:     mu.round,
  mapName:   mu.map_name,
  mapCmd:    mu.map_game_id ?? mu.map_name?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? null,
  factionA:  mu.faction_a_name,
  factionB:  mu.faction_b_name,
}))

// ─── Data payload ─────────────────────────────────────────────────────────────

const data = {
  tournament: { name: tournament.name, slug: tournament.slug, description: tournament.description },
  exportedAt: new Date().toISOString(),
  divisions,
  matchups,
}

// ─── HTML template ────────────────────────────────────────────────────────────

function buildHtml(data: typeof data): string {
  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(data.tournament.name)} — Archive</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:    #09090b;
  --bg2:   #18181b;
  --bg3:   #27272a;
  --bd:    #3f3f46;
  --text:  #fafafa;
  --muted: #71717a;
  --amber: #f59e0b;
  --blue:  #3b82f6;
  --green: #22c55e;
  --red:   #ef4444;
}
html{background:var(--bg);color:var(--text);font-family:ui-sans-serif,system-ui,sans-serif;font-size:14px}
body{min-height:100vh}
a{color:inherit;text-decoration:none}
.container{max-width:1100px;margin:0 auto;padding:0 16px 64px}
header{padding:32px 0 24px;border-bottom:1px solid var(--bg3);margin-bottom:24px}
header h1{font-size:24px;font-weight:700;letter-spacing:-0.5px}
header p{color:var(--muted);margin-top:6px;font-size:13px}
.badge{display:inline-block;background:var(--bg3);color:var(--muted);font-size:11px;font-family:ui-monospace,monospace;padding:2px 8px;border-radius:4px}
/* tabs */
.tab-bar{display:flex;gap:4px;border-bottom:1px solid var(--bg3);margin-bottom:20px}
.tab-bar button{background:none;border:none;color:var(--muted);cursor:pointer;font-size:13px;font-weight:500;padding:8px 14px;border-bottom:2px solid transparent;transition:color .15s}
.tab-bar button:hover{color:var(--text)}
.tab-bar button.active{color:var(--text);border-bottom-color:var(--blue)}
.tab-pane{display:none}.tab-pane.active{display:block}
/* div tabs (top level) */
.div-tab-bar{display:flex;gap:6px;margin-bottom:24px;flex-wrap:wrap}
.div-tab-bar button{background:var(--bg2);border:1px solid var(--bg3);color:var(--muted);cursor:pointer;font-size:12px;font-weight:500;padding:6px 14px;border-radius:8px;transition:all .15s}
.div-tab-bar button:hover{color:var(--text);border-color:var(--bd)}
.div-tab-bar button.active{background:var(--bg3);color:var(--text);border-color:var(--bd)}
/* teams */
.team-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}
.team-card{background:var(--bg2);border:1px solid var(--bg3);border-radius:12px;padding:14px 16px}
.team-card .cap{font-size:13px;font-weight:600;display:flex;align-items:center;gap:6px;margin-bottom:4px}
.team-card .teamname{font-size:11px;color:var(--muted);margin-bottom:10px}
.team-card .cap .class-tag{font-size:10px;font-family:ui-monospace,monospace;background:var(--bg3);padding:1px 6px;border-radius:4px;color:#a1a1aa}
.team-card .budget-row{font-size:11px;color:var(--muted);margin-bottom:10px}
.team-card .budget-row span{color:var(--amber);font-weight:600}
.player-list{list-style:none;display:flex;flex-direction:column;gap:3px}
.player-list li{display:flex;justify-content:space-between;align-items:center;font-size:12px;padding:3px 0;border-bottom:1px solid var(--bg3)}
.player-list li:last-child{border-bottom:none}
.player-list .pname{color:#e4e4e7}
.player-list .pprice{color:var(--muted);font-family:ui-monospace,monospace;font-size:11px}
.player-list .pclass{font-size:10px;color:#71717a;font-family:ui-monospace,monospace}
/* brackets */
.match-section{margin-bottom:28px}
.match-section h3{font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px}
.match-list{display:flex;flex-direction:column;gap:6px}
.match-card{background:var(--bg2);border:1px solid var(--bg3);border-radius:10px;padding:10px 14px;display:flex;flex-direction:column;gap:6px}
.match-row{display:flex;align-items:center;gap:8px;font-size:13px}
.match-row .score{font-family:ui-monospace,monospace;font-weight:700;color:var(--text);min-width:18px;text-align:center}
.match-row .name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.match-row.winner .name{font-weight:600;color:var(--amber)}
.match-row .crown{color:var(--amber);font-size:12px}
.match-card .pb{font-size:11px;color:var(--muted);margin-top:4px;padding-top:6px;border-top:1px solid var(--bg3)}
.match-card .pb .pb-map{color:#a1a1aa;margin-bottom:3px}
.match-card .pb .pb-fac{display:flex;gap:12px}
.match-card .pb .pb-bans{color:var(--muted);font-size:10px;margin-top:2px}
/* winner banner */
.winner-banner{background:linear-gradient(135deg,#78350f22,#451a0322);border:1px solid #92400e44;border-radius:12px;padding:16px 20px;margin-bottom:24px;display:flex;align-items:center;gap:12px}
.winner-banner .crown-icon{font-size:24px}
.winner-banner .wlabel{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.8px}
.winner-banner .wname{font-size:18px;font-weight:700;color:var(--amber)}
/* matchups */
.matchup-card{background:var(--bg2);border:1px solid var(--bg3);border-radius:10px;padding:12px 16px;margin-bottom:8px}
.matchup-card .mu-label{font-size:11px;color:var(--muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.6px}
.matchup-card .mu-cmd{font-family:ui-monospace,monospace;font-size:12px;color:#86efac;background:#14532d33;padding:4px 10px;border-radius:6px;display:inline-block;margin-bottom:6px}
.matchup-card .mu-teams{font-size:13px;color:var(--text)}
/* stats */
.stats-table-wrap{overflow-x:auto}
table{width:max-content;border-collapse:collapse;font-size:12px}
th,td{padding:7px 12px;text-align:left;border-bottom:1px solid var(--bg3);white-space:nowrap}
th{color:var(--muted);font-weight:500;cursor:pointer;user-select:none;position:sticky;top:0;background:var(--bg2)}
th:hover{color:var(--text)}
th.sort-asc::after{content:" ↑"}th.sort-desc::after{content:" ↓"}
td{color:#e4e4e7}
tr:hover td{background:var(--bg2)}
td.num{text-align:right;font-family:ui-monospace,monospace}
th.col-rank,td.col-rank{position:sticky;left:0;background:var(--bg2);z-index:2;color:var(--muted);text-align:right;font-family:ui-monospace,monospace}
th.col-name,td.col-name{position:sticky;background:var(--bg2);z-index:2;font-weight:500;min-width:120px;max-width:180px;overflow:hidden;text-overflow:ellipsis}
.empty-state{padding:48px 0;text-align:center;color:var(--muted)}
.foot{margin-top:48px;border-top:1px solid var(--bg3);padding-top:16px;font-size:11px;color:var(--muted);text-align:center}
</style>
</head>
<body>
<div class="container">
  <header>
    <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap">
      <h1>${escapeHtml(data.tournament.name)}</h1>
      <span class="badge">archive</span>
    </div>
    ${data.tournament.description ? `<p>${escapeHtml(data.tournament.description)}</p>` : ''}
    <p style="margin-top:8px;font-size:11px;color:#3f3f46">Exported ${new Date(data.exportedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
  </header>

  <div id="root"></div>

  <div class="foot">
    ${escapeHtml(data.tournament.name)} — Static Archive
  </div>
</div>

<script>
const DATA = ${JSON.stringify(data)};

// ─── Stats column definitions (mirrors StatsTable.tsx STAT_COLS) ─────────────

const STAT_COLS = [
  { key: 'rank',            label: '#',          fmt: null  },
  { key: 'name',            label: 'Name',       fmt: null  },
  { key: 'played',          label: 'Played',     fmt: null  },
  { key: 'won',             label: 'Won',        fmt: null  },
  { key: 'wr',              label: 'WR%',        fmt: 'pct' },
  { key: 'score',           label: 'Score',      fmt: null  },
  { key: 'score_per_round', label: 'S/R',        fmt: 'dec' },
  { key: 'cost',            label: 'Cost',       fmt: 'dec1' },
  { key: 'cost_per_score',  label: 'C/kS',       fmt: 'dec' },
  { key: 'kills',           label: 'K',          fmt: null  },
  { key: 'deaths',          label: 'D',          fmt: null  },
  { key: 'assists',         label: 'A',          fmt: null  },
  { key: 'kpr',             label: 'K/R',        fmt: 'dec' },
  { key: 'dpr',             label: 'D/R',        fmt: 'dec' },
  { key: 'apr',             label: 'A/R',        fmt: 'dec' },
  { key: 'kapr',            label: 'K+A/R',      fmt: 'dec' },
  { key: 'spawns',          label: 'Spawns',     fmt: null  },
  { key: 'survival',        label: 'Surv%',      fmt: 'pct' },
  { key: 'mvp',             label: 'MVP',        fmt: null  },
  { key: 'mvp_rate',        label: 'MVP%',       fmt: 'pct' },
  { key: 'first_kills',     label: 'FirstK',     fmt: null  },
  { key: 'first_deaths',    label: 'FirstD',     fmt: null  },
  { key: 'bonks',           label: 'Bonks',      fmt: null  },
  { key: 'couches',         label: 'Couches',    fmt: null  },
  { key: 'kicks',           label: 'Kicks',      fmt: null  },
  { key: 'horse_dmg',       label: 'HorseDmg',   fmt: null  },
  { key: 'horse_kills',     label: 'HorseKills', fmt: null  },
  { key: 'shots',           label: 'Shots',      fmt: null  },
  { key: 'hits',            label: 'Hits',       fmt: null  },
  { key: 'hit_rate',        label: 'Hit%',       fmt: 'pct' },
  { key: 'hs',              label: 'HS',         fmt: null  },
  { key: 'hs_rate',         label: 'HS%',        fmt: 'pct' },
  { key: 'tk',              label: 'TK',         fmt: null  },
  { key: 'th',              label: 'TH',         fmt: null  },
  { key: 'td',              label: 'TD',         fmt: null  },
  { key: 'th_taken',        label: 'THTaken',    fmt: null  },
  { key: 'suicides',        label: 'Suicides',   fmt: null  },
  { key: 'melee_dmg',       label: 'MeleeDmg',   fmt: null  },
  { key: 'mounted_dmg',     label: 'MountedDmg', fmt: null  },
  { key: 'ranged_dmg',      label: 'RangedDmg',  fmt: null  },
  { key: 'melee_pct',       label: 'Melee%',     fmt: 'pct' },
  { key: 'mounted_pct',     label: 'Mounted%',   fmt: 'pct' },
  { key: 'ranged_pct',      label: 'Ranged%',    fmt: 'pct' },
];

function stripClanTag(name) {
  const stripped = name.replace(/^(\[[^\]]*\]\s*)*/u, '').trim();
  return stripped || name;
}

function fmtVal(val, fmt) {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'string') return val;
  if (fmt === 'pct')  return (val * 100).toFixed(1) + '%';
  if (fmt === 'dec')  return val.toFixed(2);
  if (fmt === 'dec1') return val.toFixed(1);
  return String(val);
}

function gradientBg(value, min, max, type) {
  if (max === min) return null;
  if (type === 'green-up' || type === 'red-up' || type === 'yellow-up') {
    if (max === 0) return null;
    const t = Math.max(0, Math.min(1, value / max));
    const color = type === 'green-up' ? '34,197,94' : type === 'red-up' ? '239,68,68' : '234,179,8';
    return 'rgba(' + color + ',' + (t * 0.35).toFixed(3) + ')';
  }
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const r = Math.round(239 + (34  - 239) * t);
  const g = Math.round(68  + (197 - 68)  * t);
  const b = Math.round(68  + (94  - 68)  * t);
  return 'rgba(' + r + ',' + g + ',' + b + ',0.25)';
}

// ─── State ───────────────────────────────────────────────────────────────────

let activeDivIdx  = 0;
const divSubTab   = {};  // auctionId -> 'teams' | 'brackets' | 'stats'
const statsSort   = {};  // auctionId -> { col, dir }

DATA.divisions.forEach(d => {
  divSubTab[d.auctionId]  = 'teams';
  statsSort[d.auctionId]  = { col: 'rank', dir: 'asc' };
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el[k] = v;
    else el.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

function classTag(cls) {
  if (!cls) return null;
  const map = { inf: 'INF', arc: 'ARC', cav: 'CAV' };
  return h('span', { class: 'class-tag' }, map[cls] ?? cls.toUpperCase());
}

// ─── Renderers ───────────────────────────────────────────────────────────────

function renderTeams(div) {
  if (!div.teams.length) return h('div', { class: 'empty-state' }, 'No teams yet.');
  const grid = h('div', { class: 'team-grid' });
  for (const t of div.teams) {
    const name   = t.teamName ? t.teamName : t.captainName + "'s team";
    const budget = t.budget ?? 20;
    const card   = h('div', { class: 'team-card' },
      h('div', { class: 'cap' }, name, classTag(t.captainClass)),
      h('div', { class: 'teamname' }, 'Captain: ' + t.captainName),
      h('div', { class: 'budget-row' }, 'Spent: ', h('span', {}, t.totalSpent.toFixed(1)), ' / ' + budget.toFixed(1)),
      t.players.length
        ? h('ul', { class: 'player-list' }, ...t.players.map(p =>
            h('li', {},
              h('span', { class: 'pname' }, p.name),
              h('span', { style: 'display:flex;gap:6px;align-items:center' },
                p.classes ? h('span', { class: 'pclass' }, p.classes.split(',').map(c => c.toUpperCase()).join('/')) : null,
                h('span', { class: 'pprice' }, p.price.toFixed(1))
              )
            )
          ))
        : h('div', { style: 'color:#52525b;font-size:12px;margin-top:6px' }, 'No players')
    );
    grid.appendChild(card);
  }
  return grid;
}

function renderPickBanInfo(match, div) {
  const pb = match.pickBan;
  if (!pb) return null;
  const capA = div.teams.find(t => t.captainId === pb.captainAId);
  const capB = div.teams.find(t => t.captainId === pb.captainBId);
  const nameA = capA?.captainName ?? 'Side A';
  const nameB = capB?.captainName ?? 'Side B';
  const parts = [];
  if (pb.bans.length) {
    const banStr = pb.bans.map((b, i) => {
      const who = b.side === 'a' ? nameA : nameB;
      return who + ' banned ' + b.map;
    }).join(' · ');
    parts.push(h('div', { class: 'pb-bans' }, banStr));
  }
  if (pb.chosenMap) {
    parts.push(h('div', { class: 'pb-map' }, '🗺 ' + pb.chosenMap));
  }
  if (pb.factionA && pb.factionB) {
    parts.push(h('div', { class: 'pb-fac' },
      h('span', {}, nameA + ': ' + pb.factionA),
      h('span', {}, nameB + ': ' + pb.factionB),
    ));
  }
  return parts.length ? h('div', { class: 'pb' }, ...parts) : null;
}

function renderMatchCard(match, div) {
  const winA = match.winner && match.winner === match.teamA;
  const winB = match.winner && match.winner === match.teamB;
  return h('div', { class: 'match-card' },
    h('div', { class: 'match-row' + (winA ? ' winner' : '') },
      h('span', { class: 'score' }, match.scoreA != null ? match.scoreA : '—'),
      h('span', { class: 'name' }, match.teamA ?? '?'),
      winA ? h('span', { class: 'crown' }, '♛') : null,
    ),
    h('div', { class: 'match-row' + (winB ? ' winner' : '') },
      h('span', { class: 'score' }, match.scoreB != null ? match.scoreB : '—'),
      h('span', { class: 'name' }, match.teamB ?? '?'),
      winB ? h('span', { class: 'crown' }, '♛') : null,
    ),
    renderPickBanInfo(match, div),
  );
}

function renderBrackets(div) {
  const matches = div.matches;
  if (!matches.length) return h('div', { class: 'empty-state' }, 'No bracket data.');

  const groupMatches    = matches.filter(m => m.groupLabel && !m.isFinalsMatch);
  const knockoutMatches = matches.filter(m => !m.groupLabel || m.isFinalsMatch);
  const wrap = h('div', {});

  // Group stage
  if (groupMatches.length) {
    const groups = [...new Set(groupMatches.map(m => m.groupLabel))].sort();
    for (const g of groups) {
      const sec = h('div', { class: 'match-section' },
        h('h3', {}, 'Group ' + g),
        h('div', { class: 'match-list' },
          ...groupMatches.filter(m => m.groupLabel === g)
            .map(m => renderMatchCard(m, div))
        )
      );
      wrap.appendChild(sec);
    }
  }

  // Knockout rounds
  if (knockoutMatches.length) {
    const rounds = [...new Set(knockoutMatches.map(m => m.round))].sort((a,b) => a-b);
    for (const r of rounds) {
      const ms = knockoutMatches.filter(m => m.round === r);
      const label = ms[0].matchLabel ?? 'Round ' + r;
      const sec = h('div', { class: 'match-section' },
        h('h3', {}, label),
        h('div', { class: 'match-list' }, ...ms.map(m => renderMatchCard(m, div)))
      );
      wrap.appendChild(sec);
    }
  }

  return wrap;
}

function renderStats(div) {
  if (!div.stats || !Array.isArray(div.stats) || !div.stats.length) {
    return h('div', { class: 'empty-state' }, 'Statistics not yet available for this division.');
  }

  const cfg        = div.statsConfig ?? {};
  const hidden     = new Set(cfg.hiddenColumns ?? []);
  const conditions = cfg.conditions ?? {};
  const gradients  = cfg.gradients  ?? {};
  const nameMap    = cfg.nameMap    ?? {};
  const captainSet = new Set(cfg.captains ?? []);

  // Build price lookup from teams
  const priceByName = {};
  for (const team of div.teams ?? []) {
    for (const p of team.players ?? []) priceByName[p.name] = p.price;
  }

  // Augment rows: apply nameMap + compute cost/cost_per_score
  const augmented = div.stats.map(row => {
    const auctionName   = nameMap[row.name] ?? null;
    const cost          = auctionName !== null ? (priceByName[auctionName] ?? null) : null;
    const cost_per_score = (cost !== null && cost > 0.1 && row.score > 0)
      ? (cost * 1000) / row.score
      : null;
    return { ...row, auction_name: auctionName, cost, cost_per_score };
  });

  // Apply conditions → effectiveRows
  const effective = augmented.map(row => {
    const eff = {};
    for (const col of STAT_COLS) {
      const cond = conditions[col.key];
      if (cond && typeof row[cond.dependsOn] === 'number') {
        eff[col.key] = row[cond.dependsOn] < cond.minValue ? null : (row[col.key] ?? null);
      } else {
        eff[col.key] = row[col.key] ?? null;
      }
    }
    eff['auction_name'] = row.auction_name ?? null;
    return eff;
  });

  // Visible columns (exclude admin-hidden)
  const visibleCols = STAT_COLS.filter(c => !hidden.has(c.key));

  // Per-column range for gradients
  const colRange = {};
  for (const col of visibleCols) {
    if (!gradients[col.key]) continue;
    const vals = effective.map(r => r[col.key]).filter(v => v !== null && typeof v === 'number');
    if (!vals.length) continue;
    colRange[col.key] = { min: Math.min(...vals), max: Math.max(...vals) };
  }

  // Sort
  const state  = statsSort[div.auctionId];
  const sorted = [...effective].sort((a, b) => {
    const av = a[state.col] ?? (state.dir === 'asc' ? Infinity : -Infinity);
    const bv = b[state.col] ?? (state.dir === 'asc' ? Infinity : -Infinity);
    if (typeof av === 'string') return state.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    return state.dir === 'asc' ? av - bv : bv - av;
  });

  // Measure rank column width for sticky name offset
  let rankWidth = 40;

  const thead = h('thead', {},
    h('tr', {},
      ...visibleCols.map(col => {
        const isActive = state.col === col.key;
        const cls = [
          col.key === 'rank' ? 'col-rank' : col.key === 'name' ? 'col-name' : '',
          isActive ? ('sort-' + state.dir) : '',
        ].filter(Boolean).join(' ');
        const th = h('th', { class: cls }, col.label);
        th.onclick = () => {
          if (state.col === col.key) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
          else { state.col = col.key; state.dir = col.key === 'rank' ? 'asc' : 'desc'; }
          renderApp();
        };
        return th;
      })
    )
  );

  const tbody = h('tbody', {},
    ...sorted.map(row => h('tr', {},
      ...visibleCols.map(col => {
        const val    = row[col.key];
        const grad   = gradients[col.key];
        const range  = colRange[col.key];
        const bg     = (grad && range && typeof val === 'number' && val !== null)
          ? gradientBg(val, range.min, range.max, grad)
          : null;
        const cls = [
          col.key === 'rank' ? 'col-rank' : col.key === 'name' ? 'col-name' : 'num',
        ].join(' ');
        let cellContent;
        if (col.key === 'name') {
          const displayName = row['auction_name'] ?? val ?? '—';
          const isCaptain   = captainSet.has(row['name']);
          cellContent = h('span', { style: 'display:flex;align-items:center;gap:4px;max-width:180px;overflow:hidden' },
            isCaptain ? h('span', { style: 'color:#f59e0b;flex-shrink:0;font-size:10px' }, '♛') : null,
            h('span', { style: 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, stripClanTag(String(displayName)))
          );
        } else {
          cellContent = fmtVal(val, col.fmt);
        }
        const td = h('td', { class: cls }, cellContent);
        if (bg) td.style.backgroundColor = bg;
        return td;
      })
    ))
  );

  // After building, set name column sticky left to match rank width
  const wrap = h('div', { class: 'stats-table-wrap' });
  const table = h('table', {}, thead, tbody);
  wrap.appendChild(table);

  // Use ResizeObserver / requestAnimationFrame to set name left offset after render
  requestAnimationFrame(() => {
    const rankTh = table.querySelector('th.col-rank');
    if (rankTh) {
      const w = rankTh.offsetWidth + 'px';
      table.querySelectorAll('th.col-name, td.col-name').forEach(el => {
        el.style.left = w;
      });
    }
  });

  return wrap;
}

function renderDivision(div) {
  const sub    = divSubTab[div.auctionId];
  const hasStat = div.stats && Array.isArray(div.stats) && div.stats.length > 0;
  const tabs   = [
    { id: 'teams',    label: 'Teams'    },
    { id: 'brackets', label: 'Brackets' },
    { id: 'stats',    label: 'Statistics' + (hasStat ? '' : ' —') },
  ];

  const tabBar = h('div', { class: 'tab-bar' },
    ...tabs.map(t => {
      const btn = h('button', { class: sub === t.id ? 'active' : '' }, t.label);
      btn.onclick = () => { divSubTab[div.auctionId] = t.id; renderApp(); };
      return btn;
    })
  );

  let content;
  if (sub === 'teams')    content = renderTeams(div);
  else if (sub === 'brackets') content = renderBrackets(div);
  else content = renderStats(div);

  return h('div', {},
    div.winner ? h('div', { class: 'winner-banner' },
      h('div', { class: 'crown-icon' }, '♛'),
      h('div', {},
        h('div', { class: 'wlabel' }, 'Division winner'),
        h('div', { class: 'wname' }, div.winner.teamName),
      )
    ) : null,
    tabBar,
    h('div', { class: 'tab-pane active' }, content),
  );
}

function renderMatchups() {
  if (!DATA.matchups.length) return null;
  const section = h('div', { style: 'margin-top:32px' },
    h('h2', { style: 'font-size:15px;font-weight:600;margin-bottom:14px' }, 'Finals Matchups'),
  );
  for (const mu of DATA.matchups) {
    const cmd = mu.mapCmd && mu.factionA && mu.factionB
      ? '!setmap ' + mu.mapCmd + ' ' + mu.factionA.toLowerCase() + ' ' + mu.factionB.toLowerCase()
      : null;
    section.appendChild(h('div', { class: 'matchup-card' },
      mu.label ? h('div', { class: 'mu-label' }, mu.label) : null,
      cmd ? h('code', { class: 'mu-cmd' }, cmd) : null,
      mu.factionA && mu.factionB
        ? h('div', { class: 'mu-teams' }, mu.factionA + ' vs ' + mu.factionB)
        : null,
    ));
  }
  return section;
}

// ─── App ─────────────────────────────────────────────────────────────────────

function renderApp() {
  const root = document.getElementById('root');
  root.innerHTML = '';

  if (!DATA.divisions.length) {
    root.appendChild(h('div', { class: 'empty-state' }, 'No divisions in this tournament.'));
    return;
  }

  // Division tab bar (top level)
  if (DATA.divisions.length > 1) {
    const bar = h('div', { class: 'div-tab-bar' },
      ...DATA.divisions.map((d, i) => {
        const btn = h('button', { class: i === activeDivIdx ? 'active' : '' }, d.name);
        btn.onclick = () => { activeDivIdx = i; renderApp(); };
        return btn;
      })
    );
    root.appendChild(bar);
  }

  const div = DATA.divisions[activeDivIdx];
  root.appendChild(renderDivision(div));

  const mu = renderMatchups();
  if (mu) root.appendChild(mu);
}

renderApp();
</script>
</body>
</html>`
}

function escapeHtml(s: string | null | undefined): string {
  return (s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

// ─── Write output ─────────────────────────────────────────────────────────────

const outDir = join(outputDir, slug)
await mkdir(outDir, { recursive: true })

await writeFile(join(outDir, 'data.json'), JSON.stringify(data, null, 2), 'utf8')
await writeFile(join(outDir, 'index.html'), buildHtml(data), 'utf8')

console.log(`✓ Exported to ${outDir}/`)
console.log(`  index.html — open with a local server (e.g. npx serve ${outDir})`)
console.log(`  data.json  — raw data snapshot`)
