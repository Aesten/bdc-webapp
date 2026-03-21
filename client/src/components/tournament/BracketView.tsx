import { type Bracket, type Match } from '@/api/brackets'
import { type Captain } from '@/api/auctions'
import { resolveTeam } from './GroupStageView'

// ─── Layout constants ─────────────────────────────────────────────────────────

const CARD_W    = 164   // px — match card width
const CARD_H    = 68    // px — match card height
const MATCH_GAP = 14    // px — gap between cards in same column
const ROUND_GAP = 40    // px — gap between columns (connector zone)
const LABEL_H   = 22    // px — space reserved at top for round labels

function matchY(matchOrder: number, round: number): number {
  const step = (CARD_H + MATCH_GAP) * Math.pow(2, round - 1)
  return matchOrder * step + (step - CARD_H) / 2
}

function matchX(round: number): number {
  return (round - 1) * (CARD_W + ROUND_GAP)
}

function totalHeight(round1Count: number): number {
  return round1Count * CARD_H + (round1Count - 1) * MATCH_GAP + MATCH_GAP / 2
}

function totalWidth(numRounds: number): number {
  return numRounds * CARD_W + (numRounds - 1) * ROUND_GAP
}

// ─── Match card ───────────────────────────────────────────────────────────────

function MatchCard({ match, x, y, captains }: {
  match: Match
  x: number
  y: number
  captains: Captain[]
}) {
  const nameA = match.team_a_name ?? resolveTeam(match.captain_a_id, captains) ?? (match.captain_a_id ? '???' : 'TBD')
  const nameB = match.team_b_name ?? resolveTeam(match.captain_b_id, captains) ?? (match.captain_b_id ? '???' : 'TBD')
  const isTbdA = !match.captain_a_id
  const isTbdB = !match.captain_b_id
  const winnerA = match.winner_captain_id === match.captain_a_id && match.captain_a_id !== null
  const winnerB = match.winner_captain_id === match.captain_b_id && match.captain_b_id !== null

  return (
    <g transform={`translate(${x},${y})`}>
      {/* Card background */}
      <rect
        width={CARD_W} height={CARD_H}
        rx={10} ry={10}
        className="fill-zinc-900 stroke-zinc-700"
        strokeWidth={1}
      />
      {/* Divider */}
      <line x1={0} y1={CARD_H / 2} x2={CARD_W} y2={CARD_H / 2} className="stroke-zinc-800" strokeWidth={1} />

      {/* Side A */}
      <text x={10} y={CARD_H / 4 + 5}
        fontSize={11} fontWeight={winnerA ? 700 : 500}
        fill={winnerA ? '#f59e0b' : isTbdA ? '#52525b' : '#e4e4e7'}>
        {winnerA ? `♛ ${nameA}` : nameA}
      </text>

      {/* Side B */}
      <text x={10} y={CARD_H * 3 / 4 + 5}
        fontSize={11} fontWeight={winnerB ? 700 : 500}
        fill={winnerB ? '#f59e0b' : isTbdB ? '#52525b' : '#e4e4e7'}>
        {winnerB ? `♛ ${nameB}` : nameB}
      </text>

      {/* Score badges */}
      {match.score_a !== null && (
        <text x={CARD_W - 8} y={CARD_H / 4 + 5}
          fontSize={11} fontWeight={700} textAnchor="end"
          fill={winnerA ? '#f59e0b' : '#71717a'}>
          {match.score_a}
        </text>
      )}
      {match.score_b !== null && (
        <text x={CARD_W - 8} y={CARD_H * 3 / 4 + 5}
          fontSize={11} fontWeight={700} textAnchor="end"
          fill={winnerB ? '#f59e0b' : '#71717a'}>
          {match.score_b}
        </text>
      )}
    </g>
  )
}

// ─── Connector lines between rounds ──────────────────────────────────────────

function Connectors({ round1Count, numRounds }: { round1Count: number; numRounds: number }) {
  const paths: string[] = []
  const midX_offset = ROUND_GAP / 2

  for (let r = 1; r < numRounds; r++) {
    const count = round1Count / Math.pow(2, r)
    for (let m = 0; m < count; m++) {
      const yA = matchY(m * 2,     r) + CARD_H / 2
      const yB = matchY(m * 2 + 1, r) + CARD_H / 2
      const yParent = matchY(m, r + 1) + CARD_H / 2
      const xRight  = matchX(r) + CARD_W
      const xMid    = xRight + midX_offset
      const xLeft   = matchX(r + 1)

      paths.push(`M ${xRight} ${yA} H ${xMid}`)
      paths.push(`M ${xRight} ${yB} H ${xMid}`)
      paths.push(`M ${xMid} ${yA} V ${yB}`)
      paths.push(`M ${xMid} ${yParent} H ${xLeft}`)
    }
  }

  return (
    <>
      {paths.map((d, i) => (
        <path key={i} d={d} stroke="#3f3f46" strokeWidth={1.5} fill="none" />
      ))}
    </>
  )
}

// ─── Round label ──────────────────────────────────────────────────────────────

function roundLabel(round: number, numRounds: number): string {
  const fromEnd = numRounds - round
  if (fromEnd === 0) return 'Final'
  if (fromEnd === 1) return 'Semi-finals'
  if (fromEnd === 2) return 'Quarter-finals'
  return `Round ${round}`
}

// ─── BracketView ──────────────────────────────────────────────────────────────

export default function BracketView({ matches, captains, fill }: {
  bracket?: Bracket  // unused, kept for call-site compatibility
  matches: Match[]
  captains: Captain[]
  fill?: boolean     // scale SVG to fill container height (requires container to have defined height)
}) {
  if (matches.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-zinc-700">
        <p className="text-sm italic">No matches yet — shuffle the bracket to generate matchups.</p>
      </div>
    )
  }

  const rounds    = [...new Set(matches.map(m => m.round))].sort((a, b) => a - b)
  const numRounds = rounds.length
  const round1    = matches.filter(m => m.round === rounds[0])
  const r1Count   = round1.length

  const svgW  = totalWidth(numRounds)
  const svgH  = totalHeight(r1Count)
  const vbW   = svgW + 2
  const vbH   = svgH + LABEL_H + 2

  return (
    // width="100%" lets the SVG grow to fill its container; viewBox keeps internal coordinates fixed
    <svg
      viewBox={`0 0 ${vbW} ${vbH}`}
      width="100%"
      height={fill ? '100%' : undefined}
      style={{ display: 'block' }}
    >
      {/* Round labels */}
      {rounds.map((r, i) => (
        <text key={r}
          x={matchX(i + 1) + CARD_W / 2}
          y={14}
          textAnchor="middle"
          fontSize={8}
          fontFamily="ui-monospace, 'Cascadia Code', monospace"
          letterSpacing="0.08em"
          fill="#52525b">
          {roundLabel(i + 1, numRounds).toUpperCase()}
        </text>
      ))}

      {/* Matches + connectors shifted down below labels */}
      <g transform={`translate(0, ${LABEL_H})`}>
        <Connectors round1Count={r1Count} numRounds={numRounds} />
        {matches.map(match => {
          const roundIndex = rounds.indexOf(match.round) + 1
          const x = matchX(roundIndex)
          const y = matchY(match.match_order, roundIndex)
          return <MatchCard key={match.id} match={match} x={x} y={y} captains={captains} />
        })}
      </g>
    </svg>
  )
}
