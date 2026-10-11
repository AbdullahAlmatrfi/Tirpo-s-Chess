import { useEffect, useMemo, useRef } from 'react'
import { MOVE_CLASSES, type MoveClass } from '../core/types'
import { evalText, whiteBarPct, whiteEval, type WhiteEval } from '../core/eval'
import { NEEDS_BEST_HINT } from '../core/classify'
import { explainMove } from '../core/explain'
import { wordsCached } from '../core/notation'
import { CLASS_VAR, classColor } from '../ui'
import type { Analysis } from '../hooks/useAnalysis'

const esc = (s: string) => s

function Graph({ a }: { a: Analysis }) {
  const W = 300, H = 64
  const n = Math.max(2, a.game.fens.length)
  const pts: [number, number][] = []
  for (let i = 0; i < a.game.fens.length; i++) {
    const p = whiteBarPct(whiteEval(a.evals, i))
    if (p === null) continue
    pts.push([(i / (n - 1)) * W, H - (p / 100) * H])
  }
  const cx = (a.cur / Math.max(1, a.game.fens.length - 1)) * W
  const line = pts.map((p) => p.join(',')).join(' ')
  return (
    <div className="graph">
      <svg
        viewBox="0 0 300 64"
        preserveAspectRatio="none"
        role="img"
        aria-label="Evaluation graph"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          a.pause()
          a.go(Math.round(((e.clientX - r.left) / r.width) * (a.game.fens.length - 1)), false)
        }}
      >
        <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="var(--line)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {pts.length > 1 && (
          <>
            <polygon points={`0,${H} ${line} ${pts[pts.length - 1]![0]},${H}`} fill="var(--fg)" opacity=".12" />
            <polyline points={line} fill="none" stroke="var(--fg)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          </>
        )}
        <line x1={cx} x2={cx} y1="0" y2={H} stroke="var(--great)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  )
}

export function AnalyzeMain({ a, onFlip, onTry, onPaste }: { a: Analysis; onFlip: () => void; onTry: () => void; onPaste: () => void }) {
  const last = a.game.fens.length - 1
  const i = a.cur
  const w: WhiteEval | null = whiteEval(a.evals, i)
  const r = i > 0 ? a.rows[i - 1] : null
  const e = i > 0 ? a.evals[i - 1] : null
  const m = i > 0 ? a.game.moves[i - 1] : null

  const before = i > 0 ? a.evals[i - 1] : null
  const after = i > 0 ? a.evals[i] : null
  const ex = useMemo(
    () =>
      i > 0 && r && before?.length && after?.length
        ? explainMove({ fenBefore: a.game.fens[i - 1]!, played: a.game.ucis[i - 1]!, cls: r, before, after, ply: i - 1 })
        : null,
    [i, r, before, after, a.game],
  )

  let verdict: React.ReactNode
  if (i === 0 || !m) {
    verdict = a.game.moves.length ? (
      'Press play to watch the game.'
    ) : (
      <>
        Drag a piece on the board to play the engine, or{' '}
        <button className="linkbtn" onClick={onPaste}>paste a game</button> to analyze it.
      </>
    )
  } else {
    const played = wordsCached(a.game.fens[i - 1]!, a.game.ucis[i - 1]!)
    const best = e?.[0]
    verdict = (
      <>
        <div>{esc(played.text)}</div>
        {r && NEEDS_BEST_HINT.includes(r.cls) && best && best.mv !== a.game.ucis[i - 1] ? (
          <div className="bm">
            Best was: {wordsCached(a.game.fens[i - 1]!, best.mv).text}{' '}
            <small>({wordsCached(a.game.fens[i - 1]!, best.mv).san})</small>
          </div>
        ) : r?.cls === 'Great' ? (
          <div><small>Only move that kept the advantage.</small></div>
        ) : r?.cls === 'Brilliant' ? (
          <div><small>A sacrifice that works.</small></div>
        ) : r?.cls === 'Forced' ? (
          <div><small>Only legal move.</small></div>
        ) : r?.lost ? (
          <div><small>Already lost here.</small></div>
        ) : null}
      </>
    )
  }

  return (
    <div>
      <div className="ctrl">
        <button aria-label="Go to start" onClick={() => { a.pause(); a.go(0, false) }}>⏮</button>
        <button aria-label="Previous move" onClick={() => { a.pause(); a.go(i - 1) }}>◀</button>
        <button className="play" onClick={a.togglePlay}>{a.playing ? 'Pause' : i >= last && last > 0 ? 'Replay' : 'Play'}</button>
        <button aria-label="Next move" onClick={() => { a.pause(); a.go(i + 1) }}>▶</button>
        <button aria-label="Go to end" onClick={() => { a.pause(); a.go(last, false) }}>⏭</button>
        <button onClick={onFlip}>Flip board ⇅</button>
        <label className="lbl">Speed
          <select aria-label="Speed" value={a.speed} onChange={(e) => a.setSpeed(+e.target.value)}>
            <option value="1900">Slow</option><option value="1200">Normal</option><option value="600">Fast</option>
          </select>
        </label>
      </div>
      <div className="card verdict" aria-live="polite" style={{ marginTop: 12 }}>
        <div className="vtop">
          <span className="vmove">{m ? `${Math.floor((i - 1) / 2) + 1}${(i - 1) % 2 === 0 ? '. ' : '... '}${m.san}` : 'Start'}</span>
          {m && (
            <span className="pill" style={{ background: classColor(r ? r.cls : '…') }}>{r ? r.cls : 'Analyzing…'}</span>
          )}
          <span className="vev">{i === 0 ? '' : evalText(w)}</span>
        </div>
        <div className="vtxt">{verdict}</div>
      </div>
      <div className="card why" aria-live="polite">
        <h2>Why this move?</h2>
        {ex && ex.headline ? (
          <>
            <p className="whyhead">{ex.headline}</p>
            <ul>{ex.reasons.map((t, k) => <li key={k}>{t}</li>)}</ul>
            {ex.lines.map((l, k) => (
              <div className="whyline" key={k}><b>{l.label}:</b> <span>{l.text}</span></div>
            ))}
          </>
        ) : (
          <p className="foot">{i === 0 ? 'Step to a move to see the reasons behind it.' : 'Waiting for the engine…'}</p>
        )}
      </div>
      <div className="ctrl"><button onClick={onTry} disabled={a.running}>Try moves from here</button></div>
      <Graph a={a} />
    </div>
  )
}

