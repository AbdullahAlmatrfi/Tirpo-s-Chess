import type { Chess } from 'chess.js'

export interface GameStatus {
  text: string
  over: boolean
}

export function gameStatus(g: Chess, engineThinking: boolean): GameStatus {
  const side = g.turn() === 'w' ? 'White' : 'Black'
  if (g.isCheckmate()) return { text: `Checkmate. ${g.turn() === 'w' ? 'Black' : 'White'} wins.`, over: true }
  if (g.isStalemate()) return { text: 'Stalemate. Draw.', over: true }
  if (g.isInsufficientMaterial()) return { text: 'Draw: not enough pieces.', over: true }
  if (g.isThreefoldRepetition()) return { text: 'Draw by repetition.', over: true }
  if (g.isDraw()) return { text: 'Draw.', over: true }
  let text = `${side} to move`
  if (g.inCheck()) text += ' (in check)'
  if (engineThinking) text += ' · engine thinking…'
  return { text, over: false }
}
