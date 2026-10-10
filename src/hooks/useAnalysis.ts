import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { classifyGame, summarize } from '../core/classify'
import { cancelAllEngines, engineLabel, getEngine } from '../core/engines'
import { buildGame, emptyGame } from '../core/notation'
import type { EngineLine, Evals, GameData } from '../core/types'
import { Chess } from 'chess.js'

export interface BoardApi {
  setFen: (fen: string) => void
  forward: (m: GameData['moves'][number]) => void
  back: (m: GameData['moves'][number]) => void
}

export interface RunSettings {
  engineKey: string
  engine2: string
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
  if (c.isGameOver()) {
    const line: EngineLine = { mv: '', t: c.isCheckmate() ? 'mate' : 'cp', v: 0 }
    return { aborted: false, lines: [line] }
  }
  return getEngine(key).search({ fen, multipv: 3, go: `depth ${Math.max(1, Math.round(depth) || 1)}` })
}

/** State and actions for the Analyze tab: load a game, run engines over it, step through it. */
export function useAnalysis(board: BoardApi, setFlipped: (f: boolean) => void) {
  const [game, setGame] = useState<GameData>(emptyGame)
  const [evals, setEvals] = useState<Evals>(() => blank(1))
  const [evals2, setEvals2] = useState<Evals | null>(null)
  const [engNames, setEngNames] = useState({ a: '', b: '' })
  const [cur, setCur] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1200)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [status, setStatus] = useState<Status>({ text: 'Paste your game and press Analyze.', err: false })

  const curRef = useRef(0)
  const gameRef = useRef(game)
  gameRef.current = game
  const runId = useRef(0)

  const rows = useMemo(() => classifyGame(game, evals), [game, evals])
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
      setEvals2(null)
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
      const k2 = s.engine2 && s.engine2 !== k1 ? s.engine2 : ''
      load(g, undefined, s.me)
      setEngNames({ a: engineLabel(k1), b: k2 ? engineLabel(k2) : '' })
      if (k2) setEvals2(blank(g.fens.length))
      setRunning(true)
      setProgress(0)
      setStatus({ text: 'Starting the engine…', err: false })
      try {
        await Promise.all([getEngine(k1).ready, ...(k2 ? [getEngine(k2).ready] : [])])
        const n = g.fens.length
        const t0 = Date.now()
        let disagree = 0
        let finished = true
        for (let i = 0; i < n; i++) {
          if (!alive()) {
            finished = false
            break
          }
          setStatus({ text: `Analyzing position ${i + 1} of ${n}…`, err: false })
          const rs = await Promise.all([
            analysePosition(g.fens[i]!, s.depth, k1),
            ...(k2 ? [analysePosition(g.fens[i]!, s.depth, k2)] : []),
          ])
          const r = rs[0]!
          const r2 = rs[1]
          if (r.aborted || r2?.aborted || !alive()) {
            finished = false
            break
          }
          setEvals((prev) => Object.assign([...prev], { [i]: r.lines }))
          if (r2) {
            setEvals2((prev) => (prev ? Object.assign([...prev], { [i]: r2.lines }) : prev))
            if (r2.lines[0] && r.lines[0] && r2.lines[0].mv !== r.lines[0].mv) disagree++
          }
          setProgress(((i + 1) / n) * 100)
        }
        if (finished && alive()) {
          const secs = Math.round((Date.now() - t0) / 1000)
          const extra = k2 ? ` The two engines picked a different first move in ${disagree} of ${n} positions.` : ''
          setStatus({ text: `Done in ${secs} s.${extra} Press Play.`, err: false })
        } else if (alive()) setStatus({ text: 'Stopped.', err: false })
        else setStatus({ text: 'Stopped.', err: false })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Engine error'
        if (alive()) setStatus({ text: `${msg} Try again, or open this page in a full browser tab.`, err: true })
      }
      if (alive()) {
        setRunning(false)
        setTimeout(() => setProgress(null), 1200)
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
    const delay = speed * (rows[cur - 1]?.cls === 'Blunder' ? 1.4 : 1)
    const t = setTimeout(() => go(cur + 1), cur === 0 ? speed : delay)
    return () => clearTimeout(t)
  }, [playing, cur, speed, rows, go])

  const pause = useCallback(() => setPlaying(false), [])
  const togglePlay = useCallback(() => {
    if (playing) return setPlaying(false)
    if (curRef.current >= gameRef.current.fens.length - 1) go(0, false)
    setPlaying(true)
  }, [playing, go])

  return {
    game, evals, evals2, engNames, cur, playing, speed, setSpeed, running, progress, status, setStatus,
    rows, summary, go, load, run, stop, pause, togglePlay,
  }
}

export type Analysis = ReturnType<typeof useAnalysis>
