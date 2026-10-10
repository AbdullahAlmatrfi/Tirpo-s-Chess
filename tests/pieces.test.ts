import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { applyBack, applyForward, piecesFromFen, placementOf } from '../src/core/pieces'
import { tryMove } from '../src/core/notation'

function roundTrip(fen: string, san: string) {
  let id = 0
  const nid = () => ++id
  const c = new Chess(fen)
  const m = tryMove(c, san)!
  expect(m).not.toBeNull()
  const before = piecesFromFen(fen, nid)
  const fwd = applyForward(before, m)
  expect(placementOf(fwd)).toBe(c.fen().split(' ')[0])
  const back = applyBack(fwd, m, nid)
  expect(placementOf(back)).toBe(fen.split(' ')[0])
  return { before, fwd, back }
}

describe('piece model keeps identities and matches chess.js', () => {
  it('quiet move keeps the same piece id', () => {
    const { before, fwd } = roundTrip(new Chess().fen(), 'e4')
    const pawn = before.find((p) => p.sq === 'e2')!
    expect(fwd.find((p) => p.id === pawn.id)!.sq).toBe('e4')
  })
  it('capture fades the captured piece out and restores it when stepping back', () => {
    const { fwd } = roundTrip('4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1', 'exd5')
    expect(fwd.filter((p) => p.fx === 'out')).toHaveLength(1)
  })
  it('castling moves the rook too', () => {
    roundTrip('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'O-O')
    roundTrip('r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1', 'O-O-O')
  })
  it('en passant removes the passed pawn', () => {
    roundTrip('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1', 'exd6')
  })
  it('promotion changes the type and back restores the pawn', () => {
    roundTrip('4k3/P7/8/8/8/8/8/4K3 w - - 0 1', 'a8=Q+')
    roundTrip('1r2k3/P7/8/8/8/8/8/4K3 w - - 0 1', 'axb8=N')
  })
})
