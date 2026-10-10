/**
 * List a player's recent finished games from chess.com and Lichess so the user can pick one to
 * analyse instead of pasting a PGN. Pure module: no React, no storage, no globals other than the
 * (injectable) fetch.
 *
 * Privacy / scope rules this module keeps:
 *  - Only two hosts are ever contacted: api.chess.com and lichess.org (public, CORS-enabled, no auth).
 *  - The username appears only in the request URL the APIs require. It is never put in an error
 *    message, a header or a log line.
 *  - Only finished games are returned (ongoing / aborted Lichess games are dropped) because this is
 *    an analysis tool, not something to use on a game that is still being played.
 */

export type ImportSource = 'chesscom' | 'lichess'

export interface ImportedGame {
  id: string
  source: ImportSource
  url?: string
  white: string
  black: string
  whiteRating?: number
  blackRating?: number
  result: '1-0' | '0-1' | '1/2-1/2' | '*'
  /** Which side the searched username played. */
  color: 'white' | 'black'
  /** From the searched username's point of view. */
  outcome: 'win' | 'loss' | 'draw' | 'unknown'
  /** bullet / blitz / rapid / classical / daily */
  timeClass?: string
  /** Milliseconds since the epoch. */
  endedAt: number
  /** Full PGN text, ready to paste into the analyzer. */
  pgn: string
}

export type ImportErrorKind = 'invalid-name' | 'not-found' | 'rate-limited' | 'network' | 'bad-data' | 'empty'

const DEFAULT_MESSAGES: Record<ImportErrorKind, string> = {
  'invalid-name': 'That does not look like a valid username.',
  'not-found': 'No player with that username was found.',
  'rate-limited': 'The site is asking us to slow down. Try again in a minute.',
  network: 'Could not reach the site. Check your connection and try again.',
  'bad-data': 'The site sent back something we could not read.',
  empty: 'No recent standard chess games were found for that player.',
}

export class ImportError extends Error {
  readonly kind: ImportErrorKind
  constructor(kind: ImportErrorKind, message?: string) {
    super(message ?? DEFAULT_MESSAGES[kind])
    this.name = 'ImportError'
    this.kind = kind
  }
}

type GameResult = ImportedGame['result']
type Rec = Record<string, unknown>

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100
const MAX_CHESSCOM_MONTHS = 3
const NAME_RE = /^[A-Za-z0-9_-]{2,30}$/
const LICHESS_ID_RE = /^[A-Za-z0-9]{6,12}$/
const CHESSCOM_MONTH_PATH_RE = /^\/pub\/player\/[^/]+\/games\/\d{4}\/\d{2}\/?$/

/** Profile-URL hosts we understand, and the path segment that precedes the username. */
const PROFILE_MARKER: Record<string, string> = {
  'chess.com': 'member',
  'www.chess.com': 'member',
  'lichess.org': '@',
  'www.lichess.org': '@',
}

const asRec = (v: unknown): Rec | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Rec) : null)
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

function fromProfileUrl(raw: string): string {
  let url: URL
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    return ''
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return ''
  const marker = PROFILE_MARKER[url.hostname.toLowerCase()]
  if (!marker) return ''
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts[0] !== marker || !parts[1]) return ''
  try {
    return decodeURIComponent(parts[1])
  } catch {
    return ''
  }
}

/**
 * Trim the input and accept either a bare username or a pasted profile URL
 * (https://www.chess.com/member/Name, https://lichess.org/@/Name).
 * Throws ImportError('invalid-name') for anything else.
 */
