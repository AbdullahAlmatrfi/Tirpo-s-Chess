import { Chess, type Move } from 'chess.js'
import type { GameData } from './types'

export const FILES = 'abcdefgh'
const PN: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }
const PV: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 }

/** Play a move, returning null instead of throwing when it is illegal. */
export function tryMove(
  chess: Chess,
  m: string | { from: string; to: string; promotion?: string },
  strict = false,
): Move | null {
  try {
    return chess.move(m, { strict })
  } catch {
    return null
  }
}

export const uciParts = (uci: string) => ({
  from: uci.slice(0, 2),
  to: uci.slice(2, 4),
  promotion: uci[4] || undefined,
})

/** "Knight to f3, check" style description of a UCI move. */
export function words(fen: string, uci: string): { text: string; san: string } {
  const m = tryMove(new Chess(fen), uciParts(uci))
  if (!m) return { text: uci, san: uci }
  let s: string
  if (m.flags.includes('k')) s = 'Castle kingside'
  else if (m.flags.includes('q')) s = 'Castle queenside'
  else {
    const name = PN[m.piece] ?? m.piece
    s = name[0]!.toUpperCase() + name.slice(1) + (m.captured ? ` takes ${PN[m.captured]} on ${m.to}` : ` to ${m.to}`)
    if (m.promotion) s += ` and becomes a ${PN[m.promotion]}`
  }
  if (m.san.includes('#')) s += ', checkmate'
  else if (m.san.includes('+')) s += ', check'
  return { text: s, san: m.san }
}

const wordsCache = new Map<string, { text: string; san: string }>()
export function wordsCached(fen: string, uci: string) {
  const k = `${fen}|${uci}`
  let v = wordsCache.get(k)
  if (!v) {
    v = words(fen, uci)
    wordsCache.set(k, v)
  }
  return v
}

/**
 * Material the mover risks on the destination square after the exchange
 * sequence (a simple static exchange evaluation). 0 means no sacrifice.
 */
export function seeLoss(fen: string, uci: string): number {
  const c = new Chess(fen)
  const mv = tryMove(c, uciParts(uci))
  if (!mv || mv.piece === 'k') return 0
  const to = mv.to
  const gains: number[] = []
  let cur = PV[mv.piece] ?? 0
  const g = new Chess(c.fen())
  for (let d = 0; d < 8; d++) {
    const caps = g.moves({ verbose: true }).filter((m) => m.to === to && m.captured)
    if (!caps.length) break
    caps.sort((a, b) => (PV[a.piece] ?? 0) - (PV[b.piece] ?? 0))
    const m = caps[0]!
    gains.push(cur)
    cur = PV[m.piece] ?? 0
    g.move({ from: m.from, to: m.to, promotion: m.promotion })
  }
  if (!gains.length) return 0
  let v = 0
  for (let k = gains.length - 1; k >= 0; k--) v = Math.max(0, gains[k]! - v)
  return v
}

/** Strip headers, comments, variations, NAGs and move numbers; return SAN tokens. */
export function cleanTokens(text: string): string[] {
  let t = text.replace(/\[[^\]]*\]/g, ' ').replace(/\{[^}]*\}/g, ' ').replace(/;[^\n]*/g, ' ')
  while (/\([^()]*\)/.test(t)) t = t.replace(/\([^()]*\)/g, ' ')
  t = t
    .replace(/[♔♚]/g, 'K').replace(/[♕♛]/g, 'Q').replace(/[♖♜]/g, 'R').replace(/[♗♝]/g, 'B').replace(/[♘♞]/g, 'N')
    .replace(/\$\d+/g, ' ').replace(/0-0-0/g, 'O-O-O').replace(/0-0/g, 'O-O').replace(/[!?]+/g, '')
    .replace(/\d+\s*\.{1,3}/g, ' ').replace(/(1-0|0-1|1\/2-1\/2|\*)/g, ' ')
  return t.split(/\s+/).filter(Boolean)
}

export function headerName(text: string, tag: string): string | null {
  const m = text.match(new RegExp(`\\[${tag}\\s+"([^"]*)"\\]`))
  return m?.[1] && m[1] !== '?' ? m[1] : null
}

export function illegalMessage(chess: Chess, tokens: string[], i: number, legalShown = 14): string {
  const no = Math.floor(i / 2) + 1
  const dots = i % 2 === 0 ? '.' : '...'
  const all = chess.moves()
  return (
    `Move ${no}${dots} "${tokens[i]}" is not legal here. Legal moves at that point: ` +
    all.slice(0, legalShown).join(', ') + (all.length > legalShown ? ', ...' : '') +
    '. Check that move in your list.'
  )
}

export type BuildResult = { ok: true; game: GameData } | { ok: false; error: string }

export function buildGame(text: string): BuildResult {
  const names = { w: headerName(text, 'White') ?? 'White', b: headerName(text, 'Black') ?? 'Black' }
  const toks = cleanTokens(text)
  if (toks.length < 1) return { ok: false, error: 'No moves found. Paste a move list like "1. e4 e5 2. Nf3".' }
  const c = new Chess()
  const fens = [c.fen()]
  const moves: Move[] = []
  const ucis: string[] = []
  for (let i = 0; i < toks.length; i++) {
    const m = tryMove(c, toks[i]!)
    if (!m) return { ok: false, error: illegalMessage(c, toks, i) }
    moves.push(m)
    ucis.push(m.from + m.to + (m.promotion ?? ''))
    fens.push(c.fen())
  }
  return { ok: true, game: { names, fens, moves, ucis } }
}

export const emptyGame = (): GameData => ({
  names: { w: 'White', b: 'Black' },
  fens: [new Chess().fen()],
  moves: [],
  ucis: [],
})

export interface Setup {
  start: string | null
  hist: Move[]
}

/** Parse a FEN or a move list into a starting position and move history. */
export function parseSetup(txt: string): { ok: true; setup: Setup } | { ok: false; error: string } {
  const t = txt.trim()
  const g = new Chess()
  if (/\//.test(t) && !/^\s*(\[|1\.)/.test(t) && t.split(/\s+/)[0]!.split('/').length === 8) {
    const p = t.split(/\s+/)
    const fen = [p[0], p[1] || 'w', p[2] || '-', p[3] || '-', p[4] || '0', p[5] || '1'].join(' ')
    try {
      g.load(fen)
    } catch {
      return { ok: false, error: 'That position is not valid.' }
    }
    return { ok: true, setup: { start: fen, hist: [] } }
  }
  const toks = cleanTokens(t)
  const hist: Move[] = []
  for (let i = 0; i < toks.length; i++) {
    const m = tryMove(g, toks[i]!)
    if (!m) {
      return {
        ok: false,
        error: `Move ${Math.floor(i / 2) + 1}${i % 2 ? '...' : '.'} "${toks[i]}" is not legal. Legal here: ${g.moves().slice(0, 10).join(', ')}`,
      }
    }
    hist.push(m)
  }
  return { ok: true, setup: { start: null, hist } }
}

export const moveListText = (hist: Move[]): string =>
  hist.map((m, i) => (i % 2 === 0 ? `${Math.floor(i / 2) + 1}. ` : '') + m.san).join(' ')
