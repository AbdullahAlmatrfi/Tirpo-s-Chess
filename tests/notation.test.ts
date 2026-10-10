import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { buildGame, cleanTokens, headerName, parseSetup, seeLoss, words } from '../src/core/notation'
import sample from '../src/data/sample.json'

describe('cleanTokens', () => {
  it('strips headers, comments, variations, NAGs and move numbers', () => {
    const t = '[Event "x"]\n1. e4 {best} e5 (1... c5 2. Nf3) 2. Nf3! $1 Nc6?? 3.Bb5 1-0'
    expect(cleanTokens(t)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'])
  })
  it('accepts zeros for castling and figurine pieces', () => {
    expect(cleanTokens('1. e4 e5 2. ♘f3 ♞c6 3. 0-0')).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'O-O'])
  })
})

describe('headerName', () => {
  it('reads a tag and ignores "?"', () => {
    expect(headerName('[White "Tirpo464"]', 'White')).toBe('Tirpo464')
    expect(headerName('[Black "?"]', 'Black')).toBeNull()
  })
})

describe('buildGame', () => {
  it('builds the sample game with 74 plies', () => {
    const r = buildGame(sample.text)
    expect(r.ok && r.game.moves.length).toBe(74)
  })
  it('reports the first illegal move with legal alternatives', () => {
    const r = buildGame('1. e4 e5 2. Ke4')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/Move 2\.\s*"Ke4"|Move 2\. "Ke4"/)
  })
  it('rejects empty input', () => {
    expect(buildGame('   ').ok).toBe(false)
  })
})

describe('words', () => {
  it('describes quiet moves, captures, castling and checks in plain words', () => {
    const start = new Chess().fen()
    expect(words(start, 'g1f3').text).toBe('Knight to f3')
    const c = new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1')
    expect(words(c.fen(), 'e1g1').text).toBe('Castle kingside')
    expect(words(c.fen(), 'e1c1').text).toBe('Castle queenside')
    expect(words('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', 'a1a8').text).toBe('Rook to a8, check')
    expect(words('8/P5k1/8/8/8/8/8/4K3 w - - 0 1', 'a7a8q').text).toBe('Pawn to a8 and becomes a queen')
  })
})

describe('seeLoss', () => {
  it('is 0 for a safe move and positive for a hanging sacrifice', () => {
    expect(seeLoss(new Chess().fen(), 'e2e4')).toBe(0)
    // queen steps next to a defended pawn: can be taken for free
    expect(seeLoss('4k3/4p3/8/8/8/8/3Q4/4K3 w - - 0 1', 'd2d6')).toBeGreaterThanOrEqual(2)
  })
})

describe('parseSetup', () => {
  it('parses a FEN with missing fields', () => {
    const r = parseSetup('8/8/8/8/8/8/8/K6k')
    expect(r.ok && r.setup.start).toBe('8/8/8/8/8/8/8/K6k w - - 0 1')
  })
  it('parses a move list and reports illegal moves', () => {
    expect(parseSetup('1. e4 e5').ok).toBe(true)
    const bad = parseSetup('1. e4 e4')
    expect(bad.ok).toBe(false)
  })
})
