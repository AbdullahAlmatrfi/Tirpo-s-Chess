import { Chess } from 'chess.js'
import { cpv } from './eval'
import type { EngineLine } from './types'

/** Stockfish's own strength limiter only reaches down to this Elo. */
export const STOCKFISH_MIN_ELO = 1320
export const STOCKFISH_MAX_ELO = 3190
export const MIN_ELO = 400
export const MAX_ELO = 3200

export const clampElo = (elo: number) => Math.max(MIN_ELO, Math.min(MAX_ELO, Math.round(elo) || MIN_ELO))

export interface OpponentPlan {
  /** Elo passed to Stockfish (undefined = full strength) */
  engineElo?: number
  multipv: number
  go: string
  /** below Stockfish's floor we add deliberate mistakes on top */
  handicap: boolean
}

export function planOpponent(eloIn: number): OpponentPlan {
  const elo = clampElo(eloIn)
  if (elo >= STOCKFISH_MAX_ELO) return { multipv: 1, go: 'movetime 1500', handicap: false }
  if (elo >= STOCKFISH_MIN_ELO) {
    const ms = elo < 2000 ? 500 : elo < 2600 ? 900 : 1500
    return { engineElo: elo, multipv: 1, go: `movetime ${ms}`, handicap: false }
  }
  // weaker than Stockfish can go: look at several candidates quickly, then pick badly on purpose
  return { engineElo: STOCKFISH_MIN_ELO, multipv: 8, go: 'movetime 120', handicap: true }
}

/** 0 at Stockfish's floor, 1 at the lowest Elo we offer. */
const weakness = (elo: number) => Math.max(0, Math.min(1, (STOCKFISH_MIN_ELO - elo) / (STOCKFISH_MIN_ELO - MIN_ELO)))

/**
 * Pick a deliberately imperfect move for Elo values below Stockfish's floor.
 * Most of the time it chooses among the engine's candidates (worse ones more often
 * at lower Elo); sometimes it plays a random legal move, which is where the
 * hung pieces of a beginner come from. The numbers are tuned by feel, not measured.
 */
export function pickWeakMove(fen: string, lines: EngineLine[], eloIn: number, rng: () => number = Math.random): string | null {
  const elo = clampElo(eloIn)
  const t = weakness(elo)
  const legal = new Chess(fen).moves({ verbose: true }).map((m) => m.from + m.to + (m.promotion ?? ''))
  if (!legal.length) return null
  if (rng() < t * 0.35) return legal[Math.floor(rng() * legal.length)]!
  const cands = lines.filter((l) => l.mv)
  if (!cands.length) return legal[Math.floor(rng() * legal.length)]!
  const best = cpv(cands[0]!)
  const tau = 40 + 420 * t // centipawns: higher = more willing to pick worse moves
  const weights = cands.map((l) => Math.exp(-Math.max(0, best - cpv(l)) / tau))
  const total = weights.reduce((a, b) => a + b, 0)
  let r = rng() * total
  for (let i = 0; i < cands.length; i++) {
    r -= weights[i]!
    if (r <= 0) return cands[i]!.mv
  }
  return cands[0]!.mv
}

export function eloLabel(elo: number): string {
  if (elo < 800) return 'Beginner'
  if (elo < 1200) return 'Casual'
  if (elo < 1600) return 'Club'
  if (elo < 2000) return 'Strong club'
  if (elo < 2400) return 'Expert'
  if (elo < 2800) return 'Master'
  return 'Super-GM'
}
