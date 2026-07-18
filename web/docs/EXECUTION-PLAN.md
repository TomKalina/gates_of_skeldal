# Execution plan v2 — foundations-first port order

Strategy revision agreed 2026-07-18. Supersedes the *order* of the original
issue plan (#1–#18 scopes remain valid; this reorders and refines them).
Tracking issue: #19.

## Why the reorder

Three vertical slices exist (menu → chargen → dungeon view) and are close to
1:1 against reference screenshots. Two structural gaps now make every next
feature more expensive than it should be:

1. **Screens are being rebuilt from screenshot measurements** instead of
   porting the real GUI toolkit (`libs/gui.c` + `libs/basicobj.c`, ~2350
   lines total). Inventory alone (`game/inv.c`, 3279 lines — the largest
   file in the game) would take many hand-measurement iterations; with the
   toolkit ported, screens come from real data and are pixel-perfect by
   construction.
2. **The event kernel and macro interpreter don't exist.** The original runs
   everything (animations, timers, dialogs, map events) on a cooperative
   task system (`libs/event.c`) and routes all gameplay triggers through
   `game/macros.c` (916 lines) + `do_action()` (`game/realgame.c`). The
   port's door works but bypasses `call_macro` — every gameplay feature
   built without these foundations is an approximation that must be redone.

## Rules for the executing agent (read before every phase)

- **Faithful porting**: read the actual C function(s) before implementing.
  Simplify the *technique* (Canvas2D instead of DOS blitters), never the
  *visible result*. If a simplification is unavoidable, document it in
  `web/docs/port-graph.md` with evidence. See the memory file
  `feedback_faithful_porting.md` — this is a standing user requirement.
- **Verify everything live**: after each visual change, run a Playwright
  script (patterns in the session scratchpad; write new ones as needed),
  screenshot, and compare against `web/docs/reference/*.png` (gitignored
  reference screenshots of the real game — never commit them).
- **Gates before every commit**: `npm run typecheck && npm run lint &&
  npm test -- --run` — all green, no exceptions.
- **Git hygiene**: branch `ts-port/NN-slug` stacked on the previous one;
  conventional commits; stage specific files only (never `git add -A`);
  NEVER commit `README.md`, `web/package.json` (user-owned edits), game
  assets (`*.DDL`, `*.MAP`, `docs/reference/`), or scratch files.
- **Data-driven only**: no map-specific or screen-specific hardcoding.
  Everything reads from real assets/map data. Existing code shows the
  patterns (e.g. `doubleColorkeyMainTextureIndices` scans map data instead
  of hardcoding texture names).
- **C source is the spec**: `game/` and `libs/` in the repo root. Key files
  per phase are listed below. Line numbers drift; grep for function names.

## Phase A — Foundations (issues #7, #13)

### A1. Event/task kernel → `src/platform/events.ts` — **DONE** (2026-07-18)
Ported `libs/event.c`'s semantics as async/await (JS has no fiber/stack-
switch primitive; `add_task`/`task_wait_event` become `addTask`/
`waitForEvent`, same suspend-and-resume-at-the-call-site shape verified
against real call sites in `game/menu.c`/`game/chargen.c`). Also
`sendMessage`, timers (`setTimer`/`waitTicks`/`pumpTick`). 12 unit tests.
Not yet wired as the actual driver for anything else in the port — A3 is
its first real consumer.

### A2. Macro interpreter + complete `do_action` → `src/game/actions.ts`, `src/game/macros.ts`
**Scope correction (2026-07-18)**: `game/macros.c` turned out to be a
~30-opcode bytecode VM for map scripting (`MA_FIREB`, `MA_LOADL`,
`MA_CREAT`, `MA_IFJMP`, `MA_RANDJ`, `MA_GOMOB`, `MA_MONEY`, ... — item
creation, monster spawns, conditional jumps, dialogue/book triggers, a
`program_counter`-driven interpreter), not a small trigger dispatcher. Read
`load_macros`/`read_macro_item` and the opcode list before estimating
further — this is its own multi-session effort. Split accordingly:

