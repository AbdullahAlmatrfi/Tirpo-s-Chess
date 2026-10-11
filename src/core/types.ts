import type { Color, Move, PieceSymbol, Square } from 'chess.js'

export type { Color, Move, PieceSymbol, Square }

/** One engine principal variation: first move, score, search depth and the full line (UCI moves). */
export interface EngineLine {
  mv: string
  t: 'cp' | 'mate'
  v: number
  d?: number
  pv?: string[]
}

export const MOVE_CLASSES = [
  'Brilliant', 'Great', 'Best', 'Excellent', 'Good', 'Book', 'Forced', 'Inaccuracy', 'Mistake', 'Blunder',
] as const
export type MoveClass = (typeof MOVE_CLASSES)[number]

export interface Classification {
  cls: MoveClass
  /** win-percentage points lost versus the best move */
  loss: number
  /** approximate accuracy 0..100 */
  acc: number
  /** the position was already lost before this move */
  lost: boolean
}

export interface GameData {
  names: { w: string; b: string }
  fens: string[]
  moves: Move[]
  ucis: string[]
}

export type Evals = (EngineLine[] | null)[]

export interface EngineSpec {
  key: string
  label: string
  file: string
}
