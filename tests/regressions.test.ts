import { afterAll, describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { cleanTokens, parseSetup, positionProblem, seeLoss, buildGame, MAX_INPUT_CHARS } from '../src/core/notation'
import { evalText, whiteBarPct, whiteEval } from '../src/core/eval'
import { computeHints } from '../src/core/hints'
import { classifyMove } from '../src/core/classify'
import { UciEngine } from '../src/core/engine'
import { nodeWorker } from './nodeWorker'

describe('Brilliant is only for real sacrifices (reported bug: trades got "!!")', () => {
  const ruy = 'r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4'
  it('an even trade (Bxc6 dxc6) is not a sacrifice', () => {
    expect(seeLoss(ruy, 'b5c6')).toBe(0)
  })
  it('a queen trade is not a sacrifice', () => {
    expect(seeLoss('3qk3/8/8/8/8/8/8/3QK3 w - - 0 1', 'd1d8')).toBe(0)
  })
  it('winning a rook for a bishop is not a sacrifice', () => {
    expect(seeLoss('3rk3/8/8/8/8/8/8/3BK3 w - - 0 1', 'd1d8')).toBe(0)
  })
  it('a hanging queen is still a sacrifice', () => {
    expect(seeLoss('4k3/4p3/8/8/8/8/3Q4/4K3 w - - 0 1', 'd2d6')).toBe(9)
  })
  it('hints do not flag a near-best trade as Brilliant', () => {
    const h = computeHints(ruy, {
      '1': { mv: 'b5a4', t: 'cp', v: 31 },
      '2': { mv: 'b5c6', t: 'cp', v: 7 },
    })!
    expect(h.brill).toBeNull()
  })
  it('a best-move queen trade is graded Best, not Brilliant', () => {
    const fen = '3qk3/8/8/8/8/8/8/3QK3 w - - 0 1'
    const r = classifyMove(fen, 'd1d8', [{ mv: 'd1d8', t: 'cp', v: 20 }, { mv: 'e1e2', t: 'cp', v: 10 }], [{ mv: 'e8d8', t: 'cp', v: -20 }], 20)!
    expect(r.cls).not.toBe('Brilliant')
  })
})

describe('checkmate at the end of a game (reported bug: showed as Black winning)', () => {
  const mated = [{ mv: '', t: 'mate' as const, v: 0 }]
  it('White mates: Black is to move (odd ply) and has no moves', () => {
    const w = whiteEval([null, mated], 1)!
    expect(w.checkmate).toBe(true)
    expect(w.cp).toBeGreaterThan(0)
    expect(whiteBarPct(w)).toBeGreaterThan(99)
    expect(evalText(w)).toBe('Checkmate (White wins)')
  })
  it('Black mates: White is to move (even ply)', () => {
    const w = whiteEval([mated], 0)!
    expect(w.cp).toBeLessThan(0)
    expect(whiteBarPct(w)).toBeLessThan(1)
    expect(evalText(w)).toBe('Checkmate (Black wins)')
  })
})

describe('positions the engine cannot search are rejected up front', () => {
  it.each([
    ['side not to move is in check', '4k3/8/8/8/8/8/4R3/4K3 w - - 0 1'],
    ['kings touching', '8/8/8/3kK3/8/8/8/8 w - - 0 1'],
  ])('%s', (_n, fen) => {
    expect(positionProblem(fen)).not.toBeNull()
    expect(parseSetup(fen).ok).toBe(false)
  })
  it('accepts normal positions', () => {
    expect(positionProblem(new Chess().fen())).toBeNull()
    expect(parseSetup('4k3/8/8/8/8/8/4R3/4K3 b - - 0 1').ok).toBe(true)
  })
})

describe('robustness of input parsing', () => {
  it('nested variations and comments are removed', () => {
    expect(cleanTokens('1. e4 (1. d4 (1. c4) d5) e5 {c (x} 2. Nf3 ; rest\n Nc6')).toEqual(['e4', 'e5', 'Nf3', 'Nc6'])
  })
  it('hostile input is handled in linear time', () => {
    for (const ch of ['[', '{', '(', '1', '(1.']) {
      const t0 = performance.now()
      cleanTokens(ch.repeat(20000))
      expect(performance.now() - t0).toBeLessThan(250)
    }
  })
  it('refuses absurdly long input', () => {
    expect(buildGame('e4 '.repeat(MAX_INPUT_CHARS)).ok).toBe(false)
    expect(parseSetup('e4 '.repeat(MAX_INPUT_CHARS)).ok).toBe(false)
  })
})

describe('engine robustness (real Stockfish 19)', () => {
  const made: UciEngine[] = []
  afterAll(() => made.forEach((e) => e.dispose()))

  it('a position the engine rejects does not wedge the queue', async () => {
    const e = new UciEngine('sf19', () => nodeWorker('sf'))
    made.push(e)
    await e.ready
    const bad = await Promise.race([
      e.search({ fen: '4k3/8/8/8/8/8/4R3/4K3 w - - 0 1', multipv: 1, go: 'depth 8' }),
      new Promise<'hung'>((r) => setTimeout(() => r('hung'), 8000)),
    ])
    expect(bad).not.toBe('hung')
    const good = await e.search({ fen: new Chess().fen(), multipv: 1, go: 'depth 6' })
    expect(good.aborted).toBe(false)
  })

  it('a worker that errors while booting fails fast and later searches settle', async () => {
    let fire: (() => void) | undefined
    const e = new UciEngine('broken', () => {
      const w = { postMessage() {}, onmessage: null, onerror: null as ((x: unknown) => void) | null, terminate() {} }
      fire = () => w.onerror?.(new Error('404'))
      return w
    })
    made.push(e)
    setTimeout(() => fire?.(), 20)
    await expect(e.ready).rejects.toThrow(/could not start/)
    expect(e.dead).toBe(true)
    const r = await e.search({ fen: new Chess().fen(), multipv: 1, go: 'depth 4' })
    expect(r.aborted).toBe(true)
  })
})
