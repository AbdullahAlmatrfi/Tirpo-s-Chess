import { forwardRef } from 'react'
import type { Status } from '../hooks/useAnalysis'

interface Props {
  pgn: string
  onPgn: (v: string) => void
  me: string
  onMe: (v: string) => void
  depth: number
  onDepth: (v: number) => void
  open: boolean
  onToggle: () => void
  running: boolean
  status: Status
  progress: number | null
  onAnalyze: () => void
  onStop: () => void
  onSample: () => void
}

/** Paste box + Analyze controls. Folded to one button on phones (desktop CSS keeps it open). */
export const PasteCard = forwardRef<HTMLDivElement, Props>(function PasteCard(p, ref) {
  return (
    <div ref={ref} className={`card paste${p.open ? '' : ' folded'}`}>
      <button className="pastetoggle" aria-expanded={p.open} onClick={p.onToggle}>
        {p.open ? 'Hide the paste box ▴' : 'Paste a game to analyze ▾'}
      </button>
      <div className="pastebody">
        <label className="l" htmlFor="pgn">Moves (PGN or plain list)</label>
        <textarea
          id="pgn" spellCheck={false} value={p.pgn} onChange={(e) => p.onPgn(e.target.value)}
          placeholder="1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 ..."
        />
        <div className="row">
          <button className="pri" disabled={p.running} onClick={p.onAnalyze}>Analyze</button>
          <button disabled={!p.running} onClick={p.onStop}>Stop</button>
          <button onClick={p.onSample}>Load sample game</button>
          <label className="lbl">Depth
            <select aria-label="Analysis strength" value={p.depth} onChange={(e) => p.onDepth(+e.target.value)}>
              <option value="10">Fast</option><option value="14">Normal</option><option value="18">Deep (slow)</option>
            </select>
          </label>
          <label className="lbl">Your username
            <input
              id="me" aria-label="Your username" placeholder="flips the board for you" autoComplete="off" spellCheck={false}
              value={p.me} onChange={(e) => p.onMe(e.target.value)}
            />
          </label>
        </div>
      </div>
      <div className={`status${p.status.err ? ' err' : ''}`}>{p.status.text}</div>
      {p.progress !== null && <div className="prog"><i style={{ width: `${p.progress}%` }} /></div>}
    </div>
  )
})
