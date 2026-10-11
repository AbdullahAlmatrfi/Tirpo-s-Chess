import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js'
import { tryMove, uciParts } from './notation'
import type { Classification, EngineLine } from './types'

/**
 * Plain-English reasons for a move. Stockfish only gives numbers, so every sentence here is a fact we can verify
 * on the board (captures, hanging pieces, checks, forks, forced mate) or a statement about the engine's evaluation.
 */
export interface Explanation {
  /** one short sentence */
  headline: string
  /** the reasons, most important first */
  reasons: string[]
  /** engine lines worth showing, in SAN */
  lines: { label: string; text: string }[]
}

const VAL: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }
const NAME: Record<PieceSymbol, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }
const colorName = (c: Color) => (c === 'w' ? 'White' : 'Black')
const other = (c: Color): Color => (c === 'w' ? 'b' : 'w')

/**
 * Net material the side to move wins by playing `uci` if both sides then keep capturing on that square
 * as long as it pays (standard swap-off). 0 for a quiet move or an even trade.
 */
export function exchangeGain(fen: string, uci: string): number {
  const c = new Chess(fen)
  const mv = tryMove(c, uciParts(uci))
  if (!mv) return 0
  const to = mv.to
  const gain: number[] = [mv.captured ? VAL[mv.captured] : 0]
  let onSquare = mv.promotion ? VAL[mv.promotion] : VAL[mv.piece]
  let d = 0
  for (let guard = 0; guard < 10; guard++) {
    const caps = c.moves({ verbose: true }).filter((m) => m.to === to && m.captured)
    if (!caps.length) break
    caps.sort((a, b) => VAL[a.piece] - VAL[b.piece])
    const m = caps[0]!
    d++
    gain[d] = onSquare - gain[d - 1]!
    onSquare = m.promotion ? VAL[m.promotion] : VAL[m.piece]
    c.move({ from: m.from, to: m.to, promotion: m.promotion })
  }
  for (let k = d; k >= 1; k--) gain[k - 1] = -Math.max(-gain[k - 1]!, gain[k]!)
  return gain[0]! || 0
}

interface Threat {
  sq: Square
  piece: PieceSymbol
  gain: number
  san: string
}

/** Captures the side to move could make that win at least `min` points of material, best first. */
function winningCaptures(fen: string, min: number): Threat[] {
  const c = new Chess(fen)
  const out = new Map<string, Threat>()
  for (const m of c.moves({ verbose: true })) {
    if (!m.captured || m.captured === 'k') continue
    const g = exchangeGain(fen, m.from + m.to + (m.promotion ?? ''))
    if (g < min) continue
    const prev = out.get(m.to)
    if (!prev || g > prev.gain) out.set(m.to, { sq: m.to, piece: m.captured, gain: g, san: m.san })
  }
  return [...out.values()].sort((a, b) => b.gain - a.gain)
}

/** What the opponent could win right now if it were their turn (null when that position cannot exist). */
function threatsAgainst(fen: string, victim: Color, min: number): Threat[] | null {
  const c = new Chess(fen)
  if (c.turn() !== victim || c.inCheck()) return null
  const f = fen.split(' ')
  f[1] = other(victim)
  f[3] = '-'
  try {
    return winningCaptures(f.join(' '), min)
  } catch {
    return null
  }
}

/** Opponent pieces attacked by the piece that just moved to `sq` that make it a fork (two or more worthwhile targets). */
function forkTargets(fenAfter: string, sq: Square, moverColor: Color): { sq: Square; piece: PieceSymbol }[] {
  const c = new Chess(fenAfter)
  const me = c.get(sq)
  if (!me || me.color !== moverColor || me.type === 'k' || me.type === 'p') return []
  // the forking piece must not simply be capturable for free
  if (c.turn() === other(moverColor)) {
    for (const m of c.moves({ verbose: true })) {
      if (m.to === sq && m.captured && exchangeGain(fenAfter, m.from + m.to) > 0) return []
    }
  }
  const out: { sq: Square; piece: PieceSymbol }[] = []
  for (const row of c.board()) {
    for (const p of row) {
      if (!p || p.color === moverColor) continue
      if (!c.attackers(p.square, moverColor).includes(sq)) continue
      if (p.type === 'p') continue
      const worth = p.type === 'k' || VAL[p.type] > VAL[me.type] || c.attackers(p.square, p.color).length === 0
      if (worth) out.push({ sq: p.square, piece: p.type })
    }
  }
  return out.length >= 2 ? out : []
}

