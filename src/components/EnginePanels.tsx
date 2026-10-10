import { useState } from 'react'
import { lineText } from '../core/eval'
import { eloLabel, MAX_ELO, MIN_ELO, STOCKFISH_MIN_ELO } from '../core/strength'
import { moveListText, wordsCached } from '../core/notation'
import type { Play } from '../hooks/usePlay'

export function EngineMain({ p, onFlip, onBack }: { p: Play; onFlip: () => void; onBack: (() => void) | null }) {
  return (
    <div>
      <div className={`pstatus${p.status.over ? ' over' : ''}`} aria-live="polite">{p.status.text}</div>
      <div className="ctrl">
        {onBack && <button onClick={onBack}>↩ Back to the game</button>}
        <button onClick={p.undo} disabled={!p.hist.length}>◀ Undo</button>
        <button onClick={p.redo} disabled={!p.redoStack.length}>Redo ▶</button>
        <button onClick={onFlip}>Flip board ⇅</button>
        <button onClick={p.newGame}>New game</button>
      </div>
      <div className="ctrl">
        <select aria-label="Opponent" value={p.opp} onChange={(e) => p.setOpp(e.target.value as 'none' | 'w' | 'b')}>
          <option value="none">Opponent: me (both sides)</option>
          <option value="b">Engine plays Black</option>
          <option value="w">Engine plays White</option>
        </select>
        <label className="chk">
          <input type="checkbox" checked={p.hintsOn} onChange={(e) => p.setHintsOn(e.target.checked)} /> Hints
        </label>
      </div>
      {p.opp !== 'none' && (
        <div className="elo">
          <div className="eloTop">
            <label htmlFor="elo">Engine strength</label>
            <span className="eloVal">
              <input
                type="number" min={MIN_ELO} max={MAX_ELO} step={50} value={p.elo} aria-label="Engine Elo"
                onChange={(e) => p.setElo(+e.target.value)}
              />{' '}
              Elo · {eloLabel(p.elo)}
            </span>
          </div>
          <input id="elo" type="range" min={MIN_ELO} max={MAX_ELO} step={50} value={p.elo} onChange={(e) => p.setElo(+e.target.value)} />
          <div className="ctrl presets">
            {[500, 800, 1200, 1600, 2000, 2500, 3200].map((v) => (
              <button key={v} className={p.elo === v ? 'pri' : ''} onClick={() => p.setElo(v)}>{v === 3200 ? 'Max' : v}</button>
            ))}
          </div>
          <div className="foot">
            {p.elo < STOCKFISH_MIN_ELO
              ? `Stockfish itself can't play weaker than ${STOCKFISH_MIN_ELO}, so below that the engine makes deliberate mistakes. The number is an estimate, not an official rating.`
              : 'Estimated strength using Stockfish\'s built-in limiter. Hints and game analysis always use full strength.'}
          </div>
        </div>
      )}
    </div>
  )
}

export function EngineSide({ p, onAnalyze }: { p: Play; onAnalyze: (text: string) => void }) {
  const [setup, setSetup] = useState('')
  const [loadMsg, setLoadMsg] = useState('')
  const [copied, setCopied] = useState('')
  const fen = p.fen
  const turnIsEngine = p.opp !== 'none' && p.opp === p.game.turn()

  let hintBody: React.ReactNode
  if (p.status.over) hintBody = <span className="foot">Game over. Press New game or Undo.</span>
  else if (!p.hintsOn) hintBody = <span className="foot">Hints are hidden. Tick Hints to see the best moves.</span>
  else if (turnIsEngine) hintBody = <span className="foot">Engine is thinking…</span>
  else if (!p.hints) hintBody = <span className="foot">Thinking…</span>
  else {
    const h = p.hints
    hintBody = (
      <>
        {h.top.map((l, i) => {
          const w = wordsCached(fen, l.mv)
          const isB = h.brill?.mv === l.mv
          return (
            <div className={`hint r${i + 1}`} key={l.mv}>
              <span className="rk">{i + 1}</span>
              <span className="t">
                {w.text}
                {isB && <span className="chip">Brilliant</span>}
                {i === 0 && h.only && <span className="chip g">Only good move</span>}
                <small>{w.san}</small>
              </span>
              <span className="e">{lineText(l)}</span>
            </div>
          )
        })}
        {h.brill && !h.top.some((l) => l.mv === h.brill!.mv) && (() => {
          const w = wordsCached(fen, h.brill!.mv)
          return (
            <div className="hint rb">
              <span className="rk">!!</span>
              <span className="t">{w.text}<span className="chip">Brilliant</span><small>{w.san}</small></span>
              <span className="e">{lineText(h.brill!)}</span>
            </div>
          )
        })()}
      </>
    )
  }

  const text = moveListText(p.hist)
  const canAnalyze = p.hist.length > 0 && !p.start

  return (
    <div className="side">
      <div className="card">
        <h2>Best moves now</h2>
        <div className="hints">{hintBody}</div>
        <div className={`eng${p.engMsg ? ' err' : ''}`}>
          {p.engMsg ?? (p.hintsOn && !p.status.over && !turnIsEngine ? `Depth ${p.depth}${p.depth >= 22 ? ' (done)' : ' · still thinking'}` : '')}
        </div>
      </div>
      <div className="card">
        <h2>Moves</h2>
        <div className="moves">
          {p.hist.length === 0
            ? 'No moves yet.'
            : p.hist.map((m, i) => (
                <span key={i}>
                  {i % 2 === 0 ? `${Math.floor(i / 2) + 1}. ` : ''}
                  {i === p.hist.length - 1 ? <b>{m.san}</b> : m.san}{' '}
                </span>
              ))}
        </div>
        <div className="ctrl">
          <button
            onClick={() => {
              try {
                navigator.clipboard.writeText(text).then(() => setCopied('Copied.'), () => setCopied('Select and copy the moves above.'))
              } catch {
                setCopied('Select and copy the moves above.')
              }
            }}
          >Copy moves</button>
          <button
            disabled={!canAnalyze}
            onClick={() => {
              const head = p.opp === 'b' ? '[White "You"]\n[Black "Engine"]\n' : p.opp === 'w' ? '[White "Engine"]\n[Black "You"]\n' : ''
              onAnalyze(head + text)
            }}
          >Analyze this game</button>
          <span className="foot">{copied}</span>
        </div>
      </div>
      <div className="card">
        <h2>Set up a position</h2>
        <textarea
          spellCheck={false}
          value={setup}
          onChange={(e) => setSetup(e.target.value)}
          placeholder="Paste a FEN or the moves of a finished game, then press Load."
        />
        <div className="ctrl">
          <button className="pri" onClick={() => setLoadMsg(p.loadSetup(setup))}>Load</button>
          <span className="foot">{loadMsg}</span>
        </div>
      </div>
      <div className="foot">
        Hint numbers: plus means good for the side to move. Brilliant means a piece sacrifice the engine still rates among
        the best moves, in a position that is not already won or lost. Pawn promotion always makes a queen.
      </div>
    </div>
  )
}
