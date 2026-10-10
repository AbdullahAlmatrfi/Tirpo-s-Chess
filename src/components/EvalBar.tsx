export function EvalBar({ pct, flipped = false }: { pct: number | null; flipped?: boolean }) {
  return (
    <div className={`bar${pct === null ? ' off' : ''}${flipped ? ' flip' : ''}`} aria-hidden="true">
      <div className="w" style={{ height: `${pct ?? 50}%` }} />
    </div>
  )
}
