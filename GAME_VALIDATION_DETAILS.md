# Game Validation Details — Iluminado

This document records the complete mechanical specification, visual rendering rules (including aggressive brick auto-tiling), the 20 world/genre roster, and the verification checklist for **Iluminado**.

---

## 1. Core *Iluminado* Gameplay Specification

### 1.1 Playfield & Pieces
- **Playfield Dimensions**: `16` columns × `10` rows (`BOARD_COLS = 16`, `BOARD_ROWS = 10`).
- **Block Representation**: `2×2` falling tetrad composed of 2 active colors (`color: 0 | 1`) per skin, weighted across all 6 classic pattern families (Solid 4-of-a-kind, 3+1, 2+2 Horizontal, 2+2 Vertical, Diagonal).
- **Spawn Geometry**: Active pieces spawn centered above columns `7..8` at row `y = -2` with a configurable per-skin `spawnDelay` before passive gravity starts.
- **Rotation**: Clockwise (`ArrowUp` / `W` / `Space` / `X`) and Counter-Clockwise (`Z`) 90° cell permutation inside the `2×2` block.
- **Independent Cell Gravity (`settleBoard`)**: Whenever a piece lands on an uneven stack—or blocks beneath a column are cleared—individual cells split vertically and drop independently down each column (`fallOffset` interpolated smoothly at 16 rows/s for animation without altering logical occupancy).
- **Game Over Condition**: Triggered when a locked piece overflows above row `0` or when spawn columns `7` or `8` at `row 0` are obstructed after settling.

### 1.2 Aggressive Brick Joining & Tiling UX
Same-color blocks—and vertical stacks—follow authentic *Iluminado* visual fusion rules (`getGridCellJoins`, `getPieceCellJoins`, `drawBlockCell`, and `PiecePreview.tsx`):
1. **Flush Grid Contact (Zero Inter-Row/Column Gap)**: Settled cells render across full `1:1` cell dimensions (`left = x`, `top = y`, `right = x + size`, `bottom = y + size`) so bricks tile tightly against the bricks above, below, and beside them with zero floating gaps.
2. **4-Neighbor Seamless Welding**: Adjacent settled cells (`fallOffset <= 0.15`) sharing the same `color` (top, right, bottom, left) weld seamlessly with a `+0.5px` seam overlap on joined right/bottom edges to eliminate subpixel cracks, zero corner rounding on joined corners, and no border strokes along joined seams. Only a subtle `rgba(255,255,255,0.12)` internal grid tick preserves column/row readability.
3. **Selective Corner Rounding & Exposed-Edge Bevels**: Corners round (`baseR`) **only** when both touching orthogonal edges are exposed (unjoined). Exposed top/left edges receive directional highlight bevels and exposed bottom/right edges receive shade bevels plus crisp inset `0.6px` outer borders (`style.border`).
4. **Active `2×2` & Next Queue Fusion**: Active falling pieces and `PiecePreview` SVG previews apply the same horizontal/vertical same-color joining rules before landing.
5. **Unified `2×2` Formed Square Clusters**: Cells marked `inSquare` receive a unified luminous wash, an exterior perimeter outline traced strictly along unshared cluster boundaries (`!sameSq`), and pulsing center nexus gems centered at each `2×2` junction `(sq.x + 1, sq.y + 1)` rather than individual per-cell emblems.

### 1.3 Square Detection, Chain Blocks & Timeline Sweep
- **Overlapping `2×2` Monochromatic Squares (`detectBoardMarks`)**: Every valid `2×2` region of matching non-Chain color is flagged (`inSquare = true`), including overlapping clusters (e.g., a `3×5` block yields `2 × 4 = 8` distinct squares).
- **Chain Blocks (`isChain`)**:
  - Highlighted with a pulsing white cross emblem.
  - When orthogonally adjacent to at least one same-color block, a 4-directional BFS marks the entire connected same-color component (`chainMarked = true`).
  - Chain-marked cells are excluded from `2×2` square counts (`!a.chainMarked && !a.isChain`) and clear together for `20 pts/cell`.
