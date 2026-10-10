import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { clampElo, pickWeakMove, planOpponent } from '../src/core/strength'
import type { EngineLine } from '../src/core/types'

/** deterministic pseudo-random numbers */
function seeded(seed: number) {
  let s = seed
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296)
}

const FEN = new Chess().fen()
const lines: EngineLine[] = [
  { mv: 'e2e4', t: 'cp', v: 100 },
  { mv: 'd2d4', t: 'cp', v: 40 },
  { mv: 'g1f3', t: 'cp', v: 20 },
  { mv: 'c2c4', t: 'cp', v: -20 },
  { mv: 'b1c3', t: 'cp', v: -80 },
  { mv: 'a2a3', t: 'cp', v: -200 },
]

describe('planOpponent', () => {
  it('uses the built-in limiter at and above 1320', () => {
    expect(planOpponent(1320)).toMatchObject({ engineElo: 1320, handicap: false, multipv: 1 })
    expect(planOpponent(2200)).toMatchObject({ engineElo: 2200, handicap: false })
  })
  it('is full strength at the top', () => {
    expect(planOpponent(3200).engineElo).toBeUndefined()
  })
  it('adds deliberate mistakes below 1320', () => {
    const p = planOpponent(500)
    expect(p.handicap).toBe(true)
    expect(p.engineElo).toBe(1320)
    expect(p.multipv).toBeGreaterThan(1)
  })
  it('clamps silly values', () => {
    expect(clampElo(-5)).toBe(400)
    expect(clampElo(99999)).toBe(3200)
    expect(clampElo(Number.NaN)).toBe(400)
  })
})

describe('pickWeakMove', () => {
  const bestRate = (elo: number) => {
    const rng = seeded(42)
    let best = 0
    const n = 3000
    for (let i = 0; i < n; i++) if (pickWeakMove(FEN, lines, elo, rng) === 'e2e4') best++
    return best / n
  }
  it('always returns a legal move', () => {
    const rng = seeded(7)
    const legal = new Set(new Chess(FEN).moves({ verbose: true }).map((m) => m.from + m.to))
    for (let i = 0; i < 500; i++) expect(legal.has(pickWeakMove(FEN, lines, 500, rng)!)).toBe(true)
  })
  it('plays the best move more often as the Elo rises', () => {
    const low = bestRate(500)
    const mid = bestRate(900)
    const high = bestRate(1300)
    expect(low).toBeLessThan(mid)
    expect(mid).toBeLessThan(high)
    expect(low).toBeLessThan(0.35)
    expect(high).toBeGreaterThan(0.6)
  })
  it('returns null when there are no legal moves', () => {
    expect(pickWeakMove('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', [], 500)).toBeNull()
  })
})
