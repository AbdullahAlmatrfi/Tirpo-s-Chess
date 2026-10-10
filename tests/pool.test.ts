// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { getEngine } from '../src/core/engines'

describe('engine pool', () => {
  it('replaces an engine whose worker died after booting', async () => {
    const workers: { onerror: ((e: unknown) => void) | null }[] = []
    class W {
      onmessage: ((e: { data: unknown }) => void) | null = null
      onerror: ((e: unknown) => void) | null = null
      constructor() { workers.push(this) }
      postMessage(m: string) {
        if (m === 'uci') queueMicrotask(() => this.onmessage?.({ data: 'uciok' }))
        if (m === 'isready') queueMicrotask(() => this.onmessage?.({ data: 'readyok' }))
      }
      terminate() {}
    }
    ;(globalThis as unknown as { Worker: unknown }).Worker = W
    const first = getEngine('sf19')
    await first.ready
    expect(first.dead).toBe(false)
    expect(getEngine('sf19')).toBe(first)
    workers[0]!.onerror?.(new Error('crashed'))
    expect(first.dead).toBe(true)
    const second = getEngine('sf19')
    expect(second).not.toBe(first)
    await second.ready
    expect(second.dead).toBe(false)
  })
})