- **Musical Eighth-Note Timeline (`stepTimelineColumn`)**:
  - The timeline sweeps continuously left-to-right across all 16 columns once every 2 musical bars (`8` beats at the active skin's BPM: `stepMs = (60_000 / bpm) / 2`).
  - As the timeline passes a column (`col`), squares whose rightmost edge lies in `col` (`sq.x + 1 === col`) are queued (`pendingClear = true`) and counted into `squaresThisSweep`.
  - **Overlap Preservation**: Queued cells are flushed **only** when no un-swept `2×2` square or connected Chain group bridges from `col` into `col + 1` (`!bridgesRight`), preventing premature erasure of overlapping `3×2`, `4×2`, or larger blocks.
  - Audio step synchronization (`audio.syncStep(col, skin)`) locks basslines, arpeggios, chords, and percussion directly to the 16 eighth-note columns.

### 1.4 Scoring & Bonus Rules (`calculateSweepScore`, `finalizeSweep`)
- **Base Square Score**: `40` points per cleared `2×2` square.
- **Combo Multiplier**: Clearing `>= 4` squares in a single sweep increments `comboLevel`, awarding `base × min(4 × comboLevel, 16)` (`4×` → `8×` → `12×` → `16×` max). Sweeps clearing `< 4` squares reset `comboLevel` to `0` and pay `base` (`1×`).
- **Soft Drop**: `+1` point per row actively descended inside the board (`y >= 0`); passive gravity does not award soft-drop points.
- **Chain Cells**: `+20` points per Chain-cleared cell.
- **Single-Color Bonus**: `+1,000` points if a sweep clears blocks and leaves strictly 1 color remaining on the board.
- **All-Deleted Bonus**: `+10,000` points if a sweep clears blocks and leaves `0` blocks remaining on the board.

---

## 2. Game Modes Implemented (All 7 Modes)

1. **Challenge (`Basic` / `Endless` / `Shuffle`)**: Progress across all 20 distinct skins on sweep wraps once `stageSquaresCleared >= skin.squaresToAdvance`. `Basic` finishes after World 20 (`Sanctuary Cleared`), `Endless` loops indefinitely, and `Shuffle` picks random skins.
2. **Skin Edit**: Custom playlist of 1–10 unlocked skins (`Single Lap` or `Endless` mode), persisted to `localStorage`.
3. **Time Attack (`60s` / `180s` / `300s`)**: Beat your high score and square count within a fixed countdown.
4. **Puzzle (`6` Stages)**: Sculpt distinct framed monochromatic silhouettes (`Pastel Archway`, `Sunlit Obelisk`, `Sand Hourglass`, `Monument Crown`, `Ascending Steps`, `Compass Sanctuary`) checked via `checkPuzzlePatternMatch`.
5. **Mission (`6` Trials)**: Tactical challenges under strict timers (`Fourfold Resonance`, `Double Harmonic`, `Chain Sanctuary`, `Clean Slate`, `Monochrome Calm`, `Grand Sweep`).
6. **VS CPU**: Split twin `16×10` boards against `computeCpuBestMove` heuristic AI. Sweeping `>= 4` squares sends garbage pressure blocks (`applyGarbageToBoard`) to the rival.
7. **2P Battle**: Shared-keyboard local multiplayer (`P1: WASD`, `P2: Arrow Keys`) with mutual garbage pressure on `>= 4` square sweeps.

---

## 3. Complete 20-World Indie Art & 20-Genre Musical Roster

Only **1** world uses the *Monument Valley* aesthetic. All 20 worlds retain identical mechanical controls and board readability while changing sky/architecture artwork, procedural block surface textures (`drawBlockTexture`), dual-color gradients, particle shapes, BPM, gravity, and a dedicated **4-stem genre soundtrack + instrumentation SFX** (`Percussion`, `Bass`, `Lead`, `Vocal`).

**Zero-Skin-Name UI Rule**: Visual theme names and game inspirations are strictly omitted from every screen (`TitleScreen`, `GameHud`, `GameModals`). Players experience the worlds visually and navigate tracks by **World Index (`1–20`), Music Genre, Color Swatches, and BPM**.

| World # | Music Genre | BPM | Key / Mode | Gravity (rows/s) | Block Texture | Particle |
|---:|---|---:|---|---:|---|---|
| 1 | Ambient | 78 | D Lydian | 1.15 | `carved_stone` | `square` |
| 2 | Jazz Fusion | 120 | E Dorian | 1.20 | `woodcut_ink` | `petal` |
| 3 | Downtempo | 88 | F# Minor | 1.25 | `watercolor` | `ink` |
| 4 | Dark Zouk | 96 | C Minor | 1.40 | `clay_glyph` | `square` |
| 5 | Bossa Nova | 112 | F Maj9 | 1.45 | `cut_paper` | `spark` |
| 6 | Country | 114 | G Major | 1.55 | `gouache` | `petal` |
| 7 | Salsa | 172 | D Minor | 1.65 | `silk_sand` | `spark` |
| 8 | Synthwave | 118 | A Minor | 1.75 | `vector_matte` | `spark` |
| 9 | Swing | 144 | Bb Major | 1.85 | `enamel_pop` | `bubble` |
| 10 | Country Blues Rock | 104 | E Blues | 1.90 | `crt_noir` | `spark` |
| 11 | Dark Ambient | 82 | C# Minor | 2.00 | `graphite` | `ink` |
| 12 | Electric Fusion | 128 | G Dorian | 2.10 | `art_deco` | `spark` |
| 13 | Trap | 140 | F Minor | 2.25 | `crystal_prism` | `square` |
| 14 | Chiptune Funk | 126 | C Mixolydian | 2.35 | `pixel_bevel` | `square` |
| 15 | Alt Rock | 134 | D Drop-D | 2.50 | `ligne_claire` | `spark` |
| 16 | Bachata | 128 | A Minor | 2.65 | `lacquer` | `spark` |
| 17 | Kizomba | 92 | Eb Minor | 2.80 | `pearl_shell` | `bubble` |
| 18 | Reggaeton | 95 | G Minor | 3.00 | `foil_velvet` | `spark` |
| 19 | Heavy Metal | 162 | E Phrygian Dom. | 3.15 | `brass_rivet` | `square` |
| 20 | Liquid DnB | 174 | F# Minor | 3.40 | `bioluminescent` | `petal` |

See [`LYRIA_PROMPTS.md`](./LYRIA_PROMPTS.md) for studio Lyria 3 Pro (`lyria-3-pro-preview`) prompts, isolated 4-stem generation specs, and live instrumentation SFX shot lists for all 20 worlds.

---

## 4. Verification & Validation Checklist

### Unit Test Verification (`npx --yes tsx --test src/game/engine.test.ts`)
1. `board dimensions are 16 columns by 10 rows` — Validates `16×10` grid structure.
2. `2x2 piece rotation rearranges cells clockwise and counter-clockwise` — Validates CW/CCW permutations.
3. `movement respects left and right board bounds` — Validates walls (`0..14` piece `x`).
4. `independent cell settling drops unsupported cells onto lower rows` — Validates split-column gravity.
5. `overlapping 2x2 squares are counted independently (3x5 block = 8 squares)` — Validates overlapping `2×2` detection.
6. `timeline sweep preserves overlapping squares until rightmost column and counts all of them` — Validates `bridgesRight` overlap preservation & `+10,000` All-Deleted bonus.
7. `scoring formula applies 4x-16x consecutive combo multipliers and resets on < 4 squares` — Validates `40 × count × 4..16` and Single-Color `+1,000` bonus.
8. `Chain Block marks 4-directional connected same-color blocks and excludes them from 2x2 square scoring` — Validates 4-dir Chain BFS & exclusion from `2×2` squares.
9. `soft drop awards 1 point per row descended inside the board` — Validates `+1` per row soft drop.
10. `game over triggers when spawn columns 7..8 at row 0 are obstructed` — Validates top-out trigger.
11. `puzzle pattern detection recognizes framed archway silhouette` — Validates framed Puzzle pattern matching.
12. `computeStemLevels dynamically scales percussion, bass, lead, and vocal stems with board state` — Validates dynamic 4-stem fade progression.
13. `all 20 worlds define valid music configs covering all requested genres` — Validates all requested styles (`dark_zouk`, `kizomba`, `salsa`, `bachata`, `reggaeton`, `trap`, `country`, `swing`, `ambient`, `jazz_fusion`, `funk_fusion`, `heavy_metal`, `alt_rock`), BPMs, 16-step patterns, swing ratios, and distortion/sub parameters.

### UI & Visual Fidelity Checks
- **Zero Skin Names Anywhere in the UI**: Neither skin names nor artistic inspirations appear in Title cards, Skin Edit playlist items, tooltips, Game HUD, Pause modal, or Game Over modal—only World index, Music Genre, BPM, and color swatches.
- **No `"Stage"` Labels & No `"Title"` Button Label**: HUD uses `"Level"`, and Pause/Game Over modals label the menu button `"Main Menu"`.
- **20-World Live Theme Preview**: `Prev` / `Next` controls on the Title screen cycle all 20 worlds, updating the live background artwork, block colors, music genre + BPM badge, and HUD accent live.
- **Brick Auto-Tiling Visual Check**: Placed stacks fuse seamlessly horizontally and vertically with zero grid cracks, rounded outer corners only, and glowing `2×2` square cluster outlines + center nexus diamonds.
- **Zero Console / Runtime Errors**: Verified via Playwright automated headless Chromium session across Title, Skin Edit, Gameplay, and Paused states, plus TypeScript (`npm run build`) and ESLint (`npm run lint`) checks.

