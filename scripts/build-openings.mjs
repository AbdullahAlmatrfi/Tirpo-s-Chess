#!/usr/bin/env node
// One-off build script: turns the lichess chess-openings dataset into src/data/openings.json.
//
//   node scripts/build-openings.mjs            download a.tsv..e.tsv from GitHub
//   node scripts/build-openings.mjs <dir>      read a.tsv..e.tsv from a local directory
//
// Data: lichess-org/chess-openings (CC0 1.0), https://github.com/lichess-org/chess-openings
// Each TSV row is "eco <TAB> name <TAB> pgn" (some versions have a header row, which is skipped).
// Every line is replayed with chess.js and the position it ends in is keyed by the first three
// FEN fields (placement, side to move, castling), so transpositions find the same entry. When
// several lines reach one position, the one with the longest move list wins (first one on a tie).
//
// Output shape (compact, indexes into the two tables):
//   { "eco": ["A00", ...], "names": ["Amar Opening", ...], "pos": { "<fenKey>": [ecoIndex, nameIndex] } }
import { readFile, writeFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { Chess } from 'chess.js'

const BASE = 'https://raw.githubusercontent.com/lichess-org/chess-openings/master/'
const FILES = ['a', 'b', 'c', 'd', 'e']
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/data/openings.json')

const fenKey = (fen) => fen.split(' ').slice(0, 3).join(' ')

async function readTsv(dir, letter) {
  if (dir) return readFile(path.join(dir, `${letter}.tsv`), 'utf8')
  const res = await fetch(`${BASE}${letter}.tsv`)
  if (!res.ok) throw new Error(`${letter}.tsv: HTTP ${res.status}`)
  return res.text()
}

/** SAN tokens of a PGN movetext such as "1. e4 e5 2. Nf3". */
const sanTokens = (pgn) =>
  pgn
    .replace(/\d+\s*\.(\.\.)?/g, ' ')
    .split(/\s+/)
    .filter(Boolean)

const dir = process.argv[2] ? path.resolve(process.argv[2]) : null
const best = new Map() // fenKey -> { eco, name, len }
let rows = 0

for (const letter of FILES) {
  const text = await readTsv(dir, letter)
  for (const line of text.split(/\r?\n/)) {
    const cols = line.split('\t')
    if (cols.length < 3 || cols[0] === 'eco') continue
    const [eco, name, pgn] = cols.map((c) => c.trim())
    if (!/^[A-E]\d\d$/.test(eco) || !name) throw new Error(`Bad row: ${line}`)
    const chess = new Chess()
    const moves = sanTokens(pgn)
    for (const san of moves) chess.move(san) // throws on an illegal move, which fails the build
    rows++
    const key = fenKey(chess.fen())
    const prev = best.get(key)
    if (!prev || moves.length > prev.len) best.set(key, { eco, name, len: moves.length })
  }
}

const ecoList = []
const nameList = []
const ecoIdx = new Map()
const nameIdx = new Map()
const idx = (list, map, value) => {
  let i = map.get(value)
  if (i === undefined) {
    i = list.length
    list.push(value)
    map.set(value, i)
  }
  return i
}

const pos = {}
for (const key of [...best.keys()].sort()) {
  const { eco, name } = best.get(key)
  pos[key] = [idx(ecoList, ecoIdx, eco), idx(nameList, nameIdx, name)]
}

const json = JSON.stringify({ eco: ecoList, names: nameList, pos })
await writeFile(OUT, json + '\n')
const gz = gzipSync(json).length
console.log(`rows: ${rows}  positions: ${best.size}  names: ${nameList.length}  eco codes: ${ecoList.length}`)
console.log(`wrote ${path.relative(process.cwd(), OUT)}  raw ${(json.length / 1024).toFixed(1)} KB  gzip ${(gz / 1024).toFixed(1)} KB`)
