import { Chess } from 'chess.js'
import { cpv, winPct } from './eval'
import { seeLoss } from './notation'
import type { Classification, EngineLine, Evals, GameData, MoveClass } from './types'

/** Thresholds are in win-percentage points lost versus the best move. */
const BLUNDER = 20
const MISTAKE = 10
const INACCURACY = 5
const GOOD = 2

/**
 * Classify move `i` of a game.
 * `before` is the engine output for the position before the move (mover's view),
 * `after` the output for the position after it (opponent's view).
 */
export function classifyMove(
  fenBefore: string,
  played: string,
  before: EngineLine[] | null,
  after: EngineLine[] | null,
  ply: number,
): Classification | null {
  if (!before?.length || !after?.length) return null
  const best = before[0]!
  const second = before[1]
  const legalCount = new Chess(fenBefore).moves().length
  const isTop = best.mv === played
  const pl = before.find((l) => l.mv === played)
  const afterCp = pl ? cpv(pl) : -cpv(after[0]!)
  const wb = winPct(cpv(best))
  const wa = winPct(afterCp)
  const loss = Math.max(0, wb - wa)
  const gap = second ? wb - winPct(cpv(second)) : 99

  let cls: MoveClass
  if (loss >= BLUNDER) cls = 'Blunder'
  else if (loss >= MISTAKE) cls = 'Mistake'
  else if (loss >= INACCURACY) cls = 'Inaccuracy'
  else if (loss >= GOOD) cls = 'Good'
  else if (isTop || loss < 0.5) cls = 'Best'
  else cls = 'Excellent'

  if (cls === 'Best' || cls === 'Excellent') {
    if (isTop && gap >= 12 && gap < 99 && wb > 25 && wb < 92) cls = 'Great'
    if ((isTop || loss < 0.5) && wb < 90 && wb > 45 && legalCount > 1 && seeLoss(fenBefore, played) >= 2) cls = 'Brilliant'
  }

  const mateBefore = best.t === 'mate' && best.v > 0
  const mateAfter = pl ? pl.t === 'mate' && pl.v > 0 : after[0]!.t === 'mate' && after[0]!.v < 0
  if (mateBefore && mateAfter && cls !== 'Best') cls = 'Excellent'
  if (best.t === 'mate' && best.v < 0 && (cls === 'Best' || cls === 'Excellent') && !isTop) cls = 'Good'
  if (ply < 8 && (cls === 'Best' || cls === 'Excellent' || cls === 'Good') && loss < 6) cls = 'Book'
  if (legalCount === 1) cls = 'Forced'

  const acc = Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669))
  return { cls, loss, acc, lost: best.t === 'mate' && best.v < 0 }
}

export function classifyGame(game: GameData, evals: Evals): (Classification | null)[] {
  return game.moves.map((_, i) => classifyMove(game.fens[i]!, game.ucis[i]!, evals[i] ?? null, evals[i + 1] ?? null, i))
}

export interface SideSummary {
  accuracy: number | null
  tally: Partial<Record<MoveClass, number>>
}

export function summarize(rows: (Classification | null)[]): { w: SideSummary; b: SideSummary } {
  const make = (side: 0 | 1): SideSummary => {
    const accs: number[] = []
    const tally: Partial<Record<MoveClass, number>> = {}
    rows.forEach((r, i) => {
      if (!r || i % 2 !== side) return
      accs.push(r.acc)
      tally[r.cls] = (tally[r.cls] ?? 0) + 1
    })
    return { accuracy: accs.length ? accs.reduce((a, b) => a + b, 0) / accs.length : null, tally }
  }
  return { w: make(0), b: make(1) }
}

export const NEEDS_BEST_HINT: readonly MoveClass[] = ['Good', 'Inaccuracy', 'Mistake', 'Blunder']
