import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { classifyMove, summarize } from '../core/classify'
import { cancelAllEngines, engineLabel, getEngine } from '../core/engines'
import { buildGame, emptyGame } from '../core/notation'
import type { Classification, EngineLine, Evals, GameData } from '../core/types'
import { Chess } from 'chess.js'

export interface BoardApi {
  setFen: (fen: string) => void
  forward: (m: GameData['moves'][number]) => void
  back: (m: GameData['moves'][number]) => void
}

export interface RunSettings {
  engineKey: string
  depth: number
  me: string
}

export interface Status {
  text: string
  err: boolean
}

const blank = (n: number): Evals => new Array<EngineLine[] | null>(n).fill(null)

async function analysePosition(fen: string, depth: number, key: string) {
  const c = new Chess(fen)
  // only a finished game (mate or stalemate) skips the engine; draws by the 50-move count etc. still have a best move
  if (c.isCheckmate() || c.isStalemate()) {
    const line: EngineLine = { mv: '', t: c.isCheckmate() ? 'mate' : 'cp', v: 0 }
    return { aborted: false, lines: [line] }
  }
  return getEngine(key).search({ fen, multipv: 3, go: `depth ${Math.max(1, Math.round(depth) || 1)}` })
}

/** State and actions for the Analyze tab: load a game, run engines over it, step through it. */
export function useAnalysis(board: BoardApi, setFlipped: (f: boolean) => void) {
  const [game, setGame] = useState<GameData>(emptyGame)
  const [evals, setEvals] = useState<Evals>(() => blank(1))
  const [cur, setCur] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1200)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [status, setStatus] = useState<Status>({ text: 'Paste your game and press Analyze. Or drag a piece on the board to play the engine.', err: false })

  const curRef = useRef(0)
  const gameRef = useRef(game)
  gameRef.current = game
  const runId = useRef(0)

  // classify incrementally: a move is only re-graded when its two neighbouring evals changed
  const rowCache = useRef<{ game: GameData; items: { b: unknown; a: unknown; r: Classification | null }[] }>({ game, items: [] })
  const rows = useMemo(() => {
    if (rowCache.current.game !== game) rowCache.current = { game, items: [] }
    const items = rowCache.current.items
    return game.moves.map((_, i) => {
      const b = evals[i] ?? null
      const a = evals[i + 1] ?? null
      const hit = items[i]
      if (hit && hit.b === b && hit.a === a) return hit.r
      const r = classifyMove(game.fens[i]!, game.ucis[i]!, b, a, i)
      items[i] = { b, a, r }
      return r
    })
  }, [game, evals])
  const rowsRef = useRef(rows)
  rowsRef.current = rows
  const summary = useMemo(() => summarize(rows), [rows])

  const go = useCallback(
    (target: number, animate = true) => {
      const g = gameRef.current
      const i = Math.max(0, Math.min(g.fens.length - 1, target))
      const from = curRef.current
      if (animate && i === from + 1) board.forward(g.moves[from]!)
      else if (animate && i === from - 1 && from > 0) board.back(g.moves[from - 1]!)
      else board.setFen(g.fens[i]!)
      curRef.current = i
      setCur(i)
    },
    [board],
  )

  const load = useCallback(
    (g: GameData, preset?: Evals, me = '') => {
      setPlaying(false)
      gameRef.current = g
      setGame(g)
      setEvals(preset ?? blank(g.fens.length))
      const m = me.trim().toLowerCase()
      if (m) {
        if (g.names.b.toLowerCase() === m) setFlipped(true)
        else if (g.names.w.toLowerCase() === m) setFlipped(false)
      }
      curRef.current = 0
      setCur(0)
      board.setFen(g.fens[0]!)
    },
    [board, setFlipped],
  )

  const stop = useCallback(() => {
    runId.current++
    cancelAllEngines()
    setRunning(false)
    setProgress(null)
    setStatus({ text: 'Stopped.', err: false })
  }, [])

  const run = useCallback(
    async (text: string, s: RunSettings) => {
      if (running) return
      if (!text.trim()) return setStatus({ text: 'Paste the moves first.', err: true })
      const built = buildGame(text)
      if (!built.ok) return setStatus({ text: built.error, err: true })
      const g = built.game
      const id = ++runId.current
      const alive = () => runId.current === id
      const k1 = s.engineKey
      load(g, undefined, s.me)
      setRunning(true)
      setProgress(0)
      setStatus({ text: 'Starting the engine…', err: false })
      try {
        await getEngine(k1).ready
        const n = g.fens.length
        const t0 = Date.now()
        let finished = true
        for (let i = 0; i < n; i++) {
          if (!alive()) {
            finished = false
            break
          }
          setStatus({ text: `Analyzing position ${i + 1} of ${n}…`, err: false })
          const r = await analysePosition(g.fens[i]!, s.depth, k1)
          if (r.aborted || !alive()) {
            finished = false
            break
          }
          setEvals((prev) => Object.assign([...prev], { [i]: r.lines }))
          setProgress(((i + 1) / n) * 100)
        }
        if (alive()) {
          if (finished) {
            const secs = Math.round((Date.now() - t0) / 1000)
            setStatus({ text: `Done in ${secs} s with ${engineLabel(k1)}. Press Play.`, err: false })
          } else setStatus({ text: 'Stopped.', err: false })
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Engine error'
        if (alive()) setStatus({ text: `${msg} Try again, or open this page in a full browser tab.`, err: true })
      }
      if (alive()) {
        setRunning(false)
        setTimeout(() => {
          if (runId.current === id) setProgress(null)
        }, 1200)
      }
    },
    [load, running],
  )

  // autoplay
  useEffect(() => {
    if (!playing) return
    const last = gameRef.current.fens.length - 1
    if (cur >= last) {
      setPlaying(false)
      return
    }
    const delay = speed * (rowsRef.current[cur - 1]?.cls === 'Blunder' ? 1.4 : 1)
    const t = setTimeout(() => go(cur + 1), cur === 0 ? speed : delay)
    return () => clearTimeout(t)
  }, [playing, cur, speed, go])

  const pause = useCallback(() => setPlaying(false), [])
  const togglePlay = useCallback(() => {
    if (playing) return setPlaying(false)
    if (curRef.current >= gameRef.current.fens.length - 1) go(0, false)
    setPlaying(true)
  }, [playing, go])

  return {
    game, evals, cur, playing, speed, setSpeed, running, progress, status, setStatus,
    rows, summary, go, load, run, stop, pause, togglePlay,
  }
}

export type Analysis = ReturnType<typeof useAnalysis>
