export function EvalBar({ pct }: { pct: number | null }) {
  return (
    <div className={`bar${pct === null ? ' off' : ''}`} aria-hidden="true">
      <div className="w" style={{ height: `${pct ?? 50}%` }} />
    </div>
  )
}
