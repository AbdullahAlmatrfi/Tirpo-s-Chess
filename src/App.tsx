import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import { Board, type ArrowSpec } from './components/Board'
import { EvalBar } from './components/EvalBar'
import { PasteCard } from './components/PasteCard'
import { AnalyzeMain, AnalyzeSide } from './components/AnalyzePanels'
import { EngineMain, EngineSide, type ArrowMode } from './components/EnginePanels'
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
const ARROWS_KEY = 'tc_arrows'

function readMe(): string {
  try {
    return localStorage.getItem(ME_KEY) ?? ''
  } catch {
    return ''
  }
}

function readArrowMode(): ArrowMode {
  try {
    const v = localStorage.getItem(ARROWS_KEY)
    return v === 'all' || v === 'off' ? v : 'one'
  } catch {
    return 'one'
  }
}

function EngineSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Engine">
      {ENGINES.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
    </select>
  )
}

export default function App() {
  const [mode, setMode] = useState<Mode>('analyze')
  const [flipped, setFlipped] = useState(false)
  const [engineKey, setEngineKey] = useState(DEFAULT_ENGINE)
  const [depth, setDepth] = useState(14)
  const [me, setMe] = useState(readMe)
  const [pgn, setPgn] = useState('')
  // on phones the paste box starts folded so the board is the first thing you see (desktop CSS ignores this)
  const [pasteOpen, setPasteOpen] = useState(false)
  const pasteRef = useRef<HTMLDivElement>(null)
  const openPaste = () => {
    setPasteOpen(true)
    setTimeout(() => {
      pasteRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
      pasteRef.current?.querySelector('textarea')?.focus({ preventScroll: true })
    }, 0)
  }
  const [tryFrom, setTryFrom] = useState<number | null>(null)
  // practice-board hints: show one arrow at a time (the highlighted move), all three, or none
  const [arrowMode, setArrowMode] = useState<ArrowMode>(readArrowMode)
  const [pinnedHint, setPinnedHint] = useState(0)
  const [hoverHint, setHoverHint] = useState<number | null>(null)
  // a drag that starts on the replay board switches to the practice board; if the finger lifts before that
  // re-render has landed, the drop is parked here and played as soon as the practice board is ready
  const pendingDrop = useRef<{ from: Square; to: Square } | null>(null)

  const { pieces, setFen, forward, back } = usePieces(START_FEN)
  const boardApi = useMemo(() => ({ setFen, forward, back }), [setFen, forward, back])
  const a = useAnalysis(boardApi, setFlipped)
  const p = usePlay(boardApi, mode === 'engine', engineKey, setFlipped)

  // keep the board where it is on screen when the panels around it change (switching tabs, entering try mode)
  const boardTop = useRef<number | null>(null)
  const rememberBoard = () => {
    const el = document.querySelector('.board')
    boardTop.current = el ? el.getBoundingClientRect().top : null
  }
  useLayoutEffect(() => {
    if (boardTop.current === null) return
    const el = document.querySelector('.board')
    const d = el ? el.getBoundingClientRect().top - boardTop.current : 0
    boardTop.current = null
    if (Math.abs(d) > 1) window.scrollBy(0, d)
  }, [mode])

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
  useEffect(() => {
    try {
      localStorage.setItem(ARROWS_KEY, arrowMode)
    } catch { /* storage unavailable */ }
  }, [arrowMode])
  useEffect(() => {
    const m = pendingDrop.current
    if (!m || mode !== 'engine') return
    pendingDrop.current = null
    p.drop(m.from, m.to)
  }, [mode, p.fen, p.drop])
  // a new position starts again with the best move highlighted
  useEffect(() => {
    setPinnedHint(0)
    setHoverHint(null)
  }, [p.fen])
  const focusHint = hoverHint ?? pinnedHint

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
      rememberBoard()
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
    if (a.running) return
    a.pause()
    rememberBoard()
    cancelAllEngines()
    if (a.game.moves.length === 0) {
      // nothing loaded yet (a first visit): this is not a replay, so skip the "not the real game" warning
      // and just start a normal game against the engine
      setTryFrom(null)
      p.enterFrom(START_FEN, null, sel)
      p.setOpp('b')
      setMode('engine')
      return
    }
    const m = a.cur > 0 ? a.game.moves[a.cur - 1]! : null
    p.enterFrom(a.game.fens[a.cur]!, m ? [m.from, m.to] : null, sel)
    setTryFrom(a.cur)
    setMode('engine')
  }
  const backToGame = () => {
    const i = tryFrom ?? a.cur
    setTryFrom(null)
    cancelAllEngines()
    rememberBoard()
    setMode('analyze')
    a.go(i, false)
  }
  const analyzeText = (text: string) => {
    setPgn(text)
    setTryFrom(null)
    setPasteOpen(false)
    rememberBoard()
    setMode('analyze')
    void a.run(text, { engineKey, depth, me })
  }
  const loadSample = () => {
    if (a.running) return
    const built = buildGame(sample.text)
    if (!built.ok) return
    const g = { ...built.game, names: sample.names }
    setPgn(sample.text)
    setTryFrom(null)
    setPasteOpen(false)
    a.load(g, sample.evals as EngineLine[][], me)
    a.setStatus({ text: 'Sample game loaded. Press Play.', err: false })
  }

  // keyboard shortcuts for stepping through a game
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (mode !== 'analyze' || e.altKey || e.ctrlKey || e.metaKey || ['TEXTAREA', 'SELECT', 'INPUT'].includes(t.tagName)) return
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
      if (arrowMode === 'all') {
        for (let i = h.top.length - 1; i >= 0; i--) {
          const l = h.top[i]!
          arrows.push({ from: l.mv.slice(0, 2), to: l.mv.slice(2, 4), color: cols[i]!, width: ws[i]! })
        }
        if (h.brill) {
          arrows.push({ from: h.brill.mv.slice(0, 2), to: h.brill.mv.slice(2, 4), color: 'var(--brill)', width: 0.11 })
          tag = { sq: h.brill.mv.slice(2, 4), text: '!!' }
        }
      } else if (arrowMode === 'one') {
        // same order as the rows in the hint list: top moves first, then a Brilliant move that is not among them
        const extra = h.brill && !h.top.some((l) => l.mv === h.brill!.mv) ? [h.brill] : []
        const shown = [...h.top, ...extra]
        const idx = Math.min(focusHint, shown.length - 1)
        const l = shown[idx]
        if (l) {
          const isBrill = h.brill?.mv === l.mv
          arrows.push({
            from: l.mv.slice(0, 2), to: l.mv.slice(2, 4),
            color: isBrill ? 'var(--brill)' : (cols[idx] ?? 'var(--brill)'), width: ws[idx] ?? 0.11,
          })
          if (isBrill) tag = { sq: l.mv.slice(2, 4), text: '!!' }
        }
      }
      const sign = p.game.turn() === 'w' ? 1 : -1
      const b = h.best
      bar = b.t === 'mate' ? (sign * (b.v > 0 ? 1 : -1) > 0 ? 100 : 0) : barPct(sign * b.v)
    }
    // one dot per target square (a promotion has four moves to the same square)
    const dots = p.sel
      ? [...new Map(p.game.moves({ square: p.sel as Square, verbose: true }).map((m) => [m.to, { sq: m.to as string, cap: !!m.captured }])).values()]
      : []
    return { arrows, tag, bar, dots }
  })()

  const isAnalyze = mode === 'analyze'
  const boardProps = isAnalyze
    ? {
        last: analyzeView.last, badge: analyzeView.badge, arrows: analyzeView.arrows, tag: null, dots: [], selected: null,
        markKey: `a${a.cur}`, interactive: !a.running, className: 'pmode',
        canGrab: canTry, onGrab: (sq: Square) => enterTry(sq), onSquareClick: (sq: Square) => { if (canTry(sq)) enterTry(sq) },
        onDrop: (from: Square, to: Square) => { pendingDrop.current = { from, to } },
      }
    : {
        last: p.last, badge: null, arrows: engineView.arrows, tag: engineView.tag, dots: engineView.dots, selected: p.sel,
        markKey: `e${p.fen}`, interactive: p.myTurn, className: 'pmode',
        canGrab: (sq: Square) => { const pc = p.game.get(sq); return !!pc && pc.color === p.game.turn() },
        onGrab: p.grab, onSquareClick: p.click, onDrop: p.drop,
      }

  const names = a.game.names
  const sideLabel = (c: 'w' | 'b') => {
    const colour = c === 'w' ? 'White' : 'Black'
    if (p.opp === 'none') return colour
    return p.opp === c ? `${colour} · Engine (about ${p.elo})` : `${colour} · You`
  }
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
          <button role="tab" aria-selected={!isAnalyze} onClick={() => switchTo('engine')}>Play the engine</button>
        </div>
      </div>

      <div className="engrow">
        <label className="chk">Engine <EngineSelect value={engineKey} onChange={setEngineKey} /></label>
      </div>

      <div className="main">
        <section>
          {/* the row above the board has the same height in every mode, so the board never jumps when you switch */}
          {trying ? (
            <div className="trybar">🧪 Analysis board · NOT the real game</div>
          ) : isAnalyze ? (
            <div className="names"><span>{flipped ? names.w : names.b}</span><span>{evTop}</span></div>
          ) : (
            <div className="names"><span>{sideLabel(flipped ? 'w' : 'b')}</span><span /></div>
          )}
          <div className="boardrow">
            <EvalBar pct={isAnalyze ? analyzeView.bar : engineView.bar} flipped={flipped} />
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
          <div className="names" style={{ margin: '8px 0 0' }}>
            <span>{isAnalyze ? (flipped ? names.b : names.w) : sideLabel(flipped ? 'b' : 'w')}</span><span />
          </div>
          {isAnalyze ? (
            <AnalyzeMain a={a} onFlip={flip} onTry={() => enterTry(null)} onPaste={openPaste} />
          ) : (
            <EngineMain
              p={{ ...p, newGame: () => { setTryFrom(null); p.newGame() } }}
              arrowMode={arrowMode}
              onArrowMode={setArrowMode}
              onFlip={flip}
              onBack={tryFrom !== null ? backToGame : null}
            />
          )}
        </section>
        <aside className="side">
          {isAnalyze ? (
            <>
              <PasteCard
                ref={pasteRef}
                pgn={pgn} onPgn={setPgn} me={me} onMe={setMe} depth={depth} onDepth={setDepth}
                open={pasteOpen} onToggle={() => setPasteOpen((o) => !o)}
                running={a.running} status={a.status} progress={a.progress}
                onAnalyze={() => { setTryFrom(null); setPasteOpen(false); void a.run(pgn, { engineKey, depth, me }) }}
                onStop={a.stop} onSample={loadSample}
              />
              <AnalyzeSide a={a} />
            </>
          ) : (
            <EngineSide
              p={{ ...p, loadSetup: (t: string) => { const r = p.loadSetup(t); if (r === 'Loaded.') setTryFrom(null); return r } }}
              onAnalyze={analyzeText}
              arrowMode={arrowMode}
              focus={focusHint}
              onPick={setPinnedHint}
              onHover={setHoverHint}
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
