import { useCallback, useEffect, useRef, useState } from 'react'
import { applyBack, applyForward, piecesFromFen, placementOf, type PieceView } from '../core/pieces'
import type { Move } from '../core/types'

/** Piece list with stable ids so moves animate instead of redrawing. */
export function usePieces(startFen: string) {
  const idRef = useRef(0)
  const nid = useCallback(() => ++idRef.current, [])
  const [pieces, setPieces] = useState<PieceView[]>(() => piecesFromFen(startFen, nid))

  /** Show a position. No-op when it is already on the board (keeps pieces, ids and drags alive). */
  const setFen = useCallback(
    (fen: string) =>
      setPieces((cur) => (placementOf(cur) === fen.split(' ')[0] ? cur.filter((p) => p.fx !== 'out') : piecesFromFen(fen, nid))),
    [nid],
  )
  const forward = useCallback((m: Move) => setPieces((cur) => applyForward(cur, m)), [])
  const back = useCallback((m: Move) => setPieces((cur) => applyBack(cur, m, nid)), [nid])

  // finish animations: fade-in pieces appear next frame, captured pieces are removed after the fade
  useEffect(() => {
    let raf = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    if (pieces.some((p) => p.fx === 'in')) {
      raf = requestAnimationFrame(() => {
        raf = requestAnimationFrame(() =>
          setPieces((cur) => cur.map((p) => (p.fx === 'in' ? { ...p, fx: undefined } : p))),
        )
      })
    }
    if (pieces.some((p) => p.fx === 'out')) {
      timer = setTimeout(() => setPieces((cur) => cur.filter((p) => p.fx !== 'out')), 280)
    }
    return () => {
      cancelAnimationFrame(raf)
      if (timer) clearTimeout(timer)
    }
  }, [pieces])

  return { pieces, setFen, forward, back }
}
