import { useCallback, useEffect, useMemo, useState } from 'react'
import { Chess } from 'chess.js'
import { Board, type ArrowSpec } from './components/Board'
import { EvalBar } from './components/EvalBar'
import { AnalyzeMain, AnalyzeSide } from './components/AnalyzePanels'
import { EngineMain, EngineSide } from './components/EnginePanels'
import { APP_NAME } from './config'
import { NEEDS_BEST_HINT } from './core/classify'
import { barPct, evalText, whiteBarPct, whiteEval } from './core/eval'
import { cancelAllEngines, DEFAULT_ENGINE, ENGINES } from './core/engines'
import { buildGame } from './core/notation'
import type { EngineLine, Square } from './core/types'
import { usePieces } from './hooks/usePieces'
import { useAnalysis } from './hooks/useAnalysis'
import { usePlay } from './hooks/usePlay'
import { CLASS_SYMBOL, classColor } from './ui'
import sample from './data/sample.json'

type Mode = 'analyze' | 'engine'
const START_FEN = new Chess().fen()
const ME_KEY = 'tc_me'

function readMe(): string {
  try {
    return localStorage.getItem(ME_KEY) ?? ''
  } catch {
    return ''
  }
}

function EngineSelect({ value, onChange, withNone }: { value: string; onChange: (v: string) => void; withNone?: boolean }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={withNone ? 'Second opinion engine' : 'Engine'}>
      {withNone && <option value="">None</option>}
      {ENGINES.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
    </select>
  )
}

