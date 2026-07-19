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
  screen. Rebuilt against 4 real reference screenshots of the original build
  (measured pixel-by-pixel: Czech stat-range labels `SÍLA:`/`U.MAG:`/`POHYB:`/
  `OBRAT:`, single dynamic roster box instead of a 6-slot grid, two-column
  stat-review layout incl. `Ochrany:`/weapon-bonus list/`Jídlo`+`Voda` gauges,
  button/wheel styling) — reference images kept locally under
  `docs/reference/` (gitignored, never committed — copyrighted game art), so
  future passes can re-measure without asking for screenshots again. Two
  compositing bugs turned up along the way, not specific to chargen: `ctx.
  putImageData()` overwrites pixels wholesale instead of alpha-compositing, so
  drawing a colorkey-transparent sprite with it (the body sprite over the
  arch, the wheel's pearl over the parchment) punched a solid block of
  whatever's behind the *canvas element* through the transparent area instead
  of revealing previously-drawn canvas content — fixed by drawing those via
  `ctx.drawImage()` off a cached offscreen canvas instead. Worth checking any
  future asset that combines colorkey transparency with layering over other
  canvas content.
  - Uses a native `<input>` for the name field and `window.confirm` for the
    cancel prompt instead of the real GUI toolkit (#8/#9) and the exact
    `message()` dialog wording.
  - Button hit-testing is plain rects, not `CHARGENM.PCX`'s per-pixel mask —
    same placeholder pattern as the main menu.
  - Attack/defense/actions, resistances, weapon-bonuses, and the Jídlo/Voda
    gauges show the fixed values `generuj_postavu` always sets for a fresh,
    unequipped level-1 character — not fabricated, just not tracked as
    per-character state since there's no equipment/game-clock system yet
    (#13/#14); same for the `[400]` exp-to-next-level bracket next to `Zk.`
    — no leveling table to compute it from yet.
  - Roster box's portrait thumbnail reuses the full-body `CHARxx.PCX` sprite
    squeezed into a small cell; the reference shows a proper face/bust crop
    there instead, but no separate bust-portrait asset has turned up yet.
  - Bottom panel is a flat fill — the reference renders it as a carved-stone
    panel (chain/skull column, rope carving, its own frame around "Vše
    znovu"); no asset hook exists for that art yet.
  - Party roster is append-only for now — no re-editing or deleting an
    already-added member (`view_another_click2`'s roster-slot editing and
    `gen_exit_editor`'s delete-mode aren't ported).
  - **Real discovery, worth keeping in mind for other sprite work**: chargen.c's
    `women[]`/`poradi[]` tables mean portrait-to-gender isn't a simple index
    threshold — portrait file 1 is female even though files 2-4 aren't (see
    `PORTRAIT_DISPLAY_ORDER` in `party.ts`). Also, sprite PCX files (`CHARxx.PCX`,
    `PERLA.PCX`) use palette index 0 as a colorkey-transparent background
    (verified against the real `CHAR00.PCX`: index 0 is pure blue
    `(0,0,255)` and ~61% of pixels; `PERLA.PCX`: index 0 is a pure red
    `(166,0,0)` and ~29% of pixels — same reserved slot, different paint) —
    `decodePcx()` takes an opt-in `transparentIndex` option for this since
    plain background art has no such convention.
- First dungeon view (`src/formats/map-file.ts`, `src/game/dungeon.ts`,
  `src/game/dungeon-view.ts`): parses the real `.MAP` binary format (block
  container: `<BLOCK>\0` + int32 type + int32 size + ignored int32 + payload,
  terminated by `A_MAPEND`) and renders a first-person view from the parsed
  `TSECTOR`/`TSTENA` grid, with arrow-key turn/move. Real, meaningful
  simplifications from `engine1.c`/`engine2.c`/`builder.c`:
  - The original's "zoom tables" are a precomputed axis-aligned scaled-rect
    blit per depth/column (confirmed by reading `calc_points`/`create_tables`
    and the `sikma_*` blitters) — **not** raycasting — so `computeVisibleGrid`
    + a geometric per-depth scale factor (`DEPTH_SCALE`) into `drawImage` is a
    structurally faithful port of the technique, just without the exact DOS
    pixel-stride tables. `DEPTH_SCALE` is now the real derived constant
    (`1 - 1/FACTOR_3D`, `FACTOR_3D=3.33` from `engine1.h`) — an earlier version
    used an eyeballed `0.62` that was never actually checked against the
    source.
  - **Real bug, fixed**: the view used to be a single straight-ahead column
    (depth only), stopping dead at the first side with any wall image drawn
    on it (`SD_PRIM_VIS`). Reading `builder.c`'s `create_minimap`/
    `crt_minimap_itr`/`render_scene` closely revealed the real renderer walks
    a full 2D grid — depth **and** VIEW3D_X lateral columns — recursing
    forward *and* sideways through any side flagged `SD_TRANSPARENT`,
    independent of whether that side also draws a wall image
    (`SD_PRIM_VIS`). Those are genuinely different questions: whether a wall
    texture is painted on a side, and whether geometry continues to exist
    and get computed past it — confirmed by `LESPRED.MAP`'s own start
    sector, whose west wall renders an opaque-looking decorative bracket
    sprite that's actually 61% colorkey-punched, with real sectors visible
    both through its transparent gaps *and*, more importantly, sideways
    through its transparent south/north sides (a window and an open
    doorway) — sectors that were never being computed or drawn at all
    before this fix. `computeVisibleGrid` in `dungeon.ts` now builds that
    full grid, and `dungeon-view.ts` renders every cell in it (farthest
    depth first, so nearer transparent walls' colorkey-punched holes reveal
    already-painted farther geometry), using a closed-form scale-and-shift
    for lateral position that mirrors `calc_points`'s per-depth recurrence
    (every lateral cell shrinks by the same per-depth factor as the center
    column, tiling edge-to-edge since each one starts exactly one
    unshrunk-viewport-width apart). `computeViewCells` is kept as a
    lateral-0-only wrapper for callers that don't need the full grid. Not
    yet ported: the original's `enter_tab`/`enter` bookkeeping that bounds
    how a lateral branch can re-cross back toward center (approximated here
    as "a branch may not cross back past the center column once committed
    to a side"), and `SD_LEFT_ARC`/`SD_RIGHT_ARC` door/arch nuance.
  - Every surface uses its real decoded texture (not a flat average color —
    an earlier version of this file oversimplified here after too shallow a
    read of `engine1.c`). Front wall: `drawImage` into the depth-scaled rect,
    same as `show_cel2`. Side walls: a `ctx.clip()` trapezoid (matching the
    shape `show_cel`'s `yss`/`ysd` skew produces) with the real texture
    `drawImage`-stretched into its bounding box.
  - Floor/ceiling: **not** depth-banded (an earlier version of this file
    sliced the texture into per-depth strips, on the assumption it was a
    tall perspective-encoded strip — wrong; decoding and looking at the real
    art, e.g. `LES1C01A.PCX`, showed a small *repeating* tile pattern, not a
    depth gradient). Now just the nearest cell's whole floor/ceiling texture
    stretched once over its entire screen region — simpler and correct for
    a repeating pattern. A faithful port of `fcdraw`'s true per-scanline
    `T_FLOOR_MAP`/`T_CEIL_MAP` tables (which do vary the source per row) is
    future work, and would also need to blend across cells with different
    floor/ceiling textures at different depths, which this doesn't.
  - Wall/decoration textures (main + side sets) reserve **palette index 1**
    as a colorkey-transparent background — confirmed with a pixel-count
    survey across all 102 real wall textures in `LESPRED.MAP`: index 1's
    share is either exactly 0% (unused, full-bleed art) or >11% (clearly a
    reserved background fill), never in between, so `decodePcx(...,
    {transparentIndex: 1})` is always safe to apply to these sets — no
    per-image heuristic needed. (Two earlier, more complicated attempts —
    "use the corner pixel's index", "use whichever index is globally most
    frequent" — both broke on real textures: the corner pixel isn't always
    background, e.g. `LES1W11B.PCX`; and full-bleed art can have an
    unrelated color be its single most frequent index at a similar or higher
    percentage than a real colorkey background, e.g. `LES1W01A.PCX`'s
    dominant shadow color at 23.8%. A texture-category-specific fixed index,
    verified against a large real sample, was more robust than any
    per-image inference.) This is a *different* index from the character
    sprites' colorkey (index 0) — the reserved slot is a per-asset-category
    convention, not a single global constant.
  - Movement passability uses the *different* flag `SD_PLAY_IMPS`, not
    `SD_PRIM_VIS` or `SD_TRANSPARENT` — verified against real map data that
    all three of these flags can disagree on a given side (e.g. a side can
    render a wall image, or be visually see-through, while still blocking
    movement, or vice versa in either direction).
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
  - **Real bug, fixed**: some slots in a map's main/left/right texture name
    list point at `EMPTY.PCX` — a 10×10 solid-white sentinel image (verified
    by decoding it directly: single color, `(255,255,255)`, no colorkey
    pixels at all), meaning "no texture on this side", not real art. Loading
    it like any other texture stretched a stark white rectangle across the
    wall/side it was assigned to (visible turning to face sector 18's south
    side in `LESPRED.MAP`). `loadTextureSet` in `main.ts` now skips any name
    matching `EMPTY.PCX` (case-insensitively) so that slot resolves to "no
    texture" and falls through to the plain fallback fill instead.
  - **Resolved**: the reference screenshot's floor-standing table (candle +
    quill/inkwell + scroll) turned out to be `LES1A23A.PCX` itself — the
    same texture previously (and wrongly) described here as "a wall-mounted
    bracket with a dangling candle-like ornament." Decoding it and flipping
    it top-to-bottom shows an unmistakable, well-composed table exactly
    matching the reference; what looked like "dangling ornaments below a
    shelf" the right way up is the quill and candle sitting on the
    tabletop, upside down. This asset (and its 3 animation siblings,
    `LES1A21A/22A/24A.PCX`) is authored top-to-bottom flipped relative to
    ordinary wall art — verified against the side's `oblouk` byte (TSTENA
    offset 2, previously unparsed): its `SD_HAS_NICHE` bit (`0x10`,
    `builder.c`'s `if (q->oblouk & 0x10) draw_vyklenek(...)`) is set on
    exactly this side, and an ordinary window texture with no niche bit
    renders right-side-up unflipped, so the flip is now applied whenever
    that bit is set (`dungeon.ts`'s `ViewCell.frontWallFlipped`,
    `dungeon-view.ts`'s `toDrawableFlipped`) rather than guessed from a
    filename pattern. Cross-checked against every `.MAP` file under
    `data/maps/` (22 maps, ~1200 sides total): only 4 sides anywhere set
    `SD_HAS_NICHE`, and only 2 of those have a real prim texture to flip.
    The second one, `SKRETI.MAP` sector 200's `SKREW02A.PCX` (a cave scene
    with cobwebs and a wood bridge/plank), is consistent with the same
    flip — the plank only sits at floor level, as a walkway should, in the
    flipped orientation — independently supporting the hypothesis on a
    different map and a visually much less table-shaped texture. Still
    only 2 real data points, so treat as strongly (not fully) confirmed.
    Combined with the 2D lateral-visibility fix above (which surfaced the
    window-left/bookshelf-right composite these render alongside), the
    reference's whole room now matches closely, including the red
    background patch that used to render around/behind the table:
    `LES1A23A.PCX` turned out to reserve *two* separate colorkey indices,
    not one — index 1 is the usual wall/decoration colorkey (61% of
    pixels), but index 0 is a second, distinctly-painted "background" red
    (27% of pixels) that isn't real content either. `decodePcx()`'s
    `transparentIndex` option now accepts an array; `main.ts` scans the map
    for niche-flagged sides (`nicheMainTextureIndices`) and decodes just
    their main-texture entries with both indices punched, leaving ordinary
    wall textures on the single-index convention. This is currently
    hardcoded to index 0 specifically (verified only against
    `LES1A23A.PCX`) — checked `SKREW02A.PCX` (the other real
    niche-with-a-texture example, `SKRETI.MAP`) for the same pattern and it
    does *not* hold: its dominant background index is 175, not 0, so this
    fix would not correctly punch out its background if that map were ever
    loaded (`SKRETI.MAP` isn't currently reachable in this port — only
    `LESPRED.MAP` is). A real per-texture "second background index" solution
    (rather than a hardcoded 0) is future work if/when another map is
    wired up.
  - **Correction (2026-07-19)**: the `SD_HAS_NICHE`-driven flip above turned
    out to be a coincidentally-correct diagnosis of the wrong mechanism.
    User report: "most wall texture on walls is still 180° rotated — doors,
    the cave entrance, trees" (with a screenshot of a rock archway rendering
    with the rock mass hanging down like a stalactite and a floor floating
    above it). Deep-read `game/engine1.c`'s `show_cel`/`show_cel2` (the real
    wall-texture blitters, confirmed active via `game/CMakeLists.txt` — the
    dead `libs/engine1.c`/`*.asm` files were checked and ruled out) via a
    dispatched research workflow: **the real engine never flips or mirrors
    front-wall texture pixel data for the ordinary `q->prim`/`q->sec` case,
    under any condition** — `rev` always resolves to the unmirrored branch
    for main-bank textures; `SD_POSITION` ("plac") only ever perturbs a
    vertical Y-anchor offset, never a mirror decision; the one real mirror
    case in the whole engine is the two receding *side* walls being drawn
    as screen-mirrored counterparts of each other (`LEFT_NUM` vs
    `RIGHT_NUM`), unrelated to this bug. Separately, `SD_HAS_NICHE` sides
    render through a completely different function (`draw_vyklenek` →
    `draw_item2` → `enemy_draw`, `engine1.c:1374`) with no `rev`/mirror
    parameter at all — meaning the previous "flip when niche-flagged"
    hypothesis was never actually modeling real engine behavior, it just
    happened to produce the right answer for `LES1A23A.PCX` by accident.
    Conclusion: **the flip is a per-asset authoring quirk with no map-data
    flag, PCX header field, or filename pattern that predicts it** — tried
    and ruled out: `oblouk`/`SD_HAS_NICHE` (doesn't correlate — most
    confirmed-needing-flip textures have no niche bit, while the
    niche-flagged table needed it anyway), PCX header `hdpi`/`vdpi` fields
    (found nonzero-matching-dimensions on both flip-needed and flip-not-
    needed files, e.g. `PRECW02A.PCX` and `LES1A11A.PCX` share the identical
    header pattern yet only one needs a flip), filename prefix (`LES1W03A`
    needs it, `LES1W01A`/`02A` don't). Resolved by decoding and visually
    judging every non-floor/ceiling texture LESPRED.MAP uses (main + left/
    right banks, ~74 files) against physical plausibility (door hinges/
    handles/thresholds at sensible heights, roof-over-wall not wall-over-
    roof, canopy-over-roots, archway-curving-up not hanging-down like a
    stalactite) — dispatched as a parallel visual-survey workflow, cross-
    checked by hand for a few (the workflow's own judgment on `PRECW02A`
    directly contradicted an earlier hasty read of mine; re-examining both
    orientations side by side, the workflow was right — a reminder that a
    "the flip looks obviously correct" read can itself be a snap-judgment
    error when the composition is ambiguous, same as this file's own
    earlier "trees are upside down" misdiagnosis turning out to be a
    colorkey bug). 27 texture names confirmed needing the flip this way
    (`main.ts`'s `VERTICALLY_FLIPPED_TEXTURES`) — a mix of thatched-roof
    hut doors (`LES1A03-06*`), the table/candle animation frames
    (`LES1A21-24A`, superseding the niche-flag mechanism), a rock archway
    (`LES1W03A`), thatch-roofed wall/window pieces (`LES1W15*`, `LES1W16*`,
    `LES1W18*`, `LES1W19*`), and a gate archway (`PRECW07A/B` — the
    screenshot's "cave entrance"; its sibling `PRECW02A`, a tree-canopy
    scene, does *not* need it, confirming this really is per-file, not
    per-prefix). The flip is now baked into the decoded `ImageData` once,
    at texture-load time, keyed purely by filename
    (`codecs/pcx.ts`'s `flipImageDataVertically`, called from `main.ts`'s
    `loadTextureSet`) — applying uniformly across all three texture banks
    (main/left/right) rather than being a per-side, per-cell runtime
    decision. `dungeon.ts`'s `ViewCell.frontWallFlipped`/`hasNiche()` and
    `dungeon-view.ts`'s `toDrawableFlipped` are deleted entirely; `main.ts`
    no longer needs to inspect `oblouk` to decide orientation (still reads
    it for the unrelated double-colorkey niche/door detection). Verified
    live: the start-room table still renders correctly (same flip
    mechanism, now name-keyed instead of niche-flag-keyed), and the reached/
    walkable area shows no regressions; the specific reported "cave
    entrance" (`PRECW07A/B`) sits in a backdrop-only sector not reachable by
    normal movement in this map (confirmed via BFS over `canStep`), so it
    couldn't be re-screenshotted directly — verified instead by confirming
    the exact same code path (name lookup → `flipImageDataVertically`) that
    demonstrably fixes the reachable, re-screenshotted cases also covers it.
    Known-incomplete for other maps (no signal exists to auto-detect new
    per-map flip lists — this is now the *second* hardcoded per-`LESPRED.MAP`
    exception list alongside the double-colorkey index one above; both will
    need revisiting once D3 makes other maps reachable).
  - **Real dungeon UI chrome**, added against a reference screenshot showing
    the actual top/bottom bars: the top status bar is one real asset,
    `TOPBAR.PCX` (640x16 — button/icon x-boundaries measured directly off it
    by scanning for its bevel-highlight seam columns, not estimated from a
    screenshot), with hit rects wired for KONEC (exits back to the main
    menu — the view previously had no exit at all) and ULOŽ/OBNOV (see
    below). NASTAVENÍ and the icon cells (fire/book/spell/food — presumably
    light/spellbook/magic/inventory menus) have no hit rects yet since none
    of those systems exist. The bottom bar shows one box per party member
    (portrait crop from `POSTAVY.PCX` via `portraits.ts`, level number, 3
    vertical resource bars, name strip) and the real D-pad art (`SIPKY.PCX`,
    142x102 — confirmed by direct decode to be the same diamond-arrows-around
    -a-skull control visible in the reference, not the compass rose the
    chargen wheel uses). `SIPKY_S/J/Z/V.PCX` are the same image with one
    arrow highlighted for mouse-hover feedback; their filenames are Czech
    compass letters (Sever/Jih/Západ/Východ = N/S/W/E) but the art always
    draws north-up, so they were mapped to *screen position*
    (top/bottom/left/right) rather than compass direction, wired to the same
    forward/back/turn-left/turn-right the arrow keys already used.
    `KOMPAS.PCX` (a sprite sheet of single-letter N/S/E/W tiles) was a false
    lead — it's some other direction-indicator, not this control.
  - The 3 resource bars (HP/stamina/mana, orange/green/blue by inferred
    convention) always read full — there's no combat/damage system yet to
    drive them, so every party member is always at full health by
    definition. The gold counter always reads 0 (no economy/loot system).
    The chain-and-skull decorative column left of the party boxes (matches
    the same still-missing asset noted for the chargen panel) is a flat
    fill.
  - ULOŽ/OBNOV are real, not stubs: a single implicit `localStorage` slot
    (`src/game/save.ts`) holding `{mapName, sector, direction, party}` —
    there's no save-slot picker UI, and no inventory/combat state exists
    yet to persist beyond position and the party's chargen-rolled stats.
    `Obnova pozice` on the main menu is wired to the same slot: it
    reconstructs a whole session from scratch (no chargen) using the
    save's own party, since unlike the in-session quick-load (which only
    repositions the already-live party) there's no party in memory yet at
    the main menu. Verified end-to-end live: create a character, walk
    somewhere, save, return to the main menu, click Obnova pozice — same
    party, same position, restored with zero console errors.
  - **Real, clickable doors**, added after a user report that there was no
    way to walk outside from the starting building. `TSTENA`'s `action`
    byte (offset 15, previously unparsed) drives `do_action()`'s action
    codes in `realgame.c`; `A_OPEN_CLOSE` (3) is a toggle door. Scanning the
    whole map for non-zero `action` bytes found exactly 3 sides across 301
    sectors — a mirrored pair at sector 14 (east)/15 (west), 2 hops from the
    start, plus one unreachable elsewhere. Sector 15 has `ceil=0` (no
    ceiling — genuinely outdoors) vs. sector 14's `ceil=1`, and its own wall
    textures (`LES1W01A/02A.PCX`, unusually tall at 500x750) are a real
    forest scene — confirming this is exactly the "door to outside" gap.
    This door renders entirely through the *secondary* texture slot
    (`sec`/`secAnim`, gated by `SD_SEC_VIS`) — prim is 0 — which this port
    had never read at all before (`dungeon.ts`'s `visibleSecTexture`,
    `ViewCell.frontSecTexture`). The closed frame is `LES1A11A.PCX`; the
    real engine steps through the full 7-frame swing (`LES1A11A`..`17A.PCX`)
    one frame per tick via `SD_PRIM_FORV`/`SD_SEC_FORV` (`realgame.c`'s
    `calc_animations()`) — **ported for real in Phase A3** (`game/
    animation.ts`'s `stepSide`/`stepAllAnimations`, driven once per ~100ms
    tick by `dungeon-view.ts`'s own `requestAnimationFrame` loop, which also
    feeds the Phase A1 event kernel's `pumpTick()`). `toggleDoor()` now only
    flips the `FORV` direction flags (matching `do_action`'s `A_OPEN_CLOSE`
    case exactly); the frame count comes from `secAnim`'s low nibble (`sk`
    in the source), not a hardcoded offset, so it isn't tied to this one
    door's specific 7-frame length. Passability (`SD_PLAY_IMPS`) flips
    exactly on the tick the animation reaches its open/closed end — not
    instantly on click — matching the *timing* of the source's own
    `flag_map` restore mechanism, though not its generic mechanism (see
    `animation.ts`'s header comment for why: the source computes the
    restored flags from the triggering action's own parameter via
    `actn_flags()`, which needs the untraced input-to-`do_action` call
    path this port doesn't have). The open frame's doorway opening
    is index-0 colorkey, same double-colorkey pattern as the niche table
    (`main.ts`'s `doubleColorkeyMainTextureIndices`, extended to cover both).
    Clicking is a plain front-wall-rect hit-test against whichever cells in
    the current visible grid have `frontIsDoor` set — not the real per-pixel
    mask. Verified live: walking to the door, clicking it open, and walking
    through into the forest all work with zero console errors.
  - **Two real bugs, fixed, behind a user report of "the trees are upside
    down" plus "an occasional red flicker near the candle"**: neither was
    actually about orientation. Investigated by grid-lining both the raw
    decoded PCX and a live screenshot at the exact same scale and overlaying
    them on known texture-content landmarks (the canopy, a branch, the
    undergrowth) — pixel-for-pixel matches, proving `LES1W01A/02A.PCX` (and
    every other wall texture) render in their correct, un-flipped
    orientation. What actually reads as "wrong" is a genuine colorkey bug on
    two independent code paths:
    1. The left/right ("B"/"C") side-wall texture bank reserves palette
       index 0 as a *second* background matte on top of the usual index-1
       colorkey (`main.ts`'s `WALL_TRANSPARENT_INDEX`) — same double-key
       concept as a niche prop, but applying to the whole bank rather than
       conditionally. Confirmed via direct decode on the forest scene
       (`LES1W01B/C.PCX`, `LES1W02B/C.PCX`, the tree-trunk side walls just
       outside the new door) and, independently, on an indoor door's side
       view (`LES1A05B.PCX`, `LES1A01B.PCX`) showing the same red matte
       behind the door gap — confirming this isn't forest-specific. Index
       0's share is a continuous 0%–10% across the left/right bank (not the
       clean bimodal split index 1 has), but every sampled file, even at
       low single digits, turned out to be real background matte with no
       genuine content lost — so `main.ts` now always decodes the left/right
       banks with `[0, WALL_TRANSPARENT_INDEX]` (`SIDE_WALL_TRANSPARENT_INDICES`).
    2. The niche-prop double-colorkey (previous entry above) only added the
       texture index that happened to be the *current* animation frame at
       map-load time (`side.prim + (side.primAnim >> 4)`), not every frame
       in the cycle. The start room's table has a genuinely animated candle
       (`SD_PRIM_ANIM`, 4 frames), so 3 of its 4 textures never got the
       second colorkey and flashed their un-punched red background as the
       animation cycled through them — this was the reported "flicker".
       `doubleColorkeyMainTextureIndices` now walks the whole frame range
       (`primAnim`'s low nibble = frame count), mirroring how the door
       branch already handled its own frame sequence. Verified live by
       sampling 8 frames across the candle's animation cycle — no red in
       any of them, matches the reference screenshot's plain-wood room.
  - **Real bug, fixed**: `toggleDoor()` originally only mutated the clicked
    side, so walking through and looking back showed the door still
    closed. `do_action()`'s real trailing behavior — `if (q->flags &
    SD_APPLY_2ND && s->step_next[direct]) do_action(action_numb,
    s->step_next[direct], (direct+2)&3, flags, 1)` — replays the same
    action on the *opposite* side of the sector across it; both sides of
    this exact door carry `SD_APPLY_2ND`, confirmed by decoding the raw
    flags. `toggleDoor(map, sector, direction)` now takes the map and
    mirrors the open/closed state onto that opposite side too when the
    flag is set. Verified live: opening the door, walking through, turning
    around — the far side now shows its own correctly-swung-open door art
    (a different texture than the near side's, since each side of a real
    door is authored separately) instead of reading as still closed.

  - **Phase B1 — real floor/ceiling geometry** (`src/game/perspective.ts`,
    new). Deep-read `game/engine1.c`'s `calc_points()`/`create_tables()`
    and `game/engine2.c`'s `fcdraw` (the real, compiled implementation —
    confirmed via `game/CMakeLists.txt`: `libs/engine1.c` and both
    `game/engine2.asm`/`libs/engine2.asm` are dead legacy code, present in
    the repo but absent from every `CMakeLists.txt`; `libs/engine1.c` is a
    smaller-viewport predecessor with a 3-field `T_FLOOR_MAP`, no
    `txtrofs`, `VIEW3D_X=2`/`VIEW3D_Z=4` instead of the real `4`/`5`).
    Key finding: `calc_points()` is a real iterative, integer-truncating
    geometric decay (`v = (int)(v - v/FACTOR_3D)` applied to running x/y
    seeds each depth step, `FACTOR_3D=3.33`), not a closed-form `pow` —
    this port's earlier `DEPTH_SCALE = 1 - 1/3.33` closed-form (still used
    for wall geometry, see below) was always only an approximation of this
    exact sequence. Second key finding: floor/ceiling textures are
    pre-baked, screen-sized perspective art — verified against LESPRED.MAP's
    real files (`LES1F01A/B.PCX`, `LES1F06A/B.PCX` are all 640x199;
    `LES1C01A/B.PCX` are 640x93), matching the source's `F_YMAP_SIZE=199`/
    `C_YMAP_SIZE≈90` constants almost exactly — and `fcdraw`'s scanline
    table encodes a **fixed additive offset** between screen row and
    texture row (not a ratio), meaning the real renderer blits these
    textures at *native scale, fixed screen position*, varying only the
    per-cell clip region (`xl`/`xr`, reprojected from the undecayed
    near-plane lateral fan) — structurally identical to how this port
    already clips wall side-textures. Ported the *visible result* (real
    per-cell trapezoid + native-scale anchored draw via Canvas2D
    clip+drawImage) rather than the DOS-era scanline-table/memcpy
    technique itself, consistent with this phase's own "simplify the
    technique, not the result" rule — the per-scanline table was purely a
    DOS perf optimization for O(1) blit lookup, not part of the visible
    behavior. `perspective.ts`'s `calcPoints`/`floorCeilBand` replace the
    old single-stretched-image `drawFloorAndCeiling` (renamed
    `drawFloorCeilBase`, kept as a fallback layer — see below) with a
    per-visible-cell draw in `dungeon-view.ts`. 8 unit tests verify the
    decay sequence against hand-computed values and the reprojection
    formula's left/right mirror symmetry.
    **Verified live**: the start room's ceiling now shows genuine
    receding wood-plank perspective (previously a flat stretch) matching
    `docs/reference/dungeon-table-scene.png`'s look; the forest floor
    shows real converging grass-blade perspective instead of one stretched
    image; the door-swing and save/load flows re-verified with zero
    regressions.
    **Known gap, worked around not fixed**: `computeVisibleGrid`
    (`dungeon.ts`) only produces a `ViewCell` where the traversal reaches
    it through a `SD_TRANSPARENT` side — a solid wall stops the recursion
    entirely, so no floor/ceiling cell (and thus no accurate draw) exists
    beyond it, unlike the real engine's minimap grid which always covers
    the full lateral extent (`CF_XMAP_SIZE`) regardless of wall
    solidity, letting a nearer wall simply paint over what's behind it
    later. Fixing this needs a wall-visibility-independent floor/ceiling
    traversal — its own B2-adjacent task, not attempted here. Instead,
    `drawFloorCeilBase` (the old single-stretched-image logic, using the
    nearest center-column cell's texture) is drawn first as a full-
    viewport background layer, and the new accurate per-cell trapezoids
    are layered on top wherever a real cell exists — this was necessary
    because an early version that *only* drew the accurate per-cell
    layer left a visible black gap (a missing-ceiling cell's fallback
    fill painting a large flat-colored wedge into a region a `docs/
    reference/*.png` comparison showed should be fully wood-paneled).
    Also NOT ported: `check_autofade`'s distance-fog fade (baked into
    floor/ceiling textures on first use in the real engine) — noted as a
    B3-adjacent follow-up.
    Also NOT changed: wall geometry (`rectAtDepthLateral`/`DEPTH_SCALE`)
    still uses the old closed-form approximation — B2's explicit scope,
    not B1's. The two systems may not align to the exact pixel at cell
    boundaries until B2 lands; not visually jarring in current
    verification, flagged in EXECUTION-PLAN.md to re-check later.

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
