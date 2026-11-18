# Iluminado

A pastel architectural rhythm-puzzle game built around beat-locked timeline-sweep mechanics, **30 illustrated worlds**, **30 synthesized & multi-stem soundtracks**, and dynamic **Board Shift** mutations.

## Gameplay

- **Block Dropping & Independent Settling**: Rotate (`ArrowUp` / `W` / `Space` / `X` CW, `Z` CCW) with 1-column wall kicks, move horizontally (`ArrowLeft` / `ArrowRight` / `A` / `D`), or slam (`ArrowDown` / `S` / `C` / `Shift`). Overhanging blocks split vertically and settle column-by-column.
- **2×2 Squares & Chain Blocks**: Form monochromatic `2×2` (and overlapping) clusters to mark clears; Chain Blocks flood-fill orthogonally connected same-color blocks (`+20 pts/cell`).
- **Audio-Synced Timeline Sweep**: A vertical sweep needle crosses every column every 2 bars locked to the active world's Web Audio playback clock. Sweeping `4+` squares builds `4×` → `16×` consecutive combos, `+1,000` Single-Color bonuses, and `+10,000` All-Deleted bonuses.
- **3-Level World Progression**: Every **3 levels** transitions to a new illustrated world, palette, and soundtrack (`48–66` squares per world).
- **Board Shifts (24 Customizable Mutations)**: Each level-up triggers one enabled transformation—ranging from `90°` board rotations and edge bastions to periodic one-turn brick/color shifts (`2×1` dominoes, `1×3` trios, `3×2` slabs, Tetrominoes, `3-Color Spectrum`, and `Obsidian Blocked` bricks that shatter beside adjacent clears) plus dramatic row/column swaps.

## Game Modes

- **Challenge** (`Basic` / `Endless` / `Shuffle` / `Zen Flow`): Journey across all 30 worlds, escalate tempo during World 30 Encore sweeps, or play continuously in no-loss Zen Flow.
- **Daily Challenge**: Deterministic daily courtyard seed and objective with streak tracking.
- **Time Attack** (`60s` / `180s` / `300s`): Timed score race with live Personal Best split pace tracking.
- **Puzzle & Mission**: Six silhouette formation puzzles and six tactical clearing trials.
- **VS CPU & 2P Battle**: Twin-board duels with counter-playable incoming garbage warning meters.

## Controls

- **Single Player / VS CPU**: `A` / `D` or `Left` / `Right` Move · `W` / `Up` / `Space` / `X` Rotate CW · `Z` Rotate CCW · `Down` / `S` / `C` / `Shift` Slam · `P` / `Esc` Pause · `M` Mute · `R` Restart
- **2P Battle**: P1 `A` / `D` Move, `W` / `Q` Rotate, `S` / `L-Shift` Slam · P2 `Left` / `Right` Move, `Up` Rotate, `Down` / `R-Shift` Slam

## Development

```bash
npm install
npm run dev                               # http://localhost:3000
npx --yes tsx --test src/game/engine.test.ts
npm run lint
npm run build
```
