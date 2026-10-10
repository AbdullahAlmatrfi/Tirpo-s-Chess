import { afterEach, describe, expect, it, vi } from 'vitest'
import { Chess } from 'chess.js'
import { ImportError, cleanUsername, fetchRecentGames, type ImportErrorKind, type ImportSource } from '../src/core/importGames'

// ---------------------------------------------------------------------------------------------
// Fixtures and a fake fetch (no real network is ever touched)
// ---------------------------------------------------------------------------------------------

const ME = 'MagnusFan7'
const RIVAL = 'rival_22'

const SCHOLAR = '1. e4 {[%clk 0:09:58.9]} e5 {[%clk 0:09:57.1]} 2. Bc4 {[%clk 0:09:50]} Nc6 {[%clk 0:09:49]} 3. Qh5 {[%clk 0:09:45]} Nf6 {[%clk 0:09:40]} 4. Qxf7# {[%clk 0:09:30]} 1-0'
const FOOLS = '1. f3 {[%clk 0:09:58]} e5 {[%clk 0:09:57]} 2. g4 {[%clk 0:09:50]} Qh4# {[%clk 0:09:49]} 0-1'
const AGREED = '1. d4 d5 2. c4 e6 3. Nc3 Nf6 1/2-1/2'

function movetext(result: string): string {
  return result === '0-1' ? FOOLS : result === '1-0' ? SCHOLAR : AGREED
}

function chessComPgn(white: string, black: string, header: string | null): string {
  const tags = [
    '[Event "Live Chess"]',
    '[Site "Chess.com"]',
    '[Date "2024.03.05"]',
    `[White "${white}"]`,
    `[Black "${black}"]`,
    ...(header ? [`[Result "${header}"]`] : []),
    '[TimeControl "600"]',
    '[Termination "Game over"]',
  ]
  return `${tags.join('\n')}\n\n${movetext(header ?? '1-0')}`
}

interface CcOpts {
  white?: string
  black?: string
  whiteRating?: number
  blackRating?: number
  whiteResult?: string
  blackResult?: string
  header?: string | null
  end?: number
  rules?: string
  timeClass?: string
  no?: number
  pgn?: string | null
}

function ccGame(o: CcOpts = {}): Record<string, unknown> {
  const white = o.white ?? ME
  const black = o.black ?? RIVAL
  const header = o.header === undefined ? '1-0' : o.header
  const no = o.no ?? 100000000 + (o.end ?? 0)
  const game: Record<string, unknown> = {
    url: `https://www.chess.com/game/live/${no}`,
    time_class: o.timeClass ?? 'rapid',
    rules: o.rules ?? 'chess',
    end_time: o.end ?? 1711900000,
    white: { username: white, rating: o.whiteRating ?? 1500, result: o.whiteResult ?? 'win' },
    black: { username: black, rating: o.blackRating ?? 1480, result: o.blackResult ?? 'checkmated' },
  }
  if (o.pgn !== null) game.pgn = o.pgn ?? chessComPgn(white, black, header)
  return game
}

const lc = ME.toLowerCase()
const ARCHIVES = `https://api.chess.com/pub/player/${lc}/games/archives`
const MONTH = (ym: string) => `https://api.chess.com/pub/player/${lc}/games/${ym}`
const monthList = (...yms: string[]) => ({ archives: yms.map(MONTH) })

/** n games ending at base+1..base+n seconds, oldest first (the order chess.com sends them). */
function ccMonth(n: number, base: number, o: CcOpts = {}): { games: Record<string, unknown>[] } {
  return { games: Array.from({ length: n }, (_, i) => ccGame({ ...o, end: base + i + 1 })) }
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const text = (body: string, status = 200) => new Response(body, { status })

interface Call {
  url: string
  init: RequestInit | undefined
  start: number
  end: number
}

function fakeFetch(routes: Record<string, () => Response | Promise<Response>>, delayMs = 0) {
  const calls: Call[] = []
  const unexpected: string[] = []
  let inFlight = 0
  let maxInFlight = 0
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const call: Call = { url, init, start: performance.now(), end: 0 }
    calls.push(call)
    inFlight++
    maxInFlight = Math.max(maxInFlight, inFlight)
    try {
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs))
      const route = routes[url]
      if (!route) {
        unexpected.push(url)
        throw new Error(`unexpected request: ${url}`)
      }
      return await route()
    } finally {
      inFlight--
      call.end = performance.now()
    }
  }) as typeof fetch
  return { impl, calls, unexpected, maxInFlight: () => maxInFlight }
}

async function kindOf(p: Promise<unknown>): Promise<ImportErrorKind> {
  try {
    await p
  } catch (e) {
    if (e instanceof ImportError) return e.kind
    throw e
  }
  throw new Error('expected the promise to reject with an ImportError')
}

const abortError = () => new DOMException('The operation was aborted.', 'AbortError')

afterEach(() => {
  vi.unstubAllGlobals()
})

// ---------------------------------------------------------------------------------------------
// cleanUsername
// ---------------------------------------------------------------------------------------------