- **A2a. Complete `do_action` + action forwarding — DONE** (2026-07-18,
  the `SD_APPLY_2ND` half; see commit "mirror door toggle to the opposite
  side"). Remaining from this sub-scope: `A_RUN_PRIM`/`A_HIDE_PRIM`/
  `A_SHOW_PRIM`/`A_SHOW_HIDE_PRIM` + the `SEC` equivalents, `A_CODELOCK_LOG*`,
  `A_OPEN_TELEPORT`/`A_CLOSE_TELEPORT` (all read in `do_action`'s switch,
  `game/realgame.c` — none ported yet except `A_OPEN_CLOSE`), plus
  `SD_COPY_ACTION`/`SD_SEND_ACTION` forwarding (untested — no real map data
  hits them yet, unlike `SD_APPLY_2ND` which had a live example).
  `A_DISPLAY_TEXT` needs level-text decode (D4) first — stub with a
  visible TODO marker until then, don't silently no-op.
- **A2b. Macro VM interpreter** (separate, larger effort — do not start
  before A2a, A3, and ideally B1/B2 land, since several opcodes touch
  rendering/animation state those phases define): parse `A_MAPMACR`
  (`load_macros`/`read_macro_item`), port the opcode switch, wire
  `call_macro()`'s `MC_*` trigger dispatch (`MC_STEPON`, `MC_INCOMING`,
  `MC_SUCC_DONE`, `MC_ANIM`, `MC_OPENDOOR`, ...) into stepping-on-a-sector
  and clicking-a-wall (`realgame.c`'s `auto_action`). Consider porting
  opcodes incrementally, one at a time, verified against a real map
  reference that uses it, rather than all ~30 at once.

### A3. Per-tick side animation
Port the prim/sec animation stepping (`realgame.c` ~740–790: `SD_PRIM_FORV`
/`SD_SEC_FORV`, `prim_anim`/`sec_anim` nibble counters, `SD_*_GAB`
ping-pong). Replace `toggleDoor`'s instant swap.
**Done when**: clicking the door plays the real 7-frame swing
(LES1A11A→17A), passability flips at the correct frame, `SD_AUTOANIM`
sides (e.g. the start sector's swinging bracket) animate continuously.

## Phase B — Renderer fidelity (issue #10 remainder)

### B1. True floor/ceiling mapping
Port `create_tables`' `f_table`/`c_table` + the floor/ceiling drawing
(`fcdraw`, `draw_floor_ceil` in `engine1.c`) — per-scanline, per-cell
source mapping with `check_autofade` edge fading. Replaces the single
stretched image.
**Done when**: side-by-side against a C-build screenshot, floors/ceilings
match per-row (not just "look similar").

### B2. Exact wall geometry
Replace the closed-form `DEPTH_SCALE`/`rectAtDepthLateral` with the real
`calc_points` + `x_table`/`y_table`/`z_table` values (`engine1.c`), and
implement `show_cel2`'s `plac` anchoring (`oblouk & SD_POSITION`) and
native-size blitting (textures draw at table-derived sizes, not stretched
to fill the cell). Fixes: niche-prop proportions, the red-sliver artifacts
on tall outdoor textures, off-center secondary walls (`xsec`/`ysec`).
**Done when**: golden-diff (B0) of the start room and the forest exit
matches the C build within a small pixel tolerance.

### B0 (parallel, high leverage). Golden-parity harness (issue #3)
Patch the C build (`platform/sdl/`) with a debug key that dumps the
framebuffer to PNG; script a fixed walk; dump the same walk from the web
build via Playwright; pixel-diff in CI (assets stay local/gitignored).
**Done when**: `npm run parity` (or similar) produces a diff report for a
scripted walk of LESPRED.MAP.

### B3. Remaining side features
`SD_SHIFTUP` secondary-wall raising, `oblouk & 0xf` arch textures
(`OBL_NUM`/`OBL2_NUM` sets, `A_STRARC`/`A_STRARC2` blocks), `SD_SPEC`,
distance shading (`SHADE_PAL` tables, `secnd_shade`, `MC_SHADING`).

## Phase C — GUI toolkit (issue #9 remainder)

Port `libs/gui.c` + `libs/basicobj.c` object model → `src/gui/core.ts`,
`src/gui/basicobj.ts`. Then re-render main menu and chargen through it
with per-pixel hotspot masks (`MENUVOL5.PCX`, `CHARGENM.PCX`), deleting the
hand-measured rects. **Done when**: both screens still pass their visual
verification, and all hardcoded rect constants are gone from
`menu-nav.ts`/`character-creation.ts`.

## Phase D — World content (issues #6, #13, #14 parts)

- **D1. Placed items**: `A_MAPITEM`/`A_MAPVYK` rendering
  (`draw_placed_items_normal`, `draw_vyklenek`, `calc_item_shiftup` in
  `builder.c`), `ITEMS.DAT` TITEM parse (222-byte records, `vzhled` at
  offset 140 — already researched, see port-graph.md).
- **D2. Inventory screen** (`game/inv.c`) on the C-phase toolkit.
- **D3. Map switching**: `A_CHANGE_MAP`-family actions + `GLOBMAP.DAT`
  (`game/globmap.c`) — walking between all 22 maps.
- **D4. Text decode**: `.ENC` level texts + Kamenický encoding
  (`libs/cztable.c`) — unblocks `A_DISPLAY_TEXT`, dialogs later.

## Phase E — Beings (issue #15)

`A_MOBS` parse + mob sprite rendering + AI (`game/enemy.c`), then combat
(`game/souboje.c`, 2795 lines) and spells (`game/kouzla.c`, 2205 lines).
Largest single block (~7400 lines); do not start before A–C are done.

## Phase F — Audio/video (issues #12, #16)

WAV SFX + MUS music via WebAudio (`game/sndandmus.c`, `libs/wav_mem.c`,
`libs/music.cpp`); positional sound; MGIF video (`libs/mgif*.c`).

## Phase G — Full save, parity replay, deploy (issue #18)

Extend `src/game/save.ts` toward the real `gamesave.c` state (2005 lines);
end-to-end parity replay vs the C build; performance; deploy per user's
global deploy conventions.

## Current known cosmetic debts (fix opportunistically in phase B)

- Red slivers at tall forest-texture edges outside the door (LES1W01A/02A —
  not a colorkey issue, likely B2 stretching).
- Niche/table texture stretched to cell rect instead of native-scale
  anchored (B2's `plac`).
- Hardcoded second colorkey index 0 for niche/door textures — works for
  LESPRED.MAP, known-wrong for SKRETI.MAP (index 175); revisit when D3
  makes other maps reachable.
