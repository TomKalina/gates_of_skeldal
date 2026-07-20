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

### B1. True floor/ceiling mapping — **DONE** (2026-07-18)
Ported the real geometry: `engine1.c`'s `calc_points()` (→
`src/game/perspective.ts`'s `calcPoints`, an iterative integer-truncating
decay `v -= v/FACTOR_3D`, *not* a closed-form `pow` — replicated exactly,
`Math.trunc` matching C's `(int)` cast) and `create_tables()`'s floor/
ceiling `xl`/`xr` reprojection (`floorCeilBand`). Confirmed via a deep
source read (see port-graph.md) that `game/engine1.c`/`engine2.c` is the
real, actively-built engine (`libs/engine1.c` and both `engine2.asm` files
are dead legacy code, absent from every `CMakeLists.txt`), and that
`fcdraw`'s scanline-table/memcpy mechanism is a DOS-era optimization for a
*fixed-position, native-scale* blit — floor/ceiling textures are pre-baked
640-wide perspective art (640x199 floor, 640x93-ish ceiling, verified
against LESPRED.MAP's real PCX dimensions) always anchored to the same
screen position; only the per-cell *clip region* varies. Ported the
*visible result* (real per-cell trapezoid geometry + native-scale anchored
texture) via Canvas2D clip+drawImage, not the scanline-table/memcpy
technique itself, per this phase's own "simplify the technique, not the
result" rule. Replaces the single stretched-nearest-cell-texture image
with a per-visible-cell draw, so different sectors down a corridor now
show their own distinct floor/ceiling texture instead of one bleeding
across all of them (verified live: the forest floor's grass texture and
the start room's dirt floor no longer share one wrong stretched image).
**Known gap, not fixed here**: `computeVisibleGrid` only produces a cell
where recursion reaches it through a transparent side; a solid wall stops
it, so no floor/ceiling draws beyond it, unlike the real engine's
wall-visibility-independent minimap grid. Worked around (not fixed) by
layering the new accurate per-cell trapezoids on top of the old single-
stretched-image approximation as a base fill, so a room wider than the
transparent-reachable grid falls back to the old (still reasonable-
looking) behavior at the fringes instead of a black gap. `check_autofade`
(distance-fog fade baked into floor/ceiling textures on first use) is not
ported — noted as a B3-adjacent follow-up, not attempted.
Not done: bit-exact per-row match against a C-build screenshot (needs B0's
golden-parity harness, which doesn't exist yet) — verified instead via
Playwright screenshots against `docs/reference/*.png` by eye, consistent
with every other visual verification this port has done so far.

### B2. Exact wall geometry — **partially done** (2026-07-19)
Replaced the closed-form `DEPTH_SCALE`/`rectAtDepthLateral` with the real
`calc_points`-derived geometry (`perspective.ts`'s `wallCellBounds`,
mirroring `create_tables`' `x_table`/`z_table` loops): a lateral cell's
screen-space edges now come from `viewport_geometry[j][0][depth].x`
evaluated *directly at the target depth* (matching `x_table`'s formula
exactly), not reprojected from the depth-0 fan the way floor/ceiling's
`floorCeilBand` works — confirmed these are genuinely different formulas
in the source, not two ways of writing the same thing. Front walls, side
walls, and the door hit-test rect all now derive from the same
`wallCellBounds` calls that floor/ceiling's `floorCeilBand` also draws
from (same `viewport_geometry` table), so they meet at the same pixel by
construction — Y bounds are provably identical (`floorCeilBand`'s
ceiling-edge row and `wallCellBounds`' `yTop` use the exact same
`geometry[0][1][depth].y + MIDDLE_Y` expression). 5 new unit tests.
Verified live: the start room's wall/ceiling proportions now visibly match
`docs/reference/dungeon-table-scene.png` far more closely than the old
approximation (walls take up much more of the frame, matching the
reference's thin ceiling strip, instead of the old approximation's
oversized ceiling wedge); forest and door-swing scenes re-verified with no
regressions. One real regression caught and fixed during verification: with
taller/differently-proportioned wall rects, a previously-hidden gap opened
up — looking straight through the newly-opened forest door exposed a
stark black rectangle where the far (ceiling-less) outdoor cell's "sky"
should read, because `drawFloorCeilBase`'s single fallback split (see its
own comment) is derived from the *nearest* center-column cell only, not
this specific farther one. Not a new architectural bug, the same
already-documented "single fallback layer can't represent per-cell
differences along one column" gap from B1, just newly exposed by more
accurate wall proportions. Mitigated (not fixed) by changing the canvas's
base clear color from black to the same `#223` sky/ceiling-fallback color,
so any future gap of this shape reads as sky rather than a rendering hole
— the real fix (a wall-visibility-independent floor/ceiling traversal) is
the same deferred B1 follow-up, still not attempted.
**Not done**: `show_cel2`'s `plac` anchoring (`oblouk & SD_POSITION`,
vertical placement within a cell) and native-size blitting (textures still
stretch to fill the cell via Canvas2D `drawImage`, rather than drawing at
their table-derived native size with cropping) — niche-prop proportions
and off-center secondary walls (`xsec`/`ysec`) remain unfixed, still B2
scope. **Done when** (bit-exact golden-diff against a C build) still not
met — no B0 harness exists; verified instead via Playwright screenshots
against `docs/reference/*.png` by eye, same as B1.

### B0 (parallel, high leverage). Golden-parity harness (issue #3)
Patch the C build (`platform/sdl/`) with a debug key that dumps the
framebuffer to PNG; script a fixed walk; dump the same walk from the web
build via Playwright; pixel-diff in CI (assets stay local/gitignored).
**Done when**: `npm run parity` (or similar) produces a diff report for a
scripted walk of LESPRED.MAP.

### B3. Remaining side features
`SD_SHIFTUP` secondary-wall raising, `SD_SPEC` — checked against real
LESPRED.MAP data before considering: `SD_SHIFTUP`'s gate (`side_tag`,
TSTENA offset 3) is 0/1204, and its companion `xsec`/`ysec` fields
(offsets 6/7) show a constant baseline value (125, 80) across every
sampled side rather than meaningful per-side variance — genuinely inert
in this map's real data, not worth building against synthetic fixtures
only. `SD_SPEC` is 3/1204 (likely trigger/macro-related, A2b territory).
Both correctly deferred until another map's data makes them verifiable.

- **Distance shading (`SHADE_PAL`/`secnd_shade`/`MC_SHADING`) — DONE**
  (2026-07-19). A real, always-on effect: every wall/door/arch texture
  (`A_STRMAIN/LEFT/RIGHT/ARC/ARC2`) is unconditionally loaded via
  `A_FADE_PAL` in the real engine (`game/skeldal.c`'s `pcx_fade_decomp`),
  which bakes 5 depth-indexed palette variants into it — fading toward a
  per-map ambient/fog color (`A_MAPGLOB`'s `fade_r/g/b`, now `map-file.ts`'s
  `DungeonMap.fadeColor`) as depth increases, or straight to black for
  `MC_SHADING`-flagged sectors (`A_MAPINFO`, now `MapSector.shaded` — a
  real per-sector override, up to 29% of sectors in some shipped maps,
  confirmed by scanning every shipped map's raw block data, not assumed).
  `SHADE_STEPS=5` matches `VIEW3D_Z`(5) exactly — one flat shade bucket per
  depth level, not a continuous gradient (confirmed by deriving the exact
  blend ratio from `palette_shadow`'s formula: alpha = `3*depth/14` for the
  fade-to-map-color case, `depth/5` for fade-to-black). Ported as a
  Canvas2D alpha-overlay rect (`dungeon-view.ts`'s `applyDepthShade`)
  applied once per cell after all its layers (arch+main+sec, or the side-
  wall image) are drawn — mathematically identical to shading each layer
  independently before compositing (same alpha/target color per layer at a
  given depth is exactly distributive over alpha-over composition, not an
  approximation). Floor/ceiling correctly excluded — real source confirms
  they use a wholly different mechanism (`pcx_15bit_autofade`/`A_16BIT`).
  Verified live: forest scene shows a dramatic, clearly graduated fade
  from full-color near trunks to the pale forest-cyan horizon; the start
  room's near window (depth 0) stays completely untinted while a farther
  receding side-wall panel (deeper cell) shows one flat, depth-appropriate
  wash — confirms the "stepped, not gradient" behavior is working
  correctly, not over- or under-applied.

- **`oblouk & 0xf` arch textures — DONE** (2026-07-19). Ported
  `A_STRARC`/`A_STRARC2` block parsing (`map-file.ts`'s `archLeftTextures`/
  `archRightTextures` — same NUL-separated-filename-list format as every
  other texture bank, no new struct needed) and `draw_basic_sector`'s two
  `show_cel2` arch calls (`dungeon.ts`'s `archTextureIndex` + `ViewCell.
  frontArchLeftTexture`/`frontArchRightTexture`, gated by `SD_LEFT_ARC`/
  `SD_RIGHT_ARC` — 32-bit `flags` bits, *not* part of `oblouk`, confirmed
  via a dispatched research agent reading `draw_basic_sector` directly).
  Real, verified-present data: 623/1204 real sides in LESPRED.MAP have a
  non-zero `oblouk&0xf`, but only 218 also carry one of the gating flags —
  the rest are inert, confirming the gate is required, a non-zero index
  alone isn't sufficient. Drawn before the main/sec wall texture (matching
  `draw_basic_sector`'s call order) at the identical cell rect, no
  `SD_POSITION` shift (the source never applies `plac` to these two
  calls). `OBL2_NUM` (right half) is drawn via `show_cel2`'s `rev==2`
  branch, which mirrors the *destination write direction*, not the source
  pixels (consistent with the earlier wall-mirror investigation's finding
  that the engine never reverses source pixel order) — replicated by
  baking an ordinary horizontal flip into every `archRight` texture once
  at load time (`codecs/pcx.ts`'s `flipImageDataHorizontally`), same
  "port the result, not the technique" approach as the vertical flip and
  the floor/ceiling/wall geometry. Verified via direct decode that
  `LES1W06B.PCX`/`LES1W06C.PCX` (this map's arch textures) are genuinely
  distinct hand-painted assets, not identical mirror-copies of each other
  — both need the second colorkey index (0), same convention as the
  ordinary side-wall bank, confirmed by decode. 6 new unit tests (3 in
  `dungeon.test.ts` for the gating/index logic, 1 in `map-file.test.ts`
  for block parsing). Verified live: a real, visually dramatic tree-trunk/
  branch frame now appears in the forest scene (previously entirely
  unrendered) with no artifacts and no regressions in the start room, door
  swing, or tree orientation.

## Phase C — GUI toolkit (issue #9 remainder) — **done** (2026-07-19)

Correction to this plan's original premise: `libs/gui.c` (1005 lines) +
`libs/basicobj.c` (1346 lines)'s `OBJREC`/`WINDOW` object model
(rectangle-only hit-testing via `mouse_in_object()`) turned out to be a
dead end — neither `game/menu.c` nor `game/chargen.c` uses it at all
(`chargen.c` `#include`s the headers but never calls `define()`/
`button()`/etc.). Porting it would have added ~2350 lines of TS with no
consumer. **Not ported, on purpose.**

The real mechanism is `game/clk_map.c`'s `T_CLK_MAP` struct
(`{id,xlu,ylu,xrb,yrb,proc,mask,cursor}`) + `find_in_click_map()`
dispatch, combined with two tiny per-screen functions that index
directly into a decoded 8-bit PCX buffer — `menu.c`'s `promacknuti()`
(reads `MENUVOL5.PCX`) and `chargen.c`'s `go_next_page()` (reads
`CHARGENM.PCX`): raw palette index 0 = no hotspot, N = button N-1.
Ported 1:1 as `src/gui/hotspot-mask.ts` (`HotspotMask` + `hotspotAt`) —
decodes the same raw per-pixel index array `libs/pcx.c`'s `load_pcx`
produces (`codecs/pcx.ts`'s `decodePcx` now also exposes `.indices`).

- `menu-nav.ts`: `MENU_RECT` reverted to the real (loose) `T_CLK_MAP`
  outer rect `{220,300,206,177}` — an earlier session had narrowed it to
  compensate for the mask not existing yet; `hitTestMenu` is now
  mask-based, with `hitTestMenuBands` (equal 5-way split) kept only as a
  graceful-degradation fallback if `MENUVOL5.PCX` fails to load.
- `character-creation.ts`: added `CHARGENM_RECT` (`{520,378,120,102}`,
  matching `CHARGENM.PCX`'s real decoded dimensions exactly) and
  `hitTestChargenButtons()`, mask-driven with the same real button
  order (0=Přijmout, 1=Start hry, 2=Vymazat, 3=Vše znovu, per
  `lang/en/ui.csv:144-147`); the old `BUTTONS.*` rects are kept as the
  fallback and for drawing the highlight/gray-out boxes (a separate,
  unchanged concern from hit-testing).
- `FACE_GRID`/`WHEEL_RECT` confirmed **not** mask-driven — real source
  uses plain arithmetic (`select_xicht`'s grid math, `vol_vlastnosti`'s
  pearl-bbox+atan2) — left untouched.
- Verified live: both `MENUVOL5.PCX` (206×178, 5 hand-painted bands) and
  `CHARGENM.PCX` (120×102, 4 bands) are genuinely non-rectangular —
  ~31%/~50% of each mask's own bounding box is unpainted background
  (raw index 0) even though it's the real button art, not dead space a
  rect approximation would have caught. Clicked through New Game →
  chargen erase → roll → accept → Start hry end-to-end against the real
  masks (Playwright), 0 console errors, reached the dungeon view with
  the created character in the roster.

## Phase D — World content (issues #6, #13, #14 parts)

- **D1. Placed items** — **done for `A_MAPITEM`/`draw_placed_items_normal`**
  (2026-07-19); `A_MAPVYK`/`draw_vyklenek` (niche items) still pending, see
  port-graph.md's Phase D1 entry for the exact split and why.
- **D2. Inventory screen** (`game/inv.c`) on the C-phase toolkit.
- **D3. Map switching** — **done for the in-world MA_LOADL/MC_PASSFAIL
  wall-transition case** (2026-07-19; see port-graph.md's Phase D3 entry).
  There's no separate `A_CHANGE_MAP` action family — map switches turn out
  to be one opcode (`MA_LOADL`) of `game/macros.c`'s ~40-opcode map-script
  VM (A2b, still unported in general). `GLOBMAP.DAT` (`game/globmap.c`,
  the overworld fast-travel screen) is a distinct, separate feature — still
  pending.
- **D4. Text decode** — **done for `.ENC` level texts +
  `MA_TEXTL`/`MC_PASSSUC` display** (2026-07-19; see port-graph.md's Phase
  D4 entry). `A_DISPLAY_TEXT` (the do_action-level text action) still has
  zero real uses across every currently-loadable map — actual level text
  is shown almost entirely through macro instructions instead, and only
  the `MC_PASSSUC` (walked through successfully) trigger is wired; the far
  more common `MC_TOUCHSUC` (clicking a wall) needs a general wall-click
  primitive (`game/realgame.c`'s `a_touch()`) this port doesn't have yet —
  same prerequisite A3 already flagged for `SD_AUTOANIM` bump-doors.
  `MA_TEXTG` (the separate global `texty[]` table) hasn't turned up in any
  loadable map either — unsupported, undecoded.

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
- **Resolved** (2026-07-19): wall geometry now uses the same real
  `calc_points`-derived table as floor/ceiling (`wallCellBounds`,
  `perspective.ts`) instead of the old `DEPTH_SCALE` closed-form
  approximation — the two provably align vertically by construction.
- `computeVisibleGrid`'s transparency-gated traversal means floor/ceiling
  can't be drawn accurately beyond a solid wall (no cell exists there) —
  worked around with a full-viewport fallback layer underneath the
  accurate per-cell draws (see B1 above); a real fix needs a wall-
  visibility-independent floor/ceiling traversal, which is its own
  B2-adjacent task.

**Resolved** (2026-07-18, see port-graph.md): the red slivers at tall
forest-texture edges and the candle flicker in the start room were *not*
B2 stretching — both were colorkey bugs (left/right bank missing its
second reserved index; the niche-animation double-key only covering the
map-load-time frame instead of the whole cycle).
