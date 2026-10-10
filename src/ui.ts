import type { MoveClass } from './core/types'

export const CLASS_VAR: Record<MoveClass | '…', string> = {
  Brilliant: '--brill', Great: '--great', Best: '--best', Excellent: '--exc', Good: '--good', Book: '--book',
  Forced: '--forced', Inaccuracy: '--inacc', Mistake: '--mist', Blunder: '--blun', '…': '--pending',
}

export const CLASS_SYMBOL: Record<MoveClass | '…', string> = {
  Best: '★', Great: '!', Brilliant: '!!', Good: '✓', Excellent: '✓✓', Book: 'B', Inaccuracy: '?!',
  Mistake: '?', Blunder: '??', Forced: '→', '…': '…',
}

export const classColor = (c: MoveClass | '…') => `var(${CLASS_VAR[c]})`
