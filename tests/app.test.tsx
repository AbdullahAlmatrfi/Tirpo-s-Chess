// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import App from '../src/App'
import { nodeWorker } from './nodeWorker'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// every engine "worker" is a real Stockfish process
const spawned: { terminate(): void }[] = []
class TestWorker {
  private w
  onmessage: ((e: { data: unknown }) => void) | null = null
  constructor(url: string) {
    const file = /engines\/(sf\d*)\.js/.exec(url)?.[1] ?? 'sf'
    this.w = nodeWorker(file)
    this.w.onmessage = (e) => this.onmessage?.(e)
    spawned.push(this.w)
  }
  postMessage(m: string) { this.w.postMessage(m) }
  terminate() { this.w.terminate() }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function until(cond: () => boolean, ms = 20000) {
  const t0 = Date.now()
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('timeout waiting for condition')
    await act(async () => { await sleep(60) })
  }
}

let root: Root
let host: HTMLElement
const $ = (sel: string) => host.querySelector<HTMLElement>(sel)
const $$ = (sel: string) => [...host.querySelectorAll<HTMLElement>(sel)]
const button = (text: RegExp | string) =>
  $$('button').find((b) => (typeof text === 'string' ? b.textContent === text : text.test(b.textContent ?? '')))!
const click = (el: Element) => act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
const SQ = 100 // the mocked board is 800px wide
const at = (file: string, rank: number, flipped = false) => {
  const f = 'abcdefgh'.indexOf(file)
  const x = flipped ? 7 - f : f
  const y = flipped ? rank - 1 : 8 - rank
  return { clientX: x * SQ + SQ / 2, clientY: y * SQ + SQ / 2 }
}
const ptr = (target: EventTarget, type: string, pos: { clientX: number; clientY: number }, button = 0) =>
  act(async () => { target.dispatchEvent(new MouseEvent(type, { bubbles: true, button, ...pos })) })
const board = () => $('.board')!

beforeAll(() => {
  ;(globalThis as unknown as { Worker: unknown }).Worker = TestWorker
  Element.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 800, right: 800, bottom: 800, x: 0, y: 0, toJSON() {} }) as DOMRect
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterAll(() => {
  act(() => root.unmount())
  spawned.forEach((w) => w.terminate())
})

