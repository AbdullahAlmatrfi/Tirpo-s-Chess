// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { act } from 'react'
import App from '../src/App'
import { makeHarness } from './harness'

const h = makeHarness()
const { $, $$, button, at, ptr, board, until, render, text, select } = h

describe('first visit', () => {
  it('moving a piece on the empty start screen starts a normal game against the engine (no analysis-board warning)', async () => {
    await render(<App />)
    expect($$('.pc')).toHaveLength(32)
    expect(text()).toContain('drag a piece')
    // white to move: drag the g1 knight to f3
    await ptr(board(), 'pointerdown', at('g', 1))
    await ptr(window, 'pointermove', { clientX: at('g', 1).clientX - 10, clientY: at('g', 1).clientY - 40 })
    await ptr(window, 'pointermove', at('f', 3))
    await ptr(window, 'pointerup', at('f', 3))
    expect(button('Play the engine').getAttribute('aria-selected')).toBe('true')
    expect(text()).not.toContain('NOT the real game')
    expect(document.body.classList.contains('trying')).toBe(false)
    expect(button(/Back to the game/)).toBeUndefined()
    expect(select('Opponent').value).toBe('b')
    expect($('.moves')!.textContent).toContain('Nf3')
    // the engine answers as Black
    await until(() => ($('.moves')!.textContent ?? '').split(/\s+/).filter((t) => t && !/\./.test(t)).length >= 2)
  })
})

describe('fast drag', () => {
  it('a flick that releases before React re-renders still plays the move', async () => {
    await render(<App key="fast" />)
    expect(button('Play the engine').getAttribute('aria-selected')).toBe('false')
    await ptr(board(), 'pointerdown', at('e', 2))
    // move and release inside one batch: the practice board has not rendered yet when the finger lifts
    await act(async () => {
      window.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: at('e', 2).clientX, clientY: at('e', 2).clientY - 40 }))
      window.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, ...at('e', 4) }))
      window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, ...at('e', 4) }))
    })
    expect(button('Play the engine').getAttribute('aria-selected')).toBe('true')
    await until(() => ($('.moves')!.textContent ?? '').includes('e4'))
  })
})
