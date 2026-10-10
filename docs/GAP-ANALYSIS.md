# Tirpo's Chess: gap analysis

Written by the Benchmark agent on 2026-10-10. Research and code read both done on that date.
Scope: analysis and practice only. Nothing here helps a player during a live or rated game.
Everything recommended works free, static, in the browser, with no account.

---

## 1. Summary

- The app already does the "what happened" part well: graded moves, accuracy, eval graph, arrows, plain-words moves, try-your-own-moves.
- The two biggest gaps are the "teacher" parts: (a) it never makes you try the position again (Retry / Learn from your mistakes), and (b) it never says WHY a move was bad. Chess.com and Lichess both lead with these. See top-10 items 6 and 7.
- The cheapest wins are all S-sized: opening names and a real "Book" label, jump-to-next-key-moment, more keyboard keys, a visible dark/light toggle plus board colours, synthesized sounds, and getting the board above the paste box on phones. Items 1 to 5.
- Import by username is high value but has two things to check first: browser CORS is **unconfirmed** for both Chess.com and Lichess APIs, and Chess.com's API rules ask third-party tools to look and be named differently from Chess.com. See sections 9 and 10.
- Order change suggested to the owner list: see section 9. Short version: opening names first, retry second, import third, "stronger engines" last.

Effort: **S** = under a day (one small module or component, plus tests). **M** = 2 to 4 days. **L** = a week or more, or new infrastructure, or real unknowns.
Value: **5** = changes how people learn or whether they come back. **3** = clearly nicer. **1** = nice to have.

---

## 2. What the app has today (so none of it is listed as a gap)

Read from README.md and src/ on 2026-10-10:

- Paste PGN or plain move list, FEN setup, analysis with Stockfish in a Web Worker, depth presets, progress bar, Stop.
- Ten move labels (Brilliant, Great, Best, Excellent, Good, Book, Forced, Inaccuracy, Mistake, Blunder), badge on the board square, per-player accuracy, tally chips, move list with colour dots (classify.ts, AnalyzePanels.tsx).
- Eval bar, clickable eval graph, best-move arrow for Good/Inaccuracy/Mistake/Blunder, "Best was: ..." in plain words, top-3 alternatives before each move.
- Replay with play/pause, speed, first/prev/next/last, Left/Right/Space keys, auto flip when your username is Black.
- Two-engine "second opinion" with a disagreement count; three lite single-thread Stockfish builds (`sf`, `sf17`, `sf18` in `public/engines/`, about 7 MB each except `sf` at 1.8 MB).
- "Try moves from here" branches into an analysis board with a clear "NOT the real game" banner and a Back button.
- Engine tab: live top-3 hints, Brilliant hint, undo/redo, drag and click moves, legal-move dots, right-click arrows and square marks, play vs engine at 400-3200 Elo, FEN or move-list setup, copy moves, "Analyze this game".
- Light and dark colours follow the system setting (styles.css).

Checked in code and **missing** today (these are the real gaps):

- Engine output keeps only the first move of each line (`src/core/engine.ts` line 176 matches `pv (\S+)`), so no full line can be shown.
- Import strips comments, NAGs, variations and clock tags (`stripNoise` in `src/core/notation.ts`). Nothing is read back from a PGN that already has `[%clk]` or `[%eval]`.
- The only thing saved in the browser is the username (`localStorage`, App.tsx).
- There is no manual dark/light switch. The CSS for `data-theme="dark"` and `"light"` exists but nothing in the code sets it.
- No sound, no settings panel, no board or piece themes. Pieces are Unicode glyphs drawn with a font stack, so they look different on each OS.
- Opening names and the opening book: `src/core/importGames.ts`, `src/core/openings.ts` and `src/data/openings.json` exist now but nothing in `App.tsx` uses them yet. Treated below as approved and in progress.
- On a phone, in Analyze mode the paste card (textarea, buttons, depth, username, status) sits above the board in the same column (App.tsx, about lines 243-265). Read from code; not yet measured in a browser, so the ux-reviewer should confirm.

---

## 3. How the research was done, and how to read the sources

- Pages were read with a fetch tool that returns a summary of the page, not raw text. Treat numbers and quotes as "to re-check on the page before anyone prints them".
- Source tags like [C2] point to section 13. Each claim below has a tag.
- **unconfirmed** means I could not verify it from a page I read. I did not guess. Where the search tool found a page but I did not open it, I say so.
- The sandbox blocked direct requests to api.chess.com and lichess.org (HTTP 403 from the proxy), so I could not test CORS or response shapes myself.
- Chess.com help articles are undated. Lichess changelog entries are dated July and August 2026. Free/paid limits can change; they are marked "as of the page".
- Chess-Results was not benchmarked: it is a tournament-results site, not an analysis tool.

---

## 4. Competitor snapshot

