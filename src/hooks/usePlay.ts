import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import { cancelAllEngines, getEngine } from '../core/engines'
import { gameStatus } from '../core/status'
import { computeHints } from '../core/hints'
import { parseSetup, tryMove, uciParts } from '../core/notation'
import { clampElo, pickWeakMove, planOpponent } from '../core/strength'
import type { EngineLine, Move, Square } from '../core/types'
import type { BoardApi } from './useAnalysis'

export type Opp = 'none' | 'w' | 'b'

const STANDARD = new Chess().fen()

/** Replay moves from a start position. Pass `start = null` for the standard start. */
export function replay(start: string | null, hist: Move[]): Chess {
  const g = start ? new Chess(start) : new Chess()
  for (const m of hist) g.move({ from: m.from, to: m.to, promotion: m.promotion })
  return g
}

export function usePlay(board: BoardApi, active: boolean, engineKey: string, setFlipped: (f: boolean) => void) {
  const [start, setStart] = useState<string | null>(null)
  const [hist, setHist] = useState<Move[]>([])
  const [redoStack, setRedoStack] = useState<Move[]>([])
  const [sel, setSel] = useState<Square | null>(null)
  const [last0, setLast0] = useState<[string, string] | null>(null)
  const [opp, setOppState] = useState<Opp>('none')
  const [elo, setEloState] = useState(1200)
  const [hintsOn, setHintsOn] = useState(true)
  const [lines, setLines] = useState<Record<string, EngineLine>>({})
  const [depth, setDepth] = useState(0)
  const [engMsg, setEngMsg] = useState<string | null>(null)

  const game = useMemo(() => replay(start, hist), [start, hist])
  const fen = game.fen()
  const status = useMemo(() => gameStatus(game, opp !== 'none' && opp === game.turn()), [game, opp])
  const hints = useMemo(() => (hintsOn ? computeHints(fen, lines) : null), [hintsOn, fen, lines])

  const S = useRef({ start, hist, redoStack, game, opp })
  S.current = { start, hist, redoStack, game, opp }

  const myTurn = !status.over && opp !== game.turn()

  const commit = useCallback(
    (m: Move, clearRedo: boolean) => {
      setHist((h) => [...h, m])
      if (clearRedo) setRedoStack([])
      setSel(null)
      board.forward(m)
    },
    [board],
  )

  const playMove = useCallback(
    (from: string, to: string, promo?: string): boolean => {
      const g = replay(S.current.start, S.current.hist)
      const m = tryMove(g, { from, to, promotion: promo ?? 'q' }, true)
      if (!m) return false
      commit(m, true)
      return true
    },
    [commit],
  )
  const playRef = useRef(playMove)
  playRef.current = playMove

  const click = useCallback(
    (sq: Square) => {
      if (!myTurn) return
      const g = S.current.game
      if (sel && sel !== sq && g.moves({ square: sel, verbose: true }).some((m) => m.to === sq)) {
        playMove(sel, sq)
        return
      }
      const p = g.get(sq)
      setSel(p && p.color === g.turn() && sel !== sq ? sq : null)
    },
    [myTurn, sel, playMove],
  )

  const grab = useCallback((sq: Square) => setSel(sq), [])
  const drop = useCallback(
    (from: Square, to: Square) => {
      const legal = S.current.game.moves({ square: from, verbose: true }).some((m) => m.to === to)
      if (legal) playMove(from, to)
    },
    [playMove],
  )

  const undo = useCallback(() => {
    const h = [...S.current.hist]
    const r = [...S.current.redoStack]
    const popOne = () => {
      const m = h.pop()
      if (!m) return
      r.push(m)
      board.back(m)
    }
    popOne()
    if (S.current.opp !== 'none' && h.length && replay(S.current.start, h).turn() === S.current.opp) popOne()
    setHist(h)
    setRedoStack(r)
    setSel(null)
  }, [board])

  const redo = useCallback(() => {
    const r = [...S.current.redoStack]
    const m = r.pop()
    if (!m) return
    const g = replay(S.current.start, S.current.hist)
    const mm = tryMove(g, { from: m.from, to: m.to, promotion: m.promotion }, true)
    if (!mm) return
    setRedoStack(r)
    commit(mm, false)
  }, [commit])

  const reset = useCallback(
    (fenStart: string | null, last: [string, string] | null = null) => {
      const s = fenStart && fenStart !== STANDARD ? fenStart : null
      setStart(s)
      setHist([])
      setRedoStack([])
      setSel(null)
      setLast0(last)
      board.setFen(fenStart ?? STANDARD)
    },
    [board],
  )

  const newGame = useCallback(() => reset(null), [reset])

  /** Start playing from an analysed position (try mode). */
  const enterFrom = useCallback(
    (fenStart: string, last: [string, string] | null, selected: Square | null) => {
      setOppState('none')
      reset(fenStart, last)
      setSel(selected)
    },
    [reset],
  )

  const loadSetup = useCallback(
    (text: string): string => {
      if (!text.trim()) return 'Paste something first.'
      const r = parseSetup(text)
      if (!r.ok) return r.error
      const g = replay(r.setup.start, r.setup.hist)
      setStart(r.setup.start)
      setHist(r.setup.hist)
      setRedoStack([])
      setSel(null)
      const lm = r.setup.hist[r.setup.hist.length - 1]
      setLast0(lm ? [lm.from, lm.to] : null)
      board.setFen(g.fen())
      return 'Loaded.'
    },
    [board],
  )

  const setElo = useCallback((v: number) => setEloState(clampElo(v)), [])

  const setOpp = useCallback(
    (v: Opp) => {
      setOppState(v)
      if (v === 'w') setFlipped(true)
      if (v === 'b') setFlipped(false)
    },
    [setFlipped],
  )

  // engine: live hints for the human side, or a reply when it is the engine's turn
  const flush = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!active) return
    let alive = true
    setLines({})
    setDepth(0)
    setEngMsg(null)
    if (status.over) {
      cancelAllEngines()
      return
    }
    const eng = getEngine(engineKey)
    eng.ready.catch((e: Error) => alive && setEngMsg(`${e.message} You can still play on the board.`))
    const turn = game.turn()
    if (opp !== 'none' && opp === turn) {
      const plan = planOpponent(elo)
      eng
        .search({ fen, multipv: plan.multipv, elo: plan.engineElo, go: plan.go })
        .then((r) => {
          if (!alive || r.aborted || !r.best || r.best === '(none)') return
          const chosen = plan.handicap ? (pickWeakMove(fen, r.lines, elo) ?? r.best) : r.best
          const u = uciParts(chosen)
          playRef.current(u.from, u.to, u.promotion)
        })
    } else if (hintsOn) {
      eng.search({
        fen,
        multipv: 5,
        go: 'depth 22',
        onInfo: (ls, d) => {
          if (!alive) return
          setDepth((cur) => Math.max(cur, d))
          if (!flush.current) {
            flush.current = setTimeout(() => {
              flush.current = null
              if (alive) setLines({ ...ls })
            }, 120)
          }
        },
      })
    }
    return () => {
      alive = false
      if (flush.current) {
        clearTimeout(flush.current)
        flush.current = null
      }
      eng.cancel()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, fen, engineKey, opp, elo, hintsOn, status.over])

  const last: [string, string] | null = hist.length
    ? [hist[hist.length - 1]!.from, hist[hist.length - 1]!.to]
    : last0

  return {
    start, hist, redoStack, sel, opp, elo, hintsOn, depth, engMsg, game, fen, status, hints, last, myTurn,
    setElo, setHintsOn, setOpp, click, grab, drop, playMove, undo, redo, newGame, enterFrom, loadSetup, reset,
  }
}

export type Play = ReturnType<typeof usePlay>
