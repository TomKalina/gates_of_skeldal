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
- Character creation (`src/game/character-creation.ts`) merges chargen.c's two
  pages (portrait+wheel, then a full parchment character sheet) into one
  screen, and simplifies several things deliberately:
  - Uses a native `<input>` for the name field and `window.confirm` for the
    cancel prompt instead of the real GUI toolkit (#8/#9) and the exact
    `message()` dialog wording.
  - Button hit-testing is plain rects, not `CHARGENM.PCX`'s per-pixel mask —
    same placeholder pattern as the main menu.
  - Shows only the stats chargen.c itself rolls (STR/MAG/SPD/DEX, derived
    HP/mana/stamina, level, bonus points) — not the full `inv_display_vlastnosti()`
    character sheet (weapon skills, elemental resistances, food/water gauges),
    which depends on the equipment/inventory system (#14).
  - Party roster is append-only for now — no re-editing or deleting an
    already-added member (`view_another_click2`'s roster-slot editing and
    `gen_exit_editor`'s delete-mode aren't ported).
  - **Real discovery, worth keeping in mind for other sprite work**: chargen.c's
    `women[]`/`poradi[]` tables mean portrait-to-gender isn't a simple index
    threshold — portrait file 1 is female even though files 2-4 aren't (see
    `PORTRAIT_DISPLAY_ORDER` in `party.ts`). Also, sprite PCX files (`CHARxx.PCX`)
    use palette index 0 as a colorkey-transparent background (verified against
    the real `CHAR00.PCX`: index 0 is pure blue `(0,0,255)` and ~61% of pixels)
    — `decodePcx()` takes an opt-in `transparentIndex` option for this since
    plain background art has no such convention.
- First dungeon view (`src/formats/map-file.ts`, `src/game/dungeon.ts`,
  `src/game/dungeon-view.ts`): parses the real `.MAP` binary format (block
  container: `<BLOCK>\0` + int32 type + int32 size + ignored int32 + payload,
  terminated by `A_MAPEND`) and renders a first-person view from the parsed
  `TSECTOR`/`TSTENA` grid, with arrow-key turn/move. Real, meaningful
  simplifications from `engine1.c`/`engine2.c`/`builder.c`:
  - The original's "zoom tables" are a precomputed axis-aligned scaled-rect
    blit per depth/column (confirmed by reading `calc_points`/`create_tables`
    and the `sikma_*` blitters) — **not** raycasting — so `computeViewCells` +
    a geometric per-depth scale factor (`DEPTH_SCALE`) into `drawImage` is a
    structurally faithful port of the technique, just without the exact DOS
    pixel-stride tables.
  - Every surface uses its real decoded texture (not a flat average color —
    an earlier version of this file oversimplified here after too shallow a
    read of `engine1.c`). Front wall: `drawImage` into the depth-scaled rect,
    same as `show_cel2`. Side walls: a `ctx.clip()` trapezoid (matching the
    shape `show_cel`'s `yss`/`ysd` skew produces) with the real texture
    `drawImage`-stretched into its bounding box. Floor/ceiling: a handful of
    depth-banded trapezoids, each sampling a proportional horizontal slice of
    the (tall, pre-authored-as-a-strip) floor/ceiling texture — an
    approximation of `fcdraw`'s true per-scanline `T_FLOOR_MAP`/`T_CEIL_MAP`
    tables, not a literal port of them.
  - Known rough edge: a thin wedge of saturated color (green/yellow) has been
    observed at some depth-transition seams on receding side walls — not yet
    root-caused; may be a genuine colored-glass texture detail or a clip/seam
    artifact in the trapezoid math. Worth another look before calling the
    side-wall rendering done.
  - View-stopping uses `SD_PRIM_VIS` (is a wall texture rendered here) as a
    simple "opaque wall" test; the original also has door/arch/see-through
    nuance (`SD_LEFT_ARC`/`SD_RIGHT_ARC`, double-sided walls) this doesn't
    model. Movement passability correctly uses the *different* flag
    `SD_PLAY_IMPS` — verified against real map data that these two flags
    disagree on some sides (e.g. a side can render a wall image while still
    being non-blocking, or vice versa).
  - No smooth step/turn animation (`step_zoom`/`turn_zoom` in `realgame.c`) —
    moves and turns are instant. No items/mobs/niches/macros; those blocks
    are parsed only far enough to skip past in the file (`A_MAPITEM`,
    `A_MOBS`, `A_MAPMACR`, `A_MAPVYK`, `A_PASSW` are read but discarded).
  - The default starting map is `LESPRED.MAP` (`skeldal.c`'s `default_map`),
    not `SKELDAL.MAP` — verified from `new_game()`'s fallback path. `.MAP`
    files live loose under `data/maps/`, not inside `SKELDAL.DDL`; the same
    dev-only Vite route pattern as the DDL now also serves an allowlisted set
    of map files (`vite.config.ts`'s `ALLOWED_DEV_MAPS`) — no production
    fallback yet, that's part of the real asset-intake screen (#2).

## game/ (target `skeldal_main`, issue #10–#17 range)

| C source | Purpose | Planned TS home | Status |
| --- | --- | --- | --- |
| `skeldal.c` | app spine, config, resource registry, main loop | `src/game/main.ts` | pending |
| `realgame.c` | map state, per-tick update, actions, movement | `src/formats/map-file.ts` (`.MAP` parsing only — see note below), `src/game/dungeon.ts` (movement/view-cell logic) | in-progress, see note below |
| `souboje.c` | turn-based combat | `src/game/combat.ts` | pending |
| `enemy.c` | mob AI, pathing, sprite rendering | `src/game/mobs.ts` | pending |
| `kouzla.c` | spell system | `src/game/spells.ts` | pending |
| `inv.c` | items, inventory, stats, shops | `src/game/items.ts` | pending |
| `dialogy.c` | dialog bytecode interpreter + UI | `src/game/dialogs.ts` | pending |
| `gamesave.c` | save/load archive | `src/game/savegame.ts` | pending |
| `macros.c` | map action-script engine (A_MAPMACR) | `src/game/macros.ts` | pending |
| `specproc.c` | hardcoded special map procedures | `src/game/specproc.ts` | pending |
| `engine1.c` | pseudo-3D zoom renderer | `src/game/dungeon-view.ts` (simplified — see note below) | in-progress, see note below |
| `engine2.c` | blitters (walls, floors, sprites, anims) | `src/game/dungeon-view.ts` (simplified — see note below) | in-progress, see note below |
| `builder.c` | scene composition, minimap, bottom bar | `src/game/dungeon.ts` (view-cell traversal only) | in-progress, see note below |
| `automap.c` | automap screen, notes | `src/game/automap.ts` | pending |
| `globmap.c` | overworld travel map (GLOBMAP.DAT DSL) | `src/game/worldmap.ts` | pending |
| `kniha.c` | story book renderer | `src/game/book.ts` | pending |
| `interfac.c` | GUI widgets, message boxes, BFS pathfinder | `src/gui/interfac.ts` | pending |
| `clk_map.c` | mouse click-region dispatch | `src/game/clickmap.ts` | pending |
| `menu.c` | main menu | `src/game/main-menu.ts` | in-progress (placeholder slice, no assets/animation) |
| `setup.c` | settings screens | `src/gui/settings.ts` | pending |
| `chargen.c` | character generation | `src/game/attribute-wheel.ts` (wheel math), `src/game/party.ts` (rolling/roster), `src/game/character-creation.ts` (screen) | in-progress, see note below |
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
