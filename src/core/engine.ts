import type { EngineLine } from './types'

/** Minimal Worker-like surface so tests can supply a Node-based engine. */
export interface WorkerLike {
  postMessage(msg: string): void
  onmessage: ((e: { data: unknown }) => void) | null
  terminate(): void
}

export interface SearchJob {
  fen: string
  multipv: number
  /**
   * Handicap the engine to roughly this Elo (Stockfish supports 1320-3190).
   * Leave undefined for full strength, which is what analysis and hints always use.
   */
  elo?: number
  /** UCI go arguments, e.g. "depth 14" or "movetime 900" */
  go: string
  onInfo?: (lines: Record<string, EngineLine>, depth: number) => void
}

export interface SearchResult {
  aborted: boolean
  best?: string
  lines: EngineLine[]
}

interface ActiveJob extends SearchJob {
  resolve: (r: SearchResult) => void
  lines: Record<string, EngineLine>
  aborted?: boolean
}

type State = 'idle' | 'searching'

/**
 * One UCI engine behind a one-job-at-a-time queue. Submitting a new job
 * replaces any waiting one and stops the running search first.
 */
export class UciEngine {
  readonly ready: Promise<void>
  private w: WorkerLike | null = null
  private isReady = false
  private state: State = 'idle'
  private stopping = false
  private job: ActiveJob | null = null
  private pending: ActiveJob | null = null
  private bootCb: ((m: string) => void) | null = null

  constructor(
    private readonly label: string,
    private readonly makeWorker: () => WorkerLike,
  ) {
    this.ready = this.boot()
    this.ready.catch(() => {})
  }

  private waitFor(pred: (m: string) => boolean, ms: number): Promise<void> {
    return new Promise((res, rej) => {
      const t = setTimeout(() => {
        this.bootCb = null
        rej(new Error('timeout'))
      }, ms)
      this.bootCb = (m) => {
        if (pred(m)) {
          clearTimeout(t)
          this.bootCb = null
          res()
        }
      }
    })
  }

  private async boot(): Promise<void> {
    try {
      const w = this.makeWorker()
      this.w = w
      w.onmessage = (e) => {
        if (typeof e.data !== 'string') return
        if (this.bootCb) this.bootCb(e.data)
        else this.onLine(e.data)
      }
      w.postMessage('uci')
      await this.waitFor((m) => m === 'uciok', 25000)
      w.postMessage('setoption name Hash value 32')
      w.postMessage('isready')
      await this.waitFor((m) => m === 'readyok', 25000)
    } catch {
      this.w?.terminate()
      this.w = null
      throw new Error(`${this.label} could not start in this view.`)
    }
    this.isReady = true
    this.pump()
  }

  private stopCurrent() {
    if (this.state === 'searching' && !this.stopping && this.w) {
      this.stopping = true
      if (this.job) this.job.aborted = true
      this.w.postMessage('stop')
    }
  }

  private pump() {
    if (!this.isReady || !this.w) return
    if (this.state === 'searching') {
      if (this.pending) this.stopCurrent()
      return
    }
    const j = this.pending
    if (!j) return
    this.pending = null
    this.job = j
    this.state = 'searching'
    this.stopping = false
    this.w.postMessage('setoption name Skill Level value 20')
    if (j.elo !== undefined) {
      this.w.postMessage('setoption name UCI_LimitStrength value true')
      this.w.postMessage(`setoption name UCI_Elo value ${Math.round(j.elo)}`)
    } else {
      this.w.postMessage('setoption name UCI_LimitStrength value false')
    }
    this.w.postMessage(`setoption name MultiPV value ${j.multipv}`)
    this.w.postMessage(`position fen ${j.fen}`)
    this.w.postMessage(`go ${j.go}`)
  }

  private onLine(m: string) {
    const j = this.job
    if (m.startsWith('info')) {
      if (!j || /lowerbound|upperbound/.test(m)) return
      const k = m.match(/ depth (\d+).* multipv (\d+) score (cp|mate) (-?\d+).* pv (\S+)/)
      if (k) {
        j.lines[k[2]!] = { mv: k[5]!, t: k[3] as 'cp' | 'mate', v: +k[4]!, d: +k[1]! }
        j.onInfo?.(j.lines, +k[1]!)
      }
    } else if (m.startsWith('bestmove')) {
      this.state = 'idle'
      this.job = null
      if (j) {
        j.resolve({
          aborted: !!j.aborted,
          best: m.split(/\s+/)[1],
          lines: Object.keys(j.lines).sort().map((x) => j.lines[x]!),
        })
      }
      this.pump()
    }
  }

  search(job: SearchJob): Promise<SearchResult> {
    return new Promise((resolve) => {
      this.pending?.resolve({ aborted: true, lines: [] })
      this.pending = { ...job, resolve, lines: {} }
      this.pump()
    })
  }

  cancel() {
    if (this.pending) {
      this.pending.resolve({ aborted: true, lines: [] })
      this.pending = null
    }
    this.stopCurrent()
  }

  dispose() {
    this.cancel()
    this.w?.terminate()
    this.w = null
  }
}