function standing(t: 'cp' | 'mate', whiteView: number): string {
  if (t === 'mate') return `a forced checkmate for ${whiteView > 0 ? 'White' : 'Black'} in ${Math.abs(whiteView)}`
  const a = Math.abs(whiteView)
  if (a < 25) return 'roughly equal'
  const level = a < 80 ? 'slightly ahead' : a < 200 ? 'ahead' : a < 400 ? 'clearly ahead' : 'winning'
  return `${whiteView > 0 ? 'White' : 'Black'} ${level} (${whiteView > 0 ? '+' : ''}${(whiteView / 100).toFixed(1)})`
}

/** True when none of these moves (from `fen`) captures anything or gives check: the difference is positional. */
function isQuiet(fen: string, uci: string[]): boolean {
  const c = new Chess(fen)
  for (const u of uci.slice(0, 4)) {
    const m = tryMove(c, uciParts(u))
    if (!m) break
    if (m.captured || m.san.includes('+') || m.san.includes('#')) return false
  }
  return true
}

/** SAN text of a UCI line starting from `fen`, with move numbers ("12. Nf3 Nc6 13. d4"). */
export function lineText(fen: string, uci: string[], max = 6): string {
  const c = new Chess(fen)
  const f = fen.split(' ')
  let n = Number(f[5]) || 1
  const out: string[] = []
  for (const u of uci.slice(0, max)) {
    const turn = c.turn()
    const m = tryMove(c, uciParts(u))
    if (!m) break
    if (turn === 'w') out.push(`${n}. ${m.san}`)
    else out.push(out.length === 0 ? `${n}... ${m.san}` : m.san)
    if (turn === 'b') n++
  }
  return out.join(' ')
}

const sanOf = (fen: string, uci: string) => tryMove(new Chess(fen), uciParts(uci))?.san ?? uci
const a_ = (name: string) => (/^[aeiou]/.test(name) ? `an ${name}` : `a ${name}`)

export interface ExplainInput {
  fenBefore: string
  played: string
  cls: Classification
  /** engine lines for the position before the move (mover's view) */
  before: EngineLine[]
  /** engine lines for the position after the move (opponent's view) */
  after: EngineLine[]
  /** 0-based index of the move in the game */
  ply: number
}