describe('cleanUsername', () => {
  it('trims a plain username and keeps its case', () => {
    expect(cleanUsername('  MagnusFan7  ')).toBe('MagnusFan7')
    expect(cleanUsername('a_b-c9')).toBe('a_b-c9')
  })

  it.each([
    ['https://www.chess.com/member/MagnusFan7', 'MagnusFan7'],
    ['https://www.chess.com/member/MagnusFan7/', 'MagnusFan7'],
    ['https://chess.com/member/MagnusFan7?tab=games#top', 'MagnusFan7'],
    ['  http://www.chess.com/member/MagnusFan7  ', 'MagnusFan7'],
    ['www.chess.com/member/MagnusFan7', 'MagnusFan7'],
    ['https://lichess.org/@/DrNykterstein', 'DrNykterstein'],
    ['https://lichess.org/@/DrNykterstein/all', 'DrNykterstein'],
    ['https://www.lichess.org/@/Some_User-1?x=1', 'Some_User-1'],
    ['lichess.org/@/DrNykterstein', 'DrNykterstein'],
  ])('accepts the pasted profile URL %s', (input, expected) => {
    expect(cleanUsername(input)).toBe(expected)
  })

  it.each([
    [''],
    ['   '],
    ['a'],
    ['x'.repeat(31)],
    ['has space'],
    ['dot.name'],
    ['semi;colon'],
    ['../etc/passwd'],
    ['name/with/slash'],
    ['ünïcode'],
    ['https://www.chess.com/'],
    ['https://www.chess.com/member/'],
    ['https://www.chess.com/play/online'],
    ['https://lichess.org/tv'],
    ['https://lichess.org/@/'],
    ['https://example.com/member/MagnusFan7'],
    ['https://evil.com/lichess.org/@/MagnusFan7'],
    ['https://www.chess.com.evil.com/member/MagnusFan7'],
    ['javascript:alert(1)'],
    ['ftp://www.chess.com/member/MagnusFan7'],
    ['https://www.chess.com/member/bad%20name'],
    ['https://www.chess.com/member/%E0%A4%A'],
  ])('rejects %j as invalid-name', (input) => {
    let err: unknown
    try {
      cleanUsername(input)
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(ImportError)
    expect((err as ImportError).kind).toBe('invalid-name')
  })

  it('accepts the 2 and 30 character limits', () => {
    expect(cleanUsername('ab')).toBe('ab')
    expect(cleanUsername('y'.repeat(30))).toBe('y'.repeat(30))
  })

  it('does not echo the input in the error message', () => {
    try {
      cleanUsername('secret name')
    } catch (e) {
      expect((e as Error).message).not.toContain('secret')
    }
  })
})

describe('ImportError', () => {
  it('is an Error with a kind, a name and a human message', () => {
    const e = new ImportError('not-found')
    expect(e).toBeInstanceOf(Error)
    expect(e.kind).toBe('not-found')
    expect(e.name).toBe('ImportError')
    expect(e.message.length).toBeGreaterThan(5)
    expect(new ImportError('empty', 'custom').message).toBe('custom')
  })
})

// ---------------------------------------------------------------------------------------------
// chess.com
// ---------------------------------------------------------------------------------------------

describe('chess.com', () => {
  it('lists games across two months, newest first, walking back one month at a time', async () => {
    const f = fakeFetch({
      [ARCHIVES]: () => json(monthList('2024/01', '2024/02', '2024/03')),
      [MONTH('2024/03')]: () => json(ccMonth(2, 1711900000)),
      [MONTH('2024/02')]: () => json(ccMonth(4, 1709300000)),
    })
    const games = await fetchRecentGames('chesscom', ME, { limit: 5, fetchImpl: f.impl })
    expect(f.calls.map((c) => c.url)).toEqual([ARCHIVES, MONTH('2024/03'), MONTH('2024/02')])
    expect(games.map((g) => g.endedAt)).toEqual([
      1711900002_000, 1711900001_000, 1709300004_000, 1709300003_000, 1709300002_000,
    ])
    const g = games[0]!
    expect(g).toMatchObject({
      source: 'chesscom',
      id: 'chesscom:1811900002', // the game number from the /game/live/<n> link
      white: ME,
      black: RIVAL,
      whiteRating: 1500,
      blackRating: 1480,
      result: '1-0',
      color: 'white',
      outcome: 'win',
      timeClass: 'rapid',
    })
    expect(g.url).toMatch(/^https:\/\/www\.chess\.com\/game\/live\/\d+$/)
    expect(g.pgn).toContain('[Result "1-0"]')
    // The PGN is real and legal, so it can be pasted straight into the analyzer.
    for (const x of games) expect(() => new Chess().loadPgn(x.pgn)).not.toThrow()
  })

  it('does not fetch another month when the latest one already has enough games', async () => {
    const f = fakeFetch({
      [ARCHIVES]: () => json(monthList('2024/02', '2024/03')),
      [MONTH('2024/03')]: () => json(ccMonth(6, 1711900000)),
    })
    const games = await fetchRecentGames('chesscom', ME, { limit: 6, fetchImpl: f.impl })
    expect(games).toHaveLength(6)
    expect(f.calls).toHaveLength(2)
  })

  it('looks back at most 3 months', async () => {
    const f = fakeFetch({
      [ARCHIVES]: () => json(monthList('2023/11', '2023/12', '2024/01', '2024/02', '2024/03')),
      [MONTH('2024/03')]: () => json(ccMonth(1, 1711900000)),
      [MONTH('2024/02')]: () => json(ccMonth(1, 1709300000)),
      [MONTH('2024/01')]: () => json(ccMonth(1, 1706700000)),
    })
    const games = await fetchRecentGames('chesscom', ME, { fetchImpl: f.impl })
    expect(games).toHaveLength(3)
    expect(f.calls.map((c) => c.url)).toEqual([ARCHIVES, MONTH('2024/03'), MONTH('2024/02'), MONTH('2024/01')])
  })

  it('trims to the limit (default 20) and keeps the newest', async () => {
    const f = () =>
      fakeFetch({
        [ARCHIVES]: () => json(monthList('2024/03')),
        [MONTH('2024/03')]: () => json(ccMonth(30, 1711900000)),
      })
    const three = await fetchRecentGames('chesscom', ME, { limit: 3, fetchImpl: f().impl })
    expect(three.map((g) => g.endedAt)).toEqual([1711900030_000, 1711900029_000, 1711900028_000])
    const dflt = await fetchRecentGames('chesscom', ME, { fetchImpl: f().impl })
    expect(dflt).toHaveLength(20)
    expect(dflt[0]!.endedAt).toBe(1711900030_000)
  })

  it('makes its requests strictly one at a time, in order', async () => {
    const f = fakeFetch(
      {
        [ARCHIVES]: () => json(monthList('2024/01', '2024/02', '2024/03')),
        [MONTH('2024/03')]: () => json(ccMonth(1, 1711900000)),
        [MONTH('2024/02')]: () => json(ccMonth(1, 1709300000)),
        [MONTH('2024/01')]: () => json(ccMonth(1, 1706700000)),
      },
      8,
    )
    await fetchRecentGames('chesscom', ME, { fetchImpl: f.impl })
    expect(f.calls).toHaveLength(4)
    expect(f.maxInFlight()).toBe(1)
    for (let i = 1; i < f.calls.length; i++) expect(f.calls[i]!.start).toBeGreaterThanOrEqual(f.calls[i - 1]!.end)
    expect(f.calls.map((c) => c.url.split('/').slice(-2).join('/'))).toEqual(['games/archives', '2024/03', '2024/02', '2024/01'])
  })

  it('lowercases the name in the path, accepts a pasted profile URL, and keeps the name out of query/headers', async () => {
    const f = fakeFetch({
      [ARCHIVES]: () => json(monthList('2024/03')),
      [MONTH('2024/03')]: () => json(ccMonth(1, 1711900000)),
    })
    await fetchRecentGames('chesscom', `https://www.chess.com/member/${ME}`, { fetchImpl: f.impl })
    for (const c of f.calls) {
      const u = new URL(c.url)
      expect(u.hostname).toBe('api.chess.com')
      expect(u.search).toBe('')
      expect(u.pathname).toContain(`/${lc}/`)
      expect(c.url).not.toContain(ME)
      expect(c.init?.headers).toBeUndefined()
      expect(c.init?.body).toBeUndefined()
    }
  })

  it('skips variants and games without a PGN', async () => {
    const f = fakeFetch({
      [ARCHIVES]: () => json(monthList('2024/03')),
      [MONTH('2024/03')]: () =>
        json({
          games: [
            ccGame({ end: 1711900001, rules: 'chess960' }),
            ccGame({ end: 1711900002, rules: 'kingofthehill' }),
            ccGame({ end: 1711900003, pgn: null }),
            ccGame({ end: 1711900004, pgn: '   ' }),
            ccGame({ end: 1711900005 }),
            'not a game',
            null,
          ],
        }),
    })
    const games = await fetchRecentGames('chesscom', ME, { fetchImpl: f.impl })
    expect(games.map((g) => g.endedAt)).toEqual([1711900005_000])
  })

  it('reports empty when every game is a variant, a month has none, or the archive list is empty', async () => {
    const variants = fakeFetch({
      [ARCHIVES]: () => json(monthList('2024/03')),
      [MONTH('2024/03')]: () => json(ccMonth(3, 1711900000, { rules: 'chess960' })),
    })
    expect(await kindOf(fetchRecentGames('chesscom', ME, { fetchImpl: variants.impl }))).toBe('empty')
    const noGames = fakeFetch({
      [ARCHIVES]: () => json(monthList('2024/03')),
      [MONTH('2024/03')]: () => json({ games: [] }),
    })
    expect(await kindOf(fetchRecentGames('chesscom', ME, { fetchImpl: noGames.impl }))).toBe('empty')
    const noArchives = fakeFetch({ [ARCHIVES]: () => json({ archives: [] }) })
    expect(await kindOf(fetchRecentGames('chesscom', ME, { fetchImpl: noArchives.impl }))).toBe('empty')
    expect(noArchives.calls).toHaveLength(1)
  })

  describe('result derivation', () => {
    const cases: [string, string | undefined, string | undefined, string][] = [
      ['white mates', 'win', 'checkmated', '1-0'],
      ['black resigns', 'win', 'resigned', '1-0'],
      ['black runs out of time', 'win', 'timeout', '1-0'],
      ['black abandons', 'win', 'abandoned', '1-0'],
      ['white resigns', 'resigned', 'win', '0-1'],
      ['white is mated', 'checkmated', 'win', '0-1'],
      ['white flags', 'timeout', 'win', '0-1'],
      ['agreed draw', 'agreed', 'agreed', '1/2-1/2'],
      ['stalemate', 'stalemate', 'stalemate', '1/2-1/2'],
      ['repetition', 'repetition', 'repetition', '1/2-1/2'],
      ['insufficient material', 'insufficient', 'insufficient', '1/2-1/2'],
      ['fifty-move rule', '50move', '50move', '1/2-1/2'],
      ['timeout vs insufficient', 'timevsinsufficient', 'insufficient', '1/2-1/2'],
      ['no results at all', undefined, undefined, '*'],
    ]
    it.each(cases)('without a [Result] header: %s', async (_name, wr, br, expected) => {
      const game = ccGame({ header: null, end: 1711900001 })
      const w = game.white as Record<string, unknown>
      const b = game.black as Record<string, unknown>
      if (wr === undefined) delete w.result
      else w.result = wr
      if (br === undefined) delete b.result
      else b.result = br
      const f = fakeFetch({
        [ARCHIVES]: () => json(monthList('2024/03')),
        [MONTH('2024/03')]: () => json({ games: [game] }),
      })
      const [g] = await fetchRecentGames('chesscom', ME, { fetchImpl: f.impl })
      expect(g!.result).toBe(expected)
    })

    it('prefers the PGN [Result] header over the per-player codes', async () => {
      const f = fakeFetch({
        [ARCHIVES]: () => json(monthList('2024/03')),
        [MONTH('2024/03')]: () =>
          json({ games: [ccGame({ header: '1/2-1/2', whiteResult: 'win', blackResult: 'checkmated', end: 1711900001 })] }),
      })
      const [g] = await fetchRecentGames('chesscom', ME, { fetchImpl: f.impl })
      expect(g!.result).toBe('1/2-1/2')
      expect(g!.outcome).toBe('draw')
    })
  })

  describe('color and outcome', () => {
    const run = async (game: Record<string, unknown>, who: string = ME) => {
      const f = fakeFetch({
        [`https://api.chess.com/pub/player/${who.toLowerCase()}/games/archives`]: () => json({ archives: [`https://api.chess.com/pub/player/${who.toLowerCase()}/games/2024/03`] }),
        [`https://api.chess.com/pub/player/${who.toLowerCase()}/games/2024/03`]: () => json({ games: [game] }),
      })
      const [g] = await fetchRecentGames('chesscom', who, { fetchImpl: f.impl })
      return g!
    }

    it('win as white', async () => {
      expect(await run(ccGame({ header: '1-0' }))).toMatchObject({ color: 'white', outcome: 'win' })
    })
    it('loss as white', async () => {
      expect(await run(ccGame({ header: '0-1' }))).toMatchObject({ color: 'white', outcome: 'loss' })
    })
    it('win as black', async () => {
      expect(await run(ccGame({ white: RIVAL, black: ME, header: '0-1' }))).toMatchObject({ color: 'black', outcome: 'win' })
    })
    it('loss as black', async () => {
      expect(await run(ccGame({ white: RIVAL, black: ME, header: '1-0' }))).toMatchObject({ color: 'black', outcome: 'loss' })
    })
    it('draw', async () => {
      expect(await run(ccGame({ white: RIVAL, black: ME, header: '1/2-1/2' }))).toMatchObject({ color: 'black', outcome: 'draw' })
    })
    it('matches the name case-insensitively', async () => {
      const g = await run(ccGame({ white: RIVAL, black: 'MAGNUSFAN7', header: '0-1' }))
      expect(g).toMatchObject({ color: 'black', outcome: 'win' })
    })
    it('defaults to white with outcome "unknown" when neither player matches', async () => {
      const g = await run(ccGame({ white: 'someone_else', black: RIVAL, header: '1-0' }))
      expect(g).toMatchObject({ color: 'white', outcome: 'unknown', result: '1-0' })
    })
    it('has outcome "unknown" for an unfinished result', async () => {
      const game = ccGame({ header: null })
      delete (game.white as Record<string, unknown>).result
      delete (game.black as Record<string, unknown>).result
      expect(await run(game)).toMatchObject({ result: '*', outcome: 'unknown', color: 'white' })
    })
  })

  describe('failures', () => {
    const routes = (archives: () => Response, month?: () => Response) => ({
      [ARCHIVES]: archives,
      [MONTH('2024/03')]: month ?? (() => json(ccMonth(1, 1711900000))),
    })
    const kind = (r: Record<string, () => Response | Promise<Response>>) =>
      kindOf(fetchRecentGames('chesscom', ME, { fetchImpl: fakeFetch(r).impl }))

    it('404 on the archive list is not-found', async () => {
      expect(await kind(routes(() => text('', 404)))).toBe('not-found')
    })
    it('404 on a month is not-found', async () => {
      expect(await kind(routes(() => json(monthList('2024/03')), () => text('', 404)))).toBe('not-found')
    })
    it('429 is rate-limited (archive list and month)', async () => {
      expect(await kind(routes(() => text('', 429)))).toBe('rate-limited')
      expect(await kind(routes(() => json(monthList('2024/03')), () => text('', 429)))).toBe('rate-limited')
    })
    it('other HTTP errors are network', async () => {
      expect(await kind(routes(() => text('', 500)))).toBe('network')
      expect(await kind(routes(() => json(monthList('2024/03')), () => text('', 503)))).toBe('network')
    })
    it('a throwing fetch is network, and the message does not leak the name', async () => {
      const impl = (async () => {
        throw new TypeError(`Failed to fetch ${ME}`)
      }) as typeof fetch
      const err = await fetchRecentGames('chesscom', ME, { fetchImpl: impl }).catch((e) => e as unknown)
      expect(err).toBeInstanceOf(ImportError)
      expect((err as ImportError).kind).toBe('network')
      expect((err as ImportError).message.toLowerCase()).not.toContain(lc)
      expect((err as ImportError).cause).toBeUndefined()
    })
    it('a body that cannot be read is network', async () => {
      const broken = () =>
        ({ ok: true, status: 200, text: () => Promise.reject(new TypeError('network error')) }) as unknown as Response
      expect(await kind(routes(broken))).toBe('network')
    })
    it('malformed JSON is bad-data (archive list and month)', async () => {
      expect(await kind(routes(() => text('<html>oops</html>')))).toBe('bad-data')
      expect(await kind(routes(() => json(monthList('2024/03')), () => text('{"games": [')))).toBe('bad-data')
    })
    it('JSON of the wrong shape is bad-data', async () => {
      expect(await kind(routes(() => json({ archives: 'nope' })))).toBe('bad-data')
      expect(await kind(routes(() => json([])))).toBe('bad-data')
      expect(await kind(routes(() => json(monthList('2024/03')), () => json({ games: 'nope' })))).toBe('bad-data')
      expect(await kind(routes(() => json(monthList('2024/03')), () => json({})))).toBe('bad-data')
    })
    it('no error message contains the username', async () => {
      for (const make of [() => text('', 404), () => text('', 429), () => text('', 500), () => text('nope')]) {
        const err = await fetchRecentGames('chesscom', ME, { fetchImpl: fakeFetch(routes(make)).impl }).catch((e) => e as Error)
        expect((err as Error).message.toLowerCase()).not.toContain(lc)
      }
    })
    it('refuses to follow an archive link that points at another host or path', async () => {
      for (const evil of [
        'https://evil.example/pub/player/x/games/2024/03',
        'http://api.chess.com/pub/player/x/games/2024/03',
        'https://api.chess.com.evil.example/pub/player/x/games/2024/03',
        'https://api.chess.com/somewhere/else',
        42,
        null,
      ]) {
        const f = fakeFetch({ [ARCHIVES]: () => json({ archives: [evil] }) })
        expect(await kindOf(fetchRecentGames('chesscom', ME, { fetchImpl: f.impl }))).toBe('bad-data')
        expect(f.calls).toHaveLength(1)
        expect(f.unexpected).toEqual([])
      }
    })
    it('drops game links that do not point at chess.com', async () => {
      const game = ccGame({ end: 1711900001 })
      game.url = 'javascript:alert(1)'
      const f = fakeFetch(routes(() => json(monthList('2024/03')), () => json({ games: [game] })))
      const [g] = await fetchRecentGames('chesscom', ME, { fetchImpl: f.impl })
      expect(g!.url).toBeUndefined()
      expect(g!.id).toBe(`chesscom:${1711900001_000}-${ME}-${RIVAL}`)
    })
  })

  describe('abort', () => {
    it('rethrows an AbortError from fetch untouched', async () => {
      const err = abortError()
      const impl = (async () => {
        throw err
      }) as typeof fetch
      await expect(fetchRecentGames('chesscom', ME, { fetchImpl: impl })).rejects.toBe(err)
    })
    it('passes the signal to every request', async () => {
      const ac = new AbortController()
      const f = fakeFetch({
        [ARCHIVES]: () => json(monthList('2024/02', '2024/03')),
        [MONTH('2024/03')]: () => json(ccMonth(1, 1711900000)),
        [MONTH('2024/02')]: () => json(ccMonth(1, 1709300000)),
      })
      await fetchRecentGames('chesscom', ME, { fetchImpl: f.impl, signal: ac.signal })
      expect(f.calls).toHaveLength(3)
      for (const c of f.calls) expect(c.init?.signal).toBe(ac.signal)
    })
    it('does not make any request when the signal is already aborted', async () => {
      const ac = new AbortController()
      ac.abort()
      const f = fakeFetch({})
      const err = await fetchRecentGames('chesscom', ME, { fetchImpl: f.impl, signal: ac.signal }).catch((e) => e as unknown)
      expect(err).not.toBeInstanceOf(ImportError)
      expect((err as Error).name).toBe('AbortError')
      expect(f.calls).toHaveLength(0)
    })
    it('stops before the next month when aborted mid-way', async () => {
      const ac = new AbortController()
      const f = fakeFetch({
        [ARCHIVES]: () => {
          ac.abort()
          return json(monthList('2024/02', '2024/03'))
        },
      })
      const err = await fetchRecentGames('chesscom', ME, { fetchImpl: f.impl, signal: ac.signal }).catch((e) => e as unknown)
      expect(err).not.toBeInstanceOf(ImportError)
      expect((err as Error).name).toBe('AbortError')
      expect(f.calls).toHaveLength(1)
    })
    it('does not turn a non-abort error into an ImportError once the signal is aborted', async () => {
      const ac = new AbortController()
      const boom = new Error('boom')
      const impl = (async () => {
        ac.abort()
        throw boom
      }) as typeof fetch
      await expect(fetchRecentGames('chesscom', ME, { fetchImpl: impl, signal: ac.signal })).rejects.toBe(boom)
    })
  })
})

// ---------------------------------------------------------------------------------------------
// Lichess
// ---------------------------------------------------------------------------------------------

const LI_URL = (max = 20, user = ME) =>
  `https://lichess.org/api/games/user/${user}?max=${max}&pgnInJson=true&clocks=false&opening=false`

function lichessPgn(id: string, white: string, black: string, result: string): string {
  return [
    '[Event "Rated blitz game"]',
    `[Site "https://lichess.org/${id}"]`,
    '[Date "2024.03.05"]',
    `[White "${white}"]`,
    `[Black "${black}"]`,
    `[Result "${result}"]`,
    '[WhiteElo "1612"]',
    '[BlackElo "1590"]',
    '[TimeControl "300+0"]',
    '[Termination "Normal"]',
    '',
    movetext(result),
    '',
  ].join('\n')
}

interface LiOpts {
  id?: string
  white?: string | null
  black?: string | null
  whiteRating?: number
  blackRating?: number
  winner?: 'white' | 'black' | null
  status?: string
  speed?: string
  variant?: string
  created?: number
  last?: number
  pgn?: string | null
  extraWhite?: Record<string, unknown>
}

function liGame(o: LiOpts = {}): Record<string, unknown> {
  const id = o.id ?? 'q7ZvsdUF'
  const winner = o.winner === undefined ? 'white' : o.winner
  const white = o.white === undefined ? ME : o.white
  const black = o.black === undefined ? RIVAL : o.black
  const player = (name: string | null, rating: number, extra: Record<string, unknown> = {}) => ({
    ...(name ? { user: { name, id: name.toLowerCase() } } : {}),
    rating,
    ...extra,
  })
  const game: Record<string, unknown> = {
    id,
    rated: true,
    variant: o.variant ?? 'standard',
    speed: o.speed ?? 'blitz',
    perf: 'blitz',
    createdAt: o.created ?? 1711900000000,
    lastMoveAt: o.last ?? 1711900300000,
    status: o.status ?? 'mate',
    players: {
      white: player(white, o.whiteRating ?? 1612, o.extraWhite),
      black: player(black, o.blackRating ?? 1590),
    },
  }
  if (winner) game.winner = winner
  if (o.pgn !== null) game.pgn = o.pgn ?? lichessPgn(id, white ?? 'Anonymous', black ?? 'Anonymous', winner === 'black' ? '0-1' : winner === 'white' ? '1-0' : '1/2-1/2')
  return game
}

/** NDJSON body: one JSON object (or raw string) per line, trailing newline like the real API. */
const nd = (...lines: (Record<string, unknown> | string)[]) =>
  lines.map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n') + '\n'

const ndRes = (body: string, status = 200) =>
  new Response(body, { status, headers: { 'content-type': 'application/x-ndjson' } })

const liFetch = (body: string | (() => Response), max = 20) => fakeFetch({ [LI_URL(max)]: typeof body === 'string' ? () => ndRes(body) : body })

describe('Lichess', () => {
  it('parses an NDJSON stream into games, newest first', async () => {
    const f = liFetch(
      nd(
        liGame({ id: 'q7ZvsdUF', last: 1711900300000, winner: 'white', speed: 'blitz' }),
        liGame({ id: 'AbCd1234', last: 1711800300000, winner: 'black', white: RIVAL, black: ME, whiteRating: 1700, blackRating: 1650, speed: 'rapid' }),
        liGame({ id: 'ZzYy9876', last: 1711950300000, winner: null, status: 'draw', speed: 'bullet' }),
      ),
    )
    const games = await fetchRecentGames('lichess', ME, { fetchImpl: f.impl })
    expect(f.calls).toHaveLength(1)
    expect(f.calls[0]!.url).toBe(LI_URL())
    expect((f.calls[0]!.init?.headers as Record<string, string>).Accept).toBe('application/x-ndjson')
    expect(games.map((g) => g.id)).toEqual(['lichess:ZzYy9876', 'lichess:q7ZvsdUF', 'lichess:AbCd1234'])
    expect(games[1]).toMatchObject({
      source: 'lichess',
      url: 'https://lichess.org/q7ZvsdUF',
      white: ME,
      black: RIVAL,
      whiteRating: 1612,
      blackRating: 1590,
      result: '1-0',
      color: 'white',
      outcome: 'win',
      timeClass: 'blitz',
      endedAt: 1711900300000,
    })
    expect(games[2]).toMatchObject({ color: 'black', outcome: 'win', result: '0-1', timeClass: 'rapid', whiteRating: 1700, blackRating: 1650 })
    expect(games[0]).toMatchObject({ result: '1/2-1/2', outcome: 'draw', timeClass: 'bullet' })
    expect(games[1]!.pgn).toContain('[Site "https://lichess.org/q7ZvsdUF"]')
    for (const g of games) expect(() => new Chess().loadPgn(g.pgn)).not.toThrow()
  })

  it('puts max=<limit> in the URL and trims to the limit', async () => {
    const body = nd(
      liGame({ id: 'game0001', last: 1711900001000 }),
      liGame({ id: 'game0002', last: 1711900002000 }),
      liGame({ id: 'game0003', last: 1711900003000 }),
    )
    const f = liFetch(body, 2)
    const games = await fetchRecentGames('lichess', ME, { limit: 2, fetchImpl: f.impl })
    expect(f.calls[0]!.url).toBe(LI_URL(2))
    expect(games.map((g) => g.id)).toEqual(['lichess:game0003', 'lichess:game0002'])
  })

  it('accepts a pasted profile URL and keeps the name as typed', async () => {
    const f = liFetch(nd(liGame()))
    const [g] = await fetchRecentGames('lichess', `https://lichess.org/@/${ME}`, { fetchImpl: f.impl })
    expect(g!.color).toBe('white')
    expect(f.calls[0]!.url).toBe(LI_URL())
  })

  it('tolerates a trailing blank line, several blank lines and CRLF line endings', async () => {
    const a = JSON.stringify(liGame({ id: 'game0001', last: 1711900001000 }))
    const b = JSON.stringify(liGame({ id: 'game0002', last: 1711900002000 }))
    for (const body of [`${a}\n${b}\n\n`, `${a}\n\n\n${b}`, `${a}\r\n${b}\r\n`, `\n${a}\n   \n${b}\n`]) {
      const games = await fetchRecentGames('lichess', ME, { fetchImpl: liFetch(body).impl })
      expect(games).toHaveLength(2)
    }
  })

  it('skips variants', async () => {
    const f = liFetch(
      nd(
        liGame({ id: 'game0001', variant: 'chess960' }),
        liGame({ id: 'game0002', variant: 'crazyhouse' }),
        liGame({ id: 'game0003' }),
      ),
    )
    const games = await fetchRecentGames('lichess', ME, { fetchImpl: f.impl })
    expect(games.map((g) => g.id)).toEqual(['lichess:game0003'])
  })

  it('reports empty when everything was a variant, or the body is empty', async () => {
    expect(await kindOf(fetchRecentGames('lichess', ME, { fetchImpl: liFetch(nd(liGame({ variant: 'atomic' }))).impl }))).toBe('empty')
    expect(await kindOf(fetchRecentGames('lichess', ME, { fetchImpl: liFetch('').impl }))).toBe('empty')
    expect(await kindOf(fetchRecentGames('lichess', ME, { fetchImpl: liFetch('\n\n').impl }))).toBe('empty')
  })

  it('skips lines that are not valid JSON but keeps the good ones', async () => {
    const f = liFetch(nd('{"id": "broken', liGame({ id: 'game0001' }), 'not json at all', '[1,2,3]', '42', liGame({ id: 'game0002' })))
    const games = await fetchRecentGames('lichess', ME, { fetchImpl: f.impl })
    expect(games.map((g) => g.id).sort()).toEqual(['lichess:game0001', 'lichess:game0002'])
  })

  it('throws bad-data when every line is bad', async () => {
    expect(await kindOf(fetchRecentGames('lichess', ME, { fetchImpl: liFetch(nd('{oops', 'nope', '<html>')).impl }))).toBe('bad-data')
    expect(await kindOf(fetchRecentGames('lichess', ME, { fetchImpl: liFetch('<html>Service unavailable</html>').impl }))).toBe('bad-data')
    // Valid JSON, but no game id / no PGN (e.g. the pgnInJson flag was ignored) is just as unusable.
    expect(await kindOf(fetchRecentGames('lichess', ME, { fetchImpl: liFetch(nd({ foo: 1 }, liGame({ pgn: null }))).impl }))).toBe('bad-data')
  })

  it('does not treat an unsafe game id as a link', async () => {
    const f = liFetch(nd(liGame({ id: '../evil' }), liGame({ id: 'game0001' })))
    const games = await fetchRecentGames('lichess', ME, { fetchImpl: f.impl })
    expect(games.map((g) => g.url)).toEqual(['https://lichess.org/game0001'])
  })

  describe('result, color and outcome', () => {
    const one = async (o: LiOpts, who = ME) => {
      const f = fakeFetch({ [LI_URL(20, who)]: () => ndRes(nd(liGame(o))) })
      const [g] = await fetchRecentGames('lichess', who, { fetchImpl: f.impl })
      return g!
    }
    it('white wins / black wins / draw / stalemate / timeout vs insufficient material', async () => {
      expect(await one({ winner: 'white' })).toMatchObject({ result: '1-0', outcome: 'win', color: 'white' })
      expect(await one({ winner: 'black' })).toMatchObject({ result: '0-1', outcome: 'loss', color: 'white' })
      expect(await one({ winner: null, status: 'draw' })).toMatchObject({ result: '1/2-1/2', outcome: 'draw' })
      expect(await one({ winner: null, status: 'stalemate' })).toMatchObject({ result: '1/2-1/2', outcome: 'draw' })
      expect(await one({ winner: null, status: 'outoftime' })).toMatchObject({ result: '1/2-1/2', outcome: 'draw' })
    })
    it('plays black and wins / loses', async () => {
      expect(await one({ white: RIVAL, black: ME, winner: 'black' })).toMatchObject({ color: 'black', outcome: 'win', result: '0-1' })
      expect(await one({ white: RIVAL, black: ME, winner: 'white' })).toMatchObject({ color: 'black', outcome: 'loss', result: '1-0' })
    })
    it('matches the searched name case-insensitively', async () => {
      expect(await one({ white: RIVAL, black: 'MagnusFAN7', winner: 'black' })).toMatchObject({ color: 'black', outcome: 'win' })
    })
    it('defaults to white and "unknown" when neither player matches', async () => {
      expect(await one({ white: 'someone_else', black: RIVAL, winner: 'white' })).toMatchObject({ color: 'white', outcome: 'unknown', result: '1-0' })
    })
    it('names anonymous and engine opponents', async () => {
      const anon = await one({ black: null, winner: 'white' })
      expect(anon.black).toBe('Anonymous')
      const ai = await one({ white: null, extraWhite: { aiLevel: 3 }, black: ME, winner: 'black' })
      expect(ai.white).toBe('Stockfish level 3')
      expect(ai).toMatchObject({ color: 'black', outcome: 'win' })
    })
    it('maps correspondence to "daily" and ultraBullet to "bullet"', async () => {
      expect((await one({ speed: 'correspondence' })).timeClass).toBe('daily')
      expect((await one({ speed: 'ultraBullet' })).timeClass).toBe('bullet')
      expect((await one({ speed: 'classical' })).timeClass).toBe('classical')
    })
    it('falls back to createdAt when lastMoveAt is missing', async () => {
      const game = liGame({ created: 1711900000000 })
      delete game.lastMoveAt
      const f = fakeFetch({ [LI_URL()]: () => ndRes(nd(game)) })
      const [g] = await fetchRecentGames('lichess', ME, { fetchImpl: f.impl })
      expect(g!.endedAt).toBe(1711900000000)
    })
  })

  it('never returns unfinished or aborted games (this is an analysis tool, not for live games)', async () => {
    const f = liFetch(
      nd(
        liGame({ id: 'game0001', status: 'started', winner: null }),
        liGame({ id: 'game0002', status: 'created', winner: null }),
        liGame({ id: 'game0003', status: 'aborted', winner: null }),
        liGame({ id: 'game0004', status: 'noStart', winner: null }),
        liGame({ id: 'game0005', status: 'resign' }),
      ),
    )
    const games = await fetchRecentGames('lichess', ME, { fetchImpl: f.impl })
    expect(games.map((g) => g.id)).toEqual(['lichess:game0005'])
  })

  describe('failures', () => {
    const kind = (body: () => Response) => kindOf(fetchRecentGames('lichess', ME, { fetchImpl: liFetch(body).impl }))
    it('404 is not-found', async () => {
      expect(await kind(() => ndRes('{"error":"Not found"}', 404))).toBe('not-found')
    })
    it('429 is rate-limited', async () => {
      expect(await kind(() => ndRes('Too many requests', 429))).toBe('rate-limited')
    })
    it('other HTTP errors are network', async () => {
      expect(await kind(() => ndRes('', 500))).toBe('network')
      expect(await kind(() => ndRes('', 502))).toBe('network')
    })
    it('a throwing fetch is network, with no username in the message', async () => {
      const impl = (async () => {
        throw new TypeError('Failed to fetch')
      }) as typeof fetch
      const err = await fetchRecentGames('lichess', ME, { fetchImpl: impl }).catch((e) => e as Error)
      expect(err).toBeInstanceOf(ImportError)
      expect((err as ImportError).kind).toBe('network')
      expect((err as Error).message.toLowerCase()).not.toContain(lc)
    })
  })

  describe('abort', () => {
    it('rethrows an AbortError from fetch untouched', async () => {
      const err = abortError()
      const impl = (async () => {
        throw err
      }) as typeof fetch
      await expect(fetchRecentGames('lichess', ME, { fetchImpl: impl })).rejects.toBe(err)
    })
    it('rethrows an AbortError raised while reading the body', async () => {
      const err = abortError()
      const impl = (async () => ({ ok: true, status: 200, text: () => Promise.reject(err) }) as unknown as Response) as typeof fetch
      await expect(fetchRecentGames('lichess', ME, { fetchImpl: impl })).rejects.toBe(err)
    })
    it('passes the signal on and refuses to start when already aborted', async () => {
      const ac = new AbortController()
      const f = liFetch(nd(liGame()))
      await fetchRecentGames('lichess', ME, { fetchImpl: f.impl, signal: ac.signal })
      expect(f.calls[0]!.init?.signal).toBe(ac.signal)
      ac.abort()
      const g = liFetch(nd(liGame()))
      const err = await fetchRecentGames('lichess', ME, { fetchImpl: g.impl, signal: ac.signal }).catch((e) => e as unknown)
      expect(err).not.toBeInstanceOf(ImportError)
      expect((err as Error).name).toBe('AbortError')
      expect(g.calls).toHaveLength(0)
    })
  })
})

// ---------------------------------------------------------------------------------------------
// Shared behaviour
// ---------------------------------------------------------------------------------------------

describe('fetchRecentGames (both sources)', () => {
  it.each<ImportSource>(['chesscom', 'lichess'])('rejects an invalid username before any request (%s)', async (source) => {
    const f = fakeFetch({})
    for (const bad of ['', 'x', 'bad name', 'https://example.com/member/abc']) {
      expect(await kindOf(fetchRecentGames(source, bad, { fetchImpl: f.impl }))).toBe('invalid-name')
    }
    expect(f.calls).toHaveLength(0)
  })

  it('rejects an unknown source without touching the network', async () => {
    const f = fakeFetch({})
    expect(await kindOf(fetchRecentGames('myspace' as ImportSource, ME, { fetchImpl: f.impl }))).toBe('bad-data')
    expect(f.calls).toHaveLength(0)
  })

  it('clamps nonsense limits instead of sending them to the API', async () => {
    const f = fakeFetch({ [LI_URL(1)]: () => ndRes(nd(liGame())), [LI_URL(100)]: () => ndRes(nd(liGame())), [LI_URL(20)]: () => ndRes(nd(liGame())) })
    await fetchRecentGames('lichess', ME, { limit: 0, fetchImpl: f.impl })
    await fetchRecentGames('lichess', ME, { limit: 9999, fetchImpl: f.impl })
    await fetchRecentGames('lichess', ME, { limit: Number.NaN, fetchImpl: f.impl })
    expect(f.calls.map((c) => new URL(c.url).searchParams.get('max'))).toEqual(['1', '100', '20'])
  })

  it('uses the global fetch, bound to globalThis, when no fetchImpl is given', async () => {
    let seenThis: unknown = 'unset'
    const urls: string[] = []
    vi.stubGlobal('fetch', function (this: unknown, input: RequestInfo | URL) {
      seenThis = this
      urls.push(String(input))
      return Promise.resolve(ndRes(nd(liGame())))
    })
    const games = await fetchRecentGames('lichess', ME)
    expect(games).toHaveLength(1)
    expect(seenThis).toBe(globalThis)
    expect(urls).toEqual([LI_URL()])
  })

  it('only ever talks to api.chess.com and lichess.org', async () => {
    const cc = fakeFetch({
      [ARCHIVES]: () => json(monthList('2024/02', '2024/03')),
      [MONTH('2024/03')]: () => json(ccMonth(1, 1711900000)),
      [MONTH('2024/02')]: () => json(ccMonth(1, 1709300000)),
    })
    await fetchRecentGames('chesscom', ME, { fetchImpl: cc.impl })
    const li = liFetch(nd(liGame()))
    await fetchRecentGames('lichess', ME, { fetchImpl: li.impl })
    const hosts = new Set([...cc.calls, ...li.calls].map((c) => new URL(c.url).hostname))
    expect([...hosts].sort()).toEqual(['api.chess.com', 'lichess.org'])
    expect(cc.unexpected).toEqual([])
  })
})
