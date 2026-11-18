# Iluminado

A pastel architectural rhythm-puzzle game faithful to classic `16×10` beat-locked puzzle mechanics (benchmarked against [`testAssets/vintage.mov`](./testAssets/vintage.mov)), pairing tight block clearing with **20 distinct illustrated worlds**, **20 genre-authentic dynamic soundtracks**, and a **zero-skin-name UI** navigated purely by world index, music genre, BPM, and color swatches.

---

## Core Gameplay & Visual Reference (`testAssets/vintage.mov`)

- **16×10 Dual-Color Playfield**:
  - `2×2` tetrads composed of two contrasting colors per world fall from center columns (`7–8`) with a `3`-piece `NEXT` preview queue.
  - Clockwise (`ArrowUp` / `W` / `Space` / `X`) and counter-clockwise (`Z`) rotation plus active soft drop (`ArrowDown` / `S`, `+1 pt/row`).
  - **Independent Cell Settling**: Overhanging `2×2` pieces split vertically on contact so unsupported cells drop smoothly into lower gaps.
- **2×2 Square Formation & Aggressive Brick Auto-Tiling**:
  - Adjacent same-color bricks weld seamlessly horizontally and vertically with selective outer corner rounding and exposed-edge bevels.
  - Complete `2×2` (and overlapping `2×3`, `3×2`, `4×2`, etc.) monochromatic clusters fuse into luminous highlighted slabs with unified perimeter outlines and pulsing center nexus gems.
  - **Chain Blocks**: Rare cross-emblem blocks trigger `4`-directional flood-fill clearing across connected same-color blocks (`+20 pts/cell`, excluded from `2×2` square scoring).
