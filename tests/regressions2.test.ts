import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { moveListText, moveTokens, parseSetup, sanitizeFen, buildGame, tryMove } from '../src/core/notation'

describe('move numbering for lines that start mid-game (reported: Black move shown as "1. Ne4")', () => {
  it('labels a Black first move with its real move number and dots', () => {
    const g = new Chess('rnbqkb1r/pppp1ppp/5n2/4p3/4P3/4PN2/PPPP1PPP/RNBQKB1R b KQkq - 0 5')
    const hist = [tryMove(g, 'Nxe4')!, tryMove(g, 'Nxe5')!]
    expect(moveTokens(hist).map((t) => t.label)).toEqual(['5...', '6.'])
    expect(moveListText(hist)).toBe('5... Nxe4 6. Nxe5')
  })
  it('keeps the normal numbering from the start position', () => {
    const g = new Chess()
    const hist = ['e4', 'e5', 'Nf3'].map((m) => tryMove(g, m)!)
    expect(moveListText(hist)).toBe('1. e4 e5 2. Nf3')
  })
})

describe('setup FEN is sanitised (reported: phantom castling / en passant)', () => {
  it('drops castling rights the pieces do not support', () => {
    expect(sanitizeFen('4k3/8/8/8/8/8/8/3K3R w K - 0 1')).toBe('4k3/8/8/8/8/8/8/3K3R w - - 0 1')
    expect(sanitizeFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1')).toBe('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1')
    expect(sanitizeFen('r3k3/8/8/8/8/8/8/R3K2R w KQkq - 0 1')).toBe('r3k3/8/8/8/8/8/8/R3K2R w KQq - 0 1')
  })
  it('drops en passant, so there is no capture of a pawn that is not there', () => {
    const r = parseSetup('4k3/8/8/3P4/8/8/8/4K3 w - e6 0 1')
    expect(r.ok && r.setup.start).toBe('4k3/8/8/3P4/8/8/8/4K3 w - - 0 1')
  })
  it('castling is not offered after sanitising', () => {
    const r = parseSetup('4k3/8/8/8/8/8/8/3K3R w K - 0 1')
    if (!r.ok) throw new Error('should parse')
    const moves = new Chess(r.setup.start!).moves()
    expect(moves).not.toContain('O-O')
  })
})

describe('friendlier errors', () => {
  it('says so when the text is not chess at all', () => {
    const r = buildGame('hello world')
    expect(!r.ok && r.error).toMatch(/doesn't look like a chess move list/)
  })
  it('still lists legal moves for a real illegal move, without ragged dots', () => {
    const r = buildGame('1. e4 e5 2. Ke4')
    expect(!r.ok && r.error).toMatch(/Legal moves at that point/)
    expect(!r.ok && r.error).not.toMatch(/\.\.\.\./)
  })
})
