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

- **A2a. Complete `do_action` + action forwarding — mostly DONE** (2026-07-18).
  Done: `SD_APPLY_2ND` mirroring (see commit "mirror door toggle to the
  opposite side"); the 7 pure visibility-toggle actions —
  `A_SHOW_PRIM`/`A_HIDE_PRIM`/`A_SHOW_HIDE_PRIM`/`A_SHOW_SEC`/`A_HIDE_SEC`/
  `A_SHOW_HIDE_SEC`/`A_HIDE_PRIM_SEC` — in `src/game/actions.ts`
  (`applyAction`), unit-tested against the C source's exact semantics
  (no real map side uses any of them — a full-map scan found only
  `A_OPEN_CLOSE` in use anywhere — so these are spec-verified with
  synthetic fixtures, not real-map-verified, unlike this port's rendering
  code; documented in the module's own header comment).
  Deliberately NOT ported yet, with reasons: `A_OPEN_DOOR`/`A_CLOSE_DOOR`/
  `A_RUN_PRIM`/`A_RUN_SEC` set animation-direction flags
  (`SD_PRIM_FORV`/`SD_SEC_FORV`/`SD_PRIM_ANIM`/`SD_SEC_ANIM`) that only mean
  something once A3's per-tick stepper exists to consume them — do these
  together with A3, not before (an unconsumed flag-set is unverifiable
  dead code). `A_OPEN_TELEPORT`/`A_CLOSE_TELEPORT` need an actual
  teleport-on-step trigger this port doesn't have (part of A2b/gameplay
  loop territory). `A_CODELOCK_LOG*` chain into `check_codelock_log`
  (recursive `do_action` over `sector_tag`) — needs more design thought,
  not yet attempted. `A_DISPLAY_TEXT` needs level-text decode (D4) first —
  stub with a visible TODO marker when it's tackled, don't silently no-op.
  `SD_COPY_ACTION`/`SD_SEND_ACTION` forwarding also still unported
  (untested — no real map data hits them yet, unlike `SD_APPLY_2ND` which
  had a live example to verify against).
- **A2b. Macro VM interpreter** (separate, larger effort — do not start
  before A2a, A3, and ideally B1/B2 land, since several opcodes touch
  rendering/animation state those phases define): parse `A_MAPMACR`
  (`load_macros`/`read_macro_item`), port the opcode switch, wire
  `call_macro()`'s `MC_*` trigger dispatch (`MC_STEPON`, `MC_INCOMING`,
  `MC_SUCC_DONE`, `MC_ANIM`, `MC_OPENDOOR`, ...) into stepping-on-a-sector
  and clicking-a-wall (`realgame.c`'s `auto_action`). Consider porting
  opcodes incrementally, one at a time, verified against a real map
  reference that uses it, rather than all ~30 at once.

### A3. Per-tick side animation — **DONE** (2026-07-18)
Ported `calc_animations()`'s prim/sec stepping (`game/animation.ts`:
`stepSide`/`stepAllAnimations`) — both branches (one-shot clamped, e.g. a
door; continuous wrap/ping-pong via `SD_*_GAB`, e.g. an idling
decoration), frame count read from each side's own `secAnim`/`primAnim`
low nibble rather than a hardcoded offset. `toggleDoor()` now only flips
`SD_PRIM_FORV`/`SD_SEC_FORV` (matching `do_action`'s `A_OPEN_CLOSE` case);
the stepper carries the swing to completion and flips `SD_PLAY_IMPS`
exactly on the tick it finishes, not instantly. Driven once per ~100ms
(approximated — the real DOS timer-interrupt rate wasn't easy to pin down
from source, so this is a "looks natural" pick, not a measured constant)
by `dungeon-view.ts`'s own `requestAnimationFrame` loop, which also feeds
into A1's `pumpTick()`. 10 unit tests; verified live — the door genuinely
swings through intermediate frames (visibly ajar mid-click, forest peeking
through the gap) instead of snapping open.

**Scope correction**: the "Done when" originally expected `SD_AUTOANIM`
sides (e.g. the start sector's decorative bracket, which does have
`SD_PRIM_ANIM`+`SD_AUTOANIM` set) to "animate continuously" on their own.
Traced `SD_AUTOANIM`'s real meaning: `realgame.c`'s `a_touch(sector, dir)`
— the player-touched-this-wall handler — auto-fires `A_OPEN_CLOSE` when a
touched side has `SD_AUTOANIM` set. It's not "always animating," it's
"reverses direction when bumped into," and needs `a_touch` itself (wired
from movement collision, i.e. walking into a blocked wall) — a new input
path this port doesn't have yet. Correctly out of scope for A3 itself;
`a_touch` is natural A2a/A2b-adjacent follow-up, not filed as its own
sub-phase yet.

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

- Niche/table texture stretched to cell rect instead of native-scale
  anchored (B2's `plac`).
- Hardcoded second colorkey index 0 for niche/door/side-wall textures —
  works for LESPRED.MAP, known-wrong for SKRETI.MAP (index 175); revisit
  when D3 makes other maps reachable.

**Resolved** (2026-07-18, see port-graph.md): the red slivers at tall
forest-texture edges and the candle flicker in the start room were *not*
B2 stretching — both were colorkey bugs (left/right bank missing its
second reserved index; the niche-animation double-key only covering the
map-load-time frame instead of the whole cycle).
