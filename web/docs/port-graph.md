# C → TypeScript port graph

Mapping of every C/C++ module the CMake build actually compiles to its planned TS home.
Status values: `pending` → `in-progress` → `ported` (tests green) → `verified` (golden
parity vs C build where applicable). Updated as issues close.

## Global porting caveats

- Root `CMakeLists.txt` compiles with **`-funsigned-char`** — every C `char` is
  unsigned. Treat all byte reads as `u8`; never sign-extend.
- All binary formats are **little-endian**, packed structs, DOS heritage.
- Framebuffer is **RGB555** (`uint16`); the presenter converts to RGBA once per frame.
- Czech text uses the **Kamenický** DOS encoding (`libs/cztable.c`).
- Control flow relies on a **cooperative task/event/timer framework**
  (`libs/event.c`, `platform/legacy_coroutines.cpp`); TS equivalent is issue #7.
- ~120 extern mutable globals in `game/globals.h` carry game state; the TS port
  consolidates them into explicit state objects (issue #11).
- Early vertical slice (`src/game/main-menu.ts`) jumps ahead of strict issue
  order to get a click/keyboard-navigable main menu on screen before the real
  platform kernel (#7) and graphics lib (#8) exist. It uses a plain Canvas2D
  context and a hardcoded 5-way band split standing in for the real per-pixel
  `MENUVOL5.PCX` hotspot mask. Real `MAINMENU.PCX`/`LOGO00.PCX` art is decoded
  and drawn (via `src/formats/ddl-archive.ts` + `src/codecs/pcx.ts`). In dev,
  `vite.config.ts` serves the developer's own `data/SKELDAL.DDL` at
  `/dev-data/SKELDAL.DDL` (dev server only, never bundled into a build) and
  `main.ts` auto-fetches it on load — no click needed. Falls back to a plain
  `<input type=file>` prompt (`src/platform/asset-source.ts`) when that route
  404s, which is also the only path in a real deployment until the real
  OPFS-backed intake screen (#2) lands. Replace the band-split hit-test and
  the fallback file picker when #2/#8 land.

## game/ (target `skeldal_main`, issue #10–#17 range)

| C source | Purpose | Planned TS home | Status |
| --- | --- | --- | --- |
| `skeldal.c` | app spine, config, resource registry, main loop | `src/game/main.ts` | pending |
| `realgame.c` | map state, per-tick update, actions, movement | `src/game/realgame.ts` | pending |
| `souboje.c` | turn-based combat | `src/game/combat.ts` | pending |
| `enemy.c` | mob AI, pathing, sprite rendering | `src/game/mobs.ts` | pending |
| `kouzla.c` | spell system | `src/game/spells.ts` | pending |
| `inv.c` | items, inventory, stats, shops | `src/game/items.ts` | pending |
| `dialogy.c` | dialog bytecode interpreter + UI | `src/game/dialogs.ts` | pending |
| `gamesave.c` | save/load archive | `src/game/savegame.ts` | pending |
| `macros.c` | map action-script engine (A_MAPMACR) | `src/game/macros.ts` | pending |
| `specproc.c` | hardcoded special map procedures | `src/game/specproc.ts` | pending |
| `engine1.c` | pseudo-3D zoom renderer | `src/engine/engine1.ts` | pending |
| `engine2.c` | blitters (walls, floors, sprites, anims) | `src/engine/blitters.ts` | pending |
| `builder.c` | scene composition, minimap, bottom bar | `src/engine/scene.ts` | pending |
| `automap.c` | automap screen, notes | `src/game/automap.ts` | pending |
| `globmap.c` | overworld travel map (GLOBMAP.DAT DSL) | `src/game/worldmap.ts` | pending |
| `kniha.c` | story book renderer | `src/game/book.ts` | pending |
| `interfac.c` | GUI widgets, message boxes, BFS pathfinder | `src/gui/interfac.ts` | pending |
| `clk_map.c` | mouse click-region dispatch | `src/game/clickmap.ts` | pending |
| `menu.c` | main menu | `src/game/main-menu.ts` | in-progress (placeholder slice, no assets/animation) |
| `setup.c` | settings screens | `src/gui/settings.ts` | pending |
| `chargen.c` | character generation | `src/game/chargen.ts` | pending |
| `sndandmus.c` | game-side sound/music control | `src/audio/game-audio.ts` | pending |
| `console.c` | debug console | `src/game/console.ts` | pending |
| `gen_stringtable.c` | string table generation | `src/game/strings.ts` | pending |
| `advconfig.c` | advanced config | `src/platform/advconfig.ts` | pending |
| `temp_storage.cpp` | in-memory temp virtual filesystem | `src/platform/temp-storage.ts` | pending |
| `lang.c` | language/localization | `src/game/lang.ts` | pending |
| `ach_events.c` | achievement events | `src/game/achievements.ts` | pending |
| `dump.cpp` | debug state dump | `src/game/debug-dump.ts` | pending |
| `resources.cpp` (generated) | embedded default font + icon (base64) | `src/gfx/builtin-resources.ts` | pending |

## libs/ (target `skeldal_libs`, issues #4–#8, #12)

| C source | Purpose | Planned TS home | Status |
| --- | --- | --- | --- |
| `bgraph2.c` | 2D blitting/drawing primitives | `src/gfx/bgraph.ts` | pending |
| `bgraph2a.c` | more blitting primitives (alpha/effects) | `src/gfx/bgraph.ts` | pending |
| `memman.c` | resource handle cache / lazy loader | `src/platform/resources.ts` | pending |
| `event.c` | cooperative task/event framework | `src/platform/events.ts` | pending |
| `devices.c` | input device abstraction | `src/platform/devices.ts` | pending |
| `bmouse.c` | mouse cursor handling | `src/platform/mouse.ts` | pending |
| `gui.c` | GUI object core | `src/gui/core.ts` | pending |
| `basicobj.c` | basic GUI widgets | `src/gui/basicobj.ts` | pending |
| `inicfg.c` | INI config parser | `src/io/ini.ts` | pending |
| `pcx.c` | PCX-family image decoder | `src/codecs/pcx.ts` | ported (RLE + palette decode; validated pixel-for-pixel against real `MAINMENU.PCX`/`LOGO00.PCX` via a throwaway script, see #4/#5) |
| `mgifmem.c` | MGIF video decoder (memory) | `src/codecs/mgif.ts` | pending |
| `mgifmapmem.c` | MGIF mapped-memory variant | `src/codecs/mgif.ts` | pending |
| `mgifplaya.c` | MGIF playback + audio sync | `src/codecs/mgif.ts` | pending |
| `wav_mem.c` | WAV loading | `src/codecs/wav.ts` | pending |
| `music.cpp` | MUS music playback | `src/audio/music.ts` | pending |
| `cztable.c` | Kamenický encoding tables | `src/io/kamenicky.ts` | pending |
| `strlite.c` | string helpers | `src/io/strings.ts` | pending |
| `string_table.cpp` | string table container | `src/io/string-table.ts` | pending |
| `file_to_base64.cpp` | build tool | not ported (build-time only) | excluded |

## Archive format (reference: `tools/ddl_ar_class.cpp`, issue #4)

Not part of `skeldal_libs`/`skeldal_main` — `tools/ddl_ar.cpp`/`ddl_ar_class.cpp` is
the standalone CLI that packs/reads the `.DDL` archive `skeldal.ini`'s
`[paths] data` entry points at. Ported to `src/formats/ddl-archive.ts`
(status: **ported**, unit-tested against a synthetic fixture and manually
validated byte-for-byte against the real `data/SKELDAL.DDL` on a dev machine —
2482 files, correct offsets for every entry probed).

## platform/ (targets `skeldal_platform` + `skeldal_sdl`, issues #2, #7, #12)

| C source | Purpose | Planned TS home | Status |
| --- | --- | --- | --- |
| `platform.cpp` | platform glue | `src/platform/platform.ts` | pending |
| `legacy_coroutines.cpp` | cooperative coroutine kernel | `src/platform/coroutines.ts` | pending |
| `timer.cpp` | timers | `src/platform/timers.ts` | pending |
| `config.cpp` | INI config access | `src/platform/config.ts` | pending |
| `file_access.cpp` | file access layer | `src/io/file-access.ts` (OPFS) | pending |
| `error.cpp` | error reporting | `src/platform/error.ts` | pending |
| `achievements.cpp` | achievements backend | `src/game/achievements.ts` (stub) | pending |
| `int2ascii.c` | int→string helpers | not needed (JS strings) | excluded |
| `istr.c` | string helpers | not needed (JS strings) | excluded |
| `getopt.c` | CLI arg parsing | not needed (browser) | excluded |
| `windows/`, `linux/`, `mac_os/` | OS save folder, file mapping, app start | replaced by browser platform (OPFS) | excluded |
| `sdl/sdl_context.cpp` | SDL window/renderer/texture, frame present | `src/platform/canvas-context.ts` | pending |
| `sdl/BGraph2.cpp` | SDL-side graphics glue | `src/gfx/presenter.ts` | pending |
| `sdl/input.cpp` | keyboard/mouse/gamepad input | `src/platform/input.ts` | pending |
| `sdl/sound.cpp` | audio output | `src/audio/output.ts` | pending |
| `sdl/sound_filter.cpp` | audio filters/resampling | `src/audio/worklet/mixer.ts` | pending |

## Not compiled by CMake — explicitly excluded (DOS-era leftovers)

`game/wizard.c`, `game/chargen2.c`, `game/transav.c`, `game/dlglib.c`,
`game/encrypt.c`, `game/serial.c`, `game/engine2.asm` — legacy files not referenced
by any CMakeLists; the TS port ignores them. Vestigial DOS-era serial-number/tamper
checks inside `interfac.c` (`start_check`, `check_number_1phase`) are not ported.