export function cleanUsername(input: string): string {
  const raw = typeof input === 'string' ? input.trim() : ''
  const name = /[/:.?#]/.test(raw) ? fromProfileUrl(raw) : raw
  if (!NAME_RE.test(name)) throw new ImportError('invalid-name')
  return name
}

// ---------------------------------------------------------------------------------------------
// Network plumbing
// ---------------------------------------------------------------------------------------------

interface Ctx {
  fetchFn: typeof fetch
  signal: AbortSignal | undefined
}

function isAbort(e: unknown, signal: AbortSignal | undefined): boolean {
  if (signal?.aborted) return true
  return typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'AbortError'
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw signal.reason ?? new DOMException('The operation was aborted.', 'AbortError')
}

function getFetch(impl: typeof fetch | undefined): typeof fetch {
  if (impl) return impl
  if (typeof globalThis.fetch !== 'function') throw new ImportError('network')
  // Bound so it also works in browsers, where an unbound fetch throws "Illegal invocation".
  return globalThis.fetch.bind(globalThis)
}

/** One GET. Maps HTTP / transport failures to ImportError; aborts are rethrown untouched. */
async function request(ctx: Ctx, url: string, headers?: Record<string, string>): Promise<string> {
  throwIfAborted(ctx.signal)
  const init: RequestInit = {}
  if (headers) init.headers = headers
  if (ctx.signal) init.signal = ctx.signal
  let res: Response
  try {
    res = await ctx.fetchFn(url, init)
  } catch (e) {
    if (isAbort(e, ctx.signal)) throw e
    throw new ImportError('network')
  }
  if (!res.ok) {
    if (res.status === 404) throw new ImportError('not-found')
    if (res.status === 429) throw new ImportError('rate-limited')
    throw new ImportError('network', `The site answered with an error (HTTP ${res.status}).`)
  }
  try {
    return await res.text()
  } catch (e) {
    if (isAbort(e, ctx.signal)) throw e
    throw new ImportError('network')
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    throw new ImportError('bad-data')
  }
}

// ---------------------------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------------------------

/** Value of a PGN header tag, or null (also null for the "?" placeholder). */
function pgnHeader(pgn: string, tag: string): string | null {
  const m = new RegExp(`\\[${tag}\\s+"([^"]*)"\\]`).exec(pgn)
  const v = m?.[1]?.trim()
  return v && v !== '?' ? v : null
}

function sideOf(user: string, white: string, black: string): 'white' | 'black' | null {
  const u = user.toLowerCase()
  if (white.toLowerCase() === u) return 'white'
  if (black.toLowerCase() === u) return 'black'
  return null
}

function outcomeFor(result: GameResult, side: 'white' | 'black' | null): ImportedGame['outcome'] {
  if (!side || result === '*') return 'unknown'
  if (result === '1/2-1/2') return 'draw'
  return (result === '1-0') === (side === 'white') ? 'win' : 'loss'
}

const newestFirst = (a: ImportedGame, b: ImportedGame) => b.endedAt - a.endedAt

function normalizeLimit(limit: number | undefined): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) return DEFAULT_LIMIT
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit)))
}

// ---------------------------------------------------------------------------------------------
// chess.com
// ---------------------------------------------------------------------------------------------

/** chess.com result codes that mean "this side lost". Anything else that is not "win" is a draw. */
const CHESSCOM_LOSS = new Set(['checkmated', 'resigned', 'timeout', 'abandoned'])

function chessComResult(pgn: string, white: string | null, black: string | null): GameResult {
  const header = pgnHeader(pgn, 'Result')
  if (header === '1-0' || header === '0-1' || header === '1/2-1/2') return header
  if (white === 'win' || (black !== null && CHESSCOM_LOSS.has(black))) return '1-0'
  if (black === 'win' || (white !== null && CHESSCOM_LOSS.has(white))) return '0-1'
  if (white === null && black === null) return '*'
  return '1/2-1/2'
}

/** Only keep links that really point at chess.com (the response is untrusted data). */
function chessComGameUrl(v: unknown): string | undefined {
  const s = str(v)
  if (!s) return undefined
  try {
    const u = new URL(s)
    if (u.protocol === 'https:' && (u.hostname === 'www.chess.com' || u.hostname === 'chess.com')) return u.href
  } catch {
    /* not a URL */
  }
  return undefined
}

function parseChessComGame(raw: unknown, user: string): ImportedGame | null {
  const g = asRec(raw)
  if (!g || g.rules !== 'chess') return null
  const pgn = str(g.pgn)
  if (!pgn) return null
  const w = asRec(g.white)
  const b = asRec(g.black)
  const white = str(w?.username) ?? pgnHeader(pgn, 'White') ?? 'Unknown'
  const black = str(b?.username) ?? pgnHeader(pgn, 'Black') ?? 'Unknown'
  const result = chessComResult(pgn, str(w?.result), str(b?.result))
  const side = sideOf(user, white, black)
  const endedAt = (num(g.end_time) ?? 0) * 1000
  const url = chessComGameUrl(g.url)
  const gameNo = url ? /\/(\d+)\/?$/.exec(new URL(url).pathname)?.[1] : undefined
  const game: ImportedGame = {
    id: `chesscom:${gameNo ?? `${endedAt}-${white}-${black}`}`,
    source: 'chesscom',
    white,
    black,
    result,
    color: side ?? 'white',
    outcome: outcomeFor(result, side),
    endedAt,
    pgn,
  }
  if (url) game.url = url
  const wr = num(w?.rating)
  const br = num(b?.rating)
  if (wr !== undefined) game.whiteRating = wr
  if (br !== undefined) game.blackRating = br
  const tc = str(g.time_class)
  if (tc) game.timeClass = tc.toLowerCase()
  return game
}

/** Month-archive links come from the server, so check them before following them. */
function isChessComMonthUrl(v: unknown): v is string {
  if (typeof v !== 'string') return false
  try {
    const u = new URL(v)
    return u.protocol === 'https:' && u.hostname === 'api.chess.com' && CHESSCOM_MONTH_PATH_RE.test(u.pathname)
  } catch {
    return false
  }
}