export default function App() {
  const [mode, setMode] = useState<Mode>('analyze')
  const [flipped, setFlipped] = useState(false)
  const [engineKey, setEngineKey] = useState(DEFAULT_ENGINE)
  const [engine2, setEngine2] = useState('')
  const [depth, setDepth] = useState(14)
  const [me, setMe] = useState(readMe)
  const [pgn, setPgn] = useState('')
  const [tryFrom, setTryFrom] = useState<number | null>(null)

  const { pieces, setFen, forward, back } = usePieces(START_FEN)
  const boardApi = useMemo(() => ({ setFen, forward, back }), [setFen, forward, back])
  const a = useAnalysis(boardApi, setFlipped)
  const p = usePlay(boardApi, mode === 'engine', engineKey, setFlipped)

  const trying = tryFrom !== null && mode === 'engine'
  useEffect(() => {
    document.body.classList.toggle('trying', trying)
    return () => document.body.classList.remove('trying')
  }, [trying])
  useEffect(() => {
    try {
      localStorage.setItem(ME_KEY, me.trim())
    } catch { /* storage unavailable */ }
  }, [me])

  const switchTo = useCallback(
    (m: Mode) => {
      if (m === mode) return
      if (mode === 'analyze') {
        a.pause()
        if (a.running) {
          a.stop()
          a.setStatus({ text: 'Analysis stopped.', err: false })
        }
      }
      cancelAllEngines()
      setMode(m)
      setFen(m === 'analyze' ? a.game.fens[a.cur]! : p.fen)
    },
    [mode, a, p.fen, setFen],
  )

  const flip = () => setFlipped((f) => !f)

  // side to move in the analysed position decides which pieces can start a "try moves" line
  const analyzedPos = useMemo(() => new Chess(a.game.fens[a.cur]), [a.game, a.cur])
  const canTry = (sq: Square) => {
    if (a.running || analyzedPos.isGameOver()) return false
    const pc = analyzedPos.get(sq)
    return !!pc && pc.color === analyzedPos.turn()
  }
  const enterTry = (sel: Square | null) => {
    a.pause()
    const m = a.cur > 0 ? a.game.moves[a.cur - 1]! : null
    cancelAllEngines()
    p.enterFrom(a.game.fens[a.cur]!, m ? [m.from, m.to] : null, sel)
    setTryFrom(a.cur)
    setMode('engine')
  }
  const backToGame = () => {
    const i = tryFrom ?? a.cur
    setTryFrom(null)
    cancelAllEngines()
    setMode('analyze')
    a.go(i, false)
  }
  const analyzeText = (text: string) => {
    setPgn(text)
    setTryFrom(null)
    setMode('analyze')
    void a.run(text, { engineKey, engine2, depth, me })
  }
  const loadSample = () => {
    if (a.running) return
    const built = buildGame(sample.text)
    if (!built.ok) return
    const g = { ...built.game, names: sample.names }
    setPgn(sample.text)
    setTryFrom(null)
    a.load(g, sample.evals as EngineLine[][], me)
    a.setStatus({ text: 'Sample game loaded. Press Play.', err: false })
  }

  // keyboard shortcuts for stepping through a game
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (mode !== 'analyze' || ['TEXTAREA', 'SELECT', 'INPUT'].includes(t.tagName)) return
      if (e.key === 'ArrowRight') { a.pause(); a.go(a.cur + 1) }
      else if (e.key === 'ArrowLeft') { a.pause(); a.go(a.cur - 1) }
      else if (e.key === ' ' && t.tagName !== 'BUTTON') { e.preventDefault(); a.togglePlay() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [mode, a])

  // ----- what the board shows -----
  const analyzeView = (() => {
    const i = a.cur
    const m = i > 0 ? a.game.moves[i - 1]! : null
    const r = i > 0 ? a.rows[i - 1] : null
    const arrows: ArrowSpec[] = []
    if (r && NEEDS_BEST_HINT.includes(r.cls)) {
      const best = a.evals[i - 1]?.[0]?.mv
      if (best && best !== a.game.ucis[i - 1]) arrows.push({ from: best.slice(0, 2), to: best.slice(2, 4), color: 'var(--a1)', width: 0.13 })
    }
    return {
      last: m ? ([m.from, m.to] as [string, string]) : null,
      badge: m ? { sq: m.to, color: classColor(r ? r.cls : '…'), sym: CLASS_SYMBOL[r ? r.cls : '…'] } : null,
      arrows,
      bar: whiteBarPct(whiteEval(a.evals, i)),
    }
  })()

  const engineView = (() => {
    const arrows: ArrowSpec[] = []
    let tag: { sq: string; text: string } | null = null
    let bar: number | null = null
    const h = p.hints
    const engineTurn = p.opp !== 'none' && p.opp === p.game.turn()
    if (h && !p.status.over && !engineTurn) {
      const cols = ['var(--a1)', 'var(--a2)', 'var(--a3)']
      const ws = [0.13, 0.1, 0.08]
      for (let i = h.top.length - 1; i >= 0; i--) {
        const l = h.top[i]!
        arrows.push({ from: l.mv.slice(0, 2), to: l.mv.slice(2, 4), color: cols[i]!, width: ws[i]! })
      }
      if (h.brill) {
        arrows.push({ from: h.brill.mv.slice(0, 2), to: h.brill.mv.slice(2, 4), color: 'var(--brill)', width: 0.11 })
        tag = { sq: h.brill.mv.slice(2, 4), text: '!!' }
      }
      const sign = p.game.turn() === 'w' ? 1 : -1
      const b = h.best
      bar = b.t === 'mate' ? (sign * (b.v > 0 ? 1 : -1) > 0 ? 100 : 0) : barPct(sign * b.v)
    }
    const dots = p.sel
      ? p.game.moves({ square: p.sel as Square, verbose: true }).map((m) => ({ sq: m.to, cap: !!m.captured }))
      : []
    return { arrows, tag, bar, dots }
  })()

  const isAnalyze = mode === 'analyze'
  const boardProps = isAnalyze
    ? {
        last: analyzeView.last, badge: analyzeView.badge, arrows: analyzeView.arrows, tag: null, dots: [], selected: null,
        markKey: `a${a.cur}`, interactive: !a.running, className: '',
        canGrab: canTry, onGrab: (sq: Square) => enterTry(sq), onSquareClick: (sq: Square) => { if (canTry(sq)) enterTry(sq) },
        onDrop: () => {},
      }
    : {
        last: p.last, badge: null, arrows: engineView.arrows, tag: engineView.tag, dots: engineView.dots, selected: p.sel,
        markKey: `e${p.fen}`, interactive: p.myTurn, className: 'pmode',
        canGrab: (sq: Square) => { const pc = p.game.get(sq); return !!pc && pc.color === p.game.turn() },
        onGrab: p.grab, onSquareClick: p.click, onDrop: p.drop,
      }

  const names = a.game.names
  const evTop = evalText(whiteEval(a.evals, a.cur))

  return (
    <div className="wrap">
      <div className="top">
        <div>
          <h1>{APP_NAME}</h1>
          <p className="sub">
            Free Stockfish analysis that runs inside this page. For study and practice. Do not use it during a live or
            rated game on any site: that is cheating.
          </p>
        </div>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={isAnalyze} onClick={() => switchTo('analyze')}>Analyze a game</button>
          <button role="tab" aria-selected={!isAnalyze} onClick={() => switchTo('engine')}>Engine</button>
        </div>
      </div>

      <div className="engrow">
        <label className="chk">Engine <EngineSelect value={engineKey} onChange={setEngineKey} /></label>
        {isAnalyze && (
          <label className="chk">Second opinion <EngineSelect value={engine2} onChange={setEngine2} withNone /></label>
        )}
      </div>

      {isAnalyze && (
        <div className="card">
          <label className="l" htmlFor="pgn">Moves (PGN or plain list)</label>
          <textarea id="pgn" spellCheck={false} value={pgn} onChange={(e) => setPgn(e.target.value)} placeholder="1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 ..." />
          <div className="row">
            <button className="pri" disabled={a.running} onClick={() => { setTryFrom(null); void a.run(pgn, { engineKey, engine2, depth, me }) }}>Analyze</button>
            <button disabled={!a.running} onClick={a.stop}>Stop</button>
            <button onClick={loadSample}>Load sample game</button>
            <select aria-label="Analysis strength" value={depth} onChange={(e) => setDepth(+e.target.value)}>
              <option value="10">Fast</option><option value="14">Normal</option><option value="18">Deep (slow)</option>
            </select>
            <input id="me" aria-label="Your username" placeholder="Your username" autoComplete="off" spellCheck={false} value={me} onChange={(e) => setMe(e.target.value)} />
            <span className={`status${a.status.err ? ' err' : ''}`}>{a.status.text}</span>
          </div>
          {a.progress !== null && <div className="prog"><i style={{ width: `${a.progress}%` }} /></div>}
        </div>
      )}

      <div className="main">
        <section>
          {isAnalyze && (
            <div className="names"><span>{flipped ? names.w : names.b}</span><span>{evTop}</span></div>
          )}
          {trying && <div className="trybar">🧪 Analysis board · NOT the real game</div>}
          <div className="boardrow">
            <EvalBar pct={isAnalyze ? analyzeView.bar : engineView.bar} />
            <Board
              pieces={pieces}
              flipped={flipped}
              {...boardProps}
              overlay={
                !isAnalyze && p.status.over ? (
                  <div className="gover">GAME OVER<br />{p.status.text}<small>Undo to go back, or New game</small></div>
                ) : null
              }
            />
          </div>
          {isAnalyze && (
            <div className="names" style={{ margin: '8px 0 0' }}><span>{flipped ? names.b : names.w}</span><span /></div>
          )}
          {isAnalyze ? (
            <AnalyzeMain a={a} onFlip={flip} onTry={() => enterTry(null)} />
          ) : (
            <EngineMain
              p={{ ...p, newGame: () => { setTryFrom(null); p.newGame() } }}
              onFlip={flip}
              onBack={tryFrom !== null ? backToGame : null}
            />
          )}
        </section>
        <aside className="side">
          {isAnalyze ? (
            <AnalyzeSide a={a} />
          ) : (
            <EngineSide
              p={{ ...p, loadSetup: (t: string) => { const r = p.loadSetup(t); if (r === 'Loaded.') setTryFrom(null); return r } }}
              onAnalyze={analyzeText}
            />
          )}
          <div className="foot">
            Engines: Stockfish 17.1, 18 and 19 lite (GPLv3, the Stockfish team), running in your browser. Nothing you
            enter leaves this page.
          </div>
        </aside>
      </div>
    </div>
  )
}
