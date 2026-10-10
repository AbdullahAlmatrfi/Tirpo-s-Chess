import type { Color, Move, PieceSymbol, Square } from './types'
import { FILES } from './notation'

export interface PieceView {
  id: number
  type: PieceSymbol
  color: Color
  sq: Square
  /** 'in' = fading in (restored by stepping back), 'out' = fading out (captured) */
  fx?: 'in' | 'out'
}

export type IdGen = () => number

export function piecesFromFen(fen: string, nid: IdGen): PieceView[] {
  const out: PieceView[] = []
  fen.split(' ')[0]!.split('/').forEach((row, r) => {
    let f = 0
    for (const ch of row) {
      if (/\d/.test(ch)) {
        f += +ch
        continue
      }
      out.push({
        id: nid(),
        type: ch.toLowerCase() as PieceSymbol,
        color: ch === ch.toUpperCase() ? 'w' : 'b',
        sq: `${FILES[f]}${8 - r}` as Square,
      })
      f++
    }
  })
  return out
}

/** Piece placement part of a FEN built from the visible pieces, for equality checks. */
export function placementOf(ps: PieceView[]): string {
  const board: string[][] = Array.from({ length: 8 }, () => Array<string>(8).fill(''))
  for (const p of ps) {
    if (p.fx === 'out') continue
    const f = FILES.indexOf(p.sq[0]!)
    const r = 8 - Number(p.sq[1])
    board[r]![f] = p.color === 'w' ? p.type.toUpperCase() : p.type
  }
  return board
    .map((row) => {
      let s = ''
      let n = 0
      for (const c of row) {
        if (!c) n++
        else {
          if (n) s += n
          n = 0
          s += c
        }
      }
      return s + (n || '')
    })
    .join('/')
}

const live = (ps: PieceView[], sq: string) => ps.find((p) => p.sq === sq && p.fx !== 'out')
const rank = (sq: string) => sq[1]!

/** Update pieces for a move so each piece keeps its identity (and so animates). */
export function applyForward(ps: PieceView[], m: Move): PieceView[] {
  const next = ps.map((p) => ({ ...p }))
  const capSq = m.flags.includes('e') ? m.to[0]! + rank(m.from) : m.to
  const cap = live(next, capSq)
  const mover = live(next, m.from)
  if (cap && cap !== mover) cap.fx = 'out'
  if (mover) {
    mover.sq = m.to
    if (m.promotion) mover.type = m.promotion
  }
  if (m.flags.includes('k')) {
    const r = live(next, `h${rank(m.from)}`)
    if (r) r.sq = `f${rank(m.from)}` as Square
  }
  if (m.flags.includes('q')) {
    const r = live(next, `a${rank(m.from)}`)
    if (r) r.sq = `d${rank(m.from)}` as Square
  }
  return next
}

export function applyBack(ps: PieceView[], m: Move, nid: IdGen): PieceView[] {
  const next = ps.filter((p) => p.fx !== 'out').map((p) => ({ ...p }))
  const mover = live(next, m.to)
  if (mover) {
    if (m.promotion) mover.type = 'p'
    mover.sq = m.from
  }
  if (m.flags.includes('k')) {
    const r = live(next, `f${rank(m.from)}`)
    if (r) r.sq = `h${rank(m.from)}` as Square
  }
  if (m.flags.includes('q')) {
    const r = live(next, `d${rank(m.from)}`)
    if (r) r.sq = `a${rank(m.from)}` as Square
  }
  if (m.captured) {
    const csq = (m.flags.includes('e') ? m.to[0]! + rank(m.from) : m.to) as Square
    next.push({ id: nid(), type: m.captured, color: m.color === 'w' ? 'b' : 'w', sq: csq, fx: 'in' })
  }
  return next
}
