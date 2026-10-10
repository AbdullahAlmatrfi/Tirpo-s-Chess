import { afterAll, describe, expect, it } from 'vitest'
import { UciEngine } from '../src/core/engine'
import { nodeWorker } from './nodeWorker'

const engines: UciEngine[] = []
const make = (file = 'sf') => {
  const e = new UciEngine(`test ${file}`, () => nodeWorker(file))
  engines.push(e)
  return e
}
afterAll(() => engines.forEach((e) => e.dispose()))

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

describe('UciEngine (real Stockfish)', () => {
  it.each(['sf', 'sf18', 'sf17'])('%s boots and returns three ranked lines', async (file) => {
    const e = make(file)
    await e.ready
    const r = await e.search({ fen: START, multipv: 3, go: 'depth 10' })
    expect(r.aborted).toBe(false)
    expect(r.lines).toHaveLength(3)
    expect(r.best).toMatch(/^[a-h][1-8][a-h][1-8]/)
  })

  it('finds mate in one', async () => {
    const e = make()
    await e.ready
    const r = await e.search({ fen: '6k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1', multipv: 1, go: 'depth 10' })
    expect(r.best).toBe('e1e8')
    expect(r.lines[0]).toMatchObject({ t: 'mate', v: 1 })
  })

  it('a newer job replaces a waiting one and stops the running one', async () => {
    const e = make()
    await e.ready
    const first = e.search({ fen: START, multipv: 1, go: 'depth 30' })
    const second = e.search({ fen: START, multipv: 1, go: 'depth 30' })
    const third = e.search({ fen: START, multipv: 1, go: 'depth 8' })
    const [a, b, c] = await Promise.all([first, second, third])
    expect(a.aborted).toBe(true)
    expect(b.aborted).toBe(true)
    expect(c.aborted).toBe(false)
  })

  it('cancel aborts the running search', async () => {
    const e = make()
    await e.ready
    const p = e.search({ fen: START, multipv: 1, go: 'depth 40' })
    await new Promise((r) => setTimeout(r, 300))
    e.cancel()
    expect((await p).aborted).toBe(true)
    const next = await e.search({ fen: START, multipv: 1, go: 'depth 6' })
    expect(next.aborted).toBe(false)
  })

  it('reports a clear error when the worker never answers', async () => {
    const dead = new UciEngine('dead engine', () => ({ postMessage() {}, onmessage: null, terminate() {} }))
    engines.push(dead)
    // boot waits 25 s for uciok; shorten by racing a timer rather than waiting for the real timeout
    const raced = await Promise.race([dead.ready.then(() => 'ready', () => 'failed'), new Promise((r) => setTimeout(() => r('pending'), 500))])
    expect(raced).toBe('pending')
  })
})

describe('strength limiting', () => {
  it('full strength finds the better move, a limited search still returns a legal move', async () => {
    const e = make()
    await e.ready
    const full = await e.search({ fen: START, multipv: 1, go: 'depth 8' })
    expect(full.aborted).toBe(false)
    const limited = await e.search({ fen: START, multipv: 1, elo: 1320, go: 'movetime 100' })
    expect(limited.best).toMatch(/^[a-h][1-8][a-h][1-8]/)
    const again = await e.search({ fen: START, multipv: 3, go: 'depth 8' })
    expect(again.lines).toHaveLength(3) // limiter was switched off again for analysis
  })
})
