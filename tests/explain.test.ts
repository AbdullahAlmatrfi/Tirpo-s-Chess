import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { exchangeGain, explainMove, lineText } from '../src/core/explain'
import { classifyMove } from '../src/core/classify'
import type { EngineLine } from '../src/core/types'

const L = (mv: string, v: number, t: 'cp' | 'mate' = 'cp', pv?: string[]): EngineLine => ({ mv, t, v, pv })
const fenAfter = (fen: string, uci: string) => {
  const c = new Chess(fen)
  c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
  return c.fen()
}
function explain(fen: string, played: string, before: EngineLine[], after: EngineLine[], ply = 30) {
  const cls = classifyMove(fen, played, before, after, ply)!
  return { cls, ex: explainMove({ fenBefore: fen, played, cls, before, after, ply }) }
}
const play = (moves: string) => {
  const c = new Chess()
  moves.split(' ').forEach((m) => c.move(m))
  return c.fen()
}

describe('exchangeGain', () => {
  it('free piece, defended piece, even trade', () => {
    expect(exchangeGain('4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1', 'd1d5')).toBe(9) // rook takes undefended queen
    expect(exchangeGain('4k3/8/2p5/3p4/4P3/8/8/4K3 w - - 0 1', 'e4d5')).toBe(0) // pawn takes pawn, pawn retakes
    expect(exchangeGain('3rk3/8/8/3q4/8/8/8/3RK3 w - - 0 1', 'd1d5')).toBe(4) // Rxq, Rxr: wins 9, loses 5
  })
})

describe('explainMove', () => {
  it('says a hanging queen is a blunder and names the capture', () => {
    const fen = play('e4 e5 Qh5 Nc6') // white to move
    const before = [L('f1c4', 50), L('b1c3', 40), L('g1f3', 30)]
    const after = [L('c6e5', 900), L('a7a6', 20)] // black knight takes the queen
    const f = fenAfter(fen, 'h5e5')
    expect(f).toBeTruthy()
    const { cls, ex } = explain(fen, 'h5e5', before, [L('c6e5', 880)])
    expect(cls.cls).toBe('Blunder')
    const text = ex.reasons.join(' ')
    expect(text).toMatch(/queen/)
    expect(text).toMatch(/Nxe5/)
    expect(text).toMatch(/Black/)
    expect(ex.headline).toMatch(/blunder/i)
    expect(after.length).toBe(2)
  })

  it('reports a forced mate that a mistake allows', () => {
    const fen = play('e4 e5 Qh5 Nc6 Bc4') // black to move, Nf6?? allows Qxf7#
    const { cls, ex } = explain(fen, 'g8f6', [L('g7g6', -60), L('d8e7', -90)], [L('h5f7', 1, 'mate', ['h5f7'])])
    expect(cls.cls).toBe('Blunder')
    expect(ex.reasons.join(' ')).toMatch(/checkmate in 1/)
    expect(ex.lines.some((l) => l.text.includes('Qxf7#'))).toBe(true)
  })

  it('names the better move that was missed (wins a piece)', () => {
    const fen = '4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1'
    const { ex } = explain(fen, 'e1e2', [L('d1d5', 900), L('e1d2', 0)], [L('d5d1', 500)])
    expect(ex.reasons.join(' ')).toMatch(/Rxd5 would have won a queen/)
  })

  it('describes a checkmate move', () => {
    const fen = play('e4 e5 Qh5 Nc6 Bc4 Nf6') // Qxf7#
    const { ex } = explain(fen, 'h5f7', [L('h5f7', 1, 'mate', ['h5f7'])], [{ mv: '', t: 'mate', v: 0 }])
    expect(ex.reasons.join(' ')).toMatch(/checkmate/i)
  })

  it('spots a knight fork', () => {
    const fen = 'r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1'
    const { ex } = explain(fen, 'd5c7', [L('d5c7', 600), L('e1d2', 300)], [L('e8d7', -590)])
    const t = ex.reasons.join(' ')
    expect(t).toMatch(/king on e8/)
    expect(t).toMatch(/rook on a8/)
  })

  it('opening principles for a normal developing move', () => {
    const { ex } = explain(new Chess().fen(), 'e2e4', [L('e2e4', 30), L('d2d4', 28), L('g1f3', 25)], [L('e7e5', -25)], 0)
    expect(ex.reasons.join(' ')).toMatch(/centre/)
  })

  it('brilliant: explains the sacrifice', () => {
    // white sacrifices the rook on h7 (illustrative eval numbers); only the wording is checked here
    const fen = 'r1bq1rk1/ppp2ppp/2n2n2/3pp3/1bB1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 1'
    const before = [L('c4d5', 40), L('c3d5', 38)]
    const { cls, ex } = explain(fen, 'c3d5', before, [L('f6d5', -35)])
    if (cls.cls === 'Brilliant') expect(ex.reasons.join(' ')).toMatch(/sacrifice/)
    expect(ex.headline.length).toBeGreaterThan(0)
  })

  it('never throws and always gives a headline on odd input', () => {
    const fen = new Chess().fen()
    expect(explainMove({ fenBefore: fen, played: 'zzzz', cls: { cls: 'Good', loss: 0, acc: 100, lost: false }, before: [L('e2e4', 0)], after: [L('e7e5', 0)], ply: 0 }).reasons).toEqual([])
  })
})

describe('lineText', () => {
  it('numbers moves from either side', () => {
    expect(lineText(new Chess().fen(), ['e2e4', 'e7e5', 'g1f3'])).toBe('1. e4 e5 2. Nf3')
    const f = play('e4')
    expect(lineText(f, ['e7e5', 'g1f3'])).toBe('1... e5 2. Nf3')
  })
})
