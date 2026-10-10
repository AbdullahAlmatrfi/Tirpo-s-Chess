import { Chess } from 'chess.js'
import { cpv, winPct } from './eval'
import { seeLoss } from './notation'
import type { EngineLine } from './types'

export interface Hints {
  top: EngineLine[]
  best: EngineLine
  /** a sacrifice the engine still rates near the top */
  brill: EngineLine | null
  /** the best move is clearly better than the second best */
  only: boolean
}

/** Turn live engine lines (keyed by multipv rank) into the top-3 + Brilliant hint. */
export function computeHints(fen: string, lines: Record<string, EngineLine>): Hints | null {
  const arr = Object.keys(lines).sort().map((k) => lines[k]!).filter((l) => l.mv)
  if (!arr.length) return null
  const best = arr[0]!
  const wb = winPct(cpv(best))
  const legal = new Chess(fen).moves().length
  let brill: EngineLine | null = null
  if (legal > 1 && wb < 90) {
    for (const l of arr) {
      const wl = winPct(cpv(l))
      if (wl > 45 && wb - wl <= 6 && seeLoss(fen, l.mv) >= 2) {
        if (!brill || cpv(l) > cpv(brill)) brill = l
      }
    }
  }
  const second = arr[1]
  const only = second ? wb - winPct(cpv(second)) >= 12 && wb > 25 && wb < 92 : false
  return { top: arr.slice(0, 3), best, brill, only }
}
