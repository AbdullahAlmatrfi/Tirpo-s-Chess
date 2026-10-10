import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { gameStatus } from '../src/core/status'
import { computeHints } from '../src/core/hints'
import { cpv, winPct, whiteEval, evalText } from '../src/core/eval'

describe('gameStatus', () => {
  it('detects fool\'s mate', () => {
    const g = new Chess()
    ;['f3', 'e5', 'g4', 'Qh4#'].forEach((m) => g.move(m))
    expect(gameStatus(g, false)).toEqual({ text: 'Checkmate. Black wins.', over: true })
  })
  it('detects stalemate and insufficient material', () => {
    expect(gameStatus(new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'), false).text).toBe('Stalemate. Draw.')
    expect(gameStatus(new Chess('8/8/8/8/8/8/k7/K7 w - - 0 1'), false).over).toBe(true)
  })
  it('shows whose move it is, check and engine thinking', () => {
    expect(gameStatus(new Chess(), true).text).toBe('White to move · engine thinking…')
    const c = new Chess('4k3/8/8/8/8/8/4r3/4K3 w - - 0 1')
    expect(gameStatus(c, false).text).toBe('White to move (in check)')
  })
})

describe('eval helpers', () => {
  it('maps mate scores to extreme values', () => {
    expect(cpv({ mv: 'a', t: 'mate', v: 3 })).toBeGreaterThan(9000)
    expect(cpv({ mv: 'a', t: 'mate', v: -3 })).toBeLessThan(-9000)
  })
  it('win percentage is 50 at zero and monotonic', () => {
    expect(winPct(0)).toBeCloseTo(50, 5)
    expect(winPct(300)).toBeGreaterThan(winPct(100))
  })
  it('evaluates from White\'s side on odd plies', () => {
    const w = whiteEval([null, [{ mv: 'e7e5', t: 'cp', v: 40 }]], 1)!
    expect(w.cp).toBe(-40)
    expect(evalText(w)).toBe('-0.4')
  })
})

describe('computeHints', () => {
  it('returns top three and flags a clearly best move', () => {
    const fen = new Chess().fen()
    const h = computeHints(fen, {
      '1': { mv: 'e2e4', t: 'cp', v: 60 },
      '2': { mv: 'd2d4', t: 'cp', v: 50 },
      '3': { mv: 'g1f3', t: 'cp', v: 45 },
      '4': { mv: 'c2c4', t: 'cp', v: 40 },
    })!
    expect(h.top.map((l) => l.mv)).toEqual(['e2e4', 'd2d4', 'g1f3'])
    expect(h.only).toBe(false)
    expect(h.brill).toBeNull()
  })
  it('finds a Brilliant candidate among near-best sacrifices', () => {
    const fen = '4k3/4p3/8/8/8/8/3Q4/4K3 w - - 0 1'
    const h = computeHints(fen, {
      '1': { mv: 'd2a5', t: 'cp', v: 120 },
      '2': { mv: 'd2d6', t: 'cp', v: 115 },
    })!
    expect(h.brill?.mv).toBe('d2d6')
  })
  it('returns null with no lines', () => {
    expect(computeHints(new Chess().fen(), {})).toBeNull()
  })
})