| Site | What it is best at (that matters to us) | Free / limits (as of the page) | Source |
|---|---|---|---|
| Chess.com | Game Review: Coach text, key moments, Retry with hints, report card with phase grades, eval graph, 10 move labels incl. "Miss" | Accuracy, labels and Self Analysis free; a daily Game Review limit on free; unlimited on paid tiers; cloud analysis on top tier | [C1] [C2] [C3] [C5] |
| Lichess | Analysis board with variations, engine lines, explorer, "Learn from your mistakes", practice lessons, studies, huge keyboard map | Free, no ads, no registration needed; free server analysis plus a local in-browser engine | [L1] [L2] [L3] [L4] [L11] |
| Aimchess | Reports across many games in six skill areas, drills made from your own mistakes | Free tier limited; the two sources I read disagree on the numbers, so the exact limits are **unconfirmed** | [A1] [A2] [A3] |
| DecodeChess | Words, not just numbers: Idea / Problem / Solution, threats, piece roles | Free Stockfish analysis plus a game map; what the explanations cost is **unconfirmed** | [D1] |
| Chessable | MoveTrainer: quiz one move at a time, repeat misses at growing intervals | Some courses free, others must be bought | [X1] |
| Chess Tempo | Tactics, endgames, openings, custom problem sets, game database | Free vs paid split **unconfirmed** (page only listed menu items) | [X2] |
| Chessify | Cloud engines, big game database | Free tier at 1 million nodes/second, faster is paid. Server-side, so out of scope for us | [X3] [X4] |
| Maia | Engine that plays like a human of a given rating (1100 to 1900), not like a machine | Open source (v1 GPL-3.0, Maia-2 MIT) | [M1] [M2] [M3] |

---

## 5. Gap table

Only things the app does **not** fully have. "Partial" says exactly what is missing.
Server-only features (cloud eval, masters database stats, 7-piece tablebase, studies with sharing, courses, live play) are out of scope and listed in section 7.

### Review and learning

