import type { EngineLine, Evals } from './types'

/** Centipawn value of a line; mate scores become huge numbers. */
export const cpv = (l: EngineLine): number =>
  l.t === 'mate' ? (l.v > 0 ? 10000 - Math.abs(l.v) * 10 : -10000 + Math.abs(l.v) * 10) : l.v

/** Win percentage (0..100) from a centipawn score. */
export const winPct = (cp: number): number => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1)

/** Eval-bar fill (0..100 for White) from a centipawn score. */
export const barPct = (cp: number): number => 100 / (1 + Math.exp(-0.0042 * cp))

export interface WhiteEval {
  cp: number
  mate: number | null
  /** the game ended in checkmate in this position */
  checkmate?: boolean
}

/** Evaluation of position i from White's point of view. */
export function whiteEval(evals: Evals, i: number): WhiteEval | null {
  const e = evals[i]
  const l = e?.[0]
  if (!l) return null
  const sign = i % 2 === 0 ? 1 : -1
  // "mate in 0": the side to move has been checkmated, so the other side won
  if (l.t === 'mate' && l.v === 0) return { cp: sign * cpv(l), mate: null, checkmate: true }
  if (l.t === 'mate') return { cp: sign * cpv(l), mate: sign * (l.v > 0 ? 1 : -1) * Math.abs(l.v) }
  return { cp: sign * l.v, mate: null }
}

export function whiteBarPct(w: WhiteEval | null): number | null {
  if (!w) return null
  if (w.mate !== null) return w.mate > 0 ? 100 : 0
  return barPct(w.cp)
}

export function evalText(w: WhiteEval | null): string {
  if (!w) return ''
  if (w.checkmate) return w.cp > 0 ? 'Checkmate (White wins)' : 'Checkmate (Black wins)'
  if (w.mate !== null) return `Mate in ${Math.abs(w.mate)}${w.mate > 0 ? ' (White)' : ' (Black)'}`
  return `${w.cp > 0 ? '+' : ''}${(w.cp / 100).toFixed(1)}`
}

/** Score of a line for the side to move, for hint lists. */
export function lineText(l: EngineLine): string {
  if (l.t === 'mate') return l.v > 0 ? `Mate in ${l.v}` : `Mated in ${Math.abs(l.v)}`
  return `${l.v > 0 ? '+' : ''}${(l.v / 100).toFixed(1)}`
}
