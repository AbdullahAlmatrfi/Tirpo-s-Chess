import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { WorkerLike } from '../src/core/engine'

// The engine scripts are CommonJS-style; the project is ESM, so run them from a copy
// whose nearest package.json says "commonjs".
const DIR = resolve('tests/.engines')
function prepare() {
  if (existsSync(resolve(DIR, 'package.json'))) return
  mkdirSync(DIR, { recursive: true })
  cpSync(resolve('public/engines'), DIR, { recursive: true })
  writeFileSync(resolve(DIR, 'package.json'), '{"type":"commonjs"}')
}

/** A real Stockfish (lite, single-threaded) driven over stdin/stdout, shaped like a Web Worker. */
export function nodeWorker(file = 'sf'): WorkerLike & { proc: ChildProcessWithoutNullStreams } {
  prepare()
  const proc = spawn('node', [resolve(DIR, `${file}.js`)])
  let buf = ''
  const w: WorkerLike & { proc: ChildProcessWithoutNullStreams } = {
    proc,
    onmessage: null,
    postMessage: (m) => void proc.stdin.write(m + '\n'),
    terminate: () => void proc.kill(),
  }
  proc.stdout.on('data', (d: Buffer) => {
    buf += d.toString()
    const parts = buf.split('\n')
    buf = parts.pop() ?? ''
    for (const line of parts) w.onmessage?.({ data: line.trim() })
  })
  return w
}