| Feature | Who has it | Do we have it? | Effort | Value |
|---|---|---|---|---|
| Retry / "fix your mistakes": app stops on your bad move, you try to find a better one, hint ladder, score | Chess.com Retry with Show Idea / Show Best style hints [C2], key-move retries with adjusted accuracy [C4]; Lichess Learn from your mistakes [L1]; Aimchess Retry Mistakes [A1] | No (approved) | M | 5 |
| Rule-based "why" text (hung piece, missed capture, missed or allowed mate, threat) | Chess.com Coach names threats and the pieces involved [C3]; DecodeChess [D1] | Partial: says what the move is, not why it was bad | M | 5 |
| Key moments: Next / Previous critical move | Chess.com "Next" through key moves [C2]; Lichess has no native next-mistake key that I could confirm (forum thread lists B/M/I keys from an extension) [L6] | No (graph click and list only) | S | 4 |
| Pick "mistakes worth studying" by win-chance swing, skip book moves | Lichess [L1] | Partial: we grade by win % but "Book" is a guess for the first 4 moves | S (after opening names) | 3 |
| "Miss" label (did not punish the opponent's error) | Chess.com [C1] [C3] | No | S | 2 |
| Per-phase accuracy (opening / middlegame / endgame) and a short report card | Chess.com grades per phase [C3]; Lichess added phase accuracy in July 2026 [L8] | No | M | 3 |
| Accuracy that updates after you fix a mistake | Chess.com [C4] | No | S (after retry) | 2 |
| "My mistakes" deck saved in the browser, shown again later (spaced repetition) | Chessable-style repetition [X1]; Aimchess puzzles from your own mistakes [A2] | No | M | 4 |
| Time-per-move and best-move-difference charts | Chess.com Self Analysis charts: Score, Time, Best Move Diff, Themes [C7]; Aimchess time management [A1] | Partial: eval graph only. Needs `[%clk]` from the PGN, which we strip today | M | 3 |
| Game rating / performance estimate | Chess.com [C5] | No | S | 2 (label as a rough estimate) |
| Hover a word in the explanation and the board draws the arrows or squares | Chess.com [C3] | No (arrow layer exists) | M | 3 |

### Engine

| Feature | Who has it | Do we have it? | Effort | Value |
|---|---|---|---|---|
| Show the engine's full line (several moves), step through it or play it out | Chess.com "Show Line" [C4]; Lichess engine panel [L2] | No (first move only) | M | 4 |
| Threats toggle: what would the opponent do if it were their move | Lichess `x` key [L3]; Chess.com Interface setting "threats" [C7] | No | M | 3 |
| Choose number of lines and depth | Lichess 1-5 lines, depth, hash, threads [L2]; Chess.com [C6] | Partial: depth presets only, always 3 lines | S | 2 |
| Stronger engine, full NNUE | Chess.com: Stockfish 18 full NNUE on its servers, browser default is lite, full net is 108 MB and opt-in [C10]; Chessify cloud [X3] | Partial: lite builds only | M | 2 |
| Human-like opponent | Maia [M1], runs in a browser through ONNX Runtime Web in one third-party write-up [M4] | No (approved) | L | 4 for play mode |

### Import, export, share

| Feature | Who has it | Do we have it? | Effort | Value |
|---|---|---|---|---|
| Import your recent games by Chess.com username | Aimchess and others via account link [A1]; Chess.com public API [C12] | No (approved, in progress) | M | 5 |
| Import by Lichess username | Lichess games export, anonymous allowed [L10] | No | S once the Chess.com one exists | 4 |
| Drop or upload a .pgn file; pick one game from a multi-game file | Lichess import [L11]; Chess.com paste FEN/PGN [C6] | Partial: textarea only | S | 3 |
| Download PGN with marks and evals (move glyphs, `[%eval]` comments) | Lichess export has eval comments [L10] and PGN download [L2] | No (approved) | M | 4 |
| Share link with the game inside it | Lichess URL follows the analysis [L2] | No | M | 3 |
| Read existing `[%eval]`, `[%clk]` and comments on import | Lichess export can include eval and clock comments [L10]; clock tags in Chess.com PGNs are **unconfirmed** (only seen in our own test fixtures) | No | M | 3 |
| Free-text notes, move glyphs, saved variations | Lichess [L2] [L7] | No: "try moves" lines are not saved | L | 3 |
| Board editor (drag pieces on, castling and turn boxes) | Chess.com [C6]; Lichess [L2] | Partial: FEN paste only | M | 3 |
| Image or GIF export of the position or game | Lichess GIF [L2] | No | M | 2 |

### Openings

| Feature | Who has it | Do we have it? | Effort | Value |
|---|---|---|---|---|
| Opening name shown while you step through | Chess.com key move shows the opening name [C2]; Lichess shows it on the analysis board [L4] | No (approved, in progress) | S | 4 |
| Real "Book" label from a table, not a 4-move guess | Chess.com overhauled its book data [C3]; Lichess skips opening moves two masters played [L1] | Partial (guess) | S, same job as above | 4 |
| Opening trainer: drill your lines | Chessable [X1]; Aimchess Opening Improver [A1] | No | L | 3 |

### Board, look, sound, keys

| Feature | Who has it | Do we have it? | Effort | Value |
|---|---|---|---|---|
| Dark / light / system switch | Chess.com background setting [C9]; Lichess **unconfirmed** | Partial: follows system only, no switch | S | 4 |
| Board colour themes | Chess.com [C9]; Lichess 25+ boards [L12] | No (one palette) | S | 3 |
| Piece sets (same look on every OS) | Chess.com [C9]; Lichess about 40 [L12] | No (Unicode glyphs) | M | 3 |
| Move sounds (move, capture, check, castle, end), mute control | Chess.com [C9]; Lichess sound selector [L12] | No (approved) | S | 3 |
| Settings gear: arrows on/off, coordinates, animation speed, highlights, legal dots, material difference | Chess.com Interface tab [C7]; Lichess display options (third-party list, 2020-21) [L13] | No | M | 3 |
| Captured pieces / material difference | Lichess option [L13], still maintained in 2026 [L8] | No | S | 2 |
| More keys: Home/End, Up/Down, `f` flip, `?` help, `a` arrows on/off | Lichess [L3] | Partial: Left/Right/Space only | S | 3 |
| Inline (compact) move list, eval shown in the list | Lichess has an "inline" toggle on Shift+I [L3]; hover shows move strength [L8] | Partial: one 2-column list | S | 2 |
| Keyboard move entry (accessibility) | Lichess [L8] | No | M | 2 |

### Phone

| Feature | Who has it | Do we have it? | Effort | Value |
|---|---|---|---|---|
| Board first on phones; setup box collapses once a game is loaded | Lichess keeps analysis one column and trims gaps [L8]; Chess.com Game Review settings sit behind a gear on mobile [C2]; exact Chess.com phone layout **unconfirmed** | No | S then M | 4 |
| Hints directly under the board in the Engine tab (approved) | Lichess has reworked its one-column mobile analysis view and centred the evaluation [L8] | No: Elo slider and presets sit between board and hints | M | 4 |
| Install and work offline | No competitor source; Maia write-up claims offline use once loaded [M4]. Our own idea. Note index.html loads fonts from Google Fonts, which would need self-hosting | No | M | 3 (value **unconfirmed**) |

### Practice

| Feature | Who has it | Do we have it? | Effort | Value |
|---|---|---|---|---|
| Practice positions against full-strength engine (K+Q v K, Lucena, Philidor...) | Lichess Practice: checkmates, tactics, pawn and rook endgames [L16]; Chess Tempo endgames [X2] | Partial: you can load a FEN and play, but there is no library or goal text | M | 3 |
| Puzzle library | Chess.com [C13]; Lichess puzzle data is CC0 but 6.2 million rows [L14]; Chess Tempo [X2] | No | L | 3 |
| Coordinates trainer | Lichess Learn menu [L11] | No | S | 1 |
| Stats across many of your games (opening, tactics, endgame, time) | Aimchess [A1] [A3] | No | L | 3 |

---

## 6. Top 10 recommendations, ranked by value for effort

Ranking rule: value divided by effort points (S=1, M=3, L=8), ties broken by value (item 3 is ranked by its S-sized first step). Dependencies are noted. If you only do three things for learning value, do items 6, 7 and 8.

### 1. Opening names and a real "Book" label (S, value 4) [approved, in progress]
- Why: shows the opening you are in (Chess.com does at the first key move [C2], Lichess on the board [L4]) and ends the "first 4 moves are Book" guess.
- How: the Lichess openings table is public domain (CC0), about 3,900 lines and 395 KB raw [L15]. Its own advice: play moves backwards from the end of the game until a named position is found. The repo's `src/core/openings.ts` already keys by position (so transpositions match) and loads the data lazily. Show "ECO name" under the move; label a move Book only when the position after it is in the table.
- Also: Lichess does not count a move as a mistake when masters played it [L1]. A table lookup gives the same protection for the retry mode (item 6) for free.

### 2. Key moments plus a fuller keyboard map (S, value 4)
- Why: Chess.com's review is built around "Next key move" [C2]. Today you must scrub the graph or the list.
- How: "Prev / Next critical move" buttons and keys (for example `n` and `p`) that jump between Mistake, Blunder, Miss (if added), Brilliant, Great. Add Home/End, Up/Down, `f` to flip, `a` to hide arrows, `?` for a help card, taken from the Lichess map [L3]. Show small marks for key moments on the eval graph.

### 3. Phone: board first (S first step, M for the rest, value 4) [approved]
- Why: on a phone the paste box is the first thing you see, and the engine hints sit below the Elo controls.
- Step 1 (S): once a game is loaded, collapse the paste card to one line ("New game / change settings"), board directly under the title. Keep first/prev/play/next/last in a bar that stays in reach of the thumb.
- Step 2 (M): in the Engine tab put the hints block directly under the board; move opponent, Elo and presets into a collapsed "Opponent" section. Put settings behind a gear (Chess.com does this on mobile [C2]).
- Check with the ux-reviewer at 390x844 before and after.

### 4. Dark / light / system switch, plus four board colours (S, value 3)
- Why: the dark CSS and the `data-theme` hooks already exist (styles.css lines 12-19). Only the control and a saved choice are missing. Chess.com and Lichess both let you change board look [C9] [L12].
- How: three-way toggle, saved in `localStorage` inside try/catch; 4 board palettes as CSS variables (`--sq-light`, `--sq-dark`). Keep contrast readable with last-move and arrow colours on every palette.

### 5. Sounds, built in code (S, value 3) [approved]
- Why: sound is part of how both sites feel [C9] [L12].
- How: synthesize short sounds with the Web Audio API (move, capture, check, castle, game end, error). That means no files, no licences, tiny size, works offline. Do **not** reuse Chess.com or Lichess sound files: Chess.com lists sounds as protected [C11]; the Lichess sound sets listed in its licence file are AGPL or CC BY-NC-SA [L9].
- Browsers block audio until the first click or tap [L11], so create the audio context on the first user gesture. Add a mute button, saved. Play the sound on the step buttons and on autoplay, not on page load.

### 6. "Fix your mistakes" retry mode (M, value 5) [approved]
- Why: biggest learning feature on both sites [C2] [L1] [A1].
- How, taken from how they behave:
  - Only your moves (username already stored), only the worst by win-chance swing, skipping Book moves [L1].
  - Show the position before your move, your bad move marked red, ask for a better move [L1]. Accept any move within a small win-% loss of the engine's best, not only the top move (Lichess confirms "if it's better" [L1]).
  - Hint ladder: first highlight the piece, then the square, then the full move and line. Chess.com offers several hint buttons plus Best [C2].
  - End screen: "you fixed 4 of 7", and an adjusted accuracy [C4].
  - Phase 2 (M): keep the missed positions in `localStorage` as "My mistakes" and bring them back later at growing gaps (the Chessable idea [X1]). This also gives you "puzzles from your own games" (Aimchess [A2]) without a puzzle database.
- Needs: item 1 (Book skip). Can reuse the existing "try moves" board and engine queue.

### 7. Rule-based "why" explanations (M, value 5)
- Why: Chess.com's Coach names the threats and pieces involved [C3] and at launch the unlimited version was a top-tier perk [C4]. DecodeChess is built on explaining the "why" [D1]. Our app can give a free, unlimited version.
- How, only say what can be checked with chess.js and the engine data we already have (top-3 lines before the move, eval after it, and `seeLoss` in notation.ts):
  1. Missed mate (best line was mate for you, you played something else).
  2. Allowed mate (after your move the opponent has mate).
  3. Left a piece capturable for free (static exchange loss of 2 or more after your move).
  4. Missed a free capture (best move wins material and yours did not).
  5. Fallback: "The position went from +1.2 to -0.8" with the best move in plain words.
- Never write an idea the data does not show. Each rule gets unit tests. Where nothing fits, use the fallback.
- Pair with hover highlights (words in the text draw arrows or squares, as in Chess.com [C3]).

### 8. Import by username: Chess.com and Lichess (M, value 5) [approved, in progress]
- Why: removes the copy and paste step; both services publish finished games for free.
- Chess.com: list archives at `/pub/player/{user}/games/archives`, then one month at `/games/{YYYY}/{MM}` (JSON) or `/pgn` [C12]. Use one request at a time (parallel requests can get 429) and let the browser cache [C12]. Skip variant games; how they are flagged in the JSON is **unconfirmed**.
- Lichess: `/api/games/user/{user}?max=...`, streamed as ndjson or PGN, anonymous allowed (about 25 games per second) [L10]. Leave `ongoing` off (it is off by default [L10]).
- Show a list (date, opponent, result, time control, opening if known), pick a game, go.
- **Before building:** do a 30-minute spike that calls both APIs from the deployed site. CORS is **unconfirmed** for both (docs are silent [C11] [L10]). Two hints only: Lichess opening-explorer error replies carried permissive CORS headers [L5], and the Lichess API docs list a browser demo app [L17]; neither proves the games endpoint. If CORS fails: fall back to file upload or paste (item in the table) and say so plainly in the UI. A proxy server is not an option for this project.
- Rules to follow: [C11] asks for non-commercial, independent tools; no undocumented endpoints; and "clearly differentiated from Chess.com's own products in look, feel, and naming". See section 10.

### 9. Annotated PGN download and a share link (M, value 4) [approved]
- Why: lets people keep the review, send it to a coach, or open it elsewhere. Lichess exports eval comments [L10] and offers PGN download and shareable analysis URLs [L2].
- How: export the mainline with a move glyph per class (standard PGN glyph codes: `$1` !, `$2` ?, `$3` !!, `$4` ??, `$5` !?, `$6` ?!; from the PGN standard, not re-fetched here), a short comment with the best move for mistakes, `[%eval 0.35]`-style comments (the form Lichess exports use; format not re-fetched here), and the opening in headers. Add a "Download .pgn" and "Copy PGN" pair.
- Share link: put the compressed game in the URL **fragment** (the part after `#`), which is never sent to a server and fits the "nothing leaves this page" promise in the footer. Keep it to moves and names, then re-run analysis on open (or add centipawns only if the link stays short). Maximum URL length across messaging apps is **unconfirmed**; test.
- Later: read `[%eval]` and `[%clk]` back on import so a Lichess-analysed game can open instantly (but one eval per position is not enough for Great/Brilliant, which need the second-best move, so mark that as a partial result).

### 10. Show the engine's line (M, value 4)
- Why: "Show Line" is one of the first things Chess.com added [C4]; Lichess shows the line, not only the first move [L2]. A first move alone cannot answer "and then what?".
- How: keep the whole `pv` in `EngineLine` (change the regex at engine.ts line 176), show it as 4 to 6 words-and-SAN steps under the best move, click a step to play the line on the board (reuse "try moves"), and a "Play line" button that animates it. Use it in the retry mode ("show me") and in the Engine tab.

---

## 7. Next batch (not in the top 10)

| Item | Effort | Value | Note |
|---|---|---|---|
| Per-phase accuracy and a short report card | M | 3 | Needs a simple phase rule (for example by material left). Chess.com [C3], Lichess [L8] |
| Time chart from `[%clk]` | M | 3 | Only for imported games that carry clocks. Chess.com chart [C7] |
| Threats toggle | M | 3 | Ask the engine for the opponent's best reply after a pass; not possible when in check. Lichess `x` [L3] |
| "Miss" label | S | 2 | Plain word, own icon (see section 10) |
| Piece styles | M | 3 | Draw our own SVG set. See licence note below |
| Settings gear (arrows, coordinates, animation, highlights, material) | M | 3 | Chess.com [C7], Lichess [L13] |
| Practice positions library | M | 3 | Our own FEN list with a goal line ("Win with White", "Hold the draw"), played against the full-strength engine. Write our own text, do not copy Lichess lesson text [L16] |
| Board editor | M | 3 | Chess.com and Lichess both have one [C6] [L2] |
| Saved notes and variations | L | 3 | Needs a move-tree model; do it when export needs it |
| Install / offline | M | 3 | Self-host fonts first |
| Stronger engine, full net, opt-in | M | 2 | See below |
| Maia for the "play at Elo" mode | L | 4 | See below |
| Opening trainer | L | 3 | Spaced repetition on your own lines |
| Puzzle library | L | 3 | Lichess puzzle data is CC0 but 6.2 million rows [L14]; would need a small curated subset |
| Coordinates trainer | S | 1 | Cheap filler |

Out of scope on purpose (needs a server, accounts, or live play): cloud analysis [C2], masters and player opening statistics (Lichess explorer was returning 429 errors from February 2026 and is expected to need a token [L5]), the 7-piece tablebase [L2] [L18], studies with sharing [L7], paid courses, Chess.com Skills, bots with ratings, any live-game feature.

**Stronger engines (approved).** Chess.com itself runs the lite engine in the browser by default and gates the 108 MB full net behind a setting [C10]. stockfish.js lists lite builds at about 7 MB and large builds over 100 MB; the multi-thread builds need special cross-origin headers, single-thread large builds are "also large" (exact size **unconfirmed**) [S1]. Our lite 7 MB files already grade games well. Suggest: do it last, as an opt-in "Deep mode" with a size warning and a cached download.

**Maia (approved).** Maia aims to predict the move a person of a given rating would play, not the best move [M1]. That is the right tool for "play against something that feels like a 1200". Maia v1 weights are GPL-3.0 and in Leela format [M2]; Maia-2 is MIT [M3]. A third-party write-up runs Maia-2 in the browser with ONNX Runtime Web [M4], but model size and a ready ONNX file are **unconfirmed**. It needs a spike before it is sized. It is L, and it is the best upgrade to the Elo mode: Maia's nine models cover 1100 to 1900 [M1], while today below 1320 our engine only imitates a weak player with deliberate mistakes.

**Piece art and licences (owner decision).** The rule is "no copying assets". Safest: draw an original SVG set, starting from the current glyph shapes. If you ever relax the rule for openly licensed third-party sets, use the original authors' releases under a licence a GPL-3.0 project can carry and credit them in the README. In Lichess's own licence list [L9], these are GPL-compatible: cburnett (GPLv2+), Merida (GPLv2+), Chessnut (Apache-2.0), Staunton by James Clarke (MIT), Maurizio Monge's sets (MIT), RhosGFX (CC0), mpchess (GPLv3+). Many others are CC BY-NC-SA, which a GPL project should not carry. I did not check that each is the author's original, so check before using any.

---

## 8. UI/UX patterns worth copying

Ideas only. Nothing here asks you to copy any code, image, sound or name.

**Layout**
1. One right-hand panel with tabs instead of a long stack of cards (Chess.com keeps Analysis, Review and Explore as tabs in the right panel [C5] [C8]). Reason: fewer scrolls and a place for new things (Retry, Report, Notes) without making the page longer.
2. A single "verdict" card under the board: move, label, eval, one sentence, best move (Chess.com Coach box [C2]; ours already exists). Reason: it is where eyes go, so add the "why" there (item 7).
3. Key-moment chips along the eval graph (Chess.com key moves [C2]). Reason: shows the shape of the game and gives one-click jumps.
4. A short report card at the end: both accuracies, phase grades, three key moments (Chess.com [C3]). Reason: gives a finish line to the review.
5. Hover a word in the explanation and the board draws the arrow or square (Chess.com [C3]). Reason: ties text to board without extra reading.

**Board feel**
6. Last-move highlight, legal-move dots, drag ghost: already here. Add an animation-speed and a coordinates setting (Lichess display options [L13]). Reason: some people find animation slow, some want none.
7. A move sound on every step, with a mute button (Chess.com and Lichess [C9] [L12]). Reason: sound makes autoplay feel alive and confirms taps on a phone.
8. Few, well-chosen themes (four boards, one or two piece sets) rather than 25 and 40 [L12]. Reason: choice without a settings maze.
9. Red mark on your bad move while you look for a better one (Lichess [L1]). Reason: the board itself tells you what to fix.
10. Show the opening name once and keep it visible while it still applies (Lichess [L4]). Reason: orients the player, costs one line.

**Move list and keys**
11. Click a move to jump, current move scrolls into view (both sites; ours already does). Add an inline compact mode for small screens (Lichess Shift+I [L3]).
12. One shortcut help card on `?` (Lichess [L3]). Reason: shortcuts nobody can find are not used.

**Phone**
13. One column, board first, controls in a bar the thumb can reach; first and last buttons on mobile [L8]. Reason: it is the main way people will use it.
14. Settings behind a gear on mobile (Chess.com [C2]). Reason: keeps the first screen about the board.
15. Collapse setup after loading. Reason: the textarea has done its job.
16. Large tap targets (the ux-reviewer already checks 40 px).

**Dark mode**
17. Three-way Light / Dark / System with a saved choice, plus a board palette that stays readable in both. Reason: the system setting is not always what someone wants at night.

**Not worth copying:** coach avatars and voice [C2], anything tied to a paid tier, bright animated rewards.

---

## 9. Changes to the owner-approved list

- **Move opening names to the very front.** It is S, the data is already in the repo, and the retry mode needs it to skip book moves [L1].
- **Do retry mode second, import third.** Retry works on pasted games today, so it does not wait for import. Import then feeds it real games.
- **Import: spike first.** Test CORS for both APIs from the deployed site; ship Lichess and Chess.com together (Lichess is almost free once the Chess.com list UI exists), and add file upload as the fallback.
- **Add three items that were not on the list and are clearly worth it:** (a) rule-based "why" text (item 7), (b) key moments with keys (item 2), (c) the engine line (item 10).
- **Split "themes":** the dark/light switch and board colours are S and belong near the front; piece styles are M and can wait.
- **Demote "stronger engines".** See section 7. Maia is worth more than a bigger Stockfish for this app, but it is L with unknowns, so it comes after the S and M items.
- **Phone layout:** do the S step (collapse the paste card, board first) right away; the rest later.

---

## 10. Risks and watch-outs

**Fair play.** The app is for finished games and practice.
- Importers must list finished games only. Chess.com's API returns finished Live and Daily games [C12]; Lichess leaves ongoing games out by default [L10]. Do not add the `ongoing` option, a "latest game" auto-refresh, or polling.
- Chess.com's API rules say tools must not give engine analysis, move suggestions or automation that could break its Fair Play policy; they are written for extensions, but the intent is the same [C11]. Keep the existing "do not use in a live or rated game" line in the page and README.

**Look and naming near Chess.com's.** [C11] lists as protected: board colour palettes, piece designs, sound effects, "move classification glyphs", feature names such as "Game Review", and UI/UX design, and asks that a tool be "clearly differentiated ... in look, feel, and naming". Our ten labels, their order and their badge symbols and colours (see `src/ui.ts` and styles.css) are close to Chess.com's, and the README says so. Confirmed from a page: Chess.com's Great is a blue single exclamation point [C4], which is what ours is too; the other badge shapes and colours I am recalling from memory, so treat them as **unconfirmed**. This is my reading of a help article, not legal advice. Cheap fixes, all S: our own badge shapes and colours, never the phrase "Game Review", a short "not affiliated" line near the import box (the README already has one), and keep "Miss" as plain words with its own icon. Please have the owner decide before import ships.

**API unknowns.** CORS for api.chess.com and lichess.org/api is **unconfirmed**. Chess.com asks for a recognisable User-Agent with contact details [C12]; browsers do not let a page set that header, so how strict this is in practice is **unconfirmed**. Lichess explorer calls are rate-limited and may need a token [L5], so do not build on them.

**Licences.** Project is GPL-3.0-or-later. Keep new data and art to CC0, MIT, Apache-2.0, GPL-compatible or original work. The openings table is CC0 [L15]. Lichess puzzle, evaluation and game exports are CC0 [L14].

**Honest labels.** Accuracy, game rating and the Elo scale are estimates. Keep the "approx." wording on any new number (performance rating especially).

---

## 11. Unconfirmed list (could not verify from a page I read)

- CORS behaviour of `api.chess.com/pub/...` and `lichess.org/api/games/user/...` from a browser page.
- Whether Lichess has a native "next mistake" key (the forum thread lists B/M/I as extension or proposal keys [L6]).
- Lichess's own dark/light background setting (the page I opened was a sign-in screen). Chess.com's background setting is confirmed [C9].
- Exact Chess.com phone Game Review layout; Chess.com keyboard keys beyond the arrow keys [C2]; whether real Chess.com PGNs carry `[%clk]` tags (only our test fixtures show them).
- Whether Chess.com Retry and Coach explanations are free or paid today. The Coach tier note is from a Nov 2022 release page [C4]; the "1 free review per day" line is from an undated terms page [C5].
- Aimchess free limits (two sources disagree [A1] [A2]); DecodeChess explanation limits [D1]; Chess Tempo free vs paid [X2].
- Size and format of a ready-made Maia ONNX model; size of the full single-thread stockfish.js build [S1].
- The DecodeChess "Explaining YOUR moves" page appeared in search but was not opened.
- Maximum shareable URL length across chat apps.
- Whether people value an offline/installable version (my idea; no competitor source).

---

## 12. Where we are already ahead

- No daily limit. Chess.com's free tier has a daily Game Review limit [C5]; ours is unlimited.
- Everything runs in the page; nothing is uploaded.
- Two-engine second opinion with a disagreement count (no equivalent found on the sites I read).
- Plain-words move descriptions everywhere ("Knight to f3, check").
- Play vs engine from 400 Elo up, with an honest note that below 1320 it is an imitation.
- "Try moves" from a replay with a clear "not the real game" banner.

---

## 13. Sources

Chess.com
- [C1] https://support.chess.com/en/articles/8572705-how-are-moves-classified-what-is-a-blunder-or-brilliant-move : move labels, expected-points bands, Great, Brilliant, Miss rules.
- [C2] https://support.chess.com/en/articles/8584089-how-does-game-review-work : key moments, Retry hints, settings, free vs premium, mobile gear, arrow keys, Coach voice.
- [C3] https://www.chess.com/news/view/chesscom-launches-game-review-v2 : report card with phase grades, hover-to-draw explanations, Miss, deeper explanations, new book data.
- [C4] https://www.chess.com/news/view/chesscom-releases-new-game-review : Show Line, key-move retries with adjusted accuracy, tier gating (page dated Nov 9, 2022).
- [C5] https://www.chess.com/terms/game-review : eval graph, game rating, Analysis / Review / Explore tabs, one free review per day.
- [C6] https://support.chess.com/en/articles/8583825-how-do-i-use-the-analysis-board : analysis board features, import, editor.
- [C7] https://support.chess.com/en/articles/8583757-how-do-i-use-game-analysis : charts (Score, Time, Best Move Diff, Themes), Interface settings.
- [C8] https://www.chess.com/news/view/announcing-explore-tab : Explore tab.
- [C9] https://support.chess.com/en/articles/8594320-how-do-i-change-my-background-board-and-pieces : board, pieces, background, sound settings.
- [C10] https://support.chess.com/en/articles/9462780-how-do-the-chess-engines-on-chess-com-work : Stockfish 18 full net on servers, lite default in browser, 108 MB.
- [C11] https://support.chess.com/en/articles/9650547-published-data-api : API rules, protected brand items, fair play.
- [C12] https://www.chess.com/news/view/published-data-api : endpoints, rate and caching notes.
- [C13] https://www.chess.com/puzzles : puzzle modes.

Lichess
- [L1] https://lichess.org/blog/WFvLpiQAACMA8e9D/learn-from-your-mistakes : how Learn from your mistakes works and how mistakes are picked (post dated Dec 22, 2016).
- [L2] https://mintlify.wiki/lichess-org/lila/features/analysis : analysis board features (third-party docs of the open-source repo).
- [L3] https://raw.githubusercontent.com/lichess-org/lila/master/ui/analyse/src/keyboard.ts : list of keyboard shortcuts (read only to learn which keys exist).
- [L4] https://lichess.org/@/lichess/blog/opening-explorer/Vs0xMTAA : opening explorer and opening name.
- [L5] https://github.com/lichess-org/lila/issues/19610 : explorer 429 errors, token plans, CORS headers present.
- [L6] https://lichess.org/forum/lichess-feedback/feature-offer--additional-keyboard-shortcuts-in-analysis : shortcut requests (B/M/I, R, Enter), not confirmed built in.
- [L7] https://lichess.org/study : studies.
- [L8] https://www.lichess.org/changelog : July and August 2026 entries (phase accuracy, mobile layout, first/last buttons, keyboard entry).
- [L9] https://raw.githubusercontent.com/lichess-org/lila/master/COPYING.md : licences of piece sets and sounds.
- [L10] https://mintlify.wiki/lichess-org/lila/api/users/games : games export endpoint, parameters, anonymous rate.
- [L11] https://lichess.org/faq : browsers block audio until a click; Tools and Learn menus.
- [L12] https://lichess.org/@/TotalNoob69/blog/customizing-lichess-pieces-boards-sounds-and-more-with-lichess-tools/1nQoshDg : about 25 boards and 40 piece sets built in.
- [L13] https://WWW.Ihsa.org/documents/ct/2020-21/ICCA LiChess Preferences.pdf : a school's list of Lichess display options (third-party, 2020-21).
- [L14] https://database.lichess.org/ : CC0 puzzles (6.2M), evals, games.
- [L15] https://github.com/lichess-org/chess-openings : CC0 openings table (files a-e.tsv, read by me: about 3,900 lines, 395 KB).
- [L16] https://lichess.org/practice : Practice lesson categories (checkmates, tactics, pawn and rook endgames).
- [L17] https://raw.githubusercontent.com/lichess-org/api/master/doc/specs/lichess-api.yaml : API intro, rate-limit advice, link to a browser demo app.
- [L18] https://lichess.org/@/TotalNoob69/blog/did-you-know-lichess-can-do-this-opening-explorer-and-tablebase/VNqhhHnD : explorer and tablebase on the analysis board.

Others
- [A1] https://apps.apple.com/us/app/aimchess-learn-chess-online/id1524941307 : reports, drills, Retry Mistakes, import sources.
- [A2] https://www.stork.ai/en/aimchess : third-party listing; puzzles from your mistakes, tiers.
- [A3] https://chess.com/blog/PixelatedParcel/free-insight-into-your-games : what the free Aimchess report shows.
- [D1] https://decodechess.com/stockfish-online-free-chess-analysis/ : explanation types, free features.
- [X1] https://chessentials.com/chessable-honest-review/ : MoveTrainer and spaced repetition (third-party review).
- [X2] https://en.chesstempo.com/memberships : menu items only.
- [X3] https://chessify.me/blog/features-and-benefits : free vs paid cloud engines.
- [X4] https://chessify.me/blog/best-websites-to-review-chess-games : roundup of review sites (vendor blog).
- [M1] https://www.maiachess.com/blog/maia-v1 : what Maia is.
- [M2] https://github.com/CSSLab/maia-chess : Maia v1 licence (GPL-3.0) and Leela-format weights.
- [M3] https://github.com/CSSLab/maia2 : Maia-2 licence (MIT).
- [M4] https://lichess.org/@/HollowLeaf/blog/integrating-maia2-the-human-like-chess-engine-into-my-chess-application/zi3EhDn5 : Maia-2 in a browser with ONNX Runtime Web (third-party).
- [S1] https://github.com/nmrugg/stockfish.js : lite vs large builds, sizes, threading note.
