import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { PieceView } from '../core/pieces'
import { FILES } from '../core/notation'
import type { Square } from '../core/types'

const GLYPH: Record<string, string> = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }

export interface ArrowSpec {
  from: string
  to: string
  color: string
  width: number
}

export interface BoardProps {
  pieces: PieceView[]
  flipped: boolean
  last?: [string, string] | null
  selected?: string | null
  dots?: { sq: string; cap: boolean }[]
  arrows?: ArrowSpec[]
  badge?: { sq: string; color: string; sym: string } | null
  tag?: { sq: string; text: string } | null
  /** user-drawn marks reset whenever this key changes */
  markKey: string
  /** may the piece on this square be picked up? */
  canGrab: (sq: Square) => boolean
  onGrab: (sq: Square) => void
  onSquareClick: (sq: Square) => void
  onDrop: (from: Square, to: Square) => void
  interactive: boolean
  className?: string
  overlay?: ReactNode
}

const xy = (sq: string, flipped: boolean): [number, number] => {
  let f = FILES.indexOf(sq[0]!)
  let r = 8 - Number(sq[1])
  if (flipped) {
    f = 7 - f
    r = 7 - r
  }
  return [f, r]
}

function arrowShape(from: string, to: string, w: number, flipped: boolean) {
  const [fx, fy] = xy(from, flipped)
  const [tx, ty] = xy(to, flipped)
  const x1 = fx + 0.5, y1 = fy + 0.5, x2 = tx + 0.5, y2 = ty + 0.5
  const dx = x2 - x1, dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len, uy = dy / len
  const head = 0.4
  const sx = x1 + ux * 0.3, sy = y1 + uy * 0.3
  const ex = x2 - ux * head * 0.9, ey = y2 - uy * head * 0.9
  const px = -uy, py = ux
  const pts = [
    [x2, y2],
    [ex + px * (w + 0.1), ey + py * (w + 0.1)],
    [ex - px * (w + 0.1), ey - py * (w + 0.1)],
  ].map((p) => p.join(',')).join(' ')
  return { sx, sy, ex, ey, pts }
}

function Arrow({ a, flipped }: { a: ArrowSpec; flipped: boolean }) {
  const s = arrowShape(a.from, a.to, a.width, flipped)
  return (
    <g opacity=".88">
      <line x1={s.sx} y1={s.sy} x2={s.ex} y2={s.ey} style={{ stroke: a.color }} strokeWidth={a.width * 1.2} strokeLinecap="round" />
      <polygon points={s.pts} style={{ fill: a.color }} />
    </g>
  )
}

const cellStyle = (sq: string, flipped: boolean) => {
  const [x, y] = xy(sq, flipped)
  return { transform: `translate(${x * 100}%,${y * 100}%)` }
}

interface DragState {
  sq: Square
  x: number
  y: number
  active: boolean
  id: number
}

