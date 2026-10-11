# Tirpo's Chess

Free chess game analyzer and practice board. Runs Stockfish in your browser: grades every move
(Brilliant to Blunder), shows the best move with arrows and plain words, and lets you try your own moves.

> For study and practice. Do not use it during a live or rated game on any site: that is cheating.

## What it does

- **Analyze a game.** Paste a PGN or move list. Every move is graded: Brilliant, Great, Best, Excellent, Good, Book,
  Forced, Inaccuracy, Mistake, Blunder. Accuracy per side, evaluation graph, replay with smooth piece animation.
  The board flips automatically when you play Black (set your username).
- **Why this move?** Every analysed move gets plain-English reasons (hanging pieces, wins and trades, forks, forced mate,
  opening principles, the missed better move, and the engine's own follow-up line). Built from facts checked on the board plus
  Stockfish's evaluations, so quiet positional moves get an honest "positional" note rather than an invented story.
- **One engine dropdown.** Stockfish 19, 18 or 17.1 (lite); more models are planned.
- **Play the engine tab.** Live top-3 moves (plus a Brilliant hint when a sacrifice is among the best). The board shows
  one arrow at a time (tap or hover a move to switch), or all three, or none. Drag-and-drop or click-click moves,
  undo/redo, set up any position or finished game. Moving a piece on the empty first screen starts a game right away.
- **Play the engine at a chosen Elo (400-3200).** Uses Stockfish's built-in limiter down to 1320. Below that the
  engine adds deliberate mistakes (an estimate, not an official rating). Hints and analysis always use full strength.
- **Try moves from a replay.** Touch a piece during a replay to branch off into an analysis board, clearly marked
  as *not the real game*. One click returns you to the game.
- Right-click and drag to draw arrows; right-click a square to mark it; left-click to clear.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck
npm test           # unit tests + real-Stockfish integration tests + app flow tests
npm run build      # outputs dist/
```

Stack: TypeScript, React 18, Vite, chess.js, Vitest. Engines are Stockfish WASM builds in `public/engines/`,
each run in a Web Worker behind a one-job-at-a-time UCI queue (`src/core/engine.ts`).

```
src/core/        pure logic: classification, notation, pieces model, engine queue, strength limiter
src/hooks/       state: useAnalysis, usePlay, usePieces
src/components/  Board, panels
tests/           unit, engine integration (real Stockfish), jsdom app flows
```

## Deploy (Netlify)

Connect the repo in Netlify. `netlify.toml` already sets the build command (`npm run build`) and publish
directory (`dist`). Every push to `main` redeploys.

## Notes

- Move labels are close to, but not the same as, Chess.com's.
- Engines are the "lite" single-threaded Stockfish builds. The full-strength NNUE builds are very large; adding them
  (and human-like engines such as Maia) is planned.

## License

Copyright (C) 2026 AbdullahAlmatrfi

Tirpo's Chess is free software, released under the **GNU General Public License v3.0 or later** (see [`LICENSE`](LICENSE)).
It bundles Stockfish, which is GPLv3, so this project has to be GPL as well. You can use, change and share it, but anything
you distribute based on it must stay open under the same license.

### Third-party software

- **Stockfish** (GPL-3.0) - the chess engine. https://github.com/official-stockfish/Stockfish
- **stockfish.js** by Nathan Rugg (GPL-3.0) - the WebAssembly builds in `public/engines/`. https://github.com/nmrugg/stockfish.js
- **chess.js** (BSD-2-Clause) - move generation and rules. https://github.com/jhlywa/chess.js
- **React** (MIT) and **Vite** (MIT).

Not affiliated with Chess.com or Lichess. Please don't use this to get engine help in live or rated games.