- **Beat-Locked Time Line Sweep & Combo Bursts**:
  - A vertical **Time Line** sweeps left-to-right across all `16` columns once every `2` musical bars (`8` eighth-note beats locked strictly to the active track's BPM).
  - As the Time Line crosses formed squares, swept clusters illuminate and remain intact until the bar clears the rightmost edge of any overlapping group—preserving multi-square chains.
  - Sweeping `4+` squares triggers a horizontal shockwave burst, floating score popups, and escalating consecutive combo multipliers (`4×` → `8×` → `12×` → `16×`).
- **Scoring & Bonuses**:
  - `40` base points per cleared `2×2` square (`×4` to `×16` on consecutive `4+` square sweeps).
  - `+1` pt per row actively soft-dropped.
  - `+20` pts per Chain-cleared cell.
  - `+1,000` **Single-Color Bonus** when a sweep leaves only one color on the board.
  - `+10,000` **All-Deleted Bonus** when a sweep clears the entire board.

---

## Musical Layer & 20-Genre Soundtrack

Unlike puzzle games that merely speed up static audio, the music in **Iluminado** is woven directly into the board state:

- **20 Genre-Authentic Tracks (`78–174 BPM`)**:
  - Includes **Ambient**, **Jazz Fusion**, **Downtempo**, **Dark Zouk**, **Bossa Nova**, **Country**, **Salsa** (`3-2` Son Clave & Tumbao), **Synthwave**, **Swing** (triplet ride bounce), **Country Blues Rock**, **Dark Ambient**, **Electric Fusion**, **Trap** (`808` slides & `32nd` hi-hat rolls), **Chiptune Funk**, **Alt Rock**, **Bachata** (bongo martillo, güira & beat-4 accent), **Kizomba**, **Reggaeton** (Dembow), **Heavy Metal** (Phrygian Dominant double-kick), and **Liquid DnB**.
- **Dynamic 4-Stem Layering (`computeStemLevels`)**:
  - Each track separates **Percussion**, **Bass**, **Lead / Harmony**, and **Vocal / Atmosphere** stems that fade in and out dynamically based on board occupancy, formed `2×2` squares, active sweep combos, and stage progress.
- **Sound Effects as Live Instrumentation**:
  - Moving, rotating, landing, forming squares, sweeping clears, and activating Chain Blocks trigger key-locked musical samples (hi-hats, claves/woodblocks, palm-muted scratches, chord plucks, tuned root-key kicks/toms, vocal chops, and scale runs) tailored to the active genre.
- **Lyria Stem Production Bible**:
  - See [`LYRIA_PROMPTS.md`](./LYRIA_PROMPTS.md) for studio-grade Google Lyria (`lyria-3-pro-preview`) prompts, isolated 4-stem generation specs, arrangement arcs, and instrumentation SFX shot lists for all 20 tracks.

---

## 20 Visual Worlds & 7 Game Modes

- **Zero Skin Names in the UI**: Skin titles and visual inspirations never appear anywhere in menus, playlists, tooltips, HUDs, or Pause/Game Over modals. All 20 worlds are browsed by **World Index (`1–20`)**, **Music Genre**, **BPM**, and **block color swatches** (with only World 1 using the *Monument Valley* pastel sandstone style).
- **7 Complete Game Modes**:
  1. **Challenge** (`Basic` / `Endless` / `Shuffle`) — Progress across all 20 worlds as tempo, gravity, and square goals evolve.
  2. **Skin Edit** — Curate `1–10` unlocked worlds into a custom `Single Lap` or `Endless` playlist.
  3. **Time Attack** (`60s` / `180s` / `300s`) — Maximize squares and score before the timer expires.
  4. **Puzzle** (`6` stages) — Sculpt framed monochromatic silhouettes under time limits.
  5. **Mission** (`6` trials) — Clear tactical objectives (`4+` square sweeps, combos, Chain clears, single-color, all-clear).
  6. **VS CPU** — Duel an adaptive heuristic AI on twin `16×10` boards with `4+` square garbage-block pressure.
  7. **2P Battle** — Local shared-keyboard versus match with mutual pressure blocks.

---

## Controls

### Single Player / VS CPU
| Action | Keys |
|---|---|
| Move Left / Right | `ArrowLeft` / `ArrowRight` or `A` / `D` |
| Rotate Clockwise | `ArrowUp` / `W` / `Space` / `X` |
| Rotate Counter-Clockwise | `Z` |
| Soft Drop (`+1 pt/row`) | `ArrowDown` or `S` |
| Pause / Resume | `Esc` or `P` |
| Mute / Unmute Audio | `M` |
| Restart Current Run | `R` |

### 2P Battle (Shared Keyboard)
- **Player 1**: `A` / `D` Move · `W` Rotate · `S` Soft Drop
- **Player 2**: `ArrowLeft` / `ArrowRight` Move · `ArrowUp` Rotate · `ArrowDown` Soft Drop

On mobile/narrow screens, an interactive 4-button touch control strip (`Left`, `Rotate`, `Drop`, `Right`) renders below the playfield.

---

## Architecture & Project Files

- `src/game/engine.ts` — Pure deterministic `16×10` grid physics, independent cell settling, Chain BFS, overlapping `2×2` detection, timeline sweep, and scoring.
- `src/game/skins.ts` — 20 complete world configurations (palettes, procedural block textures, emblems, BPM, gravity, and genre music theory/synthesis settings).
- `src/game/canvasRenderer.ts` — Cached offscreen world illustrations, 20 procedural block textures, aggressive 4-neighbor auto-tiling, unified `2×2` cluster highlights, particles, and floating score popups.
- `src/game/modes.ts` — Puzzle silhouettes, Mission presets, and CPU move planner.
- `src/game/audio.ts` — 4-stem (`Percussion`, `Bass`, `Lead`, `Vocal`) dynamic Web Audio synthesizer locked to the eighth-note timeline clock + key-locked instrumentation SFX (`computeStemLevels`).
- `src/game/storage.ts` — Persistent local high scores, unlocked worlds, mute state, and Skin Edit playlist.
- `src/components/` — `TitleScreen.tsx`, `GameHud.tsx`, `GameModals.tsx`, and `PiecePreview.tsx`.
- `GAME_VALIDATION_DETAILS.md` — Full mechanical ruleset, 20-world/20-genre matrix, and verification checklist.
- `LYRIA_PROMPTS.md` — Detailed 20-track and 4-stem Lyria generation specification.

---

## Development & Verification

```bash
# Install dependencies
npm install

# Run development server (http://localhost:3000)
npm run dev

# Run core engine & audio unit tests (13 tests)
npx --yes tsx --test src/game/engine.test.ts

# Type-check
npm run lint

# Production build
npm run build
```