export function Board(p: BoardProps) {
  const boardRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const suppressClick = useRef(false)
  const props = useRef(p)
  props.current = p

  // user-drawn arrows and square marks (right mouse button), keyed "from>to"
  const [marks, setMarks] = useState<Map<string, [string, string]>>(new Map())
  const markFrom = useRef<string | null>(null)
  useEffect(() => setMarks(new Map()), [p.markKey])

  const sqAt = (e: { clientX: number; clientY: number }): Square => {
    const r = boardRef.current!.getBoundingClientRect()
    let f = Math.floor(((e.clientX - r.left) / r.width) * 8)
    let rk = Math.floor(((e.clientY - r.top) / r.height) * 8)
    f = Math.max(0, Math.min(7, f))
    rk = Math.max(0, Math.min(7, rk))
    if (props.current.flipped) {
      f = 7 - f
      rk = 7 - rk
    }
    return `${FILES[f]}${8 - rk}` as Square
  }

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = dragRef.current
      if (!d || e.pointerId !== d.id) return
      if (!d.active && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) return
      if (!d.active) {
        d.active = true
        props.current.onGrab(d.sq)
      }
      setDrag({ ...d, x: e.clientX, y: e.clientY })
    }
    const end = (cancel: boolean) => (e: PointerEvent) => {
      const d = dragRef.current
      if (!d || e.pointerId !== d.id) return
      dragRef.current = null
      setDrag(null)
      if (!d.active) return
      suppressClick.current = true
      setTimeout(() => (suppressClick.current = false), 0)
      const r = boardRef.current?.getBoundingClientRect()
      const inside = !!r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
      const to = sqAt(e)
      if (!cancel && inside && to !== d.sq) props.current.onDrop(d.sq, to)
    }
    const up = end(false)
    const cancel = end(true)
    const mouseUp = (e: MouseEvent) => {
      if (e.button !== 2 || !markFrom.current) return
      const from = markFrom.current
      markFrom.current = null
      const to = sqAt(e)
      const key = `${from}>${to}`
      setMarks((cur) => {
        const n = new Map(cur)
        if (n.has(key)) n.delete(key)
        else n.set(key, [from, to])
        return n
      })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('mouseup', mouseUp)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('mouseup', mouseUp)
    }
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || !p.interactive || e.isPrimary === false || dragRef.current) return
    const sq = sqAt(e)
    if (!p.canGrab(sq)) return
    dragRef.current = { sq, x: e.clientX, y: e.clientY, active: false, id: e.pointerId }
  }
  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button === 2) {
      e.preventDefault()
      markFrom.current = sqAt(e)
    } else if (e.button === 0 && marks.size) setMarks(new Map())
  }
  const onClick = (e: React.MouseEvent) => {
    if (suppressClick.current || !p.interactive) return
    p.onSquareClick(sqAt(e))
  }

  const squares = useMemo(
    () =>
      Array.from({ length: 64 }, (_, i) => {
        const r = Math.floor(i / 8), f = i % 8
        return (
          <div key={i} className={`sq ${(r + f) % 2 === 0 ? 'l' : 'd'}`}>
            {f === 0 && <span className="coord r">{p.flipped ? r + 1 : 8 - r}</span>}
            {r === 7 && <span className="coord f">{p.flipped ? FILES[7 - f] : FILES[f]}</span>}
          </div>
        )
      }),
    [p.flipped],
  )

  const dragging = drag?.active ? drag : null
  const rectW = boardRef.current ? boardRef.current.getBoundingClientRect() : null

  return (
    <div
      ref={boardRef}
      className={`board${p.className ? ' ' + p.className : ''}`}
      role="application"
      aria-label="Chess board"
      onPointerDown={onPointerDown}
      onMouseDown={onMouseDown}
      onClick={onClick}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="sqs">{squares}</div>
      <div className="layer">
        {p.last?.map((sq) => <div key={'l' + sq} className="cell hlsq" style={cellStyle(sq, p.flipped)} />)}
        {p.selected && <div className="cell selsq" style={cellStyle(p.selected, p.flipped)} />}
      </div>
      <div className="layer">
        {[...marks.values()].filter(([a, b]) => a === b).map(([a]) => (
          <div key={'m' + a} className="cell uh" style={cellStyle(a, p.flipped)} />
        ))}
      </div>
      <div className="layer">
        {p.pieces.map((pc) => {
          const isDrag = dragging && dragging.sq === pc.sq && pc.fx !== 'out'
          let style = cellStyle(pc.sq, p.flipped)
          if (isDrag && rectW) {
            const z = rectW.width / 8
            style = { transform: `translate(${dragging.x - rectW.left - z / 2}px,${dragging.y - rectW.top - z / 2}px) scale(1.12)` }
          }
          return (
            <div
              key={pc.id}
              className={`pc ${pc.color}${pc.fx ? ' gone' : ''}${isDrag ? ' drag' : ''}`}
              style={style}
            >
              {GLYPH[pc.type]}
            </div>
          )
        })}
      </div>
      <div className="layer">
        {p.dots?.map((d) => (
          <div key={'d' + d.sq} className={`cell legal${d.cap ? ' cap' : ''}`} style={cellStyle(d.sq, p.flipped)} />
        ))}
      </div>
      <svg className="arrows" viewBox="0 0 8 8" aria-hidden="true">
        {p.arrows?.map((a, i) => <Arrow key={i} a={a} flipped={p.flipped} />)}
      </svg>
      <svg className="arrows" viewBox="0 0 8 8" aria-hidden="true" style={{ zIndex: 4 }}>
        {[...marks.values()].filter(([a, b]) => a !== b).map(([a, b]) => (
          <Arrow key={a + b} a={{ from: a, to: b, color: 'rgb(235,97,80)', width: 0.11 }} flipped={p.flipped} />
        ))}
      </svg>
      <div className="layer">
        {p.badge && (
          <div className="badge" style={cellStyle(p.badge.sq, p.flipped)}>
            <b style={{ background: p.badge.color }}>{p.badge.sym}</b>
          </div>
        )}
      </div>
      <div className="layer">
        {p.tag && (() => {
          const [x, y] = xy(p.tag.sq, p.flipped)
          return <div className="tag" style={{ left: `${x * 12.5 + 7.5}%`, top: `${y * 12.5 - 0.5}%` }}>{p.tag.text}</div>
        })()}
      </div>
      {p.overlay}
    </div>
  )
}
