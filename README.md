# Tirpo's Chess

Free chess game analyzer and practice board. Runs Stockfish in your browser: grades every move
(Brilliant to Blunder), shows the best move with arrows and plain words, and lets you try your own moves.

> For study and practice. Do not use it during a live or rated game on any site: that is cheating.

## What it does

- **Analyze a game.** Paste a PGN or move list. Every move is graded: Brilliant, Great, Best, Excellent, Good, Book,
  Forced, Inaccuracy, Mistake, Blunder. Accuracy per side, evaluation graph, replay with smooth piece animation.
  The board flips automatically when you play Black (set your username).
- **Engine picker + second opinion.** Stockfish 19, 18 and 17.1 (lite). Run two engines over the same game and see
  where they disagree.
- **Engine tab.** Live top-3 moves (plus a Brilliant hint when a sacrifice is among the best), best-move arrows,
  drag-and-drop or click-click moves, undo/redo, set up any position or finished game.
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
- Stockfish is GPLv3. Because this project bundles it, publish the project under GPL-3.0 as well.