async function fromChessCom(user: string, limit: number, ctx: Ctx): Promise<ImportedGame[]> {
  const index = asRec(
    parseJson(await request(ctx, `https://api.chess.com/pub/player/${encodeURIComponent(user.toLowerCase())}/games/archives`)),
  )
  if (!index || !Array.isArray(index.archives)) throw new ImportError('bad-data')
  // The list is oldest first: take the newest few and walk backwards, strictly one request at a time.
  const months = (index.archives as unknown[]).slice(-MAX_CHESSCOM_MONTHS).reverse()
  const out: ImportedGame[] = []
  for (const monthUrl of months) {
    if (!isChessComMonthUrl(monthUrl)) throw new ImportError('bad-data')
    const month = asRec(parseJson(await request(ctx, monthUrl)))
    if (!month || !Array.isArray(month.games)) throw new ImportError('bad-data')
    const found: ImportedGame[] = []
    for (const raw of month.games as unknown[]) {
      const game = parseChessComGame(raw, user)
      if (game) found.push(game)
    }
    out.push(...found.sort(newestFirst))
    if (out.length >= limit) break
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// Lichess
// ---------------------------------------------------------------------------------------------

/** Games that are not finished (or never started) are not useful to analyse. */
const LICHESS_UNFINISHED = new Set(['created', 'started', 'aborted', 'noStart'])
const LICHESS_DRAWISH = new Set(['draw', 'stalemate', 'outoftime'])

function lichessTimeClass(speed: unknown): string | undefined {
  const s = str(speed)?.toLowerCase()
  if (!s) return undefined
  if (s === 'correspondence') return 'daily'
  if (s === 'ultrabullet') return 'bullet'
  return s
}

function lichessName(player: Rec | null, pgn: string, tag: 'White' | 'Black'): string {
  const name = str(asRec(player?.user)?.name)
  if (name) return name
  const ai = num(player?.aiLevel)
  if (ai !== undefined) return `Stockfish level ${ai}`
  return pgnHeader(pgn, tag) ?? 'Anonymous'
}

function lichessResult(g: Rec): GameResult {
  if (g.winner === 'white') return '1-0'
  if (g.winner === 'black') return '0-1'
  return typeof g.status === 'string' && LICHESS_DRAWISH.has(g.status) ? '1/2-1/2' : '*'
}

function parseLichessGame(g: Rec, id: string, pgn: string, user: string): ImportedGame {
  const players = asRec(g.players)
  const w = asRec(players?.white)
  const b = asRec(players?.black)
  const white = lichessName(w, pgn, 'White')
  const black = lichessName(b, pgn, 'Black')
  const result = lichessResult(g)
  const side = sideOf(user, white, black)
  const game: ImportedGame = {
    id: `lichess:${id}`,
    source: 'lichess',
    url: `https://lichess.org/${id}`,
    white,
    black,
    result,
    color: side ?? 'white',
    outcome: outcomeFor(result, side),
    endedAt: num(g.lastMoveAt) ?? num(g.createdAt) ?? 0,
    pgn,
  }
  const wr = num(w?.rating)
  const br = num(b?.rating)
  if (wr !== undefined) game.whiteRating = wr
  if (br !== undefined) game.blackRating = br
  const tc = lichessTimeClass(g.speed)
  if (tc) game.timeClass = tc
  return game
}

async function fromLichess(user: string, limit: number, ctx: Ctx): Promise<ImportedGame[]> {
  const url = `https://lichess.org/api/games/user/${encodeURIComponent(user)}?max=${limit}&pgnInJson=true&clocks=false&opening=false`
  const body = await request(ctx, url, { Accept: 'application/x-ndjson' })
  const lines = body
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '')
  const out: ImportedGame[] = []
  let bad = 0
  for (const line of lines) {
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      bad++
      continue
    }
    const g = asRec(parsed)
    const id = g && typeof g.id === 'string' && LICHESS_ID_RE.test(g.id) ? g.id : null
    if (!g || !id) {
      bad++
      continue
    }
    if (g.variant !== 'standard') continue
    if (typeof g.status === 'string' && LICHESS_UNFINISHED.has(g.status)) continue
    const pgn = str(g.pgn)
    if (!pgn) {
      bad++
      continue
    }
    out.push(parseLichessGame(g, id, pgn, user))
  }
  if (lines.length > 0 && bad === lines.length) throw new ImportError('bad-data')
  return out
}

// ---------------------------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------------------------

/**
 * The player's most recent finished standard-chess games, newest first.
 * `username` may be a bare name or a pasted profile URL. Network goes through `opts.fetchImpl`
 * (default: the global fetch). An aborted `opts.signal` rejects with the original AbortError.
 */
export async function fetchRecentGames(
  source: ImportSource,
  username: string,
  opts: { limit?: number; fetchImpl?: typeof fetch; signal?: AbortSignal } = {},
): Promise<ImportedGame[]> {
  const user = cleanUsername(username)
  const limit = normalizeLimit(opts.limit)
  const ctx: Ctx = { fetchFn: getFetch(opts.fetchImpl), signal: opts.signal }
  let games: ImportedGame[]
  switch (source) {
    case 'chesscom':
      games = await fromChessCom(user, limit, ctx)
      break
    case 'lichess':
      games = await fromLichess(user, limit, ctx)
      break
    default:
      throw new ImportError('bad-data', 'Unknown game source.')
  }
  if (games.length === 0) throw new ImportError('empty')
  return games.sort(newestFirst).slice(0, limit)
}
