import { describe, expect, it } from 'vitest'
import { classifyGame, summarize } from '../src/core/classify'
import { buildGame } from '../src/core/notation'
import type { EngineLine } from '../src/core/types'
import sample from '../src/data/sample.json'
import rows from './fixtures/rows.json'

describe('classification of the sample game', () => {
  const built = buildGame(sample.text)
  if (!built.ok) throw new Error('sample must parse')
  const evals = sample.evals as EngineLine[][]
  const out = classifyGame(built.game, evals)

  it('has an entry for every move', () => {
    expect(out).toHaveLength(74)
    expect(out.every((r) => r !== null)).toBe(true)
  })

  it('matches the reference run move by move', () => {
    const diffs: string[] = []
    rows.forEach((row, i) => {
      let exp = row.cls
      if (exp === 'Book?') exp = 'Book'
      if (row.secondGap >= 99 && exp === 'Best') exp = 'Forced'
      if (out[i]!.cls !== exp) diffs.push(`${i + 1}: got ${out[i]!.cls}, expected ${exp}`)
    })
    expect(diffs).toEqual([])
  })

  it('summarizes accuracy and tallies per side', () => {
    const s = summarize(out)
    expect(s.w.accuracy).toBeGreaterThan(0)
    expect(s.b.accuracy).toBeLessThanOrEqual(100)
    const total = Object.values(s.w.tally).reduce((a, b) => a + b, 0) + Object.values(s.b.tally).reduce((a, b) => a + b, 0)
    expect(total).toBe(74)
  })

  it('returns null until both neighbouring positions have evals', () => {
    const partial = classifyGame(built.game, [evals[0]!, null, null] as never)
    expect(partial[0]).toBeNull()
  })
})
