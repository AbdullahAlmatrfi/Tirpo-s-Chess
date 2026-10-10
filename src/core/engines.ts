import { UciEngine, type WorkerLike } from './engine'
import type { EngineSpec } from './types'

export const ENGINES: EngineSpec[] = [
  { key: 'sf19', label: 'Stockfish 19 (lite)', file: 'sf' },
  { key: 'sf18', label: 'Stockfish 18 (lite)', file: 'sf18' },
  { key: 'sf17', label: 'Stockfish 17.1 (lite)', file: 'sf17' },
]

export const DEFAULT_ENGINE = 'sf19'
export const engineLabel = (key: string) => ENGINES.find((e) => e.key === key)?.label ?? key

/** Browser worker: the wasm location travels in the URL hash (stockfish.js convention). */
function browserWorker(file: string): WorkerLike {
  const base = new URL(import.meta.env.BASE_URL, location.href)
  const js = new URL(`engines/${file}.js`, base).href
  const wasm = new URL(`engines/${file}.wasm`, base).href
  return new Worker(`${js}#${encodeURIComponent(wasm)}`) as unknown as WorkerLike
}

const pool = new Map<string, UciEngine>()

export function getEngine(key: string): UciEngine {
  let e = pool.get(key)
  if (!e) {
    const spec = ENGINES.find((s) => s.key === key) ?? ENGINES[0]!
    e = new UciEngine(spec.label, () => browserWorker(spec.file))
    pool.set(key, e)
  }
  return e
}

export function cancelAllEngines() {
  pool.forEach((e) => e.cancel())
}