export function explainMove(inp: ExplainInput): Explanation {
  const { fenBefore, played, cls, before, after, ply } = inp
  const P = new Chess(fenBefore)
  const mover = P.turn()
  const opp = other(mover)
  const mv = tryMove(P, uciParts(played))
  if (!mv || !before.length || !after.length) return { headline: '', reasons: [], lines: [] }
  const fenAfter = P.fen()
  const reasons: string[] = []
  const lines: Explanation['lines'] = []
  const best = before[0]!
  const bestSan = sanOf(fenBefore, best.mv)
  const isTop = best.mv === played
  const sgn = mover === 'w' ? 1 : -1
  const pl = before.find((l) => l.mv === played)
  const playedLine: EngineLine = pl ?? { mv: played, t: after[0]!.t, v: -after[0]!.v }
  const swing = (l: EngineLine) => standing(l.t, sgn * l.v)
  const bad = cls.cls === 'Inaccuracy' || cls.cls === 'Mistake' || cls.cls === 'Blunder'
  const pieceName = NAME[mv.piece]

  // ---- facts about the move itself
  const mateGiven = P.isCheckmate()
  const gain = mv.captured ? exchangeGain(fenBefore, played) : 0
  const threatsBefore = threatsAgainst(fenBefore, mover, 2) ?? []
  const threatsNow = P.isGameOver() ? [] : winningCaptures(fenAfter, 2)
  const stillThreatened = threatsNow.filter((t) => P.get(t.sq)?.color === mover)
  const savedPieces = threatsBefore.filter((t) => {
    const now = t.sq === mv.from ? mv.to : t.sq // a threatened piece that moved is now on its new square
    return !stillThreatened.some((s) => s.sq === now)
  })
  const forks = mateGiven ? [] : forkTargets(fenAfter, mv.to, mover)
  // a recapture on the square we just captured on only counts for what it wins beyond the piece we took
  const realThreats = stillThreatened
    .map((t) => (t.sq === mv.to && mv.captured ? { ...t, gain: t.gain - VAL[mv.captured] } : t))
    .filter((t) => t.gain >= 1)
  const evenTrade = !!mv.captured && stillThreatened.some((t) => t.sq === mv.to) && realThreats.length === 0

  // ---- bad moves: what goes wrong
  if (bad) {
    if (cls.lost) reasons.push(`The position was already lost: ${colorName(opp)} had a forced checkmate, so no move could save it.`)
    else reasons.push(`Before this move the evaluation was ${standing(best.t, sgn * best.v)}; after it, ${swing(playedLine)}.`)
    const reply = after[0]!
    if (reply.t === 'mate' && reply.v > 0) {
      reasons.push(`It lets ${colorName(opp)} force checkmate in ${reply.v}${reply.v === 1 ? '' : ' (the best defence still loses)'}.`)
    } else if (realThreats.length) {
      const t = realThreats[0]!
      const here = P.get(t.sq)
      const wasUnderAttack = threatsBefore.some((b) => b.sq === t.sq)
      const loose = t.sq === mv.to ? `The ${pieceName} you just moved to ${mv.to}` : `Your ${NAME[here?.type ?? t.piece]} on ${t.sq}`
      reasons.push(
        `${loose} can be taken by ${colorName(opp)} with ${t.san}, winning about ${t.gain} point${t.gain === 1 ? '' : 's'} of material.` +
          (wasUnderAttack && t.sq !== mv.to ? ' It was already under attack and this move did not deal with it.' : ''),
      )
    } else if (mv.captured && evenTrade) {
      reasons.push(`An even swap of ${a_(pieceName)} for ${a_(NAME[mv.captured])}, but the position that results is better for ${colorName(opp)}.`)
    } else if (mv.captured && gain < VAL[mv.captured]) {
      reasons.push(`Taking the ${NAME[mv.captured]} looks tempting, but ${colorName(opp)} wins material back in the exchange on ${mv.to}.`)
    }
    if (!isTop) {
      const bm = tryMove(new Chess(fenBefore), uciParts(best.mv))
      if (bm) {
        const after2 = new Chess(fenBefore)
        after2.move({ from: bm.from, to: bm.to, promotion: bm.promotion })
        const bg = bm.captured ? exchangeGain(fenBefore, best.mv) : 0
        const bestForks = after2.isCheckmate() ? [] : forkTargets(after2.fen(), bm.to, mover)
        const stillBefore = threatsBefore.find((t) => bm.from === t.sq)
        if (after2.isCheckmate()) reasons.push(`${bestSan} was checkmate.`)
        else if (best.t === 'mate' && best.v > 0) reasons.push(`${bestSan} started a forced checkmate in ${best.v}.`)
        else if (bg >= 1) reasons.push(`${bestSan} would have won ${a_(NAME[bm.captured!])}${bg >= VAL[bm.captured!] ? '' : ' in the exchange'}.`)
        else if (bestForks.length) reasons.push(`${bestSan} would have attacked ${listTargets(bestForks)} at the same time.`)
        else if (stillBefore) reasons.push(`${bestSan} moves your ${NAME[stillBefore.piece]} out of danger; it was under attack.`)
        else if (best.t === 'cp' && after2.inCheck()) reasons.push(`${bestSan} gives check and keeps the initiative.`)
        else if (!isQuiet(fenBefore, best.pv ?? [best.mv]) || !isQuiet(fenAfter, after[0]!.pv ?? [after[0]!.mv])) {
          reasons.push(`${bestSan} was stronger: with it the evaluation stays at ${swing(best)}.`)
        } else {
          reasons.push(
            `No piece is won or lost in the next few moves, so the difference is positional: ${bestSan} puts your pieces on better squares or keeps your king and pawns safer.`,
          )
        }
      }
      lines.push({ label: 'Better was', text: best.pv ? lineText(fenBefore, best.pv) : bestSan })
    }
    const rl = after[0]!
    if (rl.pv?.length) lines.push({ label: `Then ${colorName(opp)} plays`, text: lineText(fenAfter, rl.pv) })
    else if (rl.mv) lines.push({ label: `Then ${colorName(opp)} plays`, text: sanOf(fenAfter, rl.mv) })
  } else {
    // ---- good moves: what they achieve
    if (mateGiven) reasons.push('This is checkmate.')
    if (best.t === 'mate' && best.v > 0 && !mateGiven) {
      if (isTop) reasons.push(`It keeps a forced checkmate in ${best.v} available.`)
      else if (playedLine.t === 'mate' && playedLine.v > best.v) {
        reasons.push(`It still wins by force, but ${bestSan} was a faster checkmate (in ${best.v} instead of ${playedLine.v}).`)
      } else if (playedLine.t === 'mate' && playedLine.v > 0) {
        reasons.push(`It also keeps a forced checkmate in ${playedLine.v}.`)
      } else reasons.push(`It keeps the win, but ${bestSan} was checkmate in ${best.v}.`)
    }
    if (mv.captured && gain > 0) reasons.push(`Wins ${a_(NAME[mv.captured])}${gain < VAL[mv.captured] ? ' (the exchange afterwards costs a little back)' : ''}.`)
    else if (mv.captured && gain === 0) reasons.push(`An even trade: ${a_(pieceName)} for ${a_(NAME[mv.captured])}.`)
    if (savedPieces.length) {
      const t = savedPieces[0]!
      reasons.push(`Handles a threat: ${colorName(opp)} was threatening ${t.san}, which would have won your ${NAME[t.piece]} on ${t.sq}.`)
    }
    if (forks.length) reasons.push(`A fork: it attacks ${listTargets(forks)} at the same time.`)
    else if (P.inCheck() && !mateGiven) reasons.push(`Gives check, forcing ${colorName(opp)} to respond.`)
    if (cls.cls === 'Brilliant') {
      const give = Math.max(1, Math.round(seeGiveUp(fenBefore, played)))
      reasons.unshift(
        `A real sacrifice: you put ${a_(pieceName)} where it can be taken, giving up about ${give} point${give === 1 ? '' : 's'} of material.`,
        `Even after giving up the material the engine says ${swing(playedLine)}. Most players would reject this move because it looks like a blunder.`,
      )
    }
    if (cls.cls === 'Great') {
      const second = before[1]
      if (second) reasons.unshift(`It is the only move that holds things together: the next best option would have left ${swing({ ...second })}.`)
    }
    if (reasons.length === 0 || (ply < 24 && cls.cls !== 'Brilliant' && cls.cls !== 'Great')) {
      const p = principle(mv, ply)
      if (p) reasons.push(p)
    }
    if (cls.cls === 'Forced') {
      reasons.length = 0
      reasons.push(P.isCheckmate() ? 'This is checkmate.' : 'It was the only legal move.')
    }
    if (!isTop && (cls.cls === 'Excellent' || cls.cls === 'Best')) {
      reasons.push(`The engine's top pick was ${bestSan}, which is almost identical in value.`)
    }
    if (reasons.length === 0) {
      reasons.push(
        cls.cls === 'Book'
          ? `A common, sound opening move. The engine rates the position ${swing(playedLine)}.`
          : `Nothing tactical is going on here. The engine simply rates the position ${swing(playedLine)} after it.`,
      )
    }
    if (cls.cls === 'Brilliant' || cls.cls === 'Great' || cls.cls === 'Best') {
      if (best.pv && best.pv.length > 1) lines.push({ label: 'Engine line', text: lineText(fenBefore, best.pv) })
    }
  }

  return { headline: headline(cls, bestSan, isTop), reasons: dedupe(reasons), lines }
}