function AltRows({ fen, sign, lines }: { fen: string; sign: number; lines: NonNullable<Analysis['evals'][number]> }) {
  return (
    <>
      {lines.map((l, k) => {
        const wd = wordsCached(fen, l.mv)
        const ev = l.t === 'mate' ? `${sign * l.v > 0 ? '' : '-'}M${Math.abs(l.v)}` : `${sign * l.v > 0 ? '+' : ''}${((sign * l.v) / 100).toFixed(1)}`
        return (
          <div className="alt" key={k}>
            <span className="e">{ev}</span>
            <span>{k + 1}. {wd.text} <small style={{ color: 'var(--muted)' }}>({wd.san})</small></span>
          </div>
        )
      })}
    </>
  )
}

export function AnalyzeSide({ a }: { a: Analysis }) {
  const i = a.cur
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const l = listRef.current
    const on = l?.querySelector<HTMLElement>('.mv.on')
    if (l && on && l.scrollTo) l.scrollTo({ top: Math.max(0, on.offsetTop - l.offsetTop - l.clientHeight / 2), behavior: 'smooth' })
  }, [i])

  const e = i > 0 ? a.evals[i - 1] : null
  const fen = i > 0 ? a.game.fens[i - 1]! : ''
  const sign = (i - 1) % 2 === 0 ? 1 : -1

  const card = (s: 'w' | 'b', label: string) => {
    const sm = a.summary[s]
    return (
      <div className="who">
        <small>{label}</small>
        <b>{a.game.names[s]}</b>
        <div className="acc">{sm.accuracy === null ? '–' : sm.accuracy.toFixed(1)}</div>
        <small>accuracy (approx.)</small>
        <div className="tally" style={{ marginTop: 6 }}>
          {MOVE_CLASSES.filter((k) => sm.tally[k]).map((k) => (
            <i key={k} style={{ background: classColor(k) }}>{sm.tally[k]} {k}</i>
          ))}
        </div>
      </div>
    )
  }

  const rows: React.ReactNode[] = []
  const n = a.game.moves.length
  for (let m = 0; m < Math.ceil(n / 2); m++) {
    rows.push(<div className="n" key={`n${m}`}>{m + 1}.</div>)
    for (const idx of [2 * m, 2 * m + 1]) {
      if (idx >= n) {
        rows.push(<div key={`e${idx}`} />)
        continue
      }
      const c: MoveClass | '…' = a.rows[idx]?.cls ?? '…'
      rows.push(
        <button key={idx} className={`mv${i === idx + 1 ? ' on' : ''}`} onClick={() => { a.pause(); a.go(idx + 1, true) }}>
          <span className="dot" style={{ background: classColor(c) }} />
          {a.game.moves[idx]!.san}
        </button>,
      )
    }
  }

  return (
    <div className="side">
      <div className="card">
        <div className="sum">{card('w', 'White')}{card('b', 'Black')}</div>
      </div>
      <div className="card">
        <h2>Engine top choices before this move</h2>
        <div className="alts">
          {i === 0 ? (
            <span className="foot">Step to a move to see them.</span>
          ) : e && e.length ? (
            <AltRows fen={fen} sign={sign} lines={e} />
          ) : (
            <span className="foot">Waiting for the engine…</span>
          )}
        </div>
      </div>
      <div className="card">
        <h2>Moves</h2>
        <div className="list" ref={listRef}>{rows}</div>
      </div>
      <div className="legend">
        {(Object.keys(CLASS_VAR) as (MoveClass | '…')[]).filter((k) => k !== '…').map((k) => (
          <span key={k}><i className="dot" style={{ background: classColor(k) }} />{k}</span>
        ))}
      </div>
      <div className="foot">
        Evaluation numbers are from White's side: plus is good for White. "Book" is a guess for the first four moves.
        Labels are close to, but not the same as, Chess.com's.
      </div>
    </div>
  )
}
