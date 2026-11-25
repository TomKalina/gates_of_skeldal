# Gates of Skeldal — TypeScript browser port

TypeScript rewrite of the C/C++ SDL2 port in this repository, targeting the browser.
Master plan and progress: [tracking issue #19](https://github.com/TomKalina/gates_of_skeldal/issues/19).

## ⚠️ Game assets are copyrighted

The game **source code** is MIT-licensed; the game **assets** (graphics, audio, maps,
texts, video) are not freely distributable. Hard rules for this directory:

- Assets are **never committed and never bundled** into the build.
- The app loads user-supplied original game files (DOS CD / Windows port) at runtime
  into OPFS via the asset-intake screen (issue #2).
- Test fixtures derived from assets are gitignored; only hash manifests are committed
  (issue #3 workflow).

## Development

Requires Node 22+.

```
npm ci
npm run dev        # dev server
npm run build      # typecheck (tsc --noEmit) + vite build
npm run typecheck  # tsc --noEmit only
npm run lint       # eslint
npm test           # vitest run
```

CI (`.github/workflows/web-ci.yml`) runs typecheck + lint + tests on every PR touching
`web/`. The C/C++ build is untouched by this workflow.

## Directory layout

```
src/
  io/            byte readers, DDL archive, BLOCK container, INI, encodings
  formats/       game-data parsers (.MAP, DAT tables, macros, dialogs)
  codecs/        image/video/audio codecs (PCX-like, MGIF, WAV)
  platform/      browser platform layer: scheduler, events, timers, storage, input
  gfx/           2D graphics library (bgraph port), RGB555 surfaces, presenter
  gui/           GUI toolkit, menus, dialogs
  engine/        pseudo-3D dungeon renderer (engine1/engine2/builder ports)
  game/          game logic (state, combat, items, spells, mobs, save/load)
  audio/         audio stack; audio/worklet/ holds the AudioWorklet mixer
```

The C-module → TS-module mapping with per-module status lives in
[`docs/port-graph.md`](docs/port-graph.md).

## Porting rules

- The C tree is the behavioral reference; it stays untouched and buildable.
- Every ported module lands with tests; parsers additionally get golden-parity
  fixtures produced by the C dump harness (issue #3).
- Global porting caveats (unsigned `char`, endianness, RGB555) are listed at the top
  of `docs/port-graph.md`.
