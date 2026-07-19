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
  context. Button hit-testing uses the real per-pixel `MENUVOL5.PCX` hotspot
  mask (see the GUI toolkit note under Phase C / `src/gui/hotspot-mask.ts`),
  falling back to an equal 5-way band split only if that asset fails to load.
  Real `MAINMENU.PCX`/`LOGO00.PCX` art is decoded and drawn (via
  `src/formats/ddl-archive.ts` + `src/codecs/pcx.ts`). In dev, `vite.config.ts`
  serves the developer's own `data/SKELDAL.DDL` at `/dev-data/SKELDAL.DDL`
  (dev server only, never bundled into a build) and `main.ts` auto-fetches it
  on load — no click needed. Falls back to a plain `<input type=file>` prompt
  (`src/platform/asset-source.ts`) when that route 404s, which is also the
  only path in a real deployment until the real OPFS-backed intake screen
  (#2) lands. Replace the fallback file picker when #2 lands.
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
    cancel prompt instead of the exact `message()` dialog wording (#9's
    per-pixel button hit-testing is done, see below — this remaining gap is
    just dialog chrome/styling, not hit-testing).
  - Button hit-testing uses the real per-pixel `CHARGENM.PCX` hotspot mask
    (0=Přijmout, 1=Start hry, 2=Vymazat, 3=Vše znovu), falling back to the
    old hand-measured `BUTTONS.*` rects only if that asset fails to load —
    see the Phase C note below and `src/gui/hotspot-mask.ts`.
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
  - **Second correction, same day**: after the fix above shipped, a live
    user report ("door is correct from outside now, but flipped when I'm
    inside; trees still flipped too") turned out to be a *methodology* bug
    in the visual survey, not a new orientation bug. The sector-15 door's
    8-frame swing (`sec=7`, `LES1A01A..08A`) had 4 of its frames
    (`LES1A03-06*`) misjudged as needing a flip — but the survey had
    decoded every candidate with only the ordinary single wall colorkey
    (index 1), not replicating `doubleColorkeyMainTextureIndices`'s second
    index for door/niche frames. Left un-punched, that second index paints
    a bright red sliver across the top of exactly these mid-swing frames,
    which reads as "this looks wrong" and gets misdiagnosed as an
    orientation bug rather than the unrelated colorkey bug it actually is.
    Re-decoding with the real double-key applied shows all 8 frames of both
    this map's doors read as one coherent, consistently-oriented swing —
    no flip needed anywhere in either door sequence; `LES1A03-06*` removed
    from `VERTICALLY_FLIPPED_TEXTURES`. Verified live from both sides of
    the door (opening from inside, closing from outside) — both correct.
    The generalizable lesson, now the actual "system" for judging any
    future texture's orientation, since a single ad-hoc visual read keeps
    proving unreliable on its own: (1) always re-decode with whatever
    colorkey treatment the texture will *actually* receive at render time
    (single-key, double-key-for-niche, double-key-for-door — check which
    applies) before judging orientation, never a plain single-key dump;
    (2) never judge one frame of a multi-frame sequence in isolation — a
    door/animation's frames must share one orientation by construction, so
    judge the whole sequence together and require internal consistency;
    (3) treat any survey verdict as provisional until cross-checked against
    an actual in-game screenshot of that exact texture, not just an
    isolated decoded PNG — the isolated-PNG view and the live composited
    view can read differently even for the identical pixels. ("Trees still
    flipped" from the same report was not independently reproduced — the
    reachable, walkable forest view was re-screenshotted and matches the
    reference's canopy-top/undergrowth-bottom composition; likely the same
    stale-browser-tab issue flagged earlier, or referring to a still-
    unverified texture outside the reachable area — flagged for the user
    to re-check with a hard refresh / a fresh screenshot if it recurs.)
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
    Also NOT changed at the time: wall geometry (`rectAtDepthLateral`/
    `DEPTH_SCALE`) still used the old closed-form approximation — B2's
    scope, done next (see below).
  - **Phase B2 — real wall geometry** (`perspective.ts`'s `wallCellBounds`,
    2026-07-19). Ported `create_tables`' `x_table`/`z_table` loops
    (`game/engine1.c`, quoted in full during the same investigation that
    settled the "does the engine ever mirror texture data" question — see
    the wall-mirror correction above): a lateral cell's screen-space left/
    right edges are `viewport_geometry[j][0][depth].x` evaluated *directly
    at the cell's own depth*, never reprojected from another depth — this
    is a genuinely different formula from floor/ceiling's `floorCeilBand`
    (which reprojects the undecayed depth-0 fan by a y-ratio), confirmed by
    reading both loops side by side in the source, not assumed. `dungeon-
    view.ts`'s `rectAtDepthLateral` (used by front walls, side-wall
    trapezoid corners, and the door hit-test rect) now wraps
    `wallCellBounds` instead of `DEPTH_SCALE ** depth`, keeping every
    existing call site's shape unchanged. Y bounds are provably identical
    to `floorCeilBand`'s (`geometry[0][1][depth].y + MIDDLE_Y` appears
    verbatim in both), so walls and floor/ceiling now meet at the same
    pixel by construction instead of two independently-tuned
    approximations happening to look close. 5 new unit tests (hand-
    computed against the same decay sequence `calcPoints`'s own tests use).
    Verified live: the start room's proportions now visibly track
    `docs/reference/dungeon-table-scene.png` much more closely (the old
    approximation rendered an oversized ceiling wedge; the reference shows
    a thin ceiling strip with walls taking up most of the frame, and so
    does the real-geometry result).
    **Real regression caught during verification, fixed**: taller/
    differently-proportioned wall rects exposed a black rectangle when
    looking straight through the newly-opened forest door — `draw()`'s
    base canvas fill was pure black, and `drawFloorCeilBase`'s single
    fallback split (nearest center-column cell only, per B1's own
    documented limitation) doesn't cover a *farther*, ceiling-less cell
    newly visible through an opened passage. Mitigated by changing the
    base fill to the same `#223` sky/ceiling-fallback color used
    elsewhere — reads as sky instead of a rendering hole; the real fix
    (a wall-visibility-independent floor/ceiling traversal) remains the
    same deferred B1 follow-up.
    **Not done**: `show_cel2`'s `plac` anchoring (`oblouk & SD_POSITION`)
    and native-size blitting — textures still stretch to fill the cell via
    Canvas2D `drawImage` rather than drawing at their real table-derived
    size with cropping, so niche-prop proportions and off-center secondary
    walls (`xsec`/`ysec`) are still approximate. Remains B2 scope. (Real
    data check: `SD_POSITION` is 0/1204 sides in LESPRED.MAP — genuinely
    unverifiable against this map, correctly deferred rather than built
    against synthetic fixtures only.)
  - **Phase B3 — decorative arch overlay** (`oblouk & 0xf`, `A_STRARC`/
    `A_STRARC2`, 2026-07-19). A real, previously-completely-unrendered
    feature — investigated via a dispatched research agent reading
    `draw_basic_sector`/`realgame.c` directly (this project's own earlier
    doc comment describing `oblouk`'s bit layout turned out accurate, but
    the *gating* — `SD_LEFT_ARC`/`SD_RIGHT_ARC`, 32-bit `flags` bits, not
    part of `oblouk` at all — hadn't been identified before). `A_STRARC`
    (0x8008)/`A_STRARC2` (0x800b) are NUL-separated filename lists, the
    exact same format `mainTextures`/`ceilTextures`/etc. already use —
    confirmed empirically by parsing the raw block bytes directly
    (`LES1W06C.PCX`/`LES1W17A.PCX` and `LES1W06B.PCX`/`LES1W17A.PCX`),
    no new struct needed. `GET_OBLOUK(p) = (p->oblouk&0xf) + (p->
    prim_anim>>4)` — the arch index shares the primary texture's animation-
    frame offset, so an animated door's arch advances in lockstep with its
    swing. Real-data check before implementing (this session's now-
    standard practice after being burned twice by unverifiable/
    misdiagnosed textures): 623/1204 real sides have a non-zero
    `oblouk&0xf`, but only 218 also carry `SD_LEFT_ARC`/`SD_RIGHT_ARC` —
    65% of non-zero indices are inert, so the gate genuinely matters and
    isn't redundant with a simple non-zero check.
    Drawn (`dungeon-view.ts`'s `drawFrontWall`) at the exact same cell rect
    as the main wall texture, *before* it — matches `draw_basic_sector`'s
    call order (arch first, so door/window art with colorkey-punched edges
    layers on top of the frame behind it) and its parameters (`xofs=0,
    yofs=0`, no `SD_POSITION` shift — confirmed the source never applies
    `plac` to these two calls specifically, unlike the main/sec draws).
    `OBL2_NUM` (right half, `A_STRARC2`) is drawn via `show_cel2`'s
    `rev==2` branch — re-confirmed via this investigation that this
    mirrors the *destination screen-write direction*, not source pixel
    order (consistent with the earlier, independent wall-mirror
    investigation's finding that the engine never reverses source pixels
    anywhere) — so a horizontal flip is baked into every `archRight`
    texture once at load time (`codecs/pcx.ts`'s `flipImageDataHorizontally`,
    unconditional for the whole bank, a structural engine rule rather than
    a per-file judgment call like `VERTICALLY_FLIPPED_TEXTURES`).
    Verified via direct decode that `LES1W06B.PCX`/`LES1W06C.PCX` are
    genuinely distinct hand-painted assets (different pixel dimensions,
    320x750 vs 500x750) rather than identical copies — ruling out "just
    reuse the same image for both halves." Both also reserve the same
    second colorkey index (0) the ordinary side-wall bank already uses
    (confirmed by decode, same red-bleed-then-clean pattern as every other
    double-colorkey fix this session). 6 new unit tests. Verified live: a
    visually dramatic tree-trunk/branch frame now appears across the
    forest scene, previously entirely unrendered; start room, door swing,
    and tree orientation all re-checked with no regressions.
  - **Phase B3 — distance shading** (`SHADE_PAL`/`secnd_shade`/
    `MC_SHADING`, 2026-07-19). Investigated whether the per-depth palette
    selection already visible in `show_cel`/`show_cel2`'s source
    (`zoom.palette=...+512*cely+...`, read during the wall-mirror
    investigation but not acted on then) is real and active, via a
    dispatched research agent. Confirmed: `game/skeldal.c`'s
    `pcx_fade_decomp` loads every wall/door/arch texture bank
    (`A_STRMAIN/LEFT/RIGHT/ARC/ARC2`) via `load_pcx(...,A_FADE_PAL,...,
    mglob.fade_r,mglob.fade_g,mglob.fade_b)` unconditionally — no
    per-texture opt-out — baking `libs/pcx.c`'s `palette_shadow`'s 5+5
    palette variants into every one of them at load time. `mglob.fade_r/g/b`
    comes from each map's own `A_MAPGLOB` block, confirmed genuinely
    per-map-authored art direction by parsing the raw block bytes of all
    22 shipped `.MAP` files directly: outdoor maps (LESPRED, LESDRIAD,
    LESZA, ...) fade to `166,234,228` (pale cyan-green haze), the
    underwater map (PODVODOU) to `9,36,80` (deep blue), tower/underground/
    volcano maps (BILA_VEZ, PODZEMI, SKELDAL, SKRETI, SOPKA) to pure black.
    `secnd_shade` (selects fade-to-black instead of fade-to-map-color) is
    driven entirely by `render_scene`'s `if (map_coord[s].flags &
    MC_SHADING) secnd_shade=1;` — a real per-sector `A_MAPINFO` flag, not a
    cheat/debug toggle (no other writer found anywhere in the codebase) —
    confirmed non-trivial by scanning every shipped map's `A_MAPINFO` data:
    0 sectors in most maps, but up to 333/1134 (29%) in NEVIDITE.MAP.
    `SHADE_STEPS=5` matches `VIEW3D_Z` exactly, one flat palette bucket per
    depth level (0..4), no interpolation — derived the exact blend ratio
    from `palette_shadow`'s formula rather than guessing: alpha (fraction
    of target color mixed in) is `3*depth/14` for fade-to-map-color,
    `depth/5` for fade-to-black.
    Floor/ceiling are explicitly excluded — they load via a wholly
    different, `palette_shadow`-unrelated path (`pcx_15bit_autofade`/
    `A_16BIT`, just a header flag byte), confirmed in the same
    investigation, so the shading overlay is only applied to wall/door/
    arch draws.
    Ported: `map-file.ts`'s `parseMapGlobal` now also extracts `fade_r/g/b`
    (`DungeonMap.fadeColor`); a new `A_MAPINFO` (0x8009) parser
    (`parseSectorShading`) extracts each sector's `MC_SHADING` bit,
    merged into `MapSector.shaded` by index after the full block stream is
    read (block order in the file isn't guaranteed, confirmed by testing
    `A_MAPINFO` appearing *before* `A_SECTOR_MAP`). Rendering
    (`dungeon-view.ts`'s `applyDepthShade`) draws one alpha-blended
    solid-color overlay rect per cell, after all its texture layers
    (arch+main+sec, or a side-wall image) are drawn — chosen deliberately
    over shading each texture layer independently (closer to the real
    per-texture palette-swap mechanism) because the two are mathematically
    identical whenever every layer at a rect shares the same depth/alpha/
    target color (alpha-over compositing distributes over blending) —
    this is an exact port of the visible result, not an approximation.
    2 new unit tests (`parseMapGlobal`'s `fadeColor` and `A_MAPINFO`'s
    `MC_SHADING` merge, including block-order independence). Verified live:
    the forest scene shows a dramatic, clearly graduated fade from
    full-color near tree trunks to the pale cyan-green horizon; the start
    room's near window (depth 0, alpha 0) stays completely untinted while
    a farther receding side-wall panel shows one flat, depth-appropriate
    wash — confirms the stepped-not-gradient behavior matches the source
    exactly, not over- or under-applied. Compared directly against
    `docs/reference/dungeon-table-scene.png`.
  - **Phase C — real GUI hit-testing** (`libs/gui.c`/`libs/basicobj.c`
    ruled out, `game/clk_map.c` ported, 2026-07-19). Investigated (dispatched
    research agent) whether `libs/gui.c` (1005 lines) + `libs/basicobj.c`
    (1346 lines)'s `OBJREC`/`WINDOW` object model — the originally-planned
    Phase C toolkit — is what drives menu/chargen button clicks. It is
    **not**: neither `game/menu.c` nor `game/chargen.c` calls `define()`/
    `button()`/etc. at all (`chargen.c` `#include`s the headers but never
    instantiates an `OBJREC`). Porting that toolkit would have added ~2350
    lines of TS with no consumer for these two screens — **not ported**.
    (Aside, not acted on: a quick grep for real `OBJREC`/`define()` call
    sites across `game/*.c` turned up only `interfac.c` and `setup.c` — the
    toolkit isn't dead code game-wide, just unused by menu/chargen/inv.)
    The real mechanism, confirmed by reading `game/clk_map.c`: a `T_CLK_MAP`
    struct (`{id,xlu,ylu,xrb,yrb,proc,mask,cursor}`) array + `find_in_click_
    map()` gives each screen one loose outer rect and a dispatch proc; the
    proc itself (`menu.c`'s `promacknuti()`, `chargen.c`'s `go_next_page()`)
    then reads the RAW PALETTE INDEX out of a decoded 8-bit PCX buffer at
    the click position — `MENUVOL5.PCX` for the menu, `CHARGENM.PCX` for
    chargen — where index 0 means no hotspot and index N means button N-1.
    These two PCX files are never drawn on screen; they're pure per-pixel
    hit-test data (also independently confirmed by decoding and viewing
    both: `MENUVOL5.PCX` is 206×178 with 5 distinct non-black colors in
    wavy, hand-painted (non-rectangular) bands; `CHARGENM.PCX` is 120×102
    with 4). Ported 1:1:
    - `codecs/pcx.ts`'s `decodePcx` now also returns `.indices` (the raw
      per-pixel palette index array, alongside the existing `.rgba`) —
      `libs/pcx.c`'s `load_pcx` decodes scanlines identically for both, so
      no new decode path was needed, just exposing data already computed.
    - `src/gui/hotspot-mask.ts` (new): `HotspotMask` + `hotspotAt(mask,
      regionX, regionY, x, y)` — a direct port of `promacknuti`/
      `go_next_page`'s `z = ablock(...) + 6 + 512; z += xr + yr*w[0]; id =
      *z - 1` byte-offset lookup (6 bytes header + 512 bytes/256-color
      palette, then row-major index bytes).
    - `gui/menu-nav.ts`: `MENU_RECT` reverted to the real (loose) `T_CLK_MAP`
      rect `{220,300,206,177}` — a previous session had narrowed
      y/height to compensate for the mask pipeline not existing yet, which
      is now wrong to keep. `hitTestMenu` is mask-based; `hitTestMenuBands`
      (the old equal-5-way-band split) kept as a graceful-degradation
      fallback if `MENUVOL5.PCX` fails to load, matching this codebase's
      existing missing-asset conventions.
    - `game/character-creation.ts`: `CHARGENM_RECT` (`{520,378,120,102}`,
      exactly matching `CHARGENM.PCX`'s real decoded dimensions) +
      `hitTestChargenButtons()`, dispatching on the real button order
      (0=Přijmout, 1=Start hry, 2=Vymazat, 3=Vše znovu, confirmed via
      `lang/en/ui.csv:144-147`), falling back to the old hand-measured
      `BUTTONS.*` rects only if the mask is missing. `BUTTONS.*` itself is
      unchanged and still used for drawing the gold/gray button-state
      boxes — a separate concern from hit-testing.
    - Explicitly did **not** touch `FACE_GRID`/`WHEEL_RECT` — confirmed via
      the same investigation that both are driven by real arithmetic in
      the source (`select_xicht`'s grid math, `vol_vlastnosti`'s
      pearl-bbox+atan2), not a mask, so no change was needed there.
    Verified live (Playwright against the dev server + real `SKELDAL.DDL`):
    decoded both masks directly to find real non-background pixel
    coordinates for each button (clicking blindly inside the old
    approximate rects lands on background ~30-50% of the time by design —
    the whole point of the real art is irregular button shapes with dead
    space around them, not full rectangles). Clicked New Game → chargen →
    picked a portrait/name → Vymazat (erase, verified it correctly
    discarded back to select mode) → re-rolled → Přijmout (roll then
    accept) → Start hry, reaching the dungeon view with the created
    character in the roster; 0 console errors throughout.
  - **Phase D1 — placed floor items** (`A_MAPITEM`/`draw_placed_items_
    normal`, 2026-07-19). First Phase D work; done as part of this port's
    standing "rewrite the engine 1:1" directive rather than for immediate
    visible payoff — LESPRED.MAP (the only map this port loads) turns out
    to have exactly one `A_MAPITEM` group (sector 8, side 0, 7 slots) and
    only one of those 7 entries is a real (positive) item number; the rest
    are negative placeholder slots `draw_placed_items_normal`'s `if (*c>0)`
    never draws. Confirmed by parsing every block of the real
    `LESPRED.MAP`/`ITEMS.DAT` directly rather than assuming.
    - `ITEMS.DAT` (game/inv.c: `load_items`) is the *same* tag+type+size+
      ignored+payload block container as `.MAP` (confirmed: both call the
      real `realgame.c:load_section`, not the dead `transav.c` copy), just
      with its own tiny section-code namespace (1..5 = graphics facing
      banks, `0x8001`=item list, `0x8002`=sound names, `0x8000`=end) instead
      of `.MAP`'s `A_*` 0x8000-range constants. `TITEM` is 222 bytes;
      `vzhled` (the only field floor rendering needs) is at offset 140 —
      confirmed by compiling the real struct with `-funsigned-char` and
      reading `offsetof()`, since the source's own inline byte-offset
      comments (`//140 specialni udalost` etc.) have drifted from the
      actual compiled layout by a few bytes in places. `vzhled` is a
      1-based index into section 1's filename list ("face 0" — the only
      face `draw_placed_items_normal`/`draw_vyklenek` ever use; sections
      2-5 turned out to be other facings, spell-effect frames (`FIREBAL*`),
      and weapon-attack `.mgf` animations — combat/inventory-UI data out of
      scope here). Ported to `src/formats/items-file.ts`'s `parseItemsFile`
      → `ItemsFile.itemAppearance` (itemNumber-1 → texture filename).
    - `A_MAPITEM` (`0x800c`, game/inv.c: `load_item_map`): repeating
      `{int32 combinedIdx=sector*4+direction; int16 itemNumber...; int16 0
      terminator}` — same `sector*4+direction` indexing `map-file.ts`'s
      `sides` already uses. Item numbers can be negative (inert placeholder
      slots, see above) — kept as-is rather than filtered, since a real
      item's on-floor jitter offset depends on its slot position *including*
      preceding negative slots (`draw_placed_items_normal`'s `k` index
      increments for every slot, drawn or not). Ported to `map-file.ts`'s
      `parsePlacedItems`/`DungeonMap.placedItems`/`placedItemsAt()`.
    - Rendering (`game/builder.c`'s `draw_placed_items_normal`, called
      *after* the wall/floor draw for the ordinary sector case): for a
      cell at depth 0 (the viewer's own sector) only 2 of the sector's 4
      side-piles are drawn (front + right, `cnt=2`); farther cells draw
      all 4 (`cnt=4`) — a real, kept-as-is asymmetry from the source, not
      a bug. Which compass side each of the `cnt` slots maps to is
      `(i+facing)&3` — trivial in this port because `computeVisibleGrid`
      already uses one constant `facing` for the whole visible grid (see
      its own header comment), unlike the original's per-step `viewdir`
      recursion. Ported to `dungeon.ts`'s `floorItemsForSector`/
      `ViewCell.floorItems`/`FloorItem`.
    - Positioning (`engine1.c`'s `map_pos`, called by `draw_item`): places
      an arbitrary sub-cell point — `posx`/`posy`/`posz`, each a fraction of
      `CTVR=128` — by bilinearly interpolating the *same*
      `viewport_geometry` fan `wallCellBounds`/`floorCeilBand` already key
      off, blending *within* a cell in both lateral (`posx`) and depth
      (`posy`) instead of only picking a fixed corner. `posz` lifts the
      point above the floor by a fraction of the local wall height (kept
      as a parameter for fidelity even though the only caller ported so
      far, `draw_item`, always passes 0). Ported 1:1 to `perspective.ts`'s
      `mapPos`, using C's truncating-toward-zero `/` throughout (`idiv`,
      matching `Math.trunc` not `Math.floor` — same rule `calcPoints`
      already established). Verified against `wallCellBounds` itself:
      `mapPos` at `posy=0` (no depth blend) exactly reproduces
      `wallCellBounds`'s `xl`/`xr` as `posx` sweeps 0→`CTVR`, and mirrors
      a negative lateral cell against its positive counterpart exactly
      the same way `wallCellBounds`'s own mirror test does.
    - Drawing (`engine1.c`'s `draw_item` → `engine2.c`'s `enemy_draw`):
      `enemy_draw`'s `xtable`/`ytable` prep scales *both* dimensions by the
      identical `scale/320` ratio (`scale` = `mapPos`'s `last_scale`) —
      confirmed by reading both prep loops side by side, not assumed from
      naming. The sprite's anchor `y` is its *bottom* row (screen pointer
      walks upward, `screen -= scr_linelen2`, as the source scanline
      iterates from the image's last row toward its first) — replicated as
      `drawImage` at `(x, yBottom - height)`. Manual `clipl`/`clipr`
      fractional clipping in the source exists only because the DOS
      blitter had no native clipping — not replicated; Canvas2D's
      `drawImage` already clips off-canvas draws (same "port the visible
      result" convention used throughout this renderer). One depth-shade
      overlay per item (`applyDepthShade`, reused unchanged) replaces
      `enemy_draw`'s per-depth shaded-palette selection (`palette=picinfo+
      shade/2`), consistent with how wall/door shading is already ported.
      `items_indextab`'s per-slot pixel jitter (`ITEMS_INDEX_TAB`) is
      copied verbatim.
    - **Known, deliberate gap**: raw palette index 1 is special-cased in
      the real `enemy_draw` as "blend 50% darker with whatever's already on
      screen" (`(screen[xpos]&0x7BDE)>>1`) — apparently a soft drop-shadow
      trick, distinct from index 0's full transparency. Not replicated:
      doing so faithfully in Canvas2D would need a `getImageData` read of
      the destination before every item draw, for a minor embellishment
      that may not even be used by ordinary (non-enemy) item sprites. If a
      real asset turns out to rely on it, index 1 currently just reads as
      an ordinary opaque color from its own palette instead of a shadow
      blend.
    - **Deferred**: `A_MAPVYK`/`draw_vyklenek`/`calc_item_shiftup` (niche
      items) — LESPRED.MAP has only 2 `TVYKLENEK` records, and
      `draw_item2` (the niche draw path) positions via a *different*
      mechanism (`showtabs.x_table[0][cely].max_x`/`y_table[cely+1].
      vert_size`, the DOS-era cached per-depth table this port's geometry
      functions deliberately replaced with direct analytic formulas) that
      hasn't been derived/ported yet. Parsing `A_MAPVYK` without a
      consumer would be dead code, so it's untouched for now rather than
      half-added.
    - Verified live (Playwright against the dev server + real
      `SKELDAL.DDL`/`LESPRED.MAP`/`ITEMS.DAT`): BFS-computed the real
      turn/move sequence from the map's actual start sector (18) to
      sector 8 (right, forward, forward), confirmed the item (`ITEMS.DAT`
      item 52, "Bandalír") renders floor-anchored at the predicted
      position/scale with depth shading applied, and confirmed the start
      room (table/candle scene) shows no regression; 0 console errors.
  - **Phase D3 — map switching (`MA_LOADL`/`MC_PASSFAIL`)** (2026-07-19).
    Directly answers a standing question from earlier in this port's
    history ("why can't I enter the goblin cave?" — `SKRETI.MAP` is one of
    this feature's real transition targets). Investigated by searching for
    an `A_CHANGE_MAP`-style action first (the execution plan's original
    assumption) — none exists. `load_map()`'s only 3 call sites are the
    debug console, and `skeldal.c`'s `game_big_circle()` outer loop, which
    reads a global `loadlevel` struct (target map name/sector/direction)
    that's set from exactly two places: `kouzla.c`'s teleport spell, and
    `macros.c`'s `macro_load_another_map()` — a single opcode (`MA_LOADL`,
    value 7) of the ~40-opcode `A_MAPMACR` map-scripting VM (`game/
    macros.c`, this port's still-unported A2b). Rather than build that
    whole VM, ported only what `MA_LOADL` needs, since the file's own
    instruction container is length-prefixed and self-describing —
    instructions this port doesn't interpret can be skipped by their
    declared byte size alone, with no need to know their payload struct.
    - Confirmed the trigger via `game/realgame.c`'s `step_zoom()`: `nopass
      = (side.flags & SD_PLAY_IMPS); if (nopass) call_macro(sid,
      MC_PASSFAIL); else call_macro(sid,MC_PASSSUC);` — i.e. these are
      "invisible" map-edge transitions: the wall reads as a normal solid
      obstacle (`SD_PLAY_IMPS` set, same flag `canStep`/`pendingTransition`
      already check), and walking into it *fires the macro anyway*, even
      though ordinary movement fails. Parsed every block of the real
      `LESPRED.MAP` directly to confirm: exactly 8 `MA_LOADL` instructions
      exist, every single one gated on `MC_PASSFAIL` (none on `MC_PASSSUC`
      — a passable-side transition is a real, distinct case, not supported
      yet, since it would need hooking *successful* movement too, not just
      blocked attempts — see map-file.ts's own `MC_PASSFAIL` comment).
      Targets: `SKRETI.MAP` (×2), `PLANE.MAP` (×2), `CAREDBAR.MAP` (×2),
      `SOUTESKA.MAP`, `P_LESY_1.MAP` — all 5 confirmed present in the real
      game data.
    - `TMA_LOADLEV`'s on-disk layout (verified against real bytes, not
      assumed from the C struct's own padded in-memory layout): byte
      0=action (a `action:6,cancel:1,once:1` bitfield — `game/macros.c`'s
      `tma_gen`; every other `TMA_*` struct's plain `uint8_t action,flags,
      eflags` fields alias the *same* 3 bytes as tma_gen's packed
      `action`+16-bit `flags`, they're not a genuinely separate third
      byte), bytes 1-2=flags (u16 LE, the `MC_*` trigger mask), bytes
      3-4=start_pos (i16 LE), byte 5=dir, remaining bytes=NUL-terminated
      map name. `read_macro_item`'s "fixpad" 1-byte-shift copy (for
      `MA_LOADL` and ~20 other opcodes) exists purely to correct C struct
      alignment padding in the *in-memory* array — irrelevant here, since
      this parser reads fields at their real on-disk offsets directly and
      never builds an equivalent padded struct.
    - Ported: `map-file.ts`'s `parseMapTransitions` (new `BLOCK_MAP_MACR`
      case, `0x800d`) → `DungeonMap.mapTransitions`/`mapTransitionAt()`,
      same `sector*4+direction` indexing as `sides`/`placedItems`.
      `dungeon.ts`'s `pendingTransition(map,sector,dir)`: returns a
      transition only when `canStep` is already false, mirroring
      `nopass`'s exact gating. `dungeon-view.ts`: `runDungeonView` takes a
      new optional `MapLoader` callback (defaults to a no-op resolving
      `null`, same graceful-degradation convention as a missing chrome
      asset); `attemptStep()` checks `pendingTransition` before an
      ArrowUp/ArrowDown move and, if one fires, awaits `loadMap()` and
      swaps the running view's `state`/`textures` in place instead of
      calling `stepForward`/`stepBackward` — mirroring `game_big_circle`'s
      outer loop re-calling `load_map()` with a new `loadlevel`.
      `state`/`textures` were both promoted from the function's `initial`/
      `textures` params to reassignable `let`s for this. `main.ts` wires
      the real callback: `ITEMS.DAT` (a single global item catalog, loaded
      once, not per-map) is captured once and reused for every subsequent
      map fetched, matching the real engine's own one-time `load_items()`.
      `vite.config.ts`'s dev allowlist grew the 5 real target filenames.
    - **Known, deliberate gaps**: only `MA_LOADL` is interpreted; every
      other opcode in a macro list sharing that (sector,direction) slot —
      dialogue, item creation, conditional jumps, ~37 more — is silently
      skipped, not executed (real map-scripting content, out of scope
      until A2b). `MC_PASSSUC`-gated transitions (walking through an
      *open* passage) aren't hooked. The destination map's own start
      sector is trusted as-is — no A2b `MC_STARTLEV`/`MC_INCOMING` macros
      fire on arrival, matching this port's existing "no macro VM yet"
      scope everywhere else.
    - Verified live (Playwright): real per-map colorkey/orientation lists
      in `main.ts` (`VERTICALLY_FLIPPED_TEXTURES` etc.) are LESPRED.MAP-
      specific and were already flagged, before this session, as "known-
      incomplete for other maps... once D3 makes them reachable" — exactly
      what happened: `SKRETI.MAP` loads and renders (distinct geometry,
      distinct stone-cave textures, no console errors), but shows an
      unpunched blue colorkey bleed around one sprite (a curtain/tapestry),
      confirming that prediction rather than indicating a bug in the
      transition mechanism itself. Fixing per-map colorkey/orientation for
      newly-reachable maps is real follow-up work, deliberately not
      attempted in this pass (scope: make the transition itself work, not
      re-run the whole texture-QA pass this session already did for
      LESPRED.MAP against every other map). Reaching a real, distant,
      normally door-gated sector (50) for this test used the existing
      ULOŽ/OBNOV save mechanism (`localStorage`) to patch the saved
      sector/direction directly rather than walking the real path, since a
      static reachability BFS over raw `SD_PLAY_IMPS` data only covers ~24
      states from the start sector — most of the map sits behind
      interactive doors a static analysis can't open, not a bug in this
      feature.

## game/ (target `skeldal_main`, issue #10–#17 range)

| C source | Purpose | Planned TS home | Status |
| --- | --- | --- | --- |
| `skeldal.c` | app spine, config, resource registry, main loop | `src/game/main.ts` | pending |
| `realgame.c` | map state, per-tick update, actions, movement | `src/formats/map-file.ts` (`.MAP` parsing only — see note below), `src/game/dungeon.ts` (movement/view-cell logic) | in-progress, see note below |
| `souboje.c` | turn-based combat | `src/game/combat.ts` | pending |
| `enemy.c` | mob AI, pathing, sprite rendering | `src/game/mobs.ts` | pending |
| `kouzla.c` | spell system | `src/game/spells.ts` | pending |
| `inv.c` | items, inventory, stats, shops | `src/game/items.ts` | pending (floor-item rendering split out already — see `draw_placed_items_normal`/Phase D1 note below; inventory UI/equip/shops still pending) |
| `dialogy.c` | dialog bytecode interpreter + UI | `src/game/dialogs.ts` | pending |
| `gamesave.c` | save/load archive | `src/game/savegame.ts` | pending |
| `macros.c` | map action-script engine (A_MAPMACR) | `src/game/macros.ts` | pending (one opcode, `MA_LOADL`/map transitions, split out early — see `formats/map-file.ts`'s `parseMapTransitions`/Phase D3 note; the general ~40-opcode VM is still unported) |
| `specproc.c` | hardcoded special map procedures | `src/game/specproc.ts` | pending |
| `engine1.c` | pseudo-3D zoom renderer | `src/game/dungeon-view.ts` (simplified — see note below) | in-progress, see note below |
| `engine2.c` | blitters (walls, floors, sprites, anims) | `src/game/dungeon-view.ts` (simplified — see note below) | in-progress, see note below |
| `builder.c` | scene composition, minimap, bottom bar | `src/game/dungeon.ts` (view-cell traversal only) | in-progress, see note below |
| `automap.c` | automap screen, notes | `src/game/automap.ts` | pending |
| `globmap.c` | overworld travel map (GLOBMAP.DAT DSL) | `src/game/worldmap.ts` | pending |
| `kniha.c` | story book renderer | `src/game/book.ts` | pending |
| `interfac.c` | GUI widgets, message boxes, BFS pathfinder | `src/gui/interfac.ts` | pending |
| `clk_map.c` | mouse click-region dispatch (`T_CLK_MAP` + per-pixel PCX mask) | `src/gui/hotspot-mask.ts` | ported (menu/chargen consumers only — see Phase C note) |
| `menu.c` | main menu | `src/game/main-menu.ts` | in-progress (real MENUVOL5.PCX hit-testing ported; art/animation still placeholder) |
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
| `gui.c` | GUI object core (`OBJREC`/`WINDOW`, rect hit-testing) | `src/gui/core.ts` | not needed for menu/chargen/inv — confirmed dead code there (see Phase C note); still used by `interfac.c`/`setup.c`, revisit when those are ported |
| `basicobj.c` | basic GUI widgets | `src/gui/basicobj.ts` | not needed for menu/chargen/inv — see `gui.c` row |
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
