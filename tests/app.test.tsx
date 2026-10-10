// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { act } from 'react'
import App from '../src/App'
import { makeHarness } from './harness'

const h = makeHarness()
const { $, $$, button, click, at, ptr, board, until, render, text, setValue, select } = h

describe('Tirpo\'s Chess app', () => {
  it('renders the start position with 32 pieces and the fair-play note', async () => {
    await render(<App />)
    expect($$('.pc')).toHaveLength(32)
    expect(text()).toMatch(/that is cheating/)
  })

  it('loads the sample game and shows grades, accuracy and the move list', async () => {
    await click(button('Load sample game'))
    expect($$('.mv')).toHaveLength(74)
    expect($$('.who')).toHaveLength(2)
    expect(text()).toContain('Tirpo464')
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
    expect(text()).toContain('NOT the real game')
    expect(document.body.classList.contains('trying')).toBe(true)
    expect($('.moves')!.textContent).toContain('Nf3')
    await click(button(/Back to the game/))
    expect(document.body.classList.contains('trying')).toBe(false)
    expect(text()).not.toContain('NOT the real game')
    expect($('.vmove')!.textContent).toBe('Start')
  })

  it('game over banner appears in the Engine tab and never leaks into Analyze', async () => {
    await click(button('Play the engine'))
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
    await click(button('Play the engine'))
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

  it('shows one arrow at a time; tapping or hovering a hint moves it; All 3 and None work and are remembered', async () => {
    const lines = () => [...$$('svg.arrows')[0]!.querySelectorAll('line')].map((l) => ['x1', 'y1', 'x2', 'y2'].map((k) => l.getAttribute(k)).join(','))
    expect(lines()).toHaveLength(1)
    expect($$('.hint')[0]!.className).toContain('sel')
    const first = lines()[0]
    await click($$('.hint')[1]!)
    expect($$('.hint')[1]!.className).toContain('sel')
    expect($$('.hint')[0]!.className).not.toContain('sel')
    expect(lines()).toHaveLength(1)
    expect(lines()[0]).not.toBe(first)
    // hovering previews another move, leaving goes back to the tapped one
    const second = lines()[0]
    await act(async () => { $$('.hint')[2]!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })) })
    expect(lines()[0]).not.toBe(second)
    await act(async () => { $$('.hint')[2]!.dispatchEvent(new MouseEvent('mouseout', { bubbles: true })) })
    expect(lines()[0]).toBe(second)
    await setValue(select('Arrows'), 'all')
    expect(lines().length).toBeGreaterThanOrEqual(3)
    await setValue(select('Arrows'), 'off')
    expect(lines()).toHaveLength(0)
    expect(localStorage.getItem('tc_arrows')).toBe('off')
    await setValue(select('Arrows'), 'one')
    expect(lines()).toHaveLength(1)
  })

  it('has one engine dropdown only, and the status says which engine analysed the game', async () => {
    await click(button('Analyze a game'))
    expect($$('select').filter((s) => s.getAttribute('aria-label') === 'Engine')).toHaveLength(1)
    expect(text()).not.toContain('Second opinion')
    await setValue(select('Engine'), 'sf18')
    await setValue($('textarea') as HTMLTextAreaElement, '1. e4 e5 2. Nf3 Nc6')
    await setValue(select('Analysis strength'), '10')
    await click(button('Analyze'))
    await until(() => /Done in/.test($('.status')?.textContent ?? ''), 60000)
    expect($('.status')!.textContent).toContain('Stockfish 18 (lite)')
    await setValue(select('Engine'), 'sf19')
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

  it('the Elo box can be edited freely and is clamped only when you finish', async () => {
    await click(button('Play the engine'))
    await click(button('New game'))
    const opp = $$('select').find((x) => x.getAttribute('aria-label') === 'Opponent') as HTMLSelectElement
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(opp, 'b')
      opp.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const box = () => $('input[aria-label="Engine Elo"]') as HTMLInputElement
    const type = (v: string) => act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(box(), v)
      box().dispatchEvent(new Event('input', { bubbles: true }))
    })
    await type('1')
    await type('15')
    expect(box().value).toBe('15') // not snapped while typing
    await type('1500')
    await act(async () => { box().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
    expect(($('#elo') as HTMLInputElement).value).toBe('1500')
    await type('50')
    await act(async () => { box().dispatchEvent(new FocusEvent('focusout', { bubbles: true })) })
    expect(box().value).toBe('400') // clamped on blur
  })

  it('releasing a drag outside the board cancels the move', async () => {
    await click(button('New game'))
    const opp = $$('select').find((x) => x.getAttribute('aria-label') === 'Opponent') as HTMLSelectElement
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(opp, 'none')
      opp.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await ptr(board(), 'pointerdown', at('e', 2))
    await ptr(window, 'pointermove', at('e', 3))
    await ptr(window, 'pointermove', { clientX: 1200, clientY: at('e', 4).clientY })
    await ptr(window, 'pointerup', { clientX: 1200, clientY: at('e', 4).clientY })
    expect($('.moves')!.textContent).toContain('No moves yet')
    expect($$('.pc.drag')).toHaveLength(0)
  })

  it('pressing Analyze while in try mode leaves try mode', async () => {
    await click(button('Analyze a game'))
    await click(button('Load sample game'))
    await ptr(board(), 'pointerdown', at('g', 1))
    await ptr(window, 'pointermove', at('f', 3))
    await ptr(window, 'pointermove', at('f', 3))
    await ptr(window, 'pointerup', at('f', 3))
    expect(document.body.classList.contains('trying')).toBe(true)
    await click(button('Analyze a game'))
    await click(button('Analyze'))
    expect(button(/Back to the game/)).toBeUndefined()
    expect(document.body.classList.contains('trying')).toBe(false)
  })

  it('Stop clears the progress bar and says Stopped; Try moves is disabled while running', async () => {
    await click(button('Analyze a game'))
    await click(button('Load sample game'))
    await click(button('Analyze'))
    expect((button('Try moves from here') as HTMLButtonElement).disabled).toBe(true)
    await click(button('Stop'))
    expect($('.status')!.textContent).toBe('Stopped.')
    expect($('.prog')).toBeNull()
    expect((button('Try moves from here') as HTMLButtonElement).disabled).toBe(false)
  })

  it('the Elo box shows the value that was actually applied', async () => {
    await click(button('Play the engine'))
    await click(button('New game'))
    const opp = $$('select').find((x) => x.getAttribute('aria-label') === 'Opponent') as HTMLSelectElement
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(opp, 'b')
      opp.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await click(button('Max'))
    const box = () => $('input[aria-label="Engine Elo"]') as HTMLInputElement
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(box(), '9999')
      box().dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => { box().dispatchEvent(new FocusEvent('focusout', { bubbles: true })) })
    expect(box().value).toBe('3200')
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(box(), '')
      box().dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => { box().dispatchEvent(new FocusEvent('focusout', { bubbles: true })) })
    expect(box().value).toBe('3200')
  })

  it('a promotion shows one target dot, and a second finger cannot hijack a drag', async () => {
    await click(button('New game'))
    const opp = $$('select').find((x) => x.getAttribute('aria-label') === 'Opponent') as HTMLSelectElement
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(opp, 'none')
      opp.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const ta = $$('textarea').find((x) => /FEN/.test(x.getAttribute('placeholder') ?? '')) as HTMLTextAreaElement
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(ta, '4k3/P7/8/8/8/8/8/4K3 w - - 0 1')
      ta.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await click(button('Load'))
    await ptr(board(), 'pointerdown', at('a', 7))
    await ptr(window, 'pointermove', at('a', 7).clientX === 0 ? at('a', 8) : { clientX: at('a', 7).clientX + 30, clientY: at('a', 7).clientY - 30 })
    expect($$('.cell.legal')).toHaveLength(1)
    // a second pointer going down on another piece is ignored while the first drag is in progress
    await ptr(board(), 'pointerdown', at('e', 1))
    await ptr(window, 'pointerup', at('a', 8))
    expect($('.moves')!.textContent).toMatch(/a8=Q/)
  })
})
