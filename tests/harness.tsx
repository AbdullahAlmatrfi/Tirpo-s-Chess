// Shared jsdom harness for app-flow tests: every engine "worker" is a real Stockfish process.
import { beforeAll, afterAll } from 'vitest'
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { nodeWorker } from './nodeWorker'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

export const SQ = 100 // the mocked board is 800px wide

export function makeHarness() {
  let root: Root
  let host: HTMLElement
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

  const $ = (sel: string) => host.querySelector<HTMLElement>(sel)
  const $$ = (sel: string) => [...host.querySelectorAll<HTMLElement>(sel)]
  const button = (text: RegExp | string) =>
    $$('button').find((b) => (typeof text === 'string' ? b.textContent === text : text.test(b.textContent ?? '')))!
  const click = (el: Element) => act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
  const at = (file: string, rank: number, flipped = false) => {
    const f = 'abcdefgh'.indexOf(file)
    const x = flipped ? 7 - f : f
    const y = flipped ? rank - 1 : 8 - rank
    return { clientX: x * SQ + SQ / 2, clientY: y * SQ + SQ / 2 }
  }
  const ptr = (target: EventTarget, type: string, pos: { clientX: number; clientY: number }, button = 0) =>
    act(async () => { target.dispatchEvent(new MouseEvent(type, { bubbles: true, button, ...pos })) })
  const board = () => $('.board')!
  const render = (node: ReactNode) => act(async () => root.render(node))
  const text = () => host.textContent ?? ''
  /** Set a <select>/<textarea> value the way React expects, then fire its event. */
  const setValue = (el: HTMLSelectElement | HTMLTextAreaElement | HTMLInputElement, value: string) =>
    act(async () => {
      const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value)
      el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
    })
  const select = (label: string) => $$('select').find((s) => s.getAttribute('aria-label') === label) as HTMLSelectElement

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

  return { $, $$, button, click, at, ptr, board, until, sleep, render, text, setValue, select }
}
