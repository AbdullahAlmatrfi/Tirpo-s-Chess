import { beforeAll, describe, expect, it, vi } from 'vitest'
import { Chess } from 'chess.js'
import { loadOpenings, openingAt, openingForPositions, openingKey } from '../src/core/openings'

/** FENs of a game: [start, after ply 1, after ply 2, ...]. */
function fensOf(sans: string): string[] {
  const chess = new Chess()
  const out = [chess.fen()]
  for (const san of sans.split(/\s+/).filter(Boolean)) {
    chess.move(san)
    out.push(chess.fen())
  }
  return out
}

const last = (fens: string[]) => fens[fens.length - 1] as string
const START = new Chess().fen()

describe('openingKey', () => {
  it('keeps placement, side to move and castling only', () => {
    expect(openingKey('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2')).toBe(
      'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq',
    )
  })
  it('ignores en passant squares and move counters', () => {
    const a = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'
    const b = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 12 40'
    expect(openingKey(a)).toBe(openingKey(b))
  })
})

describe('opening book', () => {
  beforeAll(async () => {
    await loadOpenings()
  })

  it('names the Ruy Lopez (ECO C60) after 1.e4 e5 2.Nf3 Nc6 3.Bb5', () => {
    const info = openingAt(last(fensOf('e4 e5 Nf3 Nc6 Bb5')))
    expect(info).toEqual({ eco: 'C60', name: 'Ruy Lopez' })
  })

  it('names the Queen\'s Gambit after 1.d4 d5 2.c4', () => {
    const info = openingAt(last(fensOf('d4 d5 c4')))
    expect(info?.name).toBe("Queen's Gambit")
    expect(info?.eco).toBe('D06')
  })

  it('names the Sicilian Defense after 1.e4 c5', () => {
    expect(openingAt(last(fensOf('e4 c5')))).toEqual({ eco: 'B20', name: 'Sicilian Defense' })
  })

  it('finds a position reached by a different move order (transposition)', () => {
    const direct = openingAt(last(fensOf('e4 e5 Nf3 Nc6 Bb5')))
    const transposed = openingAt(last(fensOf('Nf3 Nc6 e4 e5 Bb5')))
    expect(transposed).not.toBeNull()
    expect(transposed).toEqual(direct)
  })

  it('finds a book position even when the FEN has other en passant and move counter fields', () => {
    const fen = last(fensOf('e4 c5'))
    const parts = fen.split(' ')
    const odd = [parts[0], parts[1], parts[2], '-', '7', '31'].join(' ')
    expect(openingAt(odd)).toEqual({ eco: 'B20', name: 'Sicilian Defense' })
  })

  it('returns null for the starting position', () => {
    expect(openingAt(START)).toBeNull()
  })

  it('returns null for a position that is not in the book', () => {
    expect(openingAt('8/8/8/4k3/8/4K3/8/8 w - - 0 1')).toBeNull()
    expect(openingAt(last(fensOf('a4 h5 Ra3 Rh6 Rb3 Rg6')))).toBeNull()
  })

  it('does not mistake castling rights for a match', () => {
    // Same placement as a book position but with castling rights removed: not in the book.
    const fen = last(fensOf('e4 e5 Nf3 Nc6 Bb5'))
    const noCastling = fen.replace(/ KQkq /, ' - ')
    expect(openingAt(noCastling)).toBeNull()
  })

  it('openingForPositions returns the deepest book ply', () => {
    const book = fensOf('e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3')
    const res = openingForPositions(book)
    expect(res).not.toBeNull()
    expect(res?.info.eco).toMatch(/^C(6\d|7\d|8\d|9\d)$/)
    expect(res?.info.name).toContain('Ruy Lopez')
    expect(res?.ply).toBe(book.length - 1)
  })

  it('openingForPositions ignores plies after the game leaves the book', () => {
    const inBook = fensOf('e4 e5 Nf3 Nc6 Bb5')
    const out = fensOf('e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3 Na5 Bc2 c5 d4 Qc7 a3 Bd7 b4 cxb4 axb4 Nc6')
    const res = openingForPositions(out)
    expect(res).not.toBeNull()
    expect(res?.ply).toBeGreaterThanOrEqual(inBook.length - 1)
    expect(res?.ply).toBeLessThan(out.length - 1)
    // Everything after the returned ply is outside the book.
    for (const fen of out.slice((res?.ply ?? 0) + 1)) expect(openingAt(fen)).toBeNull()
    expect(openingAt(out[res?.ply ?? 0] as string)).toEqual(res?.info)
  })

  it('openingForPositions returns null when nothing is in the book', () => {
    expect(openingForPositions([])).toBeNull()
    expect(openingForPositions([START])).toBeNull()
    expect(openingForPositions([START, '8/8/8/4k3/8/4K3/8/8 w - - 0 1'])).toBeNull()
  })

  it('loadOpenings is idempotent', async () => {
    await expect(loadOpenings()).resolves.toBeUndefined()
    await expect(loadOpenings()).resolves.toBeUndefined()
    expect(openingAt(last(fensOf('e4 c5')))?.name).toBe('Sicilian Defense')
  })
})

describe('lazy loading', () => {
  it('openingAt is null before loadOpenings in a fresh module, and filled after', async () => {
    vi.resetModules()
    const fresh = await import('../src/core/openings')
    const fen = last(fensOf('e4 e5 Nf3 Nc6 Bb5'))
    expect(fresh.openingAt(fen)).toBeNull()
    expect(fresh.openingForPositions(fensOf('e4 e5 Nf3 Nc6 Bb5'))).toBeNull()
    const first = fresh.loadOpenings()
    expect(fresh.loadOpenings()).toBe(first)
    await first
    expect(fresh.openingAt(fen)?.name).toBe('Ruy Lopez')
  })
})