function seeGiveUp(fen: string, uci: string): number {
  // material the mover can lose on the destination square (a sacrifice), ignoring what the move captures
  const c = new Chess(fen)
  const mv = tryMove(c, uciParts(uci))
  if (!mv) return 0
  const g = winningCaptures(c.fen(), 1).find((t) => t.sq === mv.to)
  return g ? g.gain : VAL[mv.piece]
}

function listTargets(t: { sq: Square; piece: PieceSymbol }[]): string {
  const parts = t.slice(0, 3).map((x) => `the ${NAME[x.piece]} on ${x.sq}`)
  return parts.length === 2 ? `${parts[0]} and ${parts[1]}` : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

function principle(mv: { piece: PieceSymbol; from: string; to: string; flags: string; color: Color }, ply: number): string | null {
  if (ply > 24) return null
  if (mv.flags.includes('k') || mv.flags.includes('q')) return 'Castling tucks the king into safety and brings a rook toward the centre.'
  const backRank = mv.color === 'w' ? '1' : '8'
  if ((mv.piece === 'n' || mv.piece === 'b') && mv.from[1] === backRank) {
    return `Develops the ${NAME[mv.piece]}: getting pieces off the back rank early lets them join the game.`
  }
  if (mv.piece === 'p' && ['e4', 'd4', 'e5', 'd5', 'c4', 'c5'].includes(mv.to)) return 'Takes space in the centre, which gives your pieces room to move.'
  if (mv.piece === 'q' && ply < 10) return 'An early queen move can work, but the queen is easy to chase with minor pieces, so be careful.'
  return null
}

function headline(c: Classification, bestSan: string, isTop: boolean): string {
  switch (c.cls) {
    case 'Brilliant': return 'Brilliant: a sacrifice that works.'
    case 'Great': return 'Great: the move that keeps your position on track.'
    case 'Best': return isTop ? 'The best move.' : 'As good as the best move.'
    case 'Excellent': return 'Excellent: almost as good as the best move.'
    case 'Good': return `Good, but ${bestSan} was a little better.`
    case 'Book': return 'A normal opening move.'
    case 'Forced': return 'Forced.'
    case 'Inaccuracy': return `An inaccuracy: ${bestSan} was better.`
    case 'Mistake': return `A mistake: ${bestSan} was much better.`
    case 'Blunder': return c.lost ? 'A blunder in a lost position.' : `A blunder: it throws away most of the advantage (${bestSan} was needed).`
  }
}

function dedupe(a: string[]): string[] {
  return [...new Set(a)].slice(0, 5)
}