describe('Tirpo\'s Chess app', () => {
  it('renders the start position with 32 pieces and the fair-play note', async () => {
    await act(async () => root.render(<App />))
    expect($$('.pc')).toHaveLength(32)
    expect(host.textContent).toMatch(/that is cheating/)
  })

  it('loads the sample game and shows grades, accuracy and the move list', async () => {
    await click(button('Load sample game'))
    expect($$('.mv')).toHaveLength(74)
    expect($$('.who')).toHaveLength(2)
    expect(host.textContent).toContain('Tirpo464')
    expect($('.acc')!.textContent).not.toBe('–')
  })

  it('steps forward and shows a grade pill and the engine top choices', async () => {
    await click(button('▶'))
    expect($('.pill')).not.toBeNull()
    expect($('.vmove')!.textContent).toMatch(/^1\. g3/)
    expect($$('.alt').length).toBeGreaterThanOrEqual(3)
    expect($$('.mv.on')).toHaveLength(1)
  })

  it('flips the board', async () => {
    const before = $('.coord.r')!.textContent
    await click(button(/Flip board/))
    expect($('.coord.r')!.textContent).not.toBe(before)
    await click(button(/Flip board/))
  })

  it('draws and clears an arrow with the right mouse button', async () => {
    await ptr(board(), 'mousedown', at('e', 2), 2)
    await ptr(window, 'mouseup', at('e', 4), 2)
    const user = $$('svg.arrows')[1]!
    expect(user.querySelectorAll('line').length).toBe(1)
    await ptr(board(), 'mousedown', at('a', 1), 0)
    expect(user.querySelectorAll('line').length).toBe(0)
  })

  it('touching a piece enters try mode, marks it as not the real game, and Back returns', async () => {
    await click(button('⏮'))
    // white to move at the start: drag the g1 knight to f3
    await ptr(board(), 'pointerdown', at('g', 1))
    await ptr(window, 'pointermove', { clientX: at('g', 1).clientX - 10, clientY: at('g', 1).clientY - 40 })
    await ptr(window, 'pointermove', at('f', 3))
    expect($$('.pc.drag')).toHaveLength(1)
    await ptr(window, 'pointerup', at('f', 3))
    expect(host.textContent).toContain('NOT the real game')
    expect(document.body.classList.contains('trying')).toBe(true)
    expect($('.moves')!.textContent).toContain('Nf3')
    await click(button(/Back to the game/))
    expect(document.body.classList.contains('trying')).toBe(false)
    expect(host.textContent).not.toContain('NOT the real game')
    expect($('.vmove')!.textContent).toBe('Start')
  })

  it('game over banner appears in the Engine tab and never leaks into Analyze', async () => {
    await click(button('Engine'))
    await click(button('New game'))
    const play = async (from: [string, number], to: [string, number]) => {
      await ptr(board(), 'pointerdown', at(from[0], from[1]))
      await ptr(window, 'pointermove', at(to[0], to[1]))
      await ptr(window, 'pointermove', at(to[0], to[1]))
      await ptr(window, 'pointerup', at(to[0], to[1]))
    }
    await play(['f', 2], ['f', 3])
    await play(['e', 7], ['e', 5])
    await play(['g', 2], ['g', 4])
    await play(['d', 8], ['h', 4])
    expect($('.gover')!.textContent).toContain('Checkmate. Black wins.')
    await click(button('Analyze a game'))
    expect($('.gover')).toBeNull()
  })

  it('plays against the engine at Elo 500 and gets a legal reply', async () => {
    await click(button('Engine'))
    await click(button('New game'))
    const opp = $$('select').find((s) => s.getAttribute('aria-label') === 'Opponent') as HTMLSelectElement
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!
      set.call(opp, 'b')
      opp.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect($('.elo')).not.toBeNull()
    await click(button('500'))
    expect(($('input[aria-label="Engine Elo"]') as HTMLInputElement).value).toBe('500')
    expect($('.elo')!.textContent).toMatch(/deliberate mistakes/)
    await ptr(board(), 'pointerdown', at('e', 2))
    await ptr(window, 'pointermove', at('e', 4))
    await ptr(window, 'pointermove', at('e', 4))
    await ptr(window, 'pointerup', at('e', 4))
    await until(() => ($('.moves')!.textContent ?? '').split(/\s+/).filter((t) => t && !/\./.test(t)).length >= 2)
  })

  it('shows live top-3 hints when playing both sides, from the full-strength engine', async () => {
    await click(button('New game'))
    const opp = $$('select').find((s) => s.getAttribute('aria-label') === 'Opponent') as HTMLSelectElement
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(opp, 'none')
      opp.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await until(() => $$('.hint').length >= 3)
    expect($$('.hint')).toHaveLength(3)
    expect($('.elo')).toBeNull()
  })

  it('second opinion runs two engines over a game and reports agreement', async () => {
    await click(button('Analyze a game'))
    const sel2 = $$('select').find((s) => s.getAttribute('aria-label') === 'Second opinion engine') as HTMLSelectElement
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(sel2, 'sf18')
      sel2.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const ta = $('textarea')! as HTMLTextAreaElement
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(ta, '1. e4 e5 2. Nf3 Nc6')
      ta.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const speed = $$('select').find((s) => s.getAttribute('aria-label') === 'Analysis strength') as HTMLSelectElement
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(speed, '10')
      speed.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await click(button('Analyze'))
    await until(() => /Done in/.test($('.status')?.textContent ?? ''), 60000)
    expect($('.status')!.textContent).toMatch(/different first move in \d+ of 5 positions/)
    await click(button('▶'))
    expect(host.textContent).toContain('Stockfish 18 (lite)')
  })

  it('reports an illegal move with a helpful message', async () => {
    const ta = $('textarea')! as HTMLTextAreaElement
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(ta, '1. e4 e5 2. Ke4')
      ta.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await click(button('Analyze'))
    expect($('.status.err')!.textContent).toMatch(/not legal/)
  })
})
